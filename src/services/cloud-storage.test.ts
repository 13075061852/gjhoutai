// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudStorage } from './cloud-storage';

afterEach(() => { vi.unstubAllGlobals(); });

describe('batched state and optimized image reads', () => {
  it('requests a batch once with credentials and rejects incomplete results', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ values: { a: 'value', b: null } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: { a: 'value' } })));
    vi.stubGlobal('fetch', fetcher);
    expect(await cloudStorage.getJsonBatch(['a', 'b', 'a'])).toEqual({ a: 'value', b: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(url, 'https://test').searchParams.getAll('key')).toEqual(['a', 'b']);
    expect(init.credentials).toBe('include');
    await expect(cloudStorage.getJsonBatch(['a', 'b'])).rejects.toThrow('Incomplete');
  });

  it('never treats forbidden batches as empty records or falls back', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(cloudStorage.getJsonBatch(['a'])).rejects.toThrow('403');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('negotiates WebP for display, but explicitly retains originals for exports', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await cloudStorage.getDataUrl('spectrum', 'chart', true);
    expect(fetcher.mock.calls[0][1].headers.Accept).toBe('image/webp');
    await cloudStorage.getDataUrl('spectrum', 'chart');
    expect(fetcher.mock.calls[1][0]).toContain('?format=original');
    expect(fetcher.mock.calls[1][1].headers.Accept).toBe('*/*');
  });
});
