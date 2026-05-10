import { useAuthStore } from './store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getToken(): string | null {
  // Try in-memory store first (already hydrated)
  const inMemory = useAuthStore.getState().token;
  if (inMemory) return inMemory;
  // Fallback: read directly from localStorage before store is populated
  try {
    const raw = localStorage.getItem('careconnect-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Support both { token } and legacy { state: { token } } formats
      return parsed?.token ?? parsed?.state?.token ?? null;
    }
  } catch {}
  return null;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Clear stale auth and force re-login
    try {
      localStorage.removeItem('careconnect-auth');
      useAuthStore.getState().clearAuth();
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = '/login?session=expired';
    }
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const d = data as Record<string, unknown> | null;
    const message =
      (d && typeof d.message === 'string' && d.message) ||
      (d && typeof d.error === 'string' && d.error) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function get<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function put<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function patch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function del<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

export { apiRequest, ApiError };
