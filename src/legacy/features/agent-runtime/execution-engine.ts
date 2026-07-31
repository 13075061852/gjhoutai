import {
  agentConfirmationSchema,
  agentPlanSchema,
  type AgentConfirmation,
  type AgentPlanStep,
  type AgentPlanV2,
  type AgentProgressEvent,
  type AgentRunRecord,
  type AgentRunState,
  type AgentToolResultV2,
} from './protocol';
import {
  createAgentConfirmation,
  markConfirmationConsumed,
  requiresConfirmation,
  validateAgentConfirmation,
} from './policy';
import type { AgentRunStore } from './run-store';
import {
  appendProgress,
  createAgentRun,
  isTerminalAgentState,
  transitionAgentRun,
} from './state-machine';
import type { AgentToolRegistry } from './tool-registry';

export type AgentExecutionProgressStatus =
  | AgentProgressEvent['status']
  | 'timeout'
  | 'cancelled';

export type AgentExecutionProgressEvent = Omit<AgentProgressEvent, 'status'> & {
  status: AgentExecutionProgressStatus;
};

export type AgentExecutionResult = AgentToolResultV2<Record<string, unknown>>;

export type ExecutePlanInput = {
  runId: string;
  prompt: string;
  plan: AgentPlanV2;
  signal?: AbortSignal;
  onProgress?: (event: AgentExecutionProgressEvent) => void;
};

export type ExecuteSingleToolInput = {
  runId: string;
  prompt: string;
  toolId: string;
  input: Record<string, unknown>;
  stepId?: string;
  signal?: AbortSignal;
  onProgress?: (event: AgentExecutionProgressEvent) => void;
};

export type ResumeConfirmedRunInput = {
  runId: string;
  confirmation: AgentConfirmation;
  signal?: AbortSignal;
  onProgress?: (event: AgentExecutionProgressEvent) => void;
};

export interface AgentExecutionEngine {
  executePlan(input: ExecutePlanInput): Promise<AgentExecutionResult>;
  executeSingleTool(input: ExecuteSingleToolInput): Promise<AgentExecutionResult>;
  resumeConfirmedRun(input: ResumeConfirmedRunInput): Promise<AgentExecutionResult>;
  cancelRun(runId: string): Promise<AgentRunRecord | null>;
}

export type CreateAgentExecutionEngineInput = {
  registry: AgentToolRegistry;
  store: AgentRunStore;
  now?: () => string | Date | number;
  createId?: (prefix: 'run' | 'confirmation' | 'idempotency') => string;
  confirmationTtlMs?: number;
  onProgress?: (event: AgentExecutionProgressEvent) => void;
};

type ActiveCall = {
  token: symbol;
  controller: AbortController;
  cancel: (reason?: unknown) => void;
  timerId: ReturnType<typeof setTimeout>;
  isWrite: boolean;
};

class AgentToolTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Agent tool exceeded its ${timeoutMs}ms deadline.`);
    this.name = 'AgentToolTimeoutError';
  }
}

class AgentToolCancelledError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Agent tool execution was cancelled.', options);
    this.name = 'AgentToolCancelledError';
  }
}

const engineError = (
  code: string,
  message: string,
  detail = message,
): AgentExecutionResult => ({
  status: 'error',
  message,
  data: {},
  evidence: [],
  actions: [],
  diagnostics: { code, detail },
});

const cancelledResult = (): AgentExecutionResult => ({
  status: 'cancelled',
  message: '操作已取消。',
  data: {},
  evidence: [],
  actions: [],
  diagnostics: { code: 'AGENT_TOOL_CANCELLED', detail: 'The tool call was cancelled.' },
});

const timeoutResult = (timeoutMs: number): AgentExecutionResult => ({
  status: 'timeout',
  message: `工具执行超过 ${timeoutMs}ms 截止时间。`,
  data: {},
  evidence: [],
  actions: [],
  diagnostics: { code: 'AGENT_TOOL_TIMEOUT', detail: `The tool call exceeded ${timeoutMs}ms.` },
});

const writeOutcomeUnknownResult = (cause: 'cancelled' | 'timeout'): AgentExecutionResult => ({
  status: 'error',
  message: '写操作结果无法确认，请先核对目标数据并人工协调后续处理。',
  data: {},
  evidence: [],
  actions: [{ type: 'reconcile_write', cause }],
  diagnostics: {
    code: 'WRITE_OUTCOME_UNKNOWN',
    detail: `The confirmed write was ${cause} before a trustworthy handler outcome; reconciliation is required.`,
  },
});

const errorDetail = (error: unknown): string => (
  error instanceof Error ? error.message : 'Unknown agent execution error.'
);

const defaultCreateId = (prefix: 'run' | 'confirmation' | 'idempotency'): string => {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
};

const confirmationMatches = (
  stored: AgentConfirmation,
  provided: AgentConfirmation,
): boolean => (
  stored.version === provided.version
  && stored.id === provided.id
  && stored.runId === provided.runId
  && stored.stepId === provided.stepId
  && stored.toolId === provided.toolId
  && stored.inputHash === provided.inputHash
  && stored.riskLevel === provided.riskLevel
  && stored.expiresAt === provided.expiresAt
  && stored.idempotencyKey === provided.idempotencyKey
  && stored.createdAt === provided.createdAt
);

export const createAgentExecutionEngine = ({
  registry,
  store,
  now = () => new Date(),
  createId = defaultCreateId,
  confirmationTtlMs = 5 * 60_000,
  onProgress,
}: CreateAgentExecutionEngineInput): AgentExecutionEngine => {
  const activeCalls = new Map<string, ActiveCall>();
  const cancelledRuns = new Set<string>();
  const mutationTails = new Map<string, Promise<void>>();
  const resumeTails = new Map<string, Promise<void>>();
  const runningOperations = new Map<string, Set<Promise<unknown>>>();

  const withRunQueue = async <T>(
    tails: Map<string, Promise<void>>,
    runId: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous = tails.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    tails.set(runId, tail);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (tails.get(runId) === tail) tails.delete(runId);
    }
  };

  const withRunMutation = <T>(runId: string, operation: () => Promise<T>): Promise<T> => (
    withRunQueue(mutationTails, runId, operation)
  );

  const serializeResume = <T>(runId: string, operation: () => Promise<T>): Promise<T> => (
    withRunQueue(resumeTails, runId, operation)
  );

  const trackOperation = <T>(runId: string, operation: Promise<T>): Promise<T> => {
    const operations = runningOperations.get(runId) ?? new Set<Promise<unknown>>();
    operations.add(operation);
    runningOperations.set(runId, operations);
    const cleanup = () => {
      operations.delete(operation);
      if (operations.size === 0) runningOperations.delete(runId);
    };
    void operation.then(cleanup, cleanup);
    return operation;
  };

  const waitForRunOperations = async (runId: string): Promise<void> => {
    const operations = [...(runningOperations.get(runId) ?? [])];
    await Promise.allSettled(operations);
  };

  const nowDate = (): Date => {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Agent execution clock returned an invalid date.');
    return date;
  };

  const nowIso = (): string => nowDate().toISOString();

  const emit = (
    event: AgentExecutionProgressEvent,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): void => {
    const observers = new Set([
      ...(onProgress ? [onProgress] : []),
      ...(runProgress ? [runProgress] : []),
    ]);
    observers.forEach((observer) => {
      try {
        observer(event);
      } catch {
        // UI progress observers cannot change execution semantics.
      }
    });
  };

  const transition = (run: AgentRunRecord, nextState: AgentRunState, reason: string): void => {
    transitionAgentRun(run, nextState, reason);
    const timestamp = nowIso();
    run.updatedAt = timestamp;
    if (isTerminalAgentState(nextState)) run.endedAt = timestamp;
  };

  const appendPersistedProgress = (
    run: AgentRunRecord,
    event: Omit<AgentProgressEvent, 'at'>,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): void => {
    const progressEvent: AgentProgressEvent = {
      ...event,
      at: nowIso(),
      runId: run.id,
    };
    appendProgress(run, progressEvent);
    emit(progressEvent, runProgress);
  };

  const emitTerminalProgress = (
    run: AgentRunRecord,
    status: 'timeout' | 'cancelled',
    label: string,
    step?: AgentPlanStep,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): void => {
    emit({
      at: nowIso(),
      phase: run.state,
      label,
      status,
      runId: run.id,
      ...(step ? { toolId: step.toolId, stepId: step.id } : {}),
    }, runProgress);
  };

  const clearActiveCall = (runId: string): void => {
    const active = activeCalls.get(runId);
    if (!active) return;
    clearTimeout(active.timerId);
    active.controller.abort(new AgentToolCancelledError());
    activeCalls.delete(runId);
  };

  const forceCancelled = (run: AgentRunRecord, message = '操作已取消。'): void => {
    if (!isTerminalAgentState(run.state)) {
      transition(run, 'cancelled', message);
    } else {
      const timestamp = nowIso();
      run.state = 'cancelled';
      run.updatedAt = timestamp;
      run.endedAt = timestamp;
    }
    run.terminalError = { code: 'AGENT_RUN_CANCELLED', message };
  };

  const persistCancelledRun = async (
    run: AgentRunRecord,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): Promise<AgentRunRecord> => (
    withRunMutation(run.id, async () => {
      const latest = await store.get(run.id);
      const current = latest ?? run;
      if (latest?.terminalError?.code === 'WRITE_OUTCOME_UNKNOWN') return latest;
      if (latest?.state !== 'cancelled') {
        forceCancelled(current);
        await store.save(current);
        emitTerminalProgress(current, 'cancelled', '操作已取消。', undefined, runProgress);
      }
      Object.assign(run, current);
      return current;
    })
  );

  const saveTerminalResult = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    result: AgentExecutionResult,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): Promise<AgentExecutionResult> => withRunMutation(run.id, async () => {
    const latest = await store.get(run.id);
    if (latest && isTerminalAgentState(latest.state)) {
      Object.assign(run, latest);
      return latest.stepResults[step.id] ?? result;
    }

    let effectiveResult = cancelledRuns.has(run.id)
      && result.diagnostics?.code !== 'WRITE_OUTCOME_UNKNOWN'
      ? cancelledResult()
      : result;
    run.stepResults[step.id] = effectiveResult;

    const confirmation = run.pendingConfirmation;
    if (confirmation?.stepId === step.id && confirmation.consumedAt) {
      const history = run.confirmationHistory[confirmation.id];
      if (history) {
        history.confirmation = confirmation;
        history.result = effectiveResult;
      }
    }

    const persistedStatus = effectiveResult.status === 'success' ? 'completed' : 'failed';
    appendPersistedProgress(run, {
      phase: 'executing',
      label: effectiveResult.message,
      status: persistedStatus,
      toolId: step.toolId,
      stepId: step.id,
    }, runProgress);

    if (effectiveResult.status !== 'success') {
      const nextState = effectiveResult.status === 'timeout'
        ? 'timed_out'
        : effectiveResult.status === 'cancelled'
          ? 'cancelled'
          : 'failed';
      transition(run, nextState, effectiveResult.message);
      run.terminalError = {
        code: effectiveResult.diagnostics?.code ?? 'AGENT_TOOL_FAILED',
        message: effectiveResult.message,
      };
    }

    await store.save(run);

    if (
      cancelledRuns.has(run.id)
      && effectiveResult.diagnostics?.code !== 'WRITE_OUTCOME_UNKNOWN'
      && effectiveResult.status !== 'cancelled'
    ) {
      effectiveResult = cancelledResult();
      run.stepResults[step.id] = effectiveResult;
      if (confirmation?.stepId === step.id && confirmation.consumedAt) {
        const history = run.confirmationHistory[confirmation.id];
        if (history) history.result = effectiveResult;
      }
      forceCancelled(run);
      await store.save(run);
    }

    if (effectiveResult.status === 'timeout' || effectiveResult.status === 'cancelled') {
      emitTerminalProgress(run, effectiveResult.status, effectiveResult.message, step, runProgress);
    }
    return effectiveResult;
  });

  const executeToolCall = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<AgentExecutionResult> => {
    if (signal?.aborted || cancelledRuns.has(run.id)) return cancelledResult();

    const definition = registry.get(step.toolId);
    if (!definition) {
      return engineError('UNKNOWN_TOOL', `未知工具：${step.toolId}`, `Unknown tool: ${step.toolId}`);
    }

    let call;
    try {
      call = registry.prepareCall(step.toolId, step.input, { runId: run.id, stepId: step.id });
    } catch (error) {
      return engineError('TOOL_INPUT_INVALID', '工具输入校验失败。', errorDetail(error));
    }

    const controller = new AbortController();
    const token = Symbol(run.id);
    const isWrite = definition.riskLevel !== 'read' && idempotencyKey !== undefined;
    let rejectInterruption: ((error: AgentToolTimeoutError | AgentToolCancelledError) => void) | undefined;
    let interrupted = false;
    let handlerStarted = false;

    const interruption = new Promise<never>((_, reject) => {
      rejectInterruption = reject;
    });
    const cancel = (reason?: unknown): void => {
      if (interrupted) return;
      interrupted = true;
      const error = new AgentToolCancelledError({ cause: reason });
      rejectInterruption?.(error);
      controller.abort(reason ?? error);
    };
    const timerId = setTimeout(() => {
      if (interrupted) return;
      interrupted = true;
      const error = new AgentToolTimeoutError(definition.timeoutMs);
      rejectInterruption?.(error);
      controller.abort(error);
    }, definition.timeoutMs);
    const active: ActiveCall = { token, controller, cancel, timerId, isWrite };
    activeCalls.set(run.id, active);

    const onParentAbort = () => cancel(signal?.reason);
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      if (signal?.aborted) {
        cancel(signal.reason);
      }

      let attempt = 1;
      while (true) {
        handlerStarted = true;
        const handlerResult = await Promise.race([
          Promise.resolve(definition.handler(call.input, {
            runId: call.runId,
            stepId: call.stepId,
            ...(definition.supportsAbort ? { signal: controller.signal } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
          })),
          interruption,
        ]);

        let result: AgentExecutionResult;
        try {
          result = registry.validateResult(step.toolId, handlerResult);
        } catch (error) {
          return engineError('TOOL_RESULT_INVALID', '工具结果校验失败。', errorDetail(error));
        }

        const canRetry = (
          definition.riskLevel === 'read'
          && definition.idempotent
          && attempt <= definition.maxRetries
          && result.diagnostics?.code === 'NETWORK_TEMPORARY'
        );
        if (!canRetry) return result;
        attempt += 1;
      }
    } catch (error) {
      if (error instanceof AgentToolTimeoutError) {
        return isWrite && handlerStarted
          ? writeOutcomeUnknownResult('timeout')
          : timeoutResult(error.timeoutMs);
      }
      if (error instanceof AgentToolCancelledError) {
        return isWrite && handlerStarted
          ? writeOutcomeUnknownResult('cancelled')
          : cancelledResult();
      }
      return engineError('AGENT_TOOL_EXECUTION_FAILED', '工具执行失败。', errorDetail(error));
    } finally {
      clearTimeout(timerId);
      signal?.removeEventListener('abort', onParentAbort);
      if (activeCalls.get(run.id)?.token === token) activeCalls.delete(run.id);
    }
  };

  const pauseForConfirmation = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): Promise<AgentExecutionResult> => {
    const definition = registry.get(step.toolId);
    if (!definition) {
      const result = engineError('UNKNOWN_TOOL', `未知工具：${step.toolId}`, `Unknown tool: ${step.toolId}`);
      await saveTerminalResult(run, step, result, runProgress);
      return result;
    }

    if (!definition.supportsAbort) {
      const result = engineError(
        'WRITE_ABORT_UNSUPPORTED',
        '写工具必须支持取消信号后才能执行。',
        `Write tool ${step.toolId} does not declare supportsAbort.`,
      );
      return await saveTerminalResult(run, step, result, runProgress);
    }

    try {
      registry.prepareCall(step.toolId, step.input, { runId: run.id, stepId: step.id });
    } catch (error) {
      const result = engineError('TOOL_INPUT_INVALID', '工具输入校验失败。', errorDetail(error));
      await saveTerminalResult(run, step, result, runProgress);
      return result;
    }

    const createdAt = nowIso();
    const confirmation = createAgentConfirmation({
      id: createId('confirmation'),
      runId: run.id,
      stepId: step.id,
      toolId: step.toolId,
      input: step.input,
      riskLevel: definition.riskLevel,
      expiresAt: new Date(Date.parse(createdAt) + confirmationTtlMs).toISOString(),
      idempotencyKey: createId('idempotency'),
      createdAt,
    });
    if (cancelledRuns.has(run.id)) {
      await persistCancelledRun(run, runProgress);
      return cancelledResult();
    }

    return withRunMutation(run.id, async () => {
      const latest = await store.get(run.id);
      if (latest && isTerminalAgentState(latest.state)) {
        Object.assign(run, latest);
        return latest.stepResults[step.id] ?? cancelledResult();
      }
      run.pendingConfirmation = confirmation;
      run.confirmationHistory[confirmation.id] = { confirmation };
      await store.save(run);
      if (cancelledRuns.has(run.id)) {
        forceCancelled(run);
        await store.save(run);
        return cancelledResult();
      }

      transition(run, 'awaiting_confirmation', `Confirmation required for ${step.toolId}.`);
      appendPersistedProgress(run, {
        phase: 'awaiting_confirmation',
        label: `等待确认：${definition.title}`,
        status: 'waiting_confirmation',
        toolId: step.toolId,
        stepId: step.id,
      }, runProgress);
      await store.save(run);
      if (cancelledRuns.has(run.id)) {
        forceCancelled(run);
        await store.save(run);
        return cancelledResult();
      }

      return engineError(
        'CONFIRMATION_REQUIRED',
        '此操作需要确认后才能执行。',
        confirmation.id,
      );
    });
  };

  const executeStep = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    signal?: AbortSignal,
    idempotencyKey?: string,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): Promise<AgentExecutionResult> => {
    if (cancelledRuns.has(run.id)) {
      return await saveTerminalResult(run, step, cancelledResult(), runProgress);
    }

    const canStart = await withRunMutation(run.id, async () => {
      const latest = await store.get(run.id);
      if (latest && isTerminalAgentState(latest.state)) {
        Object.assign(run, latest);
        return false;
      }
      if (cancelledRuns.has(run.id)) return false;
      appendPersistedProgress(run, {
        phase: 'executing',
        label: `正在执行：${step.toolId}`,
        status: 'running',
        toolId: step.toolId,
        stepId: step.id,
      }, runProgress);
      await store.save(run);
      return !cancelledRuns.has(run.id);
    });
    if (!canStart) return await saveTerminalResult(run, step, cancelledResult(), runProgress);

    const result = await executeToolCall(run, step, signal, idempotencyKey);
    return await saveTerminalResult(run, step, result, runProgress);
  };

  const continuePlan = async (
    run: AgentRunRecord,
    signal?: AbortSignal,
    initialResult?: AgentExecutionResult,
    runProgress?: (event: AgentExecutionProgressEvent) => void,
  ): Promise<AgentExecutionResult> => {
    const plan = run.plan;
    if (!plan) {
      return engineError('PLAN_MISSING', '运行记录缺少执行计划。');
    }

    let latestResult = initialResult;
    while (Object.keys(run.stepResults).length < plan.steps.length) {
      if (cancelledRuns.has(run.id)) {
        await persistCancelledRun(run, runProgress);
        return cancelledResult();
      }
      const nextStep = plan.steps.find((step) => (
        run.stepResults[step.id] === undefined
        && step.dependsOn.every((dependencyId) => run.stepResults[dependencyId]?.status === 'success')
      ));

      if (!nextStep) {
        const result = engineError('PLAN_DEPENDENCY_BLOCKED', '执行计划的依赖无法继续。');
        const fallbackStep = plan.steps.find((step) => run.stepResults[step.id] === undefined) ?? plan.steps[0];
        return await saveTerminalResult(run, fallbackStep, result, runProgress);
      }

      const definition = registry.get(nextStep.toolId);
      if (!definition) {
        const result = engineError('UNKNOWN_TOOL', `未知工具：${nextStep.toolId}`, `Unknown tool: ${nextStep.toolId}`);
        return await saveTerminalResult(run, nextStep, result, runProgress);
      }

      if (requiresConfirmation(definition.riskLevel)) {
        return pauseForConfirmation(run, nextStep, runProgress);
      }

      latestResult = await executeStep(run, nextStep, signal, undefined, runProgress);
      if (latestResult.status !== 'success') return latestResult;
    }

    const latest = await store.get(run.id);
    if (latest && isTerminalAgentState(latest.state)) {
      return latestResult ?? engineError('RUN_TERMINAL', '运行已结束。');
    }
    if (cancelledRuns.has(run.id)) {
      await persistCancelledRun(run, runProgress);
      return cancelledResult();
    }
    const composed = await withRunMutation(run.id, async () => {
      const current = await store.get(run.id);
      if (current && isTerminalAgentState(current.state)) {
        Object.assign(run, current);
        return false;
      }
      if (cancelledRuns.has(run.id)) {
        forceCancelled(run);
        await store.save(run);
        return false;
      }
      transition(run, 'composing', 'All tool steps completed.');
      await store.save(run);
      if (cancelledRuns.has(run.id)) {
        forceCancelled(run);
        await store.save(run);
        return false;
      }
      return true;
    });
    if (!composed) return cancelledResult();
    return latestResult ?? engineError('PLAN_EMPTY', '执行计划没有可用步骤。');
  };

  const failRun = async (
    runId: string,
    prompt: string,
    error: unknown,
  ): Promise<AgentExecutionResult> => {
    const result = engineError('AGENT_EXECUTION_FAILED', 'Agent 执行失败。', errorDetail(error));
    try {
      let run = await store.get(runId);
      if (!run) {
        const startedAt = nowIso();
        run = createAgentRun({ id: runId, prompt, startedAt });
      }
      if (!isTerminalAgentState(run.state)) {
        if (run.state === 'awaiting_confirmation') {
          transition(run, 'executing', 'Confirmation resume failed.');
        }
        transition(run, 'failed', result.message);
        run.terminalError = { code: result.diagnostics!.code, message: result.message };
        await store.save(run);
      }
    } catch {
      // Preserve the structured result even if persistence itself is unavailable.
    }
    return result;
  };

  const executePlanCore = async ({
    runId,
    prompt,
    plan,
    signal,
    onProgress: runProgress,
  }: ExecutePlanInput): Promise<AgentExecutionResult> => {
    const parsedPlan = agentPlanSchema.parse(plan);
    const existing = await store.get(runId);
    if (existing) return engineError('RUN_ALREADY_EXISTS', '该运行记录已存在。', runId);

    const startedAt = nowIso();
    const run = createAgentRun({ id: runId, prompt, startedAt });
    run.plan = parsedPlan;
    transition(run, 'executing', 'Plan execution started.');
    await store.save(run);
    return continuePlan(run, signal, undefined, runProgress);
  };

  const engine: AgentExecutionEngine = {
    async executePlan(input) {
      const operation = (async () => {
        try {
          return await executePlanCore(input);
        } catch (error) {
          return await failRun(input.runId, input.prompt, error);
        } finally {
          clearActiveCall(input.runId);
        }
      })();
      return await trackOperation(input.runId, operation);
    },

    async executeSingleTool(input) {
      const operation = (async () => {
        try {
          return await executePlanCore({
            runId: input.runId,
            prompt: input.prompt,
            signal: input.signal,
            plan: {
              version: 2,
              kind: 'complex_agent',
              summary: input.prompt || `Execute ${input.toolId}`,
              steps: [{
                id: input.stepId ?? 'single-step',
                toolId: input.toolId,
                input: input.input,
                dependsOn: [],
              }],
            },
            onProgress: input.onProgress,
          });
        } catch (error) {
          return await failRun(input.runId, input.prompt, error);
        } finally {
          clearActiveCall(input.runId);
        }
      })();
      return await trackOperation(input.runId, operation);
    },

    async resumeConfirmedRun(input) {
      const operation = serializeResume(input.runId, async () => {
        try {
          const parsedConfirmation = agentConfirmationSchema.safeParse(input.confirmation);
          if (!parsedConfirmation.success) {
            return engineError('CONFIRMATION_INVALID', '确认数据不符合 V2 协议。');
          }
          const provided = parsedConfirmation.data;
          let run = await store.get(input.runId);
          if (!run) return engineError('RUN_NOT_FOUND', '未找到待确认的运行记录。', input.runId);

          let history = run.confirmationHistory[provided.id];
          if (
            !history
            && run.pendingConfirmation
            && confirmationMatches(run.pendingConfirmation, provided)
          ) {
            history = { confirmation: run.pendingConfirmation };
          }
          if (!history || !confirmationMatches(history.confirmation, provided)) {
            return engineError('CONFIRMATION_CONTEXT_MISMATCH', '确认信息与待执行操作不匹配。');
          }
          if (history.result) return history.result;

          const stored = history.confirmation;
          if (stored.consumedAt) {
            if (run.state === 'awaiting_confirmation') {
              transition(run, 'executing', 'Consumed confirmation has no persisted result.');
            }
            if (!isTerminalAgentState(run.state)) {
              transition(run, 'failed', 'Consumed confirmation has no persisted result.');
              run.terminalError = {
                code: 'CONFIRMATION_RESULT_UNKNOWN',
                message: '确认已消费，但没有可安全重放的执行结果。',
              };
              await store.save(run);
            }
            return engineError('CONFIRMATION_RESULT_UNKNOWN', '确认已消费，无法重复执行写操作。');
          }
          if (run.state !== 'awaiting_confirmation' || run.pendingConfirmation?.id !== stored.id) {
            return engineError('RUN_NOT_AWAITING_CONFIRMATION', '当前运行不在等待此确认的状态。');
          }

          const step = run.plan?.steps.find((candidate) => candidate.id === stored.stepId);
          if (!step) return engineError('CONFIRMATION_STEP_MISSING', '确认对应的计划步骤不存在。');

          const validation = validateAgentConfirmation(stored, {
            runId: run.id,
            stepId: step.id,
            toolId: step.toolId,
            input: step.input,
            idempotencyKey: stored.idempotencyKey,
            now: nowIso(),
          });
          if (!validation.ok) {
            const code = validation.reason === 'confirmation_expired'
              ? 'CONFIRMATION_EXPIRED'
              : validation.reason === 'confirmation_already_consumed'
                ? 'CONFIRMATION_ALREADY_CONSUMED'
                : 'CONFIRMATION_CONTEXT_MISMATCH';
            return engineError(code, '确认校验失败。', validation.reason);
          }

          let claimed = false;
          const claimedRun = await withRunMutation(run.id, () => store.update(run.id, (current) => {
            let currentHistory = current.confirmationHistory[provided.id];
            if (
              !currentHistory
              && current.pendingConfirmation
              && confirmationMatches(current.pendingConfirmation, provided)
            ) {
              currentHistory = { confirmation: current.pendingConfirmation };
              current.confirmationHistory[provided.id] = currentHistory;
            }
            if (
              !currentHistory
              || currentHistory.result
              || currentHistory.confirmation.consumedAt
              || current.state !== 'awaiting_confirmation'
              || current.pendingConfirmation?.id !== provided.id
              || !confirmationMatches(currentHistory.confirmation, provided)
            ) {
              return current;
            }

            const consumedAt = nowIso();
            markConfirmationConsumed(currentHistory.confirmation, consumedAt);
            if (current.pendingConfirmation?.id === provided.id) {
              markConfirmationConsumed(current.pendingConfirmation, consumedAt);
            }
            transition(current, 'executing', 'Confirmation consumed.');
            claimed = true;
            return current;
          }));
          if (!claimedRun) return engineError('RUN_NOT_FOUND', '未找到待确认的运行记录。', input.runId);
          run = claimedRun;
          history = run.confirmationHistory[provided.id];
          if (history.result) return history.result;
          if (!claimed) {
            return history.confirmation.consumedAt
              ? engineError('CONFIRMATION_RESULT_UNKNOWN', '确认已消费，无法重复执行写操作。')
              : engineError('CONFIRMATION_CONTEXT_MISMATCH', '确认信息与待执行操作不匹配。');
          }

          const result = await executeStep(
            run,
            step,
            input.signal,
            history.confirmation.idempotencyKey,
            input.onProgress,
          );
          if (result.status !== 'success') return result;
          return await continuePlan(run, input.signal, result, input.onProgress);
        } catch (error) {
          return await failRun(input.runId, '', error);
        } finally {
          clearActiveCall(input.runId);
        }
      });
      return await trackOperation(input.runId, operation);
    },

    async cancelRun(runId) {
      try {
        cancelledRuns.add(runId);
        const active = activeCalls.get(runId);
        active?.cancel(new AgentToolCancelledError());
        const run = await store.get(runId);
        if (!run) {
          await waitForRunOperations(runId);
          return await store.get(runId);
        }

        const pendingHistory = run.pendingConfirmation
          ? run.confirmationHistory[run.pendingConfirmation.id]
          : undefined;
        const writeOutcomePending = active?.isWrite === true
          || Boolean(run.pendingConfirmation?.consumedAt && !pendingHistory?.result);

        if (writeOutcomePending) {
          await waitForRunOperations(runId);
          return await store.get(runId);
        }

        if (!isTerminalAgentState(run.state)) await persistCancelledRun(run);
        await waitForRunOperations(runId);
        const latest = await store.get(runId);
        return latest;
      } catch {
        return await store.get(runId);
      } finally {
        clearActiveCall(runId);
        cancelledRuns.delete(runId);
      }
    },
  };

  return engine;
};

export const executePlan = (
  engine: AgentExecutionEngine,
  input: ExecutePlanInput,
): Promise<AgentExecutionResult> => engine.executePlan(input);

export const executeSingleTool = (
  engine: AgentExecutionEngine,
  input: ExecuteSingleToolInput,
): Promise<AgentExecutionResult> => engine.executeSingleTool(input);

export const resumeConfirmedRun = (
  engine: AgentExecutionEngine,
  input: ResumeConfirmedRunInput,
): Promise<AgentExecutionResult> => engine.resumeConfirmedRun(input);

export const cancelRun = (
  engine: AgentExecutionEngine,
  runId: string,
): Promise<AgentRunRecord | null> => engine.cancelRun(runId);
