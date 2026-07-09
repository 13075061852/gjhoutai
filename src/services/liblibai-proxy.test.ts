import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLiblibAi } from './liblibai-proxy';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestLiblibAi', () => {
  it('uses the same-origin Worker route instead of calling LiblibAI from the browser', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0 }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await requestLiblibAi({
      baseUrl: 'https://openapi.liblibai.cloud',
      path: '/api/generate/status',
      accessKey: 'access-key',
      secretKey: 'secret-key',
      payload: { generateUuid: 'task-1' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe('/api/liblibai/request');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      baseUrl: 'https://openapi.liblibai.cloud',
      path: '/api/generate/status',
      accessKey: 'access-key',
      secretKey: 'secret-key',
      payload: { generateUuid: 'task-1' },
    });
  });
});
