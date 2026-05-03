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
  let activeFormulaId = 'FM-ABS-FR-760';
  let formulaMaterialCategory = '全部';
  let formulaDraftNote = '草稿自动保存';
  let formulaSearchQuery = '';
  let activeFormulaMaterialIndex = null;
  let formulaViewMode = 'list';
  let formulaListCategory = '全部';
  let formulaListStatus = '全部';

  const getInventoryCategories = () => [
    ...new Set([...inventoryCategories, ...inventoryRows.map((row) => row[2]).filter(Boolean)]),
  ];

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
      return false;
    }
    const currentIndex = inventoryEditingMaterialName ? getInventoryMaterialIndex(inventoryEditingMaterialName) : -1;
    const duplicatedIndex = getInventoryMaterialIndex(row[0]);
    if (duplicatedIndex >= 0 && duplicatedIndex !== currentIndex) {
      inventoryDraftNote = '材料名称已存在，请换一个名称';
      return false;
    }
    if (currentIndex >= 0) {
      const oldName = inventoryRows[currentIndex][0];
      inventoryRows[currentIndex] = row;
      syncFormulaMaterialName(oldName, row[0]);
      inventoryEditingMaterialName = row[0];
      inventoryCategory = row[2];
      persistInventory(`已更新材料 ${row[0]} · ${getTimeCode()}`);
      return true;
    }
    inventoryRows.unshift(row);
    inventoryEditingMaterialName = row[0];
    inventoryCategory = row[2];
    persistInventory(`已新增材料 ${row[0]} · ${getTimeCode()}`);
    return true;
  };

  const deleteInventoryMaterial = (name) => {
    const index = getInventoryMaterialIndex(name);
    if (index < 0) return;
    if (!window.confirm(`确认删除材料「${name}」？相关配方中的引用也会移除。`)) return;
    inventoryRows.splice(index, 1);
    if (inventoryEditingMaterialName === name) inventoryEditingMaterialName = '';
    removeFormulaMaterialName(name);
    persistInventory(`已删除材料 ${name} · ${getTimeCode()}`);
  };

  const saveInventoryCategory = () => {
    const input = refs.businessPageContent?.querySelector('[data-inventory-category-name]');
    const nextCategory = String(input?.value || '').trim();
    if (!nextCategory) {
      inventoryDraftNote = '请先填写分类名称';
      return;
    }
    const categories = getInventoryCategories();
    if (inventoryEditingCategory && inventoryEditingCategory !== nextCategory) {
      if (categories.includes(nextCategory)) {
        inventoryDraftNote = '分类名称已存在，请换一个名称';
        return;
      }
      inventoryRows.forEach((row) => {
        if (row[2] === inventoryEditingCategory) row[2] = nextCategory;
      });
      inventoryCategories = categories.map((category) => (category === inventoryEditingCategory ? nextCategory : category));
      inventoryCategory = nextCategory;
      inventoryEditingCategory = nextCategory;
      persistInventory(`已重命名分类为 ${nextCategory} · ${getTimeCode()}`);
      return;
    }
    if (!categories.includes(nextCategory)) inventoryCategories.push(nextCategory);
    inventoryCategory = nextCategory;
    inventoryEditingCategory = nextCategory;
    persistInventory(`已新增分类 ${nextCategory} · ${getTimeCode()}`);
  };

  const deleteInventoryCategory = (category) => {
    if (!category || category === '全部') return;
    const usedCount = inventoryRows.filter((row) => row[2] === category).length;
    const message = usedCount
      ? `确认删除分类「${category}」？${usedCount} 个材料会移动到「未分类」。`
      : `确认删除分类「${category}」？`;
    if (!window.confirm(message)) return;
    inventoryRows.forEach((row) => {
      if (row[2] === category) row[2] = '未分类';
    });
    inventoryCategories = getInventoryCategories().filter((item) => item !== category);
    if (!inventoryCategories.includes('未分类')) inventoryCategories.push('未分类');
    inventoryCategory = '全部';
    inventoryEditingCategory = '';
    persistInventory(`已删除分类 ${category} · ${getTimeCode()}`);
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
    const editingRow = normalizeInventoryRow(inventoryRows[getInventoryMaterialIndex(inventoryEditingMaterialName)] || []);
    const materialFormRow = inventoryEditingMaterialName ? editingRow : ['', '原材料', inventoryCategory === '全部' ? categories[0] || '基础树脂' : inventoryCategory, '', '', '正常'];
    const categoryFormValue = inventoryEditingCategory || (inventoryCategory === '全部' ? '' : inventoryCategory);

    return `
      <div class="biz-inventory-page">
        <section class="business-panel biz-category-flow">
          <div class="business-panel-head biz-inventory-category-head">
            <div>
              <h2>分类视图</h2>
              <span>${esc(inventoryCategory)} · ${visibleRows.length} 项</span>
            </div>
            <button class="biz-inventory-ghost-btn" type="button" data-inventory-open-category-modal>
              <i class="ti ti-category" aria-hidden="true"></i>
              <span>分类管理</span>
            </button>
          </div>
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
        <section class="business-panel biz-table-panel biz-inventory-table-panel">
          <div class="biz-inventory-table-head">
            <div>
              <h2>材料明细</h2>
              <span>${esc(inventoryDraftNote)}</span>
            </div>
            <div class="biz-inventory-table-actions">
              <label class="biz-inventory-search">
                <i class="ti ti-search" aria-hidden="true"></i>
                <input type="search" placeholder="搜索材料、供应商、状态..." value="${esc(inventorySearchQuery)}" data-inventory-search>
              </label>
              <button class="biz-inventory-primary-btn" type="button" data-inventory-new-material>
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>新增材料</span>
              </button>
            </div>
          </div>
          <div class="business-table-wrap biz-inventory-table-wrap">
            <table class="business-table">
              <thead><tr>${['材料', '类型', '分类', '供应商', '库存', '状态', '操作'].map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
              <tbody>
                ${visibleRows.map((row) => `
                  <tr>
                    ${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}
                    <td>
                      <div class="biz-inventory-row-actions">
                        <button type="button" data-inventory-edit-material="${esc(row[0])}">编辑</button>
                        <button class="is-danger" type="button" data-inventory-delete-material="${esc(row[0])}">删除</button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="7">暂无匹配材料</td></tr>'}
              </tbody>
            </table>
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

  const persistFormulaRecipes = (note = '草稿自动保存') => {
    formulaDraftNote = note;
    utils.writeJson(FORMULA_STORAGE_KEY, formulaRecipes);
  };

  const saveActiveFormulaVersion = () => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    if (!recipe) return;
    const currentKey = getRecipeVersionKey(recipe);
    const matchedVersion = recipe.versions?.find((item) => getRecipeSnapshotVersionKey(item.snapshot) === currentKey);
    if (matchedVersion) {
      recipe.version = matchedVersion.label;
      recipe.updated = getTodayCode();
      persistFormulaRecipes(`已保存基础信息，配料未变化 · ${getTimeCode()}`);
      return;
    }
    const latestVersion = recipe.versions?.[recipe.versions.length - 1];
    const nextLabel = getNextFormulaVersionLabel(latestVersion?.label || recipe.version);
    recipe.version = nextLabel;
    recipe.updated = getTodayCode();
    recipe.versions = [...(recipe.versions || []), createFormulaVersionRecord(recipe, nextLabel, '手动保存')];
    persistFormulaRecipes(`已新增版本 ${nextLabel} · ${getTimeCode()}`);
  };

  const applyActiveFormulaVersion = (versionId) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
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
    persistFormulaRecipes(`正在查看 ${versionRecord.label} · ${getTimeCode()}`);
  };

  const getActiveFormulaIndex = () => {
    const index = formulaRecipes.findIndex((recipe) => recipe.id === activeFormulaId);
    return index >= 0 ? index : 0;
  };

  const getActiveFormula = () => formulaRecipes.find((recipe) => recipe.id === activeFormulaId) || formulaRecipes[0];

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
    const index = getActiveFormulaIndex();
    formulaRecipes[index] = {
      ...formulaRecipes[index],
      [field]: value,
      updated: getTodayCode(),
    };
    persistFormulaRecipes('已自动保存');
  };

  const updateActiveFormulaMaterial = (materialIndex, field, value) => {
    if (!formulaMaterialFields.has(field)) return;
    const recipe = formulaRecipes[getActiveFormulaIndex()];
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
    persistFormulaRecipes('已自动保存');
  };

  const updateActiveFormulaPortGroup = (fromPort, toPort) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    const sourcePort = normalizeFeederPort(fromPort);
    const targetPort = normalizeFeederPort(toPort, sourcePort);
    if (!recipe || sourcePort === targetPort) return;
    recipe.materials.forEach((material) => {
      const currentPort = normalizeFeederPort(material.port);
      if (currentPort === sourcePort) material.port = targetPort;
      if (currentPort === targetPort) material.port = sourcePort;
    });
    recipe.updated = getTodayCode();
    persistFormulaRecipes('已调整下料口');
  };

  const addActiveFormulaMaterial = (name) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    if (!recipe || recipe.materials.some((item) => item.name === name)) return;
    recipe.materials.push(getDefaultFormulaMaterial(name, getLeastUsedPort(recipe.materials)));
    recipe.updated = getTodayCode();
    persistFormulaRecipes('已加入库存材料');
  };

  const addActiveFormulaMaterialRow = (port, afterIndex = null) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
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
    persistFormulaRecipes('已增加下料口行');
  };

  const assignActiveFormulaMaterial = (materialIndex, name) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    const material = recipe?.materials?.[materialIndex];
    if (!material || !name) return;
    const nextMaterial = getDefaultFormulaMaterial(name, material.port);
    recipe.materials[materialIndex] = {
      ...nextMaterial,
      ratio: Number(material.ratio || 0),
    };
    activeFormulaMaterialIndex = materialIndex;
    recipe.updated = getTodayCode();
    persistFormulaRecipes('已更换配方材料');
  };

  const removeActiveFormulaMaterial = (materialIndex) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    if (!recipe?.materials?.[materialIndex]) return;
    recipe.materials.splice(materialIndex, 1);
    activeFormulaMaterialIndex = null;
    recipe.updated = getTodayCode();
    persistFormulaRecipes('已移除配方材料');
  };

  const removeActiveFormulaMaterialByName = (name) => {
    const recipe = formulaRecipes[getActiveFormulaIndex()];
    const materialIndex = recipe?.materials?.findIndex((item) => item.name === name) ?? -1;
    if (materialIndex < 0) return false;
    recipe.materials.splice(materialIndex, 1);
    activeFormulaMaterialIndex = null;
    recipe.updated = getTodayCode();
    persistFormulaRecipes('已移除配方材料');
    return true;
  };

  const resetFormulaRecipes = () => {
    formulaRecipes = cloneFormulaData(defaultFormulaRecipes);
    activeFormulaId = formulaRecipes[0]?.id || activeFormulaId;
    formulaMaterialCategory = '全部';
    activeFormulaMaterialIndex = null;
    persistFormulaRecipes('已恢复默认配方');
  };

  const createFormulaRecipe = () => {
    const id = `FM-${getTodayCode().replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const recipe = {
      id,
      code: id.replace('FM-', ''),
      name: '新建配方',
      product: id.replace('FM-', 'GJ-'),
      version: 'V1.0',
      status: '实验',
      line: 'A',
      owner: '待分配',
      updated: getTodayCode(),
      target: '填写目标指标、客户要求或实验备注',
      batchSize: '500 kg',
      materials: [],
      process: [['称量', '填写领料与复核要求']],
      checks: [],
    };
    recipe.versions = [createFormulaVersionRecord(recipe, recipe.version, '初始版本')];
    formulaRecipes.unshift(recipe);
    activeFormulaId = recipe.id;
    activeFormulaMaterialIndex = null;
    formulaViewMode = 'edit';
    persistFormulaRecipes('已新建配方');
  };

  const deleteFormulaRecipe = (recipeId) => {
    if (formulaRecipes.length <= 1) {
      formulaDraftNote = '至少保留 1 个配方';
      return;
    }
    const index = formulaRecipes.findIndex((recipe) => recipe.id === recipeId);
    if (index < 0) return;
    formulaRecipes.splice(index, 1);
    if (activeFormulaId === recipeId) {
      activeFormulaId = formulaRecipes[Math.min(index, formulaRecipes.length - 1)]?.id || formulaRecipes[0]?.id;
      activeFormulaMaterialIndex = null;
    }
    persistFormulaRecipes('已删除配方');
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
  const renderFormulaMiniStats = (items) => `
    <div class="biz-formula-mini-stats">
      ${items.map(([label, value, note, icon = 'ti ti-chart-bar']) => `
        <article>
          <i class="${esc(icon)}" aria-hidden="true"></i>
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
          <em>${esc(note)}</em>
        </article>
      `).join('')}
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
    const formulaSummaries = formulaRecipes.map(getFormulaSummary);
    const experimentCount = formulaSummaries.filter((item) => item.status === '实验').length;
    const riskFormulaCount = formulaSummaries.filter((item) => item.riskCount > 0).length;
    const materialTotal = formulaRecipes.reduce((sum, recipe) => sum + recipe.materials.length, 0);
    const latestUpdated = formulaRecipes
      .map((recipe) => recipe.updated || '')
      .filter(Boolean)
      .sort()
      .at(-1) || getTodayCode();

    return `
      <section class="biz-formula-page biz-formula-list-page">
        <section class="business-panel biz-formula-overview-panel">
          <div class="biz-formula-overview-copy">
            <div>
              <i class="ti ti-flask-2" aria-hidden="true"></i>
              <h2>配方管理</h2>
            </div>
            <p>集中维护配方版本、基材分类、下料口材料与库存风险，进入编辑后可直接从材料库补齐或替换原料。</p>
          </div>
          ${renderFormulaMiniStats([
            ['配方总数', `${formulaRecipes.length} 个`, `当前显示 ${visibleFormulaRecipes.length} 个`, 'ti ti-clipboard-list'],
            ['材料行数', `${materialTotal} 行`, '按配方材料明细统计', 'ti ti-list-check'],
            ['实验版本', `${experimentCount} 个`, '需确认后再排产', 'ti ti-test-pipe'],
            ['待处理', `${riskFormulaCount} 个`, `最近更新 ${latestUpdated}`, 'ti ti-alert-triangle'],
          ])}
        </section>
        <section class="business-panel biz-formula-table-panel">
        <div class="biz-formula-table-head">
          <div class="biz-formula-table-title">
            <i class="ti ti-table-options" aria-hidden="true"></i>
            <div>
              <h2>配方台账</h2>
              <span>${esc(formulaDraftNote)} · ${visibleFormulaRecipes.length} / ${formulaRecipes.length}</span>
            </div>
          </div>
          <div class="biz-formula-table-actions">
            <label class="biz-formula-search biz-formula-table-search">
              <i class="ti ti-search" aria-hidden="true"></i>
              <input type="search" placeholder="搜索编号、名称、产品、基材..." value="${esc(formulaSearchQuery)}" data-formula-search>
            </label>
            <select data-formula-list-category aria-label="配方分类筛选">${renderFormulaFilterOptions(categories, formulaListCategory, '全部分类')}</select>
            <select data-formula-list-status aria-label="配方状态筛选">${renderFormulaFilterOptions(statuses, formulaListStatus, '全部状态')}</select>
            <button class="biz-formula-new-btn" type="button" data-formula-new>
              <i class="ti ti-plus" aria-hidden="true"></i>
              <span>新建配方</span>
            </button>
          </div>
        </div>
        <div class="biz-formula-table-wrap">
          <table class="biz-formula-table">
            <thead>
              <tr>
                <th>配方编号</th>
                <th>日期</th>
                <th>配方名称</th>
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
              ${visibleFormulaRecipes.map((recipe) => {
                const summary = getFormulaSummary(recipe);
                return `
                  <tr>
                    <td>
                      <span class="biz-formula-code">${esc(recipe.code || recipe.id.replace(/^FM-/, ''))}</span>
                    </td>
                    <td><span class="biz-formula-version-only">${esc(recipe.updated || getTodayCode())}</span></td>
                    <td class="biz-formula-title-cell">
                      <button class="biz-formula-name-link" type="button" data-formula-edit="${esc(recipe.id)}">${esc(recipe.name)}</button>
                    </td>
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
              <span class="biz-formula-save-note">${esc(formulaDraftNote)}</span>
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
                  <div class="biz-line-table-wrap">
                    <table class="biz-line-table">
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
          <div>
            <h2>库存材料库</h2>
            <span>${hasActiveMaterialRow ? '选择材料替换当前下料行' : '点击材料加入配方'}</span>
          </div>
          <strong>${visibleMaterials.length} 项</strong>
        </div>
        <div class="biz-formula-material-tabs">
          ${materialCategories.map((category) => `
            <button class="${category === formulaMaterialCategory ? 'is-active' : ''}" type="button" data-formula-material-category="${esc(category)}">${esc(category)}</button>
          `).join('')}
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
    if (builder) builder.outerHTML = renderFormulaBuilderPanel();
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
    refs.businessPageContent.classList.toggle('biz-inventory-shell', pageId === 'inventory-management');
    refs.businessPageContent.closest('.business-page')?.classList.toggle('biz-inventory-active', pageId === 'inventory-management');
    refs.businessPageContent.innerHTML = `
      ${renderBody(pageId)}
    `;
  };

  const focusFormulaSearch = (selectionStart = formulaSearchQuery.length, selectionEnd = selectionStart) => {
    requestAnimationFrame(() => {
      const searchInput = refs.businessPageContent?.querySelector('[data-formula-search]');
      if (!(searchInput instanceof HTMLInputElement)) return;
      searchInput.focus();
      searchInput.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const handleFormulaEdit = (target) => {
    if (!target) return false;

    if (target.hasAttribute('data-formula-search')) {
      formulaSearchQuery = target.value;
      return true;
    }

    if (target.hasAttribute('data-formula-version-select')) {
      applyActiveFormulaVersion(target.value);
      return true;
    }

    if (target.hasAttribute('data-formula-list-category')) {
      formulaListCategory = target.value || '全部';
      return true;
    }

    if (target.hasAttribute('data-formula-list-status')) {
      formulaListStatus = target.value || '全部';
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
      render('inventory-management');
      refs.businessPageContent?.querySelector('[data-inventory-search]')?.focus();
      return;
    }
    if (handleFormulaEdit(event.target) && event.target.hasAttribute('data-formula-search')) {
      const selectionStart = event.target.selectionStart ?? formulaSearchQuery.length;
      const selectionEnd = event.target.selectionEnd ?? selectionStart;
      render('formula-management');
      focusFormulaSearch(selectionStart, selectionEnd);
    }
  });

  refs.businessPageContent?.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;
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

  refs.businessPageContent?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const formulaBackButton = event.target.closest('[data-formula-back-list]');
    if (formulaBackButton && refs.businessPageContent.contains(formulaBackButton)) {
      formulaViewMode = 'list';
      activeFormulaMaterialIndex = null;
      render('formula-management');
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
      activeFormulaId = formulaEditButton.getAttribute('data-formula-edit') || activeFormulaId;
      activeFormulaMaterialIndex = null;
      formulaViewMode = 'edit';
      render('formula-management');
      return;
    }

    const formulaDeleteButton = event.target.closest('[data-formula-delete]');
    if (formulaDeleteButton && refs.businessPageContent.contains(formulaDeleteButton)) {
      deleteFormulaRecipe(formulaDeleteButton.getAttribute('data-formula-delete'));
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
      removeActiveFormulaMaterial(Number(formulaRemoveButton.getAttribute('data-formula-remove-index')));
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
      deleteInventoryMaterial(inventoryDeleteMaterialButton.getAttribute('data-inventory-delete-material') || '');
      render('inventory-management');
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
      deleteInventoryCategory(inventoryDeleteCategoryButton.getAttribute('data-inventory-delete-category') || '');
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
    const formulaAddCard = event.target.closest('[data-formula-add-material]');
    if (!formulaAddCard || !refs.businessPageContent.contains(formulaAddCard)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    formulaAddCard.click();
  });

  App.businessPages = { render };
})();
