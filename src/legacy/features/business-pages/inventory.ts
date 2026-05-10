// @ts-nocheck

export const INVENTORY_STORAGE_KEY = 'gjh-inventory-materials-v1';
export const INVENTORY_CATEGORY_STORAGE_KEY = 'gjh-inventory-categories-v1';

export const defaultInventoryRows = [
  ['ABS 757K', '原材料', '基础树脂', '上海恒裕化工', '12.4 吨', '正常'],
  ['玻纤 GF-30', '原材料', '增强填料', '宁波华纤材料', '4.6 吨', '预警'],
  ['阻燃剂 FR-530', '原材料', '阻燃助剂', '常州新禾助剂', '1.8 吨', '紧急'],
  ['增韧剂 IM-88', '原材料', '改性助剂', '常州新禾助剂', '2.4 吨', '正常'],
  ['黑色母 B-204', '原材料', '色母助剂', '苏州蓝石物流', '0.9 吨', '预警'],
  ['PP K8003', '原材料', '基础树脂', '上海恒裕化工', '9.6 吨', '正常'],
  ['抗氧剂 AO-1010', '原材料', '稳定助剂', '常州新禾助剂', '1.2 吨', '正常'],
  ['润滑剂 EBS-16', '原材料', '加工助剂', '苏州蓝石物流', '0.7 吨', '预警'],
  ['PC/ABS 基料 901', '原材料', '基础树脂', '广州瑞丰树脂', '6.3 吨', '正常'],
  ['相容剂 MAH-42', '原材料', '改性助剂', '广州瑞丰树脂', '1.5 吨', '正常'],
  ['GJ-ABS-FR-760', '成品材料', '阻燃 ABS', '上海恒裕化工', '5.8 吨', '可发货'],
  ['GJ-PP-GF30', '成品材料', '增强 PP', '宁波华纤材料', '8.2 吨', '锁库中'],
  ['GJ-PCABS-901', '成品材料', 'PC/ABS 合金', '广州瑞丰树脂', '3.7 吨', '待检'],
];

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
  return rows.length ? rows : defaultInventoryRows.map(normalizeInventoryRow);
};

export const getDefaultInventoryCategories = (rows = defaultInventoryRows) => (
  [...new Set(rows.map((row) => normalizeInventoryRow(row)[2]).filter(Boolean))]
);

export const normalizeInventoryCategories = (value, rows) => {
  const categories = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return [...new Set([...categories, ...getDefaultInventoryCategories(rows)])];
};
