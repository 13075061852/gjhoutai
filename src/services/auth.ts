export type AppRole = 'system_admin' | 'sales_manager' | 'lab_engineer' | 'warehouse_manager';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  mustChangePassword: boolean;
}

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');
const buildUrl = (path: string) => `${API_BASE}${path}`;

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export const authClient = {
  async me(): Promise<AppUser | null> {
    const payload = await request<{ user: AppUser }>('/api/auth/me');
    return payload?.user ?? null;
  },
  async login(username: string, password: string): Promise<AppUser | null> {
    const payload = await request<{ user: AppUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return payload?.user ?? null;
  },
  async logout(): Promise<boolean> {
    const payload = await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' });
    return Boolean(payload?.ok);
  },
  async changePassword(currentPassword: string, nextPassword: string): Promise<boolean> {
    const payload = await request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    return Boolean(payload?.ok);
  },
};
