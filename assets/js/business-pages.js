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

  const inventoryRows = [
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
  let inventoryCategory = '全部';
  let activeFormulaId = 'FM-ABS-FR-760';
  let formulaMaterialCategory = '全部';

  const renderInventory = () => {
    const rawRows = inventoryRows.filter((row) => row[1] === '原材料');
    const finishedRows = inventoryRows.filter((row) => row[1] === '成品材料');
    const suppliers = [...new Set(inventoryRows.map((row) => row[3]))];
    const categories = [...new Set(inventoryRows.map((row) => row[2]))];
    const categoryTabs = ['全部', ...categories];
    if (!categoryTabs.includes(inventoryCategory)) inventoryCategory = '全部';
    const visibleRows = inventoryCategory === '全部'
      ? inventoryRows
      : inventoryRows.filter((row) => row[2] === inventoryCategory);

    return `
      ${renderStatStrip([
        ['原材料 SKU', String(rawRows.length), '按供应商追踪'],
        ['成品材料', String(finishedRows.length), '生产完成入库'],
        ['关联供应商', String(suppliers.length), '来源可追踪'],
        ['库存预警', '3 项', '需采购/复检'],
      ])}
      <section class="business-panel biz-category-flow">
        <div class="business-panel-head"><h2>分类视图</h2><span>${esc(inventoryCategory)} · ${visibleRows.length} 项</span></div>
        <div class="biz-category-tabs">
          ${categoryTabs.map((category) => {
            const count = category === '全部'
              ? inventoryRows.length
              : inventoryRows.filter((row) => row[2] === category).length;
            return `
              <button
                class="${category === inventoryCategory ? 'is-active' : ''}"
                type="button"
                data-inventory-category="${esc(category)}">
                <span>${esc(category)}</span>
                <strong>${count}</strong>
              </button>
            `;
          }).join('')}
        </div>
      </section>
      ${renderTable('材料明细', ['材料', '类型', '分类', '供应商', '库存', '状态'], visibleRows)}
    `;
  };

  const getInventoryMaterial = (name) => inventoryRows.find((row) => row[0] === name)
    || [name, '库存材料', '未分类', '未关联供应商', '--', '待确认'];

  const formulaRecipes = [
    {
      id: 'FM-ABS-FR-760',
      name: '阻燃 ABS 高冲击配方',
      product: 'GJ-ABS-FR-760',
      version: 'V3.2',
      status: '试产验证',
      owner: '陈工',
      updated: '2026-04-30',
      target: '冲击强度提升，阻燃等级保持 V0',
      batchSize: '500 kg',
      materials: [
        { name: 'ABS 757K', ratio: 58, tolerance: '±0.6%', role: '主体树脂', stage: '主喂料' },
        { name: '阻燃剂 FR-530', ratio: 18, tolerance: '±0.3%', role: '阻燃体系', stage: '侧喂料' },
        { name: '增韧剂 IM-88', ratio: 13, tolerance: '±0.2%', role: '抗冲改性', stage: '主喂料' },
        { name: '玻纤 GF-30', ratio: 8, tolerance: '±0.2%', role: '尺寸稳定', stage: '侧喂料' },
        { name: '黑色母 B-204', ratio: 3, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
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
      name: '增强 PP 低翘曲配方',
      product: 'GJ-PP-GF30',
      version: 'V2.4',
      status: '在用',
      owner: '李娜',
      updated: '2026-04-28',
      target: '弯曲模量稳定，降低成型翘曲',
      batchSize: '800 kg',
      materials: [
        { name: 'PP K8003', ratio: 63, tolerance: '±0.8%', role: '主体树脂', stage: '主喂料' },
        { name: '玻纤 GF-30', ratio: 30, tolerance: '±0.4%', role: '增强填料', stage: '侧喂料' },
        { name: '抗氧剂 AO-1010', ratio: 2, tolerance: '±0.1%', role: '热稳定', stage: '预混' },
        { name: '润滑剂 EBS-16', ratio: 2, tolerance: '±0.1%', role: '加工流动', stage: '预混' },
        { name: '黑色母 B-204', ratio: 3, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
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
      name: 'PC/ABS 耐热合金配方',
      product: 'GJ-PCABS-901',
      version: 'V1.8',
      status: '待放行',
      owner: '王敏',
      updated: '2026-04-26',
      target: '提高耐热与尺寸稳定性',
      batchSize: '300 kg',
      materials: [
        { name: 'PC/ABS 基料 901', ratio: 78, tolerance: '±0.7%', role: '主体基料', stage: '主喂料' },
        { name: '相容剂 MAH-42', ratio: 8, tolerance: '±0.2%', role: '界面改性', stage: '主喂料' },
        { name: '增韧剂 IM-88', ratio: 7, tolerance: '±0.2%', role: '抗冲改性', stage: '主喂料' },
        { name: '抗氧剂 AO-1010', ratio: 2, tolerance: '±0.1%', role: '热稳定', stage: '预混' },
        { name: '黑色母 B-204', ratio: 5, tolerance: '±0.1%', role: '颜色体系', stage: '预混' },
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

  const getActiveFormula = () => formulaRecipes.find((recipe) => recipe.id === activeFormulaId) || formulaRecipes[0];

  const getFormulaRows = (recipe) => recipe.materials.map((item) => {
    const [name, type, category, supplier, quantity, state] = getInventoryMaterial(item.name);
    return { ...item, name, type, category, supplier, quantity, state };
  });

  const getFormulaRiskCount = (rows) => rows.filter((row) => /紧急|预警|待检/.test(row.state)).length;

  const renderFormula = () => {
    const recipe = getActiveFormula();
    const formulaRows = getFormulaRows(recipe);
    const totalRatio = formulaRows.reduce((sum, item) => sum + Number(item.ratio || 0), 0);
    const materialRows = inventoryRows.filter((row) => row[1] === '原材料');
    const materialCategories = ['全部', ...new Set(materialRows.map((row) => row[2]))];
    if (!materialCategories.includes(formulaMaterialCategory)) formulaMaterialCategory = '全部';
    const visibleMaterials = formulaMaterialCategory === '全部'
      ? materialRows
      : materialRows.filter((row) => row[2] === formulaMaterialCategory);
    const riskCount = getFormulaRiskCount(formulaRows);

    return `
      ${renderStatStrip([
        ['当前配方', recipe.product, recipe.version],
        ['配比合计', `${totalRatio}%`, totalRatio === 100 ? '已平衡' : '需调整'],
        ['材料数量', `${formulaRows.length} 种`, recipe.batchSize],
        ['库存风险', `${riskCount} 项`, riskCount ? '需处理' : '可排产'],
      ])}
      <section class="biz-formula-layout">
        <aside class="business-panel biz-formula-list">
          <div class="business-panel-head"><h2>配方版本</h2><span>${formulaRecipes.length} 个</span></div>
          ${formulaRecipes.map((item) => `
            <button class="${item.id === recipe.id ? 'is-active' : ''}" type="button" data-formula-id="${esc(item.id)}">
              ${esc(item.id)}
              <span>${esc(item.status)}</span>
            </button>
          `).join('')}
        </aside>
        <article class="business-panel biz-recipe-card biz-formula-builder">
          <div class="business-panel-head"><h2>${esc(recipe.name)}</h2><span>${esc(recipe.status)}</span></div>
          <div class="biz-formula-meta">
            <span>${esc(recipe.product)}</span>
            <span>${esc(recipe.owner)}</span>
            <span>${esc(recipe.updated)}</span>
            <span>${esc(recipe.target)}</span>
          </div>
          ${formulaRows.map((item) => `
            <div class="biz-ingredient biz-recipe-material">
              <span><strong>${esc(item.name)}</strong><em>${esc(item.role)} · ${esc(item.category)} · ${esc(item.supplier)}</em></span>
              <div><em style="width:${item.ratio}%"></em></div>
              <strong>${item.ratio}%</strong>
              <small>${esc(item.stage)} / ${esc(item.tolerance)} / 库存 ${esc(item.quantity)} / ${esc(item.state)}</small>
            </div>
          `).join('')}
        </article>
        <aside class="business-panel biz-formula-library">
          <div class="business-panel-head"><h2>库存材料库</h2><span>${visibleMaterials.length} 项</span></div>
          <div class="biz-formula-material-tabs">
            ${materialCategories.map((category) => `
              <button class="${category === formulaMaterialCategory ? 'is-active' : ''}" type="button" data-formula-material-category="${esc(category)}">${esc(category)}</button>
            `).join('')}
          </div>
          <div class="biz-formula-material-list">
            ${visibleMaterials.map(([name, type, category, supplier, quantity, state]) => `
              <div class="biz-formula-material-card ${/紧急|预警/.test(state) ? 'is-warn' : ''}">
                <strong>${esc(name)}</strong>
                <span>${esc(category)} · ${esc(supplier)}</span>
                <em>${esc(quantity)} / ${esc(state)}</em>
              </div>
            `).join('')}
          </div>
        </aside>
      </section>
      <section class="biz-formula-flow-grid">
        <article class="business-panel biz-formula-process">
          <div class="business-panel-head"><h2>配比流程</h2><span>${esc(recipe.batchSize)}</span></div>
          ${recipe.process.map(([step, detail], index) => `
            <div class="biz-formula-step">
              <strong>${index + 1}</strong>
              <span>${esc(step)}</span>
              <em>${esc(detail)}</em>
            </div>
          `).join('')}
        </article>
        <article class="business-panel biz-formula-checks">
          <div class="business-panel-head"><h2>配方校验</h2><span>版本放行</span></div>
          ${recipe.checks.map((item) => `
            <div class="${/紧急|待|需/.test(item) ? 'is-warn' : 'is-ok'}">
              <i class="ti ${/紧急|待|需/.test(item) ? 'ti-alert-triangle' : 'ti-circle-check'}" aria-hidden="true"></i>
              <span>${esc(item)}</span>
            </div>
          `).join('')}
        </article>
      </section>
      ${renderTable('配方 BOM 明细', ['库存材料', '角色', '分类', '供应商', '库存状态', '配比'], formulaRows.map((item) => [
        item.name,
        item.role,
        item.category,
        item.supplier,
        `${item.quantity} / ${item.state}`,
        `${item.ratio}%`,
      ]))}
    `;
  };

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
      side: ['上海恒裕化工', '宁波华纤材料', '常州新禾助剂', '广州瑞丰树脂', '苏州蓝石物流'],
      tags: ['基础树脂', '玻纤', '阻燃助剂', '改性助剂', '色母助剂', 'A级', '资质临期'],
      rows: [['上海恒裕化工', '基础树脂 / 阻燃 ABS', 'A', '价格本周波动'], ['宁波华纤材料', '玻纤 / 增强 PP', 'B+', '交期需提前 5 天'], ['常州新禾助剂', '阻燃剂', 'A-', '库存低于安全线'], ['广州瑞丰树脂', 'PC/ABS 合金', 'A', '新品试样中'], ['苏州蓝石物流', '色母助剂 / 物流', 'A-', '华南线路满载']],
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
      'inventory-management': renderInventory,
      'supplier-archive': () => renderArchive('supplier-archive'),
      'customer-archive': () => renderArchive('customer-archive'),
      'personnel-archive': () => renderArchive('personnel-archive'),
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

  refs.businessPageContent?.addEventListener('click', (event) => {
    const formulaButton = event.target.closest('[data-formula-id]');
    if (formulaButton && refs.businessPageContent.contains(formulaButton)) {
      activeFormulaId = formulaButton.getAttribute('data-formula-id') || activeFormulaId;
      render('formula-management');
      return;
    }

    const formulaMaterialButton = event.target.closest('[data-formula-material-category]');
    if (formulaMaterialButton && refs.businessPageContent.contains(formulaMaterialButton)) {
      formulaMaterialCategory = formulaMaterialButton.getAttribute('data-formula-material-category') || '全部';
      render('formula-management');
      return;
    }

    const categoryButton = event.target.closest('[data-inventory-category]');
    if (categoryButton && refs.businessPageContent.contains(categoryButton)) {
      inventoryCategory = categoryButton.getAttribute('data-inventory-category') || '全部';
      render('inventory-management');
      return;
    }
  });

  App.businessPages = { render };
})();
