type ChatSessionStoreOptions = {
  constants: any;
  utils: any;
  normalizeSession: (session: any) => any;
  serializeSession: (session: any) => any;
  makeSessionId: () => string;
  deriveSessionTitle: (messages: any[]) => string;
  nowIso: () => string;
  newConversationTitle: string;
};

export const createChatSessionStore = (options: ChatSessionStoreOptions) => {
  const { constants, utils } = options;
  const persistedVersions = new Map<string, string>();
  const persistedIds = new Set<string>();
  let cloudSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshotSessions: any[] | null = null;
  const getKey = (sessionId: string) => `${constants.CHAT_SESSION_PREFIX}${encodeURIComponent(String(sessionId || ''))}`;
  const getVersion = (session: any) => [
    session.updatedAt,
    session.title,
    session.messages.length,
    session.messages[session.messages.length - 1]?.content?.length || 0,
  ].join(':');

  const remember = (session: any) => {
    persistedIds.add(session.id);
    persistedVersions.set(session.id, getVersion(session));
  };

  const save = (sessions: any[], activeId: string) => {
    const currentIds = new Set(sessions.map((session) => session.id));
    persistedIds.forEach((sessionId) => {
      if (currentIds.has(sessionId)) return;
      localStorage.removeItem(getKey(sessionId));
      persistedIds.delete(sessionId);
      persistedVersions.delete(sessionId);
    });
    sessions.forEach((session) => {
      const version = getVersion(session);
      if (persistedVersions.get(session.id) === version) return;
      utils.writeJson(getKey(session.id), options.serializeSession(session));
      remember(session);
    });
    utils.writeJson(constants.CHAT_SESSION_INDEX_KEY, {
      version: 2,
      sessions: sessions.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })),
    });
    utils.writeJson(constants.CHAT_ACTIVE_SESSION_KEY, activeId || '');
    if (cloudSnapshotTimer) clearTimeout(cloudSnapshotTimer);
    pendingSnapshotSessions = sessions;
    cloudSnapshotTimer = setTimeout(() => {
      cloudSnapshotTimer = null;
      if (pendingSnapshotSessions) utils.writeJson(constants.CHAT_SESSIONS_KEY, pendingSnapshotSessions.map(options.serializeSession));
      pendingSnapshotSessions = null;
    }, 750);
  };

  const flush = () => {
    if (cloudSnapshotTimer) clearTimeout(cloudSnapshotTimer);
    cloudSnapshotTimer = null;
    if (pendingSnapshotSessions) utils.writeJson(constants.CHAT_SESSIONS_KEY, pendingSnapshotSessions.map(options.serializeSession));
    pendingSnapshotSessions = null;
  };

  const load = () => {
    const storedIndex = utils.readJson(constants.CHAT_SESSION_INDEX_KEY, null);
    const storedSessions = utils.readJson(constants.CHAT_SESSIONS_KEY, null);
    const storedActiveId = utils.readJson(constants.CHAT_ACTIVE_SESSION_KEY, '');
    if (storedIndex?.version === 2 && Array.isArray(storedIndex.sessions)) {
      const sessions = storedIndex.sessions
        .map((metadata: any) => utils.readJson(getKey(metadata.id), null))
        .filter(Boolean)
        .map(options.normalizeSession);
      sessions.forEach(remember);
      if (sessions.length) {
        const active = sessions.find((session: any) => session.id === storedActiveId) || sessions[0];
        return { sessions, activeId: active.id, needsMigration: false };
      }
    }
    if (Array.isArray(storedSessions) && storedSessions.length) {
      const sessions = storedSessions.map(options.normalizeSession);
      const active = sessions.find((session: any) => session.id === storedActiveId) || sessions[0];
      return { sessions, activeId: active.id, needsMigration: true };
    }
    const legacyHistory = utils.readJson(constants.CHAT_STORAGE_KEY, []);
    if (Array.isArray(legacyHistory) && legacyHistory.length) {
      const session = options.normalizeSession({
        id: options.makeSessionId(),
        title: options.deriveSessionTitle(legacyHistory),
        messages: legacyHistory,
        createdAt: options.nowIso(),
        updatedAt: options.nowIso(),
      });
      return { sessions: [session], activeId: session.id, needsMigration: true };
    }
    const session = options.normalizeSession({
      id: options.makeSessionId(),
      title: options.newConversationTitle,
      messages: [],
      createdAt: options.nowIso(),
      updatedAt: options.nowIso(),
    });
    return { sessions: [session], activeId: session.id, needsMigration: false };
  };

  return { load, save, flush };
};
