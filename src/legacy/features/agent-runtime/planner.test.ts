import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentPlanner,
  AgentPlannerCancelledError,
  AgentPlannerError,
  AgentPlannerTimeoutError,
  validatePlanDependencies,
} from './planner';
import { createAgentToolRegistry } from './tool-registry';

type PlannerMessage = { role: string; content: string };

const inventoryTool = {
  id: 'inventory.read',
  version: 1,
  title: '库存读取',
  description: '读取库存数据',
  category: 'business',
  riskLevel: 'read' as const,
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  timeoutMs: 30_000,
  maxRetries: 0,
  idempotent: true,
  supportsAbort: true,
  handler: vi.fn(async () => ({ status: 'success' as const, message: '完成', data: {}, evidence: [], actions: [] })),
};

const formulaTool = {
  ...inventoryTool,
  id: 'formula.read',
  title: '配方读取',
};

const validPlan = {
  version: 2,
  kind: 'complex_agent',
  summary: '库存与配方风险',
  steps: [
    { id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] },
    { id: 'formula', toolId: 'formula.read', input: {}, dependsOn: ['inventory'] },
  ],
} as const;

describe('agent planner', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts an acyclic plan with registered tools', () => {
    const result = validatePlanDependencies(validPlan, new Set(['inventory.read', 'formula.read']));

    expect(result.ok).toBe(true);
  });

  it('rejects duplicate step ids with the duplicate_step_id reason', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [
        { id: 'same', toolId: 'inventory.read', input: {}, dependsOn: [] },
        { id: 'same', toolId: 'inventory.read', input: {}, dependsOn: [] },
      ],
    } as const;

    expect(validatePlanDependencies(invalid, new Set(['inventory.read']))).toMatchObject({
      ok: false,
      reason: 'duplicate_step_id',
    });
  });

  it('rejects an unknown tool with the unknown_tool reason', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [{ id: 'inventory', toolId: 'unknown', input: {}, dependsOn: [] }],
    } as const;

    expect(validatePlanDependencies(invalid, new Set(['inventory.read']))).toMatchObject({
      ok: false,
      reason: 'unknown_tool',
    });
  });

  it('rejects a missing dependency with the missing_dependency reason', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [{ id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: ['missing'] }],
    } as const;

    expect(validatePlanDependencies(invalid, new Set(['inventory.read']))).toMatchObject({
      ok: false,
      reason: 'missing_dependency',
    });
  });

  it('rejects a dependency cycle with the dependency_cycle reason', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [
        { id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: ['formula'] },
        { id: 'formula', toolId: 'inventory.read', input: {}, dependsOn: ['inventory'] },
      ],
    } as const;

    expect(validatePlanDependencies(invalid, new Set(['inventory.read']))).toMatchObject({
      ok: false,
      reason: 'dependency_cycle',
    });
  });

  it('rejects V2-shaped responses with fields outside the plan contract', () => {
    const response = {
      ...validPlan,
      answer: 'this is not a final-answer channel',
    };

    expect(validatePlanDependencies(response, new Set(['inventory.read', 'formula.read'])).ok).toBe(false);
  });

  it('uses the planner-safe catalog and strict V2 request contract without executing tools', async () => {
    const registry = createAgentToolRegistry([inventoryTool, formulaTool]);
    let messages: PlannerMessage[] = [];
    const requestPlan = vi.fn((requestMessages: PlannerMessage[]): Promise<unknown> => {
      messages = requestMessages;
      return Promise.resolve(JSON.stringify(validPlan));
    });
    const planner = createAgentPlanner({ registry, requestPlan });

    await expect(planner.plan({ prompt: '分析库存和配方', activePageId: 'inventory' })).resolves.toEqual(validPlan);

    expect(messages[0].content).toContain('strict JSON matching AgentPlanV2');
    expect(messages[0].content).toContain('at most four tools');
    expect(messages[0].content).not.toContain('handler');
    expect(messages[0].content).not.toContain('inputSchema');
    expect(messages[0].content).not.toContain('outputSchema');
    expect(messages[1].content).toContain('分析库存和配方');
    expect(inventoryTool.handler).not.toHaveBeenCalled();
    expect(formulaTool.handler).not.toHaveBeenCalled();
  });

  it('never serializes secret-bearing or arbitrary catalog properties into model messages', async () => {
    const secretBearingTool = Object.assign({}, inventoryTool, {
      apiKey: 'planner-api-key-must-not-leak',
      token: 'planner-token-must-not-leak',
      config: { authorization: 'planner-config-must-not-leak' },
      internalNotes: 'arbitrary-metadata-must-not-leak',
    });
    const registry = createAgentToolRegistry([secretBearingTool]);
    let messages: PlannerMessage[] = [];
    const planner = createAgentPlanner({
      registry,
      requestPlan: async (requestMessages) => {
        messages = requestMessages;
        return {
          ...validPlan,
          steps: [{ id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] }],
        };
      },
    });

    await planner.plan({ prompt: '分析库存', activePageId: 'inventory' });

    const serializedMessages = JSON.stringify(messages);
    expect(serializedMessages).not.toContain('planner-api-key-must-not-leak');
    expect(serializedMessages).not.toContain('planner-token-must-not-leak');
    expect(serializedMessages).not.toContain('planner-config-must-not-leak');
    expect(serializedMessages).not.toContain('arbitrary-metadata-must-not-leak');
    expect(serializedMessages).not.toContain('apiKey');
    expect(serializedMessages).not.toContain('token');
    expect(serializedMessages).not.toContain('config');
    expect(serializedMessages).not.toContain('internalNotes');
  });

  it('aborts the model request at the 45-second deadline', async () => {
    vi.useFakeTimers();
    const registry = createAgentToolRegistry([inventoryTool]);
    let receivedSignal: AbortSignal | undefined;
    const requestPlan = vi.fn((_messages: PlannerMessage[], signal: AbortSignal): Promise<unknown> => {
      receivedSignal = signal;
      return new Promise<unknown>(() => undefined);
    });
    const planner = createAgentPlanner({ registry, requestPlan });
    const planning = planner.plan({ prompt: '分析库存', activePageId: 'inventory' });
    const timeoutExpectation = expect(planning).rejects.toBeInstanceOf(AgentPlannerTimeoutError);

    await vi.advanceTimersByTimeAsync(45_000);

    await timeoutExpectation;
    expect(receivedSignal?.aborted).toBe(true);
    expect(inventoryTool.handler).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted parent signal with a dedicated cancellation error without requesting a plan', async () => {
    const registry = createAgentToolRegistry([inventoryTool]);
    const requestPlan = vi.fn(async (): Promise<unknown> => validPlan);
    const planner = createAgentPlanner({ registry, requestPlan });
    const parentController = new AbortController();
    parentController.abort('parent cancelled before planning');

    const error = await planner.plan({
      prompt: 'analyse inventory',
      activePageId: 'inventory',
      signal: parentController.signal,
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AgentPlannerCancelledError);
    expect(error).toMatchObject({ code: 'AGENT_PLANNER_CANCELLED' });
    expect(requestPlan).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request and cleans up the parent listener when the parent signal cancels', async () => {
    vi.useFakeTimers();
    const registry = createAgentToolRegistry([inventoryTool]);
    const parentController = new AbortController();
    const removeEventListener = vi.spyOn(parentController.signal, 'removeEventListener');
    let receivedSignal: AbortSignal | undefined;
    const requestPlan = vi.fn((_messages: PlannerMessage[], signal: AbortSignal): Promise<unknown> => {
      receivedSignal = signal;
      return new Promise<unknown>(() => undefined);
    });
    const planner = createAgentPlanner({ registry, requestPlan });
    const planning = planner.plan({
      prompt: 'analyse inventory',
      activePageId: 'inventory',
      signal: parentController.signal,
    });

    parentController.abort('parent cancelled during planning');

    await expect(planning).rejects.toBeInstanceOf(AgentPlannerCancelledError);
    expect(receivedSignal?.aborted).toBe(true);
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up its deadline timer and parent listener after a successful request', async () => {
    vi.useFakeTimers();
    const registry = createAgentToolRegistry([inventoryTool]);
    const parentController = new AbortController();
    const removeEventListener = vi.spyOn(parentController.signal, 'removeEventListener');
    const planner = createAgentPlanner({
      registry,
      requestPlan: async () => ({
        ...validPlan,
        steps: [{ id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] }],
      }),
    });

    await expect(planner.plan({
      prompt: 'analyse inventory',
      activePageId: 'inventory',
      signal: parentController.signal,
    })).resolves.toMatchObject({
      steps: [{ id: 'inventory', toolId: 'inventory.read', input: {}, dependsOn: [] }],
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects plans with more than four steps', async () => {
    const registry = createAgentToolRegistry([inventoryTool]);
    const requestPlan = vi.fn(async () => ({
      version: 2,
      kind: 'complex_agent',
      summary: 'too many steps',
      steps: Array.from({ length: 5 }, (_, index) => ({
        id: `step-${index}`,
        toolId: 'inventory.read',
        input: {},
        dependsOn: [],
      })),
    }));
    const planner = createAgentPlanner({ registry, requestPlan });

    await expect(planner.plan({ prompt: '分析库存', activePageId: 'inventory' })).rejects.toBeInstanceOf(AgentPlannerError);
    expect(inventoryTool.handler).not.toHaveBeenCalled();
  });
});
