(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { constants, utils } = App;
  const PAGE_SIZE_DEFAULT = 15;
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
    panel: document.getElementById('analysisPanel'),
    tableWrap: document.getElementById('analysisTableWrap'),
    prevPageBtn: document.getElementById('analysisPrevPageBtn'),
    nextPageBtn: document.getElementById('analysisNextPageBtn'),
    pagination: document.getElementById('analysisPagination'),
    pageNumbers: document.getElementById('analysisPageNumbers'),
    selectAllBtn: document.getElementById('analysisSelectAllBtn'),
    compareBtn: document.getElementById('analysisCompareBtn'),
    exportBtn: document.getElementById('analysisExportBtn'),
    importExcelBtn: document.getElementById('analysisImportExcelBtn'),
    exportJsonBtn: document.getElementById('analysisExportJsonBtn'),
    excelInput: document.getElementById('analysisExcelInput'),
    importStatus: document.getElementById('analysisImportStatus'),
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
    dataSource: 'default',
    sourceFileName: '',
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

  const normalizeCellValue = (value) => {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    return value;
  };

  const isBlankCell = (value) => {
    const normalized = normalizeCellValue(value);
    return normalized == null || normalized === '';
  };

  const normalizeHeaderName = (value, index) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || `_empty_${index + 1}`;
  };

  const formatDateValue = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}/${value.getMonth() + 1}/${value.getDate()}`;
  };

  const normalizeParsedValue = (value, key = '') => {
    const normalized = normalizeCellValue(value);
    if (normalized === '') return '';

    if (normalized instanceof Date) return formatDateValue(normalized);

    if (typeof normalized === 'number' || typeof normalized === 'boolean') return normalized;

    const text = String(normalized).trim();
    if (!text) return '';

    if (key === '测试温度') {
      const temperature = parseNumericValue(text.replace(/[℃°]/g, ''));
      return temperature == null ? text : temperature;
    }

    const numeric = parseNumericValue(text);
    return numeric == null ? text : numeric;
  };

  const isLikelyDateFormat = (format) => {
    const text = String(format || '').toLowerCase();
    if (!text) return false;
    return /(^|[^a-z])([ymd]{1,4})([^a-z]|$)/.test(text)
      || text.includes('年')
      || text.includes('月')
      || text.includes('日');
  };

  const formatExcelDateCode = (serial) => {
    if (!window.XLSX?.SSF?.parse_date_code) return '';
    const parsed = window.XLSX.SSF.parse_date_code(serial);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return '';
    return `${parsed.y}/${parsed.m}/${parsed.d}`;
  };

  const getWorksheetCellValue = (worksheet, rowIndex, columnIndex) => {
    const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    const cell = worksheet[address];
    if (!cell) return '';

    if (cell.v instanceof Date) {
      return formatDateValue(cell.v);
    }

    if (typeof cell.v === 'number' && isLikelyDateFormat(cell.z || cell.w)) {
      const dateText = formatExcelDateCode(cell.v);
      if (dateText) return dateText;
    }

    return cell.v ?? '';
  };

  const getWorksheetRows = (worksheet) => {
    const range = window.XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const rows = [];

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const row = [];
      let hasValue = false;

      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const value = getWorksheetCellValue(worksheet, rowIndex, columnIndex);
        row.push(value);
        if (!isBlankCell(value)) hasValue = true;
      }

      if (hasValue) rows.push(row);
    }

    return rows;
  };

  const isRepeatedHeaderValue = (value, header) => {
    if (isBlankCell(value)) return false;
    return String(value).replace(/\s+/g, ' ').trim() === String(header || '').trim();
  };

  const compactParsedRow = (row) => {
    const next = {};
    Object.entries(row).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (!value.length) return;
        next[key] = value.length === 1 ? value[0] : value;
        return;
      }

      if (!hasMeaningfulValue(value)) return;
      next[key] = value;
    });
    return next;
  };

  const parseWorksheetRows = (rows) => {
    if (!Array.isArray(rows) || !rows.length) return [];

    const headers = (rows[0] || []).map((value, index) => normalizeHeaderName(value, index));
    const records = [];
    let current = null;

    const flush = () => {
      if (!current) return;
      const row = compactParsedRow(current);
      if (hasMeaningfulValue(row.型号) || hasMeaningfulValue(row.批次)) {
        records.push(row);
      }
      current = null;
    };

    rows.slice(1).forEach((sourceRow) => {
      if (!Array.isArray(sourceRow) || sourceRow.every(isBlankCell)) return;

      const model = normalizeParsedValue(sourceRow[0], headers[0]);
      const batch = normalizeParsedValue(sourceRow[1], headers[1]);
      const temperature = normalizeParsedValue(sourceRow[2], headers[2]);
      const startsRecord = [model, batch, temperature].some((value) => hasMeaningfulValue(value));

      if (startsRecord) {
        flush();
        current = {};
        if (hasMeaningfulValue(model)) current[headers[0]] = model;
        if (hasMeaningfulValue(batch)) current[headers[1]] = batch;
        if (hasMeaningfulValue(temperature)) current[headers[2]] = temperature;
      }

      if (!current) return;

      headers.forEach((header, columnIndex) => {
        if (columnIndex < 3 || isPlaceholderColumn(header)) return;

        const cellValue = sourceRow[columnIndex];
        if (isBlankCell(cellValue) || isRepeatedHeaderValue(cellValue, header)) return;

        const parsedValue = normalizeParsedValue(cellValue, header);
        if (!hasMeaningfulValue(parsedValue)) return;

        if (!Array.isArray(current[header])) current[header] = [];
        current[header].push(parsedValue);
      });
    });

    flush();
    return records;
  };

  const parseExcelWorkbook = async (file) => {
    if (!window.XLSX) {
      throw new Error('Excel解析库未加载，请检查网络后重试。');
    }

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      raw: true,
    });

    const sheetNames = workbook.SheetNames || [];
    const raw = {};

    sheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = getWorksheetRows(worksheet);
      raw[sheetName] = parseWorksheetRows(rows);
    });

    const activeSheetName = sheetNames.find((name) => normalizeRows(raw[name]).length) || sheetNames[0] || '';

    return {
      project: {
        file: {
          name: file.name,
          size: file.size,
        },
        sheetNames,
        activeSheetName,
        exportedAt: new Date().toISOString(),
      },
      sheets: {
        raw,
        merged: JSON.parse(JSON.stringify(raw)),
      },
      currentView: {
        processedData: activeSheetName ? normalizeRows(raw[activeSheetName]) : [],
        compareItems: [],
        pagination: {
          currentPage: 1,
          pageSize: state.pageSize,
        },
        config: {
          parser: 'browser-xlsx',
          encoding: 'utf-8',
        },
      },
    };
  };

  const getOssConfig = () => {
    const config = App.config?.loadSavedConfig?.() || constants.DEFAULT_CONFIG || {};
    const bucket = String(config.ossBucket || '').trim();
    const endpoint = String(config.ossEndpoint || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const objectKey = String(config.ossObjectKey || '').trim().replace(/^\/+/, '');
    return {
      bucket,
      endpoint,
      objectKey,
      accessKeyId: String(config.ossAccessKeyId || '').trim(),
      accessKeySecret: String(config.ossAccessKeySecret || '').trim(),
      excelBackupPrefix: String(config.ossExcelBackupPrefix || '').trim().replace(/^\/+/, ''),
    };
  };

  const hasOssReadConfig = (config) => Boolean(config.bucket && config.endpoint && config.objectKey);

  const hasOssWriteConfig = (config) => Boolean(
    config.bucket && config.endpoint && config.objectKey && config.accessKeyId && config.accessKeySecret
  );

  const encodeOssObjectKey = (objectKey) => String(objectKey || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const getOssObjectUrl = (config, objectKey = config.objectKey) => {
    const endpoint = String(config.endpoint || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${config.bucket}.${endpoint}/${encodeOssObjectKey(objectKey)}`;
  };

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const hmacSha1Base64 = async (secret, message) => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return arrayBufferToBase64(signature);
  };

  const utf8ToBase64 = (value) => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const postOssObject = async ({ config, objectKey, body, contentType }) => {
    const policy = {
      expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      conditions: [
        ['eq', '$key', objectKey],
        ['content-length-range', 0, 100 * 1024 * 1024],
      ],
    };
    const encodedPolicy = utf8ToBase64(JSON.stringify(policy));
    const signature = await hmacSha1Base64(config.accessKeySecret, encodedPolicy);
    const formData = new FormData();

    formData.append('key', objectKey);
    formData.append('OSSAccessKeyId', config.accessKeyId);
    formData.append('policy', encodedPolicy);
    formData.append('Signature', signature);
    formData.append('success_action_status', '200');
    formData.append('Content-Type', contentType);
    formData.append('file', body);

    const response = await fetch(`https://${config.bucket}.${config.endpoint}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OSS上传失败：HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ''}`);
    }
  };

  const buildExcelBackupKey = (prefix, fileName) => {
    const safePrefix = String(prefix || '').replace(/^\/+/, '').replace(/\/?$/, '/');
    const baseName = String(fileName || 'property-data.xlsx').replace(/[\\/:*?"<>|]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${safePrefix}${stamp}-${baseName}`;
  };

  const uploadPropertyDataToOss = async (data, sourceFile) => {
    const config = getOssConfig();
    if (!hasOssWriteConfig(config)) {
      throw new Error('请先在 AI 配置中心填写 OSS Bucket、Endpoint、JSON 路径和 AccessKey。');
    }

    const jsonText = JSON.stringify(data, null, 2);
    await postOssObject({
      config,
      objectKey: config.objectKey,
      body: new Blob([jsonText], { type: 'application/json;charset=utf-8' }),
      contentType: 'application/json;charset=utf-8',
    });

    if (config.excelBackupPrefix && sourceFile) {
      await postOssObject({
        config,
        objectKey: buildExcelBackupKey(config.excelBackupPrefix, sourceFile.name),
        body: sourceFile,
        contentType: sourceFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }
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

  const hasRowsForSheet = (data, sheetName) => normalizeRows(data?.sheets?.raw?.[sheetName]).length > 0;

  const getSheetNames = (data) => {
    const sheetNames = Array.isArray(data?.project?.sheetNames) ? data.project.sheetNames : [];
    const fallbackNames = Object.keys(data?.sheets?.raw || {});
    const names = sheetNames.length ? sheetNames : fallbackNames;
    return names.filter((name) => hasRowsForSheet(data, name));
  };

  const getActiveSheet = (data) => {
    const names = getSheetNames(data);
    if (state.activeSheet && names.includes(state.activeSheet)) return state.activeSheet;
    if (names.includes(data?.project?.activeSheetName)) return data.project.activeSheetName;
    return names[0] || '';
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

    if (refs.exportJsonBtn) {
      refs.exportJsonBtn.disabled = !state.data;
    }

    if (refs.importStatus) {
      const sheetCount = getSheetNames(state.data).length;
      const rowCount = Object.values(state.data?.sheets?.raw || {})
        .reduce((sum, rows) => sum + normalizeRows(rows).length, 0);
      if (state.dataSource === 'oss') {
        refs.importStatus.textContent = `OSS数据：${sheetCount} 个表 / ${rowCount} 条`;
      } else if (state.dataSource === 'excel') {
        refs.importStatus.textContent = `已解析：${state.sourceFileName || 'Excel'}，${sheetCount} 个表 / ${rowCount} 条`;
      } else {
        refs.importStatus.textContent = `默认数据：${sheetCount} 个表 / ${rowCount} 条`;
      }
    }
  };

  const getSelectedRowsForActiveSheet = () => {
    const sheetName = getActiveSheet(state.data);
    return getRowsForSheet(sheetName).filter((row) => state.selectedKeys.has(row.__rowKey));
  };

  const summarizeMetric = (rows, key) => {
    const values = rows
      .map((row) => getMetricValue(row, key))
      .filter((value) => value != null);

    if (!values.length) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${formatHeader(key)}：均值 ${avg.toFixed(2).replace(/\.?0+$/, '')}，范围 ${min} - ${max}`;
  };

  const summarizeRowsForAi = (rows, columns, limit = 12) => {
    return rows.slice(0, limit).map((row, index) => {
      const cells = columns
        .filter((column) => column !== '__rowKey')
        .map((column) => `${formatHeader(column)}=${valueToText(row[column]) || '-'}`)
        .join('；');
      return `${index + 1}. ${cells}`;
    });
  };

  const getAiContext = () => {
    if (!state.data) return '';

    const sheetName = getActiveSheet(state.data);
    const { filteredRows, columns } = getVisibleRows();
    const selectedRows = getSelectedRowsForActiveSheet();
    const targetRows = selectedRows.length ? selectedRows : filteredRows;
    const targetLabel = selectedRows.length ? '已选数据' : '当前筛选结果';
    const metrics = [
      '熔指',
      '拉伸强度[Mpa]',
      '断裂伸长率[%]',
      '弯曲强度[Mpa]',
      '弯曲模量[Mpa]',
      '冲击强度[Mpa]',
      '灰份',
    ].map((key) => summarizeMetric(targetRows, key)).filter(Boolean);

    const lines = [
      '【当前物性分析上下文】',
      `工作表：${sheetName || '未选择'}`,
      `查询词：${state.query.trim() || '无'}`,
      `搜索方式：${state.searchMode === 'exact' ? '精准查询' : '模糊查询'}`,
      `排序：${state.sort}`,
      `数据范围：共 ${filteredRows.length} 条筛选结果，当前工作表已选 ${selectedRows.length} 条；当前上下文使用${targetLabel} ${targetRows.length} 条。`,
    ];

    if (metrics.length) {
      lines.push('关键指标摘要：', ...metrics.map((item) => `- ${item}`));
    }

    const rowLines = summarizeRowsForAi(targetRows, columns, 12);
    if (rowLines.length) {
      lines.push('代表性数据：', ...rowLines);
      if (targetRows.length > rowLines.length) lines.push(`还有 ${targetRows.length - rowLines.length} 条未展开。`);
    }

    return lines.join('\n');
  };

  const extractQuestionTerms = (question) => {
    const text = String(question || '');
    const terms = text.match(/[A-Za-z0-9][A-Za-z0-9._/-]{1,}/g) || [];
    return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))];
  };

  const rowMatchesTerms = (row, terms) => {
    if (!terms.length) return false;
    const values = Object.values(row)
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter(Boolean);

    return terms.some((term) => {
      const normalizedTerm = term.toLowerCase();
      return values.some((value) => value.includes(normalizedTerm) || normalizedTerm.includes(value));
    });
  };

  const formatRowsForAi = (rows, columns, limit = 30) => {
    return rows.slice(0, limit).map((row, index) => {
      const cells = columns
        .map((column) => `${formatHeader(column)}=${valueToText(row[column]) || '-'}`)
        .join('；');
      return `${index + 1}. ${cells}`;
    });
  };

  const formatSheetTableForAi = (sheetName, rows, columns) => {
    const headers = columns.map(formatHeader);
    const lines = rows.map((row, index) => {
      const values = columns.map((column) => {
        const text = Array.isArray(row[column]) ? row[column].join('/') : valueToText(row[column]);
        return String(text || '-').replace(/\s+/g, ' ');
      });
      return `${index + 1}\t${values.join('\t')}`;
    });

    return [
      `### 工作表：${sheetName}（共 ${rows.length} 行）`,
      `序号\t${headers.join('\t')}`,
      ...lines,
    ].join('\n');
  };

  const getFullAiContext = (question = '') => {
    if (!state.data) return '';

    const sheetNames = getSheetNames(state.data);
    const questionTerms = extractQuestionTerms(question);
    const matchedRows = [];
    const fullTableSections = sheetNames.map((sheetName) => {
      const rows = getRowsForSheet(sheetName);
      const columns = getColumns(rows);
      rows.forEach((row) => {
        if (!rowMatchesTerms(row, questionTerms)) return;
        matchedRows.push({ sheetName, row, columns });
      });

      return formatSheetTableForAi(sheetName, rows, columns);
    });

    const matchedLines = matchedRows.length
      ? matchedRows.slice(0, 50).map((item, index) => {
          const cells = item.columns
            .map((column) => `${formatHeader(column)}=${valueToText(item.row[column]) || '-'}`)
            .join('；');
          return `${index + 1}. 工作表=${item.sheetName}；${cells}`;
        })
      : [];

    const activeSheet = getActiveSheet(state.data);
    const activeRows = activeSheet ? getRowsForSheet(activeSheet) : [];
    const activeColumns = getColumns(activeRows);

    return [
      '【已后台接入：物性分析完整表格数据】',
      '以下数据来自物性分析页面加载的整张表，包含全部工作表/分类和全部行。请优先基于这些数据回答用户问题，不要要求用户重新粘贴表格。',
      '重要规则：如果用户问题里出现型号或批次，必须先在下方表格字段中匹配。没有完全匹配时，要明确说明“未找到完全匹配”，再列出相近匹配；不要按外部常识解释为服务器、网络设备或其他无关产品。',
      `当前页面状态：工作表=${getActiveSheet(state.data) || '未选择'}；查询词=${state.query.trim() || '无'}；搜索方式=${state.searchMode === 'exact' ? '精准查询' : '模糊查询'}；排序=${state.sort}。`,
      questionTerms.length ? `用户问题提取关键词：${questionTerms.join('、')}` : '用户问题未提取到明显型号/批次关键词。',
      matchedLines.length ? `问题相关匹配行（优先参考）：\n${matchedLines.join('\n')}` : '问题相关匹配行：未匹配到完全或相近行，请基于完整表格继续查找并说明。',
      activeRows.length ? `当前工作表前 ${Math.min(30, activeRows.length)} 行预览：\n${formatRowsForAi(activeRows, activeColumns, 30).join('\n')}` : '',
      '完整表格数据：',
      fullTableSections.join('\n\n'),
    ].filter(Boolean).join('\n');
  };

  const getAiDataFile = (question = '') => {
    const content = getFullAiContext(question);
    if (!content) return null;

    return {
      filename: `property-analysis-data-${new Date().toISOString().slice(0, 10)}.txt`,
      mimeType: 'text/plain',
      content,
    };
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
                ${columns.map((column) => `<th>${escapeHtml(formatHeader(column))}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr class="${state.selectedKeys.has(row.__rowKey) ? 'is-selected' : ''}" data-row-key="${escapeHtml(row.__rowKey)}">
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
    const { rows, allRows, filteredRows, columns, currentPage, totalPages } = getVisibleRows();
    const hasTableRows = allRows.length > 0;
    const hasFilteredRows = filteredRows.length > 0;

    renderTabs();

    if (refs.searchMode) {
      refs.searchMode.querySelectorAll('[data-search-mode]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-search-mode') === state.searchMode);
      });
    }

    if (refs.panel) {
      refs.panel.hidden = !hasTableRows;
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
    if (refs.pagination) refs.pagination.hidden = !hasFilteredRows;

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

  const exportCurrentJson = () => {
    if (!state.data) return;

    const fileBase = state.sourceFileName
      ? state.sourceFileName.replace(/\.[^.]+$/, '')
      : '物性分析数据';
    const fileName = `${fileBase}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadBlob(
      new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json;charset=utf-8;' }),
      fileName
    );
  };

  const setAnalysisData = (data, options = {}) => {
    state.data = data;
    state.dataSource = options.source || 'default';
    state.sourceFileName = options.fileName || data?.project?.file?.name || '';
    state.activeSheet = getActiveSheet(data);
    state.query = '';
    state.page = 1;
    state.compareOnly = false;
    state.selectedKeys.clear();
    if (refs.searchInput) refs.searchInput.value = '';
    render();
  };

  const importExcelFile = async (file) => {
    if (!file) return;

    try {
      if (refs.importStatus) refs.importStatus.textContent = `正在解析：${file.name}`;
      const parsed = await parseExcelWorkbook(file);
      if (refs.importStatus) refs.importStatus.textContent = `正在同步OSS：${file.name}`;
      await uploadPropertyDataToOss(parsed, file);
      await loadData({ bustCache: true });
      if (refs.importStatus) refs.importStatus.textContent = `已同步OSS：${file.name}`;
    } catch (error) {
      if (refs.importStatus) refs.importStatus.textContent = `解析失败：${error?.message || '文件格式错误'}`;
      console.error('[property-analysis] Failed to parse Excel:', error);
    }
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

  const loadData = async (options = {}) => {
    try {
      const ossConfig = getOssConfig();
      const shouldReadOss = hasOssReadConfig(ossConfig);
      const dataUrl = shouldReadOss
        ? getOssObjectUrl(ossConfig)
        : encodeURI(constants.PROPERTY_ANALYSIS_DATA_URL);
      const url = options.bustCache
        ? `${dataUrl}${dataUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
        : dataUrl;
      if (refs.importStatus) {
        refs.importStatus.textContent = shouldReadOss ? '正在读取 OSS 数据' : '正在读取默认数据';
      }
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setAnalysisData(await response.json(), {
        source: shouldReadOss ? 'oss' : 'default',
        fileName: shouldReadOss ? ossConfig.objectKey : '',
      });
    } catch (error) {
      state.data = null;
      state.dataSource = 'default';
      state.sourceFileName = '';

      if (refs.sheetTabs) refs.sheetTabs.innerHTML = '';
      if (refs.panel) refs.panel.hidden = true;
      if (refs.tableWrap) {
        refs.tableWrap.innerHTML = '<div class="analysis-empty">物性数据加载失败，请检查数据文件或编码格式。</div>';
      }
      if (refs.panelCount) refs.panelCount.textContent = '共 0 条';
      if (refs.footerTotal) refs.footerTotal.textContent = '共 0 条';
      if (refs.selectionMeta) refs.selectionMeta.textContent = '已选 0 条';
      if (refs.importStatus) refs.importStatus.textContent = '数据加载失败';
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

    refs.tableWrap?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('button') ||
        target.closest('a') ||
        target.closest('select') ||
        target.closest('label')
      ) {
        return;
      }

      const row = target.closest('tbody tr');
      if (!row) return;

      const rowKey = row.getAttribute('data-row-key');
      if (!rowKey) return;

      if (state.selectedKeys.has(rowKey)) {
        state.selectedKeys.delete(rowKey);
        if (state.compareOnly && state.selectedKeys.size < 2) {
          state.compareOnly = false;
        }
      } else {
        state.selectedKeys.add(rowKey);
      }

      render();
    });

    refs.selectAllBtn?.addEventListener('click', toggleSelectAllFiltered);
    refs.compareBtn?.addEventListener('click', toggleCompareMode);
    refs.exportBtn?.addEventListener('click', exportCurrentSheet);
    refs.exportJsonBtn?.addEventListener('click', exportCurrentJson);
    refs.importExcelBtn?.addEventListener('click', () => {
      if (!refs.excelInput) return;
      refs.excelInput.value = '';
      refs.excelInput.click();
    });
    refs.excelInput?.addEventListener('change', () => {
      const file = refs.excelInput?.files?.[0];
      importExcelFile(file);
      if (refs.excelInput) refs.excelInput.value = '';
    });

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
    parseExcelWorkbook,
    getAiContext,
    getFullAiContext,
    getAiDataFile,
  };
})();
