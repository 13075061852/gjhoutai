(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { constants, utils } = App;
  const PAGE_SIZE_DEFAULT = 12;
  const HEADER_LABELS = {
    型号: '型号',
    批次: '批次',
    测试温度: '测试温度(℃)',
    熔指: '熔指(g/10min)',
    '拉伸强度[Mpa]': '拉伸强度(MPa)',
    '断裂伸长率[%]': '断裂伸长率(%)',
    '弯曲强度[Mpa]': '弯曲强度(MPa)',
    '弯曲模量[Mpa]': '弯曲模量(MPa)',
    '冲击强度[Mpa]': '冲击强度(kJ/m²)',
    灼热丝: '灼热丝',
    '灼热丝[1.6mm]': '灼热丝[1.6mm]',
    '灼热丝[0.8mm]': '灼热丝[0.8mm]',
    '漏电起痕(CTI)': '漏电起痕(CTI)',
    灰份: '灰份(%)',
  };

  const COLUMN_PRIORITY = [
    '型号',
    '批次',
    '测试温度',
    '熔指',
    '拉伸强度[Mpa]',
    '断裂伸长率[%]',
    '弯曲强度[Mpa]',
    '弯曲模量[Mpa]',
    '冲击强度[Mpa]',
    '灰份',
    '灼热丝[1.6mm]',
    '灼热丝[0.8mm]',
    '漏电起痕(CTI)',
    'T1[3.2mm]',
    'T2[3.2mm]',
    'T1[1.6mm]',
    'T2[1.6mm]',
    'T1[0.8mm]',
    'T2[0.8mm]',
  ];
  const SEARCH_KEYS = ['型号', '批次'];

  const refs = {
    searchInput: document.getElementById('analysisSearchInput'),
    searchMode: document.getElementById('analysisSearchMode'),
    searchSuggest: document.getElementById('analysisSearchSuggest'),
    sheetTabs: document.getElementById('analysisSheetTabs'),
    tableWrap: document.getElementById('analysisTableWrap'),
    prevPageBtn: document.getElementById('analysisPrevPageBtn'),
    nextPageBtn: document.getElementById('analysisNextPageBtn'),
    pagination: document.getElementById('analysisPagination'),
    pageNumbers: document.getElementById('analysisPageNumbers'),
    selectAllBtn: document.getElementById('analysisSelectAllBtn'),
    compareBtn: document.getElementById('analysisCompareBtn'),
    exportBtn: document.getElementById('analysisExportBtn'),
    panelCount: document.getElementById('analysisPanelCount'),
    footerTotal: document.getElementById('analysisFooterTotal'),
    selectionMeta: document.getElementById('analysisSelectionMeta'),
    sortSelect: document.getElementById('analysisSortSelect'),
    pageSizeSelect: document.getElementById('analysisPageSizeSelect'),
  };

  const state = {
    data: null,
    activeSheet: '',
    query: '',
    page: 1,
    pageSize: PAGE_SIZE_DEFAULT,
    sort: 'default',
    searchMode: 'fuzzy',
    searchSuggestions: [],
    suggestionIndex: -1,
    suggestionOpen: false,
    compareOnly: false,
    selectedKeys: new Set(),
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

  const flattenSearchTexts = (value) => {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => flattenSearchTexts(item));
    }
    if (typeof value === 'object') {
      return Object.values(value).flatMap((item) => flattenSearchTexts(item));
    }
    return [String(value).trim().toLowerCase()].filter(Boolean);
  };

  const toDisplayText = (value) => {
    if (value == null || value === '') return '';
    return String(value).trim();
  };

  const isPlaceholderColumn = (key) => /^_+empty(?:_\d+)?$/i.test(String(key || '').trim());

  const hasMeaningfulValue = (value) => {
    const text = valueToText(value).trim();
    return Boolean(text && !/^[-_]+$/.test(text));
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

  const getPrecision = (value) => {
    const text = String(value ?? '').trim();
    if (!text.includes('.')) return 0;
    return text.split('.')[1].length;
  };

  const getAverageText = (values) => {
    const numericValues = values
      .map((item) => parseNumericValue(item))
      .filter((item) => item != null);

    if (!numericValues.length) return '';

    const precision = Math.min(
      Math.max(...values.map((item) => getPrecision(item)), 0, 2),
      4
    );

    const average = numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length;
    return average.toFixed(precision).replace(/\.?0+$/, '');
  };

  const getMetricValue = (row, key) => {
    const value = row?.[key];
    if (Array.isArray(value)) {
      const numericValues = value
        .map((item) => parseNumericValue(item))
        .filter((item) => item != null);

      if (numericValues.length) {
        return numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length;
      }
    }

    return parseNumericValue(value);
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

  const getRowsForSheet = (sheetName) => {
    const rows = normalizeRows(state.data?.sheets?.raw?.[sheetName]);
    return rows.map((row, index) => ({
      ...row,
      __rowKey: `${sheetName}::${row.型号 || '未命名'}::${row.批次 || '无批次'}::${index}`,
    }));
  };

  const getSuggestionItems = () => {
    const query = state.query.trim().toLowerCase();
    if (!query || !state.data) return [];

    const rows = getRowsForSheet(getActiveSheet(state.data));
    const seen = new Set();
    const items = [];

    rows.forEach((row) => {
      SEARCH_KEYS.forEach((key) => {
        const rawValue = row?.[key];
        const displayValue = toDisplayText(rawValue);
        const searchValue = displayValue.toLowerCase();
        if (!displayValue || seen.has(`${key}::${searchValue}`)) return;
        if (!searchValue.includes(query)) return;

        seen.add(`${key}::${searchValue}`);
        items.push({
          key,
          value: displayValue,
          matchIndex: searchValue.indexOf(query),
        });
      });
    });

    items.sort((left, right) => {
      if (left.matchIndex !== right.matchIndex) return left.matchIndex - right.matchIndex;
      return left.value.localeCompare(right.value, 'zh-CN');
    });

    return items.slice(0, 8);
  };

  const highlightSuggestion = (value, query) => {
    const lowerValue = value.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerValue.indexOf(lowerQuery);
    if (index < 0 || !query) return escapeHtml(value);

    const before = escapeHtml(value.slice(0, index));
    const match = escapeHtml(value.slice(index, index + query.length));
    const after = escapeHtml(value.slice(index + query.length));
    return `${before}<span class="analysis-search-suggest-mark">${match}</span>${after}`;
  };

  const renderSuggestions = () => {
    if (!refs.searchSuggest) return;

    const suggestions = state.searchSuggestions;
    if (!state.suggestionOpen || !suggestions.length) {
      state.suggestionIndex = -1;
      refs.searchSuggest.hidden = true;
      refs.searchSuggest.innerHTML = '';
      return;
    }

    if (state.suggestionIndex >= suggestions.length) {
      state.suggestionIndex = suggestions.length - 1;
    }

    const query = state.query.trim();
    refs.searchSuggest.hidden = false;
    refs.searchSuggest.innerHTML = `
      <div class="analysis-search-suggest-list">
        ${suggestions.map((item, index) => `
          <button
            class="analysis-search-suggest-item${index === state.suggestionIndex ? ' is-active' : ''}"
            type="button"
            data-suggest-index="${index}"
            data-suggest-value="${escapeHtml(item.value)}">
            <span class="analysis-search-suggest-type">${escapeHtml(item.key)}</span>
            <span class="analysis-search-suggest-text">${highlightSuggestion(item.value, query)}</span>
          </button>
        `).join('')}
      </div>
    `;
  };

  const applySuggestionValue = (nextValue) => {
    if (!refs.searchInput) return;
    refs.searchInput.value = nextValue;
    state.query = nextValue;
    state.suggestionOpen = false;
    state.suggestionIndex = -1;
    state.page = 1;
    render();
  };

  const getColumns = (rows) => {
    const seen = new Set();
    const columns = [];

    COLUMN_PRIORITY.forEach((key) => {
      if (!rows.some((row) => hasMeaningfulValue(row?.[key]))) return;
      seen.add(key);
      columns.push(key);
    });

    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key === '__rowKey' || seen.has(key) || isPlaceholderColumn(key)) return;
        if (!rows.some((item) => hasMeaningfulValue(item?.[key]))) return;
        seen.add(key);
        columns.push(key);
      });
    });

    return columns;
  };

  const formatHeader = (key) => HEADER_LABELS[key] || key;

  const getCellDisplay = (value, columnKey) => {
    if (value == null || value === '') {
      return {
        html: '<span class="analysis-cell-main">--</span>',
        title: '--',
      };
    }

    if (Array.isArray(value)) {
      const main = value.map((item) => `[${item}]`).join(' ');
      const averageText = getAverageText(value);
      return {
        html: `
          <span class="analysis-cell-main">${escapeHtml(main)}</span>
          ${averageText ? `<span class="analysis-cell-avg">(${escapeHtml(averageText)})</span>` : ''}
        `,
        title: `${formatHeader(columnKey)}: ${main}${averageText ? ` (均值 ${averageText})` : ''}`,
      };
    }

    const main = String(value);
    return {
      html: `<span class="analysis-cell-main">${escapeHtml(main)}</span>`,
      title: `${formatHeader(columnKey)}: ${main}`,
    };
  };

  const filterRows = (rows) => {
    const query = state.query.trim().toLowerCase();
    let nextRows = rows;

    if (query) {
      nextRows = nextRows.filter((row) => {
        const searchValues = SEARCH_KEYS.flatMap((key) => flattenSearchTexts(row?.[key]));

        if (state.searchMode === 'exact') {
          return searchValues.some((text) => text === query);
        }

        return searchValues.some((text) => text.includes(query));
      });
    }

    if (state.compareOnly) {
      nextRows = nextRows.filter((row) => state.selectedKeys.has(row.__rowKey));
    }

    return nextRows;
  };

  const sortRows = (rows) => {
    const nextRows = [...rows];

    if (state.sort === 'model-asc') {
      nextRows.sort((left, right) => String(left.型号 || '').localeCompare(String(right.型号 || ''), 'zh-CN'));
      return nextRows;
    }

    if (state.sort === 'model-desc') {
      nextRows.sort((left, right) => String(right.型号 || '').localeCompare(String(left.型号 || ''), 'zh-CN'));
      return nextRows;
    }

    if (state.sort === 'mfi-desc') {
      nextRows.sort((left, right) => {
        const a = getMetricValue(left, '熔指') ?? Number.NEGATIVE_INFINITY;
        const b = getMetricValue(right, '熔指') ?? Number.NEGATIVE_INFINITY;
        return b - a;
      });
      return nextRows;
    }

    return nextRows;
  };

  const paginateRows = (rows) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    const currentPage = Math.min(Math.max(state.page, 1), totalPages);
    const start = (currentPage - 1) * state.pageSize;

    return {
      currentPage,
      totalPages,
      rows: rows.slice(start, start + state.pageSize),
    };
  };

  const getVisibleRows = () => {
    if (!state.data) {
      return {
        rows: [],
        allRows: [],
        filteredRows: [],
        columns: [],
        currentPage: 1,
        totalPages: 1,
      };
    }

    const sheetName = getActiveSheet(state.data);
    const allRows = getRowsForSheet(sheetName);
    const filteredRows = sortRows(filterRows(allRows));
    const columns = getColumns(filteredRows.length ? filteredRows : allRows);
    const { rows, currentPage, totalPages } = paginateRows(filteredRows);

    state.page = currentPage;

    return {
      rows,
      allRows,
      filteredRows,
      columns,
      currentPage,
      totalPages,
    };
  };

  const isAllFilteredSelected = (rows) => {
    if (!rows.length) return false;
    return rows.every((row) => state.selectedKeys.has(row.__rowKey));
  };

  const updateToolbarState = (filteredRows) => {
    const selectedCount = state.selectedKeys.size;
    const allSelected = isAllFilteredSelected(filteredRows);

    if (refs.selectionMeta) {
      refs.selectionMeta.textContent = `已选 ${selectedCount} 条`;
    }

    if (refs.compareBtn) {
      refs.compareBtn.disabled = selectedCount < 2;
      refs.compareBtn.classList.toggle('is-active', state.compareOnly);
      refs.compareBtn.querySelector('span').textContent = state.compareOnly ? '退出对比' : '对比';
    }

    if (refs.selectAllBtn) {
      refs.selectAllBtn.classList.toggle('is-active', allSelected);
      refs.selectAllBtn.querySelector('span').textContent = allSelected ? '取消全选' : '全选';
    }
  };

  const buildTable = (rows, columns) => {
    if (!rows.length || !columns.length) {
      return '<div class="analysis-empty">暂无符合条件的数据，请调整筛选条件后重试。</div>';
    }

    return `
      <div class="analysis-table-shell">
        <div class="analysis-table-scroll">
          <table class="analysis-table">
            <thead>
              <tr>
                <th class="analysis-check-col">
                  <label class="analysis-check">
                    <input id="analysisTableSelectAll" type="checkbox" ${isAllFilteredSelected(getVisibleRows().filteredRows) ? 'checked' : ''} />
                    <span></span>
                  </label>
                </th>
                ${columns.map((column) => `<th>${escapeHtml(formatHeader(column))}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td class="analysis-check-col">
                    <label class="analysis-check">
                      <input class="analysis-row-check" type="checkbox" data-row-key="${escapeHtml(row.__rowKey)}" ${state.selectedKeys.has(row.__rowKey) ? 'checked' : ''} />
                      <span></span>
                    </label>
                  </td>
                  ${columns.map((column) => {
                    const cell = getCellDisplay(row[column], column);
                    return `
                      <td title="${escapeHtml(cell.title)}">
                        <div class="analysis-cell">${cell.html}</div>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const getPaginationItems = (currentPage, totalPages) => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items = [1];

    if (currentPage > 3) items.push('ellipsis-left');

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let page = start; page <= end; page += 1) {
      items.push(page);
    }

    if (currentPage < totalPages - 2) items.push('ellipsis-right');

    items.push(totalPages);
    return items;
  };

  const renderPagination = (currentPage, totalPages) => {
    if (refs.prevPageBtn) refs.prevPageBtn.disabled = currentPage <= 1;
    if (refs.nextPageBtn) refs.nextPageBtn.disabled = currentPage >= totalPages;

    if (refs.pageNumbers) {
      refs.pageNumbers.innerHTML = getPaginationItems(currentPage, totalPages).map((item) => {
        if (typeof item !== 'number') {
          return '<span class="analysis-page-ellipsis">...</span>';
        }

        return `
          <button
            class="analysis-page-number${item === currentPage ? ' is-active' : ''}"
            type="button"
            data-page-number="${item}">
            ${item}
          </button>
        `;
      }).join('');
    }
  };

  const renderTabs = () => {
    if (!refs.sheetTabs || !state.data) return;

    const names = getSheetNames(state.data);
    const activeSheet = getActiveSheet(state.data);

    refs.sheetTabs.innerHTML = names.map((name) => `
      <button
        type="button"
        class="analysis-sheet-tab${name === activeSheet ? ' is-active' : ''}"
        data-sheet-name="${escapeHtml(name)}">
        ${escapeHtml(name.trim() || '未命名')}
      </button>
    `).join('');
  };

  const render = () => {
    const { rows, filteredRows, columns, currentPage, totalPages } = getVisibleRows();

    renderTabs();

    if (refs.searchMode) {
      refs.searchMode.querySelectorAll('[data-search-mode]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-search-mode') === state.searchMode);
      });
    }

    if (refs.tableWrap) {
      refs.tableWrap.innerHTML = buildTable(rows, columns);
    }

    state.searchSuggestions = getSuggestionItems();
    if (state.suggestionOpen && state.searchSuggestions.length && state.suggestionIndex < 0) {
      state.suggestionIndex = 0;
    }
    renderSuggestions();

    const totalText = `共 ${filteredRows.length} 条`;
    if (refs.panelCount) refs.panelCount.textContent = totalText;
    if (refs.footerTotal) refs.footerTotal.textContent = totalText;
    if (refs.pagination) refs.pagination.hidden = filteredRows.length === 0;

    updateToolbarState(filteredRows);
    renderPagination(currentPage, totalPages);
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportCurrentSheet = () => {
    const { filteredRows, columns } = getVisibleRows();
    if (!filteredRows.length || !columns.length) return;

    const header = columns.map((column) => `"${formatHeader(column).replace(/"/g, '""')}"`).join(',');
    const lines = filteredRows.map((row) => columns.map((column) => {
      const value = row[column];
      const text = Array.isArray(value) ? value.join(' / ') : valueToText(value);
      return `"${String(text).replace(/"/g, '""')}"`;
    }).join(','));

    const csvText = ['\uFEFF' + header, ...lines].join('\r\n');
    const fileName = `${state.activeSheet || '物性分析'}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }), fileName);
  };

  const toggleSelectAllFiltered = () => {
    const { filteredRows } = getVisibleRows();
    const shouldSelect = !isAllFilteredSelected(filteredRows);

    filteredRows.forEach((row) => {
      if (shouldSelect) {
        state.selectedKeys.add(row.__rowKey);
      } else {
        state.selectedKeys.delete(row.__rowKey);
      }
    });

    if (state.compareOnly && state.selectedKeys.size < 2) {
      state.compareOnly = false;
    }

    render();
  };

  const toggleCompareMode = () => {
    if (state.selectedKeys.size < 2) return;
    state.compareOnly = !state.compareOnly;
    state.page = 1;
    render();
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

      if (refs.sheetTabs) refs.sheetTabs.innerHTML = '';
      if (refs.tableWrap) {
        refs.tableWrap.innerHTML = '<div class="analysis-empty">物性数据加载失败，请检查数据文件或编码格式。</div>';
      }
      if (refs.panelCount) refs.panelCount.textContent = '共 0 条';
      if (refs.footerTotal) refs.footerTotal.textContent = '共 0 条';
      if (refs.selectionMeta) refs.selectionMeta.textContent = '已选 0 条';
      if (refs.pagination) refs.pagination.hidden = true;

      console.error('[property-analysis] Failed to load data:', error);
    }
  };

  const bind = () => {
    refs.sheetTabs?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-sheet-name]');
      if (!button) return;

      const nextSheet = button.getAttribute('data-sheet-name') || '';
      if (!nextSheet || nextSheet === state.activeSheet) return;

      state.activeSheet = nextSheet;
      state.page = 1;
      render();
    });

    refs.searchInput?.addEventListener('input', (event) => {
      state.query = event.target.value || '';
      state.suggestionOpen = true;
      state.suggestionIndex = -1;
      state.page = 1;
      render();
    });

    refs.searchInput?.addEventListener('focus', () => {
      state.suggestionOpen = true;
      state.searchSuggestions = getSuggestionItems();
      state.suggestionIndex = state.searchSuggestions.length ? 0 : -1;
      renderSuggestions();
    });

    refs.searchInput?.addEventListener('keydown', (event) => {
      if (!state.suggestionOpen || !state.searchSuggestions.length) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.suggestionIndex = Math.min(state.suggestionIndex + 1, state.searchSuggestions.length - 1);
        renderSuggestions();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.suggestionIndex = Math.max(state.suggestionIndex - 1, 0);
        renderSuggestions();
        return;
      }

      if (event.key === 'Enter') {
        if (state.suggestionIndex < 0 || state.suggestionIndex >= state.searchSuggestions.length) return;
        event.preventDefault();
        applySuggestionValue(state.searchSuggestions[state.suggestionIndex].value);
        return;
      }

      if (event.key === 'Escape') {
        state.suggestionOpen = false;
        state.suggestionIndex = -1;
        renderSuggestions();
      }
    });

    refs.searchMode?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-search-mode]');
      if (!button) return;

      const nextMode = button.getAttribute('data-search-mode');
      if (!nextMode || nextMode === state.searchMode) return;

      state.searchMode = nextMode;
      state.page = 1;
      render();
    });

    refs.searchSuggest?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggest-value]');
      if (!button || !refs.searchInput) return;

      const nextValue = button.getAttribute('data-suggest-value') || '';
      applySuggestionValue(nextValue);
    });

    refs.sortSelect?.addEventListener('change', (event) => {
      state.sort = event.target.value || 'default';
      state.page = 1;
      render();
    });

    refs.pageSizeSelect?.addEventListener('change', (event) => {
      const nextSize = Number.parseInt(event.target.value, 10);
      state.pageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : PAGE_SIZE_DEFAULT;
      state.page = 1;
      render();
    });

    refs.prevPageBtn?.addEventListener('click', () => {
      if (state.page <= 1) return;
      state.page -= 1;
      render();
    });

    refs.nextPageBtn?.addEventListener('click', () => {
      state.page += 1;
      render();
    });

    refs.pageNumbers?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-number]');
      if (!button) return;

      const nextPage = Number.parseInt(button.getAttribute('data-page-number') || '', 10);
      if (!Number.isFinite(nextPage)) return;

      state.page = nextPage;
      render();
    });

    refs.tableWrap?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.id === 'analysisTableSelectAll') {
        toggleSelectAllFiltered();
        return;
      }

      if (!target.classList.contains('analysis-row-check')) return;

      const rowKey = target.getAttribute('data-row-key');
      if (!rowKey) return;

      if (target.checked) {
        state.selectedKeys.add(rowKey);
      } else {
        state.selectedKeys.delete(rowKey);
        if (state.compareOnly && state.selectedKeys.size < 2) {
          state.compareOnly = false;
        }
      }

      render();
    });

    refs.selectAllBtn?.addEventListener('click', toggleSelectAllFiltered);
    refs.compareBtn?.addEventListener('click', toggleCompareMode);
    refs.exportBtn?.addEventListener('click', exportCurrentSheet);

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        refs.searchInput?.contains?.(target) ||
        refs.searchMode?.contains?.(target) ||
        refs.searchSuggest?.contains?.(target)
      ) {
        return;
      }

      state.suggestionOpen = false;
      state.suggestionIndex = -1;
      renderSuggestions();
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
