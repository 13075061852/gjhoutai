import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../utils/fetch';

const API_BASE = String(import.meta.env.VITE_STORAGE_API_BASE || '').replace(/\/+$/, '');
export type ApimartProxyRequest = {
  baseUrl: string; path: string; apiKey: string;
  method?: 'GET' | 'POST'; payload?: Record<string, unknown>;
};
export const requestApimart = (request: ApimartProxyRequest, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) =>
  fetchWithTimeout(`${API_BASE}/api/apimart/request`, {
    method: 'POST', credentials: 'include', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
  }, timeoutMs);
