
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const productionQueueStatuses = ['已安排', '生产中', '已完成'];
const closedOrderStatuses = ['已完成', '已发货', '已结清'];
const activeCustomerStatuses = ['正常服务', '样品跟进', '账期复核'];
const riskyInventoryStatuses = ['预警', '紧急', '锁库中', '待检', '待确认'];
const settledProcurementStatuses = ['已入库', '已质检', '已结算'];
const barColors = ['#06b6d4', '#0891b2', '#0e7490', '#06b6d4', '#0891b2', '#0e7490', '#06b6d4'];

const getToday = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const addDays = (dateText, offset) => {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getWeekdayLabel = (dateText) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${dateText}T00:00:00`).getDay()];
const getOrderAmount = (order) => Number(order?.quantity || 0) * Number(order?.unitPrice || 0);
const formatWan = (value) => (Number(value || 0) / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN');
const formatPercent = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);
const getBarHeightPercent = (value, chartMax) => {
  const percent = (Number(value) / Math.max(1, Number(chartMax) || 0)) * 100;
  return Number.isFinite(percent) ? Math.max(4, percent) : 4;
};
const getOrderDateCode = (order) => String(order?.id || '').match(/\d{8}/)?.[0] || '';
const toDateCode = (dateText) => String(dateText || '').replace(/-/g, '');
const isTodayOrder = (order, today) => getOrderDateCode(order) === toDateCode(today) || order?.deliveryDate === today;
const isOpenOrder = (order) => !closedOrderStatuses.includes(order?.status);
const getInventoryStatus = (row) => String(row?.[5] || '').trim();
const getInventoryName = (row) => String(row?.[0] || '').trim();
const getInventoryStock = (row) => String(row?.[4] || '--').trim() || '--';
const getInventoryUnit = (row) => String(row?.[6] || '').trim();
const getDateOnly = (value) => {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
};
const isWithinRecentDays = (value, today, days) => {
  const dateText = getDateOnly(value);
  if (!dateText) return false;
  return dateText >= addDays(today, -(days - 1)) && dateText <= today;
};

const buildDashboardData = (state = {} as any) => {
  const today = getToday();
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const inventoryRows = Array.isArray(state.inventoryRows) ? state.inventoryRows : [];
  const procurements = Array.isArray(state.procurements) ? state.procurements : [];
  const customers = Array.isArray(state.customers) ? state.customers : [];
  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const orderLogs = Array.isArray(state.orderLogs) ? state.orderLogs : [];
  const productionOrders = orders.filter((order) => productionQueueStatuses.includes(order.status));
  const openOrders = orders.filter(isOpenOrder);
  const todayOrders = orders.filter((order) => isTodayOrder(order, today));
  const yesterday = addDays(today, -1);
  const yesterdayOrders = orders.filter((order) => isTodayOrder(order, yesterday));
  const todayRevenue = todayOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const yesterdayRevenue = yesterdayOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const pendingOrders = orders.filter((order) => order.status === '待处理');
  const urgentOrders = openOrders.filter((order) => order.deliveryDate && order.deliveryDate <= addDays(today, 3));
  const riskyInventory = inventoryRows.filter((row) => riskyInventoryStatuses.includes(getInventoryStatus(row)));
  const activeCustomers = customers.filter((customer) => activeCustomerStatuses.includes(customer.status));
  const newCustomers = customers.filter((customer) => isWithinRecentDays(customer.createdAt || customer.updatedAt || customer.date, today, 7));
  const completedProduction = productionOrders.filter((order) => order.status === '已完成').length;
  const productionDoneRate = formatPercent(completedProduction, productionOrders.length);
  const recent7Days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const chartRows = recent7Days.map((dateText, index) => ({
    label: getWeekdayLabel(dateText),
    value: orders.filter((order) => order.deliveryDate === dateText || getOrderDateCode(order) === toDateCode(dateText)).length,
    color: barColors[index],
  }));
  const chartMax = Math.max(1, ...chartRows.map((item) => item.value));
  const productionStatus = [
    { key: 'running', label: '生产中', count: productionOrders.filter((order) => order.status === '生产中').length, icon: 'ti-player-play-filled', className: 'running' },
    { key: 'queued', label: '待排产', count: pendingOrders.length, icon: 'ti-clock-filled', className: 'queued' },
    { key: 'review', label: '待确认', count: orders.filter((order) => order.status === '已安排').length, icon: 'ti-zoom-check-filled', className: 'review' },
    { key: 'done', label: '已完成', count: completedProduction, icon: 'ti-circle-check-filled', className: 'done' },
  ];
  const productionTotal = productionStatus.reduce((sum, item) => sum + item.count, 0);
  const pendingProcurements = procurements.filter((item) => !settledProcurementStatuses.includes(item.status));
  const overdueOrders = openOrders.filter((order) => order.deliveryDate && order.deliveryDate < today);

  const todos = [
    ...overdueOrders.map((order) => ({
      title: `处理逾期订单 ${order.id}`,
      detail: `${order.customer || '客户'} · ${order.deliveryDate}`,
      tag: '逾期',
      urgent: true,
    })),
    ...urgentOrders.map((order) => ({
      title: `确认订单 ${order.id} 交期`,
      detail: `${order.customer || '客户'} · ${order.deliveryDate}`,
      tag: order.status,
      urgent: order.deliveryDate <= today,
    })),
    ...riskyInventory.map((row) => ({
      title: `核对库存 ${getInventoryName(row)}`,
      detail: `${getInventoryStock(row)}${getInventoryUnit(row)} · ${getInventoryStatus(row)}`,
      tag: getInventoryStatus(row),
      urgent: ['紧急', '预警'].includes(getInventoryStatus(row)),
    })),
    ...pendingProcurements.map((item) => ({
      title: `跟进采购 ${item.id}`,
      detail: `${item.supplier || '供应商'} · ${item.material || '物料'}`,
      tag: item.status,
      urgent: false,
    })),
  ].slice(0, 3);

  const risks = [
    overdueOrders.length && {
      tone: 'danger',
      title: '逾期订单',
      detail: `${overdueOrders.slice(0, 2).map((order) => order.id).join('、')} 等订单已超过交期`,
      count: overdueOrders.length,
    },
    urgentOrders.length && {
      tone: 'danger',
      title: '交期临近',
      detail: `${urgentOrders.slice(0, 2).map((order) => order.id).join('、')} 需确认排产`,
      count: urgentOrders.length,
    },
    riskyInventory.length && {
      tone: riskyInventory.some((row) => getInventoryStatus(row) === '紧急') ? 'danger' : 'warn',
      title: '库存风险',
      detail: `${riskyInventory.slice(0, 2).map(getInventoryName).join('、')} 需要处理`,
      count: riskyInventory.length,
    },
    pendingProcurements.length && {
      tone: 'warn',
      title: '采购待闭环',
      detail: `${pendingProcurements.slice(0, 2).map((item) => item.id).join('、')} 尚未入库结算`,
      count: pendingProcurements.length,
    },
    suppliers.filter((supplier) => supplier.status === '暂停合作').length && {
      tone: 'info',
      title: '供应商暂停',
      detail: '存在暂停合作供应商，请确认替代供货',
      count: suppliers.filter((supplier) => supplier.status === '暂停合作').length,
    },
  ].filter(Boolean).slice(0, 5);

  const recentLogs = orderLogs
    .slice()
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 4)
    .map((log) => {
      const order = orders.find((item) => item.id === log.orderId) || {};
      return {
        time: String(log.timestamp || '').slice(11, 16) || '--:--',
        title: `订单 ${log.orderId || '--'} 更新为${log.toStatus || '新状态'}`,
        detail: `${order.customer || '客户'} · ${order.formula || '配方'} · ${formatNumber(order.quantity)}kg`,
      };
    });
  const recentOrders = orders.slice(0, 4).map((order) => ({
    time: order.deliveryDate || today,
    title: `订单 ${order.id} · ${order.status}`,
    detail: `${order.customer || '客户'} · ${order.formula || '配方'} · ${formatNumber(order.quantity)}kg`,
  }));

  return {
    today,
    kpis: {
      todayOrders: todayOrders.length,
      todayOrdersTrend: todayOrders.length - yesterdayOrders.length,
      todayRevenue,
      revenueTrend: todayRevenue - yesterdayRevenue,
      pendingOrders: pendingOrders.length,
      urgentOrders: urgentOrders.length,
      inventoryRisk: riskyInventory.length,
      inventoryTotal: inventoryRows.length,
      productionDoneRate,
      productionTotal: productionOrders.length,
      activeCustomers: activeCustomers.length,
      newCustomers: newCustomers.length,
    },
    chartRows,
    chartMax,
    productionStatus,
    productionTotal,
    todos,
    risks,
    recent: recentLogs.length ? recentLogs : recentOrders,
  };
};

const renderTrend = (value, positiveText, neutralText = '较昨日持平') => {
  if (value > 0) return `<div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>${escapeHtml(positiveText(value))}</div>`;
  if (value < 0) return `<div class="kpi-trend warn"><i class="ti ti-trending-down" aria-hidden="true"></i>${escapeHtml(`较昨日 ${value}`)}</div>`;
  return `<div class="kpi-trend"><i class="ti ti-minus" aria-hidden="true"></i>${escapeHtml(neutralText)}</div>`;
};

export const renderDashboard = (state = {} as any) => {
  const data = buildDashboardData(state);

  return `
    <section class="biz-dashboard-kpi-row">
      <article class="ui-stat-card biz-dashboard-kpi kpi-orders">
        <div class="kpi-icon-wrap"><i class="ti ti-shopping-cart" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">今日订单</div>
          <div class="kpi-value">${escapeHtml(data.kpis.todayOrders)}<span class="kpi-unit"> 单</span></div>
          ${renderTrend(data.kpis.todayOrdersTrend, (value) => `较昨日 +${value} 单`)}
        </div>
      </article>
      <article class="ui-stat-card biz-dashboard-kpi kpi-revenue">
        <div class="kpi-icon-wrap"><i class="ti ti-currency-yuan" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">今日营收</div>
          <div class="kpi-value">¥${escapeHtml(formatWan(data.kpis.todayRevenue))}<span class="kpi-unit">万</span></div>
          ${renderTrend(Math.round(data.kpis.revenueTrend), (value) => `较昨日 +¥${formatWan(value)}万`, '较昨日持平')}
        </div>
      </article>
      <article class="ui-stat-card biz-dashboard-kpi kpi-production">
        <div class="kpi-icon-wrap"><i class="ti ti-assembly" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">待排产批次</div>
          <div class="kpi-value">${escapeHtml(data.kpis.pendingOrders)}<span class="kpi-unit"> 批</span></div>
          <div class="kpi-trend warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i>${escapeHtml(data.kpis.urgentOrders)} 批临近交期</div>
        </div>
      </article>
      <article class="ui-stat-card biz-dashboard-kpi kpi-inventory">
        <div class="kpi-icon-wrap"><i class="ti ti-package" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">库存预警</div>
          <div class="kpi-value">${escapeHtml(data.kpis.inventoryRisk)}<span class="kpi-unit"> 项</span></div>
          <div class="kpi-trend ${data.kpis.inventoryRisk ? 'warn' : 'up'}"><i class="ti ${data.kpis.inventoryRisk ? 'ti-alert-triangle' : 'ti-circle-check'}" aria-hidden="true"></i>共 ${escapeHtml(data.kpis.inventoryTotal)} 项物料</div>
        </div>
      </article>
      <article class="ui-stat-card biz-dashboard-kpi kpi-quality">
        <div class="kpi-icon-wrap"><i class="ti ti-checklist" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">生产完成率</div>
          <div class="kpi-value">${escapeHtml(data.kpis.productionDoneRate)}<span class="kpi-unit">%</span></div>
          <div class="kpi-trend up"><i class="ti ti-circle-check" aria-hidden="true"></i>${escapeHtml(data.kpis.productionTotal)} 个排产订单</div>
        </div>
      </article>
      <article class="ui-stat-card biz-dashboard-kpi kpi-customer">
        <div class="kpi-icon-wrap"><i class="ti ti-users" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">活跃客户</div>
          <div class="kpi-value">${escapeHtml(data.kpis.activeCustomers)}<span class="kpi-unit"> 家</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>档案 ${escapeHtml(state.customers?.length || 0)} 家</div>
        </div>
      </article>
    </section>

    <section class="biz-dashboard-workbench">
      <div class="biz-dashboard-primary">
        <article class="ui-panel biz-dashboard-panel biz-chart-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-chart-line" aria-hidden="true"></i>近7天订单趋势</h2>
            <div class="biz-panel-badges">
              <span class="biz-badge is-active">本周</span>
              <span class="biz-badge">${escapeHtml(data.today)}</span>
            </div>
          </div>
          <div class="biz-chart-body">
            <div class="biz-chart-bars">
              ${data.chartRows.map(({ label, value, color }) => `
                <div class="biz-bar-col">
                  <div class="biz-bar-fill" style="height:${getBarHeightPercent(value, data.chartMax)}%;background:${color}"></div>
                  <span class="biz-bar-value">${escapeHtml(value)}</span>
                  <span class="biz-bar-label">${escapeHtml(label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </article>

        <article class="ui-panel biz-dashboard-panel biz-production-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-chart-dots" aria-hidden="true"></i>生产状态概览</h2>
            <span class="biz-panel-meta">共追踪 ${escapeHtml(data.productionTotal)} 批次</span>
          </div>
          <div class="biz-production-status-grid">
            ${data.productionStatus.map((item) => `
              <div class="biz-production-status-card">
                <div class="biz-status-icon ${escapeHtml(item.className)}"><i class="ti ${escapeHtml(item.icon)}" aria-hidden="true"></i></div>
                <div class="biz-status-info">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span class="biz-status-count">${escapeHtml(item.count)} 批</span>
                  <div class="biz-status-bar"><div class="biz-status-fill ${escapeHtml(item.className)}" style="width:${data.productionTotal ? Math.round(item.count / data.productionTotal * 100) : 0}%"></div></div>
                </div>
              </div>
            `).join('')}
          </div>
        </article>

        <section class="biz-dashboard-bottom-grid">
          <article class="ui-panel biz-dashboard-panel biz-todo-panel">
            <div class="biz-panel-head">
              <h2><i class="ti ti-calendar-check" aria-hidden="true"></i>今日待办</h2>
              <span class="biz-panel-meta">${escapeHtml(data.todos.length)} 项</span>
            </div>
            <div class="biz-todo-list">
              ${data.todos.map((todo) => `
                <div class="biz-todo-item ${todo.urgent ? 'urgent' : ''}">
                  <div class="biz-todo-check"><i class="ti ti-circle" aria-hidden="true"></i></div>
                  <div class="biz-todo-body">
                    <strong>${escapeHtml(todo.title)}</strong>
                    <span>${escapeHtml(todo.detail)}</span>
                  </div>
                  <span class="biz-todo-tag ${todo.urgent ? '' : 'normal'}">${escapeHtml(todo.tag)}</span>
                </div>
              `).join('') || '<div class="biz-formula-empty">暂无待办</div>'}
            </div>
          </article>

          <article class="ui-panel biz-dashboard-panel biz-recent-panel">
            <div class="biz-panel-head">
              <h2><i class="ti ti-clock-history" aria-hidden="true"></i>最近动态</h2>
              <span class="biz-panel-meta">来自业务数据</span>
            </div>
            <div class="biz-recent-list">
              ${data.recent.map((item) => `
                <div class="biz-recent-item">
                  <div class="biz-recent-line"></div>
                  <div class="biz-recent-content">
                    <div class="biz-recent-time">${escapeHtml(item.time)}</div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.detail)}</span>
                  </div>
                </div>
              `).join('') || '<div class="biz-formula-empty">暂无动态</div>'}
            </div>
          </article>
        </section>
      </div>

      <aside class="biz-dashboard-aside">
        <article class="ui-panel biz-dashboard-panel biz-risk-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-radar" aria-hidden="true"></i>风险雷达</h2>
            <span class="biz-panel-meta">${escapeHtml(data.risks.length)} 项待处理</span>
          </div>
          <div class="biz-risk-list">
            ${data.risks.map((risk) => `
              <div class="biz-risk-item ${escapeHtml(risk.tone)}">
                <div class="biz-risk-dot"></div>
                <div class="biz-risk-body">
                  <strong>${escapeHtml(risk.title)}</strong>
                  <span>${escapeHtml(risk.detail)}</span>
                </div>
                <span class="biz-risk-count">${escapeHtml(risk.count)}</span>
              </div>
            `).join('') || '<div class="biz-formula-empty">暂无风险</div>'}
          </div>
        </article>

        <article class="ui-panel biz-dashboard-panel biz-quick-actions-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-bolt" aria-hidden="true"></i>快捷操作</h2>
          </div>
          <div class="biz-quick-actions-grid">
            <button class="ui-button biz-qk-btn" type="button" data-quick="order"><i class="ti ti-file-plus" aria-hidden="true"></i>新建订单</button>
            <button class="ui-button biz-qk-btn" type="button" data-quick="produce"><i class="ti ti-assembly" aria-hidden="true"></i>排产</button>
            <button class="ui-button biz-qk-btn" type="button" data-quick="quality"><i class="ti ti-checklist" aria-hidden="true"></i>质检录入</button>
            <button class="ui-button biz-qk-btn" type="button" data-quick="report"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>导出报表</button>
          </div>
        </article>
      </aside>
    </section>
  `;
};
