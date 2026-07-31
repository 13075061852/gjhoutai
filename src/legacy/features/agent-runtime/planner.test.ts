import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentPlanner, AgentPlannerError, AgentPlannerTimeoutError, validatePlanDependencies } from './planner';
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

  it('rejects unknown tools, missing dependencies, cycles, and duplicate step ids', () => {
    const invalid = {
      version: 2,
      kind: 'complex_agent',
      summary: 'invalid',
      steps: [
        { id: 'same', toolId: 'unknown', input: {}, dependsOn: ['same'] },
        { id: 'same', toolId: 'inventory.read', input: {}, dependsOn: ['missing'] },
      ],
    } as const;

    expect(validatePlanDependencies(invalid, new Set(['inventory.read'])).ok).toBe(false);
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
