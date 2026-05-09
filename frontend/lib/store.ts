import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  role: string;
  status: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

const STORAGE_KEY = 'careconnect-auth';

function loadFromStorage(): { user: User | null; token: string | null } {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    return { user: parsed.user ?? null, token: parsed.token ?? null };
  } catch {
    return { user: null, token: null };
  }
}

function saveToStorage(user: User, token: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } catch {}
}

function clearStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    saveToStorage(user, token);
    set({ user, token });
  },
  clearAuth: () => {
    clearStorage();
    set({ user: null, token: null });
  },
}));
