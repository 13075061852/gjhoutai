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
