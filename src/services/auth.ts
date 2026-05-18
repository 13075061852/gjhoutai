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
  async getAvatarUrl(): Promise<string | null> {
    const response = await fetch(buildUrl('/api/profile/avatar'), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 204 || !response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  async uploadAvatar(file: File): Promise<boolean> {
    const response = await fetch(buildUrl('/api/profile/avatar'), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': file.type },
      body: file,
    });
    return response.ok;
  },
  async clearAvatar(): Promise<boolean> {
    const response = await fetch(buildUrl('/api/profile/avatar'), {
      method: 'DELETE',
      credentials: 'include',
    });
    return response.ok;
  },
  async createUser(input: { username: string; displayName: string; role: AppRole; password: string }): Promise<boolean> {
    const response = await fetch(buildUrl('/api/users'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok;
  },
  async listUsers(): Promise<Array<{ id: string; username: string; display_name: string; role: AppRole }>> {
    const payload = await request<{ users: Array<{ id: string; username: string; display_name: string; role: AppRole }> }>('/api/users');
    return payload?.users ?? [];
  },
  async updateUser(id: string, input: { displayName: string; role: AppRole; password?: string }): Promise<boolean> {
    const response = await fetch(buildUrl(`/api/users/${encodeURIComponent(id)}`), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok;
  },
};
