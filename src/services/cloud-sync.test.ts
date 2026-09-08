// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudStorage } from './cloud-storage';
import { hydrateCloudBackedLocalStorage } from './cloud-sync';

vi.mock('./cloud-storage', () => ({ cloudStorage: { getJson: vi.fn(), putJson: vi.fn() } }));
afterEach(() => { localStorage.clear(); vi.resetAllMocks(); });

describe('cloud hydration failure safety', () => {
  it('does not delete local business data or seed remote permissions after failed reads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(cloudStorage.getJson).mockRejectedValue(new Error('network'));
    localStorage.setItem('gjh-orders-v1', 'local-orders');
    localStorage.setItem('gjh-role-page-permissions-v1', 'local-permissions');
    const result = await hydrateCloudBackedLocalStorage();
    expect(localStorage.getItem('gjh-orders-v1')).toBe('local-orders');
    expect(cloudStorage.putJson).not.toHaveBeenCalled();
    expect(result.changedKeys).toEqual([]);
    vi.restoreAllMocks();
  });

  it('does not apply late responses after a session is disposed', async () => {
    const controller = new AbortController();
    vi.mocked(cloudStorage.getJson).mockImplementation(async () => {
      controller.abort();
      return 'old-user-data';
    });
    const result = await hydrateCloudBackedLocalStorage(controller.signal);
    expect(result.changedKeys).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
});
