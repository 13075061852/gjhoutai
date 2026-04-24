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

  let frozenLayoutRaf = 0;

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

  const isEmptyLikeText = (value) => {
    const text = valueToText(value).trim();
    return !text || /^[-_]+$/.test(text);
  };

  const isPlaceholderColumn = (key) => /^_+empty(?:_\d+)?$/i.test(String(key || '').trim());

  const summarizeValue = (value) => {
    const text = valueToText(value).trim();
    if (!text) return '--';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  };

  const flattenValueParts = (value) => {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => flattenValueParts(item));
    }

    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const normalizedText = text.trim();
    return normalizedText ? [normalizedText] : [];
  };

  const formatCellValue = (value, columnIndex) => {
    const fallbackText = summarizeValue(value);
    if (columnIndex < 3) return fallbackText;

    const parts = flattenValueParts(value);
    if (!parts.length) return fallbackText;

    const wrappedText = parts.map((part) => `[${part}]`).join(' ');
    return wrappedText.length > 120 ? `${wrappedText.slice(0, 117)}...` : wrappedText;
  };

  const parseNumericValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = String(value ?? '').trim();
    if (!text) return null;

    const normalized = text.replace(/,/g, '');
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getValuePrecision = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const text = String(value);
      if (!text.includes('.')) return 0;
      return text.split('.')[1].length;
    }

    const text = String(value ?? '').trim().replace(/,/g, '');
    if (!text.includes('.')) return 0;
    return text.split('.')[1].length;
  };

  const formatAverageValue = (values) => {
    if (!values.length) return '';

    const total = values.reduce((sum, item) => sum + item.value, 0);
    const average = total / values.length;
    const maxPrecision = values.reduce((result, item) => Math.max(result, item.precision), 0);
    const precision = maxPrecision > 0 ? Math.min(Math.max(maxPrecision, 2), 4) : 0;

    if (precision === 0) return String(Math.round(average));
    return average.toFixed(precision).replace(/\.?0+$/, '');
  };

  const getCellDisplayData = (value, columnIndex) => {
    const text = formatCellValue(value, columnIndex);
    const result = {
      text,
      html: `<span class="analysis-cell-main">${escapeHtml(text)}</span>`,
    };

    if (columnIndex < 3 || !Array.isArray(value) || value.length < 2) {
      return result;
    }

    const numericValues = value
      .map((item) => ({
        value: parseNumericValue(item),
        precision: getValuePrecision(item),
      }))
      .filter((item) => item.value != null);

    if (numericValues.length < 2) {
      return result;
    }

    const averageText = formatAverageValue(numericValues);
    if (!averageText) {
      return result;
    }

    result.text = `${text} (${averageText})`;
    result.html = `<span class="analysis-cell-main">${escapeHtml(text)}</span> <span class="analysis-cell-avg">(${escapeHtml(averageText)})</span>`;
    return result;
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
        if (isPlaceholderColumn(key) || seen.has(key)) return;

        const hasMeaningfulValue = rows.some((candidateRow) => !isEmptyLikeText(candidateRow?.[key]));
        if (!hasMeaningfulValue) return;

        seen.add(key);
        columns.push(key);
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
    };
  };

  const scheduleFrozenColumnWidths = () => {
    if (frozenLayoutRaf) {
      window.cancelAnimationFrame(frozenLayoutRaf);
    }

    frozenLayoutRaf = window.requestAnimationFrame(() => {
      frozenLayoutRaf = 0;
      syncFrozenColumnWidths();
    });
  };

  const syncFrozenColumnWidths = () => {
    const table = refs.analysisTableWrap?.querySelector('.analysis-table');
    if (!table) return;

    const firstCell = table.querySelector('thead th:nth-child(1)');
    const secondCell = table.querySelector('thead th:nth-child(2)');

    if (!firstCell) return;

    const firstWidth = Math.ceil(firstCell.getBoundingClientRect().width);
    const secondWidth = secondCell ? Math.ceil(secondCell.getBoundingClientRect().width) : 0;

    table.style.setProperty('--analysis-frozen-col-1', `${firstWidth}px`);
    table.style.setProperty('--analysis-frozen-col-2', `${secondWidth}px`);
  };

  const buildTable = (rows, columns, emptyText = '暂无数据可展示') => {
    if (!rows.length || !columns.length) {
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
                  ${columns.map((column, columnIndex) => {
                    const cell = getCellDisplayData(row[column], columnIndex);
                    return `<td><span class="analysis-cell" title="${escapeHtml(cell.text)}">${cell.html}</span></td>`;
                  }).join('')}
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
      refs.analysisPageInfo.textContent = `第 ${page} 页 / 共 ${totalPages} 页`;
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
    const { page, totalPages, rows } = getPageRows(matchedRows);

    state.page = page;

    if (refs.analysisTableWrap) {
      const body = buildTable(
        rows,
        columns,
        matchedRows.length ? '暂无符合搜索条件的数据' : '当前 sheet 没有可展示的数据'
      );
      refs.analysisTableWrap.innerHTML = body;
      scheduleFrozenColumnWidths();
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

      if (refs.analysisSheetTabs) {
        refs.analysisSheetTabs.innerHTML = '';
      }

      if (refs.analysisTableWrap) {
        refs.analysisTableWrap.innerHTML = buildTable([], [], '物性数据加载失败，请检查数据文件或编码格式。');
      }

      renderPagination(1, 1, 0);
      console.error('[property-analysis] Failed to load data:', error);
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

    window.addEventListener('resize', scheduleFrozenColumnWidths);
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
