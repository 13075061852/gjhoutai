import { describe, expect, it } from 'vitest';
import businessPagesSource from './index.ts?raw';

describe('supplier archive empty layout', () => {
  it('marks the legacy supplier table as empty when the current page has no rows', () => {
    expect(businessPagesSource).toContain("biz-supplier-table${pagedSuppliers.length ? '' : ' is-empty'}");
  });
});
