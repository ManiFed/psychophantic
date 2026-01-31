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

  const headers: Record<string, string> = {};

  // Only set Content-Type if there's a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

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
  register: (email: string, password: string, username: string) =>
    fetchApi<{ user: { id: string; email: string; username: string | null }; token: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, username }),
      }
    ),

  login: (email: string, password: string) =>
    fetchApi<{ user: { id: string; email: string; username: string | null }; token: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    ),

  me: (token: string) =>
    fetchApi<{ user: { id: string; email: string; username: string | null; bio: string | null; avatarUrl: string | null; noRateLimit: boolean } }>('/api/auth/me', {
      token,
    }),
};

// Agents API
export const agentsApi = {
  list: (token: string) =>
    fetchApi<{ agents: Agent[] }>('/api/agents', { token }),

  listPublic: () =>
    fetchApi<{ agents: PublicAgent[] }>('/api/agents/public'),

  getModels: () =>
    fetchApi<{ models: OpenRouterModel[] }>('/api/agents/models'),

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

  clone: (token: string, id: string) =>
    fetchApi<{ agent: Agent }>(`/api/agents/${id}/clone`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
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
      body: JSON.stringify({}),
    }),

  pause: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}/pause`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  resume: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}/resume`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
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
        body: JSON.stringify({}),
      }
    ),

  delete: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/conversations/${id}`, {
      token,
      method: 'DELETE',
    }),
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
  avatarUrl: string | null;
  isTemplate: boolean;
  isPublic: boolean;
  templateUses: number;
  createdAt: string;
  updatedAt: string;
}

interface PublicAgent {
  id: string;
  name: string;
  model: string;
  role: string;
  avatarColor: string;
  avatarUrl: string | null;
  isTemplate: boolean;
  templateUses: number;
  createdAt: string;
  user: { email: string; username: string | null };
}

interface CreateAgentData {
  name: string;
  model: string;
  role: string;
  systemPrompt?: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
}

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
    promptPer1M?: number;
    completionPer1M?: number;
  };
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

// Profiles API
export const profilesApi = {
  updateProfile: (token: string, data: { username?: string; bio?: string; avatarUrl?: string | null }) =>
    fetchApi<{ user: { id: string; email: string; username: string | null; bio: string | null; avatarUrl: string | null; noRateLimit: boolean } }>(
      '/api/profiles/me',
      {
        token,
        method: 'PUT',
        body: JSON.stringify(data),
      }
    ),

  getPublicProfile: (username: string) =>
    fetchApi<{
      user: PublicProfileUser;
      agents: PublicAgent[];
      conversations: PublicConversation[];
    }>(`/api/profiles/${username}`),

  follow: (token: string, userId: string) =>
    fetchApi<{ success: boolean }>(`/api/profiles/${userId}/follow`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  unfollow: (token: string, userId: string) =>
    fetchApi<{ success: boolean }>(`/api/profiles/${userId}/follow`, {
      token,
      method: 'DELETE',
    }),

  getFollowers: (userId: string) =>
    fetchApi<{ users: FollowUser[] }>(`/api/profiles/${userId}/followers`),

  getFollowing: (userId: string) =>
    fetchApi<{ users: FollowUser[] }>(`/api/profiles/${userId}/following`),
};

// Forum API
export const forumApi = {
  listThreads: (page?: number) =>
    fetchApi<{ threads: ForumThread[]; total: number; page: number; totalPages: number }>(
      `/api/forum/threads${page ? `?page=${page}` : ''}`
    ),

  getThread: (id: string) =>
    fetchApi<{ thread: ForumThreadFull }>(`/api/forum/threads/${id}`),

  createThread: (token: string, data: { title: string; content: string }) =>
    fetchApi<{ thread: ForumThread }>('/api/forum/threads', {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createPost: (token: string, threadId: string, content: string) =>
    fetchApi<{ post: ForumPostData }>(`/api/forum/threads/${threadId}/posts`, {
      token,
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  deleteThread: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/forum/threads/${id}`, {
      token,
      method: 'DELETE',
    }),
};

// Feed API
export const feedApi = {
  getFeed: () =>
    fetchApi<FeedData>('/api/feed'),
};

