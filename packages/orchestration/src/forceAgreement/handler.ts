import { prisma } from '../lib/prisma.js';
import { redisHelpers } from '../lib/redis.js';
import { publishEvent, events } from '../lib/events.js';
import {
  buildAgentContext,
  generateAgentResponse,
  generateCompletion,
} from '../lib/openrouter.js';
import { deductCredits } from '../lib/credits.js';
import { orchestrationQueue } from '../index.js';
import {
  ForceAgreementPhase,
  FORCE_AGREEMENT_MAX_ITERATIONS,
} from '../shared/index.js';

interface ForceAgreementState {
  phase: ForceAgreementPhase;
  iteration: number;
  maxIterations: number;
  nonNegotiables: Record<string, string[]>;
  currentSynthesis: string | null;
  votes: Record<string, 'approve' | 'reject' | null>;
  rejectionReasons: Record<string, string>;
  history: Array<{
    iteration: number;
    synthesis: string;
    votes: Record<string, 'approve' | 'reject'>;
    rejectionReasons: Record<string, string>;
  }>;
}

interface Agent {
  id: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string | null;
}

interface Participant {
  id: string;
  agentId: string;
  agent: Agent;
}

const PHASE_LABELS: Record<ForceAgreementPhase, string> = {
  [ForceAgreementPhase.IDLE]: 'Idle',
  [ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES]: 'Collecting Non-Negotiables',
  [ForceAgreementPhase.SYNTHESIZING]: 'Synthesizing Agreement',
  [ForceAgreementPhase.VOTING]: 'Voting',
  [ForceAgreementPhase.REVISING]: 'Revising Agreement',
  [ForceAgreementPhase.COMPLETED]: 'Agreement Reached',
  [ForceAgreementPhase.FORCED_RESOLUTION]: 'Forced Resolution',
};

export async function handleForceAgreementPhase(data: {
  conversationId: string;
  phase: number;
}): Promise<void> {
  const { conversationId, phase } = data;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { agent: true },
        orderBy: { turnOrder: 'asc' },
      },
    },
  });

  if (!conversation) {
    console.error(`Conversation ${conversationId} not found`);
    return;
  }

  const state = conversation.forceAgreementState as unknown as ForceAgreementState;

  switch (phase) {
    case ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES:
      await collectNonNegotiables(conversation, state);
      break;
    case ForceAgreementPhase.SYNTHESIZING:
      await synthesizeAgreement(conversation, state);
      break;
    case ForceAgreementPhase.VOTING:
      await collectVotes(conversation, state);
      break;
    case ForceAgreementPhase.REVISING:
      await reviseSynthesis(conversation, state);
      break;
    case ForceAgreementPhase.FORCED_RESOLUTION:
      await forceResolution(conversation, state);
      break;
  }
}

async function collectNonNegotiables(
  conversation: any,
  state: ForceAgreementState
): Promise<void> {
  const nonNegotiables: Record<string, string[]> = {};

  await publishEvent(
    conversation.id,
    events.forceAgreementPhase(
      ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES,
      PHASE_LABELS[ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES],
      'Each agent is stating their 3-5 non-negotiable requirements'
    )
  );

  for (const participant of conversation.participants) {
    const agent = participant.agent;

    const prompt = buildNonNegotiablesPrompt(agent);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        agentId: agent.id,
        content: '',
        role: 'agent',
        messageType: 'non_negotiables',
      },
    });

    const context = [
      { role: 'system' as const, content: prompt },
      {
        role: 'user' as const,
        content:
          'Please state your 3-5 non-negotiable requirements for reaching an agreement with the group.',
      },
    ];

    const result = await generateAgentResponse(
      conversation.id,
      agent,
      context,
      message.id
    );

    // Parse the response for bullet points
    const items = parseNonNegotiables(result.content);
    nonNegotiables[agent.id] = items;

    // Update participant record
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { nonNegotiables: items },
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents: result.costCents,
        generationTimeMs: result.generationTimeMs,
      },
    });

    await deductCredits(conversation.userId, result.costCents, message.id);
  }

  // Update state and transition
  const newState: ForceAgreementState = {
    ...state,
    phase: ForceAgreementPhase.SYNTHESIZING,
    nonNegotiables,
  };

  await updateForceAgreementState(conversation.id, newState);

  // Queue next phase
  await orchestrationQueue.add('force_agreement_phase', {
    type: 'force_agreement_phase',
    conversationId: conversation.id,
    phase: ForceAgreementPhase.SYNTHESIZING,
  });
}

