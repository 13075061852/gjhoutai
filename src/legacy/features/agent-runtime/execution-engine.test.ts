import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfirmation, AgentPlanV2, AgentToolDefinition } from './protocol';
import { createMemoryAgentRunStore, type AgentRunStore } from './run-store';
import { createAgentToolRegistry } from './tool-registry';
import {
  createAgentExecutionEngine,
  type AgentExecutionProgressEvent,
} from './execution-engine';

const fixedNow = () => '2026-07-31T00:00:00.000Z';

const planOf = (...steps: AgentPlanV2['steps']): AgentPlanV2 => ({
  version: 2,
  kind: 'complex_agent',
  summary: '执行测试计划',
  steps,
});

const createTool = (
  overrides: Partial<AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>> = {},
): AgentToolDefinition<Record<string, unknown>, Record<string, unknown>> => ({
  id: 'inventory.read',
  version: 1,
  title: '读取库存',
  description: '读取库存测试数据',
  category: 'business',
  riskLevel: 'read',
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  timeoutMs: 30_000,
  maxRetries: 1,
  idempotent: true,
  supportsAbort: true,
  handler: async () => ({
    status: 'success',
    message: '读取完成。',
    data: { count: 3 },
    evidence: [],
    actions: [],
  }),
  ...overrides,
});

