import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  createAgentToolRegistry,
  ToolRegistrationError,
  ToolValidationError,
} from './tool-registry';

const readTool = {
  id: 'inventory.count',
  version: 1,
  title: '库存计数',
  description: '读取库存数量',
  category: 'business',
  riskLevel: 'read',
  inputSchema: z.object({ category: z.string() }),
  outputSchema: z.object({ count: z.number() }),
  timeoutMs: 30_000,
  maxRetries: 1,
  idempotent: true,
  supportsAbort: true,
  handler: async () => ({
    status: 'success' as const,
    message: '库存数量读取完成。',
    data: { count: 3 },
    evidence: [{ field: 'count', value: 3 }],
    actions: [],
  }),
} as const;

describe('agent tool registry', () => {
  it('rejects duplicate tool ids', () => {
    const registry = createAgentToolRegistry();
    registry.register(readTool);

    expect(() => registry.register(readTool)).toThrow(ToolRegistrationError);
  });

  it('rejects definitions with missing metadata or nonpositive timeouts', () => {
    const registry = createAgentToolRegistry();
    const missingTitle = { ...readTool, title: ' ' };
    const invalidTimeout = { ...readTool, id: 'inventory.invalid', timeoutMs: 0 };

    expect(() => registry.register(missingTitle)).toThrow(ToolRegistrationError);
    expect(() => registry.register(invalidTimeout)).toThrow(ToolRegistrationError);
  });

  it.each([null, undefined, 'not a definition'])('rejects non-object registration input: %p', (definition) => {
    const registry = createAgentToolRegistry();

    expect(() => registry.register(definition as never)).toThrow(ToolRegistrationError);
  });

  it('freezes registered definitions', () => {
    const registry = createAgentToolRegistry([readTool]);

    expect(Object.isFrozen(registry.get('inventory.count'))).toBe(true);
    expect(Object.isFrozen(registry.list()[0])).toBe(true);
  });

  it('validates inputs before returning a call', () => {
    const registry = createAgentToolRegistry([readTool]);

    expect(() => registry.prepareCall('inventory.count', { category: 7 }, { runId: 'r1', stepId: 's1' }))
      .toThrow(ToolValidationError);
  });

  it('returns a validated call for known tools', () => {
    const registry = createAgentToolRegistry([readTool]);

    expect(registry.prepareCall('inventory.count', { category: 'raw' }, { runId: 'r1', stepId: 's1' }))
      .toEqual({ runId: 'r1', stepId: 's1', toolId: 'inventory.count', input: { category: 'raw' } });
  });

  it('rejects unknown tools when preparing calls or validating results', () => {
    const registry = createAgentToolRegistry();

    expect(() => registry.prepareCall('missing', {}, { runId: 'r1', stepId: 's1' })).toThrow(ToolValidationError);
    expect(() => registry.validateResult('missing', {})).toThrow(ToolValidationError);
  });

  it('validates outer tool results and result data', () => {
    const registry = createAgentToolRegistry([readTool]);
    const outerInvalid = { status: 'unknown', message: 'bad', data: { count: 3 } };
    const dataInvalid = { status: 'success', message: 'bad', data: { count: '3' } };

    expect(() => registry.validateResult('inventory.count', outerInvalid)).toThrow(ToolValidationError);
    expect(() => registry.validateResult('inventory.count', dataInvalid)).toThrow(ToolValidationError);
  });

  it('exposes planner-safe metadata without handlers or schemas', () => {
    const registry = createAgentToolRegistry([readTool]);
    const catalog = registry.getPlannerCatalog();

    expect(catalog[0]).not.toHaveProperty('handler');
    expect(catalog[0]).not.toHaveProperty('inputSchema');
    expect(catalog[0]).not.toHaveProperty('outputSchema');
    expect(catalog[0]).toMatchObject({
      id: 'inventory.count',
      inputShape: expect.any(String),
      outputShape: expect.any(String),
    });
    expect(JSON.stringify(catalog)).not.toContain('handler');
  });
});
