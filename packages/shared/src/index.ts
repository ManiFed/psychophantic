// Shared types and constants for Psychophant

// ============ Constants ============

export const DAILY_FREE_CREDITS_CENTS = 10; // $0.10
export const MAX_AGENTS_PER_CONVERSATION = 5;
export const MIN_AGENTS_PER_CONVERSATION = 2;
export const MAX_DEBATE_ROUNDS = 7;
export const MIN_DEBATE_ROUNDS = 1;
export const FORCE_AGREEMENT_MAX_ITERATIONS = 3;

// ============ Enums ============

export enum ConversationMode {
  DEBATE = 'debate',
  COLLABORATE = 'collaborate',
}

export enum ConversationStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FORCE_AGREEMENT = 'force_agreement',
}

export enum MessageRole {
  AGENT = 'agent',
  USER = 'user',
  SYSTEM = 'system',
  SYNTHESIZER = 'synthesizer',
}

export enum MessageType {
  STANDARD = 'standard',
  NON_NEGOTIABLES = 'non_negotiables',
  SYNTHESIS = 'synthesis',
  VOTE = 'vote',
  REVISION = 'revision',
  FORCED_RESOLUTION = 'forced_resolution',
}

export enum ForceAgreementPhase {
  IDLE = 0,
  COLLECTING_NON_NEGOTIABLES = 1,
  SYNTHESIZING = 2,
  VOTING = 3,
  REVISING = 4,
  COMPLETED = 5,
  FORCED_RESOLUTION = 6,
}

export enum CreditTransactionType {
  PURCHASE = 'purchase',
  USAGE = 'usage',
  DAILY_RESET = 'daily_reset',
  REFUND = 'refund',
}

// ============ SSE Event Types ============

export enum SSEEventType {
  MESSAGE_START = 'message:start',
  MESSAGE_TOKEN = 'message:token',
  MESSAGE_COMPLETE = 'message:complete',
  TURN_CHANGE = 'turn:change',
  ROUND_COMPLETE = 'round:complete',
  CONVERSATION_COMPLETE = 'conversation:complete',
  FORCE_AGREEMENT_PHASE = 'force_agreement:phase',
  COALITION_DETECTED = 'coalition:detected',
  CREDIT_UPDATE = 'credit:update',
  ERROR = 'error',
}

// ============ Types ============

export interface User {
  id: string;
  email: string;
  username: string | null;
  noRateLimit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Usernames that should have no rate limit (admin/VIP accounts)
// Add usernames here to bypass rate limiting
export const NO_RATE_LIMIT_USERNAMES: string[] = [
  // Example: 'admin', 'founder', 'vip_user'
];

export interface Agent {
  id: string;
  userId: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string | null;
  avatarColor: string;
  isTemplate: boolean;
  templateUses: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  totalRounds: number | null;
  currentRound: number;
  forceAgreementState: ForceAgreementState | null;
  parentConversationId: string | null;
  branchPointMessageId: string | null;
  isPublic: boolean;
  publicSlug: string | null;
  totalCostCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  agentId: string | null;
  userId: string | null;
  content: string;
  role: MessageRole;
  roundNumber: number | null;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number;
  generationTimeMs: number | null;
  messageType: MessageType;
  createdAt: Date;
}

export interface CreditBalance {
  userId: string;
  freeCreditsCents: number;
  purchasedCreditsCents: number;
  lastFreeReset: Date;
  updatedAt: Date;
}

export interface ForceAgreementState {
  phase: ForceAgreementPhase;
  iteration: number;
  maxIterations: number;
  nonNegotiables: Record<string, string[]>;
  currentSynthesis: string | null;
  votes: Record<string, 'approve' | 'reject' | null>;
  rejectionReasons: Record<string, string>;
  history: SynthesisAttempt[];
}

export interface SynthesisAttempt {
  iteration: number;
  synthesis: string;
  votes: Record<string, 'approve' | 'reject'>;
  rejectionReasons: Record<string, string>;
}

// ============ API Request/Response Types ============

export interface CreateAgentRequest {
  name: string;
  model: string;
  role: string;
  systemPrompt?: string;
  avatarColor?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  model?: string;
  role?: string;
  systemPrompt?: string;
  avatarColor?: string;
}

export interface CreateConversationRequest {
  mode: ConversationMode;
  agentIds: string[];
  totalRounds?: number;
  title?: string;
  initialPrompt: string;
}

export interface InterjectionRequest {
  content: string;
}

export interface CreditBalanceResponse {
  freeCents: number;
  purchasedCents: number;
  totalCents: number;
  lastFreeReset: string;
}

export interface PurchaseCreditsRequest {
  packageId: string;
}

export interface PurchaseCreditsResponse {
  clientSecret: string;
}

// ============ SSE Event Data Types ============

export interface MessageStartEvent {
  agentId: string;
  messageId: string;
}

export interface MessageTokenEvent {
  messageId: string;
  token: string;
  tokenIndex: number;
}

export interface MessageCompleteEvent {
  messageId: string;
  fullContent: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface TurnChangeEvent {
  nextAgentId: string;
  agentName: string;
  round: number;
}

export interface CreditUpdateEvent {
  freeCents: number;
  purchasedCents: number;
  totalCents: number;
}

export interface ForceAgreementPhaseEvent {
  phase: ForceAgreementPhase;
  phaseLabel: string;
  description: string;
  data?: unknown;
}

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

// ============ OpenRouter Models ============

export const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', provider: 'Meta' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', provider: 'Google' },
  { id: 'google/gemini-flash-1.5', name: 'Gemini 1.5 Flash', provider: 'Google' },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]['id'];

// ============ Credit Packages ============

export const CREDIT_PACKAGES = {
  pack_100: { cents: 100, priceCents: 100, name: '$1.00 Credit Pack', bonus: 0 },
  pack_500: { cents: 550, priceCents: 500, name: '$5.00 Credit Pack', bonus: 10 },
  pack_2000: { cents: 2400, priceCents: 2000, name: '$20.00 Credit Pack', bonus: 20 },
  pack_5000: { cents: 6500, priceCents: 5000, name: '$50.00 Credit Pack', bonus: 30 },
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;
