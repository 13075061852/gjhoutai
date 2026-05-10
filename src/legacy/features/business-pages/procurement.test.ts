import { describe, expect, it } from 'vitest';
import {
  createNormalizeProcurement,
  createNormalizeProcurements,
  procurementStatusOptions,
} from './procurement';

describe('procurement normalization', () => {
  const normalizeProcurement = createNormalizeProcurement({
    getDefaultSupplierName: () => '默认供应商',
  });

  it('normalizes invalid values and falls back to a valid status', () => {
    const normalized = normalizeProcurement({
      id: ' PR-001 ',
      supplier: '',
      material: ' ABS ',
      quantity: -12,
      unitPrice: -3,
      purchaseDate: '',
      status: '不存在',
      note: ' 备注 ',
    });

    expect(normalized).toMatchObject({
      id: 'PR-001',
      supplier: '默认供应商',
      material: 'ABS',
      quantity: 0,
      unitPrice: 0,
      status: procurementStatusOptions[0],
      note: '备注',
    });
    expect(normalized.purchaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses default rows when stored data is empty', () => {
    const normalizeProcurements = createNormalizeProcurements(normalizeProcurement);

    expect(normalizeProcurements([])).toHaveLength(10);
    expect(normalizeProcurements(null)).toHaveLength(10);
  });
});
