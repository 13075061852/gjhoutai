// @ts-nocheck

export const PROCUREMENT_STORAGE_KEY = 'gjh-procurements-v1';

export const procurementStatusOptions = ['已下单', '已到货', '已入库', '已质检', '已结算'];
export const procurementPageSizeOptions = [5, 10, 20, 50];

export const defaultProcurementRows = [
  { id: 'PR-20260420', supplier: '南通星辰合成材料', material: 'ABS PA-757', quantity: 5000, unitPrice: 15.5, purchaseDate: '2026-04-20', status: '已入库', note: '月度常规采购' },
  { id: 'PR-20260415', supplier: '中石化仪征化纤', material: 'PP T30S', quantity: 8000, unitPrice: 9.2, purchaseDate: '2026-04-15', status: '已入库', note: '锁定排产计划价' },
  { id: 'PR-20260410', supplier: '巨石集团', material: '玻纤 ECS3011B', quantity: 3000, unitPrice: 12.8, purchaseDate: '2026-04-10', status: '已质检', note: '关注含水率指标' },
  { id: 'PR-20260405', supplier: '巴斯夫中国', material: 'PA6 B3EG6', quantity: 2000, unitPrice: 28.0, purchaseDate: '2026-04-05', status: '已结算', note: '高性能树脂样品转化' },
  { id: 'PR-20260401', supplier: '南通星辰合成材料', material: 'PC 110', quantity: 4000, unitPrice: 22.5, purchaseDate: '2026-04-01', status: '已结算', note: '' },
  { id: 'PR-20260325', supplier: '陶氏化学', material: 'POE 8150', quantity: 1500, unitPrice: 18.6, purchaseDate: '2026-03-25', status: '已到货', note: '增韧剂样品测试中' },
  { id: 'PR-20260320', supplier: '科莱恩化工', material: '色母 UN2014', quantity: 800, unitPrice: 35.0, purchaseDate: '2026-03-20', status: '已入库', note: '色母粒，交期确认' },
  { id: 'PR-20260315', supplier: '以色列化工集团(ICL)', material: '阻燃剂 FR-802', quantity: 2000, unitPrice: 45.0, purchaseDate: '2026-03-15', status: '已入库', note: '进口原料，年度资质待补齐' },
  { id: 'PR-20260310', supplier: '巴斯夫添加剂', material: '抗氧剂 B225', quantity: 500, unitPrice: 52.0, purchaseDate: '2026-03-10', status: '已结算', note: '' },
  { id: 'PR-20260305', supplier: '南京曙光化工', material: 'PA6-GF25', quantity: 3000, unitPrice: 16.8, purchaseDate: '2026-03-05', status: '已发货', note: '协同销售渠道' },
];

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

  return rows.length ? rows : defaultProcurementRows.map(normalizeProcurement);
};
