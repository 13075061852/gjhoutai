import type {
  AgentExecutionEngine,
  AgentExecutionProgressEvent,
  AgentExecutionResult,
} from './execution-engine';
import type { IntentGatewayInput } from './intent-gateway';
import {
  AgentPlannerCancelledError,
  AgentPlannerTimeoutError,
} from './planner';
import type {
  AgentConfirmation,
  AgentIntent,
  AgentPlanV2,
  AgentProgressEvent,
  AgentRunRecord,
  AgentRunState,
  AgentToolResultV2,
} from './protocol';
import {
  composeGroundedResponse,
  type AgentChatModelAdapter,
} from './response-composer';
import type { AgentRunStore } from './run-store';
import {
  createAgentRun,
  isTerminalAgentState,
  transitionAgentRun,
} from './state-machine';
import type { AgentToolRegistry } from './tool-registry';
import {
  AgentTransportCancelledError,
  AgentTransportTimeoutError,
  normalizeAgentTransportError,
} from './transport';

type AgentGatewayRouteInput = IntentGatewayInput & {
  signal?: AbortSignal;
};

type AgentIntentGateway = {
  route(input: AgentGatewayRouteInput): Promise<AgentIntent>;
};

type AgentPlanner = {
  plan(input: {
    prompt: string;
    activePageId: string;
    signal?: AbortSignal;
  }): Promise<AgentPlanV2>;
};

export type AgentRuntimeResult = {
  run: AgentRunRecord;
  state: AgentRunState;
  answer: string;
  images: unknown[];
  actions: unknown[];
};

export interface AgentRuntime {
  run(input: {
    prompt: string;
    activePageId: string;
    projectAccessEnabled: boolean;
    webSearchEnabled: boolean;
    sessionId?: string;
    history?: unknown[];
    attachments?: {
      images?: unknown[];
    };
    signal?: AbortSignal;
    onProgress?: (event: AgentProgressEvent) => void;
  }): Promise<AgentRuntimeResult>;
  confirm(input: {
    runId: string;
    confirmationId: string;
    sessionId?: string;
    history?: unknown[];
    signal?: AbortSignal;
    onProgress?: (event: AgentProgressEvent) => void;
  }): Promise<AgentRuntimeResult>;
  cancel(runId: string): Promise<AgentRunRecord | null>;
}

type CreateAgentRuntimeInput = {
  gateway: AgentIntentGateway;
  planner: AgentPlanner;
  registry: AgentToolRegistry;
  executionEngine: AgentExecutionEngine;
  store: AgentRunStore;
  chatModel: AgentChatModelAdapter;
  now?: () => string | Date | number;
  createId?: () => string;
  modelTimeoutMs?: number;
  onProgress?: (event: AgentProgressEvent) => void;
};

type RunCallbacks = Set<(event: AgentProgressEvent) => void>;

const defaultCreateId = (): string => {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `run-${randomId}`;
};

const abortError = (signal: AbortSignal): Error => (
  signal.reason instanceof Error
    ? signal.reason
    : new AgentTransportCancelledError({ cause: signal.reason })
);

const settleWithSignal = <T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
};

