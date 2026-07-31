import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  agentPlanSchema,
  agentRunRecordSchema,
  agentToolResultSchema,
  executeAgentTool,
} from './protocol';

describe('agent runtime protocol', () => {
  it('accepts a versioned complex plan', () => {
    const parsed = agentPlanSchema.parse({
      version: 2,
      kind: 'complex_agent',
      summary: '查询库存并检查配方风险',
      steps: [
        { id: 'inventory', toolId: 'business.queryPageData', input: { question: '当前库存' }, dependsOn: [] },
      ],
    });
    expect(parsed.steps[0].toolId).toBe('business.queryPageData');
  });

  it('rejects unsupported intent kinds', () => {
    expect(() => agentPlanSchema.parse({ version: 2, kind: 'react_loop', summary: '', steps: [] })).toThrow();
  });

  it('requires a terminal tool-result status', () => {
    expect(() => agentToolResultSchema.parse({ message: 'missing status' })).toThrow();
  });

  it('requires version 2 run records', () => {
    expect(() => agentRunRecordSchema.parse({ version: 1, id: 'run-1' })).toThrow();
  });

  it('rejects malformed outer tool results before returning a handler result', async () => {
    await expect(executeAgentTool({
      id: 'inventory.count',
      version: 1,
      title: '库存计数',
      description: '读取库存数量',
      category: 'business',
      riskLevel: 'read',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
      timeoutMs: 30_000,
      maxRetries: 1,
      idempotent: true,
      supportsAbort: true,
      handler: async () => ({ message: 'missing status', data: { count: 3 } }),
    } as any, {}, { runId: 'run-1', stepId: 'step-1' })).rejects.toThrow();
  });

  it('rejects tool results whose data does not match the output schema', async () => {
    await expect(executeAgentTool({
      id: 'inventory.count',
      version: 1,
      title: '库存计数',
      description: '读取库存数量',
      category: 'business',
      riskLevel: 'read',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
      timeoutMs: 30_000,
      maxRetries: 1,
      idempotent: true,
      supportsAbort: true,
      handler: async () => ({ status: 'success', message: '库存数量读取完成。', data: { count: 'three' } }),
    } as any, {}, { runId: 'run-1', stepId: 'step-1' })).rejects.toThrow();
  });
});
