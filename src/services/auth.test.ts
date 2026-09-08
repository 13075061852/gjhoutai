// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from '../utils/fetch';
vi.mock('../utils/fetch', () => ({ fetchWithTimeout: vi.fn() }));
afterEach(() => { localStorage.clear(); vi.resetAllMocks(); vi.resetModules(); });

const user = { id: 'user', username: 'user', displayName: 'User', department: '生产部', mustChangePassword: false };
const response = (payload: unknown) => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });

describe('auth session cache', () => {
  it('does not let a stale /me response revive the cache after logout', async () => {
    localStorage.setItem('gjh-auth-session-present', '1');
    const { authClient } = await import('./auth');
    let resolveMe!: (response: Response) => void;
    vi.mocked(fetchWithTimeout).mockReturnValueOnce(new Promise((resolve) => { resolveMe = resolve; }));
    const pending = authClient.me();
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(response({ ok: true }));
    expect(await authClient.logout()).toBe(true);
    resolveMe(response({ user }));
    expect(await pending).toBeNull();
    expect(await authClient.me()).toBeNull();
  });

  it('preserves the session marker if the server refuses logout', async () => {
    localStorage.setItem('gjh-auth-session-present', '1');
    const { authClient } = await import('./auth');
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response('{}', { status: 500 }));
    expect(await authClient.logout()).toBe(false);
    expect(authClient.hasSessionMarker()).toBe(true);
  });

  it('bypasses a fresh cache when permissions must be refreshed', async () => {
    localStorage.setItem('gjh-auth-session-present', '1');
    const { authClient } = await import('./auth');
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(response({ user })).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect(await authClient.me()).toEqual(user);
    expect(await authClient.me(true)).toBeNull();
    expect(authClient.hasSessionMarker()).toBe(false);
  });
});
