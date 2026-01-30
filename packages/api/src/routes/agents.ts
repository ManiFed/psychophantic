import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// We validate models dynamically from OpenRouter instead of a static list
const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  model: z.string().min(1, 'Model is required'),
  role: z.string().min(1, 'Role is required').max(500),
  systemPrompt: z.string().max(10000).optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format')
    .optional(),
  // Accept URLs, data URLs, or null/undefined
  avatarUrl: z
    .string()
    .refine(
      (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:'),
      'Must be a valid URL or data URL'
    )
    .optional()
    .nullable(),
  isPublic: z.boolean().optional(),
});

const updateAgentSchema = createAgentSchema.partial();

// Cache for OpenRouter models
let modelsCache: { models: OpenRouterModel[]; fetchedAt: number } | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    is_moderated: boolean;
  };
}

async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  // Check cache
  if (modelsCache && Date.now() - modelsCache.fetchedAt < CACHE_TTL) {
    return modelsCache.models;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch OpenRouter models:', response.statusText);
      return modelsCache?.models || [];
    }

    const data = (await response.json()) as { data: OpenRouterModel[] };
    const models = data.data || [];

    // Update cache
    modelsCache = { models, fetchedAt: Date.now() };

    return models;
  } catch (err) {
    console.error('Error fetching OpenRouter models:', err);
    return modelsCache?.models || [];
  }
}

