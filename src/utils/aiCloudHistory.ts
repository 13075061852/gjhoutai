import { aiAnalysis, type AiHistorySession } from '../services/ai-analysis';

/** Per-account durable outbox. Only changed conversations are uploaded, never a full-list replacement. */
export class AiCloudHistory<T extends AiHistorySession> {
  private known = new Map<string, string>();
  private pending = new Map<string, T>();
  private deleted = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private active = true;
  private ready = false;
  private initialized = false;
  private initial: T[] = [];
  private pendingKey: string;
  private migratedKey: string;
  constructor(private ownerId: string, private cacheKey: string, initial: T[], private status: (message: string) => void) {
    this.pendingKey = `${cacheKey}:outbox`;
    this.migratedKey = `${cacheKey}:cloud-migrated`;
    for (const item of initial) this.known.set(item.id, JSON.stringify(item));
    try {
      const outbox = JSON.parse(localStorage.getItem(this.pendingKey) || '{}');
      for (const item of outbox.sessions || []) this.pending.set(item.id, item);
      for (const id of outbox.deletedIds || []) this.deleted.add(id);
    } catch { /* A damaged cache must not block access to server history. */ }
  }
  private storeOutbox() {
    try { localStorage.setItem(this.pendingKey, JSON.stringify({ sessions: [...this.pending.values()], deletedIds: [...this.deleted] })); }
    catch { this.status('本地备份失败，请保持页面打开，等待云端保存。'); }
  }
  async initialize(initial: T[]): Promise<T[]> {
    this.initial = initial;
    try {
      let migrated = false;
      try { migrated = localStorage.getItem(this.migratedKey) === '1'; } catch { /* server deduplicates migrations */ }
      if (!migrated && initial.length && this.active) {
        for (const item of initial.filter(item => item.turns.length)) {
          if (!this.active) return initial;
          await aiAnalysis.saveHistory(this.ownerId, [item], [], true);
        }
      }
      if (!this.active) return initial;
      this.ready = true;
      await this.flush();
      const result = await aiAnalysis.history(this.ownerId) as T[];
      if (!this.active) return initial;
      try { localStorage.setItem(this.migratedKey, '1'); } catch { /* deduplicated server-side */ }
      this.initialized = true;
      this.known = new Map(result.map(item => [item.id, JSON.stringify(item)]));
      return result;
    } catch {
      this.ready = true;
      if (this.active) this.status('云端历史同步失败，暂显示本机备份；重新打开历史可重试。');
      return initial;
    }
  }
  save(items: T[], deletedId?: string) {
    if (!this.active) return;
    if (deletedId) { this.deleted.add(deletedId); this.pending.delete(deletedId); this.known.delete(deletedId); }
    for (const item of items.filter(item => item.turns.length)) {
      if (this.deleted.has(item.id)) continue;
      const snapshot = JSON.stringify(item);
      if (snapshot === this.known.get(item.id)) continue;
      item.updatedAt = Math.max(Date.now(), item.updatedAt);
      const copy = JSON.parse(JSON.stringify(item)) as T;
      this.known.set(item.id, JSON.stringify(copy));
      this.pending.set(item.id, copy);
    }
    this.storeOutbox();
    if (this.ready) void this.flush().catch(() => {});
  }
  flush(): Promise<void> {
    const task = this.queue.catch(() => {}).then(async () => {
      try {
        for (const [id, item] of [...this.pending]) {
          await aiAnalysis.saveHistory(this.ownerId, [item]);
          if (this.pending.get(id) === item) this.pending.delete(id);
          this.storeOutbox();
        }
        for (const id of [...this.deleted]) {
          await aiAnalysis.saveHistory(this.ownerId, [], [id]);
          this.deleted.delete(id);
          this.storeOutbox();
        }
        if (this.active) this.status('历史对话已保存到云端');
      } catch (error) {
        if (this.active) this.status('云端保存失败，本机已保留待同步记录；重新打开历史可重试。');
        throw error;
      }
    });
    this.queue = task;
    return task;
  }
  async refresh(): Promise<T[]> {
    if (!this.initialized) {
      const result = await this.initialize(this.initial);
      if (!this.initialized) throw new Error('云端历史同步失败');
      return result;
    }
    await this.flush();
    const result = await aiAnalysis.history(this.ownerId) as T[];
    this.known = new Map(result.map(item => [item.id, JSON.stringify(item)]));
    return result;
  }
  dispose() { this.active = false; }
}
