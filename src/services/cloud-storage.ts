import { parseJsonMaybe } from '../utils/json';
import { fetchWithTimeout, UPLOAD_FETCH_TIMEOUT_MS } from '../utils/fetch';

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');

const buildUrl = (path: string) => `${API_BASE}${path}`;

const dataUrlToBlob = (dataUrl: string): Blob => {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error('Invalid data URL');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
};

const parseJson = async <T>(response: Response): Promise<T | null> => {
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Storage request failed: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.trim()) return null;
  const payload = parseJsonMaybe<T>(text);
  if (payload == null) {
    throw new Error('Storage response is not valid JSON');
  }
  return payload;
};

export const cloudStorage = {
  async getJson<T>(key: string): Promise<T | null> {
    const response = await fetchWithTimeout(buildUrl(`/api/state/${encodeURIComponent(key)}`), { credentials: 'include' });
    const payload = await parseJson<{ value: T }>(response);
    return payload?.value ?? null;
  },

  async putJson<T>(key: string, value: T extends null ? never : T): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/state/${encodeURIComponent(key)}`), {
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

  async deleteJson(key: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/state/${encodeURIComponent(key)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async getDataUrl(namespace: string, key: string): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), { credentials: 'include' });
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
      const blob = dataUrlToBlob(dataUrl);
      const upload = await fetchWithTimeout(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': blob.type || 'application/octet-stream' },
        body: blob,
      }, UPLOAD_FETCH_TIMEOUT_MS);
      return upload.ok;
    } catch {
      return false;
    }
  },

  async deleteBlob(namespace: string, key: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/blob/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`), {
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
      const response = await fetchWithTimeout(buildUrl(`/api/data-recognition/history?limit=${encodeURIComponent(String(limit))}`), {
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
      const response = await fetchWithTimeout(buildUrl('/api/data-recognition/history'), {
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
      const response = await fetchWithTimeout(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
        credentials: 'include',
      });
      const payload = await parseJson<{ item: any }>(response);
      if (!payload?.item) return null;
      const imageResponse = await fetchWithTimeout(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}/image`), {
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
      const response = await fetchWithTimeout(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
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
      const response = await fetchWithTimeout(buildUrl(`/api/data-recognition/history/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async listInspectionReports(limit = 100): Promise<any[] | null> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/inspection-reports?limit=${encodeURIComponent(String(limit))}`), {
        credentials: 'include',
      });
      const payload = await parseJson<{ items: any[] }>(response);
      return Array.isArray(payload?.items) ? payload.items : null;
    } catch {
      return null;
    }
  },

  async createInspectionReport(payload: {
    file: File;
    title?: string;
    category?: string;
    notes?: string;
  }): Promise<{ id: string } | null> {
    try {
      const form = new FormData();
      form.append('file', payload.file);
      form.append('title', payload.title || '');
      form.append('category', payload.category || '');
      form.append('notes', payload.notes || '');
      const response = await fetchWithTimeout(buildUrl('/api/inspection-reports'), {
        method: 'POST',
        credentials: 'include',
        body: form,
      }, UPLOAD_FETCH_TIMEOUT_MS);
      return await parseJson<{ id: string }>(response);
    } catch {
      return null;
    }
  },

  getInspectionReportFileUrl(id: string): string {
    return buildUrl(`/api/inspection-reports/${encodeURIComponent(id)}/file`);
  },

  async deleteInspectionReport(id: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(buildUrl(`/api/inspection-reports/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
