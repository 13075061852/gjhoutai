import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatSessionStore } from './chat-core';

describe('chat session store', () => {
  const values = new Map<string, any>();
  const writes: string[] = [];
  const constants = {
    CHAT_SESSION_PREFIX: 'session:',
    CHAT_SESSION_INDEX_KEY: 'session-index',
    CHAT_SESSIONS_KEY: 'sessions',
    CHAT_ACTIVE_SESSION_KEY: 'active',
    CHAT_STORAGE_KEY: 'legacy',
  };
  const utils = {
    readJson: (key: string, fallback: any) => values.has(key) ? values.get(key) : fallback,
    writeJson: (key: string, value: any) => { values.set(key, value); writes.push(key); },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    values.clear();
    writes.length = 0;
    vi.stubGlobal('localStorage', { removeItem: vi.fn() });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const makeStore = () => createChatSessionStore({
    constants,
    utils,
    normalizeSession: (session) => session,
    serializeSession: (session) => ({ ...session }),
    makeSessionId: () => 'new',
    deriveSessionTitle: () => 'legacy title',
    nowIso: () => '2026-06-27T00:00:00.000Z',
    newConversationTitle: '新建对话',
  });

  it('only rewrites a session when its persistence version changes', () => {
    const store = makeStore();
    const session = { id: 'a', title: 'A', messages: [], createdAt: '1', updatedAt: '1' };
    store.save([session], 'a');
    writes.length = 0;
    store.save([session], 'a');
    expect(writes).toEqual(['session-index', 'active']);
    session.messages.push({ content: 'changed' });
    session.updatedAt = '2';
    store.save([session], 'a');
    expect(writes).toContain('session:a');
  });

  it('loads and flags the legacy array format for migration', () => {
    values.set('sessions', [{ id: 'a', title: 'A', messages: [], createdAt: '1', updatedAt: '1' }]);
    expect(makeStore().load()).toMatchObject({ activeId: 'a', needsMigration: true });
  });
});