async function synthesizeAgreement(
  conversation: any,
  state: ForceAgreementState
): Promise<void> {
  await publishEvent(
    conversation.id,
    events.forceAgreementPhase(
      ForceAgreementPhase.SYNTHESIZING,
      PHASE_LABELS[ForceAgreementPhase.SYNTHESIZING],
      'Creating a unified plan that addresses all non-negotiables',
      { nonNegotiables: state.nonNegotiables }
    )
  );

  const prompt = buildSynthesisPrompt(
    state.nonNegotiables,
    conversation.participants,
    state.history
  );

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      content: '',
      role: 'synthesizer',
      messageType: 'synthesis',
    },
  });

  // Use a neutral model for synthesis
  const result = await generateCompletion('anthropic/claude-3.5-sonnet', prompt);

  await prisma.message.update({
    where: { id: message.id },
    data: {
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costCents: result.costCents,
    },
  });

  await deductCredits(conversation.userId, result.costCents, message.id);

  // Update state
  const newState: ForceAgreementState = {
    ...state,
    phase: ForceAgreementPhase.VOTING,
    currentSynthesis: result.content,
    votes: {},
    rejectionReasons: {},
  };

  await updateForceAgreementState(conversation.id, newState);

  await publishEvent(
    conversation.id,
    events.forceAgreementPhase(
      ForceAgreementPhase.VOTING,
      PHASE_LABELS[ForceAgreementPhase.VOTING],
      'Agents are reviewing and voting on the proposed agreement',
      { synthesis: result.content }
    )
  );

  // Queue voting phase
  await orchestrationQueue.add('force_agreement_phase', {
    type: 'force_agreement_phase',
    conversationId: conversation.id,
    phase: ForceAgreementPhase.VOTING,
  });
}

