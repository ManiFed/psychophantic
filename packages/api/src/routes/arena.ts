import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { queueHelpers } from '../lib/queue.js';
import { redis } from '../lib/redis.js';
import {
  ARENA_MAX_PARTICIPANTS,
  ARENA_MIN_PARTICIPANTS,
  ARENA_DEFAULT_ROUNDS,
  ARENA_MAX_ROUNDS,
} from '../shared/index.js';

const createArenaSchema = z.object({
  title: z.string().min(1).max(100),
  topic: z.string().min(1).max(1000),
  maxParticipants: z.number().int().min(ARENA_MIN_PARTICIPANTS).max(ARENA_MAX_PARTICIPANTS).default(2),
  totalRounds: z.number().int().min(1).max(ARENA_MAX_ROUNDS).default(ARENA_DEFAULT_ROUNDS),
});

const joinArenaSchema = z.object({
  agentId: z.string().uuid(),
});

const instructSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function arenaRoutes(server: FastifyInstance) {
  // List open arena rooms
  server.get('/', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const rooms = await prisma.arenaRoom.findMany({
      where: {
        status: { in: ['waiting', 'active'] },
      },
      include: {
        createdBy: { select: { id: true, email: true, username: true } },
        participants: {
          include: {
            user: { select: { id: true, email: true, username: true } },
            agent: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, model: true, role: true } },
          },
        },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { rooms };
  });

  // Get single arena room
  server.get('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const room = await prisma.arenaRoom.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, username: true } },
        participants: {
          include: {
            user: { select: { id: true, email: true, username: true } },
            agent: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, model: true, role: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
        conversation: {
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            participants: {
              include: { agent: true },
              orderBy: { turnOrder: 'asc' },
            },
          },
        },
        instructions: {
          where: { userId: request.user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Arena room not found' });
    }

    return { room };
  });

  // Create arena room
  server.post('/', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createArenaSchema.parse(request.body);

      const room = await prisma.arenaRoom.create({
        data: {
          title: body.title,
          topic: body.topic,
          maxParticipants: body.maxParticipants,
          totalRounds: body.totalRounds,
          createdById: request.user.id,
        },
        include: {
          createdBy: { select: { id: true, email: true, username: true } },
          participants: true,
        },
      });

      return { room };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: err.errors });
      }
      console.error('Error creating arena room:', err);
      return reply.status(500).send({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  });

  // Join arena room with an agent
  server.post('/:id/join', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = joinArenaSchema.parse(request.body);

      const room = await prisma.arenaRoom.findUnique({
        where: { id },
        include: { _count: { select: { participants: true } } },
      });

      if (!room) {
        return reply.status(404).send({ error: 'Arena room not found' });
      }

      if (room.status !== 'waiting') {
        return reply.status(400).send({ error: 'This arena has already started or ended' });
      }

      if (room._count.participants >= room.maxParticipants) {
        return reply.status(400).send({ error: 'Arena room is full' });
      }

      // Verify the agent belongs to the user
      const agent = await prisma.agent.findFirst({
        where: { id: body.agentId, userId: request.user.id },
      });

      if (!agent) {
        return reply.status(400).send({ error: 'Agent not found or does not belong to you' });
      }

      // Check if user already joined
      const existing = await prisma.arenaParticipant.findUnique({
        where: { arenaRoomId_userId: { arenaRoomId: id, userId: request.user.id } },
      });

      if (existing) {
        return reply.status(400).send({ error: 'You have already joined this arena' });
      }

      const participant = await prisma.arenaParticipant.create({
        data: {
          arenaRoomId: id,
          userId: request.user.id,
          agentId: body.agentId,
        },
        include: {
          user: { select: { id: true, email: true, username: true } },
          agent: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, model: true, role: true } },
        },
      });

      // Publish join event via Redis for real-time updates
      if (redis) {
        await redis.publish(`arena:${id}`, JSON.stringify({
          type: 'arena:participant_joined',
          data: { participant },
          timestamp: new Date().toISOString(),
        }));
      }

      return { participant };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: err.errors });
      }
      console.error('Error joining arena:', err);
      return reply.status(500).send({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  });

  // Leave arena room
  server.post('/:id/leave', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const room = await prisma.arenaRoom.findUnique({ where: { id } });
    if (!room || room.status !== 'waiting') {
      return reply.status(400).send({ error: 'Cannot leave this arena' });
    }

    await prisma.arenaParticipant.deleteMany({
      where: { arenaRoomId: id, userId: request.user.id },
    });

    return { success: true };
  });

  // Toggle ready status
  server.post('/:id/ready', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const participant = await prisma.arenaParticipant.findUnique({
      where: { arenaRoomId_userId: { arenaRoomId: id, userId: request.user.id } },
    });

    if (!participant) {
      return reply.status(400).send({ error: 'You are not in this arena' });
    }

    const updated = await prisma.arenaParticipant.update({
      where: { id: participant.id },
      data: { isReady: !participant.isReady },
      include: {
        user: { select: { id: true, email: true, username: true } },
        agent: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      },
    });

    if (redis) {
      await redis.publish(`arena:${id}`, JSON.stringify({
        type: 'arena:participant_ready',
        data: { participantId: updated.id, userId: updated.userId, isReady: updated.isReady },
        timestamp: new Date().toISOString(),
      }));
    }

    // If arena is active and all participants are now ready, resume the conversation
    // for the next round (the orchestration auto-pauses between rounds)
    if (updated.isReady) {
      const room = await prisma.arenaRoom.findUnique({
        where: { id },
        include: { participants: true },
      });

      if (room && room.status === 'active' && room.conversationId) {
        const allReady = room.participants.every((p) =>
          p.id === updated.id ? true : p.isReady
        );

        if (allReady) {
          // Reset all ready flags for next round
          await prisma.arenaParticipant.updateMany({
            where: { arenaRoomId: id },
            data: { isReady: false },
          });

          // Resume the paused conversation
          await prisma.conversation.update({
            where: { id: room.conversationId },
            data: { status: 'active' },
          });

          // Queue the next turn
          await queueHelpers.resumeConversation(room.conversationId);

          // Notify participants that the round is resuming
          if (redis) {
            await redis.publish(`arena:${id}`, JSON.stringify({
              type: 'arena:round_resuming',
              data: {},
              timestamp: new Date().toISOString(),
            }));
          }
        }
      }
    }

    return { participant: updated };
  });

  // Start the arena (creator only, when enough participants are ready)
  server.post('/:id/start', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const room = await prisma.arenaRoom.findUnique({
      where: { id },
      include: {
        participants: {
          include: { agent: true },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Arena room not found' });
    }

    if (room.createdById !== request.user.id) {
      return reply.status(403).send({ error: 'Only the arena creator can start it' });
    }

    if (room.status !== 'waiting') {
      return reply.status(400).send({ error: 'Arena is not in waiting state' });
    }

    if (room.participants.length < ARENA_MIN_PARTICIPANTS) {
      return reply.status(400).send({ error: `Need at least ${ARENA_MIN_PARTICIPANTS} participants to start` });
    }

    const allReady = room.participants.every((p) => p.isReady);
    if (!allReady) {
      return reply.status(400).send({ error: 'All participants must be ready' });
    }

    // Create a conversation for this arena
    const conversation = await prisma.conversation.create({
      data: {
        userId: request.user.id, // Creator pays for the arena
        title: `Arena: ${room.title}`,
        mode: 'debate',
        status: 'active',
        totalRounds: room.totalRounds,
        initialPrompt: room.topic,
        participants: {
          create: room.participants.map((p, index) => ({
            agentId: p.agentId,
            turnOrder: index,
          })),
        },
      },
    });

    // Link the conversation to the arena room and mark as active
    await prisma.arenaRoom.update({
      where: { id },
      data: {
        status: 'active',
        conversationId: conversation.id,
      },
    });

    // Queue the conversation start
    await queueHelpers.startConversation(conversation.id, room.topic);

    // Notify all participants
    if (redis) {
      await redis.publish(`arena:${id}`, JSON.stringify({
        type: 'arena:started',
        data: { conversationId: conversation.id },
        timestamp: new Date().toISOString(),
      }));
    }

    return { conversationId: conversation.id };
  });

  // Send instruction to your agent during a live arena debate
  server.post('/:id/instruct', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = instructSchema.parse(request.body);

      const room = await prisma.arenaRoom.findUnique({
        where: { id },
        include: {
          participants: true,
          conversation: { select: { id: true, status: true, currentRound: true } },
        },
      });

      if (!room) {
        return reply.status(404).send({ error: 'Arena room not found' });
      }

      if (room.status !== 'active' || !room.conversation) {
        return reply.status(400).send({ error: 'Arena is not active' });
      }

      const participant = room.participants.find((p) => p.userId === request.user.id);
      if (!participant) {
        return reply.status(403).send({ error: 'You are not a participant in this arena' });
      }

      const instruction = await prisma.arenaInstruction.create({
        data: {
          arenaRoomId: id,
          userId: request.user.id,
          agentId: participant.agentId,
          content: body.content,
          roundNumber: room.conversation.currentRound,
        },
      });

      // Notify via Redis so the stream can show it
      if (redis) {
        await redis.publish(`arena:${id}`, JSON.stringify({
          type: 'arena:instruction',
          data: {
            userId: request.user.id,
            agentId: participant.agentId,
            content: body.content,
          },
          timestamp: new Date().toISOString(),
        }));
      }

      return { instruction, confirmed: true };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation error', details: err.errors });
      }
      console.error('Error sending arena instruction:', err);
      return reply.status(500).send({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  });

  // SSE stream for arena events (lobby updates + conversation stream)
  server.get('/:id/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.status(401).send({ error: 'Token required' });
    }

    let userId: string;
    try {
      const decoded = server.jwt.verify<{ id: string }>(token);
      userId = decoded.id;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const room = await prisma.arenaRoom.findUnique({
      where: { id },
      select: { id: true, conversationId: true },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Arena room not found' });
    }

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write('data: {"type":"connected"}\n\n');

    // Heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(':heartbeat\n\n');
    }, 15000);

    if (redis) {
      // Subscribe to arena-specific events
      const subscriber = redis.duplicate();
      await subscriber.subscribe(`arena:${id}`);

      // Also subscribe to conversation events if arena is active
      if (room.conversationId) {
        await subscriber.subscribe(`conversation:${room.conversationId}`);
        await subscriber.subscribe(`user:${userId}:credits`);
      }

      subscriber.on('message', (channel: string, message: string) => {
        try {
          reply.raw.write(`data: ${message}\n\n`);
        } catch {
          // Connection closed
        }
      });

      // Handle dynamic subscription when arena starts
      const arenaStartHandler = async (channel: string, message: string) => {
        if (channel === `arena:${id}`) {
          try {
            const event = JSON.parse(message);
            if (event.type === 'arena:started' && event.data?.conversationId) {
              await subscriber.subscribe(`conversation:${event.data.conversationId}`);
              await subscriber.subscribe(`user:${userId}:credits`);
            }
          } catch {
            // Ignore parse errors
          }
        }
      };
      subscriber.on('message', arenaStartHandler);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe().catch(() => {});
        subscriber.quit().catch(() => {});
      });
    } else {
      // No Redis - just heartbeat
      request.raw.on('close', () => {
        clearInterval(heartbeat);
      });
    }

    // Prevent Fastify from sending a response
    reply.hijack();
  });

  // Close arena room early (any participant or creator)
  server.post('/:id/close', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const room = await prisma.arenaRoom.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Arena room not found' });
    }

    const isParticipant = room.participants.some((p) => p.userId === request.user.id);
    if (!isParticipant && room.createdById !== request.user.id) {
      return reply.status(403).send({ error: 'Only participants or the creator can close this arena' });
    }

    if (room.status !== 'active') {
      return reply.status(400).send({ error: 'Arena is not active' });
    }

    // Complete the conversation
    if (room.conversationId) {
      await prisma.conversation.update({
        where: { id: room.conversationId },
        data: { status: 'completed' },
      });
    }

    await prisma.arenaRoom.update({
      where: { id },
      data: { status: 'completed' },
    });

    // Notify all participants
    if (redis) {
      await redis.publish(`arena:${id}`, JSON.stringify({
        type: 'conversation:complete',
        data: { totalCostCents: 0 },
        timestamp: new Date().toISOString(),
      }));
    }

    return { success: true };
  });

  // Delete/cancel arena room (creator only)
  server.delete('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const room = await prisma.arenaRoom.findUnique({ where: { id } });
    if (!room) {
      return reply.status(404).send({ error: 'Arena room not found' });
    }

    if (room.createdById !== request.user.id) {
      return reply.status(403).send({ error: 'Only the creator can delete this arena' });
    }

    if (room.status === 'active') {
      // Cancel active arena - also complete the conversation
      if (room.conversationId) {
        await prisma.conversation.update({
          where: { id: room.conversationId },
          data: { status: 'completed' },
        });
      }
      await prisma.arenaRoom.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      return { success: true, cancelled: true };
    }

    await prisma.arenaRoom.delete({ where: { id } });
    return { success: true };
  });
}
