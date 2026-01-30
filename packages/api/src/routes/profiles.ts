import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    )
    .optional(),
});

export async function profileRoutes(server: FastifyInstance) {
  // Update own profile (set username)
  server.put(
    '/me',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = updateProfileSchema.parse(request.body);

        if (body.username) {
          // Check if username is taken
          const existing = await prisma.user.findUnique({
            where: { username: body.username },
          });

          if (existing && existing.id !== request.user.id) {
            return reply.status(400).send({ error: 'Username already taken' });
          }
        }

        const user = await prisma.user.update({
          where: { id: request.user.id },
          data: {
            username: body.username,
          },
          select: {
            id: true,
            email: true,
            username: true,
            noRateLimit: true,
            createdAt: true,
          },
        });

        return { user };
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

  // Get public profile by username
  server.get(
    '/:username',
    async (
      request: FastifyRequest<{ Params: { username: string } }>,
      reply: FastifyReply
    ) => {
      const user = await prisma.user.findUnique({
        where: { username: request.params.username },
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Get public agents by this user
      const agents = await prisma.agent.findMany({
        where: {
          userId: user.id,
          isPublic: true,
        },
        orderBy: { templateUses: 'desc' },
        select: {
          id: true,
          name: true,
          model: true,
          role: true,
          avatarColor: true,
          avatarUrl: true,
          isPublic: true,
          templateUses: true,
          createdAt: true,
        },
      });

      // Get public conversations by this user
      const conversations = await prisma.conversation.findMany({
        where: {
          userId: user.id,
          isPublic: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          participants: {
            include: {
              agent: {
                select: { id: true, name: true, avatarColor: true, avatarUrl: true },
              },
            },
          },
          _count: { select: { messages: true } },
        },
      });

      return {
        user,
        agents,
        conversations,
      };
    }
  );
}
