// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { authClient } from './services/auth';

vi.mock('./services/auth', () => ({ authClient: { me: vi.fn(), hasSessionMarker: vi.fn(), login: vi.fn() } }));
vi.mock('./pages/LegacyShell', () => ({ LegacyShell: () => <div>shell</div> }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(authClient.hasSessionMarker).mockReturnValue(false);
  vi.mocked(authClient.me).mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

describe('authentication recovery', () => {
  it('re-enables login after a network failure and announces the error', async () => {
    vi.mocked(authClient.login).mockRejectedValue(new Error('offline'));
    await act(async () => root.render(<App />));
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('无法连接服务器');
  });

  it('offers recovery instead of an infinite boot screen when session validation fails', async () => {
    vi.mocked(authClient.hasSessionMarker).mockReturnValue(true);
    vi.mocked(authClient.me).mockRejectedValue(new Error('offline'));
    await act(async () => root.render(<App />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('暂时无法进入系统');
    expect(container.querySelector('button')?.textContent).toBe('重新加载');
  });
});
