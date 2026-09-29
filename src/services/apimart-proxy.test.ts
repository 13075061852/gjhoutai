import { afterEach, expect, it, vi } from 'vitest';
import { requestApimart } from './apimart-proxy';

afterEach(() => vi.unstubAllGlobals());
it('keeps the API key out of URLs and forwards task GET through the authenticated Worker', async () => {
  const fetchMock = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  await requestApimart({ baseUrl: 'https://api.apimart.ai/v1', path: '/tasks/task_1', method: 'GET', apiKey: 'test-key' });
  expect(fetchMock).toHaveBeenCalledWith('/api/apimart/request', expect.objectContaining({
    method: 'POST', credentials: 'include', cache: 'no-store',
    body: JSON.stringify({ baseUrl: 'https://api.apimart.ai/v1', path: '/tasks/task_1', method: 'GET', apiKey: 'test-key' }),
  }));
});
