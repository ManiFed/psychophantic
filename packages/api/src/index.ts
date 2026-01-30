import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { authRoutes } from './routes/auth.js';
import { agentRoutes } from './routes/agents.js';
import { conversationRoutes } from './routes/conversations.js';
import { creditRoutes } from './routes/credits.js';
import { streamRoutes } from './routes/stream.js';
import { profileRoutes } from './routes/profiles.js';
import { arenaRoutes } from './routes/arena.js';
import { getQueueStats, getFailedJobs } from './lib/queue.js';
import { redis, isRedisAvailable } from './lib/redis.js';
import { prisma } from './lib/prisma.js';

// =============================================================================
// STARTUP ENVIRONMENT VALIDATION
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';

// Log environment summary (no secrets)
console.log('=====================================');
console.log('API Server Starting...');
console.log('=====================================');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
console.log(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
console.log(`REDIS_URL present: ${!!process.env.REDIS_URL}`);
console.log(`JWT_SECRET present: ${!!process.env.JWT_SECRET}`);
console.log(`WEB_URL: ${process.env.WEB_URL || '(not set)'}`);
console.log(`APP_URL: ${process.env.APP_URL || '(not set)'}`);
console.log('=====================================');

// Validate required environment variables in production
const validateEnv = (): void => {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  if (isProduction) {
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET is required in production');
    }

    if (process.env.JWT_SECRET === 'development-secret-change-in-production') {
      errors.push('JWT_SECRET must be changed from the default in production');
    }
  }

  if (errors.length > 0) {
    console.error('=====================================');
    console.error('FATAL: Environment validation failed!');
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('=====================================');

    if (isProduction) {
      process.exit(1);
    }
  }
};

validateEnv();

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = Fastify({
  logger: {
    level: isProduction ? 'info' : 'debug',
  },
});

// Add raw body parser for Stripe webhooks
// This allows the webhook endpoint to access the raw body for signature verification
server.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  function (req, body, done) {
    try {
      // Store raw body for webhook verification
      (req as any).rawBody = body;
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error);
    }
  }
);

// CORS configuration
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];

  // Production web URL
  if (process.env.WEB_URL) {
    origins.push(process.env.WEB_URL);
  }

  // Legacy APP_URL support
  if (process.env.APP_URL) {
    origins.push(process.env.APP_URL);
  }

  // Always allow the Railway production web domain
  origins.push('https://psychophantweb-production.up.railway.app');

  // Development origins
  if (!isProduction) {
    origins.push('http://localhost:3000');
    origins.push('http://127.0.0.1:3000');
  }

  return [...new Set(origins)]; // Deduplicate
};

// Register plugins
await server.register(cors, {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// JWT configuration - fail in production if secret not set
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-in-production';

await server.register(jwt, {
  secret: jwtSecret,
  sign: {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
});

// Declare JWT user type
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      email: string;
    };
  }
}

// Global error handler - catches unhandled errors in route handlers
server.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    server.log.error({ err: error, url: request.url, method: request.method }, 'Unhandled server error');
  }

  // Don't expose internal error details in production
  const message = statusCode >= 500 && isProduction
    ? 'An unexpected error occurred. Please try again.'
    : error.message;

  reply.status(statusCode).send({
    error: message,
    code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
  });
});

// Health check with env status and database connectivity test
server.get('/health', async () => {
  let dbStatus = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      nodeEnv: process.env.NODE_ENV || 'undefined',
      databaseConfigured: !!process.env.DATABASE_URL,
      databaseStatus: dbStatus,
      redisConfigured: !!process.env.REDIS_URL,
      jwtConfigured: !!process.env.JWT_SECRET,
    },
  };
});

// Debug endpoint to check queue and Redis status
server.get('/debug/queue', async () => {
  const queueStats = await getQueueStats();
  const redisStatus = isRedisAvailable();
  const failedJobs = await getFailedJobs();

  // Test Redis pub/sub
  let pubsubTest = 'not tested';
  if (redis) {
    try {
      await redis.ping();
      pubsubTest = 'ping successful';
    } catch (e) {
      pubsubTest = `ping failed: ${e}`;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    redis: {
      configured: !!process.env.REDIS_URL,
      connected: redisStatus,
      pingTest: pubsubTest,
    },
    queue: queueStats,
    failedJobs,
    hint: queueStats.available && (queueStats as any).counts?.waiting > 0
      ? 'Jobs are waiting - orchestration worker may not be running!'
      : 'Queue looks healthy',
  };
});

// Register routes
await server.register(authRoutes, { prefix: '/api/auth' });
await server.register(agentRoutes, { prefix: '/api/agents' });
await server.register(conversationRoutes, { prefix: '/api/conversations' });
await server.register(creditRoutes, { prefix: '/api/credits' });
await server.register(streamRoutes, { prefix: '/api/conversations' });
await server.register(profileRoutes, { prefix: '/api/profiles' });
await server.register(arenaRoutes, { prefix: '/api/arena' });

// Start server
const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

try {
  await server.listen({ port, host });
  console.log('=====================================');
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=====================================');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  });
}
