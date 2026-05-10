// @ts-nocheck
import { renderDashboard } from './dashboard';
import { getLegacyApp, getPublicApp } from '../../core/app-context';
import {
  INVENTORY_CATEGORY_STORAGE_KEY,
  INVENTORY_STORAGE_KEY,
  inventoryStateOptions,
  inventoryTypeOptions,
  normalizeInventoryCategories,
  normalizeInventoryRow,
  normalizeInventoryRows,
} from './inventory';
import {
  ORDER_FALLBACK_CUSTOMERS,
  ORDER_FALLBACK_FORMULAS,
  ORDER_LOG_KEY,
  ORDER_STORAGE_KEY,
  createNormalizeOrder,
  createNormalizeOrders,
  formatOrderAmount,
  formatOrderNumber,
  getOrderFallbackDate,
  getOrderStatusClass,
  normalizeOrderLogs,
  orderPageSizeOptions,
  orderStatusOptions,
  productionQueueStatuses,
} from './orders';
import {
  PROCUREMENT_STORAGE_KEY,
  createNormalizeProcurement,
  createNormalizeProcurements,
  procurementPageSizeOptions,
  procurementStatusOptions,
} from './procurement';
import { createBusinessPageShared } from './shared';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;
  const PublicApp = getPublicApp();

  const { refs, utils } = App;
  const {
    esc,
    renderRows,
    renderSearchBox,
    renderStatStrip,
    renderTable,
    scheduleSearchRender,
  } = createBusinessPageShared({ App, refs, utils, render: (...args) => render(...args) });

  const getOrderCustomerOptions = () => {
    try {
      const rows = archiveStates['customer']?.rows;
      if (rows?.length) {
        const names = rows.map((r) => r.name).filter(Boolean);
        if (names.length) return names;
      }
      const defaults = archiveConfigs['customer']?.defaults;
      if (defaults?.length) return defaults.map((r) => r.name).filter(Boolean);
    } catch (_) { /* archives not yet initialized */ }
    return ORDER_FALLBACK_CUSTOMERS;
  };
  const getOrderFormulaOptions = () => {
    try {
      const names = formulaRecipes?.map((r) => r.name).filter(Boolean);
      if (names?.length) return names;
    } catch (_) { /* recipes not yet initialized */ }
    return ORDER_FALLBACK_FORMULAS;
  };
  const normalizeOrder = createNormalizeOrder({
    getCustomerOptions: getOrderCustomerOptions,
    getFormulaOptions: getOrderFormulaOptions,
  });
  const normalizeOrders = createNormalizeOrders(normalizeOrder);
  let orderRows = normalizeOrders(utils.readJson(ORDER_STORAGE_KEY, null));
  let orderLogs = normalizeOrderLogs(utils.readJson(ORDER_LOG_KEY, null));

  const normalizeProcurement = createNormalizeProcurement({
    getDefaultSupplierName: () => supplierRows[0]?.name || '',
  });
  const normalizeProcurements = createNormalizeProcurements(normalizeProcurement);
  const procurementRows = normalizeProcurements(utils.readJson(PROCUREMENT_STORAGE_KEY, null));
  let procurementSupplierFilter = '全部';
  let procurementSearchQuery = '';
  let procurementEditingId = '';
  let procurementModalOpen = false;
  let procurementDraftNote = '原料采购记录自动保存到本地';
  let procurementListPage = 1;
  let procurementPageSize = 10;
  const persistLogs = () => { utils.writeJson(ORDER_LOG_KEY, orderLogs); };
  const getOrderLogs = (id) => orderLogs.filter((entry) => entry.orderId === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const logOrderStatusChange = (id, fromStatus, toStatus) => {
    orderLogs.push({ orderId: id, fromStatus, toStatus, timestamp: new Date().toISOString() });
    persistLogs();
  };
  let orderStatusFilter = '全部';
  let orderDateFilter = '';
  let orderListPage = 1;
  let orderPageSize = 10;
  let orderModalOpen = false;
  let orderEditingId = '';
  let orderDetailId = '';
  let customerDetailCode = '';
  let orderDraftNote = '订单数据自动保存到本地';
  let invoiceSelectedOrderId = orderRows.find((order) => order.status === '待处理')?.id || '';
  let invoiceLineFilter = '全部';
  let invoiceScheduleDate = getOrderFallbackDate();
  let invoiceScheduleSequence = 1;
  let invoiceScheduleDraftOrderId = '';
  let invoiceSplitPort = 1;
  let invoiceBatchCount = 10;
  let invoiceOperationView = 'material';
  let productionPlanDate = getOrderFallbackDate();
  let productionLineFilter = '全部';
  let productionStatusFilter = '全部';
  let productionSearchQuery = '';
  let productionListPage = 1;
  let productionPageSize = 10;

  const getOrderIndex = (id) => orderRows.findIndex((order) => order.id === id);
  const getOrderAmount = (order) => Number(order.quantity || 0) * Number(order.unitPrice || 0);
  const persistOrders = (note = '订单数据已保存') => {
    orderDraftNote = note;
    utils.writeJson(ORDER_STORAGE_KEY, orderRows);
  };
  const updateOrderStatus = (id, nextStatus, notePrefix = '已更新订单状态', options = {}) => {
    const index = getOrderIndex(id);
    if (index < 0 || !orderStatusOptions.includes(nextStatus)) return false;
    if (nextStatus === '生产中') {
      const line = getProductionLineForOrder(orderRows[index]);
      const runningOnSameLine = orderRows.some((item) => item.id !== id && item.status === '生产中' && getProductionLineForOrder(item) === line);
      if (runningOnSameLine) {
        notifyAction(`${line} 号线已有生产中计划，请先完成当前生产任务再开启新计划`, 'warning', `production-line-busy:${line}`);
        return false;
      }
    }
    const oldStatus = orderRows[index].status;
    orderRows[index].status = nextStatus;
    if (options.productionDate) {
      orderRows[index].productionDate = options.productionDate;
    } else if (productionQueueStatuses.includes(nextStatus) && !orderRows[index].productionDate) {
      orderRows[index].productionDate = productionPlanDate || getOrderFallbackDate();
    }
    if (options.productionNo) {
      orderRows[index].productionNo = options.productionNo;
    } else if (nextStatus === '已安排' && !orderRows[index].productionNo) {
      orderRows[index].productionNo = getNextProductionNo(orderRows[index]);
    }
    const productionNo = orderRows[index].productionNo || '';
    persistOrders(`${notePrefix} ${id} · ${getTimeCode()}`);
    logOrderStatusChange(id, oldStatus, nextStatus);
    notifyAction(`订单 ${id} 已更新为${nextStatus}${nextStatus === '已安排' && productionNo ? ` · ${productionNo}` : ''}`, 'success', `order-status:${id}:${nextStatus}`);
    return true;
  };
  const getOrderFormRecord = () => {
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-order-field="${field}"]`)?.value || '').trim();
    const editingOrder = orderRows[getOrderIndex(orderEditingId)] || {};
    return normalizeOrder({
      id: editingOrder.id || `ORD-${getTodayCode().replace(/-/g, '')}${String(orderRows.length + 1).padStart(2, '0')}`,
      customer: read('customer'),
      formula: read('formula'),
      quantity: read('quantity'),
      unitPrice: read('unitPrice'),
      deliveryDate: read('deliveryDate'),
      productionDate: read('productionDate'),
      status: read('status'),
      note: read('note'),
    });
  };
  const saveOrder = () => {
    const order = getOrderFormRecord();
    if (!order.customer || !order.formula || !order.quantity || !order.unitPrice || !order.deliveryDate) {
      orderDraftNote = '请完整填写客户、配方、数量、单价和交货日期';
      notifyAction(orderDraftNote, 'warn', 'order-required-fields');
      return false;
    }
    const index = getOrderIndex(orderEditingId);
    if (index >= 0) {
      const oldStatus = orderRows[index].status;
      orderRows[index] = order;
      if (order.status !== oldStatus) {
        logOrderStatusChange(order.id, oldStatus, order.status);
      }
      persistOrders(`已更新订单 ${order.id} · ${getTimeCode()}`);
      notifyAction(`已保存订单 ${order.id}`, 'success', `order-save:${order.id}`);
      return true;
    }
    orderRows.unshift(order);
    persistOrders(`已新增订单 ${order.id} · ${getTimeCode()}`);
    notifyAction(`已新增订单 ${order.id}`, 'success', `order-save:${order.id}`);
    return true;
  };
  const deleteOrder = async (id) => {
    const index = getOrderIndex(id);
    if (index < 0) return;
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除订单',
      message: `确认删除订单「${id}」？删除后无法恢复。`,
      confirmText: '确认删除',
    });
    if (!confirmed) return;
    orderRows.splice(index, 1);
    persistOrders(`已删除订单 ${id} · ${getTimeCode()}`);
    notifyAction(`已删除订单 ${id}`, 'success', `order-delete:${id}`);
  };

  const renderOrders = () => {
    const visibleOrders = orderRows.filter((order) => {
      const matchedStatus = orderStatusFilter === '全部' || order.status === orderStatusFilter;
      const matchedDate = !orderDateFilter || order.deliveryDate === orderDateFilter;
      return matchedStatus && matchedDate;
    });
    const filteredCount = visibleOrders.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / orderPageSize));
    orderListPage = Math.min(Math.max(1, orderListPage), totalPages);
    const pageStart = (orderListPage - 1) * orderPageSize;
    const pagedOrders = visibleOrders.slice(pageStart, pageStart + orderPageSize);
    const modalOrder = normalizeOrder(orderRows[getOrderIndex(orderEditingId)] || {
      customer: getOrderCustomerOptions()[0],
      formula: getOrderFormulaOptions()[0],
      quantity: '',
      unitPrice: '',
      status: '待处理',
      deliveryDate: getTodayCode(),
      productionDate: getTodayCode(),
      note: '',
    });
    const amountPreview = getOrderAmount(modalOrder);
    const runningCount = orderRows.filter((order) => order.status === '生产中').length;
    const pendingCount = orderRows.filter((order) => order.status === '待处理').length;
    const totalAmount = orderRows.reduce((sum, order) => sum + getOrderAmount(order), 0);

    return `
      <section class="biz-order-page">
        ${renderStatStrip([
          ['订单总数', `${orderRows.length} 单`, `筛选 ${visibleOrders.length} 单`],
          ['生产中', `${runningCount} 单`, pendingCount ? `${pendingCount} 单待处理` : '暂无待处理'],
          ['订单金额', formatOrderAmount(totalAmount), '按当前订单估算'],
          ['最近交付', orderRows.map((order) => order.deliveryDate).sort().at(-1) || '--', '交货日期'],
        ])}
        <section class="business-panel biz-order-table-panel">
          <div class="biz-formula-table-head biz-order-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ti-package" aria-hidden="true"></i>
              <div>
                <h2>订单管理</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-order-table-actions">
              <select data-order-status-filter aria-label="订单状态筛选">
                ${renderOptions(['全部', ...orderStatusOptions], orderStatusFilter)}
              </select>
              <input type="date" value="${esc(orderDateFilter)}" data-order-date-filter aria-label="交货日期筛选">
              <button class="biz-formula-new-btn" type="button" data-order-new>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新建订单</span>
              </button>
            </div>
          </div>
          <div class="biz-formula-table-wrap biz-order-table-wrap ui-table-wrap">
            <table class="biz-formula-table biz-order-table ui-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>客户</th>
                  <th>配方</th>
                  <th>数量(KG)</th>
                  <th>单价(¥/KG)</th>
                  <th>总金额(¥)</th>
                  <th>状态</th>
                  <th>交货日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${pagedOrders.map((order) => `
                  <tr>
                    <td><button class="biz-order-code" type="button" data-order-detail="${esc(order.id)}">${esc(order.id)}</button></td>
                    <td>${esc(order.customer)}</td>
                    <td>${esc(order.formula)}</td>
                    <td>${esc(formatOrderNumber(order.quantity))}</td>
                    <td>¥${esc(Number(order.unitPrice || 0).toFixed(2))}</td>
                    <td><strong class="biz-order-amount">${esc(formatOrderAmount(getOrderAmount(order)))}</strong></td>
                    <td><span class="biz-order-status ${getOrderStatusClass(order.status)}">${esc(order.status)}</span></td>
                    <td>${esc(order.deliveryDate)}</td>
                    <td>
                      <div class="biz-supplier-row-actions biz-order-row-actions">
                        <button type="button" data-order-edit="${esc(order.id)}" aria-label="编辑${esc(order.id)}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <button class="is-danger" type="button" data-order-delete="${esc(order.id)}" aria-label="删除${esc(order.id)}">
                          <i class="ti ti-x" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="9"><div class="biz-formula-empty">暂无匹配订单</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-order-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-order-page-size aria-label="订单每页条数">${orderPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === orderPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-order-page-prev ${orderListPage <= 1 ? 'disabled' : ''} aria-label="订单上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${orderListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-order-page-next ${orderListPage >= totalPages ? 'disabled' : ''} aria-label="订单下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${orderModalOpen ? `
          <div class="biz-order-modal dialog-overlay" data-order-modal>
            <div class="biz-inventory-material-dialog biz-order-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="orderModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="orderModalTitle">${orderEditingId ? '编辑订单' : '新建订单'}</h2>
                  <span>${esc(orderDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭订单弹窗" data-order-close>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-order-editor">
                <label>
                  <span>客户 *</span>
                  <select data-order-field="customer">${renderOptions(getOrderCustomerOptions(), modalOrder.customer)}</select>
                </label>
                <label>
                  <span>配方 *</span>
                  <select data-order-field="formula">${renderOptions(getOrderFormulaOptions(), modalOrder.formula)}</select>
                </label>
                <label>
                  <span>数量 (kg) *</span>
                  <input type="number" min="0" step="1" value="${esc(modalOrder.quantity || '')}" data-order-field="quantity">
                </label>
                <label>
                  <span>单价 (¥/kg) *</span>
                  <input type="number" min="0" step="0.01" value="${esc(modalOrder.unitPrice || '')}" data-order-field="unitPrice">
                </label>
                <label>
                  <span>总金额 (¥)</span>
                  <input type="text" value="${esc(formatOrderAmount(amountPreview))}" readonly data-order-total-preview>
                </label>
                <label>
                  <span>交货日期 *</span>
                  <input type="date" value="${esc(modalOrder.deliveryDate)}" data-order-field="deliveryDate">
                </label>
                <label>
                  <span>生产日期</span>
                  <input type="date" value="${esc(modalOrder.productionDate || modalOrder.deliveryDate)}" data-order-field="productionDate">
                </label>
                <label>
                  <span>状态</span>
                  <select data-order-field="status">${renderOptions(orderStatusOptions, modalOrder.status)}</select>
                </label>
                <label class="is-note">
                  <span>备注</span>
                  <textarea placeholder="补充客户要求、交付说明或生产备注" data-order-field="note">${esc(modalOrder.note)}</textarea>
                </label>
                <div class="biz-order-stock-check">
                  <i class="ti ti-circle-check" aria-hidden="true"></i>
                  <div>
                    <strong>库存检查</strong>
                    <span>所有材料库存充足</span>
                  </div>
                </div>
                <div class="biz-inventory-modal-actions biz-order-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-order-cancel>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-order-save>保存订单</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </section>
    `;
  };

  const renderOrderDetail = () => {
    const order = orderRows.find((o) => o.id === orderDetailId);
    if (!order) {
      return `
        <section class="business-panel biz-order-detail-panel">
          <div class="biz-order-detail-head">
            <button class="biz-inventory-back-btn" type="button" data-order-detail-back>
              <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回订单列表
            </button>
          </div>
          <div class="biz-formula-empty">订单不存在或已被删除</div>
        </section>
      `;
    }
    const logs = getOrderLogs(orderDetailId);
    const line = getProductionLineForOrder(order);
    const currentIdx = orderStatusOptions.indexOf(order.status);
    const statusReachedAt = {};
    logs.forEach((entry) => { statusReachedAt[entry.toStatus] = entry.timestamp; });
    return `
      <section class="business-panel biz-order-detail-panel">
        <div class="biz-order-detail-head">
          <button class="biz-inventory-back-btn" type="button" data-order-detail-back>
            <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回订单列表
          </button>
          <div class="biz-order-detail-title">
            <h2>${esc(order.id)}</h2>
            <span class="biz-order-status ${getOrderStatusClass(order.status)}">${esc(order.status)}</span>
          </div>
        </div>
        <div class="biz-order-status-pipeline">
          <div class="biz-status-pipeline-track">
            ${orderStatusOptions.map((status, idx) => {
              const isCompleted = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              const reached = statusReachedAt[status];
              const dt = reached ? new Date(reached) : null;
              const dateStr = dt ? dt.toLocaleDateString('zh-CN') : '';
              const timeStr = dt ? dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
              return `
                <div class="biz-pipeline-node ${isCompleted ? 'is-done' : ''} ${isCurrent ? 'is-active' : ''}">
                  <div class="biz-pipeline-dot">
                    ${isCompleted ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
                    ${isCurrent ? '<span class="biz-pipeline-pulse"></span>' : ''}
                  </div>
                  <div class="biz-pipeline-label">${status}</div>
                  ${dateStr ? `<div class="biz-pipeline-time">${dateStr} ${timeStr}</div>` : '<div class="biz-pipeline-time">&nbsp;</div>'}
                </div>
              `;
            }).join('')}
          </div>
          <div class="biz-status-pipeline-bar">
            <div class="biz-status-pipeline-fill" style="width:${currentIdx >= 0 ? (currentIdx / (orderStatusOptions.length - 1)) * 100 : 0}%"></div>
          </div>
        </div>
        <div class="biz-order-detail-grid">
          <div class="biz-order-detail-field">
            <label>客户</label>
            <span>${esc(order.customer)}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>配方</label>
            <span>${esc(order.formula)}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>数量 (KG)</label>
            <span>${esc(formatOrderNumber(order.quantity))}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>单价 (¥/KG)</label>
            <span>¥${esc(Number(order.unitPrice || 0).toFixed(2))}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>总金额 (¥)</label>
            <span><strong>${esc(formatOrderAmount(getOrderAmount(order)))}</strong></span>
          </div>
          <div class="biz-order-detail-field">
            <label>交货日期</label>
            <span>${esc(order.deliveryDate)}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>生产日期</label>
            <span>${esc(getOrderProductionDate(order))}</span>
          </div>
          <div class="biz-order-detail-field">
            <label>产线</label>
            <span>${esc(line)} 号线</span>
          </div>
          <div class="biz-order-detail-field">
            <label>排产号</label>
            <span>${esc(order.productionNo || '-')}</span>
          </div>
          <div class="biz-order-detail-field is-note">
            <label>备注</label>
            <span>${esc(order.note || '无')}</span>
          </div>
        </div>
        <div class="biz-order-detail-timeline">
          <h3>状态变更记录</h3>
          ${logs.length ? logs.map((entry) => {
            const dt = new Date(entry.timestamp);
            const dateStr = dt.toLocaleDateString('zh-CN');
            const timeStr = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return `
              <div class="biz-order-timeline-item">
                <div class="biz-order-timeline-dot"></div>
                <div class="biz-order-timeline-content">
                  <span class="biz-order-timeline-time">${dateStr} ${timeStr}</span>
                  <span class="biz-order-timeline-status">
                    <span class="biz-order-status ${getOrderStatusClass(entry.fromStatus)}">${esc(entry.fromStatus)}</span>
                    <i class="ti ti-arrow-right" aria-hidden="true"></i>
                    <span class="biz-order-status ${getOrderStatusClass(entry.toStatus)}">${esc(entry.toStatus)}</span>
                  </span>
                </div>
              </div>
            `;
          }).join('') : '<div class="biz-formula-empty">暂无状态变更记录</div>'}
        </div>
        <div class="biz-order-detail-actions">
          <button class="biz-inventory-primary-btn" type="button" data-order-edit="${esc(order.id)}">编辑订单</button>
        </div>
      </section>
    `;
  };

  const renderCustomerDetail = () => {
    const customer = getCustomerByCode(customerDetailCode);
    if (!customer) {
      return `
        <section class="business-panel biz-customer-detail-panel">
          <div class="biz-order-detail-head">
            <button class="biz-inventory-back-btn" type="button" data-customer-detail-back>
              <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回客户档案
            </button>
          </div>
          <div class="biz-formula-empty">客户不存在或已被删除</div>
        </section>
      `;
    }
    const orders = getCustomerOrders(customer.name);
    const productStats = getCustomerProductStats(orders);
    const totalAmount = productStats.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalQty = productStats.reduce((sum, p) => sum + p.totalQty, 0);
    const activeOrders = orders.filter((o) => !['已完成', '已发货', '已结清'].includes(o.status));
    const topProducts = productStats.slice(0, 3);
    const firstOrderDate = orders.length ? orders[orders.length - 1].deliveryDate : '';
    const lastOrderDate = orders.length ? orders[0].deliveryDate : '';
    const statusDist = {};
    orders.forEach((o) => { statusDist[o.status] = (statusDist[o.status] || 0) + 1; });
    return `
      <section class="business-panel biz-customer-detail-panel">
        <div class="biz-order-detail-head">
          <button class="biz-inventory-back-btn" type="button" data-customer-detail-back>
            <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回客户档案
          </button>
          <div class="biz-order-detail-title">
            <h2>${esc(customer.name)}</h2>
            <span class="biz-customer-grade">${esc(customer.category)}</span>
            <span class="biz-formula-status ${getArchiveStatusClass(customer.status)}">${esc(customer.status)}</span>
          </div>
        </div>
        <div class="biz-customer-kpi-strip">
          <article>
            <span class="kpi-eyebrow">累计采购次数</span>
            <strong>${orders.length}</strong>
            <small>单</small>
          </article>
          <article>
            <span class="kpi-eyebrow">采购总额</span>
            <strong>${esc(formatOrderAmount(totalAmount))}</strong>
          </article>
          <article>
            <span class="kpi-eyebrow">采购总量</span>
            <strong>${esc(formatOrderNumber(totalQty))}</strong>
            <small>KG</small>
          </article>
          <article>
            <span class="kpi-eyebrow">涉及产品</span>
            <strong>${productStats.length}</strong>
            <small>种</small>
          </article>
        </div>
        <div class="biz-customer-info-row">
          <div class="biz-order-detail-grid biz-customer-info-grid">
            <div class="biz-order-detail-field">
              <label>客户编号</label>
              <span>${esc(customer.code)}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>联系人</label>
              <span>${esc(customer.contact || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>电话</label>
              <span>${esc(customer.phone || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>邮箱</label>
              <span>${esc(customer.email || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>地址</label>
              <span>${esc(customer.address || '--')}</span>
            </div>
            <div class="biz-order-detail-field is-note">
              <label>备注</label>
              <span>${esc(customer.note || '无')}</span>
            </div>
          </div>
          <div class="biz-customer-status-dist">
            <h4>订单状态分布</h4>
            ${orderStatusOptions.map((s) => {
              const count = statusDist[s] || 0;
              const pct = orders.length ? Math.round(count / orders.length * 100) : 0;
              return `
                <div class="biz-status-dist-row">
                  <span class="biz-order-status ${getOrderStatusClass(s)}">${s}</span>
                  <div class="biz-status-dist-bar"><div class="biz-status-dist-fill" style="width:${pct}%"></div></div>
                  <strong>${count}</strong>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="biz-customer-section">
          <h3>产品采购分析</h3>
          ${productStats.length ? `
            <div class="biz-customer-product-table-wrap">
              <table class="biz-formula-table biz-order-table ui-table">
                <thead>
                  <tr>
                    <th>产品名称</th>
                    <th>采购次数</th>
                    <th>累计数量 (KG)</th>
                    <th>累计金额 (¥)</th>
                    <th>占比</th>
                    <th>最近交期</th>
                  </tr>
                </thead>
                <tbody>
                  ${productStats.map((p) => `
                    <tr>
                      <td>${esc(p.formula)}</td>
                      <td>${p.count}</td>
                      <td>${esc(formatOrderNumber(p.totalQty))}</td>
                      <td><strong>${esc(formatOrderAmount(p.totalAmount))}</strong></td>
                      <td>
                        <div class="biz-customer-product-bar">
                          <div class="biz-customer-product-fill" style="width:${totalAmount ? Math.round(p.totalAmount / totalAmount * 100) : 0}%"></div>
                          <span>${totalAmount ? Math.round(p.totalAmount / totalAmount * 100) : 0}%</span>
                        </div>
                      </td>
                      <td>${esc(p.lastDate)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="biz-formula-empty">暂无采购记录</div>'}
        </div>
        <div class="biz-customer-section">
          <h3>需求分析</h3>
          <div class="biz-customer-demand-grid">
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-star" aria-hidden="true"></i> 主力采购产品</h4>
              ${topProducts.length ? `
                <ol class="biz-demand-list">
                  ${topProducts.map((p) => `<li><span>${esc(p.formula)}</span><strong>${esc(formatOrderAmount(p.totalAmount))}</strong></li>`).join('')}
                </ol>
              ` : '<p class="biz-demand-hint">暂无数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-activity" aria-hidden="true"></i> 采购活跃度</h4>
              ${orders.length ? `
                <div class="biz-demand-insight">
                  <p>首次采购 <strong>${esc(firstOrderDate)}</strong>，最近采购 <strong>${esc(lastOrderDate)}</strong></p>
                  <p>累计 ${orders.length} 笔订单，覆盖 ${productStats.length} 种产品</p>
                  <p>${activeOrders.length ? `当前有 <strong>${activeOrders.length}</strong> 笔订单处理中` : '当前无处理中订单'}</p>
                </div>
              ` : '<p class="biz-demand-hint">暂无采购数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-chart-bar" aria-hidden="true"></i> 采购偏好</h4>
              ${productStats.length ? `
                <div class="biz-demand-insight">
                  <p>偏好采购 <strong>${esc(topProducts[0]?.formula || '--')}</strong>，占总额 <strong>${topProducts.length ? Math.round(topProducts[0].totalAmount / totalAmount * 100) : 0}%</strong></p>
                  <p>${productStats.length >= 3 ? `前三种产品占比 <strong>${Math.round(topProducts.reduce((s, p) => s + p.totalAmount, 0) / totalAmount * 100)}%</strong>` : ''}</p>
                  <p>${activeOrders.filter((o) => o.status === '生产中').length ? `当前 <strong>${activeOrders.filter((o) => o.status === '生产中').length}</strong> 种产品正在生产中` : ''}</p>
                </div>
              ` : '<p class="biz-demand-hint">暂无数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-bulb" aria-hidden="true"></i> 跟进建议</h4>
              <div class="biz-demand-insight">
                ${(() => {
                  const tips = [];
                  if (!lastOrderDate || new Date(lastOrderDate) < new Date(Date.now() - 30 * 86400000)) tips.push('客户近期无新订单，建议主动跟进回访');
                  if (activeOrders.length > 2) tips.push(`当前 ${activeOrders.length} 笔订单处理中，注意生产进度跟踪`);
                  if (customer.category === '重点客户' && orders.length < 3) tips.push('重点客户订单量偏少，建议了解原因并争取增量');
                  if (customer.status === '暂停服务') tips.push('⚠️ 客户当前暂停服务，确认是否需要恢复合作');
                  if (customer.status === '样品跟进') tips.push('样品阶段客户，建议确认样品反馈并推动量产订单');
                  if (customer.status === '账期复核') tips.push('客户账期复核中，关注回款情况再排新单');
                  if (!tips.length) tips.push('客户关系良好，继续保持现有服务水平');
                  return tips.map((t) => `<p>${t}</p>`).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
        <div class="biz-customer-section">
          <h3>采购明细</h3>
          ${orders.length ? `
            <div class="biz-customer-product-table-wrap">
              <table class="biz-formula-table biz-order-table ui-table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>产品</th>
                    <th>数量 (KG)</th>
                    <th>金额 (¥)</th>
                    <th>状态</th>
                    <th>交货日期</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.map((o) => `
                    <tr>
                      <td><button class="biz-order-code" type="button" data-order-detail="${esc(o.id)}">${esc(o.id)}</button></td>
                      <td>${esc(o.formula)}</td>
                      <td>${esc(formatOrderNumber(o.quantity))}</td>
                      <td><strong>${esc(formatOrderAmount(getOrderAmount(o)))}</strong></td>
                      <td><span class="biz-order-status ${getOrderStatusClass(o.status)}">${esc(o.status)}</span></td>
                      <td>${esc(o.deliveryDate)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="biz-formula-empty">该客户暂无采购记录</div>'}
        </div>
        <div class="biz-order-detail-actions">
          <button class="biz-inventory-primary-btn" type="button" data-archive-edit="customer" data-archive-code="${esc(customer.code)}">编辑客户信息</button>
        </div>
      </section>
    `;
  };

  let supplierDetailCode = '';

  const renderSupplierDetail = () => {
    const supplier = getSupplierByCode(supplierDetailCode);
    if (!supplier) {
      return `
        <section class="business-panel biz-customer-detail-panel biz-supplier-detail-panel">
          <div class="biz-order-detail-head">
            <button class="biz-inventory-back-btn" type="button" data-supplier-detail-back>
              <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回供应商档案
            </button>
          </div>
          <div class="biz-formula-empty">供应商不存在或已被删除</div>
        </section>
      `;
    }
    const procurements = getSupplierProcurements(supplier.name);
    const materialStats = getSupplierMaterialStats(procurements);
    const totalAmount = materialStats.reduce((sum, m) => sum + m.totalAmount, 0);
    const totalQty = materialStats.reduce((sum, m) => sum + m.totalQty, 0);
    const activeProcurements = procurements.filter((p) => !['已结算', '已入库'].includes(p.status));
    const topMaterials = materialStats.slice(0, 3);
    const firstProcurementDate = procurements.length ? procurements[procurements.length - 1].purchaseDate : '';
    const lastProcurementDate = procurements.length ? procurements[0].purchaseDate : '';
    const statusDist = {};
    procurements.forEach((p) => { statusDist[p.status] = (statusDist[p.status] || 0) + 1; });
    return `
      <section class="business-panel biz-customer-detail-panel biz-supplier-detail-panel">
        <div class="biz-order-detail-head">
          <button class="biz-inventory-back-btn" type="button" data-supplier-detail-back>
            <i class="ti ti-arrow-left" aria-hidden="true"></i> 返回供应商档案
          </button>
          <div class="biz-order-detail-title">
            <h2>${esc(supplier.name)}</h2>
            <span class="biz-customer-grade">${esc(supplier.category)}</span>
            <span class="biz-formula-status ${getSupplierStatusClass(supplier.status)}">${esc(supplier.status)}</span>
          </div>
        </div>
        <div class="biz-customer-kpi-strip">
          <article>
            <span class="kpi-eyebrow">累计采购次数</span>
            <strong>${procurements.length}</strong>
            <small>次</small>
          </article>
          <article>
            <span class="kpi-eyebrow">采购总额</span>
            <strong>${esc(formatOrderAmount(totalAmount))}</strong>
          </article>
          <article>
            <span class="kpi-eyebrow">采购总量</span>
            <strong>${esc(formatOrderNumber(totalQty))}</strong>
            <small>KG</small>
          </article>
          <article>
            <span class="kpi-eyebrow">涉及原料</span>
            <strong>${materialStats.length}</strong>
            <small>种</small>
          </article>
        </div>
        <div class="biz-customer-info-row">
          <div class="biz-order-detail-grid biz-customer-info-grid">
            <div class="biz-order-detail-field">
              <label>供应商编号</label>
              <span>${esc(supplier.code)}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>联系人</label>
              <span>${esc(supplier.contact || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>电话</label>
              <span>${esc(supplier.phone || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>邮箱</label>
              <span>${esc(supplier.email || '--')}</span>
            </div>
            <div class="biz-order-detail-field">
              <label>地址</label>
              <span>${esc(supplier.address || '--')}</span>
            </div>
            <div class="biz-order-detail-field is-note">
              <label>备注</label>
              <span>${esc(supplier.note || '无')}</span>
            </div>
          </div>
          <div class="biz-customer-status-dist">
            <h4>采购状态分布</h4>
            ${procurementStatusOptions.map((s) => {
              const count = statusDist[s] || 0;
              const pct = procurements.length ? Math.round(count / procurements.length * 100) : 0;
              return `
                <div class="biz-status-dist-row">
                  <span class="biz-order-status ${getProcurementStatusClass(s)}">${s}</span>
                  <div class="biz-status-dist-bar"><div class="biz-status-dist-fill" style="width:${pct}%"></div></div>
                  <strong>${count}</strong>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="biz-customer-section">
          <h3>原料采购分析</h3>
          ${materialStats.length ? `
            <div class="biz-customer-product-table-wrap">
              <table class="biz-formula-table biz-order-table ui-table">
                <thead>
                  <tr>
                    <th>原料名称</th>
                    <th>采购次数</th>
                    <th>累计数量 (KG)</th>
                    <th>累计金额 (¥)</th>
                    <th>占比</th>
                    <th>最近采购</th>
                  </tr>
                </thead>
                <tbody>
                  ${materialStats.map((m) => `
                    <tr>
                      <td>${esc(m.material)}</td>
                      <td>${m.count}</td>
                      <td>${esc(formatOrderNumber(m.totalQty))}</td>
                      <td><strong>${esc(formatOrderAmount(m.totalAmount))}</strong></td>
                      <td>
                        <div class="biz-customer-product-bar">
                          <div class="biz-customer-product-fill" style="width:${totalAmount ? Math.round(m.totalAmount / totalAmount * 100) : 0}%"></div>
                          <span>${totalAmount ? Math.round(m.totalAmount / totalAmount * 100) : 0}%</span>
                        </div>
                      </td>
                      <td>${esc(m.lastDate)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="biz-formula-empty">暂无采购记录</div>'}
        </div>
        <div class="biz-customer-section">
          <h3>供应分析</h3>
          <div class="biz-customer-demand-grid">
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-star" aria-hidden="true"></i> 主力供应原料</h4>
              ${topMaterials.length ? `
                <ol class="biz-demand-list">
                  ${topMaterials.map((m) => `<li><span>${esc(m.material)}</span><strong>${esc(formatOrderAmount(m.totalAmount))}</strong></li>`).join('')}
                </ol>
              ` : '<p class="biz-demand-hint">暂无数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-activity" aria-hidden="true"></i> 采购活跃度</h4>
              ${procurements.length ? `
                <div class="biz-demand-insight">
                  <p>首次采购 <strong>${esc(firstProcurementDate)}</strong>，最近采购 <strong>${esc(lastProcurementDate)}</strong></p>
                  <p>累计 ${procurements.length} 笔采购，覆盖 ${materialStats.length} 种原料</p>
                  <p>${activeProcurements.length ? `当前有 <strong>${activeProcurements.length}</strong> 笔采购处理中` : '当前无处理中采购'}</p>
                </div>
              ` : '<p class="biz-demand-hint">暂无采购数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-chart-bar" aria-hidden="true"></i> 采购偏好</h4>
              ${materialStats.length ? `
                <div class="biz-demand-insight">
                  <p>偏好采购 <strong>${esc(topMaterials[0]?.material || '--')}</strong>，占总额 <strong>${topMaterials.length ? Math.round(topMaterials[0].totalAmount / totalAmount * 100) : 0}%</strong></p>
                  <p>${materialStats.length >= 3 ? `前三种原料占比 <strong>${Math.round(topMaterials.reduce((s, m) => s + m.totalAmount, 0) / totalAmount * 100)}%</strong>` : ''}</p>
                  <p>${activeProcurements.filter((p) => p.status === '已质检').length ? `当前 <strong>${activeProcurements.filter((p) => p.status === '已质检').length}</strong> 种原料正在质检中` : ''}</p>
                </div>
              ` : '<p class="biz-demand-hint">暂无数据</p>'}
            </div>
            <div class="biz-customer-demand-card">
              <h4><i class="ti ti-bulb" aria-hidden="true"></i> 跟进建议</h4>
              <div class="biz-demand-insight">
                ${(() => {
                  const tips = [];
                  if (!lastProcurementDate || new Date(lastProcurementDate) < new Date(Date.now() - 60 * 86400000)) tips.push('供应商近期无采购订单，建议评估合作关系');
                  if (activeProcurements.length > 2) tips.push(`当前 ${activeProcurements.length} 笔采购处理中，注意跟进到货进度`);
                  if (supplier.category === '基础树脂' && materialStats.length < 3) tips.push('基础树脂供应商原料种类偏少，建议拓展供应品类');
                  if (supplier.status === '暂停合作') tips.push('⚠️ 供应商当前暂停合作，确认是否需要恢复');
                  if (supplier.status === '样品评估') tips.push('样品评估阶段供应商，确认样品测试结果并推动正式合作');
                  if (!tips.length) tips.push('供应商合作稳定，继续保持现有供应关系');
                  return tips.map((t) => `<p>${t}</p>`).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
        <div class="biz-customer-section">
          <h3>采购明细</h3>
          ${procurements.length ? `
            <div class="biz-customer-product-table-wrap">
              <table class="biz-formula-table biz-order-table ui-table">
                <thead>
                  <tr>
                    <th>采购单号</th>
                    <th>原料</th>
                    <th>数量 (KG)</th>
                    <th>金额 (¥)</th>
                    <th>状态</th>
                    <th>采购日期</th>
                  </tr>
                </thead>
                <tbody>
                  ${procurements.map((p) => `
                    <tr>
                      <td><span class="biz-order-code">${esc(p.id)}</span></td>
                      <td>${esc(p.material)}</td>
                      <td>${esc(formatOrderNumber(p.quantity))}</td>
                      <td><strong>${esc(formatOrderAmount(Number(p.quantity || 0) * Number(p.unitPrice || 0)))}</strong></td>
                      <td><span class="biz-order-status ${getProcurementStatusClass(p.status)}">${esc(p.status)}</span></td>
                      <td>${esc(p.purchaseDate)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="biz-formula-empty">该供应商暂无采购记录</div>'}
        </div>
        <div class="biz-order-detail-actions">
          <button class="biz-inventory-primary-btn" type="button" data-supplier-edit="${esc(supplier.code)}">编辑供应商信息</button>
        </div>
      </section>
    `;
  };

  const getProcurementStatusClass = (status) => {
    if (/已结算|已入库/.test(status)) return 'is-ok';
    if (/已发货|已到货|已质检/.test(status)) return 'is-info';
    if (/已下单/.test(status)) return 'is-warn';
    return '';
  };

  const persistProcurements = (note = '原料采购记录已保存') => {
    procurementDraftNote = note;
    utils.writeJson(PROCUREMENT_STORAGE_KEY, procurementRows);
  };

  const getNextProcurementId = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayRows = procurementRows.filter((p) => p.id.startsWith(`PR-${today}`));
    const maxNumber = todayRows.reduce((max, p) => {
      const num = parseInt(p.id.split('-').pop(), 10);
      return num > max ? num : max;
    }, 0);
    return `PR-${today}-${String(maxNumber + 1).padStart(2, '0')}`;
  };

  const saveProcurement = () => {
    const pick = (sel) => refs.businessPageContent?.querySelector(sel)?.value ?? '';
    const id = pick('[data-procurement-field="id"]').trim();
    const supplier = pick('[data-procurement-field="supplier"]').trim();
    const material = pick('[data-procurement-field="material"]').trim();
    const quantity = parseFloat(pick('[data-procurement-field="quantity"]')) || 0;
    const unitPrice = parseFloat(pick('[data-procurement-field="unitPrice"]')) || 0;
    const purchaseDate = pick('[data-procurement-field="purchaseDate"]').trim();
    const status = pick('[data-procurement-field="status"]').trim();
    const note = pick('[data-procurement-field="note"]').trim();
    if (!supplier || !material) {
      notifyAction('请填写供应商和原料名称', 'warning', 'procurement-validation');
      return false;
    }
    const record = normalizeProcurement({ id, supplier, material, quantity, unitPrice, purchaseDate, status, note }, procurementRows.length);
    if (procurementEditingId) {
      const idx = procurementRows.findIndex((p) => p.id === procurementEditingId);
      if (idx >= 0) procurementRows[idx] = record;
    } else {
      procurementRows.push(record);
    }
    persistProcurements(procurementEditingId ? `已更新采购记录 ${id} · ${getTimeCode()}` : `已新增采购记录 ${id} · ${getTimeCode()}`);
    notifyAction(procurementEditingId ? `已更新采购记录 ${id}` : `已新增采购记录 ${id}`, 'success', `procurement-save:${id}`);
    procurementEditingId = '';
    return true;
  };

  const deleteProcurement = async (id) => {
    const procurement = procurementRows.find((p) => p.id === id);
    if (!procurement) return false;
    const confirmed = await confirmDialog('删除采购记录', `确定要删除采购单 ${id} 吗？该操作不可恢复。`);
    if (!confirmed) return false;
    const idx = procurementRows.indexOf(procurement);
    procurementRows.splice(idx, 1);
    persistProcurements(`已删除采购记录 ${id} · ${getTimeCode()}`);
    notifyAction(`已删除采购记录 ${id}`, 'success', `procurement-delete:${id}`);
    return true;
  };

  const renderRawMaterialProcurement = () => {
    const supplierOptions = ['全部', ...new Set(procurementRows.map((p) => p.supplier).filter(Boolean))].sort();
    if (!supplierOptions.includes(procurementSupplierFilter)) procurementSupplierFilter = '全部';
    const normalizedSearch = procurementSearchQuery.trim().toLowerCase();
    const visibleProcurements = procurementRows.filter((p) => {
      const matchedSupplier = procurementSupplierFilter === '全部' || p.supplier === procurementSupplierFilter;
      const values = [p.id, p.supplier, p.material, p.status, p.note];
      const matchedSearch = !normalizedSearch || values.some((v) => String(v).toLowerCase().includes(normalizedSearch));
      return matchedSupplier && matchedSearch;
    });
    const filteredCount = visibleProcurements.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / procurementPageSize));
    procurementListPage = Math.min(Math.max(1, procurementListPage), totalPages);
    const pageStart = (procurementListPage - 1) * procurementPageSize;
    const pagedProcurements = visibleProcurements.slice(pageStart, pageStart + procurementPageSize);
    const editingProcurement = procurementEditingId ? procurementRows.find((p) => p.id === procurementEditingId) : null;
    const procurementForm = editingProcurement || normalizeProcurement({ id: getNextProcurementId(), status: '已下单' });
    const procurementFormAmount = Number(procurementForm.quantity || 0) * Number(procurementForm.unitPrice || 0);

    return `
      <div class="biz-supplier-page biz-procurement-page">
        <section class="business-panel biz-supplier-table-panel biz-procurement-table-panel">
          <div class="biz-formula-table-head biz-supplier-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ti-package-import" aria-hidden="true"></i>
              <div>
                <h2>原料采购管理</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-supplier-table-actions">
              ${renderSearchBox({
                className: 'biz-supplier-search',
                value: procurementSearchQuery,
                placeholder: '搜索采购单号、原料、供应商...',
                label: '搜索原料采购记录',
                attributes: { 'data-procurement-search': '' },
              })}
              <select data-procurement-supplier-filter aria-label="供应商筛选">
                ${supplierOptions.map((s) => `
                  <option value="${esc(s)}" ${s === procurementSupplierFilter ? 'selected' : ''}>${esc(s === '全部' ? '全部供应商' : s)}</option>
                `).join('')}
              </select>
              <button class="biz-formula-new-btn" type="button" data-procurement-new>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新增采购</span>
              </button>
            </div>
          </div>
          <div class="ui-table-wrap biz-supplier-table-wrap">
            <table class="ui-table ui-table--sticky-header ui-table--comfortable biz-supplier-table biz-procurement-table">
              <thead>
                <tr>${['采购单号', '供应商', '原料名称', '数量 (KG)', '单价 (¥)', '金额 (¥)', '采购日期', '状态', '操作'].map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${pagedProcurements.map((p) => `
                  <tr>
                    <td>${esc(p.id)}</td>
                    <td><button class="biz-order-code" type="button" data-supplier-detail-from-procurement="${esc(supplierRows.find((s) => s.name === p.supplier)?.code || '')}">${esc(p.supplier)}</button></td>
                    <td>${esc(p.material)}</td>
                    <td>${esc(formatOrderNumber(p.quantity))}</td>
                    <td>${esc(p.unitPrice.toFixed(2))}</td>
                    <td><strong>${esc(formatOrderAmount(Number(p.quantity || 0) * Number(p.unitPrice || 0)))}</strong></td>
                    <td>${esc(p.purchaseDate)}</td>
                    <td><span class="biz-formula-status ${getProcurementStatusClass(p.status)}">${esc(p.status)}</span></td>
                    <td>
                      <div class="biz-supplier-row-actions">
                        <button type="button" title="编辑采购记录" aria-label="编辑采购 ${esc(p.id)}" data-procurement-edit="${esc(p.id)}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <button class="is-danger" type="button" title="删除采购记录" aria-label="删除采购 ${esc(p.id)}" data-procurement-delete="${esc(p.id)}">
                          <i class="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="9"><div class="biz-formula-empty">暂无匹配采购记录</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-supplier-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-procurement-page-size aria-label="采购每页条数">${procurementPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === procurementPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-procurement-page-prev ${procurementListPage <= 1 ? 'disabled' : ''} aria-label="采购上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${procurementListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-procurement-page-next ${procurementListPage >= totalPages ? 'disabled' : ''} aria-label="采购下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${procurementModalOpen ? `
          <div class="biz-order-modal dialog-overlay" data-procurement-modal>
            <div class="biz-inventory-material-dialog biz-order-dialog biz-supplier-dialog biz-procurement-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="procurementModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="procurementModalTitle">${procurementEditingId ? '编辑采购记录' : '新增采购记录'}</h2>
                  <span>${esc(procurementDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭采购编辑" data-procurement-close>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-supplier-editor">
                <label class="is-code">
                  <span>采购单号</span>
                  <input type="text" value="${esc(procurementForm.id)}" placeholder="例如：PR-20260420" data-procurement-field="id" ${procurementEditingId ? 'readonly' : ''}>
                </label>
                <label class="is-name">
                  <span>供应商 *</span>
                  <select data-procurement-field="supplier">${renderOptions(supplierRows.map((s) => s.name).filter(Boolean), procurementForm.supplier)}</select>
                </label>
                <label>
                  <span>原料名称 *</span>
                  <input type="text" value="${esc(procurementForm.material)}" placeholder="原料名称" data-procurement-field="material">
                </label>
                <label>
                  <span>数量 (KG)</span>
                  <input type="number" value="${esc(String(procurementForm.quantity))}" placeholder="0" min="0" step="0.01" data-procurement-field="quantity">
                </label>
                <label>
                  <span>单价 (¥)</span>
                  <input type="number" value="${esc(String(procurementForm.unitPrice))}" placeholder="0.00" min="0" step="0.01" data-procurement-field="unitPrice">
                </label>
                <label class="is-calc">
                  <span>金额 (¥)</span>
                  <input type="text" value="${esc(formatOrderAmount(procurementFormAmount))}" readonly>
                </label>
                <label>
                  <span>采购日期</span>
                  <input type="date" value="${esc(procurementForm.purchaseDate)}" data-procurement-field="purchaseDate">
                </label>
                <label>
                  <span>状态</span>
                  <select data-procurement-field="status">${renderOptions(procurementStatusOptions, procurementForm.status)}</select>
                </label>
                <label class="is-note">
                  <span>备注</span>
                  <textarea placeholder="采购备注信息" data-procurement-field="note">${esc(procurementForm.note)}</textarea>
                </label>
                <div class="biz-inventory-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-procurement-cancel>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-procurement-save>保存</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const renderInvoice = () => {
    const pendingInvoiceOrders = orderRows.filter((order) => order.status === '待处理');
    const invoiceOrders = pendingInvoiceOrders.filter((order) => (
      invoiceLineFilter === '全部' || String(getRecipeForOrder(order).line || 'A') === invoiceLineFilter
    ));
    if (!invoiceOrders.some((order) => order.id === invoiceSelectedOrderId)) {
      invoiceSelectedOrderId = invoiceOrders[0]?.id || '';
    }
    const order = invoiceOrders.find((item) => item.id === invoiceSelectedOrderId) || invoiceOrders[0] || null;
    const emptyInvoice = !order;
    const invoiceScheduleLine = order ? getProductionLineForOrder(order) : 'A';
    if (order && invoiceScheduleDraftOrderId !== order.id) {
      invoiceScheduleDraftOrderId = order.id;
      invoiceScheduleSequence = getNextProductionSequence(order, invoiceScheduleLine, invoiceScheduleDate);
    }
    const previewOrder = order || normalizeOrder({});
    const recipe = getRecipeForOrder(previewOrder);
    const formulaRows = getFormulaRows(recipe);
    const splitFormulaRows = formulaRows.filter((item) => item.port === invoiceSplitPort);
    const totalKg = Number(previewOrder.quantity || 0);
    const splitTotalKg = splitFormulaRows.reduce((sum, item) => sum + getInvoiceMaterialKg(item, totalKg), 0);
    const splitBatchKg = splitTotalKg / Math.max(invoiceBatchCount, 1);
    const invoiceDate = previewOrder.productionNo ? getOrderProductionDate(previewOrder) : invoiceScheduleDate;
    const invoiceLine = previewOrder.productionNo ? `${getProductionLineForOrder(previewOrder)}线` : `${invoiceScheduleLine}线`;
    const invoiceNo = getInvoicePreviewNo(previewOrder);
    const invoiceScheduleNo = `${invoiceScheduleLine}${invoiceScheduleSequence}`;
    const invoiceScheduleConflict = order && hasProductionSlotConflict(order.id, invoiceScheduleDate, invoiceScheduleNo);
    const invoiceSequenceOptions = Array.from({ length: 12 }, (_, index) => index + 1);
    const outputRate = totalKg >= 1000 ? `${formatKgValue(totalKg / 1000)}吨/小时` : `${formatKgValue(totalKg)} kg/小时`;
    const getRowSpan = (rows, index, getter) => {
      const value = getter(rows[index]);
      if (index > 0 && getter(rows[index - 1]) === value) return 0;
      let span = 1;
      while (index + span < rows.length && getter(rows[index + span]) === value) span += 1;
      return span;
    };
    const batchOptions = [1, 2, 3, 4, 5, 6, 8, 10, 12];
    const portOptions = feederPorts.map((port) => {
      const portTotal = formulaRows
        .filter((item) => item.port === port)
        .reduce((sum, item) => sum + getInvoiceMaterialKg(item, totalKg), 0);
      return [String(port), `${port}号下料口 · ${formatKgValue(portTotal)} kg`];
    });
    const maxBatchColumnsPerTable = 6;
    const batchTableCount = Math.max(1, Math.ceil(invoiceBatchCount / maxBatchColumnsPerTable));
    const baseBatchColumns = Math.floor(invoiceBatchCount / batchTableCount);
    const extraBatchColumns = invoiceBatchCount % batchTableCount;
    let nextBatchNo = 1;
    const batchColumnGroups = Array.from({ length: batchTableCount }, (_, groupIndex) => {
      const groupSize = baseBatchColumns + (groupIndex < extraBatchColumns ? 1 : 0);
      return Array.from({ length: groupSize }, () => nextBatchNo++);
    });
    const isScrewView = invoiceOperationView === 'screw';
    const operationTitle = isScrewView ? '螺杆操作图' : '配料操作图';
    const materialColumns = Array.from({ length: 6 }, (_, index) => formulaRows[index] || null);
    const categoryRow = materialColumns.map((item) => item ? esc(item.name) : '');
    const ratioRow = materialColumns.map((item) => item ? `${formatKgValue(item.ratio)}%` : '');
    const loadRow = materialColumns.map((item) => item ? `${formatKgValue(getInvoiceMaterialKg(item, totalKg))}kg` : '');
    const cleanRow = materialColumns.map((item) => {
      if (!item) return '';
      if (/色母|母粒/i.test(item.name)) return '扫仓、吸秤';
      return '—';
    });
    const processText = Array.isArray(recipe.process) ? recipe.process.map((item) => item.join(' ')).join('；') : '';
    const processTemps = Array.from(processText.matchAll(/(\d{2,3})\s*C/gi), (match) => Number(match[1]));
    const category = getFormulaCategory(recipe);
    const tempBase = processTemps.length
      ? processTemps[processTemps.length - 1]
      : category === 'PP'
        ? 210
        : category === 'ABS'
          ? 225
          : 245;
    const screwSpeed = category === 'PP' ? 430 : category === 'ABS' ? 420 : 460;
    const sideSpeed1 = Math.round(screwSpeed * 0.11);
    const sideSpeed2 = Math.round(screwSpeed * 0.13);
    const cutterSpeed = category === 'PP' ? 95 : 105;
    const tempZones = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'G1', 'G2'];
    const tempValues = tempZones.map((zone, index) => {
      if (zone === 'C0') return 0;
      if (zone === 'G1' || zone === 'G2') return tempBase;
      if (index <= 4) return tempBase + 10;
      if (index <= 7) return tempBase;
      return tempBase - 10 + (index % 3 === 1 ? 10 : 0);
    });
    const inspectionColumns = Array.from({ length: 16 }, (_, index) => index + 1);
    const renderScrewOperationSheet = () => `
              <div class="biz-operation-sheet biz-screw-sheet" ${emptyInvoice ? 'hidden' : ''}>
                <header class="biz-screw-header">
                  <h1>螺杆操作图</h1>
                  <strong>${esc(invoiceNo)}</strong>
                </header>
                <div class="biz-screw-meta-grid">
                  <div><span>型号</span><strong>${esc(recipe.product || recipe.code || previewOrder.formula)}</strong></div>
                  <div><span>台号</span><strong>${esc(recipe.code || '--')}</strong></div>
                  <div><span>生产线</span><strong>${esc(invoiceLine)}</strong></div>
                  <div><span>计划胶量 [kg]</span><strong>${formatKgValue(totalKg)}</strong></div>
                  <div><span>日期</span><strong>${esc(invoiceDate)}</strong></div>
                  <div><span>批号</span><strong>${esc(invoiceNo)}</strong></div>
                </div>
                <div class="biz-screw-lead-grid">
                  <section class="biz-screw-section biz-screw-meter">
                    <h3><span>1</span>计量秤</h3>
                    <table class="biz-screw-formula">
                      <tbody>
                        <tr><th>编号</th>${materialColumns.map((_, index) => `<th>${index + 1}</th>`).join('')}</tr>
                        <tr><td>物料类别</td>${categoryRow.map((value) => `<td>${value}</td>`).join('')}</tr>
                        <tr><td>比例</td>${ratioRow.map((value) => `<td>${value}</td>`).join('')}</tr>
                        <tr><td>负荷</td>${loadRow.map((value) => `<td>${value}</td>`).join('')}</tr>
                        <tr><td>生产前清理</td>${cleanRow.map((value) => `<td>${value}</td>`).join('')}</tr>
                      </tbody>
                    </table>
                  </section>
                  <aside class="biz-screw-confirm">
                    <section class="biz-screw-section">
                      <h3>操作确认</h3>
                      <div class="biz-screw-sign-grid">
                        <span>操作</span><i></i>
                        <span>复核</span><i></i>
                      </div>
                    </section>
                  </aside>
                </div>
                <section class="biz-screw-section biz-screw-equipment">
                  <h3><span>2</span>主设备参数</h3>
                  <table class="biz-screw-param-table">
                    <tbody>
                      <tr>
                        <td><span>螺杆转速 [rpm]</span><strong>${screwSpeed}</strong></td>
                        <td><span>侧位1螺杆转速 [rpm]</span><strong>${sideSpeed1}</strong></td>
                        <td><span>切粒机转速 [rpm]</span><strong>${cutterSpeed}</strong></td>
                        <td><span>过水长度 [m]</span><strong>0.9</strong></td>
                        <td><span>熔压 [Bar]</span><strong>120</strong></td>
                      </tr>
                      <tr>
                        <td><span>产量 [kg/h]</span><strong>${formatKgValue(totalKg >= 1000 ? totalKg : Math.max(totalKg, 800))}</strong></td>
                        <td><span>侧位2螺杆转速 [rpm]</span><strong>${sideSpeed2}</strong></td>
                        <td><span>真空压力表 [Mpa]</span><strong>0.08-0.09</strong></td>
                        <td><span>熔温 [°C]</span><strong>${tempBase}</strong></td>
                        <td><span>扭矩 [%]</span><strong>60</strong></td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="biz-screw-temp-title">炮筒温度 [°C]</div>
                  <table class="biz-screw-temp">
                    <tbody>
                      <tr>${tempZones.map((zone) => `<th>${zone}</th>`).join('')}</tr>
                      <tr>${tempValues.map((value) => `<td>${value}</td>`).join('')}</tr>
                    </tbody>
                  </table>
                </section>
                <section class="biz-screw-section biz-screw-inspection">
                  <h3><span>3</span>巡检记录</h3>
                  <table class="biz-screw-check">
                    <tbody>
                      ${['时间', '真空度', '焦料清理', '粒子外观', '计量秤状态'].map((label, index) => `
                        <tr>
                          ${index === 0 ? '<th rowspan="5">30分钟/次</th>' : ''}
                          <td>${label}</td>
                          ${inspectionColumns.map(() => '<td></td>').join('')}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </section>
                <section class="biz-screw-section biz-screw-summary">
                  <h3><span>4</span>数量统计</h3>
                  <table>
                    <tbody>
                      <tr><th colspan="7">计量秤使用量（KG）</th></tr>
                      <tr><td>合计</td>${materialColumns.map((_, index) => `<td>${index + 1}</td>`).join('')}</tr>
                      <tr><td>${formatKgValue(totalKg)}</td>${materialColumns.map(() => '<td></td>').join('')}</tr>
                    </tbody>
                  </table>
                  <table>
                    <tbody>
                      <tr><th colspan="5">入库量（KG）</th></tr>
                      <tr><td>产出量</td><td>开机料</td><td>料块</td><td>取样</td><td>入库</td></tr>
                      <tr><td></td><td></td><td></td><td></td><td></td></tr>
                    </tbody>
                  </table>
                </section>
              </div>
    `;

    return `
      <section class="biz-invoice-workbench">
        <div class="biz-invoice-layout">
          <aside class="business-panel biz-invoice-orders">
            <div class="business-panel-head">
              <h2>待开单配方</h2>
              <span>订单调取</span>
            </div>
            <div class="biz-invoice-line-filter" role="group" aria-label="按产线筛选待开单订单">
              ${['全部', ...formulaLineOptions].map((line) => {
                const count = line === '全部'
                  ? pendingInvoiceOrders.length
                  : pendingInvoiceOrders.filter((item) => String(getRecipeForOrder(item).line || 'A') === line).length;
                return `
                  <button class="${invoiceLineFilter === line ? 'is-active' : ''}" type="button" data-invoice-line-filter="${esc(line)}">
                    ${esc(line === '全部' ? '全部' : `${line}线`)}<span>${count}</span>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="biz-invoice-order-list ${invoiceOrders.length ? '' : 'is-empty'}">
              ${invoiceOrders.map((item) => {
                const itemRecipe = getRecipeForOrder(item);
                const itemNo = getInvoiceNoForOrder(item);
                return `
                  <button class="${item.id === previewOrder.id ? 'is-active' : ''}" type="button" data-invoice-order="${esc(item.id)}">
                    <strong>${esc(item.formula)}</strong>
                    <span>${formatKgValue(item.quantity)} kg · ${esc(itemRecipe.code || itemRecipe.name)}</span>
                    <em>${esc(item.id)} / ${esc(itemRecipe.line || 'A')}线 · ${esc(itemNo)}</em>
                  </button>
                `;
              }).join('') || `
                <div class="biz-invoice-order-empty">
                  <i class="ti ti-list-check" aria-hidden="true"></i>
                  <strong>暂无待开单订单</strong>
                  <span>待处理订单为空</span>
                </div>
              `}
            </div>
          </aside>
          <section class="business-panel biz-invoice-preview-panel">
            <div class="biz-invoice-toolbar">
              <div class="biz-invoice-toolbar-title">
                <h2>${operationTitle}</h2>
              </div>
              <div class="biz-invoice-toolbar-main">
                <div class="biz-invoice-view-switch" role="group" aria-label="操作图切换">
                  <button class="${!isScrewView ? 'is-active' : ''}" type="button" data-invoice-view="material">配料操作图</button>
                  <button class="${isScrewView ? 'is-active' : ''}" type="button" data-invoice-view="screw">螺杆操作图</button>
                </div>
                <div class="biz-invoice-toolbar-controls">
                  <label data-date-picker-trigger>
                    <input type="date" value="${esc(invoiceScheduleDate)}" data-invoice-schedule-date aria-label="生产日期">
                  </label>
                  <label>
                    <select data-invoice-schedule-sequence aria-label="线内序号">${invoiceSequenceOptions.map((value) => {
                      const no = `${invoiceScheduleLine}${value}`;
                      const occupied = order && hasProductionSlotConflict(order.id, invoiceScheduleDate, no);
                      return `<option value="${value}" ${value === invoiceScheduleSequence ? 'selected' : ''}>${esc(no)}${occupied ? ' · 已占用' : ''}</option>`;
                    }).join('')}</select>
                  </label>
                  <label>
                    <select data-invoice-port aria-label="依据下料口">${portOptions.map(([value, label]) => `<option value="${esc(value)}" ${Number(value) === invoiceSplitPort ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
                  </label>
                  <label>
                    <select data-invoice-batch-count aria-label="划分批次">${batchOptions.map((value) => `<option value="${value}" ${value === invoiceBatchCount ? 'selected' : ''}>${value} 批</option>`).join('')}</select>
                  </label>
                </div>
              </div>
              ${invoiceScheduleConflict ? '<div class="biz-invoice-schedule-warning">当前生产日期下该排产号已被占用，请调整产线或线内序号。</div>' : ''}
            </div>
            <div class="biz-invoice-preview-scroll ${emptyInvoice ? 'is-empty' : ''} ${isScrewView ? 'is-screw-view' : ''}">
              ${emptyInvoice ? `
                <div class="biz-invoice-empty-state">
                  <i class="ti ti-list-check" aria-hidden="true"></i>
                  <strong>暂无待开单配方</strong>
                  <span>待处理订单为空，当前没有可生成的配料操作图</span>
                </div>
              ` : ''}
              ${isScrewView ? renderScrewOperationSheet() : `
              <div class="biz-operation-sheet biz-requisition-sheet" ${emptyInvoice ? 'hidden' : ''}>
              <div class="biz-requisition-main">
                <section class="biz-requisition-left">
                  <div class="biz-requisition-company">宁波广俊塑料科技有限公司</div>
                  <div class="biz-requisition-meta">
                    <span>领料单&nbsp;&nbsp;${esc(invoiceNo)}</span>
                    <span>日期：${esc(invoiceDate)}</span>
                  </div>
                  <table class="biz-requisition-material-table">
                    <thead>
                      <tr>
                        <th>产线</th>
                        <th>料仓</th>
                        <th>物料名称</th>
                        <th>计划数量</th>
                        <th>数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${formulaRows.map((item, index) => {
                        const lineSpan = index === 0 ? formulaRows.length : 0;
                        const portSpan = getRowSpan(formulaRows, index, (row) => row.port);
                        return `
                          <tr>
                            ${lineSpan ? `<td rowspan="${lineSpan}">${esc(invoiceLine)}</td>` : ''}
                            ${portSpan ? `<td rowspan="${portSpan}">${item.port}号</td>` : ''}
                            <td>${esc(item.name)}</td>
                            <td>${formatKgValue(getInvoiceMaterialKg(item, totalKg))}</td>
                            <td></td>
                          </tr>
                        `;
                      }).join('')}
                      <tr class="is-total"><td></td><td></td><td>合计</td><td>${formatKgValue(totalKg)}</td><td></td></tr>
                      <tr class="biz-requisition-wide-row"><td colspan="2">产量</td><td colspan="3">${esc(outputRate)}</td></tr>
                      <tr class="biz-requisition-wide-row"><td colspan="2">备注</td><td colspan="3">${esc(previewOrder.note || '')}</td></tr>
                      ${Array.from({ length: Math.max(2, 10 - formulaRows.length) }, () => '<tr class="is-blank"><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
                    </tbody>
                  </table>
                  <div class="biz-requisition-sign">领料人：<span></span></div>
                </section>
                <aside class="biz-requisition-right">
                  <div class="biz-requisition-batch-card">
                    <div class="biz-requisition-batch-title">${formatKgValue(totalKg)} kg</div>
                    ${batchColumnGroups.map((batchColumns, groupIndex) => {
                      const isLastGroup = groupIndex === batchColumnGroups.length - 1;
                      return `
                        <table class="biz-requisition-batch-table">
                          <thead>
                            <tr>
                              <th>物料名称</th>
                              ${batchColumns.map((batchNo) => `<th>第${batchNo}缸</th>`).join('')}
                            </tr>
                          </thead>
                          <tbody>
                            ${splitFormulaRows.map((item) => {
                              const materialKg = getInvoiceMaterialKg(item, totalKg);
                              const batchKg = materialKg / Math.max(invoiceBatchCount, 1);
                              return `
                                <tr>
                                  <td>${esc(item.name)}</td>
                                  ${batchColumns.map(() => `<td>${formatKgValue(batchKg)}</td>`).join('')}
                                </tr>
                              `;
                            }).join('') || `<tr><td colspan="${batchColumns.length + 1}">暂无${invoiceSplitPort}号下料口材料</td></tr>`}
                            <tr class="is-total">
                              <td>合计</td>
                              ${batchColumns.map(() => `<td>${formatKgValue(splitBatchKg)}</td>`).join('')}
                            </tr>
                          </tbody>
                        </table>
                      `;
                    }).join('')}
                  </div>
                </aside>
              </div>
              </div>
              `}
            </div>
            <div class="biz-invoice-preview-actions">
              <button class="is-schedule" type="button" data-invoice-schedule ${emptyInvoice || invoiceScheduleConflict ? 'disabled' : ''}><i class="ti ti-list-check" aria-hidden="true"></i><span>安排生产</span></button>
              <button type="button" data-invoice-print ${emptyInvoice ? 'disabled' : ''}><i class="ti ti-printer" aria-hidden="true"></i><span>打印开单</span></button>
              <button class="is-primary" type="button" data-invoice-export ${emptyInvoice ? 'disabled' : ''}><i class="ti ti-download" aria-hidden="true"></i><span>生成图片</span></button>
            </div>
          </section>
        </div>
      </section>
    `;
  };

  const renderStock = () => `
    ${renderStatStrip([['可售库存', '186.5 吨', '-4.2%'], ['锁库订单', '31', '执行中'], ['低库存', '9 项', '需采购'], ['周转天数', '18.6', '天']])}
    <section class="biz-stock-layout">
      <article class="business-panel biz-warehouse-map">
        <div class="business-panel-head"><h2>仓库热力</h2><span>可售 / 锁定 / 预警</span></div>
        ${['华东仓 82%', '华南仓 64%', '原料仓 41%', '样品仓 29%'].map((item, index) => `<div class="biz-warehouse-cell level-${index}">${esc(item)}</div>`).join('')}
      </article>
      <article class="business-panel biz-reserve-list">
        <div class="business-panel-head"><h2>锁库队列</h2><span>48 小时规则</span></div>
        <div class="biz-reserve-item"><strong>SO-018</strong><span>阻燃 ABS 2.4 吨</span><em>剩余 18h</em></div>
        <div class="biz-reserve-item"><strong>SO-014</strong><span>增强 PP 5 吨</span><em>剩余 31h</em></div>
        <div class="biz-reserve-item warn"><strong>SO-009</strong><span>黑色母 0.8 吨</span><em>库存不足</em></div>
      </article>
    </section>
    ${renderTable('库存关注列表', ['物料', '仓库', '可售', '建议'], [
      ['GJ-ABS-FR-760', '华东仓', '1.2 吨', '限制接单'],
      ['GJ-PP-GF30', '华南仓', '6.8 吨', '可正常销售'],
      ['黑色母 B-204', '原料仓', '0.6 吨', '发起采购'],
    ])}
  `;

  const inventoryRows = normalizeInventoryRows(utils.readJson(INVENTORY_STORAGE_KEY, null));
  let inventoryCategories = normalizeInventoryCategories(utils.readJson(INVENTORY_CATEGORY_STORAGE_KEY, null), inventoryRows);
  let inventoryCategory = '全部';
  let inventoryEditingMaterialName = '';
  let inventoryEditingCategory = '';
  let inventorySearchQuery = '';
  let inventoryDraftNote = '库存数据自动保存到本地';
  let inventoryCategoryModalOpen = false;
  let inventoryMaterialModalOpen = false;
  let inventoryListPage = 1;
  let inventoryPageSize = 10;
  let activeFormulaId = 'FM-ABS-FR-760';
  let formulaMaterialCategory = '全部';
  let formulaDraftNote = '草稿自动保存';
  let formulaSearchQuery = '';
  let activeFormulaMaterialIndex = null;
  let formulaViewMode = 'list';
  let formulaListCategory = '全部';
  let formulaListStatus = '全部';
  let formulaListPage = 1;
  let formulaPageSize = 10;
  let formulaEditorDraft = null;
  let formulaEditorOriginalKey = '';
  let formulaLibraryCollapsed = false;
  const formulaPageSizeOptions = [5, 10, 20, 50];

  const SUPPLIER_STORAGE_KEY = 'gjh-suppliers-v1';
  const supplierCategoryOptions = ['基础树脂', '改性添加剂', '销售成品', '增强填料', '稳定助剂', '色母助剂', '物流服务'];
  const supplierStatusOptions = ['正常合作', '样品评估', '暂停合作'];
  const defaultSupplierRows = [
    { code: 'S001', name: '南通星辰合成材料', contact: '张经理', phone: '0513-88881234', email: 'zhang@ntxc.com', category: '基础树脂', status: '正常合作', address: '江苏省南通市经济技术开发区', note: '主供 ABS、PC 基础树脂，月度对账稳定。' },
    { code: 'S002', name: '中石化仪征化纤', contact: '李工', phone: '0514-87654321', email: 'li@yizheng.com', category: '基础树脂', status: '正常合作', address: '江苏省扬州市仪征市胥浦工业区', note: 'PP、PET 原料长期供应，需提前锁定排产计划。' },
    { code: 'S003', name: '巴斯夫中国', contact: '王经理', phone: '021-23456789', email: 'wang@basf.com', category: '基础树脂', status: '样品评估', address: '上海市浦东新区江心沙路 300 号', note: '高性能树脂与助剂样品跟进中。' },
    { code: 'S004', name: '中石油独山子石化', contact: '赵工', phone: '0992-3888001', email: 'zhao@dsn.com', category: '基础树脂', status: '正常合作', address: '新疆克拉玛依市独山子区大庆东路', note: 'PP、PE 类原料，铁路到货周期需预留。' },
    { code: 'S005', name: '巨石集团', contact: '陈经理', phone: '0573-88112233', email: 'chen@jushi.com', category: '改性添加剂', status: '正常合作', address: '浙江省嘉兴市桐乡经济开发区文华南路', note: '玻纤增强材料主供，关注批次含水率。' },
    { code: 'S006', name: '以色列化工集团(ICL)', contact: 'David', phone: '+972-2-1234567', email: 'david@icl-group.com', category: '改性添加剂', status: '正常合作', address: 'Millennium Tower, Tel Aviv, Israel', note: '阻燃剂进口供应，年度资质文件待补齐。' },
    { code: 'S007', name: '巴斯夫添加剂', contact: '孙经理', phone: '021-34567890', email: 'sun@basf-ada.com', category: '改性添加剂', status: '正常合作', address: '上海市浦东新区江心沙路 300 号', note: '抗氧剂、光稳定剂合作供应。' },
    { code: 'S008', name: '陶氏化学', contact: '周经理', phone: '021-56789012', email: 'zhou@dow.com', category: '改性添加剂', status: '样品评估', address: '上海市浦东新区张江高科技园区', note: '相容剂、增韧剂样品测试中。' },
    { code: 'S009', name: '科莱恩化工', contact: '吴经理', phone: '021-67890123', email: 'wu@clariant.com', category: '改性添加剂', status: '正常合作', address: '上海市闵行区申长路 988 号', note: '色母与功能助剂，交期需提前确认。' },
    { code: 'S010', name: '南京曙光化工', contact: '钱工', phone: '025-84567890', email: 'qian@sgchem.com', category: '销售成品', status: '正常合作', address: '江苏省南京市六合区化工园区', note: '成品材料协同销售与区域渠道支持。' },
  ];

  const normalizeSupplier = (supplier = {}, index = 0) => {
    const source = Array.isArray(supplier)
      ? {
        code: supplier[0],
        name: supplier[1],
        contact: supplier[2],
        phone: supplier[3],
        email: supplier[4],
        category: supplier[5],
        address: supplier[6],
        status: supplier[7],
        note: supplier[8],
      }
      : supplier;
    return {
      code: String(source.code || `S${String(index + 1).padStart(3, '0')}`).trim(),
      name: String(source.name || '').trim(),
      contact: String(source.contact || '').trim(),
      phone: String(source.phone || '').trim(),
      email: String(source.email || '').trim(),
      category: String(source.category || '基础树脂').trim(),
      status: supplierStatusOptions.includes(String(source.status || '').trim()) ? String(source.status || '').trim() : '正常合作',
      address: String(source.address || '').trim(),
      note: String(source.note || '').trim(),
    };
  };
  const normalizeSuppliers = (value) => {
    const rows = Array.isArray(value)
      ? value.map(normalizeSupplier).filter((supplier) => supplier.code && supplier.name)
      : [];
    return rows.length ? rows : defaultSupplierRows.map(normalizeSupplier);
  };
  const supplierRows = normalizeSuppliers(utils.readJson(SUPPLIER_STORAGE_KEY, null));
  let supplierCategoryFilter = '全部';
  let supplierSearchQuery = '';
  let supplierEditingCode = '';
  let supplierModalOpen = false;
  let supplierDraftNote = '供应商档案自动保存到本地';
  let supplierListPage = 1;
  let supplierPageSize = 10;
  const normalizeArchiveRecord = (config, record = {}, index = 0) => {
    const source = Array.isArray(record)
      ? {
        code: record[0],
        name: record[1],
        contact: record[2],
        phone: record[3],
        email: record[4],
        category: record[5],
        status: record[6],
        address: record[7],
        note: record[8],
      }
      : record;
    const status = String(source.status || '').trim();
    return {
      code: String(source.code || `${config.codePrefix}${String(index + 1).padStart(3, '0')}`).trim(),
      name: String(source.name || '').trim(),
      contact: String(source.contact || '').trim(),
      phone: String(source.phone || '').trim(),
      email: String(source.email || '').trim(),
      category: String(source.category || config.categories[0]).trim(),
      status: config.statuses.includes(status) ? status : config.statuses[0],
      address: String(source.address || '').trim(),
      note: String(source.note || '').trim(),
    };
  };
  const normalizeArchiveRows = (config, value) => {
    const rows = Array.isArray(value)
      ? value.map((record, index) => normalizeArchiveRecord(config, record, index)).filter((record) => record.code && record.name)
      : [];
    return rows.length ? rows : config.defaults.map((record, index) => normalizeArchiveRecord(config, record, index));
  };

  const getInventoryCategories = () => [
    ...new Set([...inventoryCategories, ...inventoryRows.map((row) => row[2]).filter(Boolean)]),
  ];

  const notifyAction = (message, tone = 'success', key = '') => {
    App.notify?.show?.({
      title: tone === 'warn' ? '需要处理' : '操作完成',
      message,
      tone,
      key: key || `${tone}:${message}`,
    });
  };

  const persistInventory = (note = '库存数据已保存') => {
    inventoryDraftNote = note;
    inventoryCategories = getInventoryCategories();
    utils.writeJson(INVENTORY_STORAGE_KEY, inventoryRows);
    utils.writeJson(INVENTORY_CATEGORY_STORAGE_KEY, inventoryCategories);
  };

  const getInventoryMaterialIndex = (name) => inventoryRows.findIndex((row) => row[0] === name);

  const syncFormulaMaterialName = (oldName, nextName) => {
    if (!oldName || oldName === nextName) return;
    formulaRecipes.forEach((recipe) => {
      (recipe.materials || []).forEach((material) => {
        if (material.name === oldName) material.name = nextName;
      });
    });
    persistFormulaRecipes(`已同步库存材料名称 · ${getTimeCode()}`);
  };

  const removeFormulaMaterialName = (name) => {
    let changed = false;
    formulaRecipes.forEach((recipe) => {
      const before = recipe.materials?.length || 0;
      recipe.materials = (recipe.materials || []).filter((material) => material.name !== name);
      changed = changed || before !== recipe.materials.length;
    });
    if (changed) persistFormulaRecipes(`已移除配方中的 ${name}`);
  };

  const getInventoryFormRow = () => {
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-inventory-material-field="${field}"]`)?.value || '').trim();
    const currentRow = normalizeInventoryRow(inventoryRows[getInventoryMaterialIndex(inventoryEditingMaterialName)] || []);
    return [
      read('name'),
      read('type') || currentRow[1] || '原材料',
      read('category') || '未分类',
      read('supplier') || '未关联供应商',
      read('quantity') || '--',
      read('state') || currentRow[5] || '待确认',
      read('model'),
      read('batch'),
      read('unitPrice'),
      read('safetyStock'),
      read('spec'),
    ];
  };

  const saveInventoryMaterial = () => {
    const row = getInventoryFormRow();
    if (!row[0]) {
      inventoryDraftNote = '请先填写材料名称';
      notifyAction(inventoryDraftNote, 'warn', 'inventory-material-name-required');
      return false;
    }
    const currentIndex = inventoryEditingMaterialName ? getInventoryMaterialIndex(inventoryEditingMaterialName) : -1;
    const duplicatedIndex = getInventoryMaterialIndex(row[0]);
    if (duplicatedIndex >= 0 && duplicatedIndex !== currentIndex) {
      inventoryDraftNote = '材料名称已存在，请换一个名称';
      notifyAction(inventoryDraftNote, 'warn', 'inventory-material-name-duplicated');
      return false;
    }
    if (currentIndex >= 0) {
      const oldName = inventoryRows[currentIndex][0];
      inventoryRows[currentIndex] = row;
      syncFormulaMaterialName(oldName, row[0]);
      inventoryEditingMaterialName = row[0];
      inventoryCategory = row[2];
      persistInventory(`已更新材料 ${row[0]} · ${getTimeCode()}`);
      notifyAction(`已保存材料 ${row[0]}`, 'success', `inventory-material-save:${row[0]}`);
      return true;
    }
    inventoryRows.unshift(row);
    inventoryEditingMaterialName = row[0];
    inventoryCategory = row[2];
    persistInventory(`已新增材料 ${row[0]} · ${getTimeCode()}`);
    notifyAction(`已新增材料 ${row[0]}`, 'success', `inventory-material-save:${row[0]}`);
    return true;
  };

  const deleteInventoryMaterial = async (name) => {
    const index = getInventoryMaterialIndex(name);
    if (index < 0) return;
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除材料',
      message: `确认删除材料「${name}」？相关配方中的引用也会移除。`,
    });
    if (!confirmed) return false;
    inventoryRows.splice(index, 1);
    if (inventoryEditingMaterialName === name) inventoryEditingMaterialName = '';
    removeFormulaMaterialName(name);
    persistInventory(`已删除材料 ${name} · ${getTimeCode()}`);
    notifyAction(`已删除材料 ${name}`, 'success', `inventory-material-delete:${name}`);
    return true;
  };

  const saveInventoryCategory = () => {
    const input = refs.businessPageContent?.querySelector('[data-inventory-category-name]');
    const nextCategory = String(input?.value || '').trim();
    if (!nextCategory) {
      inventoryDraftNote = '请先填写分类名称';
      notifyAction(inventoryDraftNote, 'warn', 'inventory-category-name-required');
      return;
    }
    const categories = getInventoryCategories();
    if (inventoryEditingCategory && inventoryEditingCategory !== nextCategory) {
      if (categories.includes(nextCategory)) {
        inventoryDraftNote = '分类名称已存在，请换一个名称';
        notifyAction(inventoryDraftNote, 'warn', 'inventory-category-name-duplicated');
        return;
      }
      inventoryRows.forEach((row) => {
        if (row[2] === inventoryEditingCategory) row[2] = nextCategory;
      });
      inventoryCategories = categories.map((category) => (category === inventoryEditingCategory ? nextCategory : category));
      inventoryCategory = nextCategory;
      inventoryEditingCategory = nextCategory;
      persistInventory(`已重命名分类为 ${nextCategory} · ${getTimeCode()}`);
      notifyAction(`已保存分类 ${nextCategory}`, 'success', `inventory-category-save:${nextCategory}`);
      return;
    }
    if (!categories.includes(nextCategory)) inventoryCategories.push(nextCategory);
    inventoryCategory = nextCategory;
    inventoryEditingCategory = nextCategory;
    persistInventory(`已新增分类 ${nextCategory} · ${getTimeCode()}`);
    notifyAction(`已新增分类 ${nextCategory}`, 'success', `inventory-category-save:${nextCategory}`);
  };

  const deleteInventoryCategory = async (category) => {
    if (!category || category === '全部') return;
    const usedCount = inventoryRows.filter((row) => row[2] === category).length;
    const message = usedCount
      ? `确认删除分类「${category}」？${usedCount} 个材料会移动到「未分类」。`
      : `确认删除分类「${category}」？`;
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除分类',
      message,
    });
    if (!confirmed) return false;
    inventoryRows.forEach((row) => {
      if (row[2] === category) row[2] = '未分类';
    });
    inventoryCategories = getInventoryCategories().filter((item) => item !== category);
    if (!inventoryCategories.includes('未分类')) inventoryCategories.push('未分类');
    inventoryCategory = '全部';
    inventoryEditingCategory = '';
    persistInventory(`已删除分类 ${category} · ${getTimeCode()}`);
    notifyAction(`已删除分类 ${category}`, 'success', `inventory-category-delete:${category}`);
    return true;
  };

  const renderInventory = () => {
    const categories = getInventoryCategories();
    const categoryTabs = ['全部', ...categories];
    if (!categoryTabs.includes(inventoryCategory)) inventoryCategory = '全部';
    const normalizedSearch = inventorySearchQuery.trim().toLowerCase();
    const visibleRows = inventoryRows.filter((row) => {
      const matchedCategory = inventoryCategory === '全部' || row[2] === inventoryCategory;
      const matchedSearch = !normalizedSearch || row.some((cell) => String(cell).toLowerCase().includes(normalizedSearch));
      return matchedCategory && matchedSearch;
    });
    const filteredCount = visibleRows.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / inventoryPageSize));
    inventoryListPage = Math.min(Math.max(1, inventoryListPage), totalPages);
    const pageStart = (inventoryListPage - 1) * inventoryPageSize;
    const pagedRows = visibleRows.slice(pageStart, pageStart + inventoryPageSize);
    const rangeStart = filteredCount === 0 ? 0 : pageStart + 1;
    const rangeEnd = pageStart + pagedRows.length;
    const editingRow = normalizeInventoryRow(inventoryRows[getInventoryMaterialIndex(inventoryEditingMaterialName)] || []);
    const materialFormRow = inventoryEditingMaterialName ? editingRow : ['', '原材料', inventoryCategory === '全部' ? categories[0] || '基础树脂' : inventoryCategory, '', '', '正常'];
    const categoryFormValue = inventoryEditingCategory || (inventoryCategory === '全部' ? '' : inventoryCategory);

    return `
      <div class="biz-inventory-page">
        <section class="business-panel biz-formula-table-panel biz-inventory-table-panel">
          <div class="biz-formula-table-head biz-inventory-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ti-list-details" aria-hidden="true"></i>
              <div>
                <h2>库存列表</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-inventory-table-actions">
              ${renderSearchBox({
                className: 'biz-formula-table-search biz-inventory-search',
                value: inventorySearchQuery,
                placeholder: '搜索材料、供应商、状态...',
                label: '搜索库存材料',
                attributes: { 'data-inventory-search': '' },
              })}
              <select data-inventory-category-filter aria-label="库存分类筛选">
                ${categoryTabs.map((category) => `
                  <option value="${esc(category)}" ${category === inventoryCategory ? 'selected' : ''}>${esc(category === '全部' ? '全部分类' : category)}</option>
                `).join('')}
              </select>
              <button class="biz-formula-new-btn" type="button" data-inventory-new-material>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新增材料</span>
              </button>
            </div>
          </div>
          <div class="biz-formula-table-wrap biz-inventory-table-wrap ui-table-wrap">
            <table class="biz-formula-table biz-inventory-table ui-table">
              <thead><tr>${['材料', '类型', '分类', '供应商', '库存', '状态', '操作'].map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
              <tbody>
                ${pagedRows.map((row) => `
                  <tr>
                    <td class="biz-inventory-material-cell">${esc(row[0])}</td>
                    <td><span class="biz-formula-chip">${esc(row[1])}</span></td>
                    <td><span class="biz-formula-chip">${esc(row[2])}</span></td>
                    <td>${esc(row[3])}</td>
                    <td><span class="biz-formula-version-only">${esc(row[4])}</span></td>
                    <td><span class="biz-formula-status ${getInventoryStateClass(row[5])}">${esc(row[5])}</span></td>
                    <td>
                      <div class="biz-formula-row-actions biz-inventory-row-actions">
                        <button type="button" data-inventory-edit-material="${esc(row[0])}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                          <span>编辑</span>
                        </button>
                        <button class="is-danger" type="button" data-inventory-delete-material="${esc(row[0])}">
                          <i class="ti ti-trash" aria-hidden="true"></i>
                          <span>删除</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="7"><div class="biz-formula-empty">暂无匹配材料</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-inventory-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-inventory-page-size aria-label="库存每页条数">${formulaPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === inventoryPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-inventory-page-prev ${inventoryListPage <= 1 ? 'disabled' : ''} aria-label="库存上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${inventoryListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-inventory-page-next ${inventoryListPage >= totalPages ? 'disabled' : ''} aria-label="库存下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${inventoryMaterialModalOpen ? `
          <div class="biz-inventory-material-modal dialog-overlay" data-inventory-material-modal>
            <div class="biz-inventory-material-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="inventoryMaterialModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="inventoryMaterialModalTitle">${inventoryEditingMaterialName ? '编辑材料' : '新增材料'}</h2>
                  <span>${esc(inventoryDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭材料编辑" data-inventory-close-material-modal>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-inventory-material-editor">
                <label class="is-name">
                  <span>材料名称 *</span>
                  <input type="text" value="${esc(materialFormRow[0])}" placeholder="请输入材料名称" data-inventory-material-field="name">
                </label>
                <label class="is-model">
                  <span>型号/牌号</span>
                  <input type="text" value="${esc(materialFormRow[6])}" placeholder="例如：KH-550" data-inventory-material-field="model">
                </label>
                <label class="is-batch">
                  <span>批次</span>
                  <input type="text" value="${esc(materialFormRow[7])}" placeholder="例如：LOT-20260120-999" data-inventory-material-field="batch">
                </label>
                <label class="is-category">
                  <span>产品类别</span>
                  <select data-inventory-material-field="category">${renderOptions(categories.length ? categories : ['未分类'], materialFormRow[2])}</select>
                </label>
                <label class="is-supplier">
                  <span>供应商</span>
                  <input type="text" value="${esc(materialFormRow[3])}" placeholder="请输入供应商名称" data-inventory-material-field="supplier">
                </label>
                <label class="is-quantity">
                  <span>当前库存 (kg) *</span>
                  <input type="text" value="${esc(materialFormRow[4])}" placeholder="例如：200" data-inventory-material-field="quantity">
                </label>
                <label class="is-unit-price">
                  <span>单价 (¥/kg) *</span>
                  <input type="text" value="${esc(materialFormRow[8])}" placeholder="例如：42" data-inventory-material-field="unitPrice">
                </label>
                <label class="is-safety-stock">
                  <span>安全库存 (kg)</span>
                  <input type="text" value="${esc(materialFormRow[9])}" placeholder="例如：50" data-inventory-material-field="safetyStock">
                </label>
                <label class="is-spec">
                  <span>规格说明</span>
                  <textarea placeholder="补充规格、化学名称、包装或储存说明" data-inventory-material-field="spec">${esc(materialFormRow[10])}</textarea>
                </label>
                <div class="biz-inventory-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-inventory-cancel-material>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-inventory-save-material>保存</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
        ${inventoryCategoryModalOpen ? `
          <div class="biz-inventory-category-modal dialog-overlay" data-inventory-category-modal>
            <div class="biz-inventory-category-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="inventoryCategoryModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="inventoryCategoryModalTitle">分类管理</h2>
                  <span>${esc(inventoryDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭分类管理" data-inventory-close-category-modal>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-inventory-category-list">
                ${categories.map((category) => {
                  const count = inventoryRows.filter((row) => row[2] === category).length;
                  return `
                    <button
                      class="${category === inventoryEditingCategory ? 'is-active' : ''}"
                      type="button"
                      data-inventory-edit-category="${esc(category)}">
                      <span>${esc(category)}</span>
                      <strong>${count}</strong>
                    </button>
                  `;
                }).join('')}
              </div>
              <div class="biz-inventory-category-editor">
                <label>
                  <span>${inventoryEditingCategory ? '编辑分类' : '分类名称'}</span>
                  <input type="text" value="${esc(categoryFormValue)}" placeholder="例如：加工助剂" data-inventory-category-name>
                </label>
                <button class="biz-inventory-primary-btn" type="button" data-inventory-save-category>${inventoryEditingCategory ? '保存分类' : '新增分类'}</button>
                ${inventoryEditingCategory ? '<button class="biz-inventory-ghost-btn" type="button" data-inventory-cancel-category>取消</button>' : ''}
                ${inventoryEditingCategory ? `<button class="biz-inventory-danger-btn" type="button" data-inventory-delete-category="${esc(inventoryEditingCategory)}">删除分类</button>` : ''}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const getInventoryMaterial = (name) => inventoryRows.find((row) => row[0] === name)
    || [name, '库存材料', '未分类', '未关联供应商', '--', '待确认'];

  const FORMULA_STORAGE_KEY = 'gjh-formula-recipes-v1';
  const defaultFormulaRecipes = [
    {
      id: 'FM-ABS-FR-760',
      code: 'ABS-FR-760',
      name: '阻燃 ABS 高冲击配方',
      product: 'GJ-ABS-FR-760',
      version: 'V3.2',
      status: '实验',
      line: 'B',
      owner: '陈工',
      updated: '2026-04-30',
      target: '冲击强度提升，阻燃等级保持 V0',
      batchSize: '500 kg',
      materials: [
        { name: 'ABS 757K', port: 1, ratio: 58, tolerance: '±0.6%', role: '主体树脂', stage: '主喂料' },
        { name: '阻燃剂 FR-530', port: 3, ratio: 18, tolerance: '±0.3%', role: '阻燃体系', stage: '侧喂料' },
        { name: '增韧剂 IM-88', port: 3, ratio: 13, tolerance: '±0.2%', role: '抗冲改性', stage: '主喂料' },
        { name: '玻纤 GF-30', port: 3, ratio: 8, tolerance: '±0.2%', role: '尺寸稳定', stage: '侧喂料' },
        { name: '黑色母 B-204', port: 5, ratio: 3, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
      ],
      process: [
        ['称量', '按 500 kg 批量生成领料单，色母单独复核'],
        ['干燥', 'ABS 80C 3h，增韧剂密封回温'],
        ['预混', '树脂、增韧剂、色母低速 8 分钟'],
        ['挤出', '一区 190C，六区 225C，主机 420rpm'],
        ['质检', '熔指、冲击、阻燃、色差同步留样'],
      ],
      checks: ['配比合计 100%', '阻燃剂库存紧急', '供应商来源完整', '需补做 85C 老化'],
    },
    {
      id: 'FM-PP-GF30',
      code: 'PP-GF30',
      name: '增强 PP 低翘曲配方',
      product: 'GJ-PP-GF30',
      version: 'V2.4',
      status: '正常',
      line: 'A',
      owner: '李娜',
      updated: '2026-04-28',
      target: '弯曲模量稳定，降低成型翘曲',
      batchSize: '800 kg',
      materials: [
        { name: 'PP K8003', port: 1, ratio: 63, tolerance: '±0.8%', role: '主体树脂', stage: '主喂料' },
        { name: '玻纤 GF-30', port: 2, ratio: 30, tolerance: '±0.4%', role: '增强填料', stage: '侧喂料' },
        { name: '抗氧剂 AO-1010', port: 3, ratio: 2, tolerance: '±0.1%', role: '热稳定', stage: '预混' },
        { name: '润滑剂 EBS-16', port: 3, ratio: 2, tolerance: '±0.1%', role: '加工流动', stage: '预混' },
        { name: '黑色母 B-204', port: 5, ratio: 3, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
      ],
      process: [
        ['称量', '玻纤独立扫码，助剂小料包复称'],
        ['预混', 'PP 与助剂混合 6 分钟'],
        ['挤出', '玻纤侧喂，机筒 185-215C'],
        ['切粒', '水温 35C，筛粉后入库'],
        ['质检', '灰份、弯曲模量、外观黑点'],
      ],
      checks: ['配比合计 100%', '润滑剂库存预警', '供应商来源完整', '当前版本可排产'],
    },
    {
      id: 'FM-PCABS-901',
      code: 'PCABS-901',
      name: 'PC/ABS 耐热合金配方',
      product: 'GJ-PCABS-901',
      version: 'V1.8',
      status: '正常',
      line: 'B',
      owner: '王敏',
      updated: '2026-04-26',
      target: '提高耐热与尺寸稳定性',
      batchSize: '300 kg',
      materials: [
        { name: 'PC/ABS 基料 901', port: 1, ratio: 78, tolerance: '±0.7%', role: '主体基料', stage: '主喂料' },
        { name: '相容剂 MAH-42', port: 3, ratio: 8, tolerance: '±0.2%', role: '界面改性', stage: '主喂料' },
        { name: '增韧剂 IM-88', port: 3, ratio: 7, tolerance: '±0.2%', role: '抗冲改性', stage: '主喂料' },
        { name: '抗氧剂 AO-1010', port: 3, ratio: 2, tolerance: '±0.1%', role: '热稳定', stage: '预混' },
        { name: '黑色母 B-204', port: 5, ratio: 5, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
      ],
      process: [
        ['称量', '基料与相容剂按批次绑定'],
        ['干燥', 'PC/ABS 90C 4h，水分小于 0.06%'],
        ['预混', '小料包先混，基料后混'],
        ['挤出', '机筒 220-245C，真空排气开启'],
        ['质检', '热变形、缺口冲击、色差、银丝'],
      ],
      checks: ['配比合计 100%', '成品待检不可放量', '供应商来源完整', '需审核耐热数据'],
    },
  ];

  const cloneFormulaData = (value) => JSON.parse(JSON.stringify(value));
  const formulaStatusOptions = ['正常', '实验'];
  const formulaCategoryOptions = ['ABS', 'PP', 'PC/ABS', 'PBT', 'PA', 'PET', '其他'];
  const formulaLineOptions = ['A', 'B'];
  const formulaStageOptions = ['主喂料', '侧喂料', '预混', '干燥', '后处理', '待设定'];
  const formulaEditableFields = new Set(['code', 'name', 'product', 'category', 'status', 'line', 'owner', 'batchSize', 'target']);
  const formulaMaterialFields = new Set(['name', 'port', 'ratio', 'role', 'stage', 'tolerance']);
  const feederPorts = [1, 2, 3, 4, 5];
  const inferFormulaCategory = (recipe) => {
    const text = `${recipe?.product || ''} ${recipe?.name || ''}`.toUpperCase();
    if (text.includes('PC/ABS')) return 'PC/ABS';
    if (text.includes('ABS')) return 'ABS';
    if (text.includes('PBT')) return 'PBT';
    if (text.includes('PA')) return 'PA';
    if (text.includes('PET')) return 'PET';
    if (text.includes('PP')) return 'PP';
    return '其他';
  };

  const getRecipeVersionSnapshot = (recipe) => ({
    code: String(recipe.code || recipe.id || ''),
    name: String(recipe.name || ''),
    product: String(recipe.product || ''),
    category: String(recipe.category || inferFormulaCategory(recipe)),
    status: String(recipe.status || ''),
    line: formulaLineOptions.includes(recipe.line) ? recipe.line : 'A',
    owner: String(recipe.owner || ''),
    batchSize: String(recipe.batchSize || ''),
    target: String(recipe.target || ''),
    materials: Array.isArray(recipe.materials) ? recipe.materials.map((item, index) => ({
      name: String(item.name || ''),
      port: getDefaultPortByStage(item, index),
      ratio: Number(item.ratio || 0),
      tolerance: String(item.tolerance || '±0.1%'),
      role: String(item.role || '配方材料'),
      stage: String(item.stage || '待设定'),
    })) : [],
    process: Array.isArray(recipe.process) ? recipe.process.map((item) => Array.isArray(item)
      ? [String(item[0] || ''), String(item[1] || '')]
      : [String(item.step || ''), String(item.detail || '')]) : [],
    checks: Array.isArray(recipe.checks) ? cloneFormulaData(recipe.checks) : [],
  });

  const getRecipeCompositionSnapshot = (recipe) => ({
    materials: Array.isArray(recipe.materials) ? recipe.materials.map((item, index) => ({
      name: String(item.name || ''),
      port: getDefaultPortByStage(item, index),
      ratio: Number(item.ratio || 0),
    })) : [],
  });

  const getRecipeVersionKey = (recipe) => JSON.stringify(getRecipeCompositionSnapshot(recipe));
  const getRecipeSnapshotVersionKey = (snapshot) => JSON.stringify(getRecipeCompositionSnapshot(snapshot || {}));

  const getNextFormulaVersionLabel = (version) => {
    const match = String(version || '').match(/^(.*?)(\d+)(?:\.(\d+))?$/);
    if (!match) return `V${getTodayCode().replace(/-/g, '')}-${getTimeCode().replace(':', '')}`;
    const [, prefix, major, minor] = match;
    if (minor !== undefined) return `${prefix}${major}.${Number(minor) + 1}`;
    return `${prefix}${Number(major) + 1}`;
  };

  const createFormulaVersionRecord = (recipe, label = recipe.version, note = '初始版本') => ({
    id: `${String(label || 'V1').replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
    label: String(label || 'V1'),
    savedAt: getTodayCode(),
    note,
    snapshot: getRecipeVersionSnapshot(recipe),
  });

  const formatFormulaNumber = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return '0';
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
  };

  const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)));
  const normalizeFeederPort = (value, fallback = 1) => {
    const port = Number(value);
    return feederPorts.includes(port) ? port : fallback;
  };
  const getDefaultPortByStage = (item, index = 0) => {
    if (item.port) return normalizeFeederPort(item.port);
    const text = `${item.stage || ''} ${item.role || ''}`;
    if (/侧喂|阻燃|增强|玻纤|填料/.test(text)) return 3;
    if (/预混|色|稳定|加工|助剂/.test(text)) return 5;
    if (/主喂|主体|基料|树脂/.test(text)) return 1;
    return (index % feederPorts.length) + 1;
  };
  const formatKgValue = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return '0';
    return number >= 100 ? number.toFixed(0) : number.toFixed(2).replace(/\.?0+$/, '');
  };
  const getTodayCode = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  };

  const getTimeCode = () => {
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  };

  const normalizeFormulaRecipes = (value) => {
    if (!Array.isArray(value) || !value.length) return cloneFormulaData(defaultFormulaRecipes);

    return value.map((recipe, index) => {
      const fallback = defaultFormulaRecipes[index] || defaultFormulaRecipes[0];
      const materials = Array.isArray(recipe.materials) && recipe.materials.length
        ? recipe.materials.map((item, materialIndex) => ({
          name: String(item.name || ''),
          port: getDefaultPortByStage(item, materialIndex),
          ratio: Number(item.ratio || 0),
          tolerance: String(item.tolerance || '±0.1%'),
          role: String(item.role || '配方材料'),
          stage: String(item.stage || '待设定'),
        })).filter((item) => item.name)
        : cloneFormulaData(fallback.materials || []);
      const process = Array.isArray(recipe.process) && recipe.process.length
        ? recipe.process.map((item) => Array.isArray(item)
          ? [String(item[0] || ''), String(item[1] || '')]
          : [String(item.step || ''), String(item.detail || '')])
        : cloneFormulaData(fallback.process || []);
      const normalizedRecipe = {
        ...fallback,
        ...recipe,
        id: String(recipe.id || fallback.id),
        code: String(recipe.code || recipe.id || fallback.code || fallback.id).replace(/^FM-/, ''),
        name: String(recipe.name || fallback.name),
        product: String(recipe.product || fallback.product),
        category: String(recipe.category || fallback.category || inferFormulaCategory(recipe)),
        version: String(recipe.version || fallback.version),
        status: String(recipe.status || fallback.status),
        line: formulaLineOptions.includes(recipe.line) ? recipe.line : fallback.line || 'A',
        owner: String(recipe.owner || fallback.owner),
        updated: String(recipe.updated || fallback.updated || getTodayCode()),
        target: String(recipe.target || fallback.target),
        batchSize: String(recipe.batchSize || fallback.batchSize),
        materials,
        process,
        checks: Array.isArray(recipe.checks) ? recipe.checks : cloneFormulaData(fallback.checks || []),
      };
      const versions = Array.isArray(recipe.versions) && recipe.versions.length
        ? recipe.versions.map((versionItem) => ({
          id: String(versionItem.id || `${versionItem.label || normalizedRecipe.version}-${Date.now().toString(36)}`),
          label: String(versionItem.label || normalizedRecipe.version),
          savedAt: String(versionItem.savedAt || normalizedRecipe.updated),
          note: String(versionItem.note || '历史版本'),
          snapshot: versionItem.snapshot || getRecipeVersionSnapshot(normalizedRecipe),
        }))
        : [createFormulaVersionRecord(normalizedRecipe, normalizedRecipe.version, '初始版本')];

      return {
        ...normalizedRecipe,
        versions,
      };
    });
  };

  let formulaRecipes = normalizeFormulaRecipes(utils.readJson(FORMULA_STORAGE_KEY, null));
  if (!formulaRecipes.some((recipe) => recipe.id === activeFormulaId) && formulaRecipes[0]) {
    activeFormulaId = formulaRecipes[0].id;
  }

  const getFormulaDraftKey = (recipe) => JSON.stringify(getRecipeVersionSnapshot(recipe || {}));

  const isFormulaDraftActive = () => Boolean(formulaEditorDraft && formulaViewMode === 'edit' && formulaEditorDraft.id === activeFormulaId);

  const getEditableFormulaRecipe = () => (isFormulaDraftActive()
    ? formulaEditorDraft
    : formulaRecipes[getActiveFormulaIndex()]);

  const clearFormulaEditorDraft = () => {
    formulaEditorDraft = null;
    formulaEditorOriginalKey = '';
  };

  const beginFormulaEdit = (recipe, { isNew = false } = {}) => {
    formulaEditorDraft = cloneFormulaData(recipe);
    formulaEditorOriginalKey = isNew ? getFormulaDraftKey(formulaEditorDraft) : getFormulaDraftKey(recipe);
    activeFormulaId = formulaEditorDraft.id;
    activeFormulaMaterialIndex = null;
    formulaViewMode = 'edit';
  };

  const createEmptyFormulaRecipe = () => {
    const id = `FM-${getTodayCode().replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const recipe = {
      id,
      code: '',
      name: '',
      product: '',
      version: 'V1.0',
      status: '实验',
      line: 'A',
      owner: '',
      updated: getTodayCode(),
      target: '',
      batchSize: '',
      materials: [],
      process: [],
      checks: [],
    };
    recipe.versions = [createFormulaVersionRecord(recipe, recipe.version, '初始版本')];
    return recipe;
  };

  const hasFormulaDraftContent = (recipe) => {
    if (!recipe) return false;
    const textFields = ['code', 'name', 'product', 'owner', 'batchSize', 'target'];
    const hasText = textFields.some((field) => String(recipe[field] || '').trim());
    const hasMaterials = (recipe.materials || []).some((material) => (
      String(material.name || '').trim()
      || Number(material.ratio || 0)
      || String(material.role || '').trim() !== '配方材料'
      || String(material.stage || '').trim() !== '待设定'
    ));
    const hasProcess = (recipe.process || []).some((item) => (
      String(Array.isArray(item) ? item[0] : item?.step || '').trim()
      || String(Array.isArray(item) ? item[1] : item?.detail || '').trim()
    ));
    return hasText || hasMaterials || hasProcess || (recipe.checks || []).length > 0;
  };

  const isFormulaDraftChanged = () => isFormulaDraftActive()
    && getFormulaDraftKey(formulaEditorDraft) !== formulaEditorOriginalKey;

  const persistFormulaRecipes = (note = '草稿自动保存') => {
    formulaDraftNote = note;
    utils.writeJson(FORMULA_STORAGE_KEY, formulaRecipes);
  };

  const saveActiveFormulaVersion = () => {
    const draft = isFormulaDraftActive() ? cloneFormulaData(formulaEditorDraft) : null;
    if (draft) {
      const existingIndex = formulaRecipes.findIndex((recipe) => recipe.id === draft.id);
      if (existingIndex >= 0) {
        formulaRecipes[existingIndex] = draft;
      } else {
        formulaRecipes.unshift(draft);
      }
      activeFormulaId = draft.id;
      formulaEditorDraft = null;
    }
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    if (!recipe) return;
    const currentKey = getRecipeVersionKey(recipe);
    const matchedVersion = recipe.versions?.find((item) => getRecipeSnapshotVersionKey(item.snapshot) === currentKey);
    if (matchedVersion) {
      recipe.version = matchedVersion.label;
      recipe.updated = getTodayCode();
      persistFormulaRecipes(`已保存基础信息，配料未变化 · ${getTimeCode()}`);
      notifyAction(`已保存配方 ${recipe.name || recipe.code || recipe.id}`, 'success', `formula-save:${recipe.id}`);
      clearFormulaEditorDraft();
      return;
    }
    const latestVersion = recipe.versions?.[recipe.versions.length - 1];
    const nextLabel = getNextFormulaVersionLabel(latestVersion?.label || recipe.version);
    recipe.version = nextLabel;
    recipe.updated = getTodayCode();
    recipe.versions = [...(recipe.versions || []), createFormulaVersionRecord(recipe, nextLabel, '手动保存')];
    persistFormulaRecipes(`已新增版本 ${nextLabel} · ${getTimeCode()}`);
    notifyAction(`已保存配方版本 ${nextLabel}`, 'success', `formula-save:${recipe.id}`);
    clearFormulaEditorDraft();
  };

  const applyActiveFormulaVersion = (versionId) => {
    const recipe = getEditableFormulaRecipe();
    const versionRecord = recipe?.versions?.find((item) => item.id === versionId);
    if (!recipe || !versionRecord?.snapshot) return;
    const snapshot = cloneFormulaData(versionRecord.snapshot);
    recipe.name = snapshot.name;
    recipe.product = snapshot.product;
    recipe.category = snapshot.category || getFormulaCategory(recipe);
    recipe.status = snapshot.status;
    recipe.line = snapshot.line;
    recipe.owner = snapshot.owner;
    recipe.batchSize = snapshot.batchSize;
    recipe.target = snapshot.target;
    recipe.materials = snapshot.materials || [];
    recipe.process = snapshot.process || [];
    recipe.checks = snapshot.checks || [];
    recipe.version = versionRecord.label;
    recipe.updated = String(versionRecord.savedAt || '').split(' ')[0] || recipe.updated;
    activeFormulaMaterialIndex = null;
    formulaDraftNote = `正在查看 ${versionRecord.label} · ${getTimeCode()}`;
  };

  const getActiveFormulaIndex = () => {
    const index = formulaRecipes.findIndex((recipe) => recipe.id === activeFormulaId);
    return index >= 0 ? index : 0;
  };

  const getActiveFormula = () => (isFormulaDraftActive()
    ? formulaEditorDraft
    : formulaRecipes.find((recipe) => recipe.id === activeFormulaId) || formulaRecipes[0]);

  const getLeastUsedPort = (materials) => {
    const counts = feederPorts.map((port) => [
      port,
      materials.filter((item) => normalizeFeederPort(item.port) === port).length,
    ]);
    counts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return counts[0]?.[0] || 1;
  };

  const getDefaultFormulaMaterial = (name, port = 1) => {
    const [, , category] = getInventoryMaterial(name);
    const roleMap = {
      '基础树脂': '主体树脂',
      '增强填料': '增强填料',
      '阻燃助剂': '阻燃体系',
      '改性助剂': '改性助剂',
      '色母助剂': '颜色体系',
      '稳定助剂': '热稳定',
      '加工助剂': '加工流动',
    };
    const stage = /树脂|基料/.test(category)
      ? '主喂料'
      : /玻纤|填料|阻燃/.test(category)
        ? '侧喂料'
        : '预混';
    return {
      name,
      port: normalizeFeederPort(port),
      ratio: 0,
      tolerance: '±0.1%',
      role: roleMap[category] || category || '配方材料',
      stage,
    };
  };

  const getEmptyFormulaMaterial = (port = 1) => ({
    name: '',
    port: normalizeFeederPort(port),
    ratio: 0,
    tolerance: '±0.1%',
    role: '配方材料',
    stage: '待设定',
  });

  const updateActiveFormulaField = (field, value) => {
    if (!formulaEditableFields.has(field)) return;
    const recipe = getEditableFormulaRecipe();
    if (!recipe) return;
    const nextRecipe = {
      ...recipe,
      [field]: value,
      updated: getTodayCode(),
    };
    if (isFormulaDraftActive()) {
      formulaEditorDraft = nextRecipe;
    } else {
      formulaRecipes[getActiveFormulaIndex()] = nextRecipe;
    }
    formulaDraftNote = '草稿未保存';
  };

  const updateActiveFormulaMaterial = (materialIndex, field, value) => {
    if (!formulaMaterialFields.has(field)) return;
    const recipe = getEditableFormulaRecipe();
    const material = recipe?.materials?.[materialIndex];
    if (!material) return;
    if (field === 'ratio') {
      material[field] = Number(value || 0);
    } else if (field === 'port') {
      material[field] = normalizeFeederPort(value, material.port);
    } else {
      material[field] = value;
    }
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const updateActiveFormulaPortGroup = (fromPort, toPort) => {
    const recipe = getEditableFormulaRecipe();
    const sourcePort = normalizeFeederPort(fromPort);
    const targetPort = normalizeFeederPort(toPort, sourcePort);
    if (!recipe || sourcePort === targetPort) return;
    recipe.materials.forEach((material) => {
      const currentPort = normalizeFeederPort(material.port);
      if (currentPort === sourcePort) material.port = targetPort;
      if (currentPort === targetPort) material.port = sourcePort;
    });
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const addActiveFormulaMaterial = (name) => {
    const recipe = getEditableFormulaRecipe();
    if (!recipe || recipe.materials.some((item) => item.name === name)) return;
    recipe.materials.push(getDefaultFormulaMaterial(name, getLeastUsedPort(recipe.materials)));
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const addActiveFormulaMaterialRow = (port, afterIndex = null) => {
    const recipe = getEditableFormulaRecipe();
    if (!recipe) return;
    const targetPort = normalizeFeederPort(port);
    const explicitMaterial = recipe.materials[afterIndex];
    const explicitIndex = explicitMaterial && normalizeFeederPort(explicitMaterial.port) === targetPort
      ? afterIndex
      : -1;
    const selectedMaterial = recipe.materials[activeFormulaMaterialIndex];
    const selectedIndex = explicitIndex >= 0
      ? explicitIndex
      : selectedMaterial && normalizeFeederPort(selectedMaterial.port) === targetPort
        ? activeFormulaMaterialIndex
        : -1;
    const lastPortIndex = recipe.materials.reduce((lastIndex, material, index) => (
      normalizeFeederPort(material.port) === targetPort ? index : lastIndex
    ), -1);
    const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : lastPortIndex + 1;
    recipe.materials.splice(insertIndex, 0, getEmptyFormulaMaterial(targetPort));
    activeFormulaMaterialIndex = insertIndex;
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const assignActiveFormulaMaterial = (materialIndex, name) => {
    const recipe = getEditableFormulaRecipe();
    const material = recipe?.materials?.[materialIndex];
    if (!material || !name) return;
    const nextMaterial = getDefaultFormulaMaterial(name, material.port);
    recipe.materials[materialIndex] = {
      ...nextMaterial,
      ratio: Number(material.ratio || 0),
    };
    activeFormulaMaterialIndex = materialIndex;
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const removeActiveFormulaMaterial = (materialIndex) => {
    const recipe = getEditableFormulaRecipe();
    if (!recipe?.materials?.[materialIndex]) return;
    recipe.materials.splice(materialIndex, 1);
    activeFormulaMaterialIndex = null;
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
  };

  const removeActiveFormulaMaterialByName = (name) => {
    const recipe = getEditableFormulaRecipe();
    const materialIndex = recipe?.materials?.findIndex((item) => item.name === name) ?? -1;
    if (materialIndex < 0) return false;
    recipe.materials.splice(materialIndex, 1);
    activeFormulaMaterialIndex = null;
    recipe.updated = getTodayCode();
    formulaDraftNote = '草稿未保存';
    return true;
  };

  const resetFormulaRecipes = () => {
    formulaRecipes = cloneFormulaData(defaultFormulaRecipes);
    activeFormulaId = formulaRecipes[0]?.id || activeFormulaId;
    formulaMaterialCategory = '全部';
    activeFormulaMaterialIndex = null;
    clearFormulaEditorDraft();
    persistFormulaRecipes('已恢复默认配方');
  };

  const createFormulaRecipe = () => {
    beginFormulaEdit(createEmptyFormulaRecipe(), { isNew: true });
    formulaDraftNote = '新建配方未保存';
  };

  const normalizeFormulaSkillText = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/[\s\-_/（）()【】[\]{}.,，。:：;；'"“”‘’]+/g, '');

  const normalizeFormulaSkillList = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    return String(value || '')
      .split(/[，,、\n;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const normalizeFormulaMaterialInput = (materials = []) => {
    const source = Array.isArray(materials) ? materials : normalizeFormulaSkillList(materials);
    return source.map((item, index) => {
      const material = typeof item === 'object' && item ? item : { name: item };
      const name = String(material.name || material.material || material.title || '').trim();
      if (!name) return null;
      return {
        ...getDefaultFormulaMaterial(name, material.port || getLeastUsedPort([])),
        name,
        port: normalizeFeederPort(material.port, (index % feederPorts.length) + 1),
        ratio: Number(material.ratio ?? material.percent ?? material.percentage ?? 0),
        tolerance: String(material.tolerance || '±0.1%'),
        role: String(material.role || getDefaultFormulaMaterial(name).role || '配方材料'),
        stage: String(material.stage || getDefaultFormulaMaterial(name).stage || '待设定'),
      };
    }).filter(Boolean);
  };

  const toFormulaSkillItem = (recipe) => ({
    id: recipe.id,
    code: recipe.code || recipe.id.replace(/^FM-/, ''),
    name: recipe.name,
    product: recipe.product,
    category: getFormulaCategory(recipe),
    status: getFormulaDisplayStatus(recipe.status),
    line: recipe.line || 'A',
    version: recipe.version,
    updated: recipe.updated,
  });

  const createFormulaByAgent = (input = {}) => {
    const code = String(input.code || input.id || '').trim().replace(/^FM-/i, '');
    const product = String(input.product || input.productName || input.model || '').trim();
    const name = String(input.name || input.title || input.formulaName || product || code || '').trim();

    if (!name && !code && !product) {
      return { ok: false, message: '请提供要创建的配方名称、编号或产品型号。' };
    }

    const duplicateKey = normalizeFormulaSkillText(code || product || name);
    const duplicate = formulaRecipes.find((recipe) => [
      recipe.id,
      recipe.code,
      recipe.name,
      recipe.product,
    ].some((value) => normalizeFormulaSkillText(value) === duplicateKey));
    if (duplicate) {
      return {
        ok: false,
        message: `已存在配方「${duplicate.name || duplicate.code}」，暂未重复创建。`,
        candidates: [toFormulaSkillItem(duplicate)],
        data: { created: 0, items: [toFormulaSkillItem(duplicate)] },
      };
    }

    const recipe = createEmptyFormulaRecipe();
    recipe.code = code || product || recipe.id.replace(/^FM-/, '');
    recipe.name = name || `${recipe.code} 配方`;
    recipe.product = product || recipe.code;
    recipe.category = String(input.category || inferFormulaCategory(recipe)).trim();
    recipe.status = String(input.status || '实验').trim();
    recipe.line = formulaLineOptions.includes(input.line) ? input.line : 'A';
    recipe.owner = String(input.owner || input.creator || 'AI助手').trim();
    recipe.batchSize = String(input.batchSize || input.batch || '').trim();
    recipe.target = String(input.target || input.note || input.description || 'AI 创建的配方草稿，请补充配比、工艺参数和验证计划。').trim();
    recipe.materials = normalizeFormulaMaterialInput(input.materials || input.ingredients || input.components);
    recipe.process = Array.isArray(input.process)
      ? input.process.map((item) => (Array.isArray(item)
        ? [String(item[0] || '').trim(), String(item[1] || '').trim()]
        : [String(item.step || item.name || '').trim(), String(item.detail || item.value || '').trim()]))
        .filter((item) => item[0] || item[1])
      : [];
    recipe.checks = normalizeFormulaSkillList(input.checks || input.tests || input.validation);
    recipe.updated = getTodayCode();
    recipe.versions = [createFormulaVersionRecord(recipe, recipe.version, 'AI创建')];

    formulaRecipes.unshift(recipe);
    activeFormulaId = recipe.id;
    formulaSearchQuery = '';
    formulaListCategory = '全部';
    formulaListStatus = '全部';
    formulaListPage = 1;
    formulaViewMode = 'list';
    clearFormulaEditorDraft();
    persistFormulaRecipes(`AI 已创建配方 ${recipe.name} · ${getTimeCode()}`);
    render('formula-management');
    App.projectSkills?.render?.();
    notifyAction(`已创建配方 ${recipe.name}`, 'success', `formula-create:${recipe.id}`);

    return {
      ok: true,
      message: `新配方记录已创建：${recipe.name}。`,
      details: [
        `配方编号：${recipe.code}`,
        `产品型号：${recipe.product}`,
        `分类/产线：${getFormulaCategory(recipe)} / ${recipe.line || 'A'}线`,
        `当前列表总数：${formulaRecipes.length} 个`,
      ],
      data: { created: 1, items: [toFormulaSkillItem(recipe)] },
    };
  };

  const deleteFormulaRecipe = async (recipeId) => {
    if (formulaRecipes.length <= 1) {
      formulaDraftNote = '至少保留 1 个配方';
      notifyAction(formulaDraftNote, 'warn', 'formula-delete-last');
      return;
    }
    const index = formulaRecipes.findIndex((recipe) => recipe.id === recipeId);
    if (index < 0) return;
    const recipe = formulaRecipes[index];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除配方',
      message: `确认删除配方「${recipe.name || recipe.code || recipeId}」？删除后无法恢复。`,
    });
    if (!confirmed) return false;
    formulaRecipes.splice(index, 1);
    if (activeFormulaId === recipeId) {
      activeFormulaId = formulaRecipes[Math.min(index, formulaRecipes.length - 1)]?.id || formulaRecipes[0]?.id;
      activeFormulaMaterialIndex = null;
    }
    persistFormulaRecipes('已删除配方');
    notifyAction(`已删除配方 ${recipe.name || recipe.code || recipeId}`, 'success', `formula-delete:${recipeId}`);
    return true;
  };

  const renderOptions = (options, value) => options.map((option) => `
    <option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(option)}</option>
  `).join('');

  const renderFormulaFilterOptions = (options, value, allLabel) => options.map((option) => `
    <option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(option === '全部' ? allLabel : option)}</option>
  `).join('');

  const renderMaterialOptions = (value, materialRows) => `
    <option value="">待选择</option>
    ${materialRows.map(([name]) => `<option value="${esc(name)}" ${name === value ? 'selected' : ''}>${esc(name)}</option>`).join('')}
  `;

  const renderPortOptions = (currentLine, value) => feederPorts.map((port) => `
    <option value="${port}" ${port === normalizeFeederPort(value) ? 'selected' : ''}>${esc(currentLine)}${port}</option>
  `).join('');

  const getFormulaRows = (recipe) => recipe.materials.map((item) => {
    const [name, type, category, supplier, quantity, state] = getInventoryMaterial(item.name);
    return { ...item, port: normalizeFeederPort(item.port), name, type, category, supplier, quantity, state };
  });

  const normalizeFormulaMatchText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[\s/_-]+/g, '');

  const getRecipeForOrder = (order) => {
    const formulaText = normalizeFormulaMatchText(order?.formula);
    const exactRecipe = formulaRecipes.find((recipe) => [
      recipe.name,
      recipe.code,
      recipe.product,
      recipe.id,
    ].some((value) => normalizeFormulaMatchText(value) === formulaText));
    if (exactRecipe) return exactRecipe;

    const fuzzyRecipe = formulaRecipes.find((recipe) => {
      const recipeText = normalizeFormulaMatchText(`${recipe.name} ${recipe.code} ${recipe.product}`);
      return formulaText && (recipeText.includes(formulaText) || formulaText.includes(normalizeFormulaMatchText(recipe.code)));
    });
    if (fuzzyRecipe) return fuzzyRecipe;

    const familyText = String(order?.formula || '').toUpperCase();
    return formulaRecipes.find((recipe) => familyText.includes(getFormulaCategory(recipe).toUpperCase()))
      || formulaRecipes[0]
      || defaultFormulaRecipes[0];
  };

  const getOrderProductionDate = (order) => String(order?.productionDate || order?.deliveryDate || getTodayCode()).trim();

  const getProductionLineForOrder = (order) => {
    const line = String(getRecipeForOrder(order)?.line || 'A').toUpperCase();
    return formulaLineOptions.includes(line) ? line : 'A';
  };

  const getProductionNoParts = (productionNo) => {
    const match = String(productionNo || '').trim().match(/^([A-Z])(\d+)$/);
    return match ? { line: match[1], sequence: Number(match[2] || 0) } : null;
  };

  const getNextProductionSequence = (order, line = getProductionLineForOrder(order), date = order?.productionDate || invoiceScheduleDate || getTodayCode()) => {
    const usedNumbers = orderRows
      .filter((item) => (
        item.id !== order?.id
        && productionQueueStatuses.includes(item.status)
        && getOrderProductionDate(item) === date
      ))
      .map((item) => getProductionNoParts(item.productionNo))
      .filter((parts) => parts?.line === line)
      .map((parts) => Number(parts.sequence || 0))
      .filter((value) => Number.isFinite(value));
    return Math.max(0, ...usedNumbers) + 1;
  };

  const getNextProductionNo = (order, line = getProductionLineForOrder(order), date = order?.productionDate || invoiceScheduleDate || getTodayCode()) => (
    `${line}${getNextProductionSequence(order, line, date)}`
  );

  const getInvoiceNoForOrder = (order) => String(order?.productionNo || getNextProductionNo(order)).trim();
  const getInvoicePreviewNo = (order) => String(order?.productionNo || `${getProductionLineForOrder(order)}${invoiceScheduleSequence}`).trim();

  const hasProductionSlotConflict = (orderId, productionDate, productionNo) => orderRows.some((item) => (
    item.id !== orderId
    && productionQueueStatuses.includes(item.status)
    && getOrderProductionDate(item) === productionDate
    && String(item.productionNo || '').trim() === productionNo
  ));

  const ensureProductionNumbers = () => {
    let changed = false;
    orderRows.forEach((order) => {
      if (productionQueueStatuses.includes(order.status) && !order.productionNo) {
        order.productionNo = getNextProductionNo(order);
        changed = true;
      }
    });
    if (changed) utils.writeJson(ORDER_STORAGE_KEY, orderRows);
  };

  const getInvoiceMaterialKg = (material, totalKg) => (
    Number(totalKg || 0) * Number(material?.ratio || 0) / 100
  );

  const escapeSvgText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const downloadInvoiceOperationImage = () => {
    const invoiceOrders = orderRows.filter((order) => order.status === '待处理');
    const order = invoiceOrders.find((item) => item.id === invoiceSelectedOrderId) || invoiceOrders[0];
    if (!order) return false;
    const recipe = getRecipeForOrder(order);
    const rows = getFormulaRows(recipe);
    const splitRows = rows.filter((item) => item.port === invoiceSplitPort);
    const totalKg = Number(order.quantity || 0);
    const batchCount = Math.max(1, invoiceBatchCount);
    const splitTotalKg = splitRows.reduce((sum, item) => sum + getInvoiceMaterialKg(item, totalKg), 0);
    const splitBatchKg = splitTotalKg / batchCount;
    const rowHeight = 34;
    const materialTableY = 250;
    const batchTableY = materialTableY + 52 + rows.length * rowHeight;
    const invoiceNo = getInvoiceNoForOrder(order);
    const batchRowCount = Math.max(splitRows.length, 1) + 1;
    const height = Math.max(760, batchTableY + 112 + batchRowCount * 30);
    const materialRows = rows.map((item, index) => {
      const y = materialTableY + 52 + index * rowHeight;
      return `
        <rect x="48" y="${y}" width="1064" height="${rowHeight}" fill="${item.port === invoiceSplitPort ? '#eff6ff' : '#ffffff'}" stroke="#1f2937"/>
        <text x="86" y="${y + 22}">${item.port}号</text>
        <text x="220" y="${y + 22}">${escapeSvgText(item.name)}</text>
        <text x="930" y="${y + 22}">${formatKgValue(getInvoiceMaterialKg(item, totalKg))}</text>
      `;
    }).join('');
    const batchRows = (splitRows.length ? splitRows : [{ name: `暂无${invoiceSplitPort}号下料口材料`, port: invoiceSplitPort, ratio: 0 }]).map((item, index) => {
      const y = batchTableY + 46 + index * 30;
      const materialKg = getInvoiceMaterialKg(item, totalKg);
      return `
        <rect x="48" y="${y}" width="1064" height="30" fill="${item.port === invoiceSplitPort ? '#eff6ff' : '#ffffff'}" stroke="#1f2937"/>
        <text x="74" y="${y + 20}">${escapeSvgText(item.name)}</text>
        <text x="520" y="${y + 20}">${formatKgValue(materialKg / batchCount)} kg / 批</text>
        <text x="790" y="${y + 20}">${batchCount} 批</text>
        <text x="990" y="${y + 20}">${formatKgValue(materialKg)}</text>
      `;
    }).join('');
    const batchTotalY = batchTableY + 46 + Math.max(splitRows.length, 1) * 30;
    const batchTotalRow = `
      <rect x="48" y="${batchTotalY}" width="1064" height="30" fill="#f8fafc" stroke="#1f2937"/>
      <text x="74" y="${batchTotalY + 20}">合计</text>
      <text x="520" y="${batchTotalY + 20}">${formatKgValue(splitBatchKg)} kg / 批</text>
      <text x="790" y="${batchTotalY + 20}">${batchCount} 批</text>
      <text x="990" y="${batchTotalY + 20}">${formatKgValue(splitTotalKg)}</text>
    `;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1160" height="${height}" viewBox="0 0 1160 ${height}">
        <rect width="1160" height="${height}" fill="#ffffff"/>
        <style>text{font-family:Arial,'Microsoft YaHei',sans-serif;font-size:14px;fill:#111827}.small{font-size:12px;fill:#475569}.title{font-size:26px;font-weight:900}.head{font-size:18px;font-weight:900}</style>
        <text x="48" y="58" class="title">配料操作图</text>
        <text x="48" y="88" class="head">仅显示材料与重量</text>
        <text x="672" y="66">总重量：${formatKgValue(totalKg)} kg</text>
        <text x="672" y="96">批次数：${batchCount} 批</text>
        <text x="48" y="${materialTableY}" class="head">投料明细</text>
        <rect x="48" y="${materialTableY + 16}" width="1064" height="36" fill="#f1f5f9" stroke="#1f2937"/>
        <text x="82" y="${materialTableY + 40}">下料口</text><text x="220" y="${materialTableY + 40}">材料名称</text><text x="910" y="${materialTableY + 40}">重量(KG)</text>
        ${materialRows}
        <text x="48" y="${batchTableY}" class="head">分批次投料计划</text>
        <text x="240" y="${batchTableY}" class="small">按${invoiceSplitPort}号下料口划分 ${batchCount} 批</text>
        <rect x="48" y="${batchTableY + 16}" width="1064" height="30" fill="#f1f5f9" stroke="#1f2937"/>
        <text x="74" y="${batchTableY + 36}">材料名称</text><text x="520" y="${batchTableY + 36}">单批投料</text><text x="790" y="${batchTableY + 36}">批次数</text><text x="990" y="${batchTableY + 36}">小计(KG)</text>
        ${batchRows}
        ${batchTotalRow}
      </svg>
    `;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNo}-${order.id}-生产操作图.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    return true;
  };

  const printInvoiceOperationSheet = () => {
    const sheet = refs.businessPageContent.querySelector('.biz-operation-sheet:not([hidden])');
    if (!sheet) return false;

    document.querySelector('.biz-invoice-print-root')?.remove();
    const printRoot = document.createElement('div');
    printRoot.className = 'biz-invoice-print-root';
    const printSheet = sheet.cloneNode(true);
    if (printSheet instanceof HTMLElement) {
      printSheet.removeAttribute('hidden');
    }
    printRoot.appendChild(printSheet);
    document.body.appendChild(printRoot);
    document.body.classList.add('is-invoice-operation-printing');

    const cleanup = () => {
      document.body.classList.remove('is-invoice-operation-printing');
      printRoot.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(() => {
      window.print();
    }, 0);
    return true;
  };

  const getFormulaRiskCount = (rows) => rows.filter((row) => /紧急|预警|待检/.test(row.state)).length;
  const getFormulaCategory = (recipe) => {
    if (recipe?.category) return String(recipe.category);
    return inferFormulaCategory(recipe);
  };

  ensureProductionNumbers();

  const getFormulaBaseResinMaterial = (recipe) => (
    (recipe?.materials || []).find((item) => /树脂|基料|主体/.test(`${item.role || ''} ${item.name || ''}`))
    || recipe?.materials?.[0]
    || null
  );
  const getFormulaBaseResin = (recipe) => {
    const material = getFormulaBaseResinMaterial(recipe);
    return material?.name || '--';
  };
  const getFormulaDisplayStatus = (status) => (/试产|实验/.test(status) ? '实验' : '正常');
  const getFormulaStatusClass = (status) => {
    if (/试产|实验/.test(status)) return 'is-warn';
    return 'is-ok';
  };
  const getInventoryStateClass = (state) => {
    if (/紧急/.test(state)) return 'is-danger';
    if (/预警|待检/.test(state)) return 'is-warn';
    return 'is-ok';
  };
  const materialPrices = {
    'ABS 757K': 12.8,
    'PP K8003': 8.2,
    '玻纤 GF-30': 7.6,
    '阻燃剂 FR-530': 31.5,
    '增韧剂 IM-88': 24.8,
    '黑色母 B-204': 16.5,
    '抗氧剂 AO-1010': 28.6,
    '润滑剂 EBS-16': 18.2,
    'PC/ABS 基料 901': 19.8,
    '相容剂 MAH-42': 26.4,
  };
  const getMaterialUnitPrice = (name) => materialPrices[name] || 12;
  const formatCurrency = (value) => (Number.isFinite(value) ? `¥${value.toFixed(2)}` : '--');
  const getFormulaCost = (recipe) => {
    const cost = (recipe?.materials || []).reduce((sum, material) => (
      sum + (Number(material.ratio || 0) / 100) * getMaterialUnitPrice(material.name)
    ), 0);
    return cost ? `¥${cost.toFixed(2)}` : '--';
  };
  const getFormulaSummary = (recipe) => {
    const rows = getFormulaRows(recipe);
    const riskCount = getFormulaRiskCount(rows);
    return {
      rows,
      riskCount,
      category: getFormulaCategory(recipe),
      status: getFormulaDisplayStatus(recipe.status),
      cost: getFormulaCost(recipe),
    };
  };
  const renderFormulaMiniStats = (items, modifierClass = '') => `
    <div class="biz-formula-mini-stats${modifierClass ? ` ${modifierClass}` : ''}">
      ${items.map(([label, value, note, icon = 'ti ti-chart-bar', tone = '', meta = '', page = '']) => (
        modifierClass.includes('--list')
          ? `
            <article${tone ? ` class="${esc(tone)}"` : ''}${page ? ` data-formula-stat-page="${esc(page)}" role="button" tabindex="0"` : ''}>
              <div class="biz-formula-mini-stat-body">
                <span>${esc(label)}</span>
                <strong>${esc(value)}</strong>
                <em>${esc(note)}</em>
                ${meta ? `<small>${esc(meta)}</small>` : ''}
              </div>
              <i class="${esc(icon)}" aria-hidden="true"></i>
            </article>
          `
          : `
            <article>
              <i class="${esc(icon)}" aria-hidden="true"></i>
              <span>${esc(label)}</span>
              <strong>${esc(value)}</strong>
              <em>${esc(note)}</em>
            </article>
          `
      )).join('')}
    </div>
  `;

  const renderFormulaList = () => {
    const categories = ['全部', ...new Set(formulaRecipes.map(getFormulaCategory))];
    const statuses = ['全部', ...new Set(formulaRecipes.map((recipe) => getFormulaDisplayStatus(recipe.status)))];
    if (!categories.includes(formulaListCategory)) formulaListCategory = '全部';
    if (!statuses.includes(formulaListStatus)) formulaListStatus = '全部';
    const normalizedFormulaSearch = formulaSearchQuery.trim().toLowerCase();
    const visibleFormulaRecipes = formulaRecipes.filter((recipe) => {
      const category = getFormulaCategory(recipe);
      const status = getFormulaDisplayStatus(recipe.status);
      const matchedCategory = formulaListCategory === '全部' || category === formulaListCategory;
      const matchedStatus = formulaListStatus === '全部' || status === formulaListStatus;
      const matchedSearch = !normalizedFormulaSearch || [
        recipe.id,
        recipe.code,
        recipe.name,
        recipe.product,
        recipe.version,
        recipe.status,
        recipe.line,
        category,
        getFormulaBaseResin(recipe),
        recipe.updated,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedFormulaSearch));
      return matchedCategory && matchedStatus && matchedSearch;
    });
    const filteredCount = visibleFormulaRecipes.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / formulaPageSize));
    formulaListPage = Math.min(Math.max(1, formulaListPage), totalPages);
    const pageStart = (formulaListPage - 1) * formulaPageSize;
    const pagedFormulaRecipes = visibleFormulaRecipes.slice(pageStart, pageStart + formulaPageSize);
    const rangeStart = filteredCount === 0 ? 0 : pageStart + 1;
    const rangeEnd = pageStart + pagedFormulaRecipes.length;
    const formulaSummaries = formulaRecipes.map(getFormulaSummary);
    const experimentCount = formulaSummaries.filter((item) => item.status === '实验').length;
    const riskFormulaCount = formulaSummaries.filter((item) => item.riskCount > 0).length;
    const filterProgress = Math.round((visibleFormulaRecipes.length / Math.max(formulaRecipes.length, 1)) * 100);
    const stableFormulaCount = Math.max(0, formulaRecipes.length - experimentCount);
    const stableProgress = Math.round((stableFormulaCount / Math.max(formulaRecipes.length, 1)) * 100);
    const healthyFormulaCount = Math.max(0, formulaRecipes.length - riskFormulaCount);
    const healthyProgress = Math.round((healthyFormulaCount / Math.max(formulaRecipes.length, 1)) * 100);
    const pendingOrderCount = 4;
    const latestUpdated = formulaRecipes
      .map((recipe) => recipe.updated || '')
      .filter(Boolean)
      .sort()
      .at(-1) || getTodayCode();

    return `
      <section class="biz-formula-page biz-formula-list-page">
        ${renderFormulaMiniStats([
          ['配方总数', `${formulaRecipes.length} 个`, `命中 ${visibleFormulaRecipes.length} 个`, 'ti ti-clipboard-list', 'is-blue', '当前筛选范围', filterProgress],
          ['待处理订单', `${pendingOrderCount} 单`, '点击查看订单', 'ti ti-shopping-cart', 'is-cyan', '待补全 2 / 审核 2', 'order-management'],
          ['实验版本', `${experimentCount} 个`, `${stableFormulaCount} 个可排产`, 'ti ti-test-pipe', 'is-amber', '实验配方需确认', stableProgress],
          ['库存风险', `${riskFormulaCount} 个`, `更新 ${latestUpdated}`, riskFormulaCount ? 'ti ti-alert-triangle' : 'ti ti-shield-check', riskFormulaCount ? 'is-red' : 'is-green', healthyFormulaCount ? `${healthyFormulaCount} 个状态正常` : '全部待处理', healthyProgress],
        ], 'biz-formula-mini-stats--list')}
        <section class="business-panel biz-formula-table-panel">
        <div class="biz-formula-table-head">
          <div class="biz-formula-table-title">
            <i class="ti ti-list-details" aria-hidden="true"></i>
            <div>
              <h2>配方列表</h2>
            </div>
          </div>
          <div class="biz-formula-table-actions">
            ${renderSearchBox({
              className: 'biz-formula-table-search',
              value: formulaSearchQuery,
              placeholder: '搜索编号、名称、产品、基材...',
              label: '搜索配方',
              attributes: { 'data-formula-search': '' },
            })}
            <select data-formula-list-category aria-label="配方分类筛选">${renderFormulaFilterOptions(categories, formulaListCategory, '全部分类')}</select>
            <select data-formula-list-status aria-label="配方状态筛选">${renderFormulaFilterOptions(statuses, formulaListStatus, '全部状态')}</select>
            <button class="biz-formula-new-btn" type="button" data-formula-new>
              <i class="ti ti-plus" aria-hidden="true"></i>
              <span>新建配方</span>
            </button>
          </div>
        </div>
        <div class="biz-formula-table-wrap ui-table-wrap">
          <table class="biz-formula-table ui-table">
            <thead>
              <tr>
                <th>配方编号</th>
                <th>配方名称</th>
                <th>日期</th>
                <th>分类</th>
                <th>产线</th>
                <th>成本(¥/KG)</th>
                <th>库存状态</th>
                <th>版本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${pagedFormulaRecipes.map((recipe) => {
                const summary = getFormulaSummary(recipe);
                return `
                  <tr>
                    <td>
                      <span class="biz-formula-code">${esc(recipe.code || recipe.id.replace(/^FM-/, ''))}</span>
                    </td>
                    <td class="biz-formula-title-cell">
                      <button class="biz-formula-name-link" type="button" data-formula-edit="${esc(recipe.id)}">${esc(recipe.name)}</button>
                    </td>
                    <td><span class="biz-formula-version-only">${esc(recipe.updated || getTodayCode())}</span></td>
                    <td><span class="biz-formula-chip">${esc(summary.category)}</span></td>
                    <td><span class="biz-formula-chip">${esc(`${recipe.line || 'A'}线`)}</span></td>
                    <td>${esc(summary.cost)}</td>
                    <td>
                      <span class="biz-formula-status ${summary.riskCount ? 'is-warn' : 'is-ok'}">${summary.riskCount ? `${summary.riskCount} 项风险` : '可排产'}</span>
                    </td>
                    <td><span class="biz-formula-version-only">${esc(recipe.version)}</span></td>
                    <td>
                      <span class="biz-formula-status ${getFormulaStatusClass(recipe.status)}">${esc(summary.status)}</span>
                    </td>
                    <td>
                      <div class="biz-formula-row-actions">
                        <button type="button" data-formula-edit="${esc(recipe.id)}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                          <span>编辑</span>
                        </button>
                        <button class="is-danger" type="button" data-formula-delete="${esc(recipe.id)}" aria-label="删除${esc(recipe.name)}">
                          <i class="ti ti-trash" aria-hidden="true"></i>
                          <span>删除</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') || `
                <tr>
                  <td colspan="10"><div class="biz-formula-empty">没有匹配的配方</div></td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        <div class="biz-formula-pagination">
          <div class="biz-formula-pagination-actions">
            <label class="biz-formula-page-size">
              <span>每页</span>
              <select data-formula-page-size aria-label="每页条数">${formulaPageSizeOptions.map((n) => `
                <option value="${n}" ${n === formulaPageSize ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
              <span>条</span>
            </label>
            <div class="biz-formula-page-buttons">
              <button type="button" class="biz-formula-page-btn" data-formula-page-prev ${formulaListPage <= 1 ? 'disabled' : ''} aria-label="上一页">
                <i class="ti ti-chevron-left" aria-hidden="true"></i>
              </button>
              <span class="biz-formula-page-indicator">${formulaListPage} / ${totalPages}</span>
              <button type="button" class="biz-formula-page-btn" data-formula-page-next ${formulaListPage >= totalPages ? 'disabled' : ''} aria-label="下一页">
                <i class="ti ti-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </section>
      </section>
    `;
  };

  const renderFormulaBuilderPanel = () => {
    const recipe = getActiveFormula();
    if (!recipe) return '';
    const formulaRows = getFormulaRows(recipe);
    const totalRatio = formulaRows.reduce((sum, item) => sum + Number(item.ratio || 0), 0);
    const totalRatioLabel = formatFormulaNumber(totalRatio);
    const riskCount = getFormulaRiskCount(formulaRows);
    const formulaReferenceKg = 1000;
    const currentLine = formulaLineOptions.includes(recipe.line) ? recipe.line : 'A';
    const lineBatchKg = formulaReferenceKg;
    const lineTotal = formulaRows.reduce((sum, item) => sum + (lineBatchKg * Number(item.ratio || 0) / 100), 0);
    const lineCostTotal = formulaRows.reduce((sum, item) => (
      sum + (lineBatchKg * Number(item.ratio || 0) / 100) * getMaterialUnitPrice(item.name)
    ), 0);

    return `
      <article class="business-panel biz-recipe-card biz-formula-builder">
        <div class="biz-issue-sheet">
          <div class="biz-issue-head">
            <div>
              <strong>宁波广俊塑料科技有限公司</strong>
            </div>
            <div class="biz-formula-actions">
              <button class="biz-formula-side-toggle" type="button" data-formula-toggle-library aria-pressed="${formulaLibraryCollapsed ? 'true' : 'false'}">
                <i class="ti ${formulaLibraryCollapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-right-collapse'}" aria-hidden="true"></i>
                <span>${formulaLibraryCollapsed ? '展开侧边' : '收起侧边'}</span>
              </button>
              <button type="button" data-formula-back-list>返回列表</button>
              <button type="button" data-formula-save>保存</button>
            </div>
          </div>
          ${renderFormulaMiniStats([
            ['配比合计', `${totalRatioLabel}%`, totalRatio === 100 ? '已满足投料要求' : '需调整到 100%', 'ti ti-percentage'],
            ['参考批量', `${formulaReferenceKg} kg`, `计划投料 ${formatKgValue(lineTotal)} kg`, 'ti ti-scale'],
            ['参考成本', formatCurrency(lineCostTotal), `${esc(getFormulaCost(recipe))}/kg`, 'ti ti-currency-yen'],
            ['库存风险', `${riskCount} 项`, riskCount ? '请先处理预警材料' : '库存状态正常', 'ti ti-shield-check'],
          ])}
          <div class="biz-issue-meta-grid">
            <label class="is-date">
              <span>日期</span>
              <input type="text" value="${esc(getTodayCode())}" readonly>
            </label>
            <label class="is-code">
              <span>配方编号</span>
              <input type="text" data-formula-field="code" value="${esc(recipe.code || recipe.id.replace(/^FM-/, ''))}">
            </label>
            <label class="is-line">
              <span>所属产线</span>
              <select data-formula-field="line">${renderOptions(formulaLineOptions, currentLine)}</select>
            </label>
            <label class="is-batch">
              <span>分类</span>
              <select data-formula-field="category">${renderOptions(formulaCategoryOptions, recipe.category || getFormulaCategory(recipe))}</select>
            </label>
            <label class="is-output">
              <span>状态</span>
              <select data-formula-field="status">${renderOptions(formulaStatusOptions, getFormulaDisplayStatus(recipe.status))}</select>
            </label>
            <label class="is-name">
              <span>配方名称</span>
              <input type="text" data-formula-field="name" value="${esc(recipe.name)}">
            </label>
            <label class="is-version">
              <span>版本</span>
              <select data-formula-version-select>
                ${(recipe.versions || []).map((versionItem) => `
                  <option value="${esc(versionItem.id)}" ${versionItem.label === recipe.version ? 'selected' : ''}>${esc(versionItem.label)} · ${esc(String(versionItem.savedAt || '').split(' ')[0])}</option>
                `).join('')}
              </select>
            </label>
            <label class="is-note">
              <span>目标指标</span>
              <input type="text" data-formula-field="target" value="${esc(recipe.target)}">
            </label>
          </div>
          <div class="biz-line-issue-grid">
                <section class="biz-line-issue-card">
                  <div class="biz-line-issue-title">
                    <strong>${esc(currentLine)} 线下料口</strong>
                    <span>5 个下料口 / 按 ${formulaReferenceKg}kg 参考，计划 ${formatKgValue(lineTotal)} kg</span>
                  </div>
                  <div class="biz-line-table-wrap ui-table-wrap">
                    <table class="biz-line-table ui-table">
                      <colgroup>
                        <col class="col-port">
                        <col class="col-material">
                        <col class="col-ratio">
                        <col class="col-plan">
                        <col class="col-cost">
                        <col class="col-stock">
                        <col class="col-action">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>料口</th>
                          <th>物料名称</th>
                          <th>配比</th>
                          <th>计划 KG</th>
                          <th>成本</th>
                          <th>库存</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${feederPorts.map((port) => {
                          const portRows = formulaRows
                            .map((item, index) => ({ ...item, index }))
                            .filter((item) => item.port === port);
                          if (!portRows.length) {
                            return `
                              <tr class="biz-line-hover-row" data-formula-empty-port="${port}">
                                <td class="biz-line-port-cell">
                                  <strong>${currentLine}${port}</strong>
                                </td>
                                <td><span class="biz-line-empty">待加入材料</span></td>
                                <td>--</td>
                                <td>--</td>
                                <td>--</td>
                                <td><span class="is-ok">--</span></td>
                                <td><button class="biz-formula-add-row-btn" type="button" data-formula-add-port-row="${port}">增加</button></td>
                              </tr>
                            `;
                          }
                          return portRows.map((item) => {
                            const isFirstPortRow = item.index === portRows[0].index;
                            const quantityKg = lineBatchKg * Number(item.ratio || 0) / 100;
                            const unitPrice = getMaterialUnitPrice(item.name);
                            const materialCost = quantityKg * unitPrice;
                            return `
                            <tr class="biz-line-hover-row ${item.index === activeFormulaMaterialIndex ? 'is-picking-material' : ''}" data-formula-row-index="${item.index}">
                              ${isFirstPortRow ? `
                                <td class="biz-line-port-cell" rowspan="${portRows.length}">
                                  <select data-formula-port-group="${port}">
                                    ${renderPortOptions(currentLine, port)}
                                  </select>
                                </td>
                              ` : ''}
                              <td>
                                <button class="biz-line-material-pick ${item.name ? '' : 'is-empty'}" type="button" data-formula-select-material-index="${item.index}">
                                  <strong>${esc(item.name || '待选择材料')}</strong>
                                </button>
                              </td>
                              <td><label class="biz-line-ratio"><input type="number" min="0" max="100" step="0.1" data-formula-material-index="${item.index}" data-formula-material-field="ratio" value="${esc(item.ratio)}"><span>%</span></label></td>
                              <td>${formatKgValue(quantityKg)} kg</td>
                              <td><span class="biz-line-cost"><strong>${formatCurrency(materialCost)}</strong><em>${formatCurrency(unitPrice)}/kg</em></span></td>
                              <td><span class="${/紧急|预警|待检/.test(item.state) ? 'is-warn' : 'is-ok'}">${esc(item.quantity)} / ${esc(item.state)}</span></td>
                              <td>
                                <div class="biz-line-action-stack">
                                  <button class="biz-formula-add-row-btn" type="button" data-formula-add-port-row="${port}" data-formula-add-after-index="${item.index}">增加</button>
                                  <button class="biz-formula-remove-btn" type="button" data-formula-remove-index="${item.index}">移除</button>
                                </div>
                              </td>
                            </tr>
                          `;
                          }).join('');
                        }).join('')}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colspan="2">合计</td>
                          <td>${totalRatioLabel}%</td>
                          <td>${formatKgValue(lineTotal)} kg</td>
                          <td>${formatCurrency(lineCostTotal)}</td>
                          <td colspan="2">${riskCount ? `${riskCount} 项库存风险` : '库存正常'}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
          </div>
        </div>
      </article>
    `;
  };

  const renderFormulaLibraryPanel = () => {
    const recipe = getActiveFormula();
    if (!recipe) return '';
    const materialRows = inventoryRows.filter((row) => row[1] === '原材料');
    const materialCategories = ['全部', ...new Set(materialRows.map((row) => row[2]))];
    if (!materialCategories.includes(formulaMaterialCategory)) formulaMaterialCategory = '全部';
    const visibleMaterials = formulaMaterialCategory === '全部'
      ? materialRows
      : materialRows.filter((row) => row[2] === formulaMaterialCategory);
    const usedMaterialNames = new Set(recipe.materials.map((item) => item.name));
    const hasActiveMaterialRow = Number.isInteger(activeFormulaMaterialIndex)
      && !!recipe.materials[activeFormulaMaterialIndex];

    return `
      <aside class="business-panel biz-formula-library" aria-hidden="${formulaLibraryCollapsed ? 'true' : 'false'}">
        <div class="business-panel-head biz-formula-library-head">
          <h2>库存材料库</h2>
          <div class="biz-formula-library-filter">
            <select data-formula-material-category-select>
              ${renderFormulaFilterOptions(materialCategories, formulaMaterialCategory, '全部分类')}
            </select>
          </div>
        </div>
        <div class="biz-formula-material-list">
          ${visibleMaterials.map(([name, type, category, supplier, quantity, state]) => {
            const isUsed = usedMaterialNames.has(name);
            const isCurrent = hasActiveMaterialRow && recipe.materials[activeFormulaMaterialIndex]?.name === name;
            return `
              <div class="biz-formula-material-card ${/紧急|预警/.test(state) ? 'is-warn' : ''} ${isUsed ? 'is-used' : ''} ${isCurrent ? 'is-current' : ''}" role="button" tabindex="0" data-formula-add-material="${esc(name)}" aria-disabled="false">
                ${isUsed ? `<span class="biz-formula-material-badge">${isCurrent ? '当前' : '已添加'}</span>` : ''}
                <strong>${esc(name)}</strong>
                <span>${esc(category)} · ${esc(type)}</span>
                <small>${esc(supplier)}</small>
                <em class="biz-formula-material-stock ${getInventoryStateClass(state)}">${esc(quantity)} / <span class="biz-formula-material-state ${getInventoryStateClass(state)}">${esc(state)}</span></em>
              </div>
            `;
          }).join('') || '<div class="biz-formula-empty">当前分类暂无可用原材料</div>'}
        </div>
      </aside>
    `;
  };

  const renderFormulaEditor = () => `
    <section class="biz-formula-page">
      <section class="biz-formula-layout biz-formula-editor-layout ${formulaLibraryCollapsed ? 'is-library-collapsed' : ''}">
        ${renderFormulaBuilderPanel()}
        ${renderFormulaLibraryPanel()}
      </section>
    </section>
  `;

  const refreshFormulaBuilderPanel = () => {
    const builder = refs.businessPageContent?.querySelector('.biz-formula-builder');
    if (!builder) return;
    builder.outerHTML = renderFormulaBuilderPanel();
    const nextBuilder = refs.businessPageContent?.querySelector('.biz-formula-builder');
    App.customSelects?.enhanceAll?.(nextBuilder);
  };

  const syncFormulaMaterialLibraryState = () => {
    const recipe = getActiveFormula();
    const usedMaterialNames = new Set((recipe?.materials || []).map((item) => item.name));
    const currentName = Number.isInteger(activeFormulaMaterialIndex)
      ? recipe?.materials?.[activeFormulaMaterialIndex]?.name
      : '';
    refs.businessPageContent?.querySelectorAll('[data-formula-add-material]').forEach((card) => {
      const materialName = card.getAttribute('data-formula-add-material') || '';
      const isUsed = usedMaterialNames.has(materialName);
      const isCurrent = Boolean(currentName && materialName === currentName);
      card.classList.toggle('is-used', isUsed);
      card.classList.toggle('is-current', isCurrent);
      card.setAttribute('aria-disabled', 'false');
      const badge = card.querySelector('.biz-formula-material-badge');
      if (isUsed) {
        if (badge) {
          badge.textContent = isCurrent ? '当前' : '已添加';
        } else {
          card.insertAdjacentHTML('afterbegin', `<span class="biz-formula-material-badge">${isCurrent ? '当前' : '已添加'}</span>`);
        }
      } else {
        badge?.remove();
      }
    });
  };

  const syncFormulaActiveRowState = () => {
    refs.businessPageContent?.querySelectorAll('[data-formula-row-index]').forEach((row) => {
      const rowIndex = Number(row.getAttribute('data-formula-row-index'));
      row.classList.toggle('is-picking-material', rowIndex === activeFormulaMaterialIndex);
    });
  };

  const renderFormula = () => (formulaViewMode === 'edit' ? renderFormulaEditor() : renderFormulaList());

  const returnFormulaList = () => {
    formulaViewMode = 'list';
    activeFormulaMaterialIndex = null;
    clearFormulaEditorDraft();
    render('formula-management');
  };

  const handleFormulaBackToList = async () => {
    if (!isFormulaDraftActive()) {
      returnFormulaList();
      return;
    }

    if (!hasFormulaDraftContent(formulaEditorDraft) || !isFormulaDraftChanged()) {
      returnFormulaList();
      return;
    }

    const confirmed = await App.confirmDialog?.open?.({
      title: '保存当前配方',
      message: '当前配方内容已修改，是否保存后返回列表？',
      confirmText: '保存',
      cancelText: '不保存',
      variant: 'normal',
      icon: 'ti-device-floppy',
    });

    if (confirmed) saveActiveFormulaVersion();
    returnFormulaList();
  };

  const getProductionOrders = () => orderRows
    .filter((order) => productionQueueStatuses.includes(order.status))
    .map((order) => normalizeOrder(order));

  const renderProduction = () => {
    const productionOrders = getProductionOrders();
    const planOrders = productionOrders
      .filter((order) => getOrderProductionDate(order) === productionPlanDate)
      .sort((a, b) => String(getRecipeForOrder(a).line || 'A').localeCompare(String(getRecipeForOrder(b).line || 'A'))
        || a.id.localeCompare(b.id));
    const totalKg = planOrders.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
    const runningCount = planOrders.filter((order) => order.status === '生产中').length;
    const doneCount = planOrders.filter((order) => order.status === '已完成').length;
    const lineGroups = formulaLineOptions.map((line) => [
      line,
      planOrders.filter((order) => String(getRecipeForOrder(order).line || 'A') === line),
    ]);
    const normalizedSearch = productionSearchQuery.trim().toLowerCase();
    const visiblePlanOrders = planOrders.filter((order) => {
      const recipe = getRecipeForOrder(order);
      const line = String(recipe.line || 'A');
      const matchesLine = productionLineFilter === '全部' || line === productionLineFilter;
      const matchesStatus = productionStatusFilter === '全部' || order.status === productionStatusFilter;
      if (!matchesLine || !matchesStatus) return false;
      if (!normalizedSearch) return true;
      const values = [
        order.productionNo || getInvoiceNoForOrder(order),
        order.id,
        getOrderProductionDate(order),
        `${line}号线`,
        order.formula,
        formatOrderNumber(order.quantity),
        order.status,
      ];
      return values.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
    const productionFilteredCount = visiblePlanOrders.length;
    const hasProductionFilters = productionLineFilter !== '全部' || productionStatusFilter !== '全部' || Boolean(normalizedSearch);
    const productionTotalPages = Math.max(1, Math.ceil(productionFilteredCount / productionPageSize));
    productionListPage = Math.min(Math.max(1, productionListPage), productionTotalPages);
    const productionPageStart = (productionListPage - 1) * productionPageSize;
    const pagedPlanOrders = visiblePlanOrders.slice(productionPageStart, productionPageStart + productionPageSize);

    return `
      <section class="biz-production-page">
        ${renderStatStrip([
          ['当天计划', `${planOrders.length} 单`, productionPlanDate],
          ['计划产量', `${formatKgValue(totalKg)} kg`, '按订单数量汇总'],
          ['生产中', `${runningCount} 单`, '可在本页完成'],
          ['已完成', `${doneCount} 单`, doneCount === planOrders.length && planOrders.length ? '当天计划已完成' : '继续跟进'],
        ])}
        <section class="biz-production-layout">
          <article class="business-panel biz-line-board">
            <div class="business-panel-head biz-line-board-head">
              <div class="biz-line-board-title">
                <h2>当天生产计划</h2>
              </div>
              <label class="biz-production-date">
                <span>生产日期</span>
                <input type="date" value="${esc(productionPlanDate)}" data-production-plan-date>
              </label>
            </div>
            ${lineGroups.map(([line, jobs]) => `
              <div class="biz-line-row">
                <strong>${esc(line)} 号线</strong>
                <div>
                  ${jobs.map((order) => {
                    const statusClass = order.status === '生产中' ? 'is-running' : order.status === '已完成' ? 'is-done' : 'is-scheduled';
                    return `<span class="${statusClass}"><strong>${esc(order.formula)}</strong><em>${esc(formatOrderNumber(order.quantity))} KG</em><small><b class="biz-line-job-code">${esc(order.productionNo || getInvoiceNoForOrder(order))}</b>${esc(order.status)}</small></span>`;
                  }).join('') || '<span class="is-empty">暂无计划</span>'}
                </div>
              </div>
            `).join('')}
          </article>
        </section>
        <section class="business-panel biz-table-panel biz-production-table-panel">
          <div class="business-panel-head biz-production-table-head">
            <div class="biz-production-table-title">
              <i class="ti ti-list-details" aria-hidden="true"></i>
              <h2>排产明细</h2>
            </div>
            <div class="biz-formula-table-actions biz-production-table-actions">
              <select data-production-line-filter aria-label="排产产线筛选">
                ${renderOptions(['全部', ...formulaLineOptions.map((line) => `${line}号线`)], productionLineFilter === '全部' ? '全部' : `${productionLineFilter}号线`)}
              </select>
              <select data-production-status-filter aria-label="排产状态筛选">
                ${renderOptions(['全部', ...productionQueueStatuses], productionStatusFilter)}
              </select>
              ${renderSearchBox({
                className: 'biz-formula-table-search biz-production-search',
                placeholder: '搜索排产号 / 订单号 / 产品',
                value: productionSearchQuery,
                attributes: { 'data-production-search': 'true' },
              })}
            </div>
          </div>
          <div class="ui-table-wrap biz-production-table-wrap">
            <table class="ui-table ui-table--sticky-header ui-table--comfortable biz-production-table">
              <thead><tr><th>排产号</th><th>订单号</th><th>生产日期</th><th>产线</th><th>产品</th><th>数量(KG)</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${pagedPlanOrders.map((order) => {
                  const recipe = getRecipeForOrder(order);
                  return `
                    <tr>
                      <td>${esc(order.productionNo || getInvoiceNoForOrder(order))}</td>
                      <td>${esc(order.id)}</td>
                      <td>${esc(getOrderProductionDate(order))}</td>
                      <td>${esc(recipe.line || 'A')} 号线</td>
                      <td>${esc(order.formula)}</td>
                      <td>${esc(formatOrderNumber(order.quantity))}</td>
                      <td><span class="biz-order-status ${getOrderStatusClass(order.status)}">${esc(order.status)}</span></td>
                      <td>
                        <div class="biz-supplier-row-actions biz-order-row-actions biz-production-row-actions">
                          ${order.status === '已安排' ? `
                            <button class="is-success is-start" type="button" data-production-status="${esc(order.id)}" data-order-next-status="生产中" aria-label="开始生产${esc(order.id)}">
                              <i class="ti ti-player-play" aria-hidden="true"></i>
                            </button>
                          ` : ''}
                          ${order.status === '生产中' ? `
                            <button class="is-success is-running" type="button" data-production-status="${esc(order.id)}" data-order-next-status="已完成" aria-label="完成生产${esc(order.id)}">
                              <i class="ti ti-loader-2 is-spinning" aria-hidden="true"></i>
                            </button>
                          ` : ''}
                          ${order.status === '已完成' ? `
                            <button class="is-success is-finished" type="button" aria-label="已完成${esc(order.id)}" disabled>
                              <i class="ti ti-check" aria-hidden="true"></i>
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('') || `<tr><td colspan="8"><div class="biz-formula-empty">${hasProductionFilters ? '暂无匹配生产计划' : '当天暂无生产计划'}</div></td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-production-pagination">
            <p class="biz-formula-pagination-meta">
              第 ${productionFilteredCount ? productionPageStart + 1 : 0}-${Math.min(productionPageStart + productionPageSize, productionFilteredCount)} 条 / 共 ${productionFilteredCount} 条
            </p>
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-production-page-size aria-label="排产明细每页条数">${orderPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === productionPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-production-page-prev ${productionListPage <= 1 ? 'disabled' : ''} aria-label="排产明细上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${productionListPage} / ${productionTotalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-production-page-next ${productionListPage >= productionTotalPages ? 'disabled' : ''} aria-label="排产明细下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    `;
  };

  const CUSTOMER_STORAGE_KEY = 'gjh-customers-v1';
  const PERSONNEL_STORAGE_KEY = 'gjh-personnel-v1';
  const archiveConfigs = {
    customer: {
      pageId: 'customer-archive',
      storageKey: CUSTOMER_STORAGE_KEY,
      title: '客户管理',
      icon: 'ti-users-group',
      entityName: '客户',
      codePrefix: 'C',
      codeLabel: '客户编号',
      nameLabel: '客户名称',
      namePlaceholder: '客户名称',
      filterLabel: '客户等级',
      filterAllLabel: '全部等级',
      categoryLabel: '客户等级',
      statusLabel: '服务状态',
      searchPlaceholder: '搜索客户、联系人、地址...',
      searchLabel: '搜索客户档案',
      addText: '新增客户',
      emptyText: '暂无匹配客户',
      categories: ['重点客户', '活跃客户', '潜在客户', '账期复核', '样品跟进'],
      statuses: ['正常服务', '样品跟进', '账期复核', '暂停服务'],
      columns: ['编号', '客户名称', '联系人', '电话', '邮箱', '客户等级', '状态', '操作'],
      defaults: [
        { code: 'C001', name: '宁波辰光电器', contact: '王总', phone: '0574-88223311', email: 'wang@cg-electric.com', category: '重点客户', status: '正常服务', address: '浙江省宁波市鄞州区启明路', note: '阻燃 ABS 长期客户，本月样品确认后转量产。' },
        { code: 'C002', name: '杭州启明科技', contact: '周经理', phone: '0571-88990012', email: 'zhou@qm-tech.com', category: '活跃客户', status: '正常服务', address: '浙江省杭州市滨江区江南大道', note: 'PC/ABS 报价已更新，关注交期承诺。' },
        { code: 'C003', name: '苏州瑞嘉材料', contact: '李娜', phone: '0512-67881234', email: 'lina@ruijia.com', category: '重点客户', status: '账期复核', address: '江苏省苏州市工业园区星湖街', note: '增强 PP 订单稳定，账期额度待财务复核。' },
        { code: 'C004', name: '昆山明拓模塑', contact: '陈工', phone: '0512-55112233', email: 'chen@mt-mold.com', category: '样品跟进', status: '样品跟进', address: '江苏省昆山市开发区前进东路', note: '高光 ABS 试样中，需补充色差报告。' },
        { code: 'C005', name: '常州宏远电装', contact: '赵经理', phone: '0519-86667788', email: 'zhao@hy-wire.com', category: '活跃客户', status: '正常服务', address: '江苏省常州市武进区湖塘镇', note: '线束材料季度需求稳定，发货前同步质检报告。' },
      ],
    },
    personnel: {
      pageId: 'personnel-archive',
      storageKey: PERSONNEL_STORAGE_KEY,
      title: '人员管理',
      icon: 'ti-id-badge-2',
      entityName: '人员',
      codePrefix: 'P',
      codeLabel: '人员编号',
      nameLabel: '姓名',
      namePlaceholder: '姓名',
      filterLabel: '部门',
      filterAllLabel: '全部部门',
      categoryLabel: '部门',
      statusLabel: '在岗状态',
      searchPlaceholder: '搜索姓名、部门、岗位...',
      searchLabel: '搜索人员档案',
      addText: '新增人员',
      emptyText: '暂无匹配人员',
      categories: ['销售部', '实验室', '仓储部', '生产部', '财务部', '系统管理'],
      statuses: ['在岗', '试用', '权限待确认', '停用'],
      columns: ['编号', '姓名', '部门', '岗位', '电话', '邮箱', '状态', '操作'],
      defaults: [
        { code: 'P001', name: '王敏', contact: '销售主管', phone: '13800010001', email: 'wangmin@gj-plastic.com', category: '销售部', status: '在岗', address: '销售部 / 华东客户组', note: '负责重点客户、报价审批和客户跟进列表。' },
        { code: 'P002', name: '陈工', contact: '质检工程师', phone: '13800010002', email: 'chengong@gj-plastic.com', category: '实验室', status: '在岗', address: '实验室 / 物性检测', note: '负责物性、图谱异常复核和报告归档。' },
        { code: 'P003', name: '刘洋', contact: '仓储管理员', phone: '13800010003', email: 'liuyang@gj-plastic.com', category: '仓储部', status: '权限待确认', address: '仓储部 / 原料仓', note: '负责库存盘点、出入库复核和仓库预警。' },
        { code: 'P004', name: '赵磊', contact: '销售经理', phone: '13800010004', email: 'zhaolei@gj-plastic.com', category: '销售部', status: '在岗', address: '销售部 / 华南客户组', note: '负责 PC/ABS 客户报价与交付协调。' },
        { code: 'P005', name: '何佳', contact: '生产计划员', phone: '13800010005', email: 'hejia@gj-plastic.com', category: '生产部', status: '试用', address: '生产部 / 排产中心', note: '跟进产线排程、齐套状态和插单评估。' },
      ],
    },
  };

  const getSupplierCategories = () => [
    ...new Set([...supplierCategoryOptions, ...supplierRows.map((supplier) => supplier.category).filter(Boolean)]),
  ];

  const archiveStates = Object.fromEntries(Object.entries(archiveConfigs).map(([kind, config]) => [kind, {
    rows: normalizeArchiveRows(config, utils.readJson(config.storageKey, null)),
    filter: '全部',
    search: '',
    editingCode: '',
    modalOpen: false,
    draftNote: `${config.entityName}档案自动保存到本地`,
    page: 1,
    pageSize: 10,
  }]));

  const getArchiveCategories = (config, state) => [
    ...new Set([...config.categories, ...state.rows.map((record) => record.category).filter(Boolean)]),
  ];

  const getArchiveByCode = (kind, code) => archiveStates[kind]?.rows.find((record) => record.code === code);

  const getArchiveStatusClass = (status) => {
    if (/暂停|停用/.test(status)) return 'is-danger';
    if (/复核|确认|试用|样品/.test(status)) return 'is-warn';
    return 'is-ok';
  };

  const getCustomerByCode = (code) => archiveStates['customer']?.rows.find((r) => r.code === code);
  const getCustomerOrders = (customerName) => orderRows.filter((o) => o.customer === customerName).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
  const getCustomerProductStats = (orders) => {
    const map = {};
    orders.forEach((o) => {
      const key = o.formula;
      if (!map[key]) map[key] = { formula: key, count: 0, totalQty: 0, totalAmount: 0, lastDate: '' };
      map[key].count++;
      map[key].totalQty += Number(o.quantity || 0);
      map[key].totalAmount += getOrderAmount(o);
      if (!map[key].lastDate || o.deliveryDate > map[key].lastDate) map[key].lastDate = o.deliveryDate;
    });
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const persistArchive = (kind, note) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    if (!config || !state) return;
    state.draftNote = note || `${config.entityName}档案已保存`;
    utils.writeJson(config.storageKey, state.rows);
  };

  const getNextArchiveCode = (kind) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    const prefix = config.codePrefix;
    const matcher = new RegExp(`^${prefix}(\\d+)$`, 'i');
    const maxNumber = state.rows.reduce((max, record) => {
      const match = String(record.code || '').match(matcher);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const getArchiveFormData = (kind) => {
    const config = archiveConfigs[kind];
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-archive-field="${field}"]`)?.value || '').trim();
    return normalizeArchiveRecord(config, {
      code: read('code'),
      name: read('name'),
      contact: read('contact'),
      phone: read('phone'),
      email: read('email'),
      category: read('category'),
      status: read('status'),
      address: read('address'),
      note: read('note'),
    });
  };

  const saveArchiveRecord = (kind) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    const record = getArchiveFormData(kind);
    if (!record.code) {
      state.draftNote = `请先填写${config.codeLabel}`;
      notifyAction(state.draftNote, 'warn', `${kind}-code-required`);
      return false;
    }
    if (!record.name) {
      state.draftNote = `请先填写${config.nameLabel}`;
      notifyAction(state.draftNote, 'warn', `${kind}-name-required`);
      return false;
    }
    const currentIndex = state.editingCode ? state.rows.findIndex((row) => row.code === state.editingCode) : -1;
    const duplicatedCodeIndex = state.rows.findIndex((row) => row.code === record.code);
    if (duplicatedCodeIndex >= 0 && duplicatedCodeIndex !== currentIndex) {
      state.draftNote = `${config.codeLabel}已存在，请换一个编号`;
      notifyAction(state.draftNote, 'warn', `${kind}-code-duplicated`);
      return false;
    }
    const duplicatedNameIndex = state.rows.findIndex((row) => row.name === record.name);
    if (duplicatedNameIndex >= 0 && duplicatedNameIndex !== currentIndex) {
      state.draftNote = `${config.nameLabel}已存在，请换一个名称`;
      notifyAction(state.draftNote, 'warn', `${kind}-name-duplicated`);
      return false;
    }
    if (currentIndex >= 0) {
      state.rows[currentIndex] = record;
      state.editingCode = record.code;
      state.filter = record.category;
      persistArchive(kind, `已更新${config.entityName} ${record.name} · ${getTimeCode()}`);
      notifyAction(`已保存${config.entityName} ${record.name}`, 'success', `${kind}-save:${record.code}`);
      return true;
    }
    state.rows.unshift(record);
    state.editingCode = record.code;
    state.filter = record.category;
    persistArchive(kind, `已新增${config.entityName} ${record.name} · ${getTimeCode()}`);
    notifyAction(`已新增${config.entityName} ${record.name}`, 'success', `${kind}-save:${record.code}`);
    return true;
  };

  const deleteArchiveRecord = async (kind, code) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    const index = state.rows.findIndex((record) => record.code === code);
    if (index < 0) return false;
    const record = state.rows[index];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: `删除${config.entityName}`,
      message: `确认删除${config.entityName}「${record.name}」？删除后无法恢复。`,
    });
    if (!confirmed) return false;
    state.rows.splice(index, 1);
    if (state.editingCode === code) state.editingCode = '';
    persistArchive(kind, `已删除${config.entityName} ${record.name} · ${getTimeCode()}`);
    notifyAction(`已删除${config.entityName} ${record.name}`, 'success', `${kind}-delete:${code}`);
    return true;
  };

  const getSupplierByCode = (code) => supplierRows.find((supplier) => supplier.code === code);

  const getSupplierProcurements = (supplierName) => procurementRows.filter((p) => p.supplier === supplierName).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const getSupplierMaterialStats = (procurements) => {
    const map = {};
    procurements.forEach((p) => {
      const key = p.material;
      if (!map[key]) map[key] = { material: key, count: 0, totalQty: 0, totalAmount: 0, lastDate: '' };
      map[key].count++;
      map[key].totalQty += Number(p.quantity || 0);
      map[key].totalAmount += Number(p.quantity || 0) * Number(p.unitPrice || 0);
      if (!map[key].lastDate || p.purchaseDate > map[key].lastDate) map[key].lastDate = p.purchaseDate;
    });
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const getSupplierCategoryOptions = () => {
    const cats = new Set(supplierRows.map((s) => s.category).filter(Boolean));
    return [...cats].sort();
  };

  const getSupplierStatusClass = (status) => {
    if (/暂停/.test(status)) return 'is-danger';
    if (/评估/.test(status)) return 'is-warn';
    return 'is-ok';
  };

  const persistSuppliers = (note = '供应商档案已保存') => {
    supplierDraftNote = note;
    utils.writeJson(SUPPLIER_STORAGE_KEY, supplierRows);
  };

  const getNextSupplierCode = () => {
    const maxNumber = supplierRows.reduce((max, supplier) => {
      const match = String(supplier.code || '').match(/^S(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `S${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const getSupplierFormData = () => {
    const root = refs.businessPageContent;
    const read = (field) => String(root?.querySelector(`[data-supplier-field="${field}"]`)?.value || '').trim();
    return normalizeSupplier({
      code: read('code'),
      name: read('name'),
      contact: read('contact'),
      phone: read('phone'),
      email: read('email'),
      category: read('category'),
      status: read('status'),
      address: read('address'),
      note: read('note'),
    });
  };

  const saveSupplier = () => {
    const supplier = getSupplierFormData();
    if (!supplier.code) {
      supplierDraftNote = '请先填写供应商编号';
      notifyAction(supplierDraftNote, 'warn', 'supplier-code-required');
      return false;
    }
    if (!supplier.name) {
      supplierDraftNote = '请先填写供应商名称';
      notifyAction(supplierDraftNote, 'warn', 'supplier-name-required');
      return false;
    }
    const currentIndex = supplierEditingCode ? supplierRows.findIndex((row) => row.code === supplierEditingCode) : -1;
    const duplicatedCodeIndex = supplierRows.findIndex((row) => row.code === supplier.code);
    if (duplicatedCodeIndex >= 0 && duplicatedCodeIndex !== currentIndex) {
      supplierDraftNote = '供应商编号已存在，请换一个编号';
      notifyAction(supplierDraftNote, 'warn', 'supplier-code-duplicated');
      return false;
    }
    const duplicatedNameIndex = supplierRows.findIndex((row) => row.name === supplier.name);
    if (duplicatedNameIndex >= 0 && duplicatedNameIndex !== currentIndex) {
      supplierDraftNote = '供应商名称已存在，请换一个名称';
      notifyAction(supplierDraftNote, 'warn', 'supplier-name-duplicated');
      return false;
    }
    if (currentIndex >= 0) {
      supplierRows[currentIndex] = supplier;
      supplierEditingCode = supplier.code;
      supplierCategoryFilter = supplier.category;
      persistSuppliers(`已更新供应商 ${supplier.name} · ${getTimeCode()}`);
      notifyAction(`已保存供应商 ${supplier.name}`, 'success', `supplier-save:${supplier.code}`);
      return true;
    }
    supplierRows.unshift(supplier);
    supplierEditingCode = supplier.code;
    supplierCategoryFilter = supplier.category;
    persistSuppliers(`已新增供应商 ${supplier.name} · ${getTimeCode()}`);
    notifyAction(`已新增供应商 ${supplier.name}`, 'success', `supplier-save:${supplier.code}`);
    return true;
  };

  const deleteSupplier = async (code) => {
    const index = supplierRows.findIndex((supplier) => supplier.code === code);
    if (index < 0) return false;
    const supplier = supplierRows[index];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除供应商',
      message: `确认删除供应商「${supplier.name}」？删除后无法恢复。`,
    });
    if (!confirmed) return false;
    supplierRows.splice(index, 1);
    if (supplierEditingCode === code) supplierEditingCode = '';
    persistSuppliers(`已删除供应商 ${supplier.name} · ${getTimeCode()}`);
    notifyAction(`已删除供应商 ${supplier.name}`, 'success', `supplier-delete:${code}`);
    return true;
  };

  const renderSupplierArchive = () => {
    const categories = getSupplierCategories();
    const categoryTabs = ['全部', ...categories];
    if (!categoryTabs.includes(supplierCategoryFilter)) supplierCategoryFilter = '全部';
    const normalizedSearch = supplierSearchQuery.trim().toLowerCase();
    const visibleSuppliers = supplierRows.filter((supplier) => {
      const matchedCategory = supplierCategoryFilter === '全部' || supplier.category === supplierCategoryFilter;
      const values = [supplier.code, supplier.name, supplier.contact, supplier.phone, supplier.email, supplier.category, supplier.address, supplier.status, supplier.note];
      const matchedSearch = !normalizedSearch || values.some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchedCategory && matchedSearch;
    });
    const filteredCount = visibleSuppliers.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / supplierPageSize));
    supplierListPage = Math.min(Math.max(1, supplierListPage), totalPages);
    const pageStart = (supplierListPage - 1) * supplierPageSize;
    const pagedSuppliers = visibleSuppliers.slice(pageStart, pageStart + supplierPageSize);
    const editingSupplier = supplierEditingCode ? getSupplierByCode(supplierEditingCode) : null;
    const supplierForm = editingSupplier || normalizeSupplier({ code: getNextSupplierCode(), category: supplierCategoryFilter === '全部' ? categories[0] || '基础树脂' : supplierCategoryFilter, status: '正常合作' });

    return `
      <div class="biz-supplier-page">
        <section class="business-panel biz-supplier-table-panel">
          <div class="biz-formula-table-head biz-supplier-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ti-building-factory-2" aria-hidden="true"></i>
              <div>
                <h2>供应商管理</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-supplier-table-actions">
              ${renderSearchBox({
                className: 'biz-supplier-search',
                value: supplierSearchQuery,
                placeholder: '搜索供应商、联系人、地址...',
                label: '搜索供应商档案',
                attributes: { 'data-supplier-search': '' },
              })}
              <select data-supplier-category-filter aria-label="供应商类别筛选">
                ${categoryTabs.map((category) => `
                  <option value="${esc(category)}" ${category === supplierCategoryFilter ? 'selected' : ''}>${esc(category === '全部' ? '全部类别' : category)}</option>
                `).join('')}
              </select>
              <button class="biz-formula-new-btn" type="button" data-supplier-new>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新增供应商</span>
              </button>
            </div>
          </div>
          <div class="ui-table-wrap biz-supplier-table-wrap">
            <table class="ui-table ui-table--sticky-header ui-table--comfortable biz-supplier-table">
              <thead>
                <tr>${['编号', '供应商名称', '联系人', '电话', '邮箱', '供应类别', '状态', '操作'].map((column) => `<th>${esc(column)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${pagedSuppliers.map((supplier) => `
                  <tr>
                    <td>${esc(supplier.code)}</td>
                    <td class="biz-supplier-name-cell"><button class="biz-order-code" type="button" data-supplier-detail="${esc(supplier.code)}">${esc(supplier.name)}</button></td>
                    <td>${esc(supplier.contact || '--')}</td>
                    <td>${esc(supplier.phone || '--')}</td>
                    <td>${esc(supplier.email || '--')}</td>
                    <td><span class="biz-formula-chip">${esc(supplier.category || '未分类')}</span></td>
                    <td><span class="biz-formula-status ${getSupplierStatusClass(supplier.status)}">${esc(supplier.status)}</span></td>
                    <td>
                      <div class="biz-supplier-row-actions">
                        <button type="button" title="编辑供应商" aria-label="编辑 ${esc(supplier.name)}" data-supplier-edit="${esc(supplier.code)}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <button class="is-danger" type="button" title="删除供应商" aria-label="删除 ${esc(supplier.name)}" data-supplier-delete="${esc(supplier.code)}">
                          <i class="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="8"><div class="biz-formula-empty">暂无匹配供应商</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-supplier-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-supplier-page-size aria-label="供应商每页条数">${formulaPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === supplierPageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-supplier-page-prev ${supplierListPage <= 1 ? 'disabled' : ''} aria-label="供应商上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${supplierListPage} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-supplier-page-next ${supplierListPage >= totalPages ? 'disabled' : ''} aria-label="供应商下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${supplierModalOpen ? `
          <div class="biz-order-modal dialog-overlay" data-supplier-modal>
            <div class="biz-inventory-material-dialog biz-order-dialog biz-supplier-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="supplierModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="supplierModalTitle">${supplierEditingCode ? '编辑供应商' : '新增供应商'}</h2>
                  <span>${esc(supplierDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭供应商编辑" data-supplier-close>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-supplier-editor">
                <label class="is-code">
                  <span>供应商编号 *</span>
                  <input type="text" value="${esc(supplierForm.code)}" placeholder="例如：S001" data-supplier-field="code">
                </label>
                <label class="is-name">
                  <span>供应商名称 *</span>
                  <input type="text" value="${esc(supplierForm.name)}" placeholder="供应商名称" data-supplier-field="name">
                </label>
                <label>
                  <span>联系人</span>
                  <input type="text" value="${esc(supplierForm.contact)}" placeholder="联系人" data-supplier-field="contact">
                </label>
                <label>
                  <span>电话</span>
                  <input type="text" value="${esc(supplierForm.phone)}" placeholder="联系电话" data-supplier-field="phone">
                </label>
                <label>
                  <span>邮箱</span>
                  <input type="email" value="${esc(supplierForm.email)}" placeholder="邮箱地址" data-supplier-field="email">
                </label>
                <label>
                  <span>供应类别</span>
                  <select data-supplier-field="category">${renderOptions(categories, supplierForm.category)}</select>
                </label>
                <label>
                  <span>合作状态</span>
                  <select data-supplier-field="status">${renderOptions(supplierStatusOptions, supplierForm.status)}</select>
                </label>
                <label class="is-address">
                  <span>地址</span>
                  <textarea placeholder="供应商地址" data-supplier-field="address">${esc(supplierForm.address)}</textarea>
                </label>
                <label class="is-note">
                  <span>备注</span>
                  <textarea placeholder="资质、供货范围、交期等档案备注" data-supplier-field="note">${esc(supplierForm.note)}</textarea>
                </label>
                <div class="biz-inventory-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-supplier-cancel>取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-supplier-save>保存</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const renderArchive = (kind) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    const categories = getArchiveCategories(config, state);
    const categoryTabs = ['全部', ...categories];
    if (!categoryTabs.includes(state.filter)) state.filter = '全部';
    const normalizedSearch = state.search.trim().toLowerCase();
    const visibleRows = state.rows.filter((record) => {
      const matchedCategory = state.filter === '全部' || record.category === state.filter;
      const values = [record.code, record.name, record.contact, record.phone, record.email, record.category, record.address, record.status, record.note];
      const matchedSearch = !normalizedSearch || values.some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchedCategory && matchedSearch;
    });
    const filteredCount = visibleRows.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const pageStart = (state.page - 1) * state.pageSize;
    const pagedRows = visibleRows.slice(pageStart, pageStart + state.pageSize);
    const editingRecord = state.editingCode ? getArchiveByCode(kind, state.editingCode) : null;
    const formRecord = editingRecord || normalizeArchiveRecord(config, {
      code: getNextArchiveCode(kind),
      category: state.filter === '全部' ? categories[0] || config.categories[0] : state.filter,
      status: config.statuses[0],
    });

    return `
      <div class="biz-supplier-page biz-archive-table-page">
        <section class="business-panel biz-supplier-table-panel biz-archive-table-panel">
          <div class="biz-formula-table-head biz-supplier-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ${esc(config.icon)}" aria-hidden="true"></i>
              <div>
                <h2>${esc(config.title)}</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-supplier-table-actions">
              ${renderSearchBox({
                className: 'biz-supplier-search',
                value: state.search,
                placeholder: config.searchPlaceholder,
                label: config.searchLabel,
                attributes: { 'data-archive-search': kind },
              })}
              <select data-archive-filter="${esc(kind)}" aria-label="${esc(config.filterLabel)}筛选">
                ${categoryTabs.map((category) => `
                  <option value="${esc(category)}" ${category === state.filter ? 'selected' : ''}>${esc(category === '全部' ? config.filterAllLabel : category)}</option>
                `).join('')}
              </select>
              <button class="biz-formula-new-btn" type="button" data-archive-new="${esc(kind)}">
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>${esc(config.addText)}</span>
              </button>
            </div>
          </div>
          <div class="ui-table-wrap biz-supplier-table-wrap">
            <table class="ui-table ui-table--sticky-header ui-table--comfortable biz-supplier-table biz-archive-table">
              <thead>
                <tr>${config.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${pagedRows.map((record) => `
                  <tr>
                    <td>${esc(record.code)}</td>
                    <td class="biz-supplier-name-cell">${kind === 'customer' ? `<button class="biz-order-code" type="button" data-customer-detail="${esc(record.code)}">${esc(record.name)}</button>` : esc(record.name)}</td>
                    <td>${esc(record.contact || '--')}</td>
                    <td>${esc(record.phone || '--')}</td>
                    <td>${esc(record.email || '--')}</td>
                    <td><span class="biz-formula-chip">${esc(record.category || '未分类')}</span></td>
                    <td><span class="biz-formula-status ${getArchiveStatusClass(record.status)}">${esc(record.status)}</span></td>
                    <td>
                      <div class="biz-supplier-row-actions">
                        <button type="button" title="编辑${esc(config.entityName)}" aria-label="编辑 ${esc(record.name)}" data-archive-edit="${esc(kind)}" data-archive-code="${esc(record.code)}">
                          <i class="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <button class="is-danger" type="button" title="删除${esc(config.entityName)}" aria-label="删除 ${esc(record.name)}" data-archive-delete="${esc(kind)}" data-archive-code="${esc(record.code)}">
                          <i class="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || `<tr><td colspan="${config.columns.length}"><div class="biz-formula-empty">${esc(config.emptyText)}</div></td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="biz-formula-pagination biz-supplier-pagination">
            <div class="biz-formula-pagination-actions">
              <label class="biz-formula-page-size">
                <span>每页</span>
                <select data-archive-page-size="${esc(kind)}" aria-label="${esc(config.entityName)}每页条数">${formulaPageSizeOptions.map((n) => `
                  <option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
                <span>条</span>
              </label>
              <div class="biz-formula-page-buttons">
                <button type="button" class="biz-formula-page-btn" data-archive-page-prev="${esc(kind)}" ${state.page <= 1 ? 'disabled' : ''} aria-label="${esc(config.entityName)}上一页">
                  <i class="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span class="biz-formula-page-indicator">${state.page} / ${totalPages}</span>
                <button type="button" class="biz-formula-page-btn" data-archive-page-next="${esc(kind)}" ${state.page >= totalPages ? 'disabled' : ''} aria-label="${esc(config.entityName)}下一页">
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
        ${state.modalOpen ? `
          <div class="biz-order-modal dialog-overlay" data-archive-modal="${esc(kind)}">
            <div class="biz-inventory-material-dialog biz-order-dialog biz-supplier-dialog dialog-card" role="dialog" aria-modal="true" aria-labelledby="${esc(kind)}ModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="${esc(kind)}ModalTitle">${state.editingCode ? `编辑${config.entityName}` : config.addText}</h2>
                  <span>${esc(state.draftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn dialog-close" type="button" aria-label="关闭${esc(config.entityName)}编辑" data-archive-close="${esc(kind)}">
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-supplier-editor">
                <label class="is-code">
                  <span>${esc(config.codeLabel)} *</span>
                  <input type="text" value="${esc(formRecord.code)}" placeholder="例如：${esc(config.codePrefix)}001" data-archive-field="code">
                </label>
                <label class="is-name">
                  <span>${esc(config.nameLabel)} *</span>
                  <input type="text" value="${esc(formRecord.name)}" placeholder="${esc(config.namePlaceholder)}" data-archive-field="name">
                </label>
                <label>
                  <span>${kind === 'personnel' ? '岗位' : '联系人'}</span>
                  <input type="text" value="${esc(formRecord.contact)}" placeholder="${kind === 'personnel' ? '岗位' : '联系人'}" data-archive-field="contact">
                </label>
                <label>
                  <span>电话</span>
                  <input type="text" value="${esc(formRecord.phone)}" placeholder="联系电话" data-archive-field="phone">
                </label>
                <label>
                  <span>邮箱</span>
                  <input type="email" value="${esc(formRecord.email)}" placeholder="邮箱地址" data-archive-field="email">
                </label>
                <label>
                  <span>${esc(config.categoryLabel)}</span>
                  <select data-archive-field="category">${renderOptions(categories, formRecord.category)}</select>
                </label>
                <label>
                  <span>${esc(config.statusLabel)}</span>
                  <select data-archive-field="status">${renderOptions(config.statuses, formRecord.status)}</select>
                </label>
                <label class="is-address">
                  <span>${kind === 'personnel' ? '组织归属' : '地址'}</span>
                  <textarea placeholder="${kind === 'personnel' ? '组织归属、权限范围' : '客户地址'}" data-archive-field="address">${esc(formRecord.address)}</textarea>
                </label>
                <label class="is-note">
                  <span>备注</span>
                  <textarea placeholder="${esc(config.entityName)}档案备注" data-archive-field="note">${esc(formRecord.note)}</textarea>
                </label>
                <div class="biz-inventory-modal-actions">
                  <button class="biz-inventory-ghost-btn" type="button" data-archive-cancel="${esc(kind)}">取消</button>
                  <button class="biz-inventory-primary-btn" type="button" data-archive-save="${esc(kind)}">保存</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const renderPermission = () => `
    <section class="biz-permission-layout">
      <aside class="business-panel biz-role-list">
        <div class="business-panel-head"><h2>角色</h2><span>12 个</span></div>
        ${['销售主管', '实验室工程师', '仓储管理员', '系统管理员'].map((role, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button">${esc(role)}</button>`).join('')}
      </aside>
      <article class="business-panel biz-permission-matrix">
        <div class="business-panel-head"><h2>权限矩阵</h2><span>菜单 / 数据 / 动作</span></div>
        ${['订单管理', '客户档案', '销售库存', '配方管理', '审计日志'].map((module, index) => `
          <div class="biz-permission-row"><strong>${esc(module)}</strong><span class="on">查看</span><span class="${index < 3 ? 'on' : ''}">编辑</span><span class="${index === 0 ? 'on' : ''}">导出</span></div>
        `).join('')}
      </article>
    </section>
  `;

  const renderAudit = () => `
    <section class="biz-audit-layout">
      <aside class="business-panel biz-audit-filter">
        <div class="business-panel-head"><h2>筛选器</h2><span>486 条</span></div>
        ${['全部', '异常事件', '配置变更', '导出行为', '登录访问'].map((item, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button">${esc(item)}</button>`).join('')}
      </aside>
      <article class="business-panel biz-audit-feed">
        <div class="business-panel-head"><h2>事件流</h2><span>实时追踪</span></div>
        ${[
          ['15:42', '王敏导出客户跟进列表', '成功'],
          ['15:28', '陈工删除图谱标签', '成功'],
          ['15:06', 'OSS 数据同步重试', '已恢复'],
          ['14:51', '外部 IP 登录失败', '拦截'],
        ].map(([time, action, result]) => `<div class="biz-audit-event"><strong>${esc(time)}</strong><span>${esc(action)}</span><em>${esc(result)}</em></div>`).join('')}
      </article>
    </section>
  `;

  const renderBody = (pageId) => {
    const renderers = {
      dashboard: renderDashboard,
      'order-management': renderOrders,
      'order-detail': renderOrderDetail,
      'invoice-print': renderInvoice,
      'sales-stock': renderStock,
      'formula-management': renderFormula,
      'production-plan': renderProduction,
      'inventory-management': renderInventory,
      'supplier-archive': renderSupplierArchive,
      'supplier-detail': renderSupplierDetail,
      'customer-archive': () => renderArchive('customer'),
      'customer-detail': renderCustomerDetail,
      'personnel-archive': () => renderArchive('personnel'),
      'raw-material-procurement': renderRawMaterialProcurement,
      'permission-management': renderPermission,
      'audit-log': renderAudit,
    };
    return (renderers[pageId] || renderDashboard)();
  };

  const render = (pageId, def = {}) => {
    if (!refs.businessPageContent) return;
    const usesFullHeightTable = pageId === 'order-management' || pageId === 'inventory-management' || pageId === 'production-plan' || pageId === 'supplier-archive' || pageId === 'customer-archive' || pageId === 'personnel-archive' || pageId === 'raw-material-procurement';
    const usesInvoiceWorkbench = pageId === 'invoice-print';
    refs.businessPageContent.classList.toggle('biz-inventory-shell', usesFullHeightTable);
    refs.businessPageContent.classList.toggle('biz-invoice-shell', usesInvoiceWorkbench);
    refs.businessPageContent.closest('.business-page')?.classList.toggle('biz-inventory-active', usesFullHeightTable);
    refs.businessPageContent.closest('.business-page')?.classList.toggle('biz-invoice-active', usesInvoiceWorkbench);
    refs.businessPageContent.innerHTML = `
      ${renderBody(pageId)}
    `;
    App.customSelects?.enhanceAll?.(refs.businessPageContent);
  };

  const focusFormulaSearch = (selectionStart = formulaSearchQuery.length, selectionEnd = selectionStart) => {
    requestAnimationFrame(() => {
      const searchInput = refs.businessPageContent?.querySelector('[data-formula-search]');
      if (!(searchInput instanceof HTMLInputElement)) return;
      searchInput.focus();
      searchInput.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const restoreSearchInputState = (selector, value, selectionStart = value.length, selectionEnd = selectionStart) => {
    requestAnimationFrame(() => {
      const searchInput = refs.businessPageContent?.querySelector(selector);
      if (!(searchInput instanceof HTMLInputElement)) return;
      searchInput.focus();
      searchInput.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const handleFormulaEdit = (target) => {
    if (!target) return false;

    if (target.hasAttribute('data-formula-search')) {
      formulaSearchQuery = target.value;
      formulaListPage = 1;
      return true;
    }

    if (target.hasAttribute('data-formula-version-select')) {
      applyActiveFormulaVersion(target.value);
      return true;
    }

    if (target.hasAttribute('data-formula-list-category')) {
      formulaListCategory = target.value || '全部';
      formulaListPage = 1;
      return true;
    }

    if (target.hasAttribute('data-formula-list-status')) {
      formulaListStatus = target.value || '全部';
      formulaListPage = 1;
      return true;
    }

    if (target.hasAttribute('data-formula-page-size')) {
      formulaPageSize = Number(target.value) || 10;
      formulaListPage = 1;
      return true;
    }

    const formulaPortGroup = target.getAttribute('data-formula-port-group');
    if (formulaPortGroup) {
      updateActiveFormulaPortGroup(formulaPortGroup, target.value);
      return true;
    }

    const formulaField = target.getAttribute('data-formula-field');
    if (formulaField) {
      updateActiveFormulaField(formulaField, target.value);
      return true;
    }

    const formulaMaterialField = target.getAttribute('data-formula-material-field');
    if (formulaMaterialField) {
      updateActiveFormulaMaterial(
        Number(target.getAttribute('data-formula-material-index')),
        formulaMaterialField,
        target.value,
      );
      return true;
    }

    return false;
  };

  refs.businessPageContent?.addEventListener('input', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.matches('select')) return;
    if (event.target.hasAttribute('data-inventory-search')) {
      inventorySearchQuery = event.target.value;
      inventoryListPage = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? inventorySearchQuery.length) : inventorySearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        'inventory-management',
        () => restoreSearchInputState('[data-inventory-search]', inventorySearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
    if (event.target.hasAttribute('data-supplier-search')) {
      supplierSearchQuery = event.target.value;
      supplierListPage = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? supplierSearchQuery.length) : supplierSearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        'supplier-archive',
        () => restoreSearchInputState('[data-supplier-search]', supplierSearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
    if (event.target.hasAttribute('data-procurement-search')) {
      procurementSearchQuery = event.target.value;
      procurementListPage = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? procurementSearchQuery.length) : procurementSearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        'raw-material-procurement',
        () => restoreSearchInputState('[data-procurement-search]', procurementSearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
    if (event.target.hasAttribute('data-archive-search')) {
      const kind = event.target.getAttribute('data-archive-search');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.search = event.target.value;
      state.page = 1;
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? state.search.length) : state.search.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender(
        config.pageId,
        () => restoreSearchInputState(`[data-archive-search="${kind}"]`, state.search, selectionStart, selectionEnd),
      );
      return;
    }
    if (event.target.hasAttribute('data-order-field')) {
      const quantity = Number(refs.businessPageContent?.querySelector('[data-order-field="quantity"]')?.value || 0);
      const unitPrice = Number(refs.businessPageContent?.querySelector('[data-order-field="unitPrice"]')?.value || 0);
      const preview = refs.businessPageContent?.querySelector('[data-order-total-preview]');
      if (preview) preview.value = formatOrderAmount(quantity * unitPrice);
      return;
    }
    if (handleFormulaEdit(event.target) && event.target.hasAttribute('data-formula-search')) {
      if (event.target instanceof HTMLInputElement && event.isComposing) return;
      const selectionStart = event.target instanceof HTMLInputElement ? (event.target.selectionStart ?? formulaSearchQuery.length) : formulaSearchQuery.length;
      const selectionEnd = event.target instanceof HTMLInputElement ? (event.target.selectionEnd ?? selectionStart) : selectionStart;
      scheduleSearchRender('formula-management', () => focusFormulaSearch(selectionStart, selectionEnd));
    }
  });

  refs.businessPageContent?.addEventListener('compositionend', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.hasAttribute('data-inventory-search')) {
      inventorySearchQuery = event.target.value;
      inventoryListPage = 1;
      const selectionStart = event.target.selectionStart ?? inventorySearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('inventory-management');
      restoreSearchInputState('[data-inventory-search]', inventorySearchQuery, selectionStart, selectionEnd);
      return;
    }
    if (event.target.hasAttribute('data-supplier-search')) {
      supplierSearchQuery = event.target.value;
      supplierListPage = 1;
      const selectionStart = event.target.selectionStart ?? supplierSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('supplier-archive');
      restoreSearchInputState('[data-supplier-search]', supplierSearchQuery, selectionStart, selectionEnd);
      return;
    }
    if (event.target.hasAttribute('data-procurement-search')) {
      procurementSearchQuery = event.target.value;
      procurementListPage = 1;
      const selectionStart = event.target.selectionStart ?? procurementSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('raw-material-procurement');
      restoreSearchInputState('[data-procurement-search]', procurementSearchQuery, selectionStart, selectionEnd);
      return;
    }
    if (event.target.hasAttribute('data-archive-search')) {
      const kind = event.target.getAttribute('data-archive-search');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.search = event.target.value;
      state.page = 1;
      const selectionStart = event.target.selectionStart ?? state.search.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render(config.pageId);
      restoreSearchInputState(`[data-archive-search="${kind}"]`, state.search, selectionStart, selectionEnd);
      return;
    }
    if (event.target.hasAttribute('data-production-search')) {
      productionSearchQuery = event.target.value;
      productionListPage = 1;
      const selectionStart = event.target.selectionStart ?? productionSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      scheduleSearchRender(
        'production-plan',
        () => restoreSearchInputState('[data-production-search]', productionSearchQuery, selectionStart, selectionEnd),
      );
      return;
    }
    if (event.target.hasAttribute('data-formula-search')) {
      formulaSearchQuery = event.target.value;
      formulaListPage = 1;
      const selectionStart = event.target.selectionStart ?? formulaSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('formula-management');
      focusFormulaSearch(selectionStart, selectionEnd);
    }
  });

  refs.businessPageContent?.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.hasAttribute('data-order-status-filter')) {
      orderStatusFilter = event.target.value || '全部';
      orderListPage = 1;
      render('order-management');
      return;
    }
    if (event.target.hasAttribute('data-order-date-filter')) {
      orderDateFilter = event.target.value || '';
      orderListPage = 1;
      render('order-management');
      return;
    }
    if (event.target.hasAttribute('data-order-page-size')) {
      orderPageSize = Number(event.target.value) || 10;
      orderListPage = 1;
      render('order-management');
      return;
    }
    if (event.target.hasAttribute('data-invoice-port')) {
      invoiceSplitPort = normalizeFeederPort(event.target.value, 1);
      render('invoice-print');
      return;
    }
    if (event.target.hasAttribute('data-invoice-batch-count')) {
      invoiceBatchCount = Math.max(1, Number(event.target.value) || 1);
      render('invoice-print');
      return;
    }
    if (event.target.hasAttribute('data-invoice-schedule-date')) {
      invoiceScheduleDate = event.target.value || getTodayCode();
      const order = orderRows[getOrderIndex(invoiceSelectedOrderId)];
      invoiceScheduleSequence = getNextProductionSequence(order, getProductionLineForOrder(order), invoiceScheduleDate);
      render('invoice-print');
      return;
    }
    if (event.target.hasAttribute('data-invoice-schedule-sequence')) {
      invoiceScheduleSequence = Math.max(1, Number(event.target.value) || 1);
      render('invoice-print');
      return;
    }
    if (event.target.hasAttribute('data-production-plan-date')) {
      productionPlanDate = event.target.value || getTodayCode();
      productionListPage = 1;
      render('production-plan');
      return;
    }
    if (event.target.hasAttribute('data-production-line-filter')) {
      const value = event.target.value || '全部';
      productionLineFilter = value === '全部' ? '全部' : value.replace('号线', '');
      productionListPage = 1;
      render('production-plan');
      return;
    }
    if (event.target.hasAttribute('data-production-status-filter')) {
      productionStatusFilter = event.target.value || '全部';
      productionListPage = 1;
      render('production-plan');
      return;
    }
    if (event.target.hasAttribute('data-production-page-size')) {
      productionPageSize = Number(event.target.value) || 10;
      productionListPage = 1;
      render('production-plan');
      return;
    }
    if (event.target.hasAttribute('data-inventory-category-filter')) {
      inventoryCategory = event.target.value || '全部';
      inventoryListPage = 1;
      render('inventory-management');
      return;
    }
    if (event.target.hasAttribute('data-formula-material-category-select')) {
      formulaMaterialCategory = event.target.value || '全部';
      render('formula-management');
      return;
    }
    if (event.target.hasAttribute('data-inventory-page-size')) {
      inventoryPageSize = Number(event.target.value) || 10;
      inventoryListPage = 1;
      render('inventory-management');
      return;
    }
    if (event.target.hasAttribute('data-supplier-category-filter')) {
      supplierCategoryFilter = event.target.value || '全部';
      supplierListPage = 1;
      render('supplier-archive');
      return;
    }
    if (event.target.hasAttribute('data-supplier-page-size')) {
      supplierPageSize = Number(event.target.value) || 10;
      supplierListPage = 1;
      render('supplier-archive');
      return;
    }
    if (event.target.hasAttribute('data-procurement-supplier-filter')) {
      procurementSupplierFilter = event.target.value || '全部';
      procurementListPage = 1;
      render('raw-material-procurement');
      return;
    }
    if (event.target.hasAttribute('data-procurement-page-size')) {
      procurementPageSize = Number(event.target.value) || 10;
      procurementListPage = 1;
      render('raw-material-procurement');
      return;
    }
    if (event.target.hasAttribute('data-archive-filter')) {
      const kind = event.target.getAttribute('data-archive-filter');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.filter = event.target.value || '全部';
      state.page = 1;
      render(config.pageId);
      return;
    }
    if (event.target.hasAttribute('data-archive-page-size')) {
      const kind = event.target.getAttribute('data-archive-page-size');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.pageSize = Number(event.target.value) || 10;
      state.page = 1;
      render(config.pageId);
      return;
    }
    if (!handleFormulaEdit(event.target)) return;

    if (
      event.target.hasAttribute('data-formula-field')
      || event.target.hasAttribute('data-formula-version-select')
      || event.target.hasAttribute('data-formula-port-group')
      || event.target.hasAttribute('data-formula-material-field')
    ) {
      refreshFormulaBuilderPanel();
      syncFormulaActiveRowState();
      syncFormulaMaterialLibraryState();
      return;
    }

    render('formula-management');
  });

  refs.businessPageContent?.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return;

    const datePickerTrigger = event.target.closest('[data-date-picker-trigger]');
    if (datePickerTrigger && refs.businessPageContent.contains(datePickerTrigger)) {
      const input = datePickerTrigger.querySelector('input[type="date"]');
      if (input && event.target !== input) {
        event.preventDefault();
        input.focus({ preventScroll: true });
        try {
          if (typeof input.showPicker === 'function') {
            input.showPicker();
          } else {
            input.click();
          }
        } catch {
          input.click();
        }
      }
      return;
    }

    const orderPagePrev = event.target.closest('[data-order-page-prev]');
    if (orderPagePrev && refs.businessPageContent.contains(orderPagePrev) && !orderPagePrev.disabled) {
      orderListPage -= 1;
      render('order-management');
      return;
    }

    const orderPageNext = event.target.closest('[data-order-page-next]');
    if (orderPageNext && refs.businessPageContent.contains(orderPageNext) && !orderPageNext.disabled) {
      orderListPage += 1;
      render('order-management');
      return;
    }

    const productionPagePrev = event.target.closest('[data-production-page-prev]');
    if (productionPagePrev && refs.businessPageContent.contains(productionPagePrev) && !productionPagePrev.disabled) {
      productionListPage -= 1;
      render('production-plan');
      return;
    }

    const productionPageNext = event.target.closest('[data-production-page-next]');
    if (productionPageNext && refs.businessPageContent.contains(productionPageNext) && !productionPageNext.disabled) {
      productionListPage += 1;
      render('production-plan');
      return;
    }

    const orderNewButton = event.target.closest('[data-order-new]');
    if (orderNewButton && refs.businessPageContent.contains(orderNewButton)) {
      orderEditingId = '';
      orderDraftNote = '正在新建订单';
      orderModalOpen = true;
      render('order-management');
      refs.businessPageContent?.querySelector('[data-order-field="customer"]')?.focus();
      return;
    }

    const orderDetailButton = event.target.closest('[data-order-detail]');
    if (orderDetailButton && refs.businessPageContent.contains(orderDetailButton)) {
      orderDetailId = orderDetailButton.getAttribute('data-order-detail') || '';
      App.navigation.showPage('order-detail', { scrollTop: true });
      return;
    }

    const orderEditButton = event.target.closest('[data-order-edit]');
    if (orderEditButton && refs.businessPageContent.contains(orderEditButton)) {
      orderEditingId = orderEditButton.getAttribute('data-order-edit') || '';
      orderDraftNote = `正在编辑订单 ${orderEditingId}`;
      orderModalOpen = true;
      render('order-management');
      refs.businessPageContent?.querySelector('[data-order-field="customer"]')?.focus();
      return;
    }

    const orderDetailBackButton = event.target.closest('[data-order-detail-back]');
    if (orderDetailBackButton && refs.businessPageContent.contains(orderDetailBackButton)) {
      orderDetailId = '';
      App.navigation.showPage('order-management', { scrollTop: true });
      return;
    }

    const customerDetailButton = event.target.closest('[data-customer-detail]');
    if (customerDetailButton && refs.businessPageContent.contains(customerDetailButton)) {
      customerDetailCode = customerDetailButton.getAttribute('data-customer-detail') || '';
      App.navigation.showPage('customer-detail', { scrollTop: true });
      return;
    }

    const customerDetailBackButton = event.target.closest('[data-customer-detail-back]');
    if (customerDetailBackButton && refs.businessPageContent.contains(customerDetailBackButton)) {
      customerDetailCode = '';
      App.navigation.showPage('customer-archive', { scrollTop: true });
      return;
    }

    const orderStatusButton = event.target.closest('[data-order-status]');
    if (orderStatusButton && refs.businessPageContent.contains(orderStatusButton)) {
      const id = orderStatusButton.getAttribute('data-order-status') || '';
      const nextStatus = orderStatusButton.getAttribute('data-order-next-status') || '';
      if (updateOrderStatus(id, nextStatus)) render('order-management');
      return;
    }

    const productionStatusButton = event.target.closest('[data-production-status]');
    if (productionStatusButton && refs.businessPageContent.contains(productionStatusButton)) {
      const id = productionStatusButton.getAttribute('data-production-status') || '';
      const nextStatus = productionStatusButton.getAttribute('data-order-next-status') || '';
      if (updateOrderStatus(id, nextStatus, '已更新生产计划')) render('production-plan');
      return;
    }

    const orderDeleteButton = event.target.closest('[data-order-delete]');
    if (orderDeleteButton && refs.businessPageContent.contains(orderDeleteButton)) {
      await deleteOrder(orderDeleteButton.getAttribute('data-order-delete'));
      render('order-management');
      return;
    }

    const orderSaveButton = event.target.closest('[data-order-save]');
    if (orderSaveButton && refs.businessPageContent.contains(orderSaveButton)) {
      const saved = saveOrder();
      orderModalOpen = !saved;
      if (saved) orderEditingId = '';
      render('order-management');
      return;
    }

    const orderCloseButton = event.target.closest('[data-order-close], [data-order-cancel]');
    if (orderCloseButton && refs.businessPageContent.contains(orderCloseButton)) {
      orderEditingId = '';
      orderDraftNote = '已取消订单编辑';
      orderModalOpen = false;
      render('order-management');
      return;
    }

    const orderModal = event.target.closest('[data-order-modal]');
    if (orderModal && event.target === orderModal) {
      orderEditingId = '';
      orderModalOpen = false;
      render('order-management');
      return;
    }

    const invoiceOrderButton = event.target.closest('[data-invoice-order]');
    if (invoiceOrderButton && refs.businessPageContent.contains(invoiceOrderButton)) {
      invoiceSelectedOrderId = invoiceOrderButton.getAttribute('data-invoice-order') || invoiceSelectedOrderId;
      invoiceScheduleDraftOrderId = '';
      render('invoice-print');
      return;
    }

    const invoiceLineButton = event.target.closest('[data-invoice-line-filter]');
    if (invoiceLineButton && refs.businessPageContent.contains(invoiceLineButton)) {
      invoiceLineFilter = invoiceLineButton.getAttribute('data-invoice-line-filter') || '全部';
      invoiceSelectedOrderId = '';
      invoiceScheduleDraftOrderId = '';
      render('invoice-print');
      return;
    }

    const invoiceViewButton = event.target.closest('[data-invoice-view]');
    if (invoiceViewButton && refs.businessPageContent.contains(invoiceViewButton)) {
      const nextView = invoiceViewButton.getAttribute('data-invoice-view') || 'material';
      invoiceOperationView = nextView === 'screw' ? 'screw' : 'material';
      render('invoice-print');
      return;
    }

    const invoiceScheduleButton = event.target.closest('[data-invoice-schedule]');
    if (invoiceScheduleButton && refs.businessPageContent.contains(invoiceScheduleButton) && !invoiceScheduleButton.disabled) {
      const id = invoiceSelectedOrderId;
      const order = orderRows[getOrderIndex(id)];
      const invoiceScheduleLine = getProductionLineForOrder(order);
      const productionNo = `${invoiceScheduleLine}${invoiceScheduleSequence}`;
      if (hasProductionSlotConflict(id, invoiceScheduleDate, productionNo)) {
        notifyAction(`排产号 ${productionNo} 在 ${invoiceScheduleDate} 已被占用`, 'warn', `invoice-schedule-conflict:${productionNo}`);
        render('invoice-print');
        return;
      }
      if (updateOrderStatus(id, '已安排', '已安排开单订单', {
        productionDate: invoiceScheduleDate,
        productionNo,
      })) {
        invoiceSelectedOrderId = orderRows.find((item) => (
          item.status === '待处理'
          && (invoiceLineFilter === '全部' || String(getRecipeForOrder(item).line || 'A') === invoiceLineFilter)
        ))?.id || '';
        invoiceScheduleDraftOrderId = '';
        render('invoice-print');
      }
      return;
    }

    const invoicePrintButton = event.target.closest('[data-invoice-print]');
    if (invoicePrintButton && refs.businessPageContent.contains(invoicePrintButton)) {
      const printed = printInvoiceOperationSheet();
      if (!printed) notifyAction('暂无可打印的操作图', 'warn', 'invoice-print');
      return;
    }

    const invoiceExportButton = event.target.closest('[data-invoice-export]');
    if (invoiceExportButton && refs.businessPageContent.contains(invoiceExportButton)) {
      const exported = downloadInvoiceOperationImage();
      notifyAction(exported ? '生产操作图已导出' : '暂无可导出的开单数据', exported ? 'success' : 'warn', 'invoice-export');
      return;
    }

    const formulaStatCard = event.target.closest('[data-formula-stat-page]');
    if (formulaStatCard && refs.businessPageContent.contains(formulaStatCard)) {
      const pageId = formulaStatCard.getAttribute('data-formula-stat-page') || '';
      if (pageId) App.navigation?.showPage?.(pageId);
      return;
    }

    const inventoryPagePrev = event.target.closest('[data-inventory-page-prev]');
    if (inventoryPagePrev && refs.businessPageContent.contains(inventoryPagePrev) && !inventoryPagePrev.disabled) {
      inventoryListPage -= 1;
      render('inventory-management');
      return;
    }

    const inventoryPageNext = event.target.closest('[data-inventory-page-next]');
    if (inventoryPageNext && refs.businessPageContent.contains(inventoryPageNext) && !inventoryPageNext.disabled) {
      inventoryListPage += 1;
      render('inventory-management');
      return;
    }

    const supplierPagePrev = event.target.closest('[data-supplier-page-prev]');
    if (supplierPagePrev && refs.businessPageContent.contains(supplierPagePrev) && !supplierPagePrev.disabled) {
      supplierListPage -= 1;
      render('supplier-archive');
      return;
    }

    const supplierPageNext = event.target.closest('[data-supplier-page-next]');
    if (supplierPageNext && refs.businessPageContent.contains(supplierPageNext) && !supplierPageNext.disabled) {
      supplierListPage += 1;
      render('supplier-archive');
      return;
    }

    const procurementPagePrev = event.target.closest('[data-procurement-page-prev]');
    if (procurementPagePrev && refs.businessPageContent.contains(procurementPagePrev) && !procurementPagePrev.disabled) {
      procurementListPage -= 1;
      render('raw-material-procurement');
      return;
    }

    const procurementPageNext = event.target.closest('[data-procurement-page-next]');
    if (procurementPageNext && refs.businessPageContent.contains(procurementPageNext) && !procurementPageNext.disabled) {
      procurementListPage += 1;
      render('raw-material-procurement');
      return;
    }

    const archivePagePrev = event.target.closest('[data-archive-page-prev]');
    if (archivePagePrev && refs.businessPageContent.contains(archivePagePrev) && !archivePagePrev.disabled) {
      const kind = archivePagePrev.getAttribute('data-archive-page-prev');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.page -= 1;
      render(config.pageId);
      return;
    }

    const archivePageNext = event.target.closest('[data-archive-page-next]');
    if (archivePageNext && refs.businessPageContent.contains(archivePageNext) && !archivePageNext.disabled) {
      const kind = archivePageNext.getAttribute('data-archive-page-next');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.page += 1;
      render(config.pageId);
      return;
    }

    const formulaPagePrev = event.target.closest('[data-formula-page-prev]');
    if (formulaPagePrev && refs.businessPageContent.contains(formulaPagePrev) && !formulaPagePrev.disabled) {
      formulaListPage -= 1;
      render('formula-management');
      return;
    }

    const formulaPageNext = event.target.closest('[data-formula-page-next]');
    if (formulaPageNext && refs.businessPageContent.contains(formulaPageNext) && !formulaPageNext.disabled) {
      formulaListPage += 1;
      render('formula-management');
      return;
    }

    const formulaBackButton = event.target.closest('[data-formula-back-list]');
    if (formulaBackButton && refs.businessPageContent.contains(formulaBackButton)) {
      await handleFormulaBackToList();
      return;
    }

    const formulaLibraryToggle = event.target.closest('[data-formula-toggle-library]');
    if (formulaLibraryToggle && refs.businessPageContent.contains(formulaLibraryToggle)) {
      formulaLibraryCollapsed = !formulaLibraryCollapsed;
      const layout = refs.businessPageContent.querySelector('.biz-formula-editor-layout');
      const library = refs.businessPageContent.querySelector('.biz-formula-library');
      PublicApp?.animations?.setClass?.(layout, 'is-library-collapsed', formulaLibraryCollapsed)
        ?? layout?.classList.toggle('is-library-collapsed', formulaLibraryCollapsed);
      library?.setAttribute('aria-hidden', String(formulaLibraryCollapsed));
      if (formulaLibraryCollapsed) {
        PublicApp?.motionEffects?.exitToRight?.(library, { duration: 0.22 });
      } else {
        PublicApp?.motionEffects?.enterFromRight?.(library, { duration: 0.24 });
      }
      formulaLibraryToggle.setAttribute('aria-pressed', String(formulaLibraryCollapsed));
      const icon = formulaLibraryToggle.querySelector('i');
      const label = formulaLibraryToggle.querySelector('span');
      if (icon) icon.className = `ti ${formulaLibraryCollapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-right-collapse'}`;
      if (label) label.textContent = formulaLibraryCollapsed ? '展开侧边' : '收起侧边';
      return;
    }

    const formulaNewButton = event.target.closest('[data-formula-new]');
    if (formulaNewButton && refs.businessPageContent.contains(formulaNewButton)) {
      createFormulaRecipe();
      render('formula-management');
      return;
    }

    const formulaEditButton = event.target.closest('[data-formula-edit]');
    if (formulaEditButton && refs.businessPageContent.contains(formulaEditButton)) {
      const nextRecipeId = formulaEditButton.getAttribute('data-formula-edit') || activeFormulaId;
      const nextRecipe = formulaRecipes.find((recipe) => recipe.id === nextRecipeId);
      if (nextRecipe) beginFormulaEdit(nextRecipe);
      render('formula-management');
      return;
    }

    const formulaDeleteButton = event.target.closest('[data-formula-delete]');
    if (formulaDeleteButton && refs.businessPageContent.contains(formulaDeleteButton)) {
      await deleteFormulaRecipe(formulaDeleteButton.getAttribute('data-formula-delete'));
      render('formula-management');
      return;
    }

    const formulaSaveButton = event.target.closest('[data-formula-save]');
    if (formulaSaveButton && refs.businessPageContent.contains(formulaSaveButton)) {
      saveActiveFormulaVersion();
      render('formula-management');
      return;
    }

    const formulaRemoveButton = event.target.closest('[data-formula-remove-index]');
    if (formulaRemoveButton && refs.businessPageContent.contains(formulaRemoveButton)) {
      const materialIndex = Number(formulaRemoveButton.getAttribute('data-formula-remove-index'));
      const recipe = getActiveFormula();
      const material = recipe?.materials?.[materialIndex];
      const confirmed = await App.confirmDialog?.confirmDelete?.({
        title: '移除配方材料',
        message: `确认从当前配方中移除「${material?.name || '该材料行'}」？`,
        confirmText: '确认移除',
      });
      if (!confirmed) return;
      removeActiveFormulaMaterial(materialIndex);
      render('formula-management');
      return;
    }

    const formulaAddPortRowButton = event.target.closest('[data-formula-add-port-row]');
    if (formulaAddPortRowButton && refs.businessPageContent.contains(formulaAddPortRowButton)) {
      const afterIndex = formulaAddPortRowButton.hasAttribute('data-formula-add-after-index')
        ? Number(formulaAddPortRowButton.getAttribute('data-formula-add-after-index'))
        : null;
      addActiveFormulaMaterialRow(Number(formulaAddPortRowButton.getAttribute('data-formula-add-port-row')), afterIndex);
      render('formula-management');
      return;
    }

    const formulaSelectMaterialButton = event.target.closest('[data-formula-select-material-index]');
    if (formulaSelectMaterialButton && refs.businessPageContent.contains(formulaSelectMaterialButton)) {
      activeFormulaMaterialIndex = Number(formulaSelectMaterialButton.getAttribute('data-formula-select-material-index'));
      syncFormulaActiveRowState();
      syncFormulaMaterialLibraryState();
      return;
    }

    const formulaEmptyRow = event.target.closest('[data-formula-empty-port]');
    const isFormulaEmptyRowControl = event.target.closest('button, input, select, textarea, label');
    if (formulaEmptyRow && refs.businessPageContent.contains(formulaEmptyRow) && !isFormulaEmptyRowControl) {
      addActiveFormulaMaterialRow(Number(formulaEmptyRow.getAttribute('data-formula-empty-port')));
      render('formula-management');
      return;
    }

    const formulaRow = event.target.closest('[data-formula-row-index]');
    const isFormulaRowControl = event.target.closest('button, input, select, textarea, label');
    if (formulaRow && refs.businessPageContent.contains(formulaRow) && !isFormulaRowControl) {
      activeFormulaMaterialIndex = Number(formulaRow.getAttribute('data-formula-row-index'));
      syncFormulaActiveRowState();
      syncFormulaMaterialLibraryState();
      return;
    }

    const formulaAddCard = event.target.closest('[data-formula-add-material]');
    if (formulaAddCard && refs.businessPageContent.contains(formulaAddCard) && formulaAddCard.getAttribute('aria-disabled') !== 'true') {
      const materialName = formulaAddCard.getAttribute('data-formula-add-material');
      const recipe = getActiveFormula();
      const isUsed = recipe?.materials?.some((item) => item.name === materialName);
      if (isUsed) {
        const confirmed = await App.confirmDialog?.confirmDelete?.({
          title: '移除配方材料',
          message: `确认从当前配方中移除「${materialName}」？`,
          confirmText: '确认移除',
        });
        if (!confirmed) return;
        removeActiveFormulaMaterialByName(materialName);
      } else if (Number.isInteger(activeFormulaMaterialIndex) && recipe?.materials?.[activeFormulaMaterialIndex]) {
        assignActiveFormulaMaterial(activeFormulaMaterialIndex, materialName);
      } else {
        addActiveFormulaMaterial(materialName);
      }
      refreshFormulaBuilderPanel();
      syncFormulaMaterialLibraryState();
      return;
    }

    const formulaButton = event.target.closest('[data-formula-id]');
    if (formulaButton && refs.businessPageContent.contains(formulaButton)) {
      activeFormulaId = formulaButton.getAttribute('data-formula-id') || activeFormulaId;
      activeFormulaMaterialIndex = null;
      render('formula-management');
      return;
    }

    const categoryButton = event.target.closest('[data-inventory-category]');
    if (categoryButton && refs.businessPageContent.contains(categoryButton)) {
      inventoryCategory = categoryButton.getAttribute('data-inventory-category') || '全部';
      inventoryListPage = 1;
      render('inventory-management');
      return;
    }

    const inventoryOpenCategoryModalButton = event.target.closest('[data-inventory-open-category-modal]');
    if (inventoryOpenCategoryModalButton && refs.businessPageContent.contains(inventoryOpenCategoryModalButton)) {
      inventoryCategoryModalOpen = true;
      inventoryEditingCategory = inventoryCategory === '全部' ? '' : inventoryCategory;
      render('inventory-management');
      refs.businessPageContent?.querySelector('[data-inventory-category-name]')?.focus();
      return;
    }

    const inventoryCloseCategoryModalButton = event.target.closest('[data-inventory-close-category-modal]');
    if (inventoryCloseCategoryModalButton && refs.businessPageContent.contains(inventoryCloseCategoryModalButton)) {
      inventoryCategoryModalOpen = false;
      inventoryEditingCategory = '';
      render('inventory-management');
      return;
    }

    const inventoryCategoryModal = event.target.closest('[data-inventory-category-modal]');
    if (inventoryCategoryModal && event.target === inventoryCategoryModal) {
      inventoryCategoryModalOpen = false;
      inventoryEditingCategory = '';
      render('inventory-management');
      return;
    }

    const inventoryEditCategoryButton = event.target.closest('[data-inventory-edit-category]');
    if (inventoryEditCategoryButton && refs.businessPageContent.contains(inventoryEditCategoryButton)) {
      inventoryEditingCategory = inventoryEditCategoryButton.getAttribute('data-inventory-edit-category') || '';
      render('inventory-management');
      refs.businessPageContent?.querySelector('[data-inventory-category-name]')?.focus();
      return;
    }

    const inventoryNewMaterialButton = event.target.closest('[data-inventory-new-material]');
    if (inventoryNewMaterialButton && refs.businessPageContent.contains(inventoryNewMaterialButton)) {
      inventoryEditingMaterialName = '';
      inventoryDraftNote = '正在新增材料';
      inventoryMaterialModalOpen = true;
      render('inventory-management');
      refs.businessPageContent?.querySelector('[data-inventory-material-field="name"]')?.focus();
      return;
    }

    const inventorySaveMaterialButton = event.target.closest('[data-inventory-save-material]');
    if (inventorySaveMaterialButton && refs.businessPageContent.contains(inventorySaveMaterialButton)) {
      const saved = saveInventoryMaterial();
      inventoryMaterialModalOpen = !saved;
      render('inventory-management');
      if (!saved) refs.businessPageContent?.querySelector('[data-inventory-material-field="name"]')?.focus();
      return;
    }

    const inventoryCancelMaterialButton = event.target.closest('[data-inventory-cancel-material]');
    if (inventoryCancelMaterialButton && refs.businessPageContent.contains(inventoryCancelMaterialButton)) {
      inventoryEditingMaterialName = '';
      inventoryDraftNote = '已取消材料编辑';
      inventoryMaterialModalOpen = false;
      render('inventory-management');
      return;
    }

    const inventoryEditMaterialButton = event.target.closest('[data-inventory-edit-material]');
    if (inventoryEditMaterialButton && refs.businessPageContent.contains(inventoryEditMaterialButton)) {
      inventoryEditingMaterialName = inventoryEditMaterialButton.getAttribute('data-inventory-edit-material') || '';
      inventoryDraftNote = `正在编辑材料 ${inventoryEditingMaterialName}`;
      inventoryMaterialModalOpen = true;
      render('inventory-management');
      refs.businessPageContent?.querySelector('[data-inventory-material-field="name"]')?.focus();
      return;
    }

    const inventoryCloseMaterialModalButton = event.target.closest('[data-inventory-close-material-modal]');
    if (inventoryCloseMaterialModalButton && refs.businessPageContent.contains(inventoryCloseMaterialModalButton)) {
      inventoryEditingMaterialName = '';
      inventoryMaterialModalOpen = false;
      render('inventory-management');
      return;
    }

    const inventoryMaterialModal = event.target.closest('[data-inventory-material-modal]');
    if (inventoryMaterialModal && event.target === inventoryMaterialModal) {
      inventoryEditingMaterialName = '';
      inventoryMaterialModalOpen = false;
      render('inventory-management');
      return;
    }

    const inventoryDeleteMaterialButton = event.target.closest('[data-inventory-delete-material]');
    if (inventoryDeleteMaterialButton && refs.businessPageContent.contains(inventoryDeleteMaterialButton)) {
      await deleteInventoryMaterial(inventoryDeleteMaterialButton.getAttribute('data-inventory-delete-material') || '');
      render('inventory-management');
      return;
    }

    const supplierNewButton = event.target.closest('[data-supplier-new]');
    if (supplierNewButton && refs.businessPageContent.contains(supplierNewButton)) {
      supplierEditingCode = '';
      supplierDraftNote = '正在新增供应商';
      supplierModalOpen = true;
      render('supplier-archive');
      refs.businessPageContent?.querySelector('[data-supplier-field="name"]')?.focus();
      return;
    }

    const supplierEditButton = event.target.closest('[data-supplier-edit]');
    if (supplierEditButton && refs.businessPageContent.contains(supplierEditButton)) {
      supplierEditingCode = supplierEditButton.getAttribute('data-supplier-edit') || '';
      supplierDraftNote = `正在编辑供应商 ${getSupplierByCode(supplierEditingCode)?.name || supplierEditingCode}`;
      supplierModalOpen = true;
      render('supplier-archive');
      refs.businessPageContent?.querySelector('[data-supplier-field="name"]')?.focus();
      return;
    }

    const supplierDeleteButton = event.target.closest('[data-supplier-delete]');
    if (supplierDeleteButton && refs.businessPageContent.contains(supplierDeleteButton)) {
      await deleteSupplier(supplierDeleteButton.getAttribute('data-supplier-delete') || '');
      render('supplier-archive');
      return;
    }

    const supplierSaveButton = event.target.closest('[data-supplier-save]');
    if (supplierSaveButton && refs.businessPageContent.contains(supplierSaveButton)) {
      const saved = saveSupplier();
      supplierModalOpen = !saved;
      render('supplier-archive');
      if (!saved) refs.businessPageContent?.querySelector('[data-supplier-field="name"]')?.focus();
      return;
    }

    const supplierCloseButton = event.target.closest('[data-supplier-close], [data-supplier-cancel]');
    if (supplierCloseButton && refs.businessPageContent.contains(supplierCloseButton)) {
      supplierEditingCode = '';
      supplierModalOpen = false;
      supplierDraftNote = '已取消供应商编辑';
      render('supplier-archive');
      return;
    }

    const supplierModal = event.target.closest('[data-supplier-modal]');
    if (supplierModal && event.target === supplierModal) {
      supplierEditingCode = '';
      supplierModalOpen = false;
      render('supplier-archive');
      return;
    }

    const supplierDetailButton = event.target.closest('[data-supplier-detail]');
    if (supplierDetailButton && refs.businessPageContent.contains(supplierDetailButton)) {
      supplierDetailCode = supplierDetailButton.getAttribute('data-supplier-detail') || '';
      App.navigation.showPage('supplier-detail', { scrollTop: true });
      return;
    }

    const supplierDetailFromProcurementButton = event.target.closest('[data-supplier-detail-from-procurement]');
    if (supplierDetailFromProcurementButton && refs.businessPageContent.contains(supplierDetailFromProcurementButton)) {
      supplierDetailCode = supplierDetailFromProcurementButton.getAttribute('data-supplier-detail-from-procurement') || '';
      App.navigation.showPage('supplier-detail', { scrollTop: true });
      return;
    }

    const supplierDetailBackButton = event.target.closest('[data-supplier-detail-back]');
    if (supplierDetailBackButton && refs.businessPageContent.contains(supplierDetailBackButton)) {
      supplierDetailCode = '';
      App.navigation.showPage('supplier-archive', { scrollTop: true });
      return;
    }

    const procurementNewButton = event.target.closest('[data-procurement-new]');
    if (procurementNewButton && refs.businessPageContent.contains(procurementNewButton)) {
      procurementEditingId = '';
      procurementDraftNote = '正在新增采购记录';
      procurementModalOpen = true;
      render('raw-material-procurement');
      refs.businessPageContent?.querySelector('[data-procurement-field="material"]')?.focus();
      return;
    }

    const procurementEditButton = event.target.closest('[data-procurement-edit]');
    if (procurementEditButton && refs.businessPageContent.contains(procurementEditButton)) {
      procurementEditingId = procurementEditButton.getAttribute('data-procurement-edit') || '';
      procurementDraftNote = `正在编辑采购记录 ${procurementEditingId}`;
      procurementModalOpen = true;
      render('raw-material-procurement');
      refs.businessPageContent?.querySelector('[data-procurement-field="material"]')?.focus();
      return;
    }

    const procurementDeleteButton = event.target.closest('[data-procurement-delete]');
    if (procurementDeleteButton && refs.businessPageContent.contains(procurementDeleteButton)) {
      await deleteProcurement(procurementDeleteButton.getAttribute('data-procurement-delete') || '');
      render('raw-material-procurement');
      return;
    }

    const procurementSaveButton = event.target.closest('[data-procurement-save]');
    if (procurementSaveButton && refs.businessPageContent.contains(procurementSaveButton)) {
      const saved = saveProcurement();
      procurementModalOpen = !saved;
      render('raw-material-procurement');
      if (!saved) refs.businessPageContent?.querySelector('[data-procurement-field="material"]')?.focus();
      return;
    }

    const procurementCloseButton = event.target.closest('[data-procurement-close], [data-procurement-cancel]');
    if (procurementCloseButton && refs.businessPageContent.contains(procurementCloseButton)) {
      procurementEditingId = '';
      procurementModalOpen = false;
      procurementDraftNote = '已取消采购编辑';
      render('raw-material-procurement');
      return;
    }

    const procurementModal = event.target.closest('[data-procurement-modal]');
    if (procurementModal && event.target === procurementModal) {
      procurementEditingId = '';
      procurementModalOpen = false;
      render('raw-material-procurement');
      return;
    }

    const archiveNewButton = event.target.closest('[data-archive-new]');
    if (archiveNewButton && refs.businessPageContent.contains(archiveNewButton)) {
      const kind = archiveNewButton.getAttribute('data-archive-new');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.editingCode = '';
      state.draftNote = `正在新增${config.entityName}`;
      state.modalOpen = true;
      render(config.pageId);
      refs.businessPageContent?.querySelector('[data-archive-field="name"]')?.focus();
      return;
    }

    const archiveEditButton = event.target.closest('[data-archive-edit]');
    if (archiveEditButton && refs.businessPageContent.contains(archiveEditButton)) {
      const kind = archiveEditButton.getAttribute('data-archive-edit');
      const code = archiveEditButton.getAttribute('data-archive-code') || '';
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.editingCode = code;
      state.draftNote = `正在编辑${config.entityName} ${getArchiveByCode(kind, code)?.name || code}`;
      state.modalOpen = true;
      render(config.pageId);
      refs.businessPageContent?.querySelector('[data-archive-field="name"]')?.focus();
      return;
    }

    const archiveDeleteButton = event.target.closest('[data-archive-delete]');
    if (archiveDeleteButton && refs.businessPageContent.contains(archiveDeleteButton)) {
      const kind = archiveDeleteButton.getAttribute('data-archive-delete');
      const config = archiveConfigs[kind];
      if (!config) return;
      await deleteArchiveRecord(kind, archiveDeleteButton.getAttribute('data-archive-code') || '');
      render(config.pageId);
      return;
    }

    const archiveSaveButton = event.target.closest('[data-archive-save]');
    if (archiveSaveButton && refs.businessPageContent.contains(archiveSaveButton)) {
      const kind = archiveSaveButton.getAttribute('data-archive-save');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      const saved = saveArchiveRecord(kind);
      state.modalOpen = !saved;
      render(config.pageId);
      if (!saved) refs.businessPageContent?.querySelector('[data-archive-field="name"]')?.focus();
      return;
    }

    const archiveCloseButton = event.target.closest('[data-archive-close], [data-archive-cancel]');
    if (archiveCloseButton && refs.businessPageContent.contains(archiveCloseButton)) {
      const kind = archiveCloseButton.getAttribute('data-archive-close') || archiveCloseButton.getAttribute('data-archive-cancel');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.editingCode = '';
      state.modalOpen = false;
      state.draftNote = `已取消${config.entityName}编辑`;
      render(config.pageId);
      return;
    }

    const archiveModal = event.target.closest('[data-archive-modal]');
    if (archiveModal && event.target === archiveModal) {
      const kind = archiveModal.getAttribute('data-archive-modal');
      const config = archiveConfigs[kind];
      const state = archiveStates[kind];
      if (!config || !state) return;
      state.editingCode = '';
      state.modalOpen = false;
      render(config.pageId);
      return;
    }

    const inventorySaveCategoryButton = event.target.closest('[data-inventory-save-category]');
    if (inventorySaveCategoryButton && refs.businessPageContent.contains(inventorySaveCategoryButton)) {
      saveInventoryCategory();
      inventoryCategoryModalOpen = true;
      render('inventory-management');
      return;
    }

    const inventoryCancelCategoryButton = event.target.closest('[data-inventory-cancel-category]');
    if (inventoryCancelCategoryButton && refs.businessPageContent.contains(inventoryCancelCategoryButton)) {
      inventoryEditingCategory = '';
      inventoryDraftNote = '已取消分类编辑';
      inventoryCategoryModalOpen = true;
      render('inventory-management');
      return;
    }

    const inventoryDeleteCategoryButton = event.target.closest('[data-inventory-delete-category]');
    if (inventoryDeleteCategoryButton && refs.businessPageContent.contains(inventoryDeleteCategoryButton)) {
      await deleteInventoryCategory(inventoryDeleteCategoryButton.getAttribute('data-inventory-delete-category') || '');
      inventoryCategoryModalOpen = true;
      render('inventory-management');
    }

    /* Dashboard quick action buttons */
    const quickBtn = event.target.closest('[data-quick]');
    if (quickBtn && refs.businessPageContent.contains(quickBtn)) {
      const action = quickBtn.getAttribute('data-quick') || '';
      const quickTargets = {
        order: 'order-management',
        produce: 'production-plan',
        quality: 'property-analysis',
        report: 'property-analysis',
      };
      const targetPage = quickTargets[action];
      if (targetPage) {
        App.navigation?.showPage?.(targetPage);
      }
      return;
    }
  });

  refs.businessPageContent?.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.key === 'Escape' && inventoryMaterialModalOpen) {
      inventoryEditingMaterialName = '';
      inventoryMaterialModalOpen = false;
      render('inventory-management');
      return;
    }
    if (event.key === 'Escape' && inventoryCategoryModalOpen) {
      inventoryCategoryModalOpen = false;
      inventoryEditingCategory = '';
      render('inventory-management');
      return;
    }
    if (event.key === 'Escape' && supplierModalOpen) {
      supplierEditingCode = '';
      supplierModalOpen = false;
      render('supplier-archive');
      return;
    }
    if (event.key === 'Escape' && procurementModalOpen) {
      procurementEditingId = '';
      procurementModalOpen = false;
      render('raw-material-procurement');
      return;
    }
    const openArchiveKind = Object.keys(archiveStates).find((kind) => archiveStates[kind].modalOpen);
    if (event.key === 'Escape' && openArchiveKind) {
      archiveStates[openArchiveKind].editingCode = '';
      archiveStates[openArchiveKind].modalOpen = false;
      render(archiveConfigs[openArchiveKind].pageId);
      return;
    }
    const formulaStatCard = event.target.closest('[data-formula-stat-page]');
    if (formulaStatCard && refs.businessPageContent.contains(formulaStatCard)) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      formulaStatCard.click();
      return;
    }
    const formulaAddCard = event.target.closest('[data-formula-add-material]');
    if (!formulaAddCard || !refs.businessPageContent.contains(formulaAddCard)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    formulaAddCard.click();
  });

  App.businessPages = { render, createFormulaByAgent };
})();
