// In production, NEXT_PUBLIC_API_URL must be set - never fall back to localhost
const getApiUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (url) {
    return url;
  }

  // In production, missing API URL is a configuration error
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'FATAL: NEXT_PUBLIC_API_URL is not set in production. ' +
      'The app will not function correctly. ' +
      'Please set NEXT_PUBLIC_API_URL in your Railway environment variables.'
    );
    // Return a URL that will clearly fail and be obvious in network logs
    return 'https://API_URL_NOT_CONFIGURED.invalid';
  }

  // Development fallback
  return 'http://localhost:3001';
};

const API_URL = getApiUrl();

interface FetchOptions extends RequestInit {
  token?: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge any additional headers from options
  if (options.headers) {
    const optHeaders = options.headers as Record<string, string>;
    Object.assign(headers, optHeaders);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.error || data?.message || 'An error occurred',
      response.status,
      data
    );
  }

  return data;
}

// Auth API
export const authApi = {
  register: (email: string, password: string) =>
    fetchApi<{ user: { id: string; email: string }; token: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    ),

  login: (email: string, password: string) =>
    fetchApi<{ user: { id: string; email: string }; token: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    ),

  me: (token: string) =>
    fetchApi<{ user: { id: string; email: string } }>('/api/auth/me', {
      token,
    }),
};

// Agents API
export const agentsApi = {
  list: (token: string) =>
    fetchApi<{ agents: Agent[] }>('/api/agents', { token }),

  create: (token: string, data: CreateAgentData) =>
    fetchApi<{ agent: Agent }>('/api/agents', {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (token: string, id: string, data: Partial<CreateAgentData>) =>
    fetchApi<{ agent: Agent }>(`/api/agents/${id}`, {
      token,
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/agents/${id}`, {
      token,
      method: 'DELETE',
    }),
};

// Conversations API
export const conversationsApi = {
  list: (token: string) =>
    fetchApi<{ conversations: Conversation[] }>('/api/conversations', { token }),

  get: (token: string, id: string) =>
    fetchApi<{ conversation: Conversation; messages: Message[]; participants: Participant[] }>(
      `/api/conversations/${id}`,
      { token }
    ),

  create: (token: string, data: CreateConversationData) =>
    fetchApi<{ conversation: Conversation }>('/api/conversations', {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  start: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}/start`, {
      token,
      method: 'POST',
    }),

  pause: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}/pause`, {
      token,
      method: 'POST',
    }),

  resume: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}/resume`, {
      token,
      method: 'POST',
    }),

  interject: (token: string, id: string, content: string) =>
    fetchApi<{ message: Message }>(`/api/conversations/${id}/interject`, {
      token,
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  forceAgreement: (token: string, id: string) =>
    fetchApi<{ success: boolean; phase: number }>(
      `/api/conversations/${id}/force-agreement`,
      {
        token,
        method: 'POST',
      }
    ),
};

// Credits API
export const creditsApi = {
  balance: (token: string) =>
    fetchApi<{ freeCents: number; purchasedCents: number; totalCents: number; lastFreeReset: string }>(
      '/api/credits/balance',
      { token }
    ),

  purchase: (token: string, packageId: string) =>
    fetchApi<{ clientSecret: string }>('/api/credits/purchase', {
      token,
      method: 'POST',
      body: JSON.stringify({ packageId }),
    }),

  transactions: (token: string) =>
    fetchApi<{ transactions: CreditTransaction[] }>('/api/credits/transactions', {
      token,
    }),
};

// Types
interface Agent {
  id: string;
  userId: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string | null;
  avatarColor: string;
  isTemplate: boolean;
  templateUses: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateAgentData {
  name: string;
  model: string;
  role: string;
  systemPrompt?: string;
  avatarColor?: string;
}

interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  mode: 'debate' | 'collaborate';
  status: 'active' | 'paused' | 'completed' | 'force_agreement';
  totalRounds: number | null;
  currentRound: number;
  isPublic: boolean;
  publicSlug: string | null;
  totalCostCents: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateConversationData {
  mode: 'debate' | 'collaborate';
  agentIds: string[];
  totalRounds?: number;
  title?: string;
  initialPrompt: string;
}

interface Message {
  id: string;
  conversationId: string;
  agentId: string | null;
  userId: string | null;
  content: string;
  role: 'agent' | 'user' | 'system' | 'synthesizer';
  roundNumber: number | null;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number;
  generationTimeMs: number | null;
  messageType: string;
  createdAt: string;
}

interface Participant {
  id: string;
  conversationId: string;
  agentId: string;
  turnOrder: number;
  isActive: boolean;
  agent: Agent;
}

interface CreditTransaction {
  id: string;
  userId: string;
  amountCents: number;
  transactionType: string;
  sourceType: string | null;
  referenceId: string | null;
  description: string | null;
  balanceAfterCents: number;
  createdAt: string;
}

export { ApiError };
export type {
  Agent,
  CreateAgentData,
  Conversation,
  CreateConversationData,
  Message,
  Participant,
  CreditTransaction,
};
