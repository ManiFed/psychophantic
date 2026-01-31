import { create } from 'zustand';
import { conversationsApi, Conversation, Message, Participant, CreateConversationData } from '@/lib/api';
import { useAuthStore } from './auth';

interface ConversationsState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  participants: Participant[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchConversations: () => Promise<void>;
  fetchConversation: (id: string) => Promise<void>;
  createConversation: (data: CreateConversationData) => Promise<Conversation>;
  startConversation: (id: string) => Promise<void>;
  pauseConversation: (id: string) => Promise<void>;
  resumeConversation: (id: string) => Promise<void>;
  addInterjection: (id: string, content: string) => Promise<void>;
  startForceAgreement: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  updateConversationStatus: (status: Conversation['status']) => void;
  clearError: () => void;
}

export const useConversationsStore = create<ConversationsState>()((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  participants: [],
  isLoading: false,
  error: null,

  fetchConversations: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: 'Not authenticated' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await conversationsApi.list(token);
      set({ conversations: response.conversations, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conversations';
      set({ error: message, isLoading: false });
    }
  },

  fetchConversation: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: 'Not authenticated' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await conversationsApi.get(token, id);
      set({
        currentConversation: response.conversation,
        messages: response.messages,
        participants: response.participants,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conversation';
      set({ error: message, isLoading: false });
    }
  },

  createConversation: async (data: CreateConversationData) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    set({ isLoading: true, error: null });
    try {
      const response = await conversationsApi.create(token, data);
      const newConversation = response.conversation;
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
        currentConversation: newConversation,
        isLoading: false,
      }));
      return newConversation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create conversation';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  startConversation: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await conversationsApi.start(token, id);
      set((state) => ({
        currentConversation: state.currentConversation
          ? { ...state.currentConversation, status: 'active' as const }
          : null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start conversation';
      set({ error: message });
      throw err;
    }
  },

  pauseConversation: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await conversationsApi.pause(token, id);
      set((state) => ({
        currentConversation: state.currentConversation
          ? { ...state.currentConversation, status: 'paused' as const }
          : null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pause conversation';
      set({ error: message });
      throw err;
    }
  },

  resumeConversation: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await conversationsApi.resume(token, id);
      set((state) => ({
        currentConversation: state.currentConversation
          ? { ...state.currentConversation, status: 'active' as const }
          : null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume conversation';
      set({ error: message });
      throw err;
    }
  },

  addInterjection: async (id: string, content: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await conversationsApi.interject(token, id, content);
      set((state) => ({
        messages: [...state.messages, response.message],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add interjection';
      set({ error: message });
      throw err;
    }
  },

  startForceAgreement: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await conversationsApi.forceAgreement(token, id);
      set((state) => ({
        currentConversation: state.currentConversation
          ? { ...state.currentConversation, status: 'force_agreement' as const }
          : null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start force agreement';
      set({ error: message });
      throw err;
    }
  },

  deleteConversation: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await conversationsApi.delete(token, id);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversation:
          state.currentConversation?.id === id ? null : state.currentConversation,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete conversation';
      set({ error: message });
      throw err;
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      // Prevent duplicate messages
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return { messages: [...state.messages, message] };
    });
  },

  updateMessage: (messageId: string, updates: Partial<Message>) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    }));
  },

  setCurrentConversation: (conversation: Conversation | null) => {
    set({ currentConversation: conversation });
  },

  updateConversationStatus: (status: Conversation['status']) => {
    set((state) => ({
      currentConversation: state.currentConversation
        ? { ...state.currentConversation, status }
        : null,
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));
