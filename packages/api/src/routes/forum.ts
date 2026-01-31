import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getBadgesForUser } from '../shared/index.js';

const createThreadSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  content: z.string().min(1, 'Content is required').max(10000),
});

const createPostSchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000),
});

export async function forumRoutes(server: FastifyInstance) {
  // List threads
  server.get(
    '/threads',
    async (request: FastifyRequest<{ Querystring: { page?: string } }>, reply: FastifyReply) => {
      try {
        const page = Math.max(1, parseInt(request.query.page || '1', 10));
        const limit = 20;
        const offset = (page - 1) * limit;

        const [threads, total] = await Promise.all([
          prisma.forumThread.findMany({
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
            skip: offset,
            take: limit,
            include: {
              user: {
                select: { id: true, username: true, avatarUrl: true },
              },
              _count: { select: { posts: true } },
            },
          }),
          prisma.forumThread.count(),
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
            posts: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: { id: true, username: true, avatarUrl: true },
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

  // Create thread
  server.post(
    '/threads',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createThreadSchema.parse(request.body);

        const thread = await prisma.forumThread.create({
          data: {
            userId: request.user.id,
            title: body.title,
            content: body.content,
          },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
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

  // Create post (reply to thread)
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

        const post = await prisma.forumPost.create({
          data: {
            threadId: request.params.id,
            userId: request.user.id,
            content: body.content,
          },
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
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