async function collectVotes(
  conversation: any,
  state: ForceAgreementState
): Promise<void> {
  const votes: Record<string, 'approve' | 'reject'> = {};
  const rejectionReasons: Record<string, string> = {};

  for (const participant of conversation.participants) {
    const agent = participant.agent;
    const myNonNegotiables = state.nonNegotiables[agent.id] || [];

    const prompt = buildVotePrompt(agent, state.currentSynthesis!, myNonNegotiables);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        agentId: agent.id,
        content: '',
        role: 'agent',
        messageType: 'vote',
      },
    });

    const context = [
      { role: 'system' as const, content: prompt.system },
      { role: 'user' as const, content: prompt.user },
    ];

    const result = await generateAgentResponse(
      conversation.id,
      agent,
      context,
      message.id
    );

    // Parse vote from response
    const { vote, reason } = parseVote(result.content);
    votes[agent.id] = vote;

    if (vote === 'reject') {
      rejectionReasons[agent.id] = reason;
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { currentVote: vote },
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents: result.costCents,
        generationTimeMs: result.generationTimeMs,
      },
    });

    await deductCredits(conversation.userId, result.costCents, message.id);
  }

  // Check if unanimous
  const allApproved = Object.values(votes).every((v) => v === 'approve');

  if (allApproved) {
    // Success!
    const newState: ForceAgreementState = {
      ...state,
      phase: ForceAgreementPhase.COMPLETED,
      votes,
    };

    await updateForceAgreementState(conversation.id, newState);

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'completed' },
    });

    await publishEvent(
      conversation.id,
      events.forceAgreementPhase(
        ForceAgreementPhase.COMPLETED,
        PHASE_LABELS[ForceAgreementPhase.COMPLETED],
        'All agents have approved the unified plan!',
        { finalAgreement: state.currentSynthesis }
      )
    );
  } else {
    // Need revision or forced resolution
    const newIteration = state.iteration + 1;

    if (newIteration >= state.maxIterations) {
      // Max iterations reached - force resolution
      const newState: ForceAgreementState = {
        ...state,
        phase: ForceAgreementPhase.FORCED_RESOLUTION,
        votes,
        rejectionReasons,
        history: [
          ...state.history,
          {
            iteration: state.iteration,
            synthesis: state.currentSynthesis!,
            votes,
            rejectionReasons,
          },
        ],
      };

      await updateForceAgreementState(conversation.id, newState);

      await publishEvent(
        conversation.id,
        events.forceAgreementPhase(
          ForceAgreementPhase.FORCED_RESOLUTION,
          PHASE_LABELS[ForceAgreementPhase.FORCED_RESOLUTION],
          `Could not reach unanimous agreement after ${state.maxIterations} attempts. Generating best-effort resolution.`,
          { finalVotes: votes, rejectionReasons }
        )
      );

      // Queue forced resolution
      await orchestrationQueue.add('force_agreement_phase', {
        type: 'force_agreement_phase',
        conversationId: conversation.id,
        phase: ForceAgreementPhase.FORCED_RESOLUTION,
      });
    } else {
      // Continue to revision
      const newState: ForceAgreementState = {
        ...state,
        phase: ForceAgreementPhase.REVISING,
        iteration: newIteration,
        votes,
        rejectionReasons,
        history: [
          ...state.history,
          {
            iteration: state.iteration,
            synthesis: state.currentSynthesis!,
            votes,
            rejectionReasons,
          },
        ],
      };

      await updateForceAgreementState(conversation.id, newState);

      await publishEvent(
        conversation.id,
        events.forceAgreementPhase(
          ForceAgreementPhase.REVISING,
          PHASE_LABELS[ForceAgreementPhase.REVISING],
          `Attempt ${newIteration + 1} of ${state.maxIterations}`,
          { rejectionReasons, iteration: newIteration }
        )
      );

      // Queue revision phase
      await orchestrationQueue.add('force_agreement_phase', {
        type: 'force_agreement_phase',
        conversationId: conversation.id,
        phase: ForceAgreementPhase.REVISING,
      });
    }
  }
}

async function reviseSynthesis(
  conversation: any,
  state: ForceAgreementState
): Promise<void> {
  const prompt = buildRevisionPrompt(
    state.currentSynthesis!,
    state.rejectionReasons,
    state.nonNegotiables,
    conversation.participants
  );

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      content: '',
      role: 'synthesizer',
      messageType: 'revision',
    },
  });

  const result = await generateCompletion('anthropic/claude-3.5-sonnet', prompt);

  await prisma.message.update({
    where: { id: message.id },
    data: {
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costCents: result.costCents,
    },
  });

  await deductCredits(conversation.userId, result.costCents, message.id);

  // Update state and go back to voting
  const newState: ForceAgreementState = {
    ...state,
    phase: ForceAgreementPhase.VOTING,
    currentSynthesis: result.content,
    votes: {},
    rejectionReasons: {},
  };

  await updateForceAgreementState(conversation.id, newState);

  await publishEvent(
    conversation.id,
    events.forceAgreementPhase(
      ForceAgreementPhase.VOTING,
      PHASE_LABELS[ForceAgreementPhase.VOTING],
      `Revised agreement (attempt ${state.iteration + 1})`,
      { synthesis: result.content }
    )
  );

  // Queue voting phase
  await orchestrationQueue.add('force_agreement_phase', {
    type: 'force_agreement_phase',
    conversationId: conversation.id,
    phase: ForceAgreementPhase.VOTING,
  });
}

