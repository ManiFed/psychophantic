import { create } from 'zustand';
import { arenaApi, ArenaRoomWithDetails, ArenaRoomFull } from '@/lib/api';
import { useAuthStore } from './auth';

interface ArenaState {
  rooms: ArenaRoomWithDetails[];
  currentRoom: ArenaRoomFull | null;
  isLoading: boolean;
  error: string | null;

  fetchRooms: () => Promise<void>;
  fetchRoom: (id: string) => Promise<void>;
  createRoom: (data: { title: string; topic: string; maxParticipants?: number; totalRounds?: number }) => Promise<string>;
  joinRoom: (roomId: string, agentId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  toggleReady: (roomId: string) => Promise<void>;
  startRoom: (roomId: string) => Promise<string>;
  sendInstruction: (roomId: string, content: string) => Promise<{ confirmed: boolean }>;
  closeRoom: (roomId: string) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  clearError: () => void;
}

export const useArenaStore = create<ArenaState>()((set, get) => ({
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,

  fetchRooms: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const response = await arenaApi.list(token);
      set({ rooms: response.rooms, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch arenas', isLoading: false });
    }
  },

  fetchRoom: async (id: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const response = await arenaApi.get(token, id);
      set({ currentRoom: response.room, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch arena', isLoading: false });
    }
  },

  createRoom: async (data) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error('Not authenticated');

    const response = await arenaApi.create(token, data);
    set((state) => ({ rooms: [response.room, ...state.rooms] }));
    return response.room.id;
  },

  joinRoom: async (roomId, agentId) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error('Not authenticated');

    await arenaApi.join(token, roomId, agentId);
    await get().fetchRoom(roomId);
  },

  leaveRoom: async (roomId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    await arenaApi.leave(token, roomId);
    await get().fetchRoom(roomId);
  },

  toggleReady: async (roomId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    await arenaApi.ready(token, roomId);
    await get().fetchRoom(roomId);
  },

  startRoom: async (roomId) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error('Not authenticated');

    const response = await arenaApi.start(token, roomId);
    await get().fetchRoom(roomId);
    return response.conversationId;
  },

  sendInstruction: async (roomId, content) => {
    const token = useAuthStore.getState().token;
    if (!token) return { confirmed: false };

    const response = await arenaApi.instruct(token, roomId, content);
    return { confirmed: response.confirmed ?? true };
  },

  closeRoom: async (roomId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    await arenaApi.close(token, roomId);
    await get().fetchRoom(roomId);
  },

  deleteRoom: async (roomId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    await arenaApi.delete(token, roomId);
    set((state) => ({ rooms: state.rooms.filter((r) => r.id !== roomId) }));
  },

  clearError: () => set({ error: null }),
}));
