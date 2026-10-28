import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHistoryStore } from './history.mjs';

test('history survives reopen, isolates accounts, merges devices and prevents deleted-record resurrection', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gjh-history-'));
  const filename = path.join(dir, 'history.sqlite');
  let store = createHistoryStore(filename);
  const item = (id, text, updatedAt = 1) => ({ id, title: text, updatedAt, turns: [{ role: 'user', text }] });
  try {
    store.save('a', { sessions: [item('one', 'private A')] });
    store.save('b', { sessions: [item('one', 'private B')] });
    store.save('a', { sessions: [item('two', 'device 2')] });
    store.save('a', { sessions: [item('one', 'new', 3)] });
    store.save('a', { sessions: [item('one', 'stale', 2)] });
    store.close(); store = createHistoryStore(filename);
    assert.equal(store.list('a').length, 2);
    assert.equal(store.list('a')[0].title, 'new');
    assert.equal(store.list('b')[0].title, 'private B');
    store.save('a', { sessions: [item('one', 'old migration', 4)], migrate: true });
    assert.equal(store.list('a')[0].title, 'new');
    store.save('a', { sessions: [], deletedIds: ['one'] });
    store.save('a', { sessions: [item('one', 'stale device', 5)] });
    store.save('a', { sessions: [item('one', 'migration')], migrate: true });
    assert.deepEqual(store.list('a').map(row => row.id), ['two']);
    assert.equal(store.list('b').length, 1);
    assert.throws(() => store.save('a', { sessions: [item('../unsafe', 'bad')] }), /无效/);
    assert.throws(() => store.save('a', { sessions: [item('valid', 'ok'), { id: 'bad' }] }), /无效/);
    assert.equal(store.list('a').length, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
