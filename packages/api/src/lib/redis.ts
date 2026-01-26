import Redis from 'ioredis';

// Redis is optional - the app should work without it (just without caching)
const redisUrl = process.env.REDIS_URL;

// Track connection state
let isRedisConnected = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisInstance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createRedisClient = (): any => {
  if (!redisUrl) {
    console.log('REDIS_URL not set - Redis features disabled (caching, sessions)');
    return null;
  }

  // Never fall back to localhost in production
  if (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('REDIS_URL points to localhost in production - Redis disabled');
      return null;
    }
  }

  console.log('Connecting to Redis...');

  // @ts-expect-error - ioredis types are complex with ESM
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    lazyConnect: true, // Don't connect until first command
  });

  client.on('error', (err: Error) => {
    console.error('Redis connection error:', err.message);
    isRedisConnected = false;
  });

  client.on('connect', () => {
    console.log('Connected to Redis');
    isRedisConnected = true;
  });

  client.on('close', () => {
    console.log('Redis connection closed');
    isRedisConnected = false;
  });

  return client;
};

redisInstance = createRedisClient();

// Export a proxy that handles missing Redis gracefully
export const redis = redisInstance;

// Check if Redis is available
export const isRedisAvailable = (): boolean => {
  return redisInstance !== null && isRedisConnected;
};

// Helper functions that gracefully handle missing Redis
export const redisHelpers = {
  // Credit cache - returns null if Redis unavailable
  async getCachedCredits(userId: string) {
    if (!redisInstance) return null;

    try {
      const data = await redisInstance.hgetall(`credits:${userId}`);
      if (!data.free) return null;
      return {
        freeCents: parseInt(data.free, 10),
        purchasedCents: parseInt(data.purchased, 10),
        lastFreeReset: new Date(data.lastReset),
      };
    } catch (err) {
      console.error('Redis getCachedCredits error:', err);
      return null;
    }
  },

  async setCachedCredits(
    userId: string,
    freeCents: number,
    purchasedCents: number,
    lastFreeReset: Date
  ) {
    if (!redisInstance) return;

    try {
      await redisInstance.hset(`credits:${userId}`, {
        free: freeCents.toString(),
        purchased: purchasedCents.toString(),
        lastReset: lastFreeReset.toISOString(),
      });
      await redisInstance.expire(`credits:${userId}`, 60); // 60 second TTL
    } catch (err) {
      console.error('Redis setCachedCredits error:', err);
    }
  },

  async invalidateCreditCache(userId: string) {
    if (!redisInstance) return;

    try {
      await redisInstance.del(`credits:${userId}`);
    } catch (err) {
      console.error('Redis invalidateCreditCache error:', err);
    }
  },

  // Session state - returns null if Redis unavailable
  async getSessionState(conversationId: string) {
    if (!redisInstance) return null;

    try {
      const data = await redisInstance.hgetall(`session:${conversationId}`);
      if (!data.status) return null;
      return {
        status: data.status as 'active' | 'paused' | 'generating' | 'force_agreement',
        currentAgentId: data.currentAgentId || null,
        currentRound: parseInt(data.currentRound || '1', 10),
        pendingInterjection: data.pendingInterjection || null,
        forceAgreementPhase: data.forceAgreementPhase
          ? parseInt(data.forceAgreementPhase, 10)
          : null,
        lockedAt: data.lockedAt || null,
      };
    } catch (err) {
      console.error('Redis getSessionState error:', err);
      return null;
    }
  },

  async setSessionState(
    conversationId: string,
    state: {
      status?: string;
      currentAgentId?: string | null;
      currentRound?: number;
      pendingInterjection?: string | null;
      forceAgreementPhase?: number | null;
    }
  ) {
    if (!redisInstance) return;

    try {
      const data: Record<string, string> = {};
      if (state.status !== undefined) {
        data.status = state.status;
      }
      if (state.currentAgentId !== undefined) {
        data.currentAgentId = state.currentAgentId || '';
      }
      if (state.currentRound !== undefined) {
        data.currentRound = state.currentRound.toString();
      }
      if (state.pendingInterjection !== undefined) {
        data.pendingInterjection = state.pendingInterjection || '';
      }
      if (state.forceAgreementPhase !== undefined) {
        data.forceAgreementPhase = state.forceAgreementPhase?.toString() || '';
      }

      if (Object.keys(data).length > 0) {
        await redisInstance.hset(`session:${conversationId}`, data);
        await redisInstance.expire(`session:${conversationId}`, 86400); // 24 hour TTL
      }
    } catch (err) {
      console.error('Redis setSessionState error:', err);
    }
  },

  async deleteSessionState(conversationId: string) {
    if (!redisInstance) return;

    try {
      await redisInstance.del(`session:${conversationId}`);
    } catch (err) {
      console.error('Redis deleteSessionState error:', err);
    }
  },

  // Distributed locking - returns false if Redis unavailable
  async acquireLock(key: string, ttlSeconds: number = 60): Promise<boolean> {
    if (!redisInstance) {
      // Without Redis, we can't do distributed locking
      // Return true to allow single-instance operation
      return true;
    }

    try {
      const result = await redisInstance.set(`lock:${key}`, '1', 'NX', 'EX', ttlSeconds);
      return result === 'OK';
    } catch (err) {
      console.error('Redis acquireLock error:', err);
      return true; // Allow operation to proceed
    }
  },

  async releaseLock(key: string): Promise<void> {
    if (!redisInstance) return;

    try {
      await redisInstance.del(`lock:${key}`);
    } catch (err) {
      console.error('Redis releaseLock error:', err);
    }
  },
};
