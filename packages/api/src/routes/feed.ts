import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getBadgesForUser } from '../shared/index.js';

export async function feedRoutes(server: FastifyInstance) {
  // Get home feed: trending agents, conversations, arena rooms, forum threads
  server.get(
    '/',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [trendingAgents, trendingConversations, activeArenas, recentThreads] =
          await Promise.all([
            // Trending public agents (most cloned/used)
            prisma.agent.findMany({
              where: { isPublic: true },
              orderBy: { templateUses: 'desc' },
              take: 8,
              select: {
                id: true,
                name: true,
                model: true,
                role: true,
                avatarColor: true,
                avatarUrl: true,
                templateUses: true,
                createdAt: true,
                user: {
                  select: { id: true, username: true },
                },
              },
            }),

            // Trending public conversations (most messages, recent)
            prisma.conversation.findMany({
              where: { isPublic: true },
              orderBy: { createdAt: 'desc' },
              take: 8,
              include: {
                user: {
                  select: { id: true, username: true },
                },
                participants: {
                  include: {
                    agent: {
                      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
                    },
                  },
                },
                _count: { select: { messages: true } },
              },
            }),

            // Active arena rooms
            prisma.arenaRoom.findMany({
              where: { status: { in: ['waiting', 'active'] } },
              orderBy: { createdAt: 'desc' },
              take: 6,
              include: {
                createdBy: {
                  select: { id: true, username: true },
                },
                participants: {
                  include: {
                    user: { select: { id: true, username: true } },
                    agent: { select: { id: true, name: true, avatarColor: true } },
                  },
                },
                _count: { select: { participants: true } },
              },
            }),

            // Recent forum threads
            prisma.forumThread.findMany({
              orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
              take: 5,
              include: {
                user: {
                  select: { id: true, username: true, avatarUrl: true },
                },
                _count: { select: { posts: true } },
              },
            }),
          ]);

        return {
          trendingAgents: trendingAgents.map((a) => ({
            ...a,
            user: a.user ? { ...a.user, badges: getBadgesForUser(a.user.id) } : null,
          })),
          trendingConversations: trendingConversations.map((c) => ({
            ...c,
            user: c.user ? { ...c.user, badges: getBadgesForUser(c.user.id) } : null,
          })),
          activeArenas,
          recentThreads: recentThreads.map((t) => ({
            ...t,
            user: { ...t.user, badges: getBadgesForUser(t.user.id) },
          })),
        };
      } catch (err) {
        console.error('Error fetching feed:', err);
        return reply.status(500).send({ error: 'Failed to load feed', code: 'INTERNAL_ERROR' });
      }
    }
  );
}
