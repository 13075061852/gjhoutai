// @ts-nocheck

export const PROCUREMENT_STORAGE_KEY = 'gjh-procurements-v1';

export const procurementStatusOptions = ['已下单', '已到货', '已入库', '已质检', '已结算'];
export const procurementPageSizeOptions = [5, 10, 20, 50];

export const defaultProcurementRows = [];

const getProcurementFallbackDate = () => new Date().toISOString().slice(0, 10);

export const createNormalizeProcurement = ({ getDefaultSupplierName }) => (procurement = {}, index = 0) => {
  const status = procurementStatusOptions.includes(procurement.status) ? procurement.status : procurementStatusOptions[0];
  const fallbackDate = getProcurementFallbackDate();

  return {
    id: String(procurement.id || `PR-${fallbackDate.replace(/-/g, '')}-${String(index + 1).padStart(2, '0')}`).trim(),
    supplier: String(procurement.supplier || getDefaultSupplierName() || '').trim(),
    material: String(procurement.material || '').trim(),
    quantity: Math.max(0, Number(procurement.quantity || 0)),
    unitPrice: Math.max(0, Number(procurement.unitPrice || 0)),
    purchaseDate: String(procurement.purchaseDate || fallbackDate).trim(),
    status,
    note: String(procurement.note || '').trim(),
  };
};

export const createNormalizeProcurements = (normalizeProcurement) => (value) => {
  const rows = Array.isArray(value)
    ? value.map(normalizeProcurement).filter((procurement) => procurement.id && procurement.supplier)
    : [];

  return rows;
};
