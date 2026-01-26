import { PrismaClient } from '@prisma/client';

// Validate DATABASE_URL before creating client
const validateDatabaseUrl = (): void => {
  if (!process.env.DATABASE_URL) {
    console.error('=====================================');
    console.error('FATAL: DATABASE_URL is not set!');
    console.error('The API cannot connect to the database.');
    console.error('Please set DATABASE_URL in your environment variables.');
    console.error('=====================================');

    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL environment variable is required in production');
    }
  } else {
    // Log that we found it (without exposing the actual URL)
    console.log('DATABASE_URL is configured');
  }
};

// Run validation
validateDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
