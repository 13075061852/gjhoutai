const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');

const buildUrl = (path: string) => `${API_BASE}${path}`;

const parseJson = async <T>(response: Response): Promise<T | null> => {
  if (!response.ok) return null;
  return response.json() as Promise<T>;
};

export const cloudStorage = {
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const response = await fetch(buildUrl(`/api/state/${encodeURIComponent(key)}`), { credentials: 'include' });
      const payload = await parseJson<{ value: T }>(response);
      return payload?.value ?? null;
    } catch {
      return null;
    }
  },

  async putJson<T>(key: string, value: T): Promise<boolean> {
    try {
      const response = await fetch(buildUrl(`/api/state/${encodeURIComponent(key)}`), {
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

  async getDataUrl(namespace: string, key: string): Promise<string | null> {
    try {
      const response = await fetch(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), { credentials: 'include' });
      if (response.status === 204) return null;
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : null));
        reader.addEventListener('error', () => resolve(null));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  },

  async putDataUrl(namespace: string, key: string, dataUrl: string): Promise<boolean> {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const upload = await fetch(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': blob.type || 'application/octet-stream' },
        body: blob,
      });
      return upload.ok;
    } catch {
      return false;
    }
  },

  async deleteBlob(namespace: string, key: string): Promise<boolean> {
    try {
      const response = await fetch(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
