import {
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
};

export type ExecuteSingleToolInput = {
  runId: string;
  prompt: string;
  toolId: string;
  input: Record<string, unknown>;
  stepId?: string;
  signal?: AbortSignal;
};

export type ResumeConfirmedRunInput = {
  runId: string;
  confirmation: AgentConfirmation;
  signal?: AbortSignal;
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
  stored.id === provided.id
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

  const nowDate = (): Date => {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Agent execution clock returned an invalid date.');
    return date;
  };

  const nowIso = (): string => nowDate().toISOString();

  const emit = (event: AgentExecutionProgressEvent): void => {
    try {
      onProgress?.(event);
    } catch {
      // UI progress observers cannot change execution semantics.
    }
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
  ): void => {
    const progressEvent: AgentProgressEvent = { ...event, at: nowIso() };
    appendProgress(run, progressEvent);
    emit(progressEvent);
  };

  const emitTerminalProgress = (
    run: AgentRunRecord,
    status: 'timeout' | 'cancelled',
    label: string,
    step?: AgentPlanStep,
  ): void => {
    emit({
      at: nowIso(),
      phase: run.state,
      label,
      status,
      ...(step ? { toolId: step.toolId, stepId: step.id } : {}),
    });
  };

  const clearActiveCall = (runId: string): void => {
    const active = activeCalls.get(runId);
    if (!active) return;
    clearTimeout(active.timerId);
    active.controller.abort(new AgentToolCancelledError());
    activeCalls.delete(runId);
  };

  const saveTerminalResult = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    result: AgentExecutionResult,
  ): Promise<void> => {
    const latest = await store.get(run.id);
    if (latest && isTerminalAgentState(latest.state)) return;

    run.stepResults[step.id] = result;
    const persistedStatus = result.status === 'success' ? 'completed' : 'failed';
    appendPersistedProgress(run, {
      phase: 'executing',
      label: result.message,
      status: persistedStatus,
      toolId: step.toolId,
      stepId: step.id,
    });

    if (result.status === 'success') {
      await store.save(run);
      return;
    }

    const nextState = result.status === 'timeout'
      ? 'timed_out'
      : result.status === 'cancelled'
        ? 'cancelled'
        : 'failed';
    transition(run, nextState, result.message);
    run.terminalError = {
      code: result.diagnostics?.code ?? 'AGENT_TOOL_FAILED',
      message: result.message,
    };
    await store.save(run);

    if (result.status === 'timeout' || result.status === 'cancelled') {
      emitTerminalProgress(run, result.status, result.message, step);
    }
  };

  const executeToolCall = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<AgentExecutionResult> => {
    if (signal?.aborted) return cancelledResult();

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
    let rejectInterruption: ((error: AgentToolTimeoutError | AgentToolCancelledError) => void) | undefined;
    let interrupted = false;

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
    const active: ActiveCall = { token, controller, cancel, timerId };
    activeCalls.set(run.id, active);

    const onParentAbort = () => cancel(signal?.reason);
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      if (signal?.aborted) {
        cancel(signal.reason);
      }

      let attempt = 1;
      while (true) {
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
      if (error instanceof AgentToolTimeoutError) return timeoutResult(error.timeoutMs);
      if (error instanceof AgentToolCancelledError) return cancelledResult();
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
  ): Promise<AgentExecutionResult> => {
    const definition = registry.get(step.toolId);
    if (!definition) {
      const result = engineError('UNKNOWN_TOOL', `未知工具：${step.toolId}`, `Unknown tool: ${step.toolId}`);
      await saveTerminalResult(run, step, result);
      return result;
    }

    try {
      registry.prepareCall(step.toolId, step.input, { runId: run.id, stepId: step.id });
    } catch (error) {
      const result = engineError('TOOL_INPUT_INVALID', '工具输入校验失败。', errorDetail(error));
      await saveTerminalResult(run, step, result);
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
    run.pendingConfirmation = confirmation;
    await store.save(run);
    transition(run, 'awaiting_confirmation', `Confirmation required for ${step.toolId}.`);
    appendPersistedProgress(run, {
      phase: 'awaiting_confirmation',
      label: `等待确认：${definition.title}`,
      status: 'waiting_confirmation',
      toolId: step.toolId,
      stepId: step.id,
    });
    await store.save(run);

    return engineError(
      'CONFIRMATION_REQUIRED',
      '此操作需要确认后才能执行。',
      confirmation.id,
    );
  };

  const executeStep = async (
    run: AgentRunRecord,
    step: AgentPlanStep,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<AgentExecutionResult> => {
    appendPersistedProgress(run, {
      phase: 'executing',
      label: `正在执行：${step.toolId}`,
      status: 'running',
      toolId: step.toolId,
      stepId: step.id,
    });
    await store.save(run);

    const result = await executeToolCall(run, step, signal, idempotencyKey);
    await saveTerminalResult(run, step, result);
    return result;
  };

  const continuePlan = async (
    run: AgentRunRecord,
    signal?: AbortSignal,
    initialResult?: AgentExecutionResult,
  ): Promise<AgentExecutionResult> => {
    const plan = run.plan;
    if (!plan) {
      return engineError('PLAN_MISSING', '运行记录缺少执行计划。');
    }

    let latestResult = initialResult;
    while (Object.keys(run.stepResults).length < plan.steps.length) {
      const nextStep = plan.steps.find((step) => (
        run.stepResults[step.id] === undefined
        && step.dependsOn.every((dependencyId) => run.stepResults[dependencyId]?.status === 'success')
      ));

      if (!nextStep) {
        const result = engineError('PLAN_DEPENDENCY_BLOCKED', '执行计划的依赖无法继续。');
        const fallbackStep = plan.steps.find((step) => run.stepResults[step.id] === undefined) ?? plan.steps[0];
        await saveTerminalResult(run, fallbackStep, result);
        return result;
      }

      const definition = registry.get(nextStep.toolId);
      if (!definition) {
        const result = engineError('UNKNOWN_TOOL', `未知工具：${nextStep.toolId}`, `Unknown tool: ${nextStep.toolId}`);
        await saveTerminalResult(run, nextStep, result);
        return result;
      }

      if (requiresConfirmation(definition.riskLevel)) {
        return pauseForConfirmation(run, nextStep);
      }

      latestResult = await executeStep(run, nextStep, signal);
      if (latestResult.status !== 'success') return latestResult;
    }

    const latest = await store.get(run.id);
    if (latest && isTerminalAgentState(latest.state)) {
      return latestResult ?? engineError('RUN_TERMINAL', '运行已结束。');
    }
    transition(run, 'composing', 'All tool steps completed.');
    await store.save(run);
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
  }: ExecutePlanInput): Promise<AgentExecutionResult> => {
    const parsedPlan = agentPlanSchema.parse(plan);
    const existing = await store.get(runId);
    if (existing) return engineError('RUN_ALREADY_EXISTS', '该运行记录已存在。', runId);

    const startedAt = nowIso();
    const run = createAgentRun({ id: runId, prompt, startedAt });
    run.plan = parsedPlan;
    transition(run, 'executing', 'Plan execution started.');
    await store.save(run);
    return continuePlan(run, signal);
  };

  const engine: AgentExecutionEngine = {
    async executePlan(input) {
      try {
        return await executePlanCore(input);
      } catch (error) {
        return await failRun(input.runId, input.prompt, error);
      } finally {
        clearActiveCall(input.runId);
      }
    },

    async executeSingleTool(input) {
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
        });
      } catch (error) {
        return await failRun(input.runId, input.prompt, error);
      } finally {
        clearActiveCall(input.runId);
      }
    },

    async resumeConfirmedRun(input) {
      try {
        const run = await store.get(input.runId);
        if (!run) return engineError('RUN_NOT_FOUND', '未找到待确认的运行记录。', input.runId);

        const stored = run.pendingConfirmation;
        if (!stored || !confirmationMatches(stored, input.confirmation)) {
          return engineError('CONFIRMATION_CONTEXT_MISMATCH', '确认信息与待执行操作不匹配。');
        }

        const replay = run.stepResults[stored.stepId];
        if (stored.consumedAt && replay) return replay;
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
        if (run.state !== 'awaiting_confirmation') {
          return engineError('RUN_NOT_AWAITING_CONFIRMATION', '当前运行不在等待确认状态。');
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

        markConfirmationConsumed(stored, nowIso());
        await store.save(run);
        transition(run, 'executing', 'Confirmation consumed.');
        await store.save(run);

        const result = await executeStep(run, step, input.signal, stored.idempotencyKey);
        if (result.status !== 'success') return result;
        return await continuePlan(run, input.signal, result);
      } catch (error) {
        return await failRun(input.runId, '', error);
      } finally {
        clearActiveCall(input.runId);
      }
    },

    async cancelRun(runId) {
      try {
        activeCalls.get(runId)?.cancel(new AgentToolCancelledError());
        const run = await store.get(runId);
        if (!run || isTerminalAgentState(run.state)) return run;

        transition(run, 'cancelled', 'User cancelled the run.');
        run.terminalError = { code: 'AGENT_RUN_CANCELLED', message: '操作已取消。' };
        await store.save(run);
        emitTerminalProgress(run, 'cancelled', '操作已取消。');
        return run;
      } catch {
        return await store.get(runId);
      } finally {
        clearActiveCall(runId);
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
