import { Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { redisHelpers } from '../lib/redis.js';
import { publishEvent, events } from '../lib/events.js';
import { buildAgentContext, generateAgentResponse } from '../lib/openrouter.js';
import { checkSufficientCredits, deductCredits } from '../lib/credits.js';
import { orchestrationQueue, OrchestrationJob } from '../index.js';

interface ConversationWithParticipants {
  id: string;
  userId: string;
  mode: string;
  status: string;
  totalRounds: number | null;
  currentRound: number;
  totalCostCents: number;
  initialPrompt: string | null;
  participants: Array<{
    id: string;
    agentId: string;
    turnOrder: number;
    agent: {
      id: string;
      name: string;
      model: string;
      role: string;
      systemPrompt: string | null;
    };
  }>;
  messages: Array<{
    id: string;
    agentId: string | null;
    userId: string | null;
    content: string;
    role: string;
  }>;
}

export async function handleStartConversation(data: {
  conversationId: string;
  initialPrompt: string;
}): Promise<void> {
  const { conversationId, initialPrompt } = data;

  // Idempotency check: if messages already exist, this is a retry — skip
  const existingMessages = await prisma.message.count({
    where: { conversationId },
  });

  if (existingMessages > 0) {
    console.log(`[Start] Conversation ${conversationId} already has messages, skipping duplicate start`);
    return;
  }

  // Create the initial prompt as a system message
  if (initialPrompt) {
    await prisma.message.create({
      data: {
        conversationId,
        content: initialPrompt,
        role: 'system',
        roundNumber: 1,
        messageType: 'standard',
      },
    });
  }

  // Queue the first turn
  await orchestrationQueue.add('next_turn', {
    type: 'next_turn',
    conversationId,
  });
}

export async function handleNextTurn(data: { conversationId: string }): Promise<void> {
  const { conversationId } = data;

  // Acquire lock to prevent race conditions
  const locked = await redisHelpers.acquireLock(`conversation:${conversationId}`, 120);

  if (!locked) {
    console.log(`Conversation ${conversationId} is locked, skipping turn`);
    return;
  }

  try {
    // Get conversation with participants and messages
    const conversation = (await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { agent: true },
          orderBy: { turnOrder: 'asc' },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })) as ConversationWithParticipants | null;

    if (!conversation) {
      console.error(`Conversation ${conversationId} not found`);
      return;
    }

    // Check if conversation is still active
    if (conversation.status !== 'active') {
      console.log(`Conversation ${conversationId} is not active, skipping turn`);
      return;
    }

    // Check if debate is complete (for debate mode)
    if (
      conversation.mode === 'debate' &&
      conversation.totalRounds &&
      conversation.currentRound > conversation.totalRounds
    ) {
      await completeConversation(conversation);
      return;
    }

    // Determine which agent's turn it is
    const agentMessages = conversation.messages.filter((m) => m.role === 'agent');
    const currentAgentIndex = agentMessages.length % conversation.participants.length;
    const participant = conversation.participants[currentAgentIndex];
    const agent = participant.agent;

    // Check credits before generating
    const hasFunds = await checkSufficientCredits(conversation.userId);
    if (!hasFunds) {
      await publishEvent(
        conversationId,
        events.error('INSUFFICIENT_CREDITS', 'Not enough credits to continue')
      );
      await pauseConversation(conversationId);
      return;
    }

    // Publish turn change event
    await publishEvent(
      conversationId,
      events.turnChange(agent.id, agent.name, conversation.currentRound)
    );

    // Update session state
    await redisHelpers.setSessionState(conversationId, {
      status: 'generating',
      currentAgentId: agent.id,
    });

    // Build context for this agent
    const context = buildAgentContext(agent, conversation.messages, conversation.participants);

    // Create message record (will be updated with content)
    const message = await prisma.message.create({
      data: {
        conversationId,
        agentId: agent.id,
        content: '',
        role: 'agent',
        roundNumber: conversation.currentRound,
        modelUsed: agent.model,
      },
    });

    // Generate and stream response
    const result = await generateAgentResponse(conversationId, agent, context, message.id);

    // Update message with final content and costs
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

    // Deduct credits
    await deductCredits(conversation.userId, result.costCents, message.id);

    // Update conversation totals and round tracking
    const newAgentIndex = (currentAgentIndex + 1) % conversation.participants.length;
    const roundComplete = newAgentIndex === 0;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        totalCostCents: { increment: result.costCents },
        currentRound: roundComplete ? { increment: 1 } : undefined,
      },
    });

    if (roundComplete) {
      await publishEvent(conversationId, events.roundComplete(conversation.currentRound));
    }

    // Update session state
    await redisHelpers.setSessionState(conversationId, {
      status: 'active',
      currentAgentId: null,
      currentRound: roundComplete ? conversation.currentRound + 1 : conversation.currentRound,
    });

    // Check for pending interjection
    const sessionState = await redisHelpers.getSessionState(conversationId);
    if (sessionState?.pendingInterjection) {
      await orchestrationQueue.add('process_interjection', {
        type: 'process_interjection',
        conversationId,
        content: sessionState.pendingInterjection,
      });
      await redisHelpers.setSessionState(conversationId, {
        pendingInterjection: null,
      });
    } else if (roundComplete) {
      // Round is complete — check if debate finished, otherwise wait for user input
      const updatedConversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { status: true, mode: true, totalRounds: true, currentRound: true },
      });

      if (
        updatedConversation?.mode === 'debate' &&
        updatedConversation.totalRounds &&
        updatedConversation.currentRound > updatedConversation.totalRounds
      ) {
        // Debate complete
        const fullConversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, userId: true, totalCostCents: true },
        });
        if (fullConversation) {
          await completeConversation(fullConversation as any);
        }
      } else {
        // Notify client we're waiting for user input before next round
        await publishEvent(
          conversationId,
          events.waitingForInput(conversation.currentRound)
        );
      }
    } else {
      // Mid-round — continue to next agent in this round
      const updatedConversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { status: true },
      });

      if (updatedConversation?.status === 'active') {
        await orchestrationQueue.add(
          'next_turn',
          { type: 'next_turn', conversationId },
          { delay: 500 }
        );
      }
    }
  } finally {
    await redisHelpers.releaseLock(`conversation:${conversationId}`);
  }
}

export async function handleProcessInterjection(data: {
  conversationId: string;
  content: string;
}): Promise<void> {
  // The interjection message was already created in the API route
  // Just continue the conversation
  await orchestrationQueue.add('next_turn', {
    type: 'next_turn',
    conversationId: data.conversationId,
  });
}

export async function handleResumeConversation(data: {
  conversationId: string;
}): Promise<void> {
  // Simply queue the next turn
  await orchestrationQueue.add('next_turn', {
    type: 'next_turn',
    conversationId: data.conversationId,
  });
}

async function completeConversation(conversation: {
  id: string;
  userId: string;
  totalCostCents: number;
}): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'completed' },
  });

  await redisHelpers.setSessionState(conversation.id, {
    status: 'completed',
  });

  await publishEvent(
    conversation.id,
    events.conversationComplete(conversation.totalCostCents)
  );
}

async function pauseConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'paused' },
  });

  await redisHelpers.setSessionState(conversationId, {
    status: 'paused',
  });
}
