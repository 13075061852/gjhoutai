import { describe, expect, it } from 'vitest';
import {
  inventoryStateOptions,
  inventoryTypeOptions,
  normalizeInventoryCategories,
  normalizeInventoryRow,
  normalizeInventoryRows,
} from './inventory';

describe('inventory normalization', () => {
  it('normalizes incomplete material rows with safe defaults', () => {
    expect(normalizeInventoryRow([' ABS ', '', '', '', '', ''])).toEqual([
      'ABS',
      inventoryTypeOptions[0],
      '未分类',
      '未关联供应商',
      '--',
      inventoryStateOptions[inventoryStateOptions.length - 1],
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('keeps empty cloud state empty instead of injecting sample rows', () => {
    expect(normalizeInventoryRows([])).toEqual([]);
    expect(normalizeInventoryRows(null)).toEqual([]);
  });

  it('merges stored categories with categories from material rows', () => {
    const categories = normalizeInventoryCategories(['自定义分类', '基础树脂'], [
      ['材料 A', '原材料', '基础树脂'],
      ['材料 B', '原材料', '新增分类'],
    ]);

    expect(categories).toEqual(['自定义分类', '基础树脂', '新增分类']);
  });
});