async function forceResolution(
  conversation: any,
  state: ForceAgreementState
): Promise<void> {
  // Generate a forced resolution that acknowledges unmet requirements
  const prompt = buildForcedResolutionPrompt(
    state.currentSynthesis!,
    state.rejectionReasons,
    state.nonNegotiables,
    conversation.participants,
    state.history
  );

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      content: '',
      role: 'synthesizer',
      messageType: 'forced_resolution',
    },
  });

  const result = await generateCompletion('anthropic/claude-3.5-sonnet', prompt);

  await prisma.message.update({
    where: { id: message.id },
    data: {
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costCents: result.costCents,
    },
  });

  await deductCredits(conversation.userId, result.costCents, message.id);

  // Mark as completed
  const newState: ForceAgreementState = {
    ...state,
    phase: ForceAgreementPhase.FORCED_RESOLUTION,
    currentSynthesis: result.content,
  };

  await updateForceAgreementState(conversation.id, newState);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'completed' },
  });

  await publishEvent(
    conversation.id,
    events.forceAgreementPhase(
      ForceAgreementPhase.FORCED_RESOLUTION,
      'Best-Effort Resolution',
      'A compromise solution has been generated with acknowledged tradeoffs.',
      { finalAgreement: result.content, unresolvedObjections: state.rejectionReasons }
    )
  );
}

// Helper functions

async function updateForceAgreementState(
  conversationId: string,
  state: ForceAgreementState
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { forceAgreementState: JSON.parse(JSON.stringify(state)) },
  });

  await redisHelpers.setSessionState(conversationId, {
    forceAgreementPhase: state.phase,
  });
}

function buildNonNegotiablesPrompt(agent: Agent): string {
  return `${agent.systemPrompt || ''}

You are ${agent.name}. Your role: ${agent.role}

The group is initiating a Force Agreement process. You must state your 3-5 absolute non-negotiable requirements for any agreement.

Format your response as a numbered list:
1. [First non-negotiable]
2. [Second non-negotiable]
...

Be specific and concrete. These are your hard boundaries that any agreement MUST satisfy.`;
}

function buildSynthesisPrompt(
  nonNegotiables: Record<string, string[]>,
  participants: Participant[],
  history: ForceAgreementState['history']
): Array<{ role: 'system' | 'user'; content: string }> {
  const agentRequirements = participants
    .map((p) => {
      const items = nonNegotiables[p.agentId] || [];
      return `**${p.agent.name}** (${p.agent.role}):\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`;
    })
    .join('\n\n');

  const historyContext =
    history.length > 0
      ? `\n\nPrevious attempts:\n${history
          .map((h) => {
            const rejecters = Object.entries(h.votes)
              .filter(([_, v]) => v === 'reject')
              .map(([id]) => {
                const p = participants.find((p) => p.agentId === id);
                return p?.agent.name || 'Unknown';
              })
              .join(', ');
            return `Attempt ${h.iteration + 1}: Rejected by ${rejecters}`;
          })
          .join('\n')}`
      : '';

  return [
    {
      role: 'system',
      content: `You are a neutral facilitator synthesizing a unified agreement.

Your goal: Create a comprehensive plan that satisfies ALL non-negotiable requirements from ALL participants. The plan must be specific, actionable, and address every stated requirement.

If requirements conflict, find creative compromises that honor the spirit of each requirement.`,
    },
    {
      role: 'user',
      content: `Please create a unified agreement that satisfies these non-negotiable requirements:

${agentRequirements}
${historyContext}

Create a detailed, actionable plan that addresses every requirement.`,
    },
  ];
}

