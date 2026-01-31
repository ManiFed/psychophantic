import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { DAILY_FREE_CREDITS_CENTS } from '../shared/index.js';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    ),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Classify errors with specific codes so we can diagnose production issues
const classifyError = (err: unknown): { status: number; error: string; code: string } => {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? err.constructor.name : 'Unknown';
  const errCode = (err as Record<string, unknown>)?.code;

  console.error(`[Auth] Error name=${errName} code=${String(errCode)} message=${errMsg}`);
  if (err instanceof Error && err.stack) {
    console.error(`[Auth] Stack: ${err.stack}`);
  }

  // Prisma connection / initialization errors
  if (
    errName === 'PrismaClientInitializationError' ||
    errName === 'PrismaClientRustPanicError' ||
    errMsg.includes("Can't reach database") ||
    errMsg.includes('database server') ||
    errMsg.includes('connect') ||
    errMsg.includes('CONNECTION') ||
    errMsg.includes('DATABASE_URL') ||
    errMsg.includes('timed out') ||
    errMsg.includes('ECONNREFUSED') ||
    errMsg.includes('ENOTFOUND') ||
    errMsg.includes('prepared statement')
  ) {
    return {
      status: 503,
      error: 'Database temporarily unavailable. Please try again shortly.',
      code: 'DB_CONNECTION_ERROR',
    };
  }

  // Prisma known request errors
  if (errCode === 'P2002') {
    return { status: 400, error: 'Email already registered', code: 'DUPLICATE_EMAIL' };
  }
  if (errCode === 'P2021' || errCode === 'P2022') {
    return {
      status: 503,
      error: 'Database schema needs migration. Please contact support.',
      code: 'DB_SCHEMA_ERROR',
    };
  }

  // JWT errors
  if (errMsg.includes('secretOrPrivateKey') || errMsg.includes('jwt') || errName.includes('Jwt')) {
    return {
      status: 500,
      error: 'Authentication service misconfigured.',
      code: 'JWT_CONFIG_ERROR',
    };
  }

  return {
    status: 500,
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR',
  };
};

export async function authRoutes(server: FastifyInstance) {
  // Register
  server.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if email exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'Email already registered' });
      }

      // Check if username is taken
      const existingUsername = await prisma.user.findUnique({
        where: { username: body.username },
      });

      if (existingUsername) {
        return reply.status(400).send({ error: 'Username already taken' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(body.password, 12);

      // Create user with initial credit balance
      const user = await prisma.user.create({
        data: {
          email: body.email,
          username: body.username,
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

      const classified = classifyError(err);
      return reply.status(classified.status).send({
        error: classified.error,
        code: classified.code,
      });
    }
  });

  // Login
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Step 1: Query database
      let user;
      try {
        user = await prisma.user.findUnique({
          where: { email: body.email },
        });
      } catch (dbErr) {
        console.error('[Login] Database query failed:', dbErr);
        const classified = classifyError(dbErr);
        return reply.status(classified.status).send({
          error: classified.error,
          code: classified.code,
        });
      }

      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Step 2: Verify password
      let validPassword;
      try {
        validPassword = await bcrypt.compare(body.password, user.passwordHash);
      } catch (bcryptErr) {
        console.error('[Login] bcrypt.compare failed:', bcryptErr);
        return reply.status(500).send({
          error: 'Password verification failed. Please try again.',
          code: 'BCRYPT_ERROR',
        });
      }

      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Step 3: Generate JWT
      let token;
      try {
        token = server.jwt.sign({ id: user.id, email: user.email });
      } catch (jwtErr) {
        console.error('[Login] JWT sign failed:', jwtErr);
        return reply.status(500).send({
          error: 'Authentication service error. Please contact support.',
          code: 'JWT_SIGN_ERROR',
        });
      }

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

      const classified = classifyError(err);
      return reply.status(classified.status).send({
        error: classified.error,
        code: classified.code,
      });
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
            bio: true,
            avatarUrl: true,
            noRateLimit: true,
            createdAt: true,
          },
        });

        return { user };
      } catch (err) {
        const classified = classifyError(err);
        return reply.status(classified.status).send({
          error: classified.error,
          code: classified.code,
        });
      }
    }
  );
}