// Agent Profiles API
export const agentProfilesApi = {
  getProfile: (agentId: string) =>
    fetchApi<{
      agent: AgentProfile;
      conversations: PublicConversation[];
    }>(`/api/agents/${agentId}/profile`),

  addToLibrary: (token: string, agentId: string) =>
    fetchApi<{ agent: Agent }>(`/api/agents/${agentId}/clone`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  remix: (token: string, agentId: string, overrides?: { name?: string; role?: string; systemPrompt?: string; model?: string }) =>
    fetchApi<{ agent: Agent }>(`/api/agents/${agentId}/remix`, {
      token,
      method: 'POST',
      body: JSON.stringify(overrides || {}),
    }),
};

// Additional types
interface AgentProfile {
  id: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  isPublic: boolean;
  isTemplate: boolean;
  templateUses: number;
  createdAt: string;
  creatorUsername: string | null;
}

interface PublicConversation {
  id: string;
  title: string | null;
  mode: string;
  status: string;
  totalRounds: number | null;
  currentRound: number;
  isPublic: boolean;
  publicSlug: string | null;
  totalCostCents: number;
  createdAt: string;
  updatedAt: string;
  participants: {
    id: string;
    agent: {
      id: string;
      name: string;
      avatarColor: string;
      avatarUrl: string | null;
    };
  }[];
  _count: { messages: number };
}

// Arena API
export const arenaApi = {
  list: (token: string) =>
    fetchApi<{ rooms: ArenaRoomWithDetails[] }>('/api/arena', { token }),

  get: (token: string, id: string) =>
    fetchApi<{ room: ArenaRoomFull }>(`/api/arena/${id}`, { token }),

  create: (token: string, data: CreateArenaData) =>
    fetchApi<{ room: ArenaRoomWithDetails }>('/api/arena', {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  join: (token: string, id: string, agentId: string) =>
    fetchApi<{ participant: ArenaParticipantWithDetails }>(`/api/arena/${id}/join`, {
      token,
      method: 'POST',
      body: JSON.stringify({ agentId }),
    }),

  leave: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/arena/${id}/leave`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  ready: (token: string, id: string) =>
    fetchApi<{ participant: ArenaParticipantWithDetails }>(`/api/arena/${id}/ready`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  start: (token: string, id: string) =>
    fetchApi<{ conversationId: string }>(`/api/arena/${id}/start`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  instruct: (token: string, id: string, content: string) =>
    fetchApi<{ instruction: ArenaInstructionData; confirmed: boolean }>(`/api/arena/${id}/instruct`, {
      token,
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  close: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/arena/${id}/close`, {
      token,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  delete: (token: string, id: string) =>
    fetchApi<{ success: boolean }>(`/api/arena/${id}`, {
      token,
      method: 'DELETE',
    }),
};

// Arena Types
interface CreateArenaData {
  title: string;
  topic: string;
  maxParticipants?: number;
  totalRounds?: number;
}

interface ArenaRoomBase {
  id: string;
  title: string;
  topic: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  maxParticipants: number;
  totalRounds: number;
  createdById: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ArenaRoomWithDetails extends ArenaRoomBase {
  createdBy: { id: string; email: string; username: string | null };
  participants: ArenaParticipantWithDetails[];
  _count: { participants: number };
}

interface ArenaRoomFull extends ArenaRoomBase {
  createdBy: { id: string; email: string; username: string | null };
  participants: ArenaParticipantWithDetails[];
  conversation: (Conversation & { messages: Message[]; participants: Participant[] }) | null;
  instructions: ArenaInstructionData[];
}

interface ArenaParticipantWithDetails {
  id: string;
  arenaRoomId: string;
  userId: string;
  agentId: string;
  isReady: boolean;
  joinedAt: string;
  user: { id: string; email: string; username: string | null };
  agent: { id: string; name: string; avatarColor: string; avatarUrl: string | null; model?: string; role?: string };
}

interface ArenaInstructionData {
  id: string;
  arenaRoomId: string;
  userId: string;
  agentId: string;
  content: string;
  roundNumber: number | null;
  applied: boolean;
  createdAt: string;
}

// Profile types
interface UserBadge {
  type: 'verified' | 'staff';
  label: string;
}

interface PublicProfileUser {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  badges: UserBadge[];
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  agentCount: number;
  conversationCount: number;
}

interface FollowUser {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  badges: UserBadge[];
}

// Forum types
interface ForumThread {
  id: string;
  userId: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string | null; avatarUrl: string | null; badges?: UserBadge[] };
  _count: { posts: number };
}

interface ForumPostData {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string | null; avatarUrl: string | null; badges?: UserBadge[] };
}

interface ForumThreadFull extends ForumThread {
  posts: ForumPostData[];
}

// Feed types
interface FeedData {
  trendingAgents: (PublicAgent & { user: { id: string; username: string | null; badges?: UserBadge[] } | null })[];
  trendingConversations: (PublicConversation & { user: { id: string; username: string | null; badges?: UserBadge[] } | null })[];
  activeArenas: ArenaRoomWithDetails[];
  recentThreads: ForumThread[];
}

export { ApiError };
export type {
  Agent,
  PublicAgent,
  CreateAgentData,
  OpenRouterModel,
  Conversation,
  CreateConversationData,
  Message,
  Participant,
  CreditTransaction,
  AgentProfile,
  PublicConversation,
  ArenaRoomBase,
  ArenaRoomWithDetails,
  ArenaRoomFull,
  ArenaParticipantWithDetails,
  ArenaInstructionData,
  CreateArenaData,
  UserBadge,
  PublicProfileUser,
  FollowUser,
  ForumThread,
  ForumPostData,
  ForumThreadFull,
  FeedData,
};