const createEngine = ({
  tools,
  store = createMemoryAgentRunStore(),
  progress,
}: {
  tools: AgentToolDefinition[];
  store?: AgentRunStore;
  progress?: AgentExecutionProgressEvent[];
}) => {
  let nextId = 0;
  const engine = createAgentExecutionEngine({
    registry: createAgentToolRegistry(tools),
    store,
    now: fixedNow,
    createId: (prefix) => `${prefix}-${++nextId}`,
    onProgress: progress ? (event) => progress.push(event) : undefined,
  });
  return { engine, store };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('agent execution engine', () => {
  it('retries an idempotent read once for a temporary network result', async () => {
    const handler = vi.fn()
      .mockResolvedValueOnce({
        status: 'error',
        message: '网络暂时不可用。',
        data: {},
        evidence: [],
        actions: [],
        diagnostics: { code: 'NETWORK_TEMPORARY', detail: 'retryable' },
      })
      .mockResolvedValueOnce({
        status: 'success',
        message: '读取完成。',
        data: { count: 3 },
        evidence: [],
        actions: [],
      });
    const { engine, store } = createEngine({ tools: [createTool({ handler })] });

    const result = await engine.executeSingleTool({
      runId: 'run-read',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
    });

    expect(result.status).toBe('success');
    expect(handler).toHaveBeenCalledTimes(2);
    expect((await store.get('run-read'))?.state).toBe('composing');
  });

  it('never executes a create tool before confirmation and does not retry the write', async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 'success',
      message: '创建完成。',
      data: { id: 'formula-1' },
      evidence: [],
      actions: [],
    });
    const tool = createTool({
      id: 'formula.create',
      title: '创建配方',
      riskLevel: 'create',
      idempotent: false,
      maxRetries: 1,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-create',
      prompt: '创建配方',
      toolId: 'formula.create',
      input: { name: 'PBT-A' },
    });
    const waiting = await store.get('run-create');

    expect(waiting?.state).toBe('awaiting_confirmation');
    expect(handler).not.toHaveBeenCalled();

    await engine.resumeConfirmedRun({
      runId: 'run-create',
      confirmation: waiting!.pendingConfirmation!,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect((await store.get('run-create'))?.state).toBe('composing');
  });

  it('uses one deadline for a never-settling tool and reports timeout distinctly', async () => {
    vi.useFakeTimers();
    const progress: AgentExecutionProgressEvent[] = [];
    const handler = vi.fn(() => new Promise<never>(() => undefined));
    const { engine, store } = createEngine({
      tools: [createTool({ timeoutMs: 100, handler })],
      progress,
    });

    const execution = engine.executeSingleTool({
      runId: 'run-timeout',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await execution;

    expect(result.status).toBe('timeout');
    expect((await store.get('run-timeout'))?.state).toBe('timed_out');
    expect(progress.at(-1)?.status).toBe('timeout');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation to abort-aware tools and preserves cancelled state', async () => {
    let receivedSignal: AbortSignal | undefined;
    const handler = vi.fn((_input, context) => {
      receivedSignal = context.signal;
      return new Promise<never>(() => undefined);
    });
    const { engine, store } = createEngine({ tools: [createTool({ handler, supportsAbort: true })] });
    const parent = new AbortController();

    const execution = engine.executeSingleTool({
      runId: 'run-cancel',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
      signal: parent.signal,
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    parent.abort(new Error('user cancelled'));
    const result = await execution;

    expect(result.status).toBe('cancelled');
    expect(receivedSignal?.aborted).toBe(true);
    expect((await store.get('run-cancel'))?.state).toBe('cancelled');
  });

  it('cancels an active run through cancelRun even when its handler ignores abort', async () => {
    const handler = vi.fn(() => new Promise<never>(() => undefined));
    const { engine, store } = createEngine({ tools: [createTool({ handler })] });

    const execution = engine.executeSingleTool({
      runId: 'run-explicit-cancel',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await engine.cancelRun('run-explicit-cancel');
    const result = await execution;

    expect(result.status).toBe('cancelled');
    expect((await store.get('run-explicit-cancel'))?.state).toBe('cancelled');
  });

  it('consumes and persists an exact delete confirmation before invoking the handler', async () => {
    const events: string[] = [];
    let usedIdempotencyKey: string | undefined;
    const backingStore = createMemoryAgentRunStore();
    const store: AgentRunStore = {
      ...backingStore,
      save: async (run) => {
        if (run.pendingConfirmation && !run.pendingConfirmation.consumedAt) {
          events.push(`pending persisted:${run.state}`);
        }
        if (run.pendingConfirmation?.consumedAt) events.push('confirmation persisted');
        await backingStore.save(run);
      },
    };
    const handler = vi.fn(async (_input, context) => {
      events.push('handler invoked');
      usedIdempotencyKey = context.idempotencyKey;
      return {
        status: 'success' as const,
        message: '删除完成。',
        data: { deleted: true },
        evidence: [],
        actions: [],
      };
    });
    const deleteTool = createTool({
      id: 'spectrum.delete',
      title: '删除图谱',
      riskLevel: 'delete',
      idempotent: false,
      handler,
    });
    const { engine } = createEngine({ tools: [deleteTool], store });

    await engine.executePlan({
      runId: 'run-delete',
      prompt: '删除图谱',
      plan: planOf({
        id: 'delete-step',
        toolId: 'spectrum.delete',
        input: { id: 'spectrum-1' },
        dependsOn: [],
      }),
    });
    const waiting = await store.get('run-delete');
    const confirmation = waiting!.pendingConfirmation!;

    expect(waiting?.state).toBe('awaiting_confirmation');
    expect(handler).not.toHaveBeenCalled();
    expect(events.slice(0, 2)).toEqual([
      'pending persisted:executing',
      'pending persisted:awaiting_confirmation',
    ]);

    const firstResult = await engine.resumeConfirmedRun({
      runId: 'run-delete',
      confirmation,
    });
    const replayResult = await engine.resumeConfirmedRun({
      runId: 'run-delete',
      confirmation,
    });

    expect(firstResult).toEqual(replayResult);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(usedIdempotencyKey).toBe(confirmation.idempotencyKey);
    expect(events.indexOf('confirmation persisted')).toBeLessThan(events.indexOf('handler invoked'));
  });

  it('serializes concurrent confirmation resumes and returns one persisted write result', async () => {
    let resolveWrite!: (result: AgentExecutionResultFixture) => void;
    const pendingWrite = new Promise<AgentExecutionResultFixture>((resolve) => {
      resolveWrite = resolve;
    });
    const writeResult = {
      status: 'success' as const,
      message: '创建完成。',
      data: { id: 'formula-concurrent' },
      evidence: [],
      actions: [],
    };
    const handler = vi.fn(() => pendingWrite);
    const tool = createTool({
      id: 'formula.create.concurrent',
      title: '并发创建配方',
      riskLevel: 'create',
      idempotent: false,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-concurrent-resume',
      prompt: '创建配方',
      toolId: tool.id,
      input: { name: 'PBT-C' },
    });
    const confirmation = (await store.get('run-concurrent-resume'))!.pendingConfirmation!;

    const first = engine.resumeConfirmedRun({ runId: 'run-concurrent-resume', confirmation });
    const second = engine.resumeConfirmedRun({ runId: 'run-concurrent-resume', confirmation });
    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    resolveWrite(writeResult);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(writeResult);
    expect(secondResult).toEqual(writeResult);
  });

  it('replays an earlier write after a later write replaces the pending confirmation', async () => {
    const firstHandler = vi.fn().mockResolvedValue({
      status: 'success',
      message: '第一笔写入完成。',
      data: { id: 'first-write' },
      evidence: [],
      actions: [],
    });
    const secondHandler = vi.fn().mockResolvedValue({
      status: 'success',
      message: '第二笔写入完成。',
      data: { id: 'second-write' },
      evidence: [],
      actions: [],
    });
    const firstTool = createTool({
      id: 'write.first',
      title: '第一笔写入',
      riskLevel: 'create',
      idempotent: false,
      handler: firstHandler,
    });
    const secondTool = createTool({
      id: 'write.second',
      title: '第二笔写入',
      riskLevel: 'update',
      idempotent: false,
      handler: secondHandler,
    });
    const { engine, store } = createEngine({ tools: [firstTool, secondTool] });

    await engine.executePlan({
      runId: 'run-multi-write',
      prompt: '连续执行两笔写入',
      plan: planOf(
        { id: 'first', toolId: firstTool.id, input: { id: 'one' }, dependsOn: [] },
        { id: 'second', toolId: secondTool.id, input: { id: 'two' }, dependsOn: ['first'] },
      ),
    });
    const firstConfirmation = (await store.get('run-multi-write'))!.pendingConfirmation!;
    await engine.resumeConfirmedRun({
      runId: 'run-multi-write',
      confirmation: firstConfirmation,
    });
    const waitingOnSecond = await store.get('run-multi-write');

    expect(waitingOnSecond?.state).toBe('awaiting_confirmation');
    expect(waitingOnSecond?.pendingConfirmation?.stepId).toBe('second');

    const replay = await engine.resumeConfirmedRun({
      runId: 'run-multi-write',
      confirmation: firstConfirmation,
    });

    expect(replay).toMatchObject({
      status: 'success',
      data: { id: 'first-write' },
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it('resumes an existing V2 pending confirmation that predates confirmation history', async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 'success',
      message: '旧确认执行完成。',
      data: { id: 'legacy-pending-write' },
      evidence: [],
      actions: [],
    });
    const tool = createTool({
      id: 'write.legacy-pending',
      title: '旧待确认写入',
      riskLevel: 'create',
      idempotent: false,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-legacy-pending',
      prompt: '恢复旧待确认写入',
      toolId: tool.id,
      input: { id: 'legacy-1' },
    });
    const legacyRun = (await store.get('run-legacy-pending'))!;
    const confirmation = legacyRun.pendingConfirmation!;
    legacyRun.confirmationHistory = {};
    await store.save(legacyRun);

    const result = await engine.resumeConfirmedRun({
      runId: legacyRun.id,
      confirmation,
    });

    expect(result).toMatchObject({ status: 'success', data: { id: 'legacy-pending-write' } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects a different confirmation without invoking a write handler', async () => {
    const handler = vi.fn();
    const tool = createTool({
      id: 'formula.update',
      title: '修改配方',
      riskLevel: 'update',
      idempotent: false,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-wrong-confirmation',
      prompt: '修改配方',
      toolId: 'formula.update',
      input: { id: 'formula-1' },
    });
    const waiting = await store.get('run-wrong-confirmation');
    const wrongConfirmation: AgentConfirmation = {
      ...waiting!.pendingConfirmation!,
      idempotencyKey: 'different-key',
    };

    const result = await engine.resumeConfirmedRun({
      runId: 'run-wrong-confirmation',
      confirmation: wrongConfirmation,
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics?.code).toBe('CONFIRMATION_CONTEXT_MISMATCH');
    expect(handler).not.toHaveBeenCalled();
    expect((await store.get('run-wrong-confirmation'))?.state).toBe('awaiting_confirmation');
  });

  it('runtime-validates the confirmation version before matching or invoking a write', async () => {
    const handler = vi.fn();
    const tool = createTool({
      id: 'formula.update.versioned',
      title: '修改配方',
      riskLevel: 'update',
      idempotent: false,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-invalid-confirmation-version',
      prompt: '修改配方',
      toolId: tool.id,
      input: { id: 'formula-1' },
    });
    const confirmation = (await store.get('run-invalid-confirmation-version'))!.pendingConfirmation!;

    const result = await engine.resumeConfirmedRun({
      runId: 'run-invalid-confirmation-version',
      confirmation: { ...confirmation, version: 1 } as unknown as AgentConfirmation,
    });

    expect(result.diagnostics?.code).toBe('CONFIRMATION_INVALID');
    expect(handler).not.toHaveBeenCalled();
  });

  it('topologically executes ready steps in their declared order', async () => {
    const calls: string[] = [];
    const first = createTool({
      id: 'tool.first',
      title: '第一步',
      handler: async () => {
        calls.push('first');
        return { status: 'success', message: '第一步完成。', data: {}, evidence: [], actions: [] };
      },
    });
    const second = createTool({
      id: 'tool.second',
      title: '第二步',
      handler: async () => {
        calls.push('second');
        return { status: 'success', message: '第二步完成。', data: {}, evidence: [], actions: [] };
      },
    });
    const dependent = createTool({
      id: 'tool.dependent',
      title: '依赖步骤',
      handler: async () => {
        calls.push('dependent');
        return { status: 'success', message: '依赖步骤完成。', data: {}, evidence: [], actions: [] };
      },
    });
    const { engine, store } = createEngine({ tools: [first, second, dependent] });

    await engine.executePlan({
      runId: 'run-order',
      prompt: '按依赖执行',
      plan: planOf(
        { id: 'dependent', toolId: 'tool.dependent', input: {}, dependsOn: ['first'] },
        { id: 'first', toolId: 'tool.first', input: {}, dependsOn: [] },
        { id: 'second', toolId: 'tool.second', input: {}, dependsOn: [] },
      ),
    });

    expect(calls).toEqual(['first', 'dependent', 'second']);
    expect((await store.get('run-order'))?.state).toBe('composing');
  });

  it('validates tool input through the registry before calling the handler', async () => {
    const handler = vi.fn();
    const tool = createTool({
      inputSchema: z.object({ count: z.number() }),
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    const result = await engine.executeSingleTool({
      runId: 'run-invalid-input',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: { count: '3' },
    });

    expect(result.status).toBe('error');
    expect(handler).not.toHaveBeenCalled();
    expect((await store.get('run-invalid-input'))?.state).toBe('failed');
  });

  it('rejects invalid write input before creating a confirmation', async () => {
    const handler = vi.fn();
    const tool = createTool({
      id: 'formula.create.validated',
      title: '创建配方',
      riskLevel: 'create',
      idempotent: false,
      inputSchema: z.object({ name: z.string().min(1) }),
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    const result = await engine.executeSingleTool({
      runId: 'run-invalid-write',
      prompt: '创建配方',
      toolId: 'formula.create.validated',
      input: { name: 7 },
    });
    const run = await store.get('run-invalid-write');

    expect(result.diagnostics?.code).toBe('TOOL_INPUT_INVALID');
    expect(run?.state).toBe('failed');
    expect(run?.pendingConfirmation).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not start a handler when the parent signal is already aborted', async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 'success',
      message: '不应执行。',
      data: {},
      evidence: [],
      actions: [],
    });
    const parent = new AbortController();
    parent.abort(new Error('cancelled before execution'));
    const { engine, store } = createEngine({ tools: [createTool({ handler })] });

    const result = await engine.executeSingleTool({
      runId: 'run-pre-cancelled',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
      signal: parent.signal,
    });

    expect(result.status).toBe('cancelled');
    expect(handler).not.toHaveBeenCalled();
    expect((await store.get('run-pre-cancelled'))?.state).toBe('cancelled');
  });

  it('does not retry non-idempotent reads or non-temporary failures', async () => {
    const temporary = vi.fn().mockResolvedValue({
      status: 'error',
      message: '暂时失败。',
      data: {},
      evidence: [],
      actions: [],
      diagnostics: { code: 'NETWORK_TEMPORARY', detail: 'temporary' },
    });
    const permanent = vi.fn().mockResolvedValue({
      status: 'error',
      message: '永久失败。',
      data: {},
      evidence: [],
      actions: [],
      diagnostics: { code: 'INVALID_REQUEST', detail: 'permanent' },
    });
    const { engine } = createEngine({
      tools: [
        createTool({ id: 'read.non-idempotent', title: '非幂等读取', idempotent: false, handler: temporary }),
        createTool({ id: 'read.permanent', title: '永久失败读取', handler: permanent }),
      ],
    });

    await engine.executeSingleTool({
      runId: 'run-non-idempotent',
      prompt: '读取',
      toolId: 'read.non-idempotent',
      input: {},
    });
    await engine.executeSingleTool({
      runId: 'run-permanent',
      prompt: '读取',
      toolId: 'read.permanent',
      input: {},
    });

    expect(temporary).toHaveBeenCalledTimes(1);
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it('rejects write definitions that cannot receive an abort signal', async () => {
    const handler = vi.fn();
    const tool = createTool({
      id: 'write.no-abort',
      title: '不可取消写入',
      riskLevel: 'create',
      idempotent: false,
      supportsAbort: false,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    const result = await engine.executeSingleTool({
      runId: 'run-write-no-abort',
      prompt: '执行不可取消写入',
      toolId: tool.id,
      input: {},
    });

    expect(result.diagnostics?.code).toBe('WRITE_ABORT_UNSUPPORTED');
    expect((await store.get('run-write-no-abort'))?.state).toBe('failed');
    expect((await store.get('run-write-no-abort'))?.pendingConfirmation).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('marks a timed-out confirmed write as outcome unknown and ignores its late success', async () => {
    vi.useFakeTimers();
    let resolveHandler!: (result: AgentExecutionResultFixture) => void;
    const handler = vi.fn(() => new Promise<AgentExecutionResultFixture>((resolve) => {
      resolveHandler = resolve;
    }));
    const tool = createTool({
      id: 'write.timeout-unknown',
      title: '超时写入',
      riskLevel: 'update',
      idempotent: false,
      timeoutMs: 100,
      supportsAbort: true,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-write-timeout-unknown',
      prompt: '修改数据',
      toolId: tool.id,
      input: { id: 'record-1' },
    });
    const confirmation = (await store.get('run-write-timeout-unknown'))!.pendingConfirmation!;
    const execution = engine.resumeConfirmedRun({
      runId: 'run-write-timeout-unknown',
      confirmation,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await execution;

    expect(result.status).toBe('error');
    expect(result.diagnostics?.code).toBe('WRITE_OUTCOME_UNKNOWN');
    expect(result.message).toContain('核对');
    expect((await store.get('run-write-timeout-unknown'))?.state).toBe('failed');

    resolveHandler({
      status: 'success',
      message: '迟到的写入结果。',
      data: { updated: true },
      evidence: [],
      actions: [],
    });
    await Promise.resolve();

    expect((await store.get('run-write-timeout-unknown'))?.state).toBe('failed');
    expect((await store.get('run-write-timeout-unknown'))?.stepResults['single-step']?.diagnostics?.code)
      .toBe('WRITE_OUTCOME_UNKNOWN');
  });

  it('marks a cancelled in-flight write as outcome unknown instead of safely cancelled', async () => {
    const handler = vi.fn(() => new Promise<never>(() => undefined));
    const tool = createTool({
      id: 'write.cancel-unknown',
      title: '取消中的写入',
      riskLevel: 'delete',
      idempotent: false,
      supportsAbort: true,
      handler,
    });
    const { engine, store } = createEngine({ tools: [tool] });

    await engine.executeSingleTool({
      runId: 'run-write-cancel-unknown',
      prompt: '删除数据',
      toolId: tool.id,
      input: { id: 'record-2' },
    });
    const confirmation = (await store.get('run-write-cancel-unknown'))!.pendingConfirmation!;
    const execution = engine.resumeConfirmedRun({
      runId: 'run-write-cancel-unknown',
      confirmation,
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const cancellation = engine.cancelRun('run-write-cancel-unknown');
    const [result, cancelledRun] = await Promise.all([execution, cancellation]);

    expect(result.diagnostics?.code).toBe('WRITE_OUTCOME_UNKNOWN');
    expect(cancelledRun?.state).toBe('failed');
    expect((await store.get('run-write-cancel-unknown'))?.state).toBe('failed');
  });

  it('keeps cancellation terminal when a stale successful save was already in flight', async () => {
    const backingStore = createMemoryAgentRunStore();
    let releaseSuccessSave!: () => void;
    let reportSuccessSaveStarted!: () => void;
    const successSaveStarted = new Promise<void>((resolve) => {
      reportSuccessSaveStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseSuccessSave = resolve;
    });
    let blocked = false;
    const store: AgentRunStore = {
      ...backingStore,
      save: async (run) => {
        if (!blocked && run.stepResults['single-step']?.status === 'success') {
          blocked = true;
          reportSuccessSaveStarted();
          await release;
        }
        await backingStore.save(run);
      },
    };
    const { engine } = createEngine({ tools: [createTool()], store });

    const execution = engine.executeSingleTool({
      runId: 'run-cancel-save-race',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
    });
    await successSaveStarted;
    const cancellation = engine.cancelRun('run-cancel-save-race');
    await Promise.resolve();
    releaseSuccessSave();
    await Promise.all([execution, cancellation]);

    expect((await store.get('run-cancel-save-race'))?.state).toBe('cancelled');
  });

  it('ignores a handler result that arrives after the run timed out', async () => {
    vi.useFakeTimers();
    let resolveHandler!: (value: {
      status: 'success';
      message: string;
      data: Record<string, unknown>;
      evidence: [];
      actions: [];
    }) => void;
    const handler = vi.fn(() => new Promise<{
      status: 'success';
      message: string;
      data: Record<string, unknown>;
      evidence: [];
      actions: [];
    }>((resolve) => {
      resolveHandler = resolve;
    }));
    const progress: AgentExecutionProgressEvent[] = [];
    const { engine, store } = createEngine({
      tools: [createTool({ timeoutMs: 100, handler })],
      progress,
    });

    const execution = engine.executeSingleTool({
      runId: 'run-late',
      prompt: '读取库存',
      toolId: 'inventory.read',
      input: {},
    });
    await vi.advanceTimersByTimeAsync(100);
    await execution;
    const progressLength = progress.length;
    resolveHandler({ status: 'success', message: '迟到结果。', data: { count: 99 }, evidence: [], actions: [] });
    await Promise.resolve();

    expect((await store.get('run-late'))?.state).toBe('timed_out');
    expect((await store.get('run-late'))?.stepResults['single-step']?.status).toBe('timeout');
    expect(progress).toHaveLength(progressLength);
  });
});

type AgentExecutionResultFixture = {
  status: 'success';
  message: string;
  data: Record<string, unknown>;
  evidence: Record<string, unknown>[];
  actions: Record<string, unknown>[];
};
