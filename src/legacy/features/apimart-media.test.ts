// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIMART_DEFAULT_BASE_URL } from '../../services/apimart';
import { requestApimart } from '../../services/apimart-proxy';

vi.mock('../../services/apimart-proxy', () => ({ requestApimart: vi.fn() }));
vi.mock('../../components/reactbits/ApimartReactBitsShowcase', () => ({ mountApimartReactBitsShowcase: () => () => {} }));

let app: any;
let saved: any[];
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  saved = [{ id: 'legacy_1', provider: 'liblibai', type: 'image', status: 'processing', prompt: '旧任务' }];
  app = {
    refs: {}, constants: { DEFAULT_CONFIG: {}, DEFAULT_APIMART_BASE_URL: APIMART_DEFAULT_BASE_URL },
    config: { getFormConfig: () => ({ apimartApiKey: 'test-key', apimartBaseUrl: APIMART_DEFAULT_BASE_URL }) },
    utils: { escapeHtml: String, normalizeBaseUrl: (url: string) => url,
      readJson: () => saved, writeJson: (_key: string, value: any[]) => { saved = value; } },
  };
  window.GJHApp = app;
  await import('./apimart-media');
  app.apimartMedia.init();
});
afterEach(() => { app.apimartMedia.cleanup(); vi.restoreAllMocks(); });

describe('APIMart media lifecycle', () => {
  it('tracks every returned task, polls result URLs and preserves old provider history', async () => {
    vi.mocked(requestApimart).mockImplementation(async request => new Response(JSON.stringify(request.method === 'GET'
      ? { code: 200, data: { id: request.path.split('/').pop(), status: 'completed', progress: 100, cost: 0.15, result: { images: [{ url: ['https://example.com/result.png'] }] } } }
      : { code: 200, data: [{ task_id: 'task_a' }, { task_id: 'task_b' }] }), { headers: { 'content-type': 'application/json' } }));
    const result = await app.apimartMedia.generateImage({ prompt: '产品', n: 2 });
    expect(result.createdIds).toEqual(['task_a', 'task_b']);
    await vi.waitFor(() => expect(saved.filter(task => task.provider === 'apimart').every(task => task.status === 'completed')).toBe(true));
    expect(saved.find(task => task.id === 'task_a')).toMatchObject({ progress: 100, cost: 0.15, images: ['https://example.com/result.png'] });
    expect(saved.find(task => task.id === 'legacy_1')?.status).toBe('processing');
    expect(vi.mocked(requestApimart).mock.calls.some(([request]) => request.path.includes('legacy_1'))).toBe(false);
  });
  it('does not substitute old Liblib credentials for the new API key', async () => {
    app.config.getFormConfig = () => ({ liblibAccessKey: 'old-access', liblibSecretKey: 'old-secret' });
    await expect(app.apimartMedia.generateImage({ prompt: 'test' })).rejects.toThrow('APIMart API Key');
    expect(requestApimart).not.toHaveBeenCalled();
  });
  it('handles completed video results', async () => {
    vi.mocked(requestApimart).mockImplementation(async request => new Response(JSON.stringify(request.method === 'GET'
      ? { code: 200, data: { status: 'completed', progress: 100, result: { videos: [{ url: ['https://example.com/result.mp4'] }] } } }
      : { code: 200, data: [{ task_id: 'video_1' }] })));
    await app.apimartMedia.generateVideo({ prompt: '视频', duration: 10, resolution: 'pro' });
    await vi.waitFor(() => expect(saved.find(task => task.id === 'video_1')?.videos).toEqual(['https://example.com/result.mp4']));
    expect(vi.mocked(requestApimart).mock.calls[0][0].payload).toMatchObject({ duration: 10, mode: 'pro' });
  });
  it('stops polling failed tasks and shows the upstream reason', async () => {
    vi.mocked(requestApimart).mockImplementation(async request => new Response(JSON.stringify(request.method === 'GET'
      ? { code: 200, data: { status: 'failed', error: { message: '生成失败，请修改提示词' } } }
      : { code: 200, data: [{ task_id: 'failed_1' }] })));
    await app.apimartMedia.generateImage({ prompt: 'test' });
    await vi.waitFor(() => expect(saved.find(task => task.id === 'failed_1')).toMatchObject({ status: 'failed', error: '生成失败，请修改提示词' }));
    expect(requestApimart).toHaveBeenCalledTimes(2);
  });
});
