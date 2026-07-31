import { describe, expect, it, vi } from 'vitest';
import type { ChatRuntimeMessage } from './chat-runtime-controller';
import { createChatRuntimeMessageStore } from './chat-runtime-message-store';

const assistantMessage = (
  content: string,
  overrides: Partial<ChatRuntimeMessage> = {},
): ChatRuntimeMessage => ({
  role: 'assistant',
  content,
  pending: false,
  ...overrides,
});

describe('chat runtime message store', () => {
  it('keeps a stable session/message reference when the active session changes', () => {
    const sessions = [
      {
        id: 'session-a',
        messages: [{ id: 'user-a', role: 'user', content: '分析 A' }],
      },
      {
        id: 'session-b',
        messages: [{ id: 'user-b', role: 'user', content: '打开 B' }],
      },
    ];
    let activeSessionId = 'session-a';
    const onChange = vi.fn();
    const store = createChatRuntimeMessageStore({
      getSessions: () => sessions,
      getActiveSessionId: () => activeSessionId,
      createMessageId: () => 'assistant-a',
      onChange,
    });

    const context = store.getSessionContext();
    const ref = store.addAssistantMessage(assistantMessage('处理中'));
    activeSessionId = 'session-b';
    sessions[0].messages[0].content = 'A 已被后续修改';
    store.updateAssistantMessage(ref, assistantMessage('A 已完成'));

    expect(ref).toEqual({
      sessionId: 'session-a',
      messageId: 'assistant-a',
    });
    expect(context).toEqual({
      sessionId: 'session-a',
      history: [{ id: 'user-a', role: 'user', content: '分析 A' }],
    });
    expect(sessions[0].messages[1]).toMatchObject({
      id: 'assistant-a',
      content: 'A 已完成',
    });
    expect(sessions[1].messages).toHaveLength(1);
    expect(onChange).toHaveBeenLastCalledWith('session-a');
  });

  it('hydrates the original persisted confirmation message by run id after reload', () => {
    const persistedMessage = assistantMessage('等待确认', {
      id: 'assistant-confirm',
      agentRunId: 'run-confirm-reload',
      agentConfirmation: {
        runId: 'run-confirm-reload',
        confirmationId: 'confirmation-reload',
        target: 'inventory.delete',
        parameters: [],
        impact: '将删除项目数据，此操作可能无法恢复',
        expiresAt: '2026-07-31T09:00:00.000Z',
        actions: [
          { id: 'confirm', label: '确认执行' },
          { id: 'cancel', label: '取消' },
        ],
      },
    });
    const sessions = [{
      id: 'session-a',
      messages: [persistedMessage],
    }];

    const reloadedStore = createChatRuntimeMessageStore({
      getSessions: () => sessions,
      getActiveSessionId: () => 'session-a',
      createMessageId: () => 'unused',
      onChange: vi.fn(),
    });

    expect(reloadedStore.findAssistantMessageByRunId('run-confirm-reload')).toEqual({
      messageRef: {
        sessionId: 'session-a',
        messageId: 'assistant-confirm',
      },
      message: persistedMessage,
    });
  });
});
