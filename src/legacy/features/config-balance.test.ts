// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../services/cloud-config';
import { fetchWithTimeout } from '../../utils/fetch';
vi.mock('../../services/cloud-config', () => ({ cloudConfig: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../utils/fetch', () => ({ AI_FETCH_TIMEOUT_MS: 12000, fetchWithTimeout: vi.fn() }));
let app: any;
const response = (amount = '12.34') => new Response(JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: amount }] }));
const status = () => document.getElementById('aiBalanceStatus')?.textContent;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  document.body.innerHTML = `<section class="ai-config"><form id="testForm">
    <input id="testKey"><input id="testBase"><input id="testPrompt"><select id="testModel"></select>
    <div class="config-actions-panel"><div class="action-buttons"></div></div>
  </form></section>`;
  app = { refs: {
    aiConfigForm: document.getElementById('testForm'), openrouterApiKey: document.getElementById('testKey'),
    openrouterBaseUrl: document.getElementById('testBase'), systemPrompt: document.getElementById('testPrompt'), modelSelect: document.getElementById('testModel'),
  }, utils: {
    escapeHtml: (value: unknown) => String(value ?? ''), normalizeBaseUrl: (value: string) => String(value || '').replace(/\/+$/, ''),
    maskKey: () => '', readJson: (_key: string, fallback: unknown) => fallback, writeJson: vi.fn(),
  } };
  window.GJHApp = app;
  vi.mocked(cloudConfig.get).mockResolvedValue({ aiProvider: 'deepseek', apiKey: 'test-key', baseUrl: 'https://api.deepseek.com' });
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => String(url).endsWith('/user/balance') ? response() : new Response('{"data":[]}'));
  await import('../core/app-constants');
  await import('./config');
});
afterEach(() => { app.config?.cleanup(); document.body.innerHTML = ''; });

it('merges live official prices for newly published model IDs and their version aliases', async () => {
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
    if (String(url).includes('/api/model-pricing')) return new Response(JSON.stringify({ source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', fetchedAt: '2026-10-16T00:00:00Z', models: [
      { id: 'deepseek-future', aliases: ['DeepSeek-Future-V5'], contextLength: 1000000, pricing: { inputCnyPerMillion: 1, outputCnyPerMillion: 4 } },
    ] }));
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'DeepSeek-Future-V5' }, { id: 'deepseek-unknown' }] }));
    return response();
  });
  await app.config.init();
  await app.config.fetchModels();
  const options = Array.from(app.refs.modelSelect.options) as HTMLOptionElement[];
  const priced = options.find((option) => option.value === 'DeepSeek-Future-V5')!;
  expect(JSON.parse(priced.dataset.pricing!)).toMatchObject({ inputCnyPerMillion: 1, outputCnyPerMillion: 4, updatedAt: '2026-10-16T00:00:00Z' });
  expect(JSON.parse(options.find((option) => option.value === 'deepseek-unknown')!.dataset.pricing!)).toEqual({ unavailable: true });
});

it('displays verified official prices immediately even before the new backend endpoint is deployed', async () => {
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
    if (String(url).includes('/api/model-pricing')) return new Response('', { status: 404 });
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'DeepSeek-V4.1-Flash' }, { id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }] }));
    return response();
  });
  await app.config.init();
  await app.config.fetchModels();
  const options = Array.from(app.refs.modelSelect.options) as HTMLOptionElement[];
  for (const id of ['DeepSeek-V4.1-Flash', 'deepseek-v4-flash']) {
    const pricing = JSON.parse(options.find((option) => option.value === id)!.dataset.pricing!);
    expect(pricing).toMatchObject({ inputCnyPerMillion: 1, outputCnyPerMillion: 4, cachedInputCnyPerMillion: .02,
      peak: { inputCnyPerMillion: 2, outputCnyPerMillion: 8, cachedInputCnyPerMillion: .04 }, snapshot: true });
  }
  expect(JSON.parse(options.find((option) => option.value === 'deepseek-v4-pro')!.dataset.pricing!)).toMatchObject({ inputCnyPerMillion: 4.5, outputCnyPerMillion: 13.5, peak: { inputCnyPerMillion: 9, outputCnyPerMillion: 27 } });
});

it('queries balance as soon as cloud credentials load, without a manual click', async () => {
  await app.config.init();
  await vi.waitFor(() => expect(status()).toBe('余额：¥12.34'));
  expect(fetchWithTimeout).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
  }), 12000);
});

it('does not erase a balance or query again for unrelated form edits', async () => {
  await app.config.init();
  await vi.waitFor(() => expect(status()).toBe('余额：¥12.34'));
  app.config.setFormConfig({ ...app.config.getFormConfig(), systemPrompt: '新的助手提示词' });
  expect(status()).toBe('余额：¥12.34');
  await new Promise((resolve) => setTimeout(resolve, 450));
  expect(vi.mocked(fetchWithTimeout).mock.calls.filter(([url]) => String(url).endsWith('/user/balance'))).toHaveLength(1);
});

it('ignores stale results when switching to a local provider during a query', async () => {
  let finish: (value: Response) => void = () => {};
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => String(url).endsWith('/user/balance')
    ? new Promise<Response>((resolve) => { finish = resolve; }) : new Response('{"data":[]}'));
  await app.config.init();
  app.config.setFormConfig({ aiProvider: 'lmstudio', apiKey: '', baseUrl: 'http://localhost:1234/v1' });
  finish(response('99'));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(status()).toBe('余额：本地模型无需查询');
  expect((document.getElementById('readBalanceBtn') as HTMLButtonElement).disabled).toBe(false);
});

it('debounces new credentials and automatically queries the changed key', async () => {
  await app.config.init();
  await vi.waitFor(() => expect(status()).toBe('余额：¥12.34'));
  const config = app.config.getFormConfig();
  app.config.setFormConfig({ ...config, apiKey: 'changed-key', deepseekConfig: { ...config.deepseekConfig, apiKey: 'changed-key' } });
  await vi.waitFor(() => expect(fetchWithTimeout).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer changed-key' }),
  }), 12000));
});
