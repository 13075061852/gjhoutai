import type {
  AgentConfirmation,
  AgentProgressEvent,
  AgentRunRecord,
  AgentRunState,
} from '../agent-runtime/protocol';
import type {
  AgentRuntime,
  AgentRuntimeResult,
} from '../agent-runtime/runtime';

export type ChatAgentStep = {
  phase: AgentRunState;
  label: string;
  status: AgentProgressEvent['status'];
  toolId?: string;
  stepId?: string;
  durationMs?: number;
};

export type ChatAgentConfirmation = {
  runId: string;
  confirmationId: string;
  target: string;
  parameters: Array<{ name: string; value: unknown }>;
  impact: string;
  expiresAt: string;
  actions: Array<{
    id: 'confirm' | 'cancel';
    label: string;
  }>;
};

export type ChatRuntimeMessage = {
  role: 'assistant';
  content: string;
  pending: boolean;
  pendingStatus?: string;
  images?: unknown[];
  actions?: unknown[];
  searchSources?: unknown[];
  agentSteps?: ChatAgentStep[];
  agentConfirmation?: ChatAgentConfirmation | null;
};

export type ChatRuntimeSubmitInput = {
  prompt: string;
};

type ChatRuntimeConfig = {
  projectAccessEnabled: boolean;
  webSearchEnabled: boolean;
};

type MessageReference = string | number;

type ProgressWithRunId = AgentProgressEvent & {
  runId?: string;
};

type PrepareAttachmentsInput = {
  prompt: string;
  signal: AbortSignal;
  messageRef: MessageReference;
};

type PrepareAttachmentsResult = {
  terminalMessage?: string;
};

type CreateChatRuntimeControllerOptions = {
  runtime: AgentRuntime;
  getActivePageId: () => string;
  getRunConfig: () => ChatRuntimeConfig | Promise<ChatRuntimeConfig>;
  prepareAttachments?: (
    input: PrepareAttachmentsInput,
  ) => void | PrepareAttachmentsResult | Promise<void | PrepareAttachmentsResult>;
  addAssistantMessage: (message: ChatRuntimeMessage) => MessageReference;
  updateAssistantMessage: (
    messageRef: MessageReference,
    message: ChatRuntimeMessage,
  ) => void;
  setBusy: (busy: boolean) => void;
  focusInput: () => void;
};

const impactText = (riskLevel: AgentConfirmation['riskLevel']): string => {
  if (riskLevel === 'create') return '将创建新的项目数据';
  if (riskLevel === 'update') return '将修改现有项目数据';
  if (riskLevel === 'delete') return '将删除项目数据，此操作可能无法恢复';
  return '将读取项目数据';
};

const findConfirmationInput = (
  run: AgentRunRecord,
  confirmation: AgentConfirmation,
): Record<string, unknown> => (
  run.plan?.steps.find((step) => step.id === confirmation.stepId)?.input ?? {}
);

const confirmationModel = (
  run: AgentRunRecord,
): ChatAgentConfirmation | null => {
  const confirmation = run.pendingConfirmation;
  if (!confirmation) return null;
  const input = findConfirmationInput(run, confirmation);
  return {
    runId: run.id,
    confirmationId: confirmation.id,
    target: confirmation.toolId,
    parameters: Object.entries(input).map(([name, value]) => ({ name, value })),
    impact: impactText(confirmation.riskLevel),
    expiresAt: confirmation.expiresAt,
    actions: [
      { id: 'confirm', label: '确认执行' },
      { id: 'cancel', label: '取消' },
    ],
  };
};

const normalizeSearchSource = (value: unknown): unknown | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!item.url && !item.link) return null;
  return {
    ...item,
    url: String(item.url || item.link || ''),
  };
};

const searchSourcesOf = (run: AgentRunRecord): unknown[] => (
  Object.values(run.stepResults).flatMap((result) => {
    const data = result.data as {
      results?: unknown;
      sources?: unknown;
      result?: { results?: unknown; sources?: unknown };
    };
    const candidates = [
      data.results,
      data.sources,
      data.result?.results,
      data.result?.sources,
    ];
    return candidates.flatMap((candidate) => (
      Array.isArray(candidate)
        ? candidate.map(normalizeSearchSource).filter((item) => item !== null)
        : []
    ));
  })
);

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return '网络或权限错误';
};

