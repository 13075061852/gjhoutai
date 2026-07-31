import { describe, expect, it } from 'vitest';
import {
  agentPlanSchema,
  agentRunRecordSchema,
  agentToolResultSchema,
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
});
