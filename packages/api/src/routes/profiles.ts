import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getBadgesForUser } from '../shared/index.js';

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
  bio: z.string().max(300, 'Bio must be at most 300 characters').optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
});

export async function profileRoutes(server: FastifyInstance) {
  // Update own profile
  server.put(
    '/me',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = updateProfileSchema.parse(request.body);

        if (body.username) {
          const existing = await prisma.user.findUnique({
            where: { username: body.username },
          });

          if (existing && existing.id !== request.user.id) {
            return reply.status(400).send({ error: 'Username already taken' });
          }
        }

        const data: Record<string, unknown> = {};
        if (body.username !== undefined) data.username = body.username;
        if (body.bio !== undefined) data.bio = body.bio;
        if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;

        const user = await prisma.user.update({
          where: { id: request.user.id },
          data,
          select: {
            id: true,
            email: true,
            username: true,
            bio: true,
            avatarUrl: true,
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
        console.error('Error updating profile:', err);
        return reply.status(500).send({
          error: 'An unexpected error occurred. Please try again.',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Follow a user
  server.post(
    '/:userId/follow',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const targetId = request.params.userId;

        if (targetId === request.user.id) {
          return reply.status(400).send({ error: 'Cannot follow yourself' });
        }

        const target = await prisma.user.findUnique({ where: { id: targetId } });
        if (!target) {
          return reply.status(404).send({ error: 'User not found' });
        }

        await prisma.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: request.user.id,
              followingId: targetId,
            },
          },
          create: {
            followerId: request.user.id,
            followingId: targetId,
          },
          update: {},
        });

        return { success: true };
      } catch (err) {
        console.error('Error following user:', err);
        return reply.status(500).send({ error: 'Failed to follow user', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Unfollow a user
  server.delete(
    '/:userId/follow',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        await prisma.follow.deleteMany({
          where: {
            followerId: request.user.id,
            followingId: request.params.userId,
          },
        });

        return { success: true };
      } catch (err) {
        console.error('Error unfollowing user:', err);
        return reply.status(500).send({ error: 'Failed to unfollow user', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Get followers list
  server.get(
    '/:userId/followers',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const followers = await prisma.follow.findMany({
          where: { followingId: request.params.userId },
          include: {
            follower: {
              select: { id: true, username: true, avatarUrl: true, bio: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return { users: followers.map((f) => ({ ...f.follower, badges: getBadgesForUser(f.follower.id) })) };
      } catch (err) {
        console.error('Error fetching followers:', err);
        return reply.status(500).send({ error: 'Failed to fetch followers', code: 'INTERNAL_ERROR' });
      }
    }
  );

  // Get following list
  server.get(
    '/:userId/following',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const following = await prisma.follow.findMany({
          where: { followerId: request.params.userId },
          include: {
            following: {
              select: { id: true, username: true, avatarUrl: true, bio: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return { users: following.map((f) => ({ ...f.following, badges: getBadgesForUser(f.following.id) })) };
      } catch (err) {
        console.error('Error fetching following:', err);
        return reply.status(500).send({ error: 'Failed to fetch following', code: 'INTERNAL_ERROR' });
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
          bio: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: {
              followers: true,
              following: true,
              agents: true,
              conversations: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Check if the current user is following this profile
      let isFollowing = false;
      try {
        await request.jwtVerify();
        if (request.user?.id) {
          const follow = await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: request.user.id,
                followingId: user.id,
              },
            },
          });
          isFollowing = !!follow;
        }
      } catch {
        // Not authenticated
      }

      const badges = getBadgesForUser(user.id);

      // Get public agents
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

      // Get public conversations
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
        user: {
          id: user.id,
          username: user.username,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          badges,
          isFollowing,
          followerCount: user._count.followers,
          followingCount: user._count.following,
          agentCount: user._count.agents,
          conversationCount: user._count.conversations,
        },
        agents,
        conversations,
      };
    }
  );
}
