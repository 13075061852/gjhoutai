/** Account-scoped UI transcripts. Separate from model state and business databases. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
export function createHistoryStore(filename) {
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS ai_history (
      user_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,id)
    );`);
  const list = db.prepare('SELECT payload FROM ai_history WHERE user_id=? AND deleted=0 ORDER BY updated_at DESC');
  const upsert = db.prepare(`INSERT INTO ai_history(user_id,id,payload,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
    WHERE ai_history.deleted=0 AND excluded.updated_at>=ai_history.updated_at`);
  const migrate = db.prepare('INSERT OR IGNORE INTO ai_history(user_id,id,payload,updated_at) VALUES(?,?,?,?)');
  const remove = db.prepare(`INSERT INTO ai_history(user_id,id,payload,updated_at,deleted) VALUES(?,?,'{}',?,1)
    ON CONFLICT(user_id,id) DO UPDATE SET deleted=1, payload='{}', updated_at=excluded.updated_at`);
  const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  return {
    list(userId) { return list.all(String(userId)).map(row => JSON.parse(row.payload)); },
    save(userId, body) {
      if (!body || !Array.isArray(body.sessions) || body.sessions.length > 100 ||
        (body.deletedIds !== undefined && (!Array.isArray(body.deletedIds) || body.deletedIds.length > 100))) fail('历史记录格式无效');
      const records = body.sessions.map(session => {
        if (!session || !validId(session.id) || typeof session.title !== 'string' || session.title.length > 500 ||
          !Number.isSafeInteger(session.updatedAt) || session.updatedAt < 0 || session.updatedAt > Date.now() + 60_000 ||
          !Array.isArray(session.turns) || session.turns.length > 40 || session.turns.some(turn =>
            !turn || !['user','assistant'].includes(turn.role) || typeof turn.text !== 'string')) fail('历史对话内容无效');
        const payload = JSON.stringify(session);
        if (Buffer.byteLength(payload) > 2 * 1024 * 1024) fail('单条历史对话过大');
        return [String(userId), session.id, payload, session.updatedAt];
      });
      const deleted = body.deletedIds || [];
      if (deleted.some(id => !validId(id))) fail('历史记录标识无效');
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const record of records) (body.migrate === true ? migrate : upsert).run(...record);
        for (const id of deleted) remove.run(String(userId), id, Date.now());
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
let store;
export const historyStore = () => store ??= createHistoryStore(path.join(config.agentDir, 'history', 'transcripts.sqlite'));
export function closeHistoryStore() { store?.close(); store = undefined; }
