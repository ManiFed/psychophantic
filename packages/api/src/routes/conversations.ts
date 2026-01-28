import { FastifyInstance, FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { queueHelpers } from '../lib/queue.js';
import { redisHelpers } from '../lib/redis.js';
import {
  ConversationMode,
  MAX_AGENTS_PER_CONVERSATION,
  MIN_AGENTS_PER_CONVERSATION,
  MAX_DEBATE_ROUNDS,
  MIN_DEBATE_ROUNDS,
  ForceAgreementPhase,
  FORCE_AGREEMENT_MAX_ITERATIONS,
} from '../shared/index.js';

// Route interfaces
interface ConversationIdParams extends RouteGenericInterface {
  Params: { conversationId: string };
}

interface BranchRoute extends RouteGenericInterface {
  Params: { conversationId: string };
  Body: { fromMessageId: string };
}

interface ShareRoute extends RouteGenericInterface {
  Params: { conversationId: string };
  Body: { isPublic: boolean };
}

const createConversationSchema = z.object({
  mode: z.enum(['debate', 'collaborate']),
  agentIds: z
    .array(z.string().uuid())
    .min(MIN_AGENTS_PER_CONVERSATION)
    .max(MAX_AGENTS_PER_CONVERSATION),
  totalRounds: z.number().min(MIN_DEBATE_ROUNDS).max(MAX_DEBATE_ROUNDS).optional(),
  title: z.string().max(255).optional(),
  initialPrompt: z.string().min(1).max(5000),
});

const interjectionSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function conversationRoutes(server: FastifyInstance) {
  // List user's conversations
  server.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest) => {
      const conversations = await prisma.conversation.findMany({
        where: { userId: request.user.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          participants: {
            include: {
              agent: {
                select: { id: true, name: true, avatarColor: true },
              },
            },
          },
          _count: { select: { messages: true } },
        },
      });

      return { conversations };
    }
  );

  // Get single conversation with messages
  server.get(
    '/:conversationId',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          OR: [{ userId: request.user.id }, { isPublic: true }],
        },
        include: {
          participants: {
            include: { agent: true },
            orderBy: { turnOrder: 'asc' },
          },
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const messages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
      });

      return {
        conversation,
        messages,
        participants: conversation.participants,
      };
    }
  );

  // Create conversation
  server.post(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createConversationSchema.parse(request.body);

        // Validate round count for debate mode
        if (body.mode === 'debate' && !body.totalRounds) {
          return reply.status(400).send({
            error: 'totalRounds is required for debate mode',
          });
        }

        // Verify all agents exist and belong to user
        const agents = await prisma.agent.findMany({
          where: {
            id: { in: body.agentIds },
            userId: request.user.id,
          },
        });

        if (agents.length !== body.agentIds.length) {
          return reply.status(400).send({
            error: 'One or more agents not found',
          });
        }

        // Create conversation with participants
        const conversation = await prisma.conversation.create({
          data: {
            userId: request.user.id,
            title: body.title,
            mode: body.mode,
            totalRounds: body.mode === 'debate' ? body.totalRounds : null,
            initialPrompt: body.initialPrompt,
            participants: {
              create: body.agentIds.map((agentId, index) => ({
                agentId,
                turnOrder: index,
              })),
            },
          },
          include: {
            participants: {
              include: { agent: true },
              orderBy: { turnOrder: 'asc' },
            },
          },
        });

        return { conversation };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: err.errors,
          });
        }
        throw err;
      }
    }
  );

  // Start conversation (begins turn orchestration)
  server.post(
    '/:conversationId/start',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (conversation.status !== 'active') {
        return reply.status(400).send({
          error: 'Conversation cannot be started from current state',
        });
      }

      // Initialize session state in Redis
      await redisHelpers.setSessionState(conversation.id, {
        status: 'active',
        currentRound: 1,
      });

      // Queue the first turn
      await queueHelpers.startConversation(
        conversation.id,
        conversation.initialPrompt || ''
      );

      return { success: true };
    }
  );

  // Pause conversation
  server.post(
    '/:conversationId/pause',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (conversation.status !== 'active') {
        return reply.status(400).send({
          error: 'Can only pause active conversations',
        });
      }

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'paused' },
      });

      await redisHelpers.setSessionState(conversation.id, {
        status: 'paused',
      });

      return { success: true };
    }
  );

  // Resume conversation
  server.post(
    '/:conversationId/resume',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { conversationId: string } }>,
      reply: FastifyReply
    ) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (conversation.status !== 'paused') {
        return reply.status(400).send({
          error: 'Can only resume paused conversations',
        });
      }

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'active' },
      });

      await redisHelpers.setSessionState(conversation.id, {
        status: 'active',
      });

      // Queue resumption
      await queueHelpers.resumeConversation(conversation.id);

      return { success: true };
    }
  );

  // Add user interjection
  server.post<ConversationIdParams>(
    '/:conversationId/interject',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const body = interjectionSchema.parse(request.body);

        const conversation = await prisma.conversation.findFirst({
          where: {
            id: request.params.conversationId,
            userId: request.user.id,
          },
        });

        if (!conversation) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        if (!['active', 'paused'].includes(conversation.status)) {
          return reply.status(400).send({
            error: 'Cannot add interjection to completed conversation',
          });
        }

        // Create the message
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            userId: request.user.id,
            content: body.content,
            role: 'user',
            roundNumber: conversation.currentRound,
          },
        });

        // Get current session state to determine what to do
        const sessionState = await redisHelpers.getSessionState(conversation.id);

        if (sessionState?.status === 'generating') {
          // Currently generating, queue interjection for after current message
          await redisHelpers.setSessionState(conversation.id, {
            status: sessionState.status,
            pendingInterjection: body.content,
          });
        } else if (conversation.status === 'active') {
          // Conversation is active but not generating - trigger next turn
          await queueHelpers.nextTurn(conversation.id);
        }
        // If paused, user needs to explicitly resume

        return { message };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: err.errors,
          });
        }
        throw err;
      }
    }
  );

  // Initiate Force Agreement
  server.post<ConversationIdParams>(
    '/:conversationId/force-agreement',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (conversation.mode !== 'collaborate') {
        return reply.status(400).send({
          error: 'Force Agreement is only available in collaborate mode',
        });
      }

      if (!['active', 'paused'].includes(conversation.status)) {
        return reply.status(400).send({
          error: 'Cannot start Force Agreement on completed conversation',
        });
      }

      // Initialize Force Agreement state
      const forceAgreementState = {
        phase: ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES,
        iteration: 0,
        maxIterations: FORCE_AGREEMENT_MAX_ITERATIONS,
        nonNegotiables: {},
        currentSynthesis: null,
        votes: {},
        rejectionReasons: {},
        history: [],
      };

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'force_agreement',
          forceAgreementState,
        },
      });

      await redisHelpers.setSessionState(conversation.id, {
        status: 'force_agreement',
        forceAgreementPhase: ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES,
      });

      // Queue the first phase
      await queueHelpers.forceAgreementPhase(
        conversation.id,
        ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES
      );

      return {
        success: true,
        phase: ForceAgreementPhase.COLLECTING_NON_NEGOTIABLES,
      };
    }
  );

  // Branch conversation
  server.post<BranchRoute>(
    '/:conversationId/branch',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { fromMessageId } = request.body;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
        include: {
          participants: true,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // Find the branch point message
      const branchMessage = await prisma.message.findFirst({
        where: {
          id: fromMessageId,
          conversationId: conversation.id,
        },
      });

      if (!branchMessage) {
        return reply.status(404).send({ error: 'Branch point message not found' });
      }

      // Get all messages up to and including the branch point
      const messagesToCopy = await prisma.message.findMany({
        where: {
          conversationId: conversation.id,
          createdAt: { lte: branchMessage.createdAt },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Create the branched conversation
      const branchedConversation = await prisma.conversation.create({
        data: {
          userId: request.user.id,
          title: `${conversation.title || 'Conversation'} (Branch)`,
          mode: conversation.mode,
          totalRounds: conversation.totalRounds,
          currentRound: branchMessage.roundNumber || 1,
          initialPrompt: conversation.initialPrompt,
          parentConversationId: conversation.id,
          branchPointMessageId: fromMessageId,
          participants: {
            create: conversation.participants.map((p: { agentId: string; turnOrder: number }) => ({
              agentId: p.agentId,
              turnOrder: p.turnOrder,
            })),
          },
          messages: {
            create: messagesToCopy.map((m: { agentId: string | null; userId: string | null; content: string; role: string; roundNumber: number | null; modelUsed: string | null; inputTokens: number | null; outputTokens: number | null; generationTimeMs: number | null; messageType: string }) => ({
              agentId: m.agentId,
              userId: m.userId,
              content: m.content,
              role: m.role,
              roundNumber: m.roundNumber,
              modelUsed: m.modelUsed,
              inputTokens: m.inputTokens,
              outputTokens: m.outputTokens,
              costCents: 0, // Don't charge for copied messages
              generationTimeMs: m.generationTimeMs,
              messageType: m.messageType,
            })),
          },
        },
        include: {
          participants: {
            include: { agent: true },
          },
        },
      });

      return { conversation: branchedConversation };
    }
  );

  // Share/unshare conversation
  server.post<ShareRoute>(
    '/:conversationId/share',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { isPublic } = request.body;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: request.params.conversationId,
          userId: request.user.id,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      let publicSlug = conversation.publicSlug;

      if (isPublic && !publicSlug) {
        // Generate a unique slug
        publicSlug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          isPublic,
          publicSlug: isPublic ? publicSlug : null,
        },
      });

      return {
        isPublic: updated.isPublic,
        publicUrl: updated.isPublic
          ? `${process.env.APP_URL}/public/${updated.publicSlug}`
          : null,
        slug: updated.publicSlug,
      };
    }
  );
}
