// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ history: vi.fn(), saveHistory: vi.fn() }));
vi.mock('../services/ai-analysis', () => ({ aiAnalysis: api }));
import { AiCloudHistory } from './aiCloudHistory';
const session = (id: string, text = id) => ({ id, title: text, updatedAt: 1, turns: [{ role: 'user' as const, text }] });
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); api.history.mockResolvedValue([]); api.saveHistory.mockResolvedValue(undefined); });
describe('cloud conversation sync', () => {
  it('migrates only account-owned cache once and loads cloud data', async () => {
    const cloud = [session('remote')]; api.history.mockResolvedValue(cloud);
    const sync = new AiCloudHistory('a', 'cache-a', [session('local')], vi.fn());
    expect(await sync.initialize([session('local')])).toEqual(cloud);
    expect(api.saveHistory).toHaveBeenCalledWith('a', [session('local')], [], true);
    expect(localStorage.getItem('cache-a:cloud-migrated')).toBe('1');
    const second = new AiCloudHistory('a', 'cache-a', [session('local')], vi.fn());
    api.saveHistory.mockClear(); await second.initialize([session('local')]);
    expect(api.saveHistory).not.toHaveBeenCalled();
  });
  it('retains failed saves in account outbox and retries them on another mount', async () => {
    const status = vi.fn();
    const sync = new AiCloudHistory('a', 'cache-a', [], status);
    await sync.initialize([]);
    api.saveHistory.mockRejectedValue(new Error('offline'));
    sync.save([session('new')]);
    await expect(sync.flush()).rejects.toThrow('offline');
    expect(localStorage.getItem('cache-a:outbox')).toContain('new');
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('云端保存失败'));
    sync.dispose(); api.saveHistory.mockResolvedValue(undefined);
    const retry = new AiCloudHistory('a', 'cache-a', [], vi.fn());
    await retry.initialize([]);
    expect(api.saveHistory).toHaveBeenLastCalledWith('a', [expect.objectContaining({ id: 'new' })]);
    expect(JSON.parse(localStorage.getItem('cache-a:outbox')!).sessions).toEqual([]);
  });
  it('uploads only changed conversations, sends explicit deletions, and refreshes other devices', async () => {
    api.history.mockResolvedValue([session('one'), session('two')]);
    const sync = new AiCloudHistory('a', 'cache-a', [], vi.fn());
    const items = await sync.initialize([]);
    sync.save(items); await sync.flush(); expect(api.saveHistory).not.toHaveBeenCalled();
    sync.save([items[0]], 'two'); await sync.flush();
    expect(api.saveHistory).toHaveBeenCalledWith('a', [], ['two']);
    api.history.mockResolvedValue([session('another-device')]);
    expect(await sync.refresh()).toEqual([session('another-device')]);
  });
});
