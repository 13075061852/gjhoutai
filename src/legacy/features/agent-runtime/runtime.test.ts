import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentExecutionEngine } from './execution-engine';
import {
  AgentPlannerCancelledError,
  AgentPlannerTimeoutError,
} from './planner';
import type {
  AgentIntent,
  AgentPlanV2,
  AgentProgressEvent,
  AgentToolDefinition,
} from './protocol';
import { createMemoryAgentRunStore } from './run-store';
import { createAgentRuntime } from './runtime';
import { createAgentToolRegistry } from './tool-registry';
import {
  AgentTransportCancelledError,
  AgentTransportTimeoutError,
  normalizeAgentTransportError,
} from './transport';

const fixedNow = () => '2026-07-31T00:00:00.000Z';

const resultTool = (
  id: string,
  handler: AgentToolDefinition['handler'],
  overrides: Partial<AgentToolDefinition> = {},
): AgentToolDefinition => ({
  id,
  version: 2,
  title: id,
  description: `Test tool ${id}`,
  category: 'test',
  riskLevel: 'read',
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  timeoutMs: 30_000,
  maxRetries: 0,
  idempotent: true,
  supportsAbort: true,
  handler,
  ...overrides,
});

const completedResult = (
  message: string,
  evidence: Record<string, unknown>[],
  data: Record<string, unknown> = {},
) => ({
  status: 'success' as const,
  message,
  data,
  evidence,
  actions: [],
});

const terminalEvents = (events: AgentProgressEvent[]) => events.filter((event) => (
  event.phase === 'completed'
  || event.phase === 'failed'
  || event.phase === 'timed_out'
  || event.phase === 'cancelled'
));

const createHarness = ({
  intent,
  tools = [],
  plan,
  plannerError,
  chatOutput,
}: {
  intent: AgentIntent;
  tools?: AgentToolDefinition[];
  plan?: AgentPlanV2;
  plannerError?: unknown;
  chatOutput?: unknown;
}) => {
  const store = createMemoryAgentRunStore();
  const registry = createAgentToolRegistry(tools);
  const gateway = {
    route: vi.fn().mockResolvedValue(intent),
  };
  const planner = {
    plan: plannerError === undefined
      ? vi.fn().mockResolvedValue(plan)
      : vi.fn().mockRejectedValue(plannerError),
  };
  const chatModel = vi.fn().mockImplementation(async (request: { purpose: string; question: string }) => (
    chatOutput ?? (request.purpose === 'chat'
      ? `早！你刚才说的是“${request.question}”。`
      : '库存共有 3 条，配方共有 2 条。')
  ));
  let nextRunId = 0;
  const executionEngine = createAgentExecutionEngine({
    registry,
    store,
    now: fixedNow,
    createId: (prefix) => `${prefix}-${++nextRunId}`,
  });
  const runtime = createAgentRuntime({
    gateway,
    planner,
    registry,
    executionEngine,
    store,
    chatModel,
    now: fixedNow,
    createId: () => `run-${++nextRunId}`,
  });
  return {
    runtime,
    store,
    registry,
    gateway,
    planner,
    chatModel,
    executionEngine,
  };
};

