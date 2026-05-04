// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, utils } = App;
  const esc = (value) => utils.escapeHtml(value);
  let searchRenderTimer = null;

  const renderSearchBox = (options) => App.searchBox?.render?.(options) || `
    <label class="${esc(options.className || '')}">
      <i class="ti ti-search" aria-hidden="true"></i>
      <input type="search" placeholder="${esc(options.placeholder || '搜索...')}" value="${esc(options.value || '')}" ${Object.entries(options.attributes || {}).map(([key, value]) => `${esc(key)}="${esc(value)}"`).join(' ')}>
    </label>
  `;

  const scheduleSearchRender = (pageId, afterRender) => {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(() => {
      searchRenderTimer = null;
      if (App.constants?.NAV_PAGE_KEY && localStorage.getItem(App.constants.NAV_PAGE_KEY) !== pageId) return;
      render(pageId);
      afterRender?.();
    }, 160);
  };

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
      <div class="business-table-wrap ui-table-wrap">
        <table class="business-table ui-table">
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

  const INVENTORY_STORAGE_KEY = 'gjh-inventory-materials-v1';
  const INVENTORY_CATEGORY_STORAGE_KEY = 'gjh-inventory-categories-v1';
  const defaultInventoryRows = [
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
  const inventoryTypeOptions = ['原材料', '成品材料', '库存材料'];
  const inventoryStateOptions = ['正常', '预警', '紧急', '可发货', '锁库中', '待检', '待确认'];
  const normalizeInventoryRow = (row) => {
    const cells = Array.isArray(row) ? row : [];
    return [
      String(cells[0] || '').trim(),
      String(cells[1] || '原材料').trim() || '原材料',
      String(cells[2] || '未分类').trim() || '未分类',
      String(cells[3] || '未关联供应商').trim() || '未关联供应商',
      String(cells[4] || '--').trim() || '--',
      String(cells[5] || '待确认').trim() || '待确认',
    ];
  };
  const normalizeInventoryRows = (value) => {
    const rows = Array.isArray(value) ? value.map(normalizeInventoryRow).filter((row) => row[0]) : [];
    return rows.length ? rows : defaultInventoryRows.map(normalizeInventoryRow);
  };
  const getDefaultInventoryCategories = (rows = defaultInventoryRows) => (
    [...new Set(rows.map((row) => normalizeInventoryRow(row)[2]).filter(Boolean))]
  );
  const normalizeInventoryCategories = (value, rows) => {
    const categories = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
    return [...new Set([...categories, ...getDefaultInventoryCategories(rows)])];
  };
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
    return [
      read('name'),
      read('type') || '原材料',
      read('category') || '未分类',
      read('supplier') || '未关联供应商',
      read('quantity') || '--',
      read('state') || '待确认',
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
          <div class="biz-inventory-material-modal" data-inventory-material-modal>
            <div class="biz-inventory-material-dialog" role="dialog" aria-modal="true" aria-labelledby="inventoryMaterialModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="inventoryMaterialModalTitle">${inventoryEditingMaterialName ? '编辑材料' : '新增材料'}</h2>
                  <span>${esc(inventoryDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn" type="button" aria-label="关闭材料编辑" data-inventory-close-material-modal>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              <div class="biz-inventory-material-editor">
                <label class="is-name">
                  <span>材料</span>
                  <input type="text" value="${esc(materialFormRow[0])}" placeholder="材料名称" data-inventory-material-field="name">
                </label>
                <label class="is-type">
                  <span>类型</span>
                  <select data-inventory-material-field="type">${renderOptions(inventoryTypeOptions, materialFormRow[1])}</select>
                </label>
                <label class="is-category">
                  <span>分类</span>
                  <select data-inventory-material-field="category">${renderOptions(categories.length ? categories : ['未分类'], materialFormRow[2])}</select>
                </label>
                <label class="is-supplier">
                  <span>供应商</span>
                  <input type="text" value="${esc(materialFormRow[3])}" placeholder="供应商名称" data-inventory-material-field="supplier">
                </label>
                <label class="is-quantity">
                  <span>库存</span>
                  <input type="text" value="${esc(materialFormRow[4])}" placeholder="例如：12.4 吨" data-inventory-material-field="quantity">
                </label>
                <label class="is-state">
                  <span>状态</span>
                  <select data-inventory-material-field="state">${renderOptions(inventoryStateOptions, materialFormRow[5])}</select>
                </label>
                <div class="biz-inventory-modal-actions">
                  <button class="biz-inventory-primary-btn" type="button" data-inventory-save-material>${inventoryEditingMaterialName ? '保存材料' : '添加材料'}</button>
                  <button class="biz-inventory-ghost-btn" type="button" data-inventory-cancel-material>取消</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
        ${inventoryCategoryModalOpen ? `
          <div class="biz-inventory-category-modal" data-inventory-category-modal>
            <div class="biz-inventory-category-dialog" role="dialog" aria-modal="true" aria-labelledby="inventoryCategoryModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="inventoryCategoryModalTitle">分类管理</h2>
                  <span>${esc(inventoryDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn" type="button" aria-label="关闭分类管理" data-inventory-close-category-modal>
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

  const getFormulaRiskCount = (rows) => rows.filter((row) => /紧急|预警|待检/.test(row.state)).length;
  const getFormulaCategory = (recipe) => {
    if (recipe?.category) return String(recipe.category);
    return inferFormulaCategory(recipe);
  };
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
      <aside class="business-panel biz-formula-library">
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
      <section class="biz-formula-layout biz-formula-editor-layout">
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
                    <td class="biz-supplier-name-cell">${esc(supplier.name)}</td>
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
          <div class="biz-inventory-material-modal biz-supplier-modal" data-supplier-modal>
            <div class="biz-inventory-material-dialog biz-supplier-dialog" role="dialog" aria-modal="true" aria-labelledby="supplierModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="supplierModalTitle">${supplierEditingCode ? '编辑供应商' : '新增供应商'}</h2>
                  <span>${esc(supplierDraftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn" type="button" aria-label="关闭供应商编辑" data-supplier-close>
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
                    <td class="biz-supplier-name-cell">${esc(record.name)}</td>
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
          <div class="biz-inventory-material-modal biz-supplier-modal" data-archive-modal="${esc(kind)}">
            <div class="biz-inventory-material-dialog biz-supplier-dialog" role="dialog" aria-modal="true" aria-labelledby="${esc(kind)}ModalTitle">
              <div class="biz-inventory-dialog-head">
                <div>
                  <h2 id="${esc(kind)}ModalTitle">${state.editingCode ? `编辑${config.entityName}` : config.addText}</h2>
                  <span>${esc(state.draftNote)}</span>
                </div>
                <button class="biz-inventory-icon-btn" type="button" aria-label="关闭${esc(config.entityName)}编辑" data-archive-close="${esc(kind)}">
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
      'invoice-print': renderInvoice,
      'sales-stock': renderStock,
      'formula-management': renderFormula,
      'production-plan': renderProduction,
      'inventory-management': renderInventory,
      'supplier-archive': renderSupplierArchive,
      'customer-archive': () => renderArchive('customer'),
      'personnel-archive': () => renderArchive('personnel'),
      'permission-management': renderPermission,
      'audit-log': renderAudit,
    };
    return (renderers[pageId] || renderDashboard)();
  };

  const render = (pageId, def = {}) => {
    if (!refs.businessPageContent) return;
    const usesFullHeightTable = pageId === 'inventory-management' || pageId === 'supplier-archive' || pageId === 'customer-archive' || pageId === 'personnel-archive';
    refs.businessPageContent.classList.toggle('biz-inventory-shell', usesFullHeightTable);
    refs.businessPageContent.closest('.business-page')?.classList.toggle('biz-inventory-active', usesFullHeightTable);
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

  App.businessPages = { render };
})();
