import { describe, expect, it } from 'vitest';
import { queryAgentRows } from './agent-query';

const inventoryRows = [
  { name: 'ABS 757K', type: '原材料', category: '基础树脂', stockQuantity: 12.4, stock: '12.4 吨', status: '正常' },
  { name: 'GJ-ABS-FR-760', type: '成品材料', category: '阻燃 ABS', stockQuantity: 5.8, stock: '5.8 吨', status: '可发货' },
  { name: 'GJ-PCABS-901', type: '成品材料', category: 'PC/ABS 合金', stockQuantity: 3.7, stock: '3.7 吨', status: '待检' },
];

const baseRequest = {
  pageId: 'inventory-management',
  entity: 'inventoryItem',
  rows: inventoryRows,
  defaultFields: ['name', 'type', 'category', 'stockQuantity', 'status'],
};

describe('queryAgentRows', () => {
  it('returns only counts for count intent', () => {
    const result = queryAgentRows({ ...baseRequest, request: { intent: 'count' } });
    expect(result.rowCount).toBe(3);
    expect(result.data).toEqual([]);
  });

  it('filters finished goods without returning raw materials', () => {
    const result = queryAgentRows({
      ...baseRequest,
      request: {
        intent: 'list',
        filters: [{ field: 'type', op: 'contains', value: '成品' }],
      },
    });
    expect(result.rowCount).toBe(2);
    expect(result.data.map((row) => row.name)).toEqual(['GJ-ABS-FR-760', 'GJ-PCABS-901']);
  });

  it('returns extrema result instead of the full table', () => {
    const result = queryAgentRows({
      ...baseRequest,
      request: {
        intent: 'extrema',
        filters: [{ field: 'type', op: 'contains', value: '成品' }],
        sort: [{ field: 'stockQuantity', direction: 'asc' }],
        limit: 1,
      },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('GJ-PCABS-901');
    expect(result.comparedRows).toBe(2);
  });

  it('honors list limits', () => {
    const result = queryAgentRows({ ...baseRequest, request: { intent: 'list', limit: 2 } });
    expect(result.data).toHaveLength(2);
  });

  it('aggregates by field', () => {
    const result = queryAgentRows({ ...baseRequest, request: { intent: 'aggregate', groupBy: 'type' } });
    expect(result.data).toContainEqual({ type: '原材料', count: 1 });
    expect(result.data).toContainEqual({ type: '成品材料', count: 2 });
  });

  it('returns a targeted detail row', () => {
    const result = queryAgentRows({ ...baseRequest, request: { intent: 'detail', target: 'PCABS', limit: 1 } });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('GJ-PCABS-901');
  });

  it('returns compare candidates without expanding beyond the limit', () => {
    const result = queryAgentRows({
      ...baseRequest,
      request: {
        intent: 'compare',
        filters: [{ field: 'type', op: 'contains', value: '成品' }],
        limit: 2,
      },
    });
    expect(result.data).toHaveLength(2);
    expect(result.summary).toContain('用于对比');
  });
});