export const createChatRuntimeController = ({
  runtime,
  getActivePageId,
  getRunConfig,
  prepareAttachments,
  addAssistantMessage,
  updateAssistantMessage,
  setBusy,
  focusInput,
}: CreateChatRuntimeControllerOptions) => {
  let invocationSequence = 0;
  let activeInvocationId = '';
  let activeRunId = '';
  let activeController: AbortController | null = null;
  const messageByRunId = new Map<string, MessageReference>();
  const progressInvocationByRunId = new Map<string, string>();
  const messageByInvocation = new Map<string, MessageReference>();
  const latestMessageByRef = new Map<MessageReference, ChatRuntimeMessage>();

  const replaceMessage = (
    messageRef: MessageReference,
    update: Partial<ChatRuntimeMessage>,
  ): void => {
    const current = latestMessageByRef.get(messageRef) ?? {
      role: 'assistant',
      content: '',
      pending: true,
    };
    const next: ChatRuntimeMessage = {
      ...current,
      ...update,
      role: 'assistant',
    };
    latestMessageByRef.set(messageRef, next);
    updateAssistantMessage(messageRef, next);
  };

  const addPendingMessage = (): MessageReference => {
    const message: ChatRuntimeMessage = {
      role: 'assistant',
      content: '正在理解问题...',
      pending: true,
      pendingStatus: '正在理解问题',
      agentSteps: [],
      agentConfirmation: null,
    };
    const messageRef = addAssistantMessage(message);
    latestMessageByRef.set(messageRef, message);
    return messageRef;
  };

  const applyProgress = (
    invocationId: string,
    messageRef: MessageReference,
    progress: ProgressWithRunId,
  ): void => {
    if (activeInvocationId !== invocationId) return;
    const runtimeRunId = String(progress.runId || '').trim();
    if (runtimeRunId) {
      activeRunId = runtimeRunId;
      messageByRunId.set(runtimeRunId, messageRef);
      progressInvocationByRunId.set(runtimeRunId, invocationId);
    }
    const step: ChatAgentStep = {
      phase: progress.phase,
      label: progress.label,
      status: progress.status,
      ...(progress.toolId ? { toolId: progress.toolId } : {}),
      ...(progress.stepId ? { stepId: progress.stepId } : {}),
      ...(progress.durationMs === undefined
        ? {}
        : { durationMs: progress.durationMs }),
    };
    replaceMessage(messageRef, {
      content: progress.label,
      pending: true,
      pendingStatus: progress.label,
      agentSteps: [step],
      agentConfirmation: null,
    });
  };

  const applyRunResult = (
    invocationId: string,
    messageRef: MessageReference,
    result: AgentRuntimeResult,
  ): void => {
    if (activeInvocationId !== invocationId) return;
    const runtimeRunId = String(result.run?.id || '').trim();
    if (runtimeRunId) {
      activeRunId = runtimeRunId;
      messageByRunId.set(runtimeRunId, messageRef);
      progressInvocationByRunId.set(runtimeRunId, invocationId);
    }
    const awaitingConfirmation = result.state === 'awaiting_confirmation';
    replaceMessage(messageRef, {
      content: result.answer || (
        awaitingConfirmation
          ? '此操作需要确认后才能执行。'
          : '运行没有返回可显示的结果。'
      ),
      pending: false,
      pendingStatus: '',
      images: Array.isArray(result.images) ? result.images : [],
      actions: Array.isArray(result.actions) ? result.actions : [],
      searchSources: searchSourcesOf(result.run),
      agentConfirmation: awaitingConfirmation
        ? confirmationModel(result.run)
        : null,
    });
  };

  const applyTerminalError = (
    invocationId: string,
    messageRef: MessageReference,
    error: unknown,
  ): void => {
    if (activeInvocationId !== invocationId) return;
    replaceMessage(messageRef, {
      content: `发送失败：${errorMessage(error)}`,
      pending: false,
      pendingStatus: '',
      images: [],
      agentConfirmation: null,
    });
  };

  const submit = async ({ prompt }: ChatRuntimeSubmitInput): Promise<void> => {
    setBusy(true);
    const invocationId = `chat-invocation-${++invocationSequence}`;
    const controller = new AbortController();
    activeInvocationId = invocationId;
    activeRunId = '';
    activeController = controller;
    const messageRef = addPendingMessage();
    messageByInvocation.set(invocationId, messageRef);
    try {
      const config = await getRunConfig();
      const prepared = await prepareAttachments?.({
        prompt,
        signal: controller.signal,
        messageRef,
      });
      if (prepared && prepared.terminalMessage) {
        replaceMessage(messageRef, {
          content: prepared.terminalMessage,
          pending: false,
          pendingStatus: '',
          images: [],
          agentConfirmation: null,
        });
        return;
      }
      const result = await runtime.run({
        prompt,
        activePageId: getActivePageId(),
        projectAccessEnabled: config.projectAccessEnabled,
        webSearchEnabled: config.webSearchEnabled,
        signal: controller.signal,
        onProgress: (progress) => applyProgress(
          invocationId,
          messageRef,
          progress as ProgressWithRunId,
        ),
      });
      applyRunResult(invocationId, messageRef, result);
    } catch (error) {
      applyTerminalError(invocationId, messageRef, error);
    } finally {
      if (activeInvocationId === invocationId) {
        activeInvocationId = '';
        activeRunId = '';
        activeController = null;
        setBusy(false);
        focusInput();
      }
    }
  };

  const confirm = async ({
    runId,
    confirmationId,
  }: {
    runId: string;
    confirmationId: string;
  }): Promise<void> => {
    setBusy(true);
    const invocationId = progressInvocationByRunId.get(runId)
      ?? `chat-confirmation-${++invocationSequence}`;
    const controller = new AbortController();
    const messageRef = messageByRunId.get(runId) ?? addPendingMessage();
    activeInvocationId = invocationId;
    activeRunId = runId;
    activeController = controller;
    replaceMessage(messageRef, {
      content: '已确认，正在继续执行...',
      pending: true,
      pendingStatus: '正在继续执行',
      agentConfirmation: null,
    });
    try {
      const result = await runtime.confirm({
        runId,
        confirmationId,
        signal: controller.signal,
      });
      applyRunResult(invocationId, messageRef, result);
    } catch (error) {
      applyTerminalError(invocationId, messageRef, error);
    } finally {
      if (activeInvocationId === invocationId) {
        activeInvocationId = '';
        activeRunId = '';
        activeController = null;
        setBusy(false);
        focusInput();
      }
    }
  };

  const cancel = async (requestedRunId = ''): Promise<void> => {
    const runtimeRunId = String(requestedRunId || activeRunId || '').trim();
    const storedInvocationId = runtimeRunId
      ? progressInvocationByRunId.get(runtimeRunId) ?? ''
      : '';
    const messageRef = runtimeRunId
      ? messageByRunId.get(runtimeRunId)
      : undefined;
    const resumesPersistedRun = Boolean(
      requestedRunId
      && runtimeRunId
      && storedInvocationId
      && messageRef !== undefined
      && !activeInvocationId,
    );
    if (resumesPersistedRun) {
      activeInvocationId = storedInvocationId;
      activeRunId = runtimeRunId;
      setBusy(true);
    }
    if (activeController && !activeController.signal.aborted) {
      activeController.abort(new DOMException('用户已取消运行。', 'AbortError'));
    }
    try {
      if (!runtimeRunId) return;
      const result = await runtime.cancel(runtimeRunId);
      if (
        result
        && storedInvocationId
        && messageRef !== undefined
        && activeInvocationId === storedInvocationId
      ) {
        applyRunResult(storedInvocationId, messageRef, {
          run: result,
          state: result.state,
          answer: result.terminalError?.message || 'Agent 运行已取消。',
          images: [],
          actions: [],
        });
      }
    } catch (error) {
      if (storedInvocationId && messageRef !== undefined) {
        applyTerminalError(storedInvocationId, messageRef, error);
      }
    } finally {
      if (resumesPersistedRun && activeInvocationId === storedInvocationId) {
        activeInvocationId = '';
        activeRunId = '';
        setBusy(false);
        focusInput();
      }
    }
  };

  return {
    submit,
    confirm,
    cancel,
    isBusy: () => Boolean(activeInvocationId),
    getActiveRunId: () => activeRunId,
  };
};
