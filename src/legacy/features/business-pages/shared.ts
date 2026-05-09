// @ts-nocheck

export const createBusinessPageShared = ({ App, refs, utils, render }) => {
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

  return {
    esc,
    refs,
    renderRows,
    renderSearchBox,
    renderStatStrip,
    renderTable,
    scheduleSearchRender,
  };
};
