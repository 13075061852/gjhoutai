// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudStorage } from './cloud-storage';
import { hydrateCloudBackedLocalStorage } from './cloud-sync';
import { CLOUD_LOCAL_STORAGE_KEYS } from './local-storage-keys';

vi.mock('./cloud-storage', () => ({ cloudStorage: { getJsonBatch: vi.fn(), putJson: vi.fn() } }));
afterEach(() => { localStorage.clear(); vi.resetAllMocks(); });

describe('cloud hydration failure safety', () => {
  it('hydrates all keys in one request while retaining empty-record policies', async () => {
    const values = Object.fromEntries(CLOUD_LOCAL_STORAGE_KEYS.map((key) => [key, null as unknown]));
    values['gjh-office-records-v1'] = '[{"id":"office-1"}]';
    localStorage.setItem('gjh-ash-records-v1', 'stale');
    vi.mocked(cloudStorage.getJsonBatch).mockResolvedValue(values);
    const result = await hydrateCloudBackedLocalStorage();
    expect(cloudStorage.getJsonBatch).toHaveBeenCalledTimes(1);
    expect(cloudStorage.getJsonBatch).toHaveBeenCalledWith(CLOUD_LOCAL_STORAGE_KEYS, undefined);
    expect(localStorage.getItem('gjh-office-records-v1')).toBe('[{"id":"office-1"}]');
    expect(localStorage.getItem('gjh-ash-records-v1')).toBeNull();
    expect(result.changedKeys).toContain('gjh-office-records-v1');
  });
  it('does not delete local business data or seed remote permissions after failed reads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(cloudStorage.getJsonBatch).mockRejectedValue(new Error('network'));
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
    vi.mocked(cloudStorage.getJsonBatch).mockImplementation(async () => {
      controller.abort();
      return Object.fromEntries(CLOUD_LOCAL_STORAGE_KEYS.map((key) => [key, 'old-user-data']));
    });
    const result = await hydrateCloudBackedLocalStorage(controller.signal);
    expect(result.changedKeys).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
});
