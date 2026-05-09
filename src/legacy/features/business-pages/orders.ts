// @ts-nocheck

export const ORDER_STORAGE_KEY = 'gjh-orders-v1';
export const ORDER_LOG_KEY = 'gjh-order-logs-v1';

export const orderStatusOptions = ['待处理', '已安排', '生产中', '已完成', '已发货', '已结清'];
export const productionQueueStatuses = ['已安排', '生产中', '已完成'];
export const orderPageSizeOptions = [5, 10, 20, 50];

export const defaultOrderRows = [
  { id: 'ORD-20260320', customer: '美的集团', formula: 'PP 滑石粉填充', quantity: 5000, unitPrice: 18, status: '生产中', deliveryDate: '2026-04-10', note: '家电外壳批量单' },
  { id: 'ORD-20260315', customer: '博世汽车零部件', formula: 'PBT-GF30 高强度增强', quantity: 3000, unitPrice: 35, status: '待处理', deliveryDate: '2026-04-01', note: '等待客户确认交货窗口' },
  { id: 'ORD-20260310', customer: '泰科电子', formula: 'PET 无卤阻燃', quantity: 800, unitPrice: 42, status: '已发货', deliveryDate: '2026-03-25', note: '已同步物流单号' },
  { id: 'ORD-20260305', customer: '东成电动工具', formula: 'PA6-GF25 增韧增强', quantity: 1500, unitPrice: 38, status: '已完成', deliveryDate: '2026-03-20', note: '客户要求附质检报告' },
  { id: 'ORD-20260301', customer: '博世汽车零部件', formula: 'PBT-GF30 高强度增强', quantity: 2000, unitPrice: 35, status: '已安排', deliveryDate: '2026-03-15', note: '常规补货单' },
  { id: 'ORD-20260226', customer: '格力电器', formula: 'ABS 阻燃高光', quantity: 2600, unitPrice: 28, status: '已结清', deliveryDate: '2026-03-12', note: '财务已归档' },
];

export const ORDER_FALLBACK_CUSTOMERS = ['美的集团', '博世汽车零部件', '泰科电子', '东成电动工具', '格力电器', '宁波辰光电器', '苏州瑞嘉材料'];
export const ORDER_FALLBACK_FORMULAS = ['PP 滑石粉填充', 'PBT-GF30 高强度增强', 'PET 无卤阻燃', 'PA6-GF25 增韧增强', 'ABS 阻燃高光', 'PC/ABS 耐热合金'];

export const getOrderFallbackDate = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const createNormalizeOrder = ({ getCustomerOptions, getFormulaOptions }) => (order = {}, index = 0) => {
  const status = orderStatusOptions.includes(order.status) ? order.status : orderStatusOptions[0];
  const deliveryDate = String(order.deliveryDate || getOrderFallbackDate()).trim();
  return {
    id: String(order.id || `ORD-${getOrderFallbackDate().replace(/-/g, '')}-${String(index + 1).padStart(2, '0')}`).trim(),
    customer: String(order.customer || getCustomerOptions()[0]).trim(),
    formula: String(order.formula || getFormulaOptions()[0]).trim(),
    quantity: Math.max(0, Number(order.quantity || 0)),
    unitPrice: Math.max(0, Number(order.unitPrice || 0)),
    status,
    deliveryDate,
    productionDate: String(order.productionDate || (productionQueueStatuses.includes(status) ? getOrderFallbackDate() : deliveryDate)).trim(),
    productionNo: String(order.productionNo || '').trim(),
    note: String(order.note || '').trim(),
  };
};

export const createNormalizeOrders = (normalizeOrder) => (value) => {
  const rows = Array.isArray(value)
    ? value.map(normalizeOrder).filter((order) => order.id)
    : [];
  return rows.length ? rows : defaultOrderRows.map(normalizeOrder);
};

export const normalizeOrderLogs = (value) => (value || []).map((entry) => ({
  orderId: String(entry.orderId || ''),
  fromStatus: String(entry.fromStatus || ''),
  toStatus: String(entry.toStatus || ''),
  timestamp: String(entry.timestamp || new Date().toISOString()),
}));

export const formatOrderAmount = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const formatOrderNumber = (value) => Number(value || 0).toLocaleString('zh-CN');

export const getOrderStatusClass = (status) => ({
  生产中: 'is-running',
  待处理: 'is-pending',
  已安排: 'is-scheduled',
  已发货: 'is-shipped',
  已完成: 'is-complete',
  已结清: 'is-settled',
}[status] || 'is-pending');
