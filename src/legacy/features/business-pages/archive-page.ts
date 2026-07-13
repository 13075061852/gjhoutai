export const createArchiveRenderer = (context = {} as any) => {
  const {
    archiveConfigs,
    archiveStates,
    getArchiveCategories,
    getArchiveByCode,
    getAuthUserForRecord,
    normalizeArchiveRecord,
    getNextArchiveCode,
    renderSearchBox,
    renderOptions,
    getArchiveStatusClass,
    formulaPageSizeOptions,
    esc,
  } = context;
  const renderArchive = (kind) => {
    const config = archiveConfigs[kind];
    const state = archiveStates[kind];
    const categories = getArchiveCategories(config, state);
    const categoryTabs = ['全部', ...categories];
    if (!categoryTabs.includes(state.filter)) state.filter = '全部';
    const statusTabs = ['全部', ...new Set([...config.statuses, ...state.rows.map((record) => record.status).filter(Boolean)])];
    if (!statusTabs.includes(state.statusFilter)) state.statusFilter = '全部';
    const normalizedSearch = state.search.trim().toLowerCase();
    const visibleRows = state.rows.filter((record) => {
      const matchedCategory = state.filter === '全部' || record.category === state.filter;
      const matchedStatus = kind !== 'personnel' || state.statusFilter === '全部' || record.status === state.statusFilter;
      const values = [record.code, record.name, record.phone, record.email, record.category, record.address, record.status, record.note];
      const matchedSearch = !normalizedSearch || values.some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchedCategory && matchedStatus && matchedSearch;
    });
    const filteredCount = visibleRows.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const pageStart = (state.page - 1) * state.pageSize;
    const pagedRows = visibleRows.slice(pageStart, pageStart + state.pageSize);
    const editingRecord = state.editingCode ? getArchiveByCode(kind, state.editingCode) : null;
    const editingAuthUser = kind === 'personnel' && editingRecord ? getAuthUserForRecord(editingRecord) : null;
    const formRecord = editingRecord || normalizeArchiveRecord(config, {
      code: getNextArchiveCode(kind),
      category: state.filter === '全部' ? categories[0] || config.categories[0] : state.filter,
      status: config.statuses[0],
    });

    return `
      <div class="biz-supplier-page biz-archive-table-page">
        <section class="business-panel biz-supplier-table-panel biz-archive-table-panel biz-${esc(kind)}-archive-table-panel">
          <div class="biz-formula-table-head biz-supplier-table-head">
            <div class="biz-formula-table-title">
              <i class="ti ${esc(config.icon)}" aria-hidden="true"></i>
              <div>
                <h2>${esc(config.title)}</h2>
              </div>
            </div>
            <div class="biz-formula-table-actions biz-supplier-table-actions biz-archive-table-actions">
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
              ${kind === 'personnel' ? `
                <select data-archive-status-filter="${esc(kind)}" aria-label="状态筛选">
                  ${statusTabs.map((status) => `
                    <option value="${esc(status)}" ${status === state.statusFilter ? 'selected' : ''}>${esc(status === '全部' ? '全部状态' : status)}</option>
                  `).join('')}
                </select>
              ` : ''}
              <button class="biz-formula-new-btn" type="button" data-archive-new="${esc(kind)}">
                <i class="ti ti-plus" aria-hidden="true"></i>
                <span>${esc(config.addText)}</span>
              </button>
            </div>
          </div>
          <div class="ui-table-wrap biz-supplier-table-wrap biz-archive-table-wrap">
            <table class="ui-table ui-table--sticky-header ui-table--comfortable biz-supplier-table biz-archive-table${pagedRows.length ? '' : ' is-empty'}">
              <thead>
                <tr>${config.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${pagedRows.map((record) => `
                  <tr>
                    <td>${esc(record.code)}</td>
                    <td class="biz-supplier-name-cell">${kind === 'customer' ? `<button class="biz-order-code" type="button" data-customer-detail="${esc(record.code)}">${esc(record.name)}</button>` : esc(record.name)}</td>
                    ${kind === 'personnel' ? `
                      <td><span class="biz-formula-chip">${esc(record.category || '未分类')}</span></td>
                      <td>${esc(record.phone || '--')}</td>
                      <td>${esc(record.email || '--')}</td>
                    ` : `
                      <td>${esc(record.contact || '--')}</td>
                      <td>${esc(record.phone || '--')}</td>
                      <td>${esc(record.email || '--')}</td>
                      <td><span class="biz-formula-chip">${esc(record.category || '未分类')}</span></td>
                    `}
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
                `).join('') || `<tr class="biz-archive-empty-row"><td class="biz-archive-empty-cell" colspan="${config.columns.length}"><div class="biz-formula-empty">${esc(config.emptyText)}</div></td></tr>`}
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
                ${kind === 'personnel' ? '' : `
                  <label>
                    <span>联系人</span>
                    <input type="text" value="${esc(formRecord.contact)}" placeholder="联系人" data-archive-field="contact">
                  </label>
                `}
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
                ${kind === 'personnel' ? `
                  <label>
                    <span>登录账号</span>
                    <input type="text" value="${esc(editingAuthUser?.username || '')}" placeholder="例如：zhangsan" data-archive-field="username">
                  </label>
                  <label>
                    <span>${state.editingCode ? '新密码' : '初始密码'}</span>
                    <input type="password" placeholder="${state.editingCode ? '留空则不修改' : '至少 10 位'}" data-archive-field="password">
                  </label>
                ` : ''}
                ${kind === 'personnel' ? '' : `
                  <label class="is-address">
                    <span>地址</span>
                    <textarea placeholder="客户地址" data-archive-field="address">${esc(formRecord.address)}</textarea>
                  </label>
                `}
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


  return renderArchive;
};
