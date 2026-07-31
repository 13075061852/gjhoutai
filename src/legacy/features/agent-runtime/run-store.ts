import { agentRunRecordSchema, type AgentRunRecord } from './protocol';

export const AGENT_RUN_STORAGE_KEY = 'gjh-agent-runs-v2';

const MAX_STORED_AGENT_RUNS = 100;

class AgentRunStorageMigrationRequiredError extends Error {
  constructor() {
    super('Agent run storage migration is required before mutation.');
    this.name = 'AgentRunStorageMigrationRequiredError';
  }
}

export interface AgentRunStore {
  get(id: string): Promise<AgentRunRecord | null>;
  save(run: AgentRunRecord): Promise<void>;
  update(id: string, updater: (run: AgentRunRecord) => AgentRunRecord): Promise<AgentRunRecord | null>;
  list(limit?: number): Promise<AgentRunRecord[]>;
  remove(id: string): Promise<void>;
}

const cloneRun = (run: AgentRunRecord): AgentRunRecord => JSON.parse(JSON.stringify(run)) as AgentRunRecord;

const parseRun = (value: unknown): AgentRunRecord | null => {
  const parsed = agentRunRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const parseStoredEntries = (storage: Storage): unknown[] | null => {
  const raw = storage.getItem(AGENT_RUN_STORAGE_KEY);
  if (raw === null) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseMutableStoredEntries = (storage: Storage): unknown[] => {
  const entries = parseStoredEntries(storage);
  if (entries === null) throw new AgentRunStorageMigrationRequiredError();
  return entries;
};

const writeStoredEntries = (storage: Storage, entries: unknown[]): void => {
  storage.setItem(AGENT_RUN_STORAGE_KEY, JSON.stringify(entries));
};

const validRuns = (entries: unknown[]): AgentRunRecord[] => entries
  .map(parseRun)
  .filter((run): run is AgentRunRecord => run !== null);

const preserveInvalidEntries = (entries: unknown[]): unknown[] => entries.filter((entry) => parseRun(entry) === null);

export const createMemoryAgentRunStore = (): AgentRunStore => {
  const runs = new Map<string, AgentRunRecord>();

  return {
    async get(id) {
      const run = runs.get(id);
      return run ? cloneRun(run) : null;
    },
    async save(run) {
      const parsed = agentRunRecordSchema.parse(run);
      runs.set(parsed.id, cloneRun(parsed));
    },
    async update(id, updater) {
      const current = runs.get(id);
      if (!current) return null;
      const updated = agentRunRecordSchema.parse(updater(cloneRun(current)));
      if (updated.id !== id) throw new TypeError('Agent run update cannot change its id.');
      runs.set(id, cloneRun(updated));
      return cloneRun(updated);
    },
    async list(limit) {
      const records = [...runs.values()].map(cloneRun);
      return limit === undefined ? records : records.slice(0, Math.max(0, limit));
    },
    async remove(id) {
      runs.delete(id);
    },
  };
};

export const createLocalStorageAgentRunStore = (storage: Storage = globalThis.localStorage): AgentRunStore => ({
  async get(id) {
    const run = validRuns(parseStoredEntries(storage) ?? []).find((record) => record.id === id);
    return run ? cloneRun(run) : null;
  },
  async save(run) {
    const parsed = agentRunRecordSchema.parse(run);
    const entries = parseMutableStoredEntries(storage);
    const retainedInvalidEntries = preserveInvalidEntries(entries);
    const retainedRuns = validRuns(entries).filter((record) => record.id !== parsed.id);
    const nextRuns = [cloneRun(parsed), ...retainedRuns].slice(0, MAX_STORED_AGENT_RUNS);

    writeStoredEntries(storage, [...retainedInvalidEntries, ...nextRuns]);
  },
  async update(id, updater) {
    const entries = parseMutableStoredEntries(storage);
    const current = validRuns(entries).find((record) => record.id === id);
    if (!current) return null;

    const updated = agentRunRecordSchema.parse(updater(cloneRun(current)));
    if (updated.id !== id) throw new TypeError('Agent run update cannot change its id.');

    const retainedInvalidEntries = preserveInvalidEntries(entries);
    const retainedRuns = validRuns(entries).filter((record) => record.id !== id);
    const nextRuns = [cloneRun(updated), ...retainedRuns].slice(0, MAX_STORED_AGENT_RUNS);
    writeStoredEntries(storage, [...retainedInvalidEntries, ...nextRuns]);
    return cloneRun(updated);
  },
  async list(limit) {
    const records = validRuns(parseStoredEntries(storage) ?? []).map(cloneRun);
    return limit === undefined ? records : records.slice(0, Math.max(0, limit));
  },
  async remove(id) {
    const entries = parseMutableStoredEntries(storage);
    const remainingEntries = entries.filter((entry) => {
      const run = parseRun(entry);
      return run === null || run.id !== id;
    });

    writeStoredEntries(storage, remainingEntries);
  },
});