export async function agentRoutes(server: FastifyInstance) {
  // Get available models from OpenRouter (full list with correct costs)
  server.get('/models', async () => {
    const models = await fetchOpenRouterModels();

    // Transform to frontend format
    // OpenRouter pricing is per-token in dollars
    // We convert to per-1M-tokens for display
    const formattedModels = models
      .filter((m) => m.pricing && m.id && m.name)
      .map((m) => {
        const promptPerToken = parseFloat(m.pricing.prompt) || 0;
        const completionPerToken = parseFloat(m.pricing.completion) || 0;
        return {
          id: m.id,
          name: m.name,
          description: m.description,
          contextLength: m.context_length,
          pricing: {
            // Per-token costs (raw)
            prompt: promptPerToken,
            completion: completionPerToken,
            // Per-1M-token costs for display
            promptPer1M: promptPerToken * 1_000_000,
            completionPer1M: completionPerToken * 1_000_000,
          },
        };
      });

    // Sort by popularity/common usage
    const popularProviders = ['anthropic', 'openai', 'google', 'meta-llama', 'mistralai', 'deepseek', 'cohere'];
    formattedModels.sort((a, b) => {
      const aProvider = a.id.split('/')[0];
      const bProvider = b.id.split('/')[0];
      const aIndex = popularProviders.indexOf(aProvider);
      const bIndex = popularProviders.indexOf(bProvider);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return { models: formattedModels };
  });

  // List user's agents
  server.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest) => {
      const agents = await prisma.agent.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
      });

      return { agents };
    }
  );

  // List public/template agents
  server.get('/public', async () => {
    const agents = await prisma.agent.findMany({
      where: {
        OR: [{ isTemplate: true }, { isPublic: true }],
      },
      orderBy: { templateUses: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        model: true,
        role: true,
        avatarColor: true,
        avatarUrl: true,
        isTemplate: true,
        templateUses: true,
        createdAt: true,
        user: {
          select: { email: true, username: true },
        },
      },
    });

    return { agents };
  });

  // Get public agent profile (no auth required)
  server.get(
    '/:agentId/profile',
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          OR: [{ isPublic: true }, { isTemplate: true }],
        },
        include: {
          user: {
            select: { username: true },
          },
        },
      });

      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Get public conversations this agent has been in
      const participations = await prisma.conversationParticipant.findMany({
        where: {
          agentId: agent.id,
          conversation: {
            isPublic: true,
          },
        },
        include: {
          conversation: {
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
          },
        },
        orderBy: {
          conversation: { createdAt: 'desc' },
        },
        take: 20,
      });

      const conversations = participations.map((p) => p.conversation);

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          role: agent.role,
          systemPrompt: agent.systemPrompt,
          avatarColor: agent.avatarColor,
          avatarUrl: agent.avatarUrl,
          isPublic: agent.isPublic,
          isTemplate: agent.isTemplate,
          templateUses: agent.templateUses,
          createdAt: agent.createdAt,
          creatorUsername: agent.user.username,
        },
        conversations,
      };
    }
  );

  // Remix an agent (clone with modifications)
  server.post(
    '/:agentId/remix',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const sourceAgent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          OR: [
            { userId: request.user.id },
            { isPublic: true },
            { isTemplate: true },
          ],
        },
      });

      if (!sourceAgent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Parse optional overrides from body
      const body = (request.body || {}) as {
        name?: string;
        role?: string;
        systemPrompt?: string;
        model?: string;
      };

      const agent = await prisma.agent.create({
        data: {
          userId: request.user.id,
          name: body.name || `${sourceAgent.name} (Remix)`,
          model: body.model || sourceAgent.model,
          role: body.role || sourceAgent.role,
          systemPrompt: body.systemPrompt ?? sourceAgent.systemPrompt,
          avatarColor: sourceAgent.avatarColor,
          avatarUrl: sourceAgent.avatarUrl,
        },
      });

      // Increment template uses
      if (sourceAgent.isTemplate || sourceAgent.isPublic) {
        await prisma.agent.update({
          where: { id: sourceAgent.id },
          data: { templateUses: { increment: 1 } },
        });
      }

      return { agent };
    }
  );

  // Get single agent
  server.get(
    '/:agentId',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          OR: [
            { userId: request.user.id },
            { isPublic: true },
            { isTemplate: true },
          ],
        },
      });

      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      return { agent };
    }
  );

  // Create agent
  server.post(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createAgentSchema.parse(request.body);

        // Check agent limit (soft limit for now)
        const agentCount = await prisma.agent.count({
          where: { userId: request.user.id },
        });

        if (agentCount >= 50) {
          return reply.status(400).send({
            error: 'Agent limit reached. Please delete some agents.',
          });
        }

        const agent = await prisma.agent.create({
          data: {
            userId: request.user.id,
            name: body.name,
            model: body.model,
            role: body.role,
            systemPrompt: body.systemPrompt,
            avatarColor: body.avatarColor || '#6366f1',
            avatarUrl: body.avatarUrl,
            isPublic: body.isPublic || false,
          },
        });

        return { agent };
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

  // Update agent
  server.put(
    '/:agentId',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const body = updateAgentSchema.parse(request.body);

        // Verify ownership
        const existingAgent = await prisma.agent.findFirst({
          where: {
            id: request.params.agentId,
            userId: request.user.id,
          },
        });

        if (!existingAgent) {
          return reply.status(404).send({ error: 'Agent not found' });
        }

        const agent = await prisma.agent.update({
          where: { id: request.params.agentId },
          data: body,
        });

        return { agent };
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

  // Delete agent
  server.delete(
    '/:agentId',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      // Verify ownership
      const existingAgent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          userId: request.user.id,
        },
      });

      if (!existingAgent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Check if agent is in any active conversations
      const activeParticipation = await prisma.conversationParticipant.findFirst({
        where: {
          agentId: request.params.agentId,
          conversation: {
            status: { in: ['active', 'paused', 'force_agreement'] },
          },
        },
      });

      if (activeParticipation) {
        return reply.status(400).send({
          error: 'Cannot delete agent that is in an active conversation',
        });
      }

      await prisma.agent.delete({
        where: { id: request.params.agentId },
      });

      return { success: true };
    }
  );

  // Clone agent from template or public agent
  server.post(
    '/:agentId/clone',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      // Find the source agent (must be a template, public, or user's own)
      const sourceAgent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          OR: [
            { userId: request.user.id },
            { isTemplate: true },
            { isPublic: true },
          ],
        },
      });

      if (!sourceAgent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Create the clone
      const agent = await prisma.agent.create({
        data: {
          userId: request.user.id,
          name: `${sourceAgent.name} (Copy)`,
          model: sourceAgent.model,
          role: sourceAgent.role,
          systemPrompt: sourceAgent.systemPrompt,
          avatarColor: sourceAgent.avatarColor,
          avatarUrl: sourceAgent.avatarUrl,
        },
      });

      // Increment template uses if applicable
      if (sourceAgent.isTemplate || sourceAgent.isPublic) {
        await prisma.agent.update({
          where: { id: sourceAgent.id },
          data: { templateUses: { increment: 1 } },
        });
      }

      return { agent };
    }
  );

  // Upload avatar image (expects URL from client-side upload to Cloudinary/S3)
  server.post(
    '/:agentId/avatar',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      // Verify ownership
      const existingAgent = await prisma.agent.findFirst({
        where: {
          id: request.params.agentId,
          userId: request.user.id,
        },
      });

      if (!existingAgent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      const body = request.body as { avatarUrl?: string };

      if (!body.avatarUrl) {
        return reply.status(400).send({ error: 'avatarUrl is required' });
      }

      const agent = await prisma.agent.update({
        where: { id: request.params.agentId },
        data: { avatarUrl: body.avatarUrl },
      });

      return { agent };
    }
  );
}
