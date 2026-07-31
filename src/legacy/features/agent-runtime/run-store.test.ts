import { describe, expect, it } from 'vitest';
import { AGENT_RUN_STORAGE_KEY, createLocalStorageAgentRunStore, createMemoryAgentRunStore } from './run-store';
import { createAgentRun } from './state-machine';

const createStorage = (initialValue: string | null = null): Storage => {
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(AGENT_RUN_STORAGE_KEY, initialValue);

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

describe('agent run store', () => {
  it('saves and restores a version 2 awaiting-confirmation run', async () => {
    const store = createMemoryAgentRunStore();
    const run = createAgentRun({ id: 'run-1', prompt: '创建配方', startedAt: '2026-07-31T00:00:00.000Z' });
    run.state = 'awaiting_confirmation';

    await store.save(run);

    expect((await store.get('run-1'))?.state).toBe('awaiting_confirmation');
  });

  it('returns cloned records so callers cannot mutate persisted state', async () => {
    const store = createMemoryAgentRunStore();
    const run = createAgentRun({ id: 'run-2', prompt: '查询库存', startedAt: '2026-07-31T00:00:00.000Z' });
    await store.save(run);

    const loaded = await store.get('run-2');
    loaded!.state = 'failed';

    expect((await store.get('run-2'))?.state).toBe('routing');
  });

  it('clones writes so later caller mutations are not persisted', async () => {
    const store = createMemoryAgentRunStore();
    const run = createAgentRun({ id: 'run-3', prompt: '保存快照', startedAt: '2026-07-31T00:00:00.000Z' });
    await store.save(run);
    run.progress.push({
      at: '2026-07-31T00:00:01.000Z',
      phase: 'routing',
      label: 'should not persist',
      status: 'running',
    });

    expect((await store.get('run-3'))?.progress).toEqual([]);
  });

  it('accepts only version 2 records', async () => {
    const store = createMemoryAgentRunStore();

    await expect(store.save({ version: 1, id: 'legacy-run' } as any)).rejects.toThrow();
    expect(await store.get('legacy-run')).toBeNull();
  });

  it('keeps invalid legacy local-storage entries while restoring valid V2 runs', async () => {
    const validRun = createAgentRun({ id: 'run-4', prompt: '有效记录', startedAt: '2026-07-31T00:00:00.000Z' });
    const legacyEntry = { version: 1, id: 'legacy-run', unrecognized: true };
    const storage = createStorage(JSON.stringify([legacyEntry, validRun]));
    const store = createLocalStorageAgentRunStore(storage);

    expect((await store.list()).map((run) => run.id)).toEqual(['run-4']);

    await store.save(createAgentRun({ id: 'run-5', prompt: '新增记录', startedAt: '2026-07-31T00:01:00.000Z' }));

    expect(JSON.parse(storage.getItem(AGENT_RUN_STORAGE_KEY)!)).toContainEqual(legacyEntry);
  });

  it('caps persisted V2 runs at 100', async () => {
    const storage = createStorage();
    const store = createLocalStorageAgentRunStore(storage);

    for (let index = 0; index < 101; index += 1) {
      await store.save(createAgentRun({
        id: `run-${index}`,
        prompt: '批量记录',
        startedAt: '2026-07-31T00:00:00.000Z',
      }));
    }

    expect(await store.list()).toHaveLength(100);
  });
});
