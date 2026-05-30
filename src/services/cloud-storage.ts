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

  async listDataRecognitionHistory(limit = 40): Promise<any[] | null> {
    try {
      const response = await fetch(buildUrl(`/api/data-recognition/history?limit=${encodeURIComponent(String(limit))}`), {
        credentials: 'include',
      });
      const payload = await parseJson<{ items: any[] }>(response);
      return Array.isArray(payload?.items) ? payload.items : null;
    } catch {
      return null;
    }
  },

  async createDataRecognitionHistory(payload: {
    fileName: string;
    imageDataUrl: string;
    model: string;
    rowCount: number;
    modelCode?: string;
    batchCode?: string;
    result: unknown;
    rawText: string;
  }): Promise<{ id: string } | null> {
    try {
      const response = await fetch(buildUrl('/api/data-recognition/history'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await parseJson<{ id: string }>(response);
    } catch {
      return null;
    }
  },

  async getDataRecognitionHistory(id: string): Promise<any | null> {
    try {
      const response = await fetch(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
        credentials: 'include',
      });
      const payload = await parseJson<{ item: any }>(response);
      if (!payload?.item) return null;
      const imageResponse = await fetch(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}/image`), {
        credentials: 'include',
      });
      if (imageResponse.ok && imageResponse.status !== 204) {
        const blob = await imageResponse.blob();
        payload.item.imageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
          reader.addEventListener('error', () => resolve(''));
          reader.readAsDataURL(blob);
        });
      }
      return payload.item;
    } catch {
      return null;
    }
  },

  async updateDataRecognitionHistory(id: string, payload: {
    rowCount: number;
    modelCode?: string;
    batchCode?: string;
    result: unknown;
    rawText: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async deleteDataRecognitionHistory(id: string): Promise<boolean> {
    try {
      const response = await fetch(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
