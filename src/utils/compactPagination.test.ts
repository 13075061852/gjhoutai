import { describe, expect, it } from 'vitest';
import { getCompactPagination } from './compactPagination';

describe('compact pagination', () => {
  it('shows all pages only for four pages or fewer', () => {
    expect(getCompactPagination(1, 1)).toEqual([1]);
    expect(getCompactPagination(2, 4)).toEqual([1, 2, 3, 4]);
    expect(getCompactPagination(1, 6)).toEqual([1, 2, 'ellipsis-right', 6]);
  });
  it('retains current, first and last pages in at most five slots', () => {
    expect(getCompactPagination(3, 6)).toEqual([1, 'ellipsis-left', 3, 'ellipsis-right', 6]);
    expect(getCompactPagination(6, 6)).toEqual([1, 'ellipsis-left', 5, 6]);
    for (let current = 1; current <= 100; current++) {
      const items = getCompactPagination(current, 100);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(items).toContain(1);
      expect(items).toContain(current);
      expect(items).toContain(100);
      expect(new Set(items).size).toBe(items.length);
    }
  });
  it('clamps out-of-range pages', () => {
    expect(getCompactPagination(99, 6)).toEqual([1, 'ellipsis-left', 5, 6]);
    expect(getCompactPagination(0, 0)).toEqual([1]);
  });
});
