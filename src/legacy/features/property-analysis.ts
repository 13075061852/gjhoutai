// @ts-nocheck
import { getLegacyApp } from '../core/app-context';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { constants, utils } = App;
  const PAGE_SIZE_DEFAULT = 15;
  const REPORT_RANGE_STORAGE_KEY = 'gjh-property-report-ranges-v1';
  const REPORT_COMPANY_NAME = '宁波广俊塑料科技有限公司';
  const REPORT_COMPANY_ADDRESS = '浙江省慈溪市横河万洋众创城 28 栋 1-3';
  const REPORT_COMPANY_TEL = '0574-63072712';
  const REPORT_COMPANY_FAX = '0574-63805667';
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
  const METRIC_COLUMNS = [
    '熔指',
    '拉伸强度[Mpa]',
    '断裂伸长率[%]',
    '弯曲强度[Mpa]',
    '弯曲模量[Mpa]',
    '冲击强度[Mpa]',
    '灰份',
  ];
  const REPORT_METRICS = [
    { key: '灰份', item: '灰份', unit: '%' },
    { key: '熔指', item: '熔融指数（260℃ / 2.16KG）', unit: 'g/10min' },
    { key: '拉伸强度[Mpa]', item: '拉伸强度', unit: 'MPa' },
    { key: '弯曲强度[Mpa]', item: '弯曲强度', unit: 'MPa' },
    { key: '弯曲模量[Mpa]', item: '弯曲模量', unit: 'MPa' },
    { key: '冲击强度[Mpa]', item: '缺口冲击强度（悬臂）', unit: 'kJ/m²' },
  ];
  const AGENT_CONTEXT_ROW_LIMIT = 12;
  const AGENT_CONTEXT_SIMILAR_LIMIT = 8;
  const AGENT_STOP_TERMS = new Set([
    '帮我',
    '请',
    '分析',
    '分析一下',
    '查询',
    '查一下',
    '查看',
    '看一下',
    '看看',
    '一下',
    '数据',
    '物性',
    '型号',
    '批次',
    '材料',
    '指标',
    '效果',
    '情况',
    '结果',
  ]);

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
    importExcelBtn: document.getElementById('analysisImportExcelBtn'),
    exportJsonBtn: document.getElementById('analysisExportJsonBtn'),
    exportReportBtn: document.getElementById('analysisExportReportBtn'),
    manageRangesBtn: document.getElementById('analysisManageRangesBtn'),
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
    sort: 'forward',
    searchMode: 'fuzzy',
    searchSuggestions: [],
    suggestionIndex: -1,
    suggestionOpen: false,
    compareOnly: false,
    selectedKeys: new Set(),
    reportRanges: [],
    reportDialogOpen: false,
    reportSelectedIndex: 0,
    reportDrafts: [],
    rangeManagerSearch: '',
    rangeManagerSelectedModel: '',
    dataSource: 'default',
    sourceFileName: '',
    uploadStatusText: '读取中',
  };

  const escapeHtml = (value) => utils.escapeHtml(value);

  const notify = (message, tone = 'success', key = '') => {
    const show = App.notify?.[tone] || App.notify?.show;
    if (typeof show === 'function') {
      if (show === App.notify?.show) {
        show.call(App.notify, { message, tone, key: key || `property-report-${Date.now()}` });
      } else {
        show.call(App.notify, message, key ? { key } : undefined);
      }
      return;
    }
    console[tone === 'error' ? 'error' : 'log'](message);
  };

  const ensureReportToolbar = () => {
    if (!refs.exportJsonBtn?.parentElement) return;
    const actionGroup = refs.exportJsonBtn.parentElement;

    if (!refs.manageRangesBtn) {
      const button = document.createElement('button');
      button.className = 'analysis-toolbar-btn';
      button.id = 'analysisManageRangesBtn';
      button.type = 'button';
      button.innerHTML = '<i class="ti ti-adjustments" aria-hidden="true"></i><span>检测范围</span>';
      refs.exportJsonBtn.insertAdjacentElement('afterend', button);
      refs.manageRangesBtn = button;
    }

    if (!refs.exportReportBtn) {
      const button = document.createElement('button');
      button.className = 'analysis-toolbar-btn analysis-toolbar-btn-primary';
      button.id = 'analysisExportReportBtn';
      button.type = 'button';
      button.disabled = true;
      button.innerHTML = '<i class="ti ti-package-export" aria-hidden="true"></i><span>导出报告</span>';
      actionGroup.appendChild(button);
      refs.exportReportBtn = button;
    }
  };

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
    await ensureXlsxLoaded();

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
    const savedConfig = App.config?.loadSavedConfig?.() || {};
    const defaultConfig = constants.DEFAULT_CONFIG || {};
    const getValue = (key) => String(savedConfig[key] || defaultConfig[key] || '').trim();
    const bucket = getValue('ossBucket');
    const endpoint = getValue('ossEndpoint').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const objectKey = getValue('ossObjectKey').replace(/^\/+/, '');
    return {
      bucket,
      endpoint,
      objectKey,
      accessKeyId: getValue('ossAccessKeyId'),
      accessKeySecret: getValue('ossAccessKeySecret'),
      excelBackupPrefix: getValue('ossExcelBackupPrefix').replace(/^\/+/, ''),
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

  const formatDuration = (startTime) => {
    const duration = Math.max(0, performance.now() - startTime);
    if (duration < 1000) return `${Math.round(duration)}ms`;
    return `${(duration / 1000).toFixed(2).replace(/\.?0+$/, '')}s`;
  };

  const getStatusTone = (message, explicitTone = '') => {
    if (explicitTone) return explicitTone;
    const text = String(message || '');
    if (/中|解析|上传/.test(text)) return 'loading';
    if (/成功/.test(text)) return 'success';
    if (/失败|错误/.test(text)) return 'error';
    return '';
  };

  const setUploadStatus = (message, tone = '') => {
    state.uploadStatusText = message || '未上传';
    if (!refs.importStatus) return;
    const statusTone = getStatusTone(state.uploadStatusText, tone);
    refs.importStatus.textContent = state.uploadStatusText;
    refs.importStatus.classList.toggle('is-loading', statusTone === 'loading');
    refs.importStatus.classList.toggle('is-success', statusTone === 'success');
    refs.importStatus.classList.toggle('is-error', statusTone === 'error');
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

  const loadScriptOnce = (src, globalName) => new Promise((resolve, reject) => {
    if (globalName && window[globalName]) {
      resolve(window[globalName]);
      return;
    }

    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', () => reject(new Error('脚本加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error('脚本加载失败'));
    document.head.appendChild(script);
  });

  const ensureXlsxLoaded = async () => {
    if (window.XLSX) return window.XLSX;

    try {
      await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'XLSX');
    } catch {
      throw new Error('Excel解析库未加载。当前网络或代理无法访问 SheetJS CDN，请稍后重试或使用可联网环境导入。');
    }

    if (!window.XLSX) {
      throw new Error('Excel解析库加载异常，请刷新页面后重试。');
    }

    return window.XLSX;
  };

  const utf8ToBase64 = (value) => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const postOssObject = async ({ config, objectKey, body, contentType, onProgress }) => {
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

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://${config.bucket}.${config.endpoint}`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || typeof onProgress !== 'function') return;
        const percent = Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100)));
        onProgress(percent);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof onProgress === 'function') onProgress(100);
          resolve();
          return;
        }
        reject(new Error(`OSS上传失败：HTTP ${xhr.status}${xhr.responseText ? ` ${xhr.responseText.slice(0, 120)}` : ''}`));
      };

      xhr.onerror = () => reject(new Error('OSS上传失败：网络错误'));
      xhr.onabort = () => reject(new Error('OSS上传失败：请求已取消'));
      xhr.send(formData);
    });
  };

  const buildExcelBackupKey = (prefix, fileName) => {
    const safePrefix = String(prefix || '').replace(/^\/+/, '').replace(/\/?$/, '/');
    const baseName = String(fileName || 'property-data.xlsx').replace(/[\\/:*?"<>|]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${safePrefix}${stamp}-${baseName}`;
  };

  const uploadPropertyDataToOss = async (data, sourceFile, onProgress) => {
    const config = getOssConfig();
    if (!hasOssWriteConfig(config)) {
      throw new Error('请先在配置中心填写 OSS Bucket、Endpoint、JSON 路径和 AccessKey。');
    }

    const jsonText = JSON.stringify(data, null, 2);
    await postOssObject({
      config,
      objectKey: config.objectKey,
      body: new Blob([jsonText], { type: 'application/json;charset=utf-8' }),
      contentType: 'application/json;charset=utf-8',
      onProgress,
    });

    if (config.excelBackupPrefix && sourceFile) {
      await postOssObject({
        config,
        objectKey: buildExcelBackupKey(config.excelBackupPrefix, sourceFile.name),
        body: sourceFile,
        contentType: sourceFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        onProgress: (percent) => {
          if (typeof onProgress === 'function') onProgress(percent);
        },
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

  const normalizeReportText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const sanitizeFileName = (value) => normalizeReportText(value)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '检验报告';

  const formatChineseDate = (date = new Date()) => `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;

  const getRowModel = (row) => normalizeReportText(row?.型号);

  const getRowBatch = (row) => normalizeReportText(row?.批次);

  const getRowColor = (row) => {
    const model = getRowModel(row);
    const match = model.match(/-([A-Za-z0-9]+)$/);
    return match?.[1] || normalizeReportText(row?.色号 || row?.颜色 || '');
  };

  const loadReportRanges = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(REPORT_RANGE_STORAGE_KEY) || '[]');
      state.reportRanges = Array.isArray(parsed) ? parsed.map((item, index) => ({
        id: normalizeReportText(item.id) || `range-${Date.now()}-${index}`,
        model: normalizeReportText(item.model),
        metricKey: normalizeReportText(item.metricKey),
        item: normalizeReportText(item.item),
        unit: normalizeReportText(item.unit),
        range: normalizeReportText(item.range),
      })).filter((item) => item.model && item.metricKey && item.range) : [];
    } catch {
      state.reportRanges = [];
    }
  };

  const saveReportRanges = () => {
    localStorage.setItem(REPORT_RANGE_STORAGE_KEY, JSON.stringify(state.reportRanges));
  };

  const getReportMetricConfig = (metricKey) => (
    REPORT_METRICS.find((metric) => metric.key === metricKey) || {
      key: metricKey,
      item: formatHeader(metricKey),
      unit: '',
    }
  );

  const getReportRange = (model, metricKey) => state.reportRanges.find((item) => (
    item.model === model && item.metricKey === metricKey
  ));

  const getRangePrecision = (rangeText) => {
    const matches = String(rangeText || '').match(/\d+(?:\.(\d+))?/g) || [];
    return Math.min(Math.max(...matches.map((item) => getPrecision(item)), 0), 3);
  };

  const formatReportValue = (row, metricKey, rangeText = '') => {
    const raw = row?.[metricKey];
    const numeric = getMetricValue(row, metricKey);
    if (numeric == null) return normalizeReportText(Array.isArray(raw) ? raw.join(' / ') : raw);

    const rangePrecision = getRangePrecision(rangeText);
    const precision = Math.max(rangePrecision, Math.min(getPrecision(numeric), 1));
    const fixed = numeric.toFixed(precision);
    return rangePrecision > 0 ? fixed : fixed.replace(/\.?0+$/, '');
  };

  const getReportMetricsForRow = (row) => REPORT_METRICS
    .filter((metric) => hasMeaningfulValue(row?.[metric.key]))
    .map((metric) => metric.key);

  const getMissingRangeItems = (rows) => {
    const missing = [];
    const seen = new Set();

    rows.forEach((row) => {
      const model = getRowModel(row);
      getReportMetricsForRow(row).forEach((metricKey) => {
        const key = `${model}::${metricKey}`;
        if (!model || seen.has(key) || getReportRange(model, metricKey)) return;
        seen.add(key);
        missing.push({
          model,
          metricKey,
          item: getReportMetricConfig(metricKey).item,
        });
      });
    });

    return missing;
  };

  const createReportDraft = (row) => {
    const model = getRowModel(row);
    const batch = getRowBatch(row);
    const metrics = getReportMetricsForRow(row).map((metricKey) => {
      const config = getReportMetricConfig(metricKey);
      const range = getReportRange(model, metricKey);
      return {
        key: metricKey,
        item: range?.item || config.item,
        unit: range?.unit || config.unit,
        range: range?.range || '',
        value: formatReportValue(row, metricKey, range?.range),
      };
    });

    return {
      key: row.__rowKey,
      model,
      batch,
      date: formatChineseDate(),
      color: getRowColor(row),
      intro: '本批次材料依照该型号生产流程规范生产，经内部品质检验合格，如下：',
      metrics,
    };
  };

  const getActiveReportDraft = () => state.reportDrafts[state.reportSelectedIndex] || null;

  const updateReportDraftFromDialog = () => {
    const dialog = document.querySelector('.analysis-report-dialog');
    const draft = getActiveReportDraft();
    if (!dialog || !draft) return;

    dialog.querySelectorAll('[data-report-field]').forEach((input) => {
      const field = input.getAttribute('data-report-field');
      if (field && field in draft) draft[field] = input.value;
    });

    dialog.querySelectorAll('[data-report-metric-index]').forEach((row) => {
      const index = Number.parseInt(row.getAttribute('data-report-metric-index') || '', 10);
      const metric = draft.metrics[index];
      if (!metric) return;
      row.querySelectorAll('[data-report-metric-field]').forEach((input) => {
        const field = input.getAttribute('data-report-metric-field');
        if (field && field in metric) metric[field] = input.value;
      });
    });
  };

  const drawCenteredText = (ctx, text, x, y, options = {}) => {
    ctx.save();
    ctx.font = options.font || '32px sans-serif';
    ctx.fillStyle = options.color || '#111827';
    ctx.textAlign = options.align || 'center';
    ctx.textBaseline = options.baseline || 'middle';
    ctx.fillText(String(text ?? ''), x, y);
    ctx.restore();
  };

  const drawReportCanvas = (canvas, draft) => {
    if (!canvas || !draft) return;
    const scale = 2;
    const width = 794;
    const height = 1123;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 38);
    ctx.lineTo(724, 38);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(346, 38);
    ctx.lineTo(448, 38);
    ctx.stroke();

    drawCenteredText(ctx, REPORT_COMPANY_NAME, width / 2, 96, { font: '700 36px "Microsoft YaHei", sans-serif' });
    drawCenteredText(ctx, REPORT_COMPANY_ADDRESS, width / 2, 145, { font: '22px "Microsoft YaHei", sans-serif' });
    drawCenteredText(ctx, `TEL：${REPORT_COMPANY_TEL}      FAX：${REPORT_COMPANY_FAX}`, width / 2, 184, { font: '22px Arial, sans-serif' });

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(212, 255);
    ctx.lineTo(286, 255);
    ctx.moveTo(508, 255);
    ctx.lineTo(582, 255);
    ctx.stroke();
    drawCenteredText(ctx, '检验报告表', width / 2, 255, { font: '700 36px "Microsoft YaHei", sans-serif' });

    const left = 72;
    const labelX = 108;
    const valueX = 138;
    const fields = [
      ['日期：', draft.date],
      ['型号：', draft.model],
      ['色号：', draft.color],
      ['批号：', draft.batch],
    ];
    ctx.fillStyle = '#111827';
    fields.forEach(([label, value], index) => {
      const y = 320 + index * 48;
      ctx.font = '700 23px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, labelX, y);
      ctx.font = '22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(value || ''), valueX, y);
    });

    ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.fillText(draft.intro || '', left, 540);

    const tableX = 68;
    const tableY = 590;
    const colWidths = [260, 130, 170, 150];
    const rowH = 54;
    const headers = ['检验项目', '单位', '检验范围', '检验值'];
    const rows = draft.metrics || [];
    const tableW = colWidths.reduce((sum, item) => sum + item, 0);
    const tableH = rowH * (rows.length + 1);

    ctx.strokeStyle = '#2f3742';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, tableY, tableW, tableH);
    let x = tableX;
    colWidths.slice(0, -1).forEach((colWidth) => {
      x += colWidth;
      ctx.beginPath();
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + tableH);
      ctx.stroke();
    });
    for (let i = 1; i <= rows.length; i += 1) {
      const y = tableY + rowH * i;
      ctx.beginPath();
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableW, y);
      ctx.stroke();
    }

    headers.forEach((header, index) => {
      const cellX = tableX + colWidths.slice(0, index).reduce((sum, item) => sum + item, 0);
      drawCenteredText(ctx, header, cellX + colWidths[index] / 2, tableY + rowH / 2, { font: '700 21px "Microsoft YaHei", sans-serif' });
    });

    rows.forEach((row, rowIndex) => {
      [row.item, row.unit, row.range, row.value].forEach((text, colIndex) => {
        const cellX = tableX + colWidths.slice(0, colIndex).reduce((sum, item) => sum + item, 0);
        drawCenteredText(ctx, text, cellX + colWidths[colIndex] / 2, tableY + rowH * (rowIndex + 1) + rowH / 2, { font: '20px "Microsoft YaHei", sans-serif' });
      });
    });
  };

  const renderReportPreview = () => {
    const draft = getActiveReportDraft();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    if (canvas) drawReportCanvas(canvas, draft);
  };

  const canvasToBlob = (canvas, type = 'image/png', quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('报告预览生成失败'));
    }, type, quality);
  });

  const binaryStringFromBase64 = (value) => atob(String(value || '').split(',').pop() || '');

  const escapePdfText = (value) => String(value).replace(/[\\()]/g, '\\$&');

  const createPdfBlobFromCanvas = (canvas, title) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const imageBinary = binaryStringFromBase64(dataUrl);
    const width = 595.28;
    const height = 841.89;
    const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBinary.length} >>\nstream\n${imageBinary}\nendstream`,
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      `<< /Title (${escapePdfText(title)}) /Producer (Gjun Report Export) >>`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const bytes = new Uint8Array(pdf.length);
    for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  };

  const getReportFileBase = (draft) => sanitizeFileName(`${draft?.batch || '未命名批次'} ${draft?.model || '未命名型号'}`);

  const buildReportDialogHtml = () => {
    const draft = getActiveReportDraft();
    return `
      <div class="analysis-report-dialog dialog-overlay" role="dialog" aria-modal="true" aria-label="导出检验报告">
        <div class="analysis-report-card dialog-card">
          <div class="analysis-report-head">
            <div>
              <div class="analysis-report-title">导出检验报告</div>
              <div class="analysis-report-subtitle">已选 ${state.reportDrafts.length} 条，可逐条编辑预览并导出</div>
            </div>
            <div class="analysis-report-actions">
              <button class="analysis-report-btn" type="button" data-report-open-ranges>
                <i class="ti ti-adjustments" aria-hidden="true"></i><span>检测范围</span>
              </button>
              <button class="analysis-report-btn" type="button" data-report-export-image>
                <i class="ti ti-download" aria-hidden="true"></i><span>导出图片</span>
              </button>
              <button class="analysis-report-btn is-primary" type="button" data-report-export-pdf>
                <i class="ti ti-file-text" aria-hidden="true"></i><span>导出PDF</span>
              </button>
              <button class="analysis-compare-close dialog-close" type="button" aria-label="关闭导出报告" data-report-close>
                <i class="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="analysis-report-body">
            <aside class="analysis-report-selected">
              <div class="analysis-report-section-title">待生成列表</div>
              <div class="analysis-report-selected-list">
                ${state.reportDrafts.map((item, index) => `
                  <button class="analysis-report-selected-item${index === state.reportSelectedIndex ? ' is-active' : ''}" type="button" data-report-select="${index}">
                    <strong>${escapeHtml(item.model || '--')}</strong>
                    <span>${escapeHtml(item.batch || '--')}</span>
                  </button>
                `).join('')}
              </div>
            </aside>
            <section class="analysis-report-editor">
              <div class="analysis-report-form-grid">
                ${[
                  ['date', '日期'],
                  ['model', '型号'],
                  ['color', '色号'],
                  ['batch', '批号'],
                ].map(([field, label]) => `
                  <label>
                    <span>${label}</span>
                    <input value="${escapeHtml(draft?.[field] || '')}" data-report-field="${field}">
                  </label>
                `).join('')}
                <label class="is-wide">
                  <span>说明</span>
                  <input value="${escapeHtml(draft?.intro || '')}" data-report-field="intro">
                </label>
              </div>
              <div class="analysis-report-metric-editor">
                <div class="analysis-report-section-title">报告明细</div>
                <div class="analysis-report-metric-head">
                  <span>检验项目</span><span>单位</span><span>检验范围</span><span>检验值</span>
                </div>
                ${(draft?.metrics || []).map((metric, index) => `
                  <div class="analysis-report-metric-row" data-report-metric-index="${index}">
                    <input value="${escapeHtml(metric.item)}" data-report-metric-field="item">
                    <input value="${escapeHtml(metric.unit)}" data-report-metric-field="unit">
                    <input value="${escapeHtml(metric.range)}" data-report-metric-field="range">
                    <input value="${escapeHtml(metric.value)}" data-report-metric-field="value">
                  </div>
                `).join('')}
              </div>
            </section>
            <section class="analysis-report-preview-wrap">
              <div class="analysis-report-section-title">预览</div>
              <div class="analysis-report-preview-scroll">
                <canvas data-report-preview-canvas></canvas>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  };

  const closeReportDialog = () => {
    updateReportDraftFromDialog();
    document.querySelector('.analysis-report-dialog')?.remove();
    document.removeEventListener('keydown', handleReportDialogKeydown);
    state.reportDialogOpen = false;
  };

  function handleReportDialogKeydown(event) {
    if (event.key === 'Escape') closeReportDialog();
  }

  const rerenderReportDialog = () => {
    const dialog = document.querySelector('.analysis-report-dialog');
    if (!dialog) return;
    dialog.outerHTML = buildReportDialogHtml();
    bindReportDialogEvents();
    renderReportPreview();
  };

  const exportActiveReportImage = async () => {
    updateReportDraftFromDialog();
    renderReportPreview();
    const draft = getActiveReportDraft();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    if (!draft || !canvas) return;
    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, `${getReportFileBase(draft)}.png`);
    notify('报告图片已导出', 'success', 'property-report-image');
  };

  const exportActiveReportPdf = async () => {
    updateReportDraftFromDialog();
    renderReportPreview();
    const draft = getActiveReportDraft();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    if (!draft || !canvas) return;
    const blob = createPdfBlobFromCanvas(canvas, `${getReportFileBase(draft)}.PDF`);
    downloadBlob(blob, `${getReportFileBase(draft)}.PDF`);
    notify('报告 PDF 已导出', 'success', 'property-report-pdf');
  };

  const bindReportDialogEvents = () => {
    const dialog = document.querySelector('.analysis-report-dialog');
    if (!dialog) return;
    dialog.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const selectButton = target.closest('[data-report-select]');
      if (selectButton) {
        updateReportDraftFromDialog();
        state.reportSelectedIndex = Number.parseInt(selectButton.getAttribute('data-report-select') || '0', 10) || 0;
        rerenderReportDialog();
        return;
      }
      if (target.closest('[data-report-open-ranges]')) {
        openRangeManagerDialog();
        return;
      }
      if (target.closest('[data-report-export-image]')) {
        exportActiveReportImage().catch((error) => notify(error?.message || '导出图片失败', 'error', 'property-report-image-error'));
        return;
      }
      if (target.closest('[data-report-export-pdf]')) {
        exportActiveReportPdf().catch((error) => notify(error?.message || '导出 PDF 失败', 'error', 'property-report-pdf-error'));
        return;
      }
      if (target.closest('[data-report-close]') || target === dialog) closeReportDialog();
    });
    dialog.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      updateReportDraftFromDialog();
      renderReportPreview();
    });
  };

  const openReportDialog = () => {
    const selectedRows = getSelectedRowsForAllSheets();
    if (!selectedRows.length) {
      notify('请先选择需要生成报告的数据', 'warn', 'property-report-no-selection');
      return;
    }

    const missingRanges = getMissingRangeItems(selectedRows);
    if (missingRanges.length) {
      notify(`有 ${missingRanges.length} 项数据还未设置检测范围值，请先在检测范围中设置。`, 'warn', 'property-report-missing-ranges');
      openRangeManagerDialog(missingRanges);
      return;
    }

    closeReportDialog();
    state.reportDrafts = selectedRows.map(createReportDraft);
    state.reportSelectedIndex = 0;
    state.reportDialogOpen = true;
    document.body.insertAdjacentHTML('beforeend', buildReportDialogHtml());
    bindReportDialogEvents();
    document.addEventListener('keydown', handleReportDialogKeydown);
    renderReportPreview();
    document.querySelector('[data-report-close]')?.focus({ preventScroll: true });
  };

  const createRangeDraft = (overrides = {}) => {
    const metricKey = overrides.metricKey || REPORT_METRICS[0].key;
    const metric = getReportMetricConfig(metricKey);
    return {
      id: overrides.id || `range-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      model: normalizeReportText(overrides.model),
      metricKey,
      item: normalizeReportText(overrides.item) || metric.item,
      unit: normalizeReportText(overrides.unit) || metric.unit,
      range: normalizeReportText(overrides.range),
    };
  };

  const getRangeCandidateModels = () => {
    if (!state.data) return [];
    const rows = getSheetNames(state.data).flatMap((sheetName) => filterRows(getRowsForSheet(sheetName)));
    const seen = new Set();
    const models = [];

    rows.forEach((row) => {
      const model = getRowModel(row);
      if (!model || seen.has(model)) return;
      seen.add(model);
      models.push(model);
    });

    return models;
  };

  const getFilteredRangeCandidateModels = () => {
    const query = normalizeReportText(state.rangeManagerSearch).toLowerCase();
    const models = getRangeCandidateModels();
    if (!query) return models;
    return models.filter((model) => model.toLowerCase().includes(query));
  };

  const getRangesForModel = (model) => {
    const map = new Map();
    state.reportRanges
      .filter((item) => item.model === model)
      .forEach((item) => map.set(item.metricKey, item));
    return REPORT_METRICS.map((metric) => ({
      ...createRangeDraft({ model, metricKey: metric.key }),
      ...(map.get(metric.key) || {}),
    }));
  };

  const buildRangeRowsHtml = (model = '') => getRangesForModel(model).map((item) => `
    <div class="analysis-range-metric-row" data-range-metric-key="${escapeHtml(item.metricKey)}">
      <div class="analysis-range-metric-name">${escapeHtml(item.item || getReportMetricConfig(item.metricKey).item)}</div>
      <input value="${escapeHtml(item.unit)}" data-range-metric-field="unit" aria-label="${escapeHtml(item.item)}单位">
      <input value="${escapeHtml(item.range)}" data-range-metric-field="range" placeholder="例如 28.0~32.0 或 ≥120" aria-label="${escapeHtml(item.item)}检测范围">
    </div>
  `).join('');

  const getRangeSetStatus = (model) => {
    const filled = getRangesForModel(model).filter((item) => item.range);
    if (filled.length >= REPORT_METRICS.length) return 'complete';
    if (filled.length > 0) return 'partial';
    return 'empty';
  };

  const getRangeStatusLabel = (model) => {
    const status = getRangeSetStatus(model);
    if (status === 'complete') return '已设置';
    if (status === 'partial') return '部分';
    return '';
  };

  const buildRangeModelListHtml = () => {
    const models = getFilteredRangeCandidateModels();
    if (!models.length) return '<div class="analysis-range-model-empty">暂无匹配型号</div>';

    return models.map((model) => {
      const status = getRangeSetStatus(model);
      return `
        <button class="analysis-range-model-item${model === state.rangeManagerSelectedModel ? ' is-active' : ''}" type="button" data-range-model="${escapeHtml(model)}">
          <span>${escapeHtml(model)}</span>
          ${status !== 'empty' ? `<em class="is-${status}">${escapeHtml(getRangeStatusLabel(model))}</em>` : ''}
        </button>
      `;
    }).join('');
  };

  const buildRangeEditorHtml = () => (state.rangeManagerSelectedModel ? `
    <form class="analysis-range-form analysis-range-form-bulk" data-range-form>
      <div class="analysis-range-form-head">
        <div class="analysis-range-current-model">
          <span>当前型号</span>
          <strong>${escapeHtml(state.rangeManagerSelectedModel)}</strong>
        </div>
        <input data-range-field="model" value="${escapeHtml(state.rangeManagerSelectedModel)}" hidden>
        <div class="analysis-range-form-actions">
          <button class="analysis-report-btn" type="button" data-range-reset>清空表单</button>
          <button class="analysis-report-btn" type="button" data-range-clear-model>清除已设置</button>
          <button class="analysis-report-btn is-primary" type="submit">保存整套范围</button>
        </div>
      </div>
      <div class="analysis-range-metric-list">
        <div class="analysis-range-metric-head">
          <span>检测项目</span><span>单位</span><span>检测范围</span>
        </div>
        <div data-range-metric-list>${buildRangeRowsHtml(state.rangeManagerSelectedModel)}</div>
      </div>
    </form>
  ` : `
    <div class="analysis-range-editor-empty">
      <strong>请选择左侧型号</strong>
      <span>左侧只显示当前物性表筛选结果中的去重型号。</span>
    </div>
  `);

  const updateRangeModelList = () => {
    const list = document.querySelector('.analysis-range-model-list');
    const meta = document.querySelector('.analysis-range-model-meta');
    if (list) list.innerHTML = buildRangeModelListHtml();
    if (meta) meta.textContent = `筛选结果型号 ${getRangeCandidateModels().length} 个`;
  };

  const updateRangeEditorPanel = () => {
    const panel = document.querySelector('.analysis-range-editor-panel');
    if (panel) panel.innerHTML = buildRangeEditorHtml();
  };

  const updateRangeManagerSelection = (model) => {
    state.rangeManagerSelectedModel = model || '';
    updateRangeModelList();
    updateRangeEditorPanel();
  };

  const buildRangeManagerHtml = (missingItems = []) => `
    <div class="analysis-range-dialog dialog-overlay" role="dialog" aria-modal="true" aria-label="检测范围管理">
      <div class="analysis-range-card dialog-card">
        <div class="analysis-report-head">
          <div>
            <div class="analysis-report-title">检测范围管理</div>
            <div class="analysis-report-subtitle">按型号维护报告中的检验项目、单位和检测范围</div>
          </div>
          <button class="analysis-compare-close dialog-close" type="button" aria-label="关闭检测范围管理" data-range-close>
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="analysis-range-body">
          ${missingItems.length ? `
            <div class="analysis-range-warning">
              <strong>以下项目还未设置检测范围值</strong>
              <span>${missingItems.map((item) => `${escapeHtml(item.model)} / ${escapeHtml(item.item)}`).join('，')}</span>
            </div>
          ` : ''}
          <div class="analysis-range-workbench">
            <aside class="analysis-range-model-panel">
              <label class="analysis-range-search">
                <i class="ti ti-search" aria-hidden="true"></i>
                <input data-range-search type="search" value="${escapeHtml(state.rangeManagerSearch)}" placeholder="搜索型号">
              </label>
              <div class="analysis-range-model-meta">筛选结果型号 ${getRangeCandidateModels().length} 个</div>
              <div class="analysis-range-model-list">${buildRangeModelListHtml()}</div>
            </aside>
            <section class="analysis-range-editor-panel">
              ${buildRangeEditorHtml()}
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  const fillRangeForm = (range = {}) => {
    const dialog = document.querySelector('.analysis-range-dialog');
    const form = dialog?.querySelector('[data-range-form]');
    if (!form) return;
    const draft = createRangeDraft(range);
    form.querySelector('[data-range-field="model"]').value = draft.model;
    const list = form.querySelector('[data-range-metric-list]');
    if (list) list.innerHTML = buildRangeRowsHtml(draft.model);
  };

  const readRangeForm = () => {
    const dialog = document.querySelector('.analysis-range-dialog');
    const form = dialog?.querySelector('[data-range-form]');
    if (!form) return null;
    const model = normalizeReportText(form.querySelector('[data-range-field="model"]').value);
    const ranges = [...form.querySelectorAll('[data-range-metric-key]')].map((row) => {
      const metricKey = row.getAttribute('data-range-metric-key');
      const metric = getReportMetricConfig(metricKey);
      return createRangeDraft({
        model,
        metricKey,
        item: metric.item,
        unit: row.querySelector('[data-range-metric-field="unit"]')?.value,
        range: row.querySelector('[data-range-metric-field="range"]')?.value,
      });
    });
    return { model, ranges };
  };

  const closeRangeManagerDialog = () => {
    document.querySelector('.analysis-range-dialog')?.remove();
    document.removeEventListener('keydown', handleRangeManagerKeydown);
  };

  function handleRangeManagerKeydown(event) {
    if (event.key === 'Escape') closeRangeManagerDialog();
  }

  const rerenderRangeManagerDialog = (missingItems = []) => {
    const dialog = document.querySelector('.analysis-range-dialog');
    if (!dialog) return;
    dialog.outerHTML = buildRangeManagerHtml(missingItems);
    bindRangeManagerEvents(missingItems);
  };

  const bindRangeManagerEvents = (missingItems = []) => {
    const dialog = document.querySelector('.analysis-range-dialog');
    if (!dialog) return;
    dialog.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const modelButton = target.closest('[data-range-model]');
      if (modelButton) {
        updateRangeManagerSelection(modelButton.getAttribute('data-range-model') || '');
        return;
      }
      if (target.closest('[data-range-clear-model]')) {
        const model = state.rangeManagerSelectedModel;
        state.reportRanges = state.reportRanges.filter((item) => item.model !== model);
        saveReportRanges();
        updateRangeModelList();
        updateRangeEditorPanel();
        notify('该型号检测范围已删除', 'success', 'property-range-delete');
        return;
      }
      if (target.closest('[data-range-reset]')) {
        fillRangeForm({ model: state.rangeManagerSelectedModel });
        document.querySelectorAll('.analysis-range-dialog [data-range-metric-field="range"]').forEach((input) => {
          input.value = '';
        });
        return;
      }
      if (target.closest('[data-range-close]') || target === dialog) closeRangeManagerDialog();
    });
    dialog.addEventListener('submit', (event) => {
      if (!event.target?.closest?.('[data-range-form]')) return;
      event.preventDefault();
      const draft = readRangeForm();
      if (!draft?.model) {
        notify('请先填写型号', 'warn', 'property-range-model-required');
        return;
      }
      const filledRanges = draft.ranges.filter((item) => item.range);
      if (!filledRanges.length) {
        notify('请至少填写一项检测范围', 'warn', 'property-range-required');
        return;
      }
      state.reportRanges = [
        ...state.reportRanges.filter((item) => item.model !== draft.model),
        ...filledRanges,
      ];
      saveReportRanges();
      state.rangeManagerSelectedModel = draft.model;
      updateRangeModelList();
      updateRangeEditorPanel();
      notify('该型号整套检测范围已保存', 'success', 'property-range-save');
    });
    dialog.querySelector('[data-range-search]')?.addEventListener('input', (event) => {
      state.rangeManagerSearch = event.target.value || '';
      updateRangeModelList();
    });
    const firstMissing = missingItems[0];
    if (firstMissing && !state.rangeManagerSelectedModel) state.rangeManagerSelectedModel = firstMissing.model;
  };

  function openRangeManagerDialog(missingItems = []) {
    closeRangeManagerDialog();
    state.rangeManagerSearch = '';
    const models = getRangeCandidateModels();
    state.rangeManagerSelectedModel = missingItems[0]?.model || models[0] || '';
    document.body.insertAdjacentHTML('beforeend', buildRangeManagerHtml(missingItems));
    bindRangeManagerEvents(missingItems);
    document.addEventListener('keydown', handleRangeManagerKeydown);
    document.querySelector('[data-range-search]')?.focus({ preventScroll: true });
  }

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

    return state.sort === 'backward' ? nextRows.reverse() : nextRows;
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

  const getSelectedRowsForActiveSheet = () => {
    const sheetName = getActiveSheet(state.data);
    return getRowsForSheet(sheetName).filter((row) => state.selectedKeys.has(row.__rowKey));
  };

  const getSelectedRowsForAllSheets = () => {
    if (!state.data) return [];
    return getSheetNames(state.data).flatMap((sheetName) => (
      getRowsForSheet(sheetName).filter((row) => state.selectedKeys.has(row.__rowKey))
    ));
  };

  const getModelTypeCount = (rows) => {
    const models = new Set();
    rows.forEach((row) => {
      const model = String(row?.型号 ?? '').trim();
      if (model) models.add(model);
    });
    return models.size;
  };

  const updateToolbarState = (filteredRows) => {
    const selectedCount = getSelectedRowsForAllSheets().length;
    const allSelected = isAllFilteredSelected(filteredRows);

    if (refs.selectionMeta) {
      refs.selectionMeta.textContent = `已选 ${selectedCount} 条`;
    }

    if (refs.compareBtn) {
      refs.compareBtn.disabled = selectedCount < 2;
      refs.compareBtn.classList.remove('is-active');
      refs.compareBtn.querySelector('span').textContent = '对比';
    }

    if (refs.selectAllBtn) {
      refs.selectAllBtn.classList.toggle('is-active', allSelected);
      refs.selectAllBtn.querySelector('span').textContent = allSelected ? '取消全选' : '全选';
    }

    if (refs.exportJsonBtn) {
      refs.exportJsonBtn.disabled = !state.data;
    }

    if (refs.exportReportBtn) {
      refs.exportReportBtn.disabled = selectedCount < 1;
    }

    if (refs.importStatus) refs.importStatus.textContent = state.uploadStatusText;
  };

  const formatSelectedRowsTableForAi = (sheetName, rows, columns) => {
    const visibleColumns = columns.filter((column) => column !== '__rowKey');
    const payload = {
      source: 'property-analysis',
      sheetName: sheetName || '',
      selectedCount: rows.length,
      columns: visibleColumns.map((column) => ({
        key: column,
        label: formatHeader(column),
      })),
      rows: rows.map((row, index) => {
        const values = {};
        visibleColumns.forEach((column) => {
          values[formatHeader(column)] = row[column] ?? '';
        });
        return {
          index: index + 1,
          values,
        };
      }),
    };

    return JSON.stringify(payload, null, 2);
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

  const getCompareColumns = (rows) => {
    const columns = getColumns(rows);
    const mustShow = ['型号', '批次', '测试温度'].filter((column) => columns.includes(column));
    const metricColumns = METRIC_COLUMNS.filter((column) => columns.includes(column));
    const rest = columns.filter((column) => !mustShow.includes(column) && !metricColumns.includes(column));
    return [...mustShow, ...metricColumns, ...rest].filter((column) => column !== '__rowKey');
  };

  const getCompareCellText = (row, column) => {
    const value = row?.[column];
    if (Array.isArray(value)) {
      const main = value.map((item) => `[${valueToText(item)}]`).join(' ');
      const averageText = getAverageText(value);
      return `${main}${averageText ? ` (${averageText})` : ''}`;
    }
    return valueToText(value) || '--';
  };

  const createCompareImageBlob = async (rows) => {
    const columns = getCompareColumns(rows);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建图片画布。');

    if (document.fonts?.ready) await document.fonts.ready;

    const fontFamily = '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
    const font = `700 14px ${fontFamily}`;
    const headerFont = `900 14px ${fontFamily}`;
    const titleFont = `950 20px ${fontFamily}`;
    const horizontalPadding = 16;
    const titleHeight = 58;
    const rowHeight = 46;
    const headerHeight = 48;
    const minColumnWidth = 92;
    const maxColumnWidth = 280;

    context.font = font;
    const measureTextWidth = (text, activeFont = font) => {
      context.font = activeFont;
      return Math.ceil(context.measureText(String(text || '')).width);
    };

    const columnWidths = columns.map((column) => {
      const headerWidth = measureTextWidth(formatHeader(column), headerFont);
      const cellWidth = Math.max(...rows.map((row) => measureTextWidth(getCompareCellText(row, column), font)), 0);
      return Math.max(
        minColumnWidth,
        Math.min(Math.max(headerWidth, cellWidth) + horizontalPadding * 2, maxColumnWidth)
      );
    });

    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const imageWidth = tableWidth + 2;
    const imageHeight = titleHeight + headerHeight + rows.length * rowHeight + 2;

    canvas.width = Math.ceil(imageWidth * dpr);
    canvas.height = Math.ceil(imageHeight * dpr);
    canvas.style.width = `${imageWidth}px`;
    canvas.style.height = `${imageHeight}px`;
    context.scale(dpr, dpr);

    const drawCell = ({ x, y, width, height, text, fill, color = '#0f2748', activeFont = font, align = 'center' }) => {
      context.fillStyle = fill;
      context.fillRect(x, y, width, height);
      context.strokeStyle = '#e7edf5';
      context.lineWidth = 1;
      context.strokeRect(x + .5, y + .5, width, height);

      context.font = activeFont;
      context.fillStyle = color;
      context.textBaseline = 'middle';
      context.textAlign = align;

      const safeText = String(text || '--');
      const maxTextWidth = Math.max(20, width - horizontalPadding * 2);
      let displayText = safeText;
      while (measureTextWidth(displayText, activeFont) > maxTextWidth && displayText.length > 1) {
        displayText = `${displayText.slice(0, -2)}...`;
      }

      const textX = align === 'left' ? x + horizontalPadding : x + width / 2;
      context.fillText(displayText, textX, y + height / 2);
    };

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, imageWidth, imageHeight);
    context.fillStyle = '#0f2748';
    context.font = titleFont;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('广俊数据对比', 16, titleHeight / 2);

    let x = 1;
    let y = titleHeight;
    columns.forEach((column, index) => {
      drawCell({
        x,
        y,
        width: columnWidths[index],
        height: headerHeight,
        text: formatHeader(column),
        fill: '#f8fbff',
        color: '#1f3150',
        activeFont: headerFont,
      });
      x += columnWidths[index];
    });

    y += headerHeight;
    rows.forEach((row) => {
      x = 1;
      columns.forEach((column, index) => {
        drawCell({
          x,
          y,
          width: columnWidths[index],
          height: rowHeight,
          text: getCompareCellText(row, column),
          fill: '#ffffff',
          color: '#0b356b',
          activeFont: font,
        });
        x += columnWidths[index];
      });
      y += rowHeight;
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片生成失败。'));
      }, 'image/png');
    });
  };

  const copyCompareImage = async (button) => {
    const rows = getSelectedRowsForAllSheets();
    if (rows.length < 2) return;
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      App.notify?.error?.('当前浏览器不支持复制图片到剪贴板。');
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.querySelector('span').textContent = '复制中';
      }
      const blob = await createCompareImageBlob(rows);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      App.notify?.success?.('对比图片已复制到剪贴板');
    } catch (error) {
      console.error('[property-analysis] Failed to copy compare image:', error);
      App.notify?.error?.(error?.message || '复制图片失败');
    } finally {
      if (button) {
        button.disabled = false;
        button.querySelector('span').textContent = '复制图片';
      }
    }
  };

  const buildCompareDialogHtml = (rows) => {
    const columns = getCompareColumns(rows);

    return `
      <div class="analysis-compare-dialog dialog-overlay" role="dialog" aria-modal="true" aria-label="物性数据对比">
        <div class="analysis-compare-card dialog-card">
          <div class="analysis-compare-head">
            <div class="analysis-compare-title">广俊数据对比</div>
            <div class="analysis-compare-actions">
              <button class="analysis-compare-copy" type="button" data-analysis-compare-copy>
                <i class="ti ti-clipboard-copy" aria-hidden="true"></i>
                <span>复制图片</span>
              </button>
              <button class="analysis-compare-close dialog-close" type="button" aria-label="关闭对比弹窗" data-analysis-compare-close>
                <i class="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="analysis-compare-body">
            <section class="analysis-compare-section">
              <div class="analysis-compare-table-wrap">
                <table class="analysis-compare-table">
                  <thead>
                    <tr>
                      ${columns.map((column) => `<th>${escapeHtml(formatHeader(column))}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((row) => `
                      <tr>
                        ${columns.map((column) => {
                          const cell = getCellDisplay(row[column], column);
                          return `<td title="${escapeHtml(cell.title)}">${cell.html}</td>`;
                        }).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  };

  const closeCompareDialog = () => {
    document.querySelector('.analysis-compare-dialog')?.remove();
    document.removeEventListener('keydown', handleCompareDialogKeydown);
  };

  function handleCompareDialogKeydown(event) {
    if (event.key === 'Escape') closeCompareDialog();
  }

  const openCompareDialog = () => {
    const rows = getSelectedRowsForAllSheets();
    if (rows.length < 2) return;

    closeCompareDialog();
    document.body.insertAdjacentHTML('beforeend', buildCompareDialogHtml(rows));
    const dialog = document.querySelector('.analysis-compare-dialog');
    dialog?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const copyButton = target.closest('[data-analysis-compare-copy]');
      if (copyButton) {
        copyCompareImage(copyButton);
        return;
      }
      if (target.closest('[data-analysis-compare-close]') || target === dialog) closeCompareDialog();
    });
    document.addEventListener('keydown', handleCompareDialogKeydown);
    dialog?.querySelector('[data-analysis-compare-close]')?.focus({ preventScroll: true });
  };

  const escapeMarkdownTableCell = (value) => String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const formatRowsMarkdownTableForAi = (rows, columns, limit = null) => {
    const visibleColumns = (columns || []).filter((column) => column !== '__rowKey');
    const tableRows = limit == null ? rows : rows.slice(0, limit);
    if (!tableRows.length || !visibleColumns.length) return '';

    const headers = ['序号', ...visibleColumns.map(formatHeader)];
    const lines = [
      `| ${headers.map(escapeMarkdownTableCell).join(' |')} |`,
      `| ${headers.map(() => '---').join(' |')} |`,
    ];

    tableRows.forEach((row, index) => {
      const values = visibleColumns.map((column) => {
        const value = Array.isArray(row[column]) ? row[column].join(' / ') : valueToText(row[column]);
        return escapeMarkdownTableCell(value || '-');
      });
      lines.push(`| ${[index + 1, ...values].join(' |')} |`);
    });

    return lines.join('\n');
  };

  const getAgentDetailColumns = (columns = []) => {
    const visibleColumns = columns.filter((column) => column !== '__rowKey');
    const available = new Set(visibleColumns);
    const prioritized = COLUMN_PRIORITY.filter((column) => available.has(column));
    const remaining = visibleColumns.filter((column) => !prioritized.includes(column));
    return [...prioritized, ...remaining];
  };

  const getAiContext = () => {
    if (!state.data) return '';

    const sheetName = getActiveSheet(state.data);
    const { filteredRows, columns } = getVisibleRows();
    const selectedRows = getSelectedRowsForAllSheets();
    const targetColumns = selectedRows.length ? getColumns(selectedRows) : columns;
    const targetRows = selectedRows;
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
      `数据范围：共 ${filteredRows.length} 条筛选结果，当前工作表已选 ${selectedRows.length} 条；当前上下文只使用已选数据 ${targetRows.length} 条。`,
    ];

    if (!selectedRows.length) {
      lines.push('当前物性分析页面没有选中行。请先在表格中点击选择需要分析的数据行，再发送问题。');
      return lines.join('\n');
    }

    if (metrics.length) {
      lines.push('关键指标摘要：', ...metrics.map((item) => `- ${item}`));
    }

    const rowLines = summarizeRowsForAi(targetRows, targetColumns, 12);
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

  const getSelectedAiContext = (question = '') => {
    if (!state.data) return '';

    const sheetName = getActiveSheet(state.data);
    const selectedRows = getSelectedRowsForAllSheets();
    const { filteredRows, columns } = getVisibleRows();
    const selectedColumns = selectedRows.length ? getColumns(selectedRows) : columns;

    if (!selectedRows.length) {
      return [
        '【已请求接入：物性分析已选数据】',
        `当前工作表：${sheetName || '未选择'}`,
        `当前筛选结果：${filteredRows.length} 条`,
        '当前没有选中任何物性数据行。请提示用户先在物性分析表格中点击选择需要上传给 AI 的数据。',
      ].join('\n');
    }

    const questionTerms = extractQuestionTerms(question);
    const matchedRows = selectedRows
      .filter((row) => rowMatchesTerms(row, questionTerms))
      .slice(0, 30);

    return [
      '【已后台接入：物性分析已选数据】',
      '以下数据来自物性分析页面当前选中的表格行，只包含用户选中的数据。请优先基于这些已选数据回答，不要要求用户重新粘贴表格。',
      '重要规则：如果用户问题里出现型号或批次，必须先在下方已选数据字段中匹配。没有完全匹配时，要明确说明“未找到完全匹配”，再列出已选数据中的相近匹配；不要按外部常识解释为服务器、网络设备或其他无关产品。',
      `当前页面状态：工作表=${sheetName || '未选择'}；查询词=${state.query.trim() || '无'}；搜索方式=${state.searchMode === 'exact' ? '精准查询' : '模糊查询'}；排序=${state.sort}。`,
      `已选数据行数：${selectedRows.length}`,
      questionTerms.length ? `用户问题提取关键词：${questionTerms.join('、')}` : '用户问题未提取到明显型号/批次关键词。',
      matchedRows.length ? `已选数据中的问题相关匹配行：\n${summarizeRowsForAi(matchedRows, selectedColumns, 30).join('\n')}` : '已选数据中的问题相关匹配行：未匹配到完全或相近行，请基于全部已选数据继续查找并说明。',
      '已选数据 JSON：',
      formatSelectedRowsTableForAi(sheetName, selectedRows, selectedColumns),
    ].filter(Boolean).join('\n');
  };

  const getAiDataFile = (question = '') => {
    if (!getSelectedRowsForAllSheets().length) return null;
    const content = getSelectedAiContext(question);
    if (!content) return null;

    return {
      filename: `property-analysis-selected-data-${new Date().toISOString().slice(0, 10)}.txt`,
      mimeType: 'text/plain',
      content,
    };
  };

  const normalizeAgentText = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeAgentTerm = (term) => normalizeAgentText(term)
    .replace(/^(帮我|请|麻烦|分析一下|查一下|看一下|查询一下|分析|查询|查看|看)\s*/, '')
    .replace(/^的+/, '')
    .replace(/(一下|看看|数据|情况|结果)$/g, '')
    .trim();

  const extractAgentTerms = (question = '') => {
    const text = String(question || '');
    const terms = [
      ...(text.match(/[A-Za-z0-9][A-Za-z0-9._/-]{1,}/g) || []),
      ...(text.match(/[\u4e00-\u9fa5]{2,}/g) || []),
    ];
    return [...new Set(terms
      .map(normalizeAgentTerm)
      .filter((term) => term.length >= 2 && !AGENT_STOP_TERMS.has(term)))];
  };

  const getIdentifierTerms = (terms) => terms.filter((term) => /[a-z0-9]/i.test(term) && term.length >= 3);

  const rowMatchesIdentifierTerm = (row, term) => {
    const normalizedTerm = normalizeAgentText(term);
    if (!normalizedTerm) return false;
    return SEARCH_KEYS.some((key) => flattenSearchTexts(row?.[key]).some((value) => value === normalizedTerm));
  };

  const extractAgentRowLimit = (question = '') => {
    const text = String(question || '');
    if (/(?:全部|所有|完整|全量|不要省略|不要截断)/.test(text)) return null;
    const match = text.match(/(?:前|只要|仅|取|显示|列出|上传|给我)?\s*(\d{1,3})\s*(?:条|行|个|批次|记录|数据)/);
    if (!match) return null;
    const count = Number.parseInt(match[1], 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    return Math.min(count, 500);
  };

  const extractAgentRowWindow = (question = '') => {
    const text = String(question || '');
    const limit = extractAgentRowLimit(text);
    if (limit == null) return { limit: null, mode: 'all' };

    const wantsTail = /(?:最近|最新|近期|近|靠后|后面|末尾|最后|后)\s*的?\s*\d{0,3}\s*(?:条|行|个|批次|记录|数据)?/.test(text)
      || /\d{1,3}\s*(?:条|行|个|批次|记录|数据)?\s*(?:最近|最新|靠后|后面|末尾|最后)/.test(text);
    const wantsHead = /(?:最早|早期|靠前|前面|之前|以前|老批次|旧批次)\s*的?\s*\d{0,3}\s*(?:条|行|个|批次|记录|数据)?/.test(text)
      || /前\s*\d{1,3}\s*(?:条|行|个|批次|记录|数据)/.test(text);

    return {
      limit,
      mode: wantsTail ? 'tail' : wantsHead ? 'head' : 'head',
    };
  };

  const sliceAgentRowsByWindow = (rows, rowWindow) => {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const limit = rowWindow?.limit;
    if (limit == null || sourceRows.length <= limit) return sourceRows;
    return rowWindow.mode === 'tail' ? sourceRows.slice(-limit) : sourceRows.slice(0, limit);
  };

  const getAgentRowWindowDescription = (rowWindow) => {
    if (!rowWindow?.limit) return '上传策略：默认上传全部符合条件的数据；仅在用户指定数量时限制行数。';
    if (rowWindow.mode === 'tail') {
      return `用户指定上传数量：${rowWindow.limit} 行；批次顺序按表格从旧到新理解，已取靠后的最近 ${rowWindow.limit} 行，并保持从旧到新的顺序展示。`;
    }
    return `用户指定上传数量：${rowWindow.limit} 行；批次顺序按表格从旧到新理解，已取靠前的较早 ${rowWindow.limit} 行。`;
  };

  const getRowSearchText = (row) => normalizeAgentText(Object.entries(row || {})
    .filter(([key]) => key !== '__rowKey')
    .map(([key, value]) => `${formatHeader(key)} ${Array.isArray(value) ? value.join(' ') : valueToText(value)}`)
    .join(' '));

  const scoreAgentRow = (row, terms) => {
    if (!terms.length) return 0;
    const rowText = getRowSearchText(row);
    return terms.reduce((score, term) => {
      const normalizedTerm = normalizeAgentText(term);
      if (!normalizedTerm) return score;
      if (rowText.includes(normalizedTerm)) return score + 3;
      if (normalizedTerm.length >= 4 && rowText.includes(normalizedTerm.slice(0, Math.max(3, Math.floor(normalizedTerm.length * 0.7))))) return score + 1;
      return score;
    }, 0);
  };

  const getMetricSummaryForAgent = (rows) => [
    '熔指',
    '拉伸强度[Mpa]',
    '断裂伸长率[%]',
    '弯曲强度[Mpa]',
    '弯曲模量[Mpa]',
    '冲击强度[Mpa]',
    '灰份',
  ].map((key) => summarizeMetric(rows, key)).filter(Boolean);

  const getAgentContext = (question = '', options = {}) => {
    if (!state.data) {
      return {
        title: '物性分析',
        reason: '物性分析数据尚未加载完成',
        content: '【物性分析】数据尚未加载完成，暂时无法检索物性表格。',
        score: 0,
      };
    }

    const activeSheet = getActiveSheet(state.data);
    const sheetNames = getSheetNames(state.data);
    const visible = getVisibleRows();
    const selectedRows = getSelectedRowsForAllSheets();
    const terms = extractAgentTerms(question);
    const identifierTerms = getIdentifierTerms(terms);
    const rowWindow = extractAgentRowWindow(question);
    const requestedRowLimit = rowWindow.limit;
    const exactMatches = [];
    const scoredRows = [];

    sheetNames.forEach((sheetName) => {
      const rows = getRowsForSheet(sheetName);
      const columns = getColumns(rows);
      rows.forEach((row) => {
        if (identifierTerms.some((term) => rowMatchesIdentifierTerm(row, term))) {
          exactMatches.push({ sheetName, row, columns, score: 100 });
          return;
        }
        const score = scoreAgentRow(row, terms);
        if (score > 0) scoredRows.push({ sheetName, row, columns, score });
      });
    });

    scoredRows.sort((a, b) => b.score - a.score);
    const strongMatches = exactMatches.length ? exactMatches : scoredRows.filter((item) => item.score >= 3);
    const similarMatches = exactMatches.length ? [] : scoredRows.filter((item) => item.score > 0 && item.score < 3);
    const fallbackRows = selectedRows.length
      ? selectedRows.map((row) => ({ sheetName: activeSheet, row, columns: visible.columns }))
      : visible.filteredRows.map((row) => ({ sheetName: activeSheet, row, columns: visible.columns }));
    const rowsForSummary = strongMatches.length
      ? sliceAgentRowsByWindow(strongMatches.map((item) => item.row), rowWindow)
      : selectedRows.length
        ? sliceAgentRowsByWindow(selectedRows, rowWindow.limit == null ? { limit: AGENT_CONTEXT_ROW_LIMIT, mode: 'head' } : rowWindow)
        : sliceAgentRowsByWindow(visible.filteredRows, rowWindow.limit == null ? { limit: AGENT_CONTEXT_ROW_LIMIT, mode: 'head' } : rowWindow);
    const metrics = getMetricSummaryForAgent(rowsForSummary);
    const sections = [
      '【物性分析检索结果】',
      `命中原因：${terms.length ? `根据关键词 ${terms.join('、')} 检索物性数据` : '用户问题未提取到明确型号/批次，使用当前页面数据概览'}`,
      identifierTerms.length ? `精确型号/批次关键词：${identifierTerms.join('、')}；精确命中 ${exactMatches.length} 行。` : '',
      getAgentRowWindowDescription(rowWindow),
      `当前工作表：${activeSheet || '未选择'}；筛选结果：${visible.filteredRows.length} 条；已选行：${selectedRows.length} 条。`,
      `搜索方式：${state.searchMode === 'exact' ? '精准查询' : '模糊查询'}；查询词：${state.query.trim() || '无'}。`,
      '展示策略：前端会先展示全部匹配数据表格，AI 只需要继续输出表格后的分析。',
    ].filter(Boolean);
    const displayTableSections = [];

    const appendRows = (title, items, rowLimit = null) => {
      if (!items.length) return;
      const grouped = items.reduce((map, item) => {
        const key = item.sheetName || activeSheet || '未命名工作表';
        if (!map.has(key)) map.set(key, { columns: item.columns, rows: [] });
        map.get(key).rows.push(item.row);
        return map;
      }, new Map());
      sections.push(title);
      grouped.forEach((group, sheetName) => {
        sections.push(`### ${sheetName}（${group.rows.length} 行）`);
        const displayColumns = getAgentDetailColumns(group.columns);
        const limitedRows = sliceAgentRowsByWindow(group.rows, { limit: rowLimit, mode: rowWindow.mode });
        const limit = limitedRows.length;
        const table = formatRowsMarkdownTableForAi(limitedRows, displayColumns, null);
        if (table) {
          const tableTitle = `### ${sheetName}（${limit} / ${group.rows.length} 行）`;
          displayTableSections.push(tableTitle, table);
          sections.push('【用于分析的数据表；前端会展示，请不要在分析中重复输出】', tableTitle, table);
        }
        if (rowLimit != null && group.rows.length > limit) {
          const hiddenPosition = rowWindow.mode === 'tail' ? '靠前的较早' : '靠后的较新';
          sections.push(`还有 ${group.rows.length - limit} 行未展开；这是因为用户指定了数量限制，未展开的是${hiddenPosition}数据。`);
        }
      });
    };

    appendRows(`${exactMatches.length ? '精确匹配数据' : '强匹配数据'}（共 ${strongMatches.length} 行）：`, strongMatches, requestedRowLimit);
    appendRows(`相近匹配数据（共 ${similarMatches.length} 行）：`, similarMatches, requestedRowLimit ?? AGENT_CONTEXT_SIMILAR_LIMIT);
    if (!strongMatches.length && !similarMatches.length) {
      appendRows(selectedRows.length ? '当前已选数据：' : `当前筛选数据预览（共 ${fallbackRows.length} 行）：`, fallbackRows, requestedRowLimit ?? AGENT_CONTEXT_ROW_LIMIT);
    }
    if (metrics.length) sections.push('表格之后再输出的分析摘要：', ...metrics.map((item) => `- ${item}`));
    const content = sections.join('\n');
    const uploadedRows = strongMatches.length
      ? (requestedRowLimit == null ? strongMatches.length : Math.min(strongMatches.length, requestedRowLimit))
      : similarMatches.length
        ? (requestedRowLimit == null ? Math.min(similarMatches.length, AGENT_CONTEXT_SIMILAR_LIMIT) : Math.min(similarMatches.length, requestedRowLimit))
        : (requestedRowLimit == null ? Math.min(fallbackRows.length, AGENT_CONTEXT_ROW_LIMIT) : Math.min(fallbackRows.length, requestedRowLimit));

    return {
      title: '物性分析',
      reason: strongMatches.length || similarMatches.length
        ? '匹配到物性型号/批次/指标数据'
        : selectedRows.length
          ? '未命中关键词，使用当前已选物性数据'
          : '未命中关键词，使用当前筛选物性数据预览',
      content,
      score: options.forceCurrentPage ? 9 : 7,
      stats: {
        exactMatches: exactMatches.length,
        strongMatches: strongMatches.length,
        similarMatches: similarMatches.length,
        selectedRows: selectedRows.length,
        filteredRows: visible.filteredRows.length,
        requestedRowLimit,
        rowWindowMode: rowWindow.mode,
        uploadedRows,
        fullMatchedRowsUploaded: requestedRowLimit == null && strongMatches.length > 0,
        contextChars: content.length,
      },
      displayTable: displayTableSections.join('\n\n'),
      fullContext: requestedRowLimit == null && strongMatches.length > 0,
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
              ${rows.map((row) => {
                const selected = state.selectedKeys.has(row.__rowKey);
                return `
                <tr class="${selected ? 'is-selected' : ''}" data-row-key="${escapeHtml(row.__rowKey)}" aria-selected="${selected ? 'true' : 'false'}">
                  ${columns.map((column) => {
                    const cell = getCellDisplay(row[column], column);
                    return `
                      <td title="${escapeHtml(cell.title)}">
                        <div class="analysis-cell">${cell.html}</div>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `;
              }).join('')}
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

    const modelTypeCount = getModelTypeCount(filteredRows);
    const totalText = `共 ${filteredRows.length} 条 / ${modelTypeCount} 种型号`;
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
      setUploadStatus('解析中');
      const parsed = await parseExcelWorkbook(file);
      setUploadStatus('上传中 0%');
      await uploadPropertyDataToOss(parsed, file, (percent) => {
        setUploadStatus(`上传中 ${percent}%`);
      });
      await loadData({ bustCache: true, useOss: true });
      setUploadStatus('已同步成功');
    } catch (error) {
      setUploadStatus(`同步失败：${error?.message || '文件格式错误'}`);
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
    openCompareDialog();
  };

  const loadData = async (options = {}) => {
    const startedAt = performance.now();
    try {
      setUploadStatus('读取中', 'loading');
      const ossConfig = getOssConfig();
      const shouldReadOss = hasOssReadConfig(ossConfig);
      if (!shouldReadOss) {
        throw new Error('请先在配置中心填写 OSS Bucket、Endpoint 和 JSON 路径。');
      }
      const dataUrl = getOssObjectUrl(ossConfig);
      const url = options.bustCache
        ? `${dataUrl}${dataUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
        : dataUrl;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setAnalysisData(await response.json(), {
        source: 'oss',
        fileName: ossConfig.objectKey,
      });
      setUploadStatus(`读取成功 ${formatDuration(startedAt)}`, 'success');
    } catch (error) {
      state.data = null;
      state.dataSource = 'oss';
      state.sourceFileName = '';

      if (refs.sheetTabs) refs.sheetTabs.innerHTML = '';
      if (refs.panel) refs.panel.hidden = true;
      if (refs.tableWrap) {
        refs.tableWrap.innerHTML = '<div class="analysis-empty">云端物性数据加载失败，请检查 OSS 配置、文件路径或跨域设置。</div>';
      }
      if (refs.panelCount) refs.panelCount.textContent = '共 0 条';
      if (refs.footerTotal) refs.footerTotal.textContent = '共 0 条';
      if (refs.selectionMeta) refs.selectionMeta.textContent = '已选 0 条';
      setUploadStatus('读取失败');
      if (refs.pagination) refs.pagination.hidden = true;

      console.error('[property-analysis] Failed to load data:', error);
    }
  };

  const bind = () => {
    ensureReportToolbar();

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
      state.sort = event.target.value === 'backward' ? 'backward' : 'forward';
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
        row.classList.remove('is-selected');
        row.setAttribute('aria-selected', 'false');
      } else {
        state.selectedKeys.add(rowKey);
        row.classList.add('is-selected');
        row.setAttribute('aria-selected', 'true');
      }

      updateToolbarState(getVisibleRows().filteredRows);
    });

    refs.selectAllBtn?.addEventListener('click', toggleSelectAllFiltered);
    refs.compareBtn?.addEventListener('click', toggleCompareMode);
    refs.exportJsonBtn?.addEventListener('click', exportCurrentJson);
    refs.manageRangesBtn?.addEventListener('click', () => openRangeManagerDialog());
    refs.exportReportBtn?.addEventListener('click', openReportDialog);
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
    loadReportRanges();
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
    getSelectedAiContext,
    getAiDataFile,
    getAgentContext,
  };
})();
