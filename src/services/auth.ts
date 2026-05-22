export type AppDepartment = '系统管理员' | '研发部' | '测试部' | '销售部' | '生产部' | '生产部主管';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  department: AppDepartment;
  mustChangePassword: boolean;
}

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');
const buildUrl = (path: string) => `${API_BASE}${path}`;
const currentDepartment = () => (typeof window === 'undefined' ? '' : String(window.GJHApp?.currentUser?.department || ''));
const canManageUsers = () => currentDepartment() === '系统管理员';
const SESSION_MARKER_COOKIE = 'gjh_session_present';
const SESSION_MARKER_STORAGE_KEY = 'gjh-auth-session-present';
const isSameOriginApi = () => {
  if (typeof window === 'undefined' || !API_BASE) return true;
  try {
    return new URL(API_BASE, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};
const hasSessionMarker = () => {
  if (typeof window === 'undefined') return true;
  if (localStorage.getItem(SESSION_MARKER_STORAGE_KEY) === '1') return true;
  if (!isSameOriginApi() || typeof document === 'undefined') return false;
  return document.cookie.split(';').some((cookie) => cookie.trim().startsWith(`${SESSION_MARKER_COOKIE}=`));
};
const rememberSessionMarker = () => {
  if (typeof window !== 'undefined') localStorage.setItem(SESSION_MARKER_STORAGE_KEY, '1');
};
const clearSessionMarker = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(SESSION_MARKER_STORAGE_KEY);
};

async function requestAuthMe(): Promise<AppUser | null> {
  const response = await fetch(buildUrl('/api/auth/me'), {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`auth_me_failed_${response.status}`);
  const payload = await response.json() as { user?: AppUser };
  return payload.user ?? null;
}

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
  hasSessionMarker,
  async me(): Promise<AppUser | null> {
    if (!hasSessionMarker()) return null;
    const user = await requestAuthMe();
    if (!user) clearSessionMarker();
    return user;
  },
  async login(username: string, password: string): Promise<AppUser | null> {
    const payload = await request<{ user: AppUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const user = payload?.user ?? null;
    if (user) rememberSessionMarker();
    return user;
  },
  async logout(): Promise<boolean> {
    const payload = await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' });
    clearSessionMarker();
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
  async createUser(input: { username: string; displayName: string; department: AppDepartment; password: string }): Promise<boolean> {
    const response = await fetch(buildUrl('/api/users'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok;
  },
  async listUsers(): Promise<Array<{ id: string; username: string; display_name: string; department: AppDepartment }>> {
    if (!canManageUsers()) return [];
    const payload = await request<{ users: Array<{ id: string; username: string; display_name: string; department: AppDepartment }> }>('/api/users');
    return payload?.users ?? [];
  },
  async updateUser(id: string, input: { username?: string; displayName: string; department: AppDepartment; password?: string }): Promise<boolean> {
    const response = await fetch(buildUrl(`/api/users/${encodeURIComponent(id)}`), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok;
  },
};
