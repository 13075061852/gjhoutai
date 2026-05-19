const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');

const buildUrl = (path: string) => `${API_BASE}${path}`;
const currentRole = () => (typeof window === 'undefined' ? '' : String(window.GJHApp?.currentUser?.role || ''));
const shouldSkipAdminConfigRequest = () => {
  const role = currentRole();
  return Boolean(role && role !== 'system_admin');
};

async function parseJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export const cloudConfig = {
  async get<T>(): Promise<T | null> {
    if (shouldSkipAdminConfigRequest()) return null;
    try {
      const response = await fetch(buildUrl('/api/config'), { credentials: 'include' });
      const payload = await parseJson<{ value: T | null }>(response);
      return payload?.value ?? null;
    } catch {
      return null;
    }
  },

  async put<T>(value: T): Promise<boolean> {
    try {
      const response = await fetch(buildUrl('/api/config'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async clear(): Promise<boolean> {
    try {
      const response = await fetch(buildUrl('/api/config'), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
