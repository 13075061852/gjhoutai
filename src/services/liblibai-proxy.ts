import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../utils/fetch';

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');

export type LiblibAiProxyRequest = {
  baseUrl: string;
  path: string;
  accessKey: string;
  secretKey: string;
  payload: Record<string, unknown>;
};

export const requestLiblibAi = (
  request: LiblibAiProxyRequest,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
) => fetchWithTimeout(`${API_BASE}/api/liblibai/request`, {
  method: 'POST',
  credentials: 'include',
  cache: 'no-store',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify(request),
}, timeoutMs);