function buildVotePrompt(
  agent: Agent,
  synthesis: string,
  myNonNegotiables: string[]
): { system: string; user: string } {
  return {
    system: `${agent.systemPrompt || ''}

You are ${agent.name}. Review the proposed agreement and vote.

Your non-negotiables were:
${myNonNegotiables.map((item, i) => `${i + 1}. ${item}`).join('\n')}

You must respond in this exact format:
VOTE: APPROVE or REJECT
REASON: [If rejecting, explain which non-negotiable(s) are not satisfied and why. Be specific.]`,
    user: `Proposed Agreement:\n\n${synthesis}\n\nDoes this agreement satisfy all your non-negotiable requirements? Vote APPROVE or REJECT.`,
  };
}

function buildRevisionPrompt(
  currentSynthesis: string,
  rejectionReasons: Record<string, string>,
  nonNegotiables: Record<string, string[]>,
  participants: Participant[]
): Array<{ role: 'system' | 'user'; content: string }> {
  const rejections = Object.entries(rejectionReasons)
    .map(([agentId, reason]) => {
      const p = participants.find((p) => p.agentId === agentId);
      return `**${p?.agent.name || 'Unknown'}**: ${reason}`;
    })
    .join('\n\n');

  return [
    {
      role: 'system',
      content: `You are a neutral facilitator revising an agreement based on feedback.

Your goal: Modify the agreement to address the specific objections while still satisfying all original non-negotiables.`,
    },
    {
      role: 'user',
      content: `Previous Agreement:\n${currentSynthesis}\n\nRejections:\n${rejections}\n\nPlease revise the agreement to address these specific objections while maintaining the core elements that other participants approved.`,
    },
  ];
}

function buildForcedResolutionPrompt(
  currentSynthesis: string,
  rejectionReasons: Record<string, string>,
  nonNegotiables: Record<string, string[]>,
  participants: Participant[],
  history: ForceAgreementState['history']
): Array<{ role: 'system' | 'user'; content: string }> {
  const rejections = Object.entries(rejectionReasons)
    .map(([agentId, reason]) => {
      const p = participants.find((p) => p.agentId === agentId);
      return `**${p?.agent.name || 'Unknown'}**: ${reason}`;
    })
    .join('\n\n');

  return [
    {
      role: 'system',
      content: `You are a neutral facilitator creating a final compromise solution.

After ${history.length + 1} attempts, unanimous agreement could not be reached. Your task is to create the BEST POSSIBLE compromise that:
1. Maximizes satisfaction of non-negotiables across all parties
2. Clearly acknowledges which requirements could not be fully met
3. Explains the tradeoffs that were made and why
4. Provides a workable path forward despite disagreements`,
    },
    {
      role: 'user',
      content: `Latest Agreement Attempt:\n${currentSynthesis}\n\nRemaining Objections:\n${rejections}\n\nCreate a final compromise solution. Structure your response as:

## Final Agreement
[The compromise plan]

## Acknowledged Tradeoffs
[List what couldn't be fully satisfied and why]

## Path Forward
[How to proceed despite remaining disagreements]`,
    },
  ];
}

function parseNonNegotiables(content: string): string[] {
  const lines = content.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    // Match numbered items like "1. ", "2. ", etc.
    const match = line.match(/^\d+\.\s*(.+)$/);
    if (match && match[1].trim()) {
      items.push(match[1].trim());
    }
  }

  // Limit to 5 items
  return items.slice(0, 5);
}

function parseVote(content: string): { vote: 'approve' | 'reject'; reason: string } {
  const upperContent = content.toUpperCase();

  // Look for explicit VOTE: marker
  const voteMatch = content.match(/VOTE:\s*(APPROVE|REJECT)/i);
  const vote = voteMatch
    ? (voteMatch[1].toLowerCase() as 'approve' | 'reject')
    : upperContent.includes('APPROVE')
      ? 'approve'
      : 'reject';

  // Extract reason
  const reasonMatch = content.match(/REASON:\s*(.+)/is);
  const reason = reasonMatch ? reasonMatch[1].trim() : '';

  return { vote, reason };
}
