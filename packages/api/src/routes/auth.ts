import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { DAILY_FREE_CREDITS_CENTS } from '../shared/index.js';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Helper to identify Prisma errors
const isPrismaError = (err: unknown): err is Error & { code?: string } => {
  return err instanceof Error && 'code' in err;
};

// Helper to handle database errors gracefully
const handleDatabaseError = (err: unknown, reply: FastifyReply) => {
  console.error('Database error:', err);

  if (isPrismaError(err)) {
    // Connection errors
    if (err.message.includes('DATABASE_URL') || err.message.includes('connect')) {
      return reply.status(503).send({
        error: 'Database temporarily unavailable',
        code: 'DB_CONNECTION_ERROR',
      });
    }

    // Unique constraint violation
    if (err.code === 'P2002') {
      return reply.status(400).send({
        error: 'Email already registered',
        code: 'DUPLICATE_EMAIL',
      });
    }
  }

  // Generic server error
  return reply.status(500).send({
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR',
  });
};

export async function authRoutes(server: FastifyInstance) {
  // Register
  server.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(body.password, 12);

      // Create user with initial credit balance
      const user = await prisma.user.create({
        data: {
          email: body.email,
          passwordHash,
          creditBalance: {
            create: {
              freeCreditsCents: DAILY_FREE_CREDITS_CENTS,
              purchasedCreditsCents: 0,
            },
          },
        },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      // Generate JWT
      const token = server.jwt.sign({ id: user.id, email: user.email });

      return { user, token };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation error',
          details: err.errors,
        });
      }

      // Handle Prisma/database errors
      return handleDatabaseError(err, reply);
    }
  });

  // Login
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(body.password, user.passwordHash);

      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Generate JWT
      const token = server.jwt.sign({ id: user.id, email: user.email });

      return {
        user: { id: user.id, email: user.email, username: user.username },
        token,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation error',
          details: err.errors,
        });
      }

      // Handle Prisma/database errors
      return handleDatabaseError(err, reply);
    }
  });

  // Get current user
  server.get(
    '/me',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: request.user.id },
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
        return handleDatabaseError(err, reply);
      }
    }
  );
}
