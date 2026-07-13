
const primaryButtonPattern = /(?:^|\s)(?:[^\s]*primary-btn|biz-formula-new-btn|is-primary|is-schedule)(?:\s|$)/;
const standardButtonPattern = /(?:^|\s)(?:[^\s]*(?:ghost|icon|back)-btn|biz-formula-page-btn|biz-formula-add-row-btn)(?:\s|$)/;
const dangerButtonPattern = /(?:^|\s)(?:[^\s]*danger-btn|is-danger)(?:\s|$)/;

export const decorateBusinessUiMarkup = (html = '') => String(html).replace(
  /<button\b([^>]*?)class="([^"]+)"([^>]*)>/g,
  (match, before, className, after) => {
    if (/(?:^|\s)ui-button(?:\s|$)/.test(className)) return match;
    const sharedClasses = dangerButtonPattern.test(className)
      ? 'ui-button ui-button--danger'
      : primaryButtonPattern.test(className)
        ? 'ui-button ui-button--primary'
        : standardButtonPattern.test(className)
          ? `ui-button${/(?:^|\s)biz-formula-page-btn(?:\s|$)/.test(className) ? ' ui-button--sm' : ''}`
          : '';
    return sharedClasses
      ? `<button${before}class="${sharedClasses} ${className}"${after}>`
      : match;
  },
);

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
    <section class="ui-stat-grid biz-stat-strip">
      ${items.map(([label, value, note = '']) => `
        <article class="ui-stat-card">
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
    <section class="ui-panel business-panel biz-table-panel">
      <div class="ui-toolbar business-panel-head">
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
    decorateBusinessUiMarkup,
    refs,
    renderRows,
    renderSearchBox,
    renderStatStrip,
    renderTable,
    scheduleSearchRender,
  };
};