const extractChatContent = (response: unknown): string => {
  if (typeof response === 'string') return response.trim();
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';
  const candidate = response as {
    content?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (typeof candidate.content === 'string') return candidate.content.trim();
  const choiceContent = candidate.choices?.[0]?.message?.content;
  return typeof choiceContent === 'string' ? choiceContent.trim() : '';
};

const resultsOf = (run: AgentRunRecord): AgentToolResultV2[] => (
  Object.values(run.stepResults) as AgentToolResultV2[]
);

const actionsOf = (run: AgentRunRecord): unknown[] => (
  resultsOf(run).flatMap((result) => result.actions)
);

const imagesOf = (run: AgentRunRecord): unknown[] => resultsOf(run).flatMap((result) => {
  const data = result.data as {
    image?: unknown;
    images?: unknown;
    result?: { image?: unknown; images?: unknown };
  };
  const candidates = [
    ...(Array.isArray(data.images) ? data.images : []),
    ...(data.image === undefined || data.image === null ? [] : [data.image]),
    ...(Array.isArray(data.result?.images) ? data.result.images : []),
    ...(data.result?.image === undefined || data.result.image === null
      ? []
      : [data.result.image]),
  ];
  return candidates;
});

const deterministicAnswer = (run: AgentRunRecord, result?: AgentExecutionResult): string => {
  if (run.state === 'cancelled') {
    return run.terminalError?.message || 'Agent 运行已取消。';
  }
  if (run.state === 'timed_out') {
    return run.terminalError?.message || 'Agent 运行超时，请稍后重试。';
  }
  if (run.state === 'failed') {
    return run.terminalError?.message || result?.message || 'Agent 运行失败，请稍后重试。';
  }
  const messages = resultsOf(run)
    .map((item) => String(item.message || '').trim())
    .filter(Boolean);
  if (messages.length) return messages.join('\n');
  if (result?.message) return result.message;
  if (run.terminalError?.message) return run.terminalError.message;
  return '运行没有返回可显示的结果。';
};

const toolCallForIntent = (intent: AgentIntent): {
  toolId: string;
  input: Record<string, unknown>;
} => {
  if (intent.kind === 'web_search') {
    return {
      toolId: intent.toolId || 'web.search',
      input: intent.searchPlan ?? {
        queries: [],
        maxResults: 5,
        searchDepth: 'basic',
        topic: 'general',
      },
    };
  }
  const fallbackToolIds: Partial<Record<AgentIntent['kind'], string>> = {
    image_analysis: 'media.analyzeImages',
    image_generation: 'media.generateImage',
  };
  const toolId = intent.toolId || fallbackToolIds[intent.kind] || '';
  return {
    toolId,
    input: intent.toolInput ?? {},
  };
};

const runtimeProgressStatus = (
  status: AgentExecutionProgressEvent['status'],
): AgentProgressEvent['status'] => (
  status === 'timeout' || status === 'cancelled' ? 'failed' : status
);

const terminalStateForError = (
  error: unknown,
  signal?: AbortSignal,
): 'failed' | 'timed_out' | 'cancelled' => {
  if (
    error instanceof AgentPlannerTimeoutError
    || error instanceof AgentTransportTimeoutError
  ) {
    return 'timed_out';
  }
  if (
    error instanceof AgentPlannerCancelledError
    || error instanceof AgentTransportCancelledError
    || signal?.aborted
  ) {
    return 'cancelled';
  }
  return 'failed';
};

const terminalMessage = (
  state: 'failed' | 'timed_out' | 'cancelled',
): string => {
  if (state === 'timed_out') return 'Agent 运行超时，请稍后重试。';
  if (state === 'cancelled') return 'Agent 运行已取消。';
  return 'Agent 运行失败，请稍后重试。';
};

export const createAgentRuntime = ({
  gateway,
  planner,
  registry,
  executionEngine,
  store,
  chatModel,
  now = () => new Date(),
  createId = defaultCreateId,
  modelTimeoutMs = 45_000,
  onProgress,
}: CreateAgentRuntimeInput): AgentRuntime => {
  const activeControllers = new Map<string, AbortController>();
  const callbacksByRun = new Map<string, RunCallbacks>();
  const terminalEventsEmitted = new Set<string>();

  const nowIso = (): string => {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Agent runtime clock returned an invalid date.');
    return date.toISOString();
  };

  const rememberCallback = (
    runId: string,
    callback?: (event: AgentProgressEvent) => void,
  ): void => {
    if (!callback) return;
    const callbacks = callbacksByRun.get(runId) ?? new Set();
    callbacks.add(callback);
    callbacksByRun.set(runId, callbacks);
  };

  const emit = (runId: string, event: AgentProgressEvent): void => {
    const callbacks = new Set<(progress: AgentProgressEvent) => void>();
    if (onProgress) callbacks.add(onProgress);
    callbacksByRun.get(runId)?.forEach((callback) => callbacks.add(callback));
    const progress = { ...event, runId };
    callbacks.forEach((callback) => {
      try {
        callback(progress);
      } catch {
        // Progress observers cannot alter runtime semantics.
      }
    });
  };

  const emitPhase = (
    runId: string,
    phase: AgentRunState,
    label: string,
    status: AgentProgressEvent['status'] = 'running',
  ): void => emit(runId, {
    at: nowIso(),
    phase,
    label,
    status,
  });

  const bridgeExecutionProgress = (
    runId: string,
    event: AgentExecutionProgressEvent,
  ): void => emit(runId, {
    ...event,
    status: runtimeProgressStatus(event.status),
  });

  const emitTerminal = (run: AgentRunRecord, label: string): void => {
    if (!isTerminalAgentState(run.state) || terminalEventsEmitted.has(run.id)) return;
    terminalEventsEmitted.add(run.id);
    emitPhase(
      run.id,
      run.state,
      label,
      run.state === 'completed' ? 'completed' : 'failed',
    );
    callbacksByRun.delete(run.id);
  };

  const linkController = (
    runId: string,
    signal?: AbortSignal,
  ): { controller: AbortController; unlink: () => void } => {
    const controller = new AbortController();
    const onAbort = () => controller.abort(
      signal?.reason ?? new AgentTransportCancelledError(),
    );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    activeControllers.set(runId, controller);
    return {
      controller,
      unlink: () => signal?.removeEventListener('abort', onAbort),
    };
  };

  const persistIntent = async (
    runId: string,
    intent: AgentIntent,
  ): Promise<AgentRunRecord | null> => store.update(runId, (current) => ({
    ...current,
    intent,
    updatedAt: nowIso(),
  }));

  const runtimeResult = (
    run: AgentRunRecord,
    answer: string,
  ): AgentRuntimeResult => ({
    run,
    state: run.state,
    answer,
    images: imagesOf(run),
    actions: actionsOf(run),
  });

  const commitCompletion = async (
    runId: string,
    reason: string,
  ): Promise<AgentRunRecord> => {
    const committed = await store.update(runId, (current) => {
      if (isTerminalAgentState(current.state)) return current;
      if (current.state !== 'composing') return current;

      transitionAgentRun(current, 'completed', reason);
      current.updatedAt = nowIso();
      current.endedAt = current.updatedAt;
      return current;
    });
    if (!committed) throw new Error(`Agent run not found during completion: ${runId}.`);
    if (committed.state !== 'completed' && !isTerminalAgentState(committed.state)) {
      throw new Error(`Agent run ${runId} cannot complete from ${committed.state}.`);
    }
    return committed;
  };

  const finalizeExecution = async ({
    runId,
    intent,
    executionResult,
    signal,
    images = [],
    sessionId = '',
    history = [],
  }: {
    runId: string;
    intent: AgentIntent;
    executionResult: AgentExecutionResult;
    signal?: AbortSignal;
    images?: unknown[];
    sessionId?: string;
    history?: unknown[];
  }): Promise<AgentRuntimeResult> => {
    let run = await persistIntent(runId, intent) ?? await store.get(runId);
    if (!run) throw new Error(`Execution engine did not persist run ${runId}.`);

    if (run.state === 'awaiting_confirmation') {
      callbacksByRun.delete(run.id);
      return runtimeResult(run, '此操作需要确认后才能执行。');
    }
    if (run.state === 'composing') {
      emitPhase(runId, 'composing', '正在整理执行结果。');
      const composed = await composeGroundedResponse({
        question: run.prompt,
        results: resultsOf(run),
        model: (request) => chatModel({
          ...request,
          ...(intent.kind === 'image_analysis' && images.length ? { images } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(history.length ? { history } : {}),
        }),
        signal,
      });
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new AgentTransportCancelledError({ cause: signal.reason });
      }
      const committed = await commitCompletion(runId, 'Grounded response composed.');
      const answer = committed.state === 'completed'
        ? composed.content
        : deterministicAnswer(committed, executionResult);
      emitTerminal(committed, answer);
      return runtimeResult(committed, answer);
    }

    const answer = deterministicAnswer(run, executionResult);
    emitTerminal(run, answer);
    return runtimeResult(run, answer);
  };

  const persistTerminalFailure = async ({
    runId,
    prompt,
    intent,
    error,
    signal,
  }: {
    runId: string;
    prompt: string;
    intent?: AgentIntent;
    error: unknown;
    signal?: AbortSignal;
  }): Promise<AgentRuntimeResult> => {
    const state = terminalStateForError(error, signal);
    const message = terminalMessage(state);
    let run = await store.get(runId);
    if (!run) {
      const startedAt = nowIso();
      run = createAgentRun({ id: runId, prompt, startedAt });
    }
    if (intent) run.intent = intent;
    if (!isTerminalAgentState(run.state)) {
      if (run.state === 'awaiting_confirmation') {
        transitionAgentRun(run, 'executing', 'Confirmation continuation failed.');
      }
      transitionAgentRun(run, state, message);
      run.updatedAt = nowIso();
      run.endedAt = run.updatedAt;
      run.terminalError = {
        code: state === 'timed_out'
          ? 'AGENT_RUNTIME_TIMEOUT'
          : state === 'cancelled'
            ? 'AGENT_RUNTIME_CANCELLED'
            : 'AGENT_RUNTIME_FAILED',
        message,
      };
      await store.save(run);
    }
    emitTerminal(run, message);
    return runtimeResult(run, deterministicAnswer(run) || message);
  };

  const runtime: AgentRuntime = {
    async run(input) {
      let runId = '';
      let prompt = '';
      let intent: AgentIntent | undefined;
      let linked: ReturnType<typeof linkController> | undefined;
      try {
        runId = createId();
        prompt = String(input.prompt || '').trim();
        rememberCallback(runId, input.onProgress);
        linked = linkController(runId, input.signal);
        emitPhase(runId, 'routing', '正在判断请求类型。', 'started');

        intent = await settleWithSignal(
          gateway.route({
            prompt,
            activePageId: String(input.activePageId || ''),
            projectAccessEnabled: input.projectAccessEnabled ?? true,
            webSearchEnabled: input.webSearchEnabled ?? true,
            signal: linked.controller.signal,
          }),
          linked.controller.signal,
        );

        if (linked.controller.signal.aborted) {
          throw new AgentTransportCancelledError({
            cause: linked.controller.signal.reason,
          });
        }

        if (intent.kind === 'chat') {
          const startedAt = nowIso();
          const run = createAgentRun({ id: runId, prompt, startedAt });
          run.intent = intent;
          transitionAgentRun(run, 'composing', 'Ordinary chat routed directly.');
          run.updatedAt = nowIso();
          await store.save(run);
          emitPhase(runId, 'composing', '正在生成回复。');

          const response = await chatModel({
            purpose: 'chat',
            question: prompt,
            messages: [{ role: 'user', content: prompt }],
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(Array.isArray(input.history) ? { history: input.history } : {}),
            ...(Array.isArray(input.attachments?.images) && input.attachments.images.length
              ? { images: input.attachments.images }
              : {}),
            signal: linked.controller.signal,
          });
          if (linked.controller.signal.aborted) {
            throw new AgentTransportCancelledError({
              cause: linked.controller.signal.reason,
            });
          }
          const answer = extractChatContent(response) || '暂时无法生成回复。';
          const committed = await commitCompletion(runId, 'Ordinary chat completed.');
          const finalAnswer = committed.state === 'completed'
            ? answer
            : deterministicAnswer(committed);
          emitTerminal(committed, finalAnswer);
          return runtimeResult(committed, finalAnswer);
        }

        let executionResult: AgentExecutionResult;
        if (intent.kind === 'complex_agent') {
          emitPhase(runId, 'planning', '正在制定执行计划。', 'started');
          const plan = await planner.plan({
            prompt,
            activePageId: String(input.activePageId || ''),
            signal: linked.controller.signal,
          });
          executionResult = await executionEngine.executePlan({
            runId,
            prompt,
            plan,
            signal: linked.controller.signal,
            onProgress: (event) => bridgeExecutionProgress(runId, event),
          });
        } else {
          const call = toolCallForIntent(intent);
          if (!call.toolId || !registry.get(call.toolId)) {
            throw new Error(`Unknown tool for ${intent.kind}: ${call.toolId || '(missing)'}`);
          }
          executionResult = await executionEngine.executeSingleTool({
            runId,
            prompt,
            toolId: call.toolId,
            input: intent.kind === 'image_analysis'
              ? {
                  ...call.input,
                  images: Array.isArray(input.attachments?.images)
                    ? input.attachments.images
                    : [],
                }
              : call.input,
            signal: linked.controller.signal,
            onProgress: (event) => bridgeExecutionProgress(runId, event),
          });
        }

        return await finalizeExecution({
          runId,
          intent,
          executionResult,
          signal: linked.controller.signal,
          images: Array.isArray(input.attachments?.images)
            ? input.attachments.images
            : [],
          sessionId: input.sessionId,
          history: Array.isArray(input.history) ? input.history : [],
        });
      } catch (error) {
        const signal = linked?.controller.signal ?? input.signal;
        const normalizedError = normalizeAgentTransportError(error, {
          signal,
          timeoutMs: modelTimeoutMs,
        });
        return await persistTerminalFailure({
          runId: runId || createId(),
          prompt,
          intent,
          error: normalizedError,
          signal,
        });
      } finally {
        linked?.unlink();
        if (runId && activeControllers.get(runId) === linked?.controller) {
          activeControllers.delete(runId);
        }
        if (runId) {
          callbacksByRun.delete(runId);
          terminalEventsEmitted.delete(runId);
        }
      }
    },

    async confirm(input) {
      let linked: ReturnType<typeof linkController> | undefined;
      let prompt = '';
      try {
        const run = await store.get(input.runId);
        if (!run) throw new Error(`Agent run not found: ${input.runId}`);
        prompt = run.prompt;
        const confirmation: AgentConfirmation | undefined = (
          run.pendingConfirmation?.id === input.confirmationId
            ? run.pendingConfirmation
            : run.confirmationHistory[input.confirmationId]?.confirmation
        );
        if (!confirmation) {
          return runtimeResult(run, '未找到与当前运行匹配的确认信息。');
        }

        linked = linkController(input.runId, input.signal);
        rememberCallback(input.runId, input.onProgress);
        const executionResult = await executionEngine.resumeConfirmedRun({
          runId: input.runId,
          confirmation,
          signal: linked.controller.signal,
          onProgress: (event) => bridgeExecutionProgress(input.runId, event),
        });
        const latest = await store.get(input.runId);
        const intent = latest?.intent ?? run.intent ?? {
          kind: 'complex_agent',
          confidence: 1,
          reason: 'confirmed continuation',
        };
        return await finalizeExecution({
          runId: input.runId,
          intent,
          executionResult,
          signal: linked.controller.signal,
          sessionId: input.sessionId,
          history: Array.isArray(input.history) ? input.history : [],
        });
      } catch (error) {
        const signal = linked?.controller.signal ?? input.signal;
        const normalizedError = normalizeAgentTransportError(error, {
          signal,
          timeoutMs: modelTimeoutMs,
        });
        return await persistTerminalFailure({
          runId: input.runId,
          prompt,
          error: normalizedError,
          signal,
        });
      } finally {
        linked?.unlink();
        if (activeControllers.get(input.runId) === linked?.controller) {
          activeControllers.delete(input.runId);
        }
        callbacksByRun.delete(input.runId);
        terminalEventsEmitted.delete(input.runId);
      }
    },

    async cancel(runId) {
      const controller = activeControllers.get(runId);
      const wasActive = Boolean(controller);
      if (controller && !controller.signal.aborted) {
        controller.abort(new AgentTransportCancelledError({
          cause: 'runtime.cancel',
        }));
      }
      const run = await executionEngine.cancelRun(runId);
      if (wasActive && run && isTerminalAgentState(run.state)) {
        emitTerminal(run, deterministicAnswer(run));
      }
      return run;
    },
  };

  return runtime;
};