describe('agent runtime coordinator', () => {
  afterEach(() => vi.useRealTimers());

  it('routes an ordinary early greeting through exactly one chat model request', async () => {
    const projectManifestTool = vi.fn(async () => completedResult(
      '项目清单读取完成。',
      [{ pageCount: 8 }],
    ));
    const harness = createHarness({
      intent: { kind: 'chat', confidence: 0.99, reason: 'greeting' },
      tools: [resultTool('project.manifest', projectManifestTool)],
    });
    const events: AgentProgressEvent[] = [];

    const result = await harness.runtime.run({
      prompt: '早',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      onProgress: (event) => events.push(event),
    });

    expect(result.run.state).toBe('completed');
    expect(result.state).toBe('completed');
    expect(harness.chatModel).toHaveBeenCalledOnce();
    expect(harness.planner.plan).not.toHaveBeenCalled();
    expect(projectManifestTool).not.toHaveBeenCalled();
    expect(result.answer).toContain('早');
    expect(terminalEvents(events)).toHaveLength(1);
  });

  it('executes a two-tool complex plan and composes one grounded terminal answer', async () => {
    const plan: AgentPlanV2 = {
      version: 2,
      kind: 'complex_agent',
      summary: '联合分析库存与配方',
      steps: [
        { id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] },
        { id: 'formula', toolId: 'formula.read', input: {}, dependsOn: ['inventory'] },
      ],
    };
    const harness = createHarness({
      intent: { kind: 'complex_agent', confidence: 0.9, reason: 'cross-domain' },
      plan,
      tools: [
        resultTool('inventory.read', vi.fn(async () => completedResult(
          '库存共有 3 条。',
          [{ field: 'inventoryCount', value: 3 }],
          { count: 3 },
        ))),
        resultTool('formula.read', vi.fn(async () => completedResult(
          '配方共有 2 条。',
          [{ field: 'formulaCount', value: 2 }],
          { count: 2 },
        ))),
      ],
    });
    const events: AgentProgressEvent[] = [];

    const result = await harness.runtime.run({
      prompt: '结合库存和配方分析风险',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      onProgress: (event) => events.push(event),
    });

    expect(result.run.state).toBe('completed');
    expect(result.answer).toContain('库存共有 3 条');
    expect(result.answer).toContain('配方共有 2 条');
    expect(Object.keys(result.run.stepResults)).toEqual(['inventory', 'formula']);
    expect(terminalEvents(events)).toHaveLength(1);
  });

  it('pauses a write plan for confirmation and resumes it exactly once', async () => {
    const writeHandler = vi.fn(async () => completedResult(
      '配方已创建。',
      [{ id: 'formula-1', created: true }],
      { id: 'formula-1' },
    ));
    const plan: AgentPlanV2 = {
      version: 2,
      kind: 'complex_agent',
      summary: '创建配方',
      steps: [{
        id: 'create-formula',
        toolId: 'formula.create',
        input: { name: 'PBT-A' },
        dependsOn: [],
      }],
    };
    const harness = createHarness({
      intent: { kind: 'complex_agent', confidence: 0.95, reason: 'write request' },
      plan,
      tools: [resultTool('formula.create', writeHandler, {
        riskLevel: 'create',
        idempotent: false,
      })],
    });
    const events: AgentProgressEvent[] = [];

    const waiting = await harness.runtime.run({
      prompt: '创建 PBT-A 配方',
      activePageId: 'formula-management',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      onProgress: (event) => events.push(event),
    });

    expect(waiting.run.state).toBe('awaiting_confirmation');
    expect(waiting.answer).not.toContain('已创建');
    expect(writeHandler).not.toHaveBeenCalled();
    expect(terminalEvents(events)).toHaveLength(0);

    const completed = await harness.runtime.confirm({
      runId: waiting.run.id,
      confirmationId: waiting.run.pendingConfirmation!.id,
    });

    expect(completed.run.state).toBe('completed');
    expect(completed.answer).toContain('配方已创建');
    expect(writeHandler).toHaveBeenCalledOnce();
    expect(terminalEvents(events)).toHaveLength(1);
  });

  it('cancels the active child tool request and emits one cancelled terminal event', async () => {
    let childSignal: AbortSignal | undefined;
    const handler = vi.fn((_input, context) => {
      childSignal = context.signal;
      return new Promise<never>(() => undefined);
    });
    const harness = createHarness({
      intent: {
        kind: 'single_tool',
        confidence: 0.99,
        reason: 'inventory lookup',
        toolId: 'inventory.read',
        toolInput: {},
      },
      tools: [resultTool('inventory.read', handler)],
    });
    const events: AgentProgressEvent[] = [];

    const running = harness.runtime.run({
      prompt: '读取库存',
      activePageId: 'inventory',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      onProgress: (event) => events.push(event),
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());

    await harness.runtime.cancel('run-1');
    const result = await running;

    expect(childSignal?.aborted).toBe(true);
    expect(result.run.state).toBe('cancelled');
    expect(result.answer).toContain('取消');
    expect(terminalEvents(events)).toHaveLength(1);
  });

  it('does not overwrite cancellation with completion during response composition', async () => {
    const plan: AgentPlanV2 = {
      version: 2,
      kind: 'complex_agent',
      summary: '读取库存后回答',
      steps: [{ id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] }],
    };
    const harness = createHarness({
      intent: { kind: 'complex_agent', confidence: 0.9, reason: 'analysis' },
      plan,
      tools: [resultTool('inventory.read', vi.fn(async () => completedResult(
        '库存共有 3 条。',
        [{ field: 'inventoryCount', value: 3 }],
      )))],
    });
    harness.chatModel.mockImplementationOnce(({ signal }: { signal?: AbortSignal }) => (
      new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          resolve('库存共有 3 条。');
        }, { once: true });
      })
    ));

    const running = harness.runtime.run({
      prompt: '分析库存',
      activePageId: 'inventory',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });
    await vi.waitFor(() => expect(harness.chatModel).toHaveBeenCalledOnce());

    await harness.runtime.cancel('run-1');
    const result = await running;

    expect(result.run.state).toBe('cancelled');
    expect((await harness.store.get('run-1'))?.state).toBe('cancelled');
  });

  it('reports a planner deadline as timed out instead of user cancellation', async () => {
    const harness = createHarness({
      intent: { kind: 'complex_agent', confidence: 0.9, reason: 'cross-domain' },
      plannerError: new AgentPlannerTimeoutError(45_000),
    });
    const events: AgentProgressEvent[] = [];

    const result = await harness.runtime.run({
      prompt: '结合库存和配方分析风险',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      onProgress: (event) => events.push(event),
    });

    expect(result.run.state).toBe('timed_out');
    expect(result.answer).toContain('超时');
    expect(result.answer).not.toContain('取消');
    expect(terminalEvents(events)).toEqual([
      expect.objectContaining({ phase: 'timed_out', status: 'failed' }),
    ]);
  });

  it('reports an explicit planner abort as cancellation rather than timeout', async () => {
    const harness = createHarness({
      intent: { kind: 'complex_agent', confidence: 0.9, reason: 'cross-domain' },
      plannerError: new AgentPlannerCancelledError(),
    });

    const result = await harness.runtime.run({
      prompt: '结合库存和配方分析风险',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
    });

    expect(result.run.state).toBe('cancelled');
    expect(result.answer).toContain('取消');
  });

  it('preserves a chat transport timeout abort reason as timed out', async () => {
    const parent = new AbortController();
    const harness = createHarness({
      intent: { kind: 'chat', confidence: 0.99, reason: 'greeting' },
      chatOutput: undefined,
    });
    harness.chatModel.mockImplementationOnce(({ signal }: { signal?: AbortSignal }) => (
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const running = harness.runtime.run({
      prompt: '早',
      activePageId: 'dashboard',
      projectAccessEnabled: true,
      webSearchEnabled: true,
      signal: parent.signal,
    });
    await vi.waitFor(() => expect(harness.chatModel).toHaveBeenCalledOnce());
    parent.abort(new AgentTransportTimeoutError(45_000));
    const result = await running;

    expect(result.run.state).toBe('timed_out');
    expect(result.answer).toContain('超时');
    expect(result.answer).not.toContain('取消');
  });
});

describe('agent transport abort errors', () => {
  it('preserves a timeout abort reason instead of reclassifying it as cancellation', () => {
    const controller = new AbortController();
    const timeout = new AgentTransportTimeoutError(45_000);
    controller.abort(timeout);

    expect(normalizeAgentTransportError(
      new DOMException('aborted', 'AbortError'),
      { signal: controller.signal, timeoutMs: 45_000 },
    )).toBe(timeout);
  });

  it('maps an explicit user abort to the dedicated cancellation error', () => {
    const controller = new AbortController();
    controller.abort('user cancelled');

    const error = normalizeAgentTransportError(
      new DOMException('aborted', 'AbortError'),
      { signal: controller.signal, timeoutMs: 45_000 },
    );

    expect(error).toBeInstanceOf(AgentTransportCancelledError);
    expect(error).toMatchObject({ code: 'AGENT_TRANSPORT_CANCELLED', cause: 'user cancelled' });
  });
});
