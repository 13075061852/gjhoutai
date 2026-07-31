import type {
  ChatRuntimeMessage,
  ChatRuntimeMessageReference,
  ChatRuntimeSessionContext,
} from './chat-runtime-controller';

type ChatSession = {
  id: string;
  messages: Array<Record<string, unknown>>;
};

type CreateChatRuntimeMessageStoreOptions = {
  getSessions: () => ChatSession[];
  getActiveSessionId: () => string;
  createMessageId: () => string;
  onChange: (sessionId: string) => void;
};

const cloneHistory = (messages: Array<Record<string, unknown>>): unknown[] => {
  if (typeof structuredClone === 'function') return structuredClone(messages);
  return messages.map((message) => ({
    ...message,
    images: Array.isArray(message.images) ? [...message.images] : message.images,
    actions: Array.isArray(message.actions) ? [...message.actions] : message.actions,
  }));
};

export const createChatRuntimeMessageStore = ({
  getSessions,
  getActiveSessionId,
  createMessageId,
  onChange,
}: CreateChatRuntimeMessageStoreOptions) => {
  const findSession = (sessionId: string): ChatSession | undefined => (
    getSessions().find((session) => session.id === sessionId)
  );

  const getSessionContext = (requestedSessionId = ''): ChatRuntimeSessionContext => {
    const sessionId = requestedSessionId || getActiveSessionId();
    const session = findSession(sessionId);
    return {
      sessionId,
      history: cloneHistory(session?.messages ?? []),
    };
  };

  const addAssistantMessage = (
    message: ChatRuntimeMessage,
    requestedRef?: ChatRuntimeMessageReference,
  ): ChatRuntimeMessageReference => {
    const sessionId = requestedRef?.sessionId || getActiveSessionId();
    const messageId = requestedRef?.messageId || createMessageId();
    const session = findSession(sessionId);
    if (!session) throw new Error(`Chat session not found: ${sessionId}`);
    const messageRef = { sessionId, messageId };
    session.messages.push({
      ...message,
      id: messageId,
      role: 'assistant',
    });
    onChange(sessionId);
    return messageRef;
  };

  const updateAssistantMessage = (
    messageRef: ChatRuntimeMessageReference,
    message: ChatRuntimeMessage,
  ): void => {
    const session = findSession(messageRef.sessionId);
    if (!session) return;
    const index = session.messages.findIndex((item) => item.id === messageRef.messageId);
    if (index < 0) return;
    session.messages[index] = {
      ...message,
      id: messageRef.messageId,
      role: 'assistant',
    };
    onChange(messageRef.sessionId);
  };

  const findAssistantMessageByRunId = (runId: string): {
    messageRef: ChatRuntimeMessageReference;
    message: ChatRuntimeMessage;
  } | null => {
    for (const session of getSessions()) {
      const message = session.messages.find((item) => (
        item.role === 'assistant'
        && (
          item.agentRunId === runId
          || (
            item.agentConfirmation
            && typeof item.agentConfirmation === 'object'
            && (item.agentConfirmation as { runId?: unknown }).runId === runId
          )
        )
      ));
      if (!message || typeof message.id !== 'string' || !message.id) continue;
      return {
        messageRef: {
          sessionId: session.id,
          messageId: message.id,
        },
        message: message as ChatRuntimeMessage,
      };
    }
    return null;
  };

  return {
    getSessionContext,
    addAssistantMessage,
    updateAssistantMessage,
    findAssistantMessageByRunId,
  };
};
