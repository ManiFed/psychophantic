import { Queue } from 'bullmq';
import { redis } from './redis.js';

// Log queue initialization
console.log(`[Queue] Initializing orchestration queue, redis available: ${!!redis}`);

// Main orchestration queue for turn management
// Will be null if Redis is not available
export const orchestrationQueue: Queue | null = redis
  ? new Queue('orchestration', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs for debugging
        },
      },
    })
  : null;

console.log(`[Queue] orchestrationQueue created: ${!!orchestrationQueue}`);

// Job types
export type OrchestrationJobType =
  | 'start_conversation'
  | 'next_turn'
  | 'process_interjection'
  | 'force_agreement_phase'
  | 'resume_conversation';

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

// Helper functions to add jobs
// These throw an error if Redis is not available
export const queueHelpers = {
  async startConversation(conversationId: string, initialPrompt: string) {
    if (!orchestrationQueue) {
      throw new Error('Redis is required for conversation orchestration. Please configure REDIS_URL.');
    }
    return orchestrationQueue.add('start_conversation', {
      type: 'start_conversation',
      conversationId,
      initialPrompt,
    } satisfies StartConversationJob);
  },

  async nextTurn(conversationId: string) {
    if (!orchestrationQueue) {
      throw new Error('Redis is required for conversation orchestration. Please configure REDIS_URL.');
    }
    return orchestrationQueue.add('next_turn', {
      type: 'next_turn',
      conversationId,
    } satisfies NextTurnJob);
  },

  async processInterjection(conversationId: string, content: string) {
    if (!orchestrationQueue) {
      throw new Error('Redis is required for conversation orchestration. Please configure REDIS_URL.');
    }
    return orchestrationQueue.add('process_interjection', {
      type: 'process_interjection',
      conversationId,
      content,
    } satisfies ProcessInterjectionJob);
  },

  async forceAgreementPhase(conversationId: string, phase: number) {
    if (!orchestrationQueue) {
      throw new Error('Redis is required for conversation orchestration. Please configure REDIS_URL.');
    }
    return orchestrationQueue.add('force_agreement_phase', {
      type: 'force_agreement_phase',
      conversationId,
      phase,
    } satisfies ForceAgreementPhaseJob);
  },

  async resumeConversation(conversationId: string) {
    if (!orchestrationQueue) {
      throw new Error('Redis is required for conversation orchestration. Please configure REDIS_URL.');
    }
    return orchestrationQueue.add('resume_conversation', {
      type: 'resume_conversation',
      conversationId,
    } satisfies ResumeConversationJob);
  },
};
