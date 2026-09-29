// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../services/cloud-config';
import { requestApimart } from '../../services/apimart-proxy';

vi.mock('../../services/cloud-config', () => ({ cloudConfig: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../services/apimart-proxy', () => ({ requestApimart: vi.fn() }));
let app: any;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  document.body.innerHTML = '<section class="ai-config"><form id="testForm"></form></section>';
  app = { refs: { aiConfigForm: document.getElementById('testForm') }, utils: {
    escapeHtml: (value: unknown) => String(value ?? ''), normalizeBaseUrl: (value: string) => String(value || '').replace(/\/+$/, ''),
    maskKey: () => '', readJson: (_key: string, fallback: unknown) => fallback, writeJson: vi.fn(),
  } };
  window.GJHApp = app;
  vi.mocked(cloudConfig.get).mockResolvedValue({ liblibAccessKey: 'legacy-access', liblibSecretKey: 'legacy-secret' });
  await import('../core/app-constants');
  await import('./config');
  await app.config.init();
});
afterEach(() => { app.config.cleanup(); document.body.innerHTML = ''; });

it('mounts one independent key and documented models without loading old credentials', () => {
  const card = document.getElementById('apimartConfigModule')!;
  expect(card.querySelectorAll('input[type="password"]')).toHaveLength(1);
  expect((card.querySelector('#apimartApiKey') as HTMLInputElement).value).toBe('');
  expect(card.textContent).not.toContain('SecretKey');
  expect(card.querySelector('a')?.href).toBe('https://docs.apib.ai/cn');
  expect(app.config.getFormConfig()).toMatchObject({ apimartApiKey: '', apimartBaseUrl: 'https://api.apimart.ai/v1', apimartImageModel: 'seedream-4.5', apimartVideoModel: 'kling-v2-6' });
});

it('queries key credits without a generation and handles unlimited quota', async () => {
  (document.getElementById('apimartApiKey') as HTMLInputElement).value = 'test-key';
  vi.mocked(requestApimart).mockResolvedValue(new Response(JSON.stringify({ success: true, remain_credits: 105, unlimited_quota: false })));
  document.getElementById('apimartBalanceBtn')!.click();
  await vi.waitFor(() => expect(document.getElementById('apimartBalanceText')?.textContent).toBe('额度：105 积分'));
  expect(requestApimart).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-key', method: 'GET', path: '/balance' }), 12000);
  vi.mocked(requestApimart).mockResolvedValue(new Response(JSON.stringify({ success: true, remain_credits: -1, unlimited_quota: true })));
  document.getElementById('apimartBalanceBtn')!.click();
  await vi.waitFor(() => expect(document.getElementById('apimartBalanceText')?.textContent).toBe('额度：不限额'));
});
