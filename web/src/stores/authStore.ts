import { create } from 'zustand';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { subscribeToNotifications } from '../lib/notifications';
import type { User } from '../lib/types';

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isPremium: () => boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    displayName?: string;
    phone: string;
    password: string;
    bio?: string;
    birthday?: string;
    avatar?: File;
  }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  loginWithToken: (token: string, user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Загружаем пользователя из localStorage при инициализации
  let savedUser: User | null = null;
  try {
    const savedUserStr = localStorage.getItem('nexo_user');
    if (savedUserStr) {
      savedUser = JSON.parse(savedUserStr);
    }
  } catch (e) {
    console.error('Failed to load user from localStorage:', e);
  }

  return {
    token: localStorage.getItem('nexo_token'),
    user: savedUser,
    isLoading: true,
    error: null,

  isPremium: () => {
    const user = get().user;
    if (!user || !user.isPremium || !user.premiumUntil) return false;
    return new Date(user.premiumUntil) > new Date();
  },

  login: async (phone, password) => {
    try {
      set({ error: null, isLoading: true });
      const { token, user } = await api.login(phone, password);
      localStorage.setItem('nexo_token', token);
      localStorage.setItem('nexo_user', JSON.stringify(user));
      api.setToken(token);
      connectSocket(token);
      set({ token, user, isLoading: false });
      
      // Auto-subscribe to notifications after login
      setTimeout(() => {
        subscribeToNotifications().catch(() => {});
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  register: async (data) => {
    try {
      set({ error: null, isLoading: true });
      const { token, user } = await api.register(data);
      localStorage.setItem('nexo_token', token);
      localStorage.setItem('nexo_user', JSON.stringify(user));
      api.setToken(token);
      connectSocket(token);
      set({ token, user, isLoading: false });
      
      // Auto-subscribe to notifications after register
      setTimeout(() => {
        subscribeToNotifications().catch(() => {});
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('nexo_token');
    localStorage.removeItem('nexo_user');
    api.setToken(null);
    disconnectSocket();
    // Unsubscribe from push notifications
    import('../lib/notifications').then(m => m.unsubscribeFromNotifications().catch(() => {}));
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) { set({ isLoading: false }); return; }
    try {
      api.setToken(token);
      const { user } = await api.getMe();
      localStorage.setItem('nexo_user', JSON.stringify(user));
      connectSocket(token);
      set({ user, isLoading: false });
      // Re-subscribe to push notifications on page refresh
      setTimeout(() => {
        import('../lib/notifications').then(m => m.subscribeToNotifications().catch(() => {}));
      }, 2000);
    } catch (err) {
      // Если 401 - токен недействителен, выходим
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
        localStorage.removeItem('nexo_token');
        localStorage.removeItem('nexo_user');
        api.setToken(null);
        set({ token: null, user: null, isLoading: false });
        return;
      }
      // Для других ошибок (429, сеть и т.д.) - просто показываем ошибку, но не выходим
      console.error('Auth check error:', err);
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Ошибка проверки авторизации' });
    }
  },

  updateUser: (data) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...data };
      set({ user: updatedUser });
      // Сохраняем обновлённого пользователя в localStorage
      try {
        localStorage.setItem('nexo_user', JSON.stringify(updatedUser));
      } catch (e) {
        console.error('Failed to save user to localStorage:', e);
      }
    }
  },

  loginWithToken: (token, user) => {
    localStorage.setItem('nexo_token', token);
    localStorage.setItem('nexo_user', JSON.stringify(user));
    api.setToken(token);
    connectSocket(token);
    set({ token, user });
    // Subscribe to push notifications after device auth
    setTimeout(() => {
      import('../lib/notifications').then(m => m.subscribeToNotifications().catch(() => {}));
    }, 2000);
  },
}});
