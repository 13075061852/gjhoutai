// @ts-nocheck

export const ORDER_STORAGE_KEY = 'gjh-orders-v1';
export const ORDER_LOG_KEY = 'gjh-order-logs-v1';

export const orderStatusOptions = ['待处理', '已安排', '生产中', '已完成', '已发货', '已结清'];
export const productionQueueStatuses = ['已安排', '生产中', '已完成'];
export const orderPageSizeOptions = [5, 10, 20, 50];

export const defaultOrderRows = [];

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
  return rows;
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
