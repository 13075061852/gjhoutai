(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;
  const PAGE_SIZE = 12;

  const state = {
    data: null,
    activeSheet: '',
    query: '',
    page: 1,
  };

  const escapeHtml = (value) => utils.escapeHtml(value);

  const normalizeRows = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  };

  const valueToText = (value) => {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.map((item) => valueToText(item)).join(' ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const summarizeValue = (value) => {
    const text = valueToText(value);
    if (!text) return '—';
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  };

  const getSheetNames = (data) => {
    const sheetNames = Array.isArray(data?.project?.sheetNames) ? data.project.sheetNames : [];
    const fallbackNames = Object.keys(data?.sheets?.raw || {});
    return sheetNames.length ? sheetNames : fallbackNames;
  };

  const getActiveSheet = (data) => {
    const names = getSheetNames(data);
    return state.activeSheet || data?.project?.activeSheetName || names[0] || '';
  };

  const getColumns = (rows) => {
    const columns = [];
    const seen = new Set();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      });
    });
    return columns;
  };

  const filterRows = (rows) => {
    const query = state.query.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => valueToText(row).toLowerCase().includes(query));
  };

  const getPageRows = (rows) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(state.page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return {
      page: safePage,
      totalPages,
      rows: rows.slice(start, start + PAGE_SIZE),
      start,
      end: Math.min(start + PAGE_SIZE, rows.length),
    };
  };

  const buildTable = (rows, columns, emptyText = '暂无数据可展示') => {
    if (!rows.length) {
      return `<div class="analysis-empty">${escapeHtml(emptyText)}</div>`;
    }

    return `
      <div class="analysis-table-shell">
        <div class="analysis-table-scroll">
          <table class="analysis-table">
            <thead>
              <tr>
                ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  ${columns.map((column) => `<td><span title="${escapeHtml(summarizeValue(row[column]))}">${escapeHtml(summarizeValue(row[column]))}</span></td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const renderTabs = (data) => {
    if (!refs.analysisSheetTabs) return;
    const names = getSheetNames(data);
    const activeSheet = getActiveSheet(data);

    refs.analysisSheetTabs.innerHTML = names.map((name) => `
      <button
        type="button"
        class="analysis-sheet-tab${name === activeSheet ? ' is-active' : ''}"
        data-sheet-name="${escapeHtml(name)}">
        ${escapeHtml(name)}
      </button>
    `).join('');
  };

  const renderPagination = (page, totalPages, totalRows) => {
    if (refs.analysisPageInfo) {
      refs.analysisPageInfo.textContent = `第 ${page} 页 / 共 ${totalPages} 页，共 ${totalRows} 条`;
    }
    if (refs.analysisPrevPageBtn) {
      refs.analysisPrevPageBtn.disabled = page <= 1;
    }
    if (refs.analysisNextPageBtn) {
      refs.analysisNextPageBtn.disabled = page >= totalPages;
    }
    if (refs.analysisPagination) {
      refs.analysisPagination.hidden = totalRows === 0;
    }
  };

  const renderPreview = (data) => {
    const rawSheets = data?.sheets?.raw || {};
    const activeSheet = getActiveSheet(data);
    const allRows = normalizeRows(rawSheets[activeSheet]);
    const matchedRows = filterRows(allRows);
    const columns = getColumns(matchedRows.length ? matchedRows : allRows);
    const { page, totalPages, rows, start, end } = getPageRows(matchedRows);

    state.page = page;

    if (refs.analysisTableWrap) {
      const body = buildTable(rows, columns, matchedRows.length ? '暂无符合搜索条件的数据' : '当前 sheet 没有可展示的数据');
      refs.analysisTableWrap.innerHTML = body;
    }

    renderPagination(page, totalPages, matchedRows.length);
  };

  const render = () => {
    if (!state.data) return;
    renderTabs(state.data);
    renderPreview(state.data);
  };

  const loadData = async () => {
    try {
      const response = await fetch(encodeURI(constants.PROPERTY_ANALYSIS_DATA_URL), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      state.data = await response.json();
      state.activeSheet = getActiveSheet(state.data);
      state.page = 1;
      render();
    } catch (error) {
      state.data = null;
      if (refs.analysisSheetTabs) refs.analysisSheetTabs.innerHTML = '';
      if (refs.analysisTableWrap) {
        refs.analysisTableWrap.innerHTML = `<div class="analysis-empty">加载失败：${escapeHtml(error?.message || '未知错误')}</div>`;
      }
      renderPagination(1, 1, 0);
    }
  };

  const bind = () => {
    refs.analysisSheetTabs?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-sheet-name]');
      if (!button || !state.data) return;
      const nextSheet = button.getAttribute('data-sheet-name') || '';
      if (!nextSheet || nextSheet === state.activeSheet) return;
      state.activeSheet = nextSheet;
      state.page = 1;
      render();
    });

    refs.analysisSearchInput?.addEventListener('input', (event) => {
      state.query = event.target.value || '';
      state.page = 1;
      render();
    });

    refs.analysisPrevPageBtn?.addEventListener('click', () => {
      if (state.page <= 1) return;
      state.page -= 1;
      render();
    });

    refs.analysisNextPageBtn?.addEventListener('click', () => {
      state.page += 1;
      render();
    });
  };

  const init = () => {
    bind();
    loadData();
  };

  App.propertyAnalysis = {
    init,
    loadData,
    render,
  };
})();
