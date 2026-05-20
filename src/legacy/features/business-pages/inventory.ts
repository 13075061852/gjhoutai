// @ts-nocheck

export const INVENTORY_STORAGE_KEY = 'gjh-inventory-materials-v1';
export const INVENTORY_CATEGORY_STORAGE_KEY = 'gjh-inventory-categories-v1';

export const defaultInventoryRows = [];

export const inventoryTypeOptions = ['原材料', '成品材料', '库存材料'];
export const inventoryStateOptions = ['正常', '预警', '紧急', '可发货', '锁库中', '待检', '待确认'];

export const normalizeInventoryRow = (row) => {
  const cells = Array.isArray(row) ? row : [];
  return [
    String(cells[0] || '').trim(),
    String(cells[1] || '原材料').trim() || '原材料',
    String(cells[2] || '未分类').trim() || '未分类',
    String(cells[3] || '未关联供应商').trim() || '未关联供应商',
    String(cells[4] || '--').trim() || '--',
    String(cells[5] || '待确认').trim() || '待确认',
    String(cells[6] || '').trim(),
    String(cells[7] || '').trim(),
    String(cells[8] || '').trim(),
    String(cells[9] || '').trim(),
    String(cells[10] || '').trim(),
  ];
};

export const normalizeInventoryRows = (value) => {
  const rows = Array.isArray(value) ? value.map(normalizeInventoryRow).filter((row) => row[0]) : [];
  return rows;
};

export const getDefaultInventoryCategories = (rows = []) => (
  [...new Set(rows.map((row) => normalizeInventoryRow(row)[2]).filter(Boolean))]
);

export const normalizeInventoryCategories = (value, rows) => {
  const categories = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return [...new Set([...categories, ...getDefaultInventoryCategories(rows)])];
};
