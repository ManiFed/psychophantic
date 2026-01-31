import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import { authApi } from '@/lib/api';

interface User {
  id: string;
  email: string;
  username: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  noRateLimit?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  // Persist auth with a TTL so users stay signed in for a limited time
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(email, password);
          set({
            user: response.user,
            token: response.token,
            isLoading: false,
          });
        } catch (err) {
          let message = 'Login failed';
          if (err instanceof TypeError && err.message === 'Failed to fetch') {
            message = 'Unable to connect to server. The API service may be starting up - please try again in a moment.';
          } else if (err instanceof Error) {
            message = err.message;
          }
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      register: async (email: string, password: string, username: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register(email, password, username);
          set({
            user: response.user,
            token: response.token,
            isLoading: false,
          });
        } catch (err) {
          let message = 'Registration failed';
          if (err instanceof TypeError && err.message === 'Failed to fetch') {
            message = 'Unable to connect to server. The API service may be starting up - please try again in a moment.';
          } else if (err instanceof Error) {
            message = err.message;
          }
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: () => {
        set({ user: null, token: null, error: null });
      },

      checkAuth: async () => {
        const token = get().token;
        if (!token) {
          set({ user: null });
          return;
        }

        try {
          const response = await authApi.me(token);
          set({ user: response.user });
        } catch {
          // Token invalid, clear auth state
          set({ user: null, token: null });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'psychophant-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      storage: (() => {
        const AUTH_TTL_MS = 1000 * 60 * 60 * 24 * 7;
        return {
          getItem: (name) => {
            if (typeof window === 'undefined') return null;
            const raw = window.localStorage.getItem(name);
            if (!raw) return null;
            const data = JSON.parse(raw) as { state: AuthState; version: number; expiresAt?: number };
            if (data.expiresAt && Date.now() > data.expiresAt) {
              window.localStorage.removeItem(name);
              return null;
            }
            return data;
          },
          setItem: (name, value) => {
            if (typeof window === 'undefined') return;
            const payload = { ...value, expiresAt: Date.now() + AUTH_TTL_MS };
            window.localStorage.setItem(name, JSON.stringify(payload));
          },
          removeItem: (name) => {
            if (typeof window === 'undefined') return;
            window.localStorage.removeItem(name);
          },
        } as PersistStorage<AuthState>;
      })(),
    }
  )
);
