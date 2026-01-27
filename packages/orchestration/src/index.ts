import { Worker, Queue, Job } from 'bullmq';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import {
  handleStartConversation,
  handleNextTurn,
  handleProcessInterjection,
  handleResumeConversation,
} from './workers/turnManager.js';
import { handleForceAgreementPhase } from './forceAgreement/handler.js';

// Job types
export interface StartConversationJob {
  type: 'start_conversation';
  conversationId: string;
  initialPrompt: string;
}

export interface NextTurnJob {
  type: 'next_turn';
  conversationId: string;
}

export interface ProcessInterjectionJob {
  type: 'process_interjection';
  conversationId: string;
  content: string;
}

export interface ForceAgreementPhaseJob {
  type: 'force_agreement_phase';
  conversationId: string;
  phase: number;
}

export interface ResumeConversationJob {
  type: 'resume_conversation';
  conversationId: string;
}

export type OrchestrationJob =
  | StartConversationJob
  | NextTurnJob
  | ProcessInterjectionJob
  | ForceAgreementPhaseJob
  | ResumeConversationJob;

// Create the queue
export const orchestrationQueue = new Queue<OrchestrationJob>('orchestration', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      count: 50,
    },
  },
});

// Create the worker
const worker = new Worker<OrchestrationJob>(
  'orchestration',
  async (job: Job<OrchestrationJob>) => {
    console.log(`Processing job ${job.id}: ${job.data.type}`);

    try {
      switch (job.data.type) {
        case 'start_conversation':
          await handleStartConversation(job.data);
          break;
        case 'next_turn':
          await handleNextTurn(job.data);
          break;
        case 'process_interjection':
          await handleProcessInterjection(job.data);
          break;
        case 'force_agreement_phase':
          await handleForceAgreementPhase(job.data);
          break;
        case 'resume_conversation':
          await handleResumeConversation(job.data);
          break;
        default:
          console.error(`Unknown job type: ${(job.data as any).type}`);
      }
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      throw error; // Re-throw to trigger retry
    }
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

// Event handlers
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down worker...');
  await worker.close();
  await orchestrationQueue.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Startup validation
console.log('=====================================');
console.log('Orchestration Worker Starting...');
console.log('=====================================');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
console.log(`REDIS_URL present: ${!!process.env.REDIS_URL}`);
console.log(`OPENROUTER_API_KEY present: ${!!process.env.OPENROUTER_API_KEY}`);
console.log(`OPENROUTER_API_KEY starts with: ${process.env.OPENROUTER_API_KEY?.substring(0, 10)}...`);

if (!process.env.OPENROUTER_API_KEY) {
  console.error('WARNING: OPENROUTER_API_KEY is not set! AI generation will fail.');
}

console.log('=====================================');
console.log('Orchestration worker started');
console.log('Waiting for jobs...');
