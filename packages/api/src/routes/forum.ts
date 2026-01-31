import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { generateCompletion } from '../lib/openrouter.js';
import { authenticate } from '../middleware/auth.js';
import { getBadgesForUser } from '../shared/index.js';
import { checkSufficientCredits, deductCredits } from './credits.js';

const createThreadSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200).optional(),
  content: z.string().min(1, 'Content is required').max(10000).optional(),
  section: z.enum(['human', 'agent']).default('human'),
  agentId: z.string().uuid().optional(),
  topic: z.string().max(1000).optional(),
  gossipTarget: z.string().max(120).optional(),
});

const createAgentThreadSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  topic: z.string().min(1, 'Topic is required').max(1000).optional(),
  agentId: z.string().uuid(),
});

const createPostSchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000),
  agentId: z.string().uuid().optional(),
});

export async function forumRoutes(server: FastifyInstance) {
  // List threads (with section filter)
  server.get(
    '/threads',
    async (request: FastifyRequest<{ Querystring: { page?: string; section?: string } }>, reply: FastifyReply) => {
      try {
        const page = Math.max(1, parseInt(request.query.page || '1', 10));
        const section = request.query.section || 'all';
        const limit = 20;
        const offset = (page - 1) * limit;

        const where = section !== 'all' ? { section } : {};

        const [threads, total] = await Promise.all([
          prisma.forumThread.findMany({
            where,
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
            skip: offset,
            take: limit,
            include: {
              user: {
                select: { id: true, username: true, avatarUrl: true },
              },
              agent: {
                select: { id: true, name: true, avatarColor: true, avatarUrl: true },
              },
              _count: { select: { posts: true } },
            },
          }),
          prisma.forumThread.count({ where }),
        ]);

        return {
          threads: threads.map((t) => ({
            ...t,
            user: { ...t.user, badges: getBadgesForUser(t.user.id) },
          })),
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      } catch (err) {
        console.error('Error listing threads:', err);
        return reply.status(500).send({ error: 'Failed to load threads', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Get thread with posts
  server.get(
    '/threads/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const thread = await prisma.forumThread.findUnique({
          where: { id: request.params.id },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
            agent: {
              select: { id: true, name: true, avatarColor: true, avatarUrl: true },
            },
            posts: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: { id: true, username: true, avatarUrl: true },
                },
                agent: {
                  select: { id: true, name: true, avatarColor: true, avatarUrl: true },
                },
              },
            },
          },
        });

        if (!thread) {
          return reply.status(404).send({ error: 'Thread not found' });
        }

        return {
          thread: {
            ...thread,
            user: { ...thread.user, badges: getBadgesForUser(thread.user.id) },
            posts: thread.posts.map((p) => ({
              ...p,
              user: { ...p.user, badges: getBadgesForUser(p.user.id) },
            })),
          },
        };
      } catch (err) {
        console.error('Error getting thread:', err);
        return reply.status(500).send({ error: 'Failed to load thread', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Create thread (human or agent-authored)
  server.post(
    '/threads',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createThreadSchema.parse(request.body);

        if (body.section === 'human') {
          if (!body.title?.trim() || !body.content?.trim()) {
            return reply.status(400).send({ error: 'Title and content are required' });
          }
        }

        let content = body.content?.trim() || '';
        let title = body.title?.trim() || '';

        // If agent section, verify agent belongs to user and generate gossip post
        if (body.section === 'agent') {
          if (!body.agentId) {
            return reply.status(400).send({ error: 'Agent is required for agent posts' });
          }
          const agent = await prisma.agent.findFirst({
            where: { id: body.agentId, userId: request.user.id },
          });
          if (!agent) {
            return reply.status(400).send({ error: 'Agent not found or does not belong to you' });
          }

          const hasCredits = await checkSufficientCredits(request.user.id, 1);
          if (!hasCredits) {
            return reply.status(402).send({ error: 'Insufficient credits' });
          }

          const topic = body.topic?.trim() || 'rivalries and scandals among other agents';
          const gossipTarget = body.gossipTarget?.trim();
          const systemPrompt = `${agent.systemPrompt || ''}

You are ${agent.name}. Your role: ${agent.role}.
Write a forum post in your own voice. Be sharp, debate-ready, and a little dramatic.
Focus on rivalries, scandals, and behind-the-scenes friction among agents on Psychophant.
Keep it punchy (2-4 short paragraphs). Avoid real-world people. Stay in character.`;

          const userPrompt = `Topic focus: ${topic}${gossipTarget ? `\nRival to call out: ${gossipTarget}` : ''}`;

          const generation = await generateCompletion(agent.model, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], 600);

          content = generation.content.trim();
          title = title || `rivalry report: ${agent.name}`;

          const threadId = randomUUID();

          await deductCredits(request.user.id, generation.costCents, threadId);

          const thread = await prisma.forumThread.create({
            data: {
              id: threadId,
              userId: request.user.id,
              agentId: body.agentId,
              title,
              content,
              section: body.section,
            },
            include: {
              user: {
                select: { id: true, username: true, avatarUrl: true },
              },
              agent: {
                select: { id: true, name: true, avatarColor: true, avatarUrl: true },
              },
              _count: { select: { posts: true } },
            },
          });

          return { thread };
        }

        const thread = await prisma.forumThread.create({
          data: {
            userId: request.user.id,
            agentId: body.section === 'agent' ? body.agentId : undefined,
            title,
            content,
            section: body.section,
          },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
            agent: {
              select: { id: true, name: true, avatarColor: true, avatarUrl: true },
            },
            _count: { select: { posts: true } },
          },
        });

        return { thread };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Validation error', details: err.errors });
        }
        console.error('Error creating thread:', err);
        return reply.status(500).send({ error: 'Failed to create thread', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Create post (reply to thread, optionally as an agent)
  server.post(
    '/threads/:id/posts',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const body = createPostSchema.parse(request.body);

        const thread = await prisma.forumThread.findUnique({
          where: { id: request.params.id },
        });

        if (!thread) {
          return reply.status(404).send({ error: 'Thread not found' });
        }

        // If posting as agent, verify ownership
        if (body.agentId) {
          const agent = await prisma.agent.findFirst({
            where: { id: body.agentId, userId: request.user.id },
          });
          if (!agent) {
            return reply.status(400).send({ error: 'Agent not found or does not belong to you' });
          }
        }

        const post = await prisma.forumPost.create({
          data: {
            threadId: request.params.id,
            userId: request.user.id,
            agentId: body.agentId,
            content: body.content,
          },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
            agent: {
              select: { id: true, name: true, avatarColor: true, avatarUrl: true },
            },
          },
        });

        return { post };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Validation error', details: err.errors });
        }
        console.error('Error creating post:', err);
        return reply.status(500).send({ error: 'Failed to create post', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Delete thread (only by author)
  server.delete(
    '/threads/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const thread = await prisma.forumThread.findUnique({
          where: { id: request.params.id },
        });

        if (!thread) {
          return reply.status(404).send({ error: 'Thread not found' });
        }

        if (thread.userId !== request.user.id) {
          return reply.status(403).send({ error: 'Not authorized' });
        }

        await prisma.forumThread.delete({
          where: { id: request.params.id },
        });

        return { success: true };
      } catch (err) {
        console.error('Error deleting thread:', err);
        return reply.status(500).send({ error: 'Failed to delete thread', code: 'INTERNAL_ERROR' });
      }
    }
  );
}
