// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ensureLegacyApp, ensurePublicApp } from '../core/app-context';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('silences all notification tones on both app APIs without timers or DOM', async () => {
  vi.resetModules();
  await import('./system-notify');
  const timer = vi.spyOn(window, 'setTimeout');
  const app = ensureLegacyApp();
  const publicApp = ensurePublicApp();
  expect(app.notify).toBe(publicApp.notify);
  for (const method of ['success', 'warn', 'error', 'info']) {
    expect(app.notify[method]('操作结果', { key: 'test', duration: 1000 })).toBeNull();
  }
  expect(app.notify.show({ title: '系统提示', message: '消息', tone: 'error' })).toBeNull();
  expect(() => app.notify.close('test')).not.toThrow();
  expect(timer).not.toHaveBeenCalled();
  expect(document.querySelector('.system-notify-stack, .system-notify-item')).toBeNull();
});

it('cleans up existing toasts on initialization without removing confirmation dialogs', async () => {
  document.body.innerHTML = '<div class="system-notify-stack"><div class="system-notify-item"></div></div><div class="confirm-dialog-card"></div>';
  vi.resetModules();
  await import('./system-notify');
  expect(document.querySelector('.system-notify-stack, .system-notify-item')).toBeNull();
  expect(document.querySelector('.confirm-dialog-card')).not.toBeNull();
});
