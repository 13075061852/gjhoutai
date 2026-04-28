(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, utils } = App;
  const esc = (value) => utils.escapeHtml(value);

  const renderStatStrip = (items) => `
    <section class="biz-stat-strip">
      ${items.map(([label, value, note = '']) => `
        <article>
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
          ${note ? `<em>${esc(note)}</em>` : ''}
        </article>
      `).join('')}
    </section>
  `;

  const renderRows = (rows) => rows.map((row) => `
    <tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>
  `).join('');

  const renderTable = (title, columns, rows) => `
    <section class="business-panel biz-table-panel">
      <div class="business-panel-head">
        <h2>${esc(title)}</h2>
        <span>业务数据</span>
      </div>
      <div class="business-table-wrap">
        <table class="business-table">
          <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
          <tbody>${renderRows(rows)}</tbody>
        </table>
      </div>
    </section>
  `;

  const renderDashboard = () => `
    ${renderStatStrip([
      ['今日订单', '36', '+8 单'],
      ['待排产', '12 批', '4 批加急'],
      ['库存预警', '7 项', '2 项紧急'],
      ['质检通过率', '97.8%', '+1.2%'],
    ])}
    <section class="biz-dashboard-grid">
      <article class="business-panel biz-command-panel">
        <div class="business-panel-head"><h2>经营节奏</h2><span>今日优先级</span></div>
        <div class="biz-rhythm">
          <div style="--h:72%"><strong>订单</strong><span>36</span></div>
          <div style="--h:54%"><strong>排产</strong><span>18</span></div>
          <div style="--h:38%"><strong>质检</strong><span>11</span></div>
          <div style="--h:46%"><strong>出库</strong><span>24</span></div>
          <div style="--h:28%"><strong>异常</strong><span>7</span></div>
        </div>
      </article>
      <article class="business-panel biz-risk-board">
        <div class="business-panel-head"><h2>风险雷达</h2><span>跨部门</span></div>
        <div class="biz-risk-card high"><strong>交期压缩</strong><span>4 个订单需要插单评估</span></div>
        <div class="biz-risk-card mid"><strong>原料不足</strong><span>黑色母、阻燃剂库存低于安全线</span></div>
        <div class="biz-risk-card low"><strong>复测等待</strong><span>5 份物性报告待实验室确认</span></div>
      </article>
      <article class="business-panel biz-today-list">
        <div class="business-panel-head"><h2>今日待办</h2><span>可交给 Gjun AI 汇总</span></div>
        <ol>
          <li><strong>16:00</strong><span>确认 GJ-PP-2308 加急订单交期</span></li>
          <li><strong>18:00</strong><span>复核 TGA 图谱异常样品</span></li>
          <li><strong>明早</strong><span>华东仓安全库存盘点</span></li>
        </ol>
      </article>
    </section>
  `;

  const renderOrders = () => {
    const columns = [
      ['待补全', [['SO-018', '宁波辰光', '客户回签'], ['SO-021', '昆山明拓', '缺收货地址']]],
      ['审核中', [['SO-014', '苏州瑞嘉', '信用复核'], ['SO-019', '杭州启明', '价格审批']]],
      ['执行中', [['SO-032', '杭州启明', '备货'], ['SO-027', '常州宏远', '排产']]],
      ['交付中', [['SO-011', '上海锐塑', '司机已接单']]],
    ];
    return `
      <section class="biz-order-toolbar">
        <button class="is-active" type="button">全部订单</button><button type="button">加急</button><button type="button">待审核</button><button type="button">交期风险</button>
      </section>
      <section class="biz-kanban">
        ${columns.map(([title, cards]) => `
          <article class="biz-kanban-column">
            <h2>${esc(title)} <span>${cards.length}</span></h2>
            ${cards.map(([code, customer, state]) => `
              <div class="biz-order-card">
                <strong>${esc(code)}</strong>
                <span>${esc(customer)}</span>
                <em>${esc(state)}</em>
              </div>
            `).join('')}
          </article>
        `).join('')}
      </section>
      ${renderTable('交期风险订单', ['订单号', '客户', '产品', '下一步'], [
        ['SO-20260427-018', '宁波辰光电器', '阻燃 ABS / 2.4 吨', '确认客户回签'],
        ['SO-20260427-014', '苏州瑞嘉材料', '增强 PP / 5 吨', '主管审核价格'],
        ['SO-20260426-032', '杭州启明科技', 'PC/ABS 合金 / 1.8 吨', '仓库备货'],
      ])}
    `;
  };

  const renderInvoice = () => `
    <section class="biz-invoice-layout">
      <div class="business-panel biz-template-gallery">
        <div class="business-panel-head"><h2>单据模板</h2><span>随货资料</span></div>
        ${['销售出库单', '送货单', '质检报告', '样品标签'].map((name, index) => `
          <article class="biz-template-card ${index === 0 ? 'is-active' : ''}">
            <i class="ti ti-file-description" aria-hidden="true"></i>
            <strong>${esc(name)}</strong>
            <span>${index === 0 ? '默认模板' : '可选模板'}</span>
          </article>
        `).join('')}
      </div>
      <div class="business-panel biz-print-preview">
        <div class="business-panel-head"><h2>打印预览</h2><span>A4 横版</span></div>
        <div class="biz-paper">
          <div><strong>广俊塑料科技</strong><span>销售出库单</span></div>
          <p>客户：宁波辰光电器</p><p>产品：阻燃 ABS / 2.4 吨</p><p>批号：GJ260427-A08</p>
          <footer>质检报告、图谱编号、物流信息已关联</footer>
        </div>
      </div>
      <div class="business-panel biz-print-queue">
        <div class="business-panel-head"><h2>打印队列</h2><span>23 份待处理</span></div>
        <ul>
          <li><strong>PR-0427-021</strong><span>送货单 / 待复核</span></li>
          <li><strong>PR-0427-019</strong><span>质检报告 / 可打印</span></li>
          <li><strong>PR-0427-011</strong><span>销售出库单 / 已打印</span></li>
        </ul>
      </div>
    </section>
  `;

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

  const renderFormula = () => `
    <section class="biz-formula-layout">
      <aside class="business-panel biz-formula-list">
        <div class="business-panel-head"><h2>配方版本</h2><span>214 个版本</span></div>
        ${['FM-ABS-2026-041', 'FM-PP-2026-033', 'FM-PCABS-2026-019'].map((item, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button">${esc(item)}<span>${index === 0 ? '试产' : '在用'}</span></button>`).join('')}
      </aside>
      <article class="business-panel biz-recipe-card">
        <div class="business-panel-head"><h2>阻燃 ABS 试产配方</h2><span>目标：冲击强度提升</span></div>
        ${[['ABS 基料', 62], ['阻燃剂', 18], ['增韧剂', 9], ['色母/助剂', 11]].map(([name, value]) => `
          <div class="biz-ingredient"><span>${esc(name)}</span><div><em style="width:${value}%"></em></div><strong>${value}%</strong></div>
        `).join('')}
      </article>
      <article class="business-panel biz-lab-notes">
        <div class="business-panel-head"><h2>验证记录</h2><span>实验室</span></div>
        <p>小试批次 GJ260427-A08，熔指稳定，冲击强度提升 7.4%，阻燃等级保持 V0。建议补做 85 度老化测试后发布。</p>
      </article>
    </section>
  `;

  const renderProduction = () => `
    <section class="biz-production-layout">
      <article class="business-panel biz-line-board">
        <div class="business-panel-head"><h2>产线排程</h2><span>今日 18 批次</span></div>
        ${[
          ['1 号线', [['ABS-FR', 36], ['清机', 12], ['PC/ABS', 28]]],
          ['2 号线', [['PP-GF30', 52], ['抽检', 10], ['PP-T20', 22]]],
          ['3 号线', [['待领料', 18], ['PC/ABS', 44]]],
        ].map(([line, jobs]) => `
          <div class="biz-line-row"><strong>${esc(line)}</strong><div>${jobs.map(([job, width]) => `<span style="width:${width}%">${esc(job)}</span>`).join('')}</div></div>
        `).join('')}
      </article>
      <aside class="business-panel biz-material-ready">
        <div class="business-panel-head"><h2>领料状态</h2><span>原料仓</span></div>
        <div class="ready">GJ-PP-GF30 <strong>齐套</strong></div>
        <div class="pending">GJ-ABS-FR-760 <strong>缺阻燃剂</strong></div>
        <div class="ready">PC/ABS 合金 <strong>齐套</strong></div>
      </aside>
    </section>
    ${renderTable('排产明细', ['批次', '产线', '产品', '状态'], [
      ['MO-0427-07', '2 号线', 'GJ-PP-GF30', '生产中'],
      ['MO-0427-10', '1 号线', 'GJ-ABS-FR-760', '待领料'],
      ['MO-0428-03', '3 号线', 'PC/ABS 合金', '待排产'],
    ])}
  `;

  const archiveData = {
    'supplier-archive': {
      title: '供应商目录',
      side: ['上海恒裕化工', '宁波华纤材料', '苏州蓝石物流'],
      tags: ['阻燃剂', '玻纤', '物流', 'A级', '资质临期'],
      rows: [['上海恒裕化工', '阻燃剂', 'A', '价格本周波动'], ['宁波华纤材料', '玻纤', 'B+', '交期需提前 5 天'], ['苏州蓝石物流', '物流', 'A-', '华南线路满载']],
      columns: ['供应商', '品类', '评级', '关注点'],
    },
    'customer-archive': {
      title: '客户服务视图',
      side: ['宁波辰光电器', '杭州启明科技', '苏州瑞嘉材料'],
      tags: ['重点客户', '样品跟进', '账期复核', '阻燃 ABS'],
      rows: [['宁波辰光电器', '重点', '阻燃 ABS 样品确认', '王敏'], ['杭州启明科技', '活跃', 'PC/ABS 报价更新', '赵磊'], ['苏州瑞嘉材料', '重点', '账期复核', '李娜']],
      columns: ['客户', '等级', '最近事项', '负责人'],
    },
    'personnel-archive': {
      title: '组织与权限',
      side: ['王敏 / 销售主管', '陈工 / 质检工程师', '刘洋 / 仓储管理员'],
      tags: ['在岗', '权限待确认', '实验室', '销售部'],
      rows: [['王敏', '销售部', '销售主管', '在岗'], ['陈工', '实验室', '质检工程师', '在岗'], ['刘洋', '仓储部', '仓储管理员', '权限待确认']],
      columns: ['姓名', '部门', '角色', '状态'],
    },
  };

  const renderArchive = (pageId) => {
    const data = archiveData[pageId];
    return `
      <section class="biz-archive-layout">
        <aside class="business-panel biz-directory">
          <div class="business-panel-head"><h2>${esc(data.title)}</h2><span>快速定位</span></div>
          ${data.side.map((item, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button">${esc(item)}</button>`).join('')}
        </aside>
        <article class="business-panel biz-profile">
          <div class="biz-avatar">${esc(data.side[0].slice(0, 2))}</div>
          <h2>${esc(data.side[0])}</h2>
          <p>这里展示基础资料、联系人、业务关系、历史记录和待处理事项。</p>
          <div class="biz-tags">${data.tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>
        </article>
        ${renderTable('最近记录', data.columns, data.rows)}
      </section>
    `;
  };

  const renderDataSource = () => `
    <section class="biz-dataflow">
      ${['OSS JSON', 'Excel 导入', '图谱本地库', 'AI 上下文'].map((item, index) => `
        <article class="business-panel biz-source-node">
          <i class="ti ${index === 0 ? 'ti-cloud' : index === 1 ? 'ti-file-spreadsheet' : index === 2 ? 'ti-photo' : 'ti-message-2'}" aria-hidden="true"></i>
          <strong>${esc(item)}</strong>
          <span>${index === 1 ? '待校验' : '正常'}</span>
        </article>
      `).join('')}
    </section>
    ${renderTable('同步与映射', ['数据源', '目标模块', '最近同步', '状态'], [
      ['物性测试数据', '物性分析', '10 分钟前', '正常'],
      ['客户订单台账', '订单管理', '今天 09:40', '待校验'],
      ['图谱图片库', '图谱分析', '实时', '正常'],
    ])}
  `;

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
      'invoice-print': renderInvoice,
      'sales-stock': renderStock,
      'formula-management': renderFormula,
      'production-plan': renderProduction,
      'supplier-archive': () => renderArchive('supplier-archive'),
      'customer-archive': () => renderArchive('customer-archive'),
      'personnel-archive': () => renderArchive('personnel-archive'),
      'data-source-config': renderDataSource,
      'permission-management': renderPermission,
      'audit-log': renderAudit,
    };
    return (renderers[pageId] || renderDashboard)();
  };

  const render = (pageId, def = {}) => {
    if (!refs.businessPageContent) return;
    refs.businessPageContent.innerHTML = `
      ${renderBody(pageId)}
    `;
  };

  App.businessPages = { render };
})();
