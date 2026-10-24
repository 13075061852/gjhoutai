import { getLegacyApp } from '../core/app-context';
import '../../styles/pages/property-analysis.css';
import '../../styles/pages/property-mobile.css';
import { cloudStorage } from '../../services/cloud-storage';
import { getCompactPagination } from '../../utils/compactPagination';
import { setCloudBackedLocalStorageItem } from '../../services/cloud-sync';
import { LOCAL_STORAGE_KEYS } from '../../services/local-storage-keys';
import {
  IMPACT_STRENGTH_HEADER_ALIASES,
  IMPACT_STRENGTH_METRIC_KEY,
  normalizePropertyMetricRow,
  normalizePropertyReportRange,
} from './property-analysis-metrics';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { constants, utils } = App;
  const PAGE_SIZE_DEFAULT = 20;
  const ALL_PROPERTY_SHEETS_KEY = '__all_property_sheets__';
  const ALL_PROPERTY_SHEETS_LABEL = '全部分类';
  const COMPARE_VALUE_MODE_DEFAULT = 'average';
  const REPORT_RANGE_STORAGE_KEY = LOCAL_STORAGE_KEYS.propertyReportRanges;
  const REPORT_COMPANY_NAME = '宁波广俊塑料科技有限公司';
  const REPORT_COMPANY_ADDRESS = '浙江省慈溪市横河万洋众创城 28 栋 1-3';
  const REPORT_COMPANY_TEL = '0574-63072712';
  const REPORT_COMPANY_FAX = '0574-63805667';
  const REPORT_SEAL_SRC = `${String(import.meta.env.BASE_URL || '/')}inspection-seal.webp`;
  const REPORT_SEAL_POSITION_STORAGE_KEY = LOCAL_STORAGE_KEYS.propertyReportSealPosition;
  const REPORT_SEAL_DEFAULT = { x: 428, y: 760, size: 150, rotation: 0 };
  let reportSealImagePromise = null;
  const HEADER_LABELS = {
    型号: '型号',
    批次: '批次',
    测试温度: '测试温度(℃)',
    熔指: '熔指(g/10min)',
    '拉伸强度[Mpa]': '拉伸强度(MPa)',
    '断裂伸长率[%]': '断裂伸长率(%)',
    '弯曲强度[Mpa]': '弯曲强度(MPa)',
    '弯曲模量[Mpa]': '弯曲模量(MPa)',
    [IMPACT_STRENGTH_METRIC_KEY]: IMPACT_STRENGTH_METRIC_KEY,
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
    IMPACT_STRENGTH_METRIC_KEY,
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
    IMPACT_STRENGTH_METRIC_KEY,
    '灼热丝',
    '灼热丝[1.6mm]',
    '灼热丝[0.8mm]',
    '灰份',
  ];
  const REPORT_METRICS = [
    { key: '灰份', item: '灰份', unit: '%' },
    { key: '熔指', item: '熔融指数（260℃ / 2.16KG）', unit: 'g/10min' },
    { key: '拉伸强度[Mpa]', item: '拉伸强度', unit: 'MPa' },
    { key: '弯曲强度[Mpa]', item: '弯曲强度', unit: 'MPa' },
    { key: '弯曲模量[Mpa]', item: '弯曲模量', unit: 'MPa' },
    { key: IMPACT_STRENGTH_METRIC_KEY, item: '缺口冲击强度（悬臂）', unit: 'kJ/m²' },
    { key: '灼热丝', item: '灼热丝', unit: '℃', required: false },
  ];
  const REPORT_METRIC_ALIASES = {
    灰份: ['灰份', '灰分', '灰份(%)', '灰分(%)', '灰份[%]', '灰分[%]', '灰份（%）', '灰分（%）'],
    灼热丝: ['灼热丝', '灼热丝[1.6mm]', '灼热丝[0.8mm]', '灼热丝（1.6mm）', '灼热丝（0.8mm）'],
    [IMPACT_STRENGTH_METRIC_KEY]: [...IMPACT_STRENGTH_HEADER_ALIASES],
  };
  const normalizeMetricHeaderIdentity = (value) => String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .toLowerCase();
  const REPORT_METRIC_ALIAS_MAP = new Map(
    Object.entries(REPORT_METRIC_ALIASES).flatMap(([key, aliases]) => (
      aliases.map((alias) => [normalizeMetricHeaderIdentity(alias), key])
    ))
  );
  const getCanonicalReportMetricKey = (value) => {
    const identity = normalizeMetricHeaderIdentity(value);
    if (!identity) return '';
    if (REPORT_METRIC_ALIAS_MAP.has(identity)) return REPORT_METRIC_ALIAS_MAP.get(identity);
    if (identity.includes('灰份') || identity.includes('灰分')) return '灰份';
    if (identity.includes('灼热丝')) return '灼热丝';
    return '';
  };
  const MELT_INDEX_METRIC_KEY = '熔指';
  const MELT_INDEX_TEMPERATURES = ['250℃', '260℃', '275℃'];
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
    mobileActionToggle: document.getElementById('analysisMobileActionToggle'),
    mobileActionMenu: document.getElementById('analysisMobileActionMenu'),
    exportReportBtn: document.getElementById('analysisExportReportBtn'),
    manageRangesBtn: document.getElementById('analysisManageRangesBtn'),
    rangeWordInput: null,
    excelInput: document.getElementById('analysisExcelInput'),
    importStatus: document.getElementById('analysisImportStatus'),
    panelCount: document.getElementById('analysisPanelCount'),
    footerTotal: document.getElementById('analysisFooterTotal'),
    selectionMeta: document.getElementById('analysisSelectionMeta'),
    statusRow: document.getElementById('analysisSelectionMeta')?.closest('.analysis-status-row'),
    sortToggle: document.getElementById('analysisSortToggle'),
  };

  const state: any = {
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
    rangeWordImporting: false,
    reportSealPosition: { ...REPORT_SEAL_DEFAULT },
    dataSource: 'default',
    sourceFileName: '',
    uploadStatusText: '读取中',
    loadRequestId: 0,
    loadingStartedAt: 0,
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

    refs.rangeWordInput = document.getElementById('analysisRangeWordInput');
    if (!refs.rangeWordInput) {
      const input = document.createElement('input');
      input.id = 'analysisRangeWordInput';
      input.type = 'file';
      input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      input.multiple = true;
      input.hidden = true;
      document.body.appendChild(input);
      refs.rangeWordInput = input;
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

  const setMobileActionMenuOpen = (open) => {
    if (!refs.mobileActionToggle || !refs.mobileActionMenu) return;
    refs.mobileActionToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    refs.mobileActionMenu.classList.toggle('is-open', open);
  };

  const isMobileAnalysisLayout = () => window.matchMedia?.('(max-width: 980px)')?.matches || window.innerWidth <= 980;

  const ensureMobileActionMenu = () => {
    if (!refs.exportJsonBtn?.parentElement) return;

    const sourceGroup = document.querySelector('[data-page-section="property-analysis"] .analysis-action-group');
    if (!sourceGroup) return;
    const mobileActionHost = isMobileAnalysisLayout() ? refs.statusRow || sourceGroup : sourceGroup;

    if (!refs.mobileActionToggle) {
      const button = document.createElement('button');
      button.className = 'analysis-action-menu-toggle';
      button.id = 'analysisMobileActionToggle';
      button.type = 'button';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'analysisMobileActionMenu');
      button.innerHTML = '<i class="ti ti-adjustments-horizontal" aria-hidden="true"></i><span>操作</span>';
      mobileActionHost.appendChild(button);
      refs.mobileActionToggle = button;
    } else if (refs.mobileActionToggle.parentElement !== mobileActionHost) {
      mobileActionHost.appendChild(refs.mobileActionToggle);
    }

    if (!refs.mobileActionMenu) {
      const menu = document.createElement('div');
      menu.className = 'analysis-action-menu';
      menu.id = 'analysisMobileActionMenu';
      mobileActionHost.appendChild(menu);
      refs.mobileActionMenu = menu;
    } else if (refs.mobileActionMenu.parentElement !== mobileActionHost) {
      mobileActionHost.appendChild(refs.mobileActionMenu);
    }

    sourceGroup.querySelectorAll(':scope > .analysis-toolbar-btn').forEach((button) => {
      refs.mobileActionMenu?.appendChild(button);
    });
  };

  const normalizeRows = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => normalizePropertyMetricRow(item));
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
    if (!text) return `_empty_${index + 1}`;
    return getCanonicalReportMetricKey(text) || text;
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
    const rows: any[] = [];

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
    const next: any = {};
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
    const records: any[] = [];
    let current: any = null;

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

  const fetchPropertyData = async () => {
    const payload = await cloudStorage.getPropertyData<any>();
    if (!payload?.data) throw new Error('物性数据尚未配置');
    return payload;
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

  const ensureJsZipLoaded = async () => {
    if (window.JSZip) return window.JSZip;

    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip');
    } catch {
      throw new Error('Word解析库未加载。当前网络或代理无法访问 JSZip CDN，请稍后重试。');
    }

    if (!window.JSZip) {
      throw new Error('Word解析库加载异常，请刷新页面后重试。');
    }

    return window.JSZip;
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

  const getMetricRawValue = (row, key) => {
    if (!row) return undefined;
    if (hasMeaningfulValue(row[key])) return row[key];
    const aliases = REPORT_METRIC_ALIASES[key] || [];
    const matchedKey = aliases.find((alias) => hasMeaningfulValue(row[alias]));
    if (matchedKey) return row[matchedKey];
    const normalizedKey = normalizeMetricHeaderIdentity(key);
    const scannedKey = Object.keys(row).find((rowKey) => {
      if (!hasMeaningfulValue(row[rowKey])) return false;
      const canonicalKey = getCanonicalReportMetricKey(rowKey);
      return canonicalKey === key || normalizeMetricHeaderIdentity(rowKey) === normalizedKey;
    });
    return scannedKey ? row[scannedKey] : row[key];
  };

  const getMetricValue = (row, key) => {
    const value = getMetricRawValue(row, key);
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

  const getReportDisplayModel = (row) => getRowModel(row).split('-')[0] || getRowModel(row);

  const getAshValueFromModel = (model = '') => {
    const match = normalizeReportText(model).match(/G(\d{1,2})(?:-|$)/i);
    if (!match) return null;
    const ashBase = Number.parseInt(match[1], 10);
    return Number.isFinite(ashBase) ? ashBase * 5 : null;
  };

  const getDerivedReportMetricValue = (row, metricKey) => {
    if (metricKey !== '灰份') return null;
    return getAshValueFromModel(getRowModel(row));
  };

  const getRowBatch = (row) => normalizeReportText(row?.批次);

  const getRowColor = (row) => {
    const model = getRowModel(row);
    const match = model.match(/-([A-Za-z0-9]+)$/);
    return match?.[1] || normalizeReportText(row?.色号 || row?.颜色 || '');
  };

  const normalizeReportRanges = (value) => (Array.isArray(value) ? value.map((item, index) => {
    const normalizedItem = normalizePropertyReportRange(item || {});
    return {
      id: normalizeReportText(normalizedItem.id) || `range-${Date.now()}-${index}`,
      model: normalizeReportText(normalizedItem.model),
      metricKey: normalizeReportText(normalizedItem.metricKey),
      item: normalizeReportText(normalizedItem.item),
      unit: normalizeReportText(normalizedItem.unit),
      range: normalizeReportText(normalizedItem.range),
    };
  }).filter((item) => item.model && item.metricKey && item.range) : []);

  const loadReportRanges = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(REPORT_RANGE_STORAGE_KEY) || '[]');
      state.reportRanges = normalizeReportRanges(parsed);
    } catch {
      state.reportRanges = [];
    }
  };

  const loadReportRangesFromCloud = async () => {
    const remoteValue = await cloudStorage.getJson(REPORT_RANGE_STORAGE_KEY);
    if (typeof remoteValue !== 'string') {
      loadReportRanges();
      return false;
    }
    localStorage.setItem(REPORT_RANGE_STORAGE_KEY, remoteValue);
    try {
      state.reportRanges = normalizeReportRanges(JSON.parse(remoteValue || '[]'));
    } catch {
      state.reportRanges = [];
    }
    return true;
  };

  const saveReportRanges = () => {
    setCloudBackedLocalStorageItem(REPORT_RANGE_STORAGE_KEY, JSON.stringify(state.reportRanges));
  };

  const getReportMetricConfig = (metricKey) => (
    REPORT_METRICS.find((metric) => metric.key === metricKey) || {
      key: metricKey,
      item: formatHeader(metricKey),
      unit: '',
      required: true,
    }
  );

  const isRequiredReportMetric = (metricKey) => getReportMetricConfig(metricKey).required !== false;

  const getMeltIndexTemperature = (item = '') => {
    const text = normalizeReportText(item);
    return MELT_INDEX_TEMPERATURES.find((temperature) => text.includes(temperature)) || '260℃';
  };

  const buildMeltIndexItemLabel = (temperature = '260℃') => `熔融指数（${temperature} / 2.16KG）`;

  const normalizeDocxText = (value = '') => normalizeReportText(value)
    .replace(/\u00a0/g, ' ')
    .replace(/℃|°C|°/gi, '℃')
    .replace(/[≥≧]/g, '≥')
    .replace(/[≤≦]/g, '≤')
    .replace(/[／]/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

  const getReportMetricByDocxItem = (item = '') => {
    const text = normalizeDocxText(item).toLowerCase();
    if (!text) return null;
    if (text.includes('灰') && (text.includes('分') || text.includes('份'))) return getReportMetricConfig('灰份');
    if (text.includes('灼热丝')) return getReportMetricConfig('灼热丝');
    if (text.includes('熔') && (text.includes('指') || text.includes('融'))) return getReportMetricConfig(MELT_INDEX_METRIC_KEY);
    if (text.includes('拉伸')) return getReportMetricConfig('拉伸强度[Mpa]');
    if (text.includes('弯曲') && text.includes('强度')) return getReportMetricConfig('弯曲强度[Mpa]');
    if (text.includes('弯曲') && text.includes('模量')) return getReportMetricConfig('弯曲模量[Mpa]');
    if (text.includes('冲击')) return getReportMetricConfig(IMPACT_STRENGTH_METRIC_KEY);
    return null;
  };

  const getMeltIndexTemperatureFromDocxItem = (item = '') => {
    const text = normalizeDocxText(item);
    const match = text.match(/(250|260|275)\s*℃/);
    return match ? `${match[1]}℃` : getMeltIndexTemperature(text);
  };

  const normalizeRangeUnit = (unit = '') => normalizeDocxText(unit)
    .replace(/^KJ$/i, 'kJ')
    .replace(/KJ/i, 'kJ')
    .replace(/m2/g, 'm²');

  const normalizeRangeText = (range = '') => normalizeDocxText(range)
    .replace(/^≥\s*\./, '≥0.')
    .replace(/^≤\s*\./, '≤0.');

  const getTextBetweenLabels = (text, label, stopLabels = []) => {
    const source = normalizeDocxText(text);
    const labelIndex = source.indexOf(label);
    if (labelIndex < 0) return '';
    const start = labelIndex + label.length;
    const tail = source.slice(start);
    const stopIndexes = stopLabels
      .map((stopLabel) => tail.indexOf(stopLabel))
      .filter((index) => index >= 0);
    const end = stopIndexes.length ? Math.min(...stopIndexes) : tail.length;
    return normalizeDocxText(tail.slice(0, end).replace(/^[:：]/, ''));
  };

  const normalizeDocxModelPart = (value = '') => normalizeDocxText(value).replace(/\s+/g, '');

  const decodeXmlText = (value = '') => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  };

  const stripDocxXmlToText = (xml = '') => decodeXmlText(String(xml).replace(/<[^>]+>/g, ''));

  const extractDocxText = (xml = '') => normalizeDocxText(stripDocxXmlToText(xml));

  const extractDocxCellText = (cellXml = '') => extractDocxText(cellXml);

  const extractDocxTagBlocks = (xml = '', tagName = '') => {
    const source = String(xml || '');
    const blocks = [];
    let cursor = 0;
    const openPattern = new RegExp(`<${tagName}(?:\\s|>)`, 'g');

    while (cursor < source.length) {
      openPattern.lastIndex = cursor;
      const openMatch = openPattern.exec(source);
      if (!openMatch) break;

      const openEnd = source.indexOf('>', openMatch.index);
      if (openEnd < 0) break;

      let depth = 1;
      let scan = openEnd + 1;
      while (depth > 0 && scan < source.length) {
        const nextOpen = source.indexOf(`<${tagName}`, scan);
        const nextClose = source.indexOf(`</${tagName}>`, scan);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose && /[\s>]/.test(source[nextOpen + tagName.length + 1] || '')) {
          depth += 1;
          scan = nextOpen + tagName.length + 1;
          continue;
        }
        depth -= 1;
        scan = nextClose + tagName.length + 3;
      }

      if (depth === 0) blocks.push(source.slice(openMatch.index, scan));
      cursor = scan;
    }

    return blocks;
  };

  const extractDocxRows = (xml = '') => extractDocxTagBlocks(xml, 'w:tr').map((rowXml) => (
    extractDocxTagBlocks(rowXml, 'w:tc').map((cellXml) => extractDocxCellText(cellXml))
  )).filter((row) => row.some(Boolean));

  const normalizeWordJsonRow = (cells = []) => ({
    item: cells[0] || '',
    unit: cells[1] || '',
    range: cells[2] || '',
    value: cells[3] || '',
    cells,
  });

  const getModelFromRangeWordXml = (xml = '', fileName = '') => {
    const fileModel = String(fileName || '').match(/\b\d{3,4}[A-Z]\d{1,2}(?:-[A-Z0-9]+)?\b/i)?.[0] || '';
    if (fileModel.includes('-')) return fileModel.toUpperCase();

    const bodyText = extractDocxText(xml);
    const modelText = normalizeDocxModelPart(getTextBetweenLabels(bodyText, '型号', ['色号', '批号', '检验项目']));
    const colorText = normalizeDocxModelPart(getTextBetweenLabels(bodyText, '色号', ['批号', '检验项目']));
    const model = modelText.match(/\d{3,4}[A-Z]\d{1,2}/i)?.[0] || fileModel;
    const color = colorText.match(/[A-Z]\d{1,2}/i)?.[0] || '';
    const combined = [model, color].filter(Boolean).join('-');
    if (combined) return combined;

    return fileModel.toUpperCase();
  };

  const parseRangeWordJsonFile = async (file) => {
    const JSZip = await ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('未找到 Word 正文内容');

    const model = getModelFromRangeWordXml(xml, file.name);
    if (!model) throw new Error('未识别到型号');

    const rows = extractDocxRows(xml)
      .map(normalizeWordJsonRow)
      .filter((row) => row.item && row.unit && row.range)
      .filter((row) => !(row.item.includes('检验') && row.unit.includes('单位')));

    return {
      fileName: file.name,
      model,
      rows,
    };
  };

  const buildRangeDraftsFromWordJson = (wordJson) => {
    const ranges = (wordJson?.rows || []).map((row) => {
      const metric = getReportMetricByDocxItem(row.item);
      if (!metric) return null;
      const item = metric.key === MELT_INDEX_METRIC_KEY
        ? buildMeltIndexItemLabel(getMeltIndexTemperatureFromDocxItem(row.item))
        : metric.item;
      return createRangeDraft({
        model: wordJson.model,
        metricKey: metric.key,
        item,
        unit: normalizeRangeUnit(row.unit) || metric.unit,
        range: normalizeRangeText(row.range),
      });
    }).filter((item) => item?.range);

    if (!ranges.length) throw new Error('未识别到检测范围表格');
    return { model: wordJson.model, ranges, source: wordJson };
  };

  const parseRangeWordFile = async (file) => {
    const wordJson = await parseRangeWordJsonFile(file);
    console.info('[property-analysis] Word range JSON:', wordJson);
    return buildRangeDraftsFromWordJson(wordJson);
  };

  const getReportRange = (model, metricKey) => state.reportRanges.find((item) => (
    item.model === model && item.metricKey === metricKey
  ));

  const getRangePrecision = (rangeText) => {
    const matches = String(rangeText || '').match(/\d+(?:\.(\d+))?/g) || [];
    return Math.min(Math.max(...matches.map((item) => getPrecision(item)), 0), 3);
  };

  const canReportValueKeepDecimal = (metricKey) => (
    metricKey === MELT_INDEX_METRIC_KEY || metricKey === IMPACT_STRENGTH_METRIC_KEY
  );

  const parseReportRangeBounds = (rangeText = '') => {
    const text = normalizeReportText(rangeText).replace(/[～—–至到]/g, '~');
    const numbers = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!numbers.length) return null;
    if (/^[≥>=]/.test(text)) return { min: numbers[0], max: Infinity };
    if (/^[≤<=]/.test(text)) return { min: -Infinity, max: numbers[0] };
    if (numbers.length >= 2) return { min: Math.min(numbers[0], numbers[1]), max: Math.max(numbers[0], numbers[1]) };
    return { min: numbers[0], max: numbers[0] };
  };

  const getReportMetricValidation = (metric = {} as any) => {
    const value = parseNumericValue(metric.value);
    const isRequired = isRequiredReportMetric(metric.key);
    if (!isRequired && (!normalizeReportText(metric.range) || value == null)) return { status: 'pass', text: '选填' };
    if (!normalizeReportText(metric.range)) return { status: 'missing', text: '未设置范围' };
    if (value == null) return { status: 'missing', text: '检验值无效' };
    const bounds = parseReportRangeBounds(metric.range);
    if (!bounds) return { status: 'missing', text: '范围格式无效' };
    const passed = value >= bounds.min && value <= bounds.max;
    return {
      status: passed ? 'pass' : 'fail',
      text: passed ? '检验通过' : '检验异常',
    };
  };

  const hasReportMetricValue = (metric = {} as any) => hasMeaningfulValue(metric.value);

  const getRenderableReportMetrics = (draft = {} as any) => (
    Array.isArray(draft.metrics) ? draft.metrics.filter(hasReportMetricValue) : []
  );

  const getReportDraftValidation = (draft = {} as any) => {
    const metrics = getRenderableReportMetrics(draft);
    const results = metrics.map((metric) => ({
      ...getReportMetricValidation(metric),
      required: isRequiredReportMetric(metric.key),
    }));
    if (results.some((item) => item.status === 'fail')) return { status: 'fail', text: '存在异常' };
    if (results.some((item) => item.required && item.status === 'missing')) return { status: 'missing', text: '待完善' };
    return { status: 'pass', text: '检验通过' };
  };

  const formatReportValue = (row, metricKey, rangeText = '') => {
    const raw = getMetricRawValue(row, metricKey);
    const numeric = getMetricValue(row, metricKey);
    if (numeric == null) {
      const derived = getDerivedReportMetricValue(row, metricKey);
      if (derived != null) return String(derived);
      return normalizeReportText(Array.isArray(raw) ? raw.join(' / ') : raw);
    }

    if (!canReportValueKeepDecimal(metricKey)) return String(Math.round(numeric));

    const rangePrecision = getRangePrecision(rangeText);
    const precision = Math.max(rangePrecision, Math.min(getPrecision(numeric), 1));
    const fixed = numeric.toFixed(precision);
    return rangePrecision > 0 ? fixed : fixed.replace(/\.?0+$/, '');
  };

  const getReportMetricsForRow = (row) => {
    const model = getRowModel(row);
    return REPORT_METRICS
      .filter((metric) => (
        hasMeaningfulValue(getMetricRawValue(row, metric.key))
        || getDerivedReportMetricValue(row, metric.key) != null
        || Boolean(model && getReportRange(model, metric.key))
      ))
      .map((metric) => metric.key);
  };

  const getMissingRangeItems = (rows) => {
    const missing = [];
    const seen = new Set();

    rows.forEach((row) => {
      const model = getRowModel(row);
      getReportMetricsForRow(row).forEach((metricKey) => {
        const key = `${model}::${metricKey}`;
        if (!model || !isRequiredReportMetric(metricKey) || seen.has(key) || getReportRange(model, metricKey)) return;
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

  const getMissingRangeModels = (missingItems = []) => {
    const seen = new Set();
    return missingItems.reduce((models, item) => {
      const model = normalizeReportText(item?.model);
      if (!model || seen.has(model)) return models;
      seen.add(model);
      models.push(model);
      return models;
    }, []);
  };

  const createReportDraft = (row) => {
    const model = getRowModel(row);
    const displayModel = getReportDisplayModel(row);
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
      model: displayModel,
      fullModel: model,
      batch,
      date: formatChineseDate(),
      color: getRowColor(row),
      companyName: REPORT_COMPANY_NAME,
      companyAddress: REPORT_COMPANY_ADDRESS,
      companyTel: REPORT_COMPANY_TEL,
      companyFax: REPORT_COMPANY_FAX,
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

  const drawCenteredText = (ctx, text, x, y, options = {} as any) => {
    ctx.save();
    ctx.font = options.font || '32px sans-serif';
    ctx.fillStyle = options.color || '#111827';
    ctx.textAlign = options.align || 'center';
    ctx.textBaseline = options.baseline || 'middle';
    ctx.fillText(String(text ?? ''), x, y);
    ctx.restore();
  };

  const loadReportSealImage = () => {
    if (reportSealImagePromise) return reportSealImagePromise;
    reportSealImagePromise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = REPORT_SEAL_SRC;
    });
    return reportSealImagePromise;
  };

  const normalizeReportSealPosition = (value = {} as any) => ({
    x: Math.max(0, Number.isFinite(Number(value.x)) ? Number(value.x) : REPORT_SEAL_DEFAULT.x),
    y: Math.max(0, Number.isFinite(Number(value.y)) ? Number(value.y) : REPORT_SEAL_DEFAULT.y),
    size: Math.max(40, Math.min(360, Number.isFinite(Number(value.size)) ? Number(value.size) : REPORT_SEAL_DEFAULT.size)),
    rotation: Number.isFinite(Number(value.rotation)) ? Number(value.rotation) : REPORT_SEAL_DEFAULT.rotation,
  });

  const loadReportSealPosition = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(REPORT_SEAL_POSITION_STORAGE_KEY) || 'null');
      state.reportSealPosition = normalizeReportSealPosition({ ...REPORT_SEAL_DEFAULT, ...(parsed && typeof parsed === 'object' ? parsed : {}) });
    } catch {
      state.reportSealPosition = normalizeReportSealPosition(REPORT_SEAL_DEFAULT);
    }
  };

  const saveReportSealPosition = () => {
    setCloudBackedLocalStorageItem(REPORT_SEAL_POSITION_STORAGE_KEY, JSON.stringify(state.reportSealPosition));
  };

  const getReportSealScale = (canvas) => {
    const rect = canvas?.getBoundingClientRect?.();
    return rect?.width ? rect.width / (canvas.width / 2 || 794) : 1;
  };

  const fitReportPreviewCanvas = () => {
    const wrap = document.querySelector('.analysis-report-preview-wrap');
    const canvasWrap = document.querySelector('.analysis-report-preview-canvas-wrap');
    const canvas = document.querySelector('[data-report-preview-canvas]');
    if (!wrap || !canvasWrap || !canvas) return;

    const sourceWidth = Number(canvas.style.width.replace('px', '') || 794);
    const sourceHeight = Number(canvas.style.height.replace('px', '') || 900);
    const styles = window.getComputedStyle(wrap);
    const paddingX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
    const paddingY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(1, wrap.clientWidth - paddingX);
    const availableHeight = Math.max(1, wrap.clientHeight - paddingY);
    const scale = Math.min(1, availableWidth / sourceWidth, availableHeight / sourceHeight);
    const displayWidth = sourceWidth * scale;
    const displayHeight = sourceHeight * scale;

    canvasWrap.style.width = `${displayWidth}px`;
    canvasWrap.style.height = `${displayHeight}px`;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  };

  const syncReportSealOverlay = () => {
    const canvas = document.querySelector('[data-report-preview-canvas]');
    const seal = document.querySelector('[data-report-seal-overlay]');
    if (!canvas || !seal) return;
    const scale = getReportSealScale(canvas);
    const { x, y, size, rotation } = state.reportSealPosition;
    seal.style.left = `${x * scale}px`;
    seal.style.top = `${y * scale}px`;
    seal.style.width = `${size * scale}px`;
    seal.style.height = `${size * scale}px`;
    seal.style.transform = `rotate(${rotation}deg)`;
  };

  const syncReportSealInputs = () => {
    document.querySelectorAll('[data-report-seal-field]').forEach((input) => {
      const field = input.getAttribute('data-report-seal-field');
      if (field && field in state.reportSealPosition) input.value = Math.round(state.reportSealPosition[field]);
    });
  };

  const syncReportValidationUi = () => {
    document.querySelectorAll('[data-report-select]').forEach((button) => {
      const index = Number.parseInt(button.getAttribute('data-report-select') || '', 10);
      const validation = getReportDraftValidation(state.reportDrafts[index]);
      button.setAttribute('data-report-validation', validation.status);
      const badge = button.querySelector('[data-report-validation-badge]');
      if (badge) badge.textContent = validation.text;
    });

    const draft = getActiveReportDraft();
    document.querySelectorAll('[data-report-metric-index]').forEach((row) => {
      const index = Number.parseInt(row.getAttribute('data-report-metric-index') || '', 10);
      const validation = getReportMetricValidation(draft?.metrics?.[index]);
      row.setAttribute('data-report-validation', validation.status);
      const badge = row.querySelector('[data-report-metric-validation]');
      if (badge) badge.textContent = validation.text;
    });
  };

  const syncReportMetricRangeToGlobal = (metricIndex) => {
    const draft = getActiveReportDraft();
    const metric = draft?.metrics?.[metricIndex];
    const model = draft?.fullModel || draft?.model;
    if (!draft || !metric || !model || !metric.key) return;

    state.reportRanges = state.reportRanges.filter((item) => !(item.model === model && item.metricKey === metric.key));
    if (normalizeReportText(metric.range)) {
      state.reportRanges.push(createRangeDraft({
        model,
        metricKey: metric.key,
        item: metric.item,
        unit: metric.unit,
        range: metric.range,
      }));
    }
    saveReportRanges();
  };

  const saveReportDialogParameters = () => {
    updateReportDraftFromDialog();
    const draft = getActiveReportDraft();
    (draft?.metrics || []).forEach((_, index) => syncReportMetricRangeToGlobal(index));
    saveReportSealPosition();
    notify('报告参数已保存', 'success', 'property-report-params-saved');
  };

  const drawReportCanvas = async (canvas, draft, options = {} as any) => {
    if (!canvas || !draft) return;
    const scale = 2;
    const width = 794;
    const rows = getRenderableReportMetrics(draft);
    const rowH = 48;
    const tableY = 485;
    const tableH = rowH * (rows.length + 1);
    const sealBottom = options.includeSeal
      ? state.reportSealPosition.y + state.reportSealPosition.size + 30
      : 0;
    const previewWrap = document.querySelector('.analysis-report-preview-wrap');
    const previewStyle = previewWrap ? window.getComputedStyle(previewWrap) : null;
    const previewPaddingY = previewStyle
      ? Number.parseFloat(previewStyle.paddingTop) + Number.parseFloat(previewStyle.paddingBottom)
      : 0;
    const previewPaddingX = previewStyle
      ? Number.parseFloat(previewStyle.paddingLeft) + Number.parseFloat(previewStyle.paddingRight)
      : 0;
    const previewAvailableWidth = previewWrap
      ? Math.max(1, previewWrap.clientWidth - previewPaddingX)
      : width;
    const previewWidthScale = Math.min(1, previewAvailableWidth / width);
    const previewMinHeight = !options.includeSeal && previewWrap
      ? Math.max(0, (previewWrap.clientHeight - previewPaddingY) / previewWidthScale)
      : 0;
    const height = Math.max(820, tableY + tableH + 140, sealBottom, previewMinHeight);
    const contentLeft = 70;
    const contentRight = 724;
    const contentWidth = contentRight - contentLeft;
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
    ctx.moveTo(contentLeft, 38);
    ctx.lineTo(contentRight, 38);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(346, 38);
    ctx.lineTo(448, 38);
    ctx.stroke();

    drawCenteredText(ctx, draft.companyName || REPORT_COMPANY_NAME, width / 2, 94, { font: '700 32px "Microsoft YaHei", sans-serif' });
    drawCenteredText(ctx, draft.companyAddress || REPORT_COMPANY_ADDRESS, width / 2, 138, { font: '19px "Microsoft YaHei", sans-serif' });
    drawCenteredText(ctx, `TEL：${draft.companyTel || REPORT_COMPANY_TEL}      FAX：${draft.companyFax || REPORT_COMPANY_FAX}`, width / 2, 172, { font: '19px Arial, sans-serif' });

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(212, 232);
    ctx.lineTo(286, 232);
    ctx.moveTo(508, 232);
    ctx.lineTo(582, 232);
    ctx.stroke();
    drawCenteredText(ctx, '检验报告表', width / 2, 232, { font: '700 30px "Microsoft YaHei", sans-serif' });

    const colWidths = [225, 100, 155, 120];
    const headers = ['检验项目', '单位', '检验范围', '检验值'];
    const tableW = colWidths.reduce((sum, item) => sum + item, 0);
    const tableX = contentLeft + (contentWidth - tableW) / 2;
    const left = tableX;
    const labelX = left;
    const valueX = left + 76;
    const fields = [
      ['日期：', draft.date],
      ['型号：', draft.model],
      ['色号：', draft.color],
      ['批号：', draft.batch],
    ];
    ctx.fillStyle = '#111827';
    fields.forEach(([label, value], index) => {
      const y = 286 + index * 42;
      ctx.font = '700 20px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, labelX, y);
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(value || ''), valueX, y);
    });

    ctx.font = '19px "Microsoft YaHei", sans-serif';
    ctx.fillText(draft.intro || '', left, 455);

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
      drawCenteredText(ctx, header, cellX + colWidths[index] / 2, tableY + rowH / 2, { font: '700 18px "Microsoft YaHei", sans-serif' });
    });

    rows.forEach((row, rowIndex) => {
      [row.item, row.unit, row.range, row.value].forEach((text, colIndex) => {
        const cellX = tableX + colWidths.slice(0, colIndex).reduce((sum, item) => sum + item, 0);
        drawCenteredText(ctx, text, cellX + colWidths[colIndex] / 2, tableY + rowH * (rowIndex + 1) + rowH / 2, { font: '16px "Microsoft YaHei", sans-serif' });
      });
    });

    if (options.includeSeal) {
      const sealImage = await loadReportSealImage();
      if (sealImage) {
        const { x: sealX, y: sealY, size: sealSize, rotation } = state.reportSealPosition;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.translate(sealX + sealSize / 2, sealY + sealSize / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(sealImage, -sealSize / 2, -sealSize / 2, sealSize, sealSize);
        ctx.restore();
      }
    }
  };

  const renderReportPreview = async () => {
    const draft = getActiveReportDraft();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    if (canvas) await drawReportCanvas(canvas, draft);
    fitReportPreviewCanvas();
    syncReportSealOverlay();
    syncReportValidationUi();
  };

  const canvasToBlob = (canvas, type = 'image/png', quality = undefined) => new Promise<Blob>((resolve, reject) => {
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
    const height = width * (canvas.height / canvas.width);
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

  const getReportFileBase = (draft) => sanitizeFileName(`${draft?.batch || '未命名批次'} ${draft?.fullModel || draft?.model || '未命名型号'}`);

  const buildReportEditorHtml = () => {
    const draft = getActiveReportDraft();
    return `
      <section class="analysis-report-editor">
        <div class="analysis-report-form-grid">
          ${[
            ['companyName', '公司名称'],
            ['companyAddress', '公司地址'],
            ['companyTel', '电话'],
            ['companyFax', '传真'],
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
        <div class="analysis-report-seal-editor">
          <div class="analysis-report-section-head">
            <div class="analysis-report-section-title">盖章参数</div>
            <button class="analysis-report-save-params" type="button" data-report-save-params>保存参数</button>
          </div>
          <div class="analysis-report-form-grid">
            ${[
              ['x', '横向位置', 0, 794, 1],
              ['y', '纵向位置', 0, 1200, 1],
              ['size', '大小', 40, 360, 1],
              ['rotation', '旋转角度', -180, 180, 1],
            ].map(([field, label, min, max, step]) => `
              <label>
                <span>${label}</span>
                <input type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(state.reportSealPosition[field])}" data-report-seal-field="${field}">
              </label>
            `).join('')}
          </div>
        </div>
        <div class="analysis-report-metric-editor">
          <div class="analysis-report-section-title">报告明细</div>
          <div class="analysis-report-metric-head">
            <span>检验项目</span><span>单位</span><span>检验范围</span><span>检验值</span><span>状态</span>
          </div>
          ${(draft?.metrics || []).map((metric, index) => `
            <div class="analysis-report-metric-row" data-report-metric-index="${index}" data-report-validation="${getReportMetricValidation(metric).status}">
              <input value="${escapeHtml(metric.item)}" data-report-metric-field="item">
              <input value="${escapeHtml(metric.unit)}" data-report-metric-field="unit">
              <input value="${escapeHtml(metric.range)}" data-report-metric-field="range">
              <input value="${escapeHtml(metric.value)}" data-report-metric-field="value">
              <span class="analysis-report-metric-validation" data-report-metric-validation>${escapeHtml(getReportMetricValidation(metric).text)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  };

  const buildReportDialogHtml = () => {
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
              <label class="analysis-report-export-scope">
                <span>导出范围</span>
                <select data-report-export-scope>
                  <option value="active">当前选中</option>
                  <option value="all" selected>列表全部</option>
                </select>
              </label>
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
                  <button class="analysis-report-selected-item${index === state.reportSelectedIndex ? ' is-active' : ''}" type="button" data-report-select="${index}" data-report-validation="${getReportDraftValidation(item).status}">
                    <strong>${escapeHtml(item.fullModel || item.model || '--')}</strong>
                    <span>${escapeHtml(item.batch || '--')}</span>
                    <em data-report-validation-badge>${escapeHtml(getReportDraftValidation(item).text)}</em>
                  </button>
                `).join('')}
              </div>
            </aside>
            ${buildReportEditorHtml()}
            <section class="analysis-report-preview-wrap">
              <div class="analysis-report-preview-canvas-wrap">
                <canvas data-report-preview-canvas></canvas>
                <img class="analysis-report-seal-overlay" src="${REPORT_SEAL_SRC}" alt="检测章" draggable="false" data-report-seal-overlay>
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
    window.removeEventListener('resize', renderReportPreview);
    state.reportDialogOpen = false;
  };

  function handleReportDialogKeydown(event) {
    if (event.key === 'Escape') closeReportDialog();
  }

  const rerenderReportDialog = () => {
    const dialog = document.querySelector('.analysis-report-dialog');
    if (!dialog) return;
    const selectedList = dialog.querySelector('.analysis-report-selected-list');
    const editor = dialog.querySelector('.analysis-report-editor');
    if (selectedList) {
      selectedList.querySelectorAll('[data-report-select]').forEach((button) => {
        button.classList.toggle('is-active', Number.parseInt(button.getAttribute('data-report-select') || '', 10) === state.reportSelectedIndex);
      });
    }
    if (editor) editor.outerHTML = buildReportEditorHtml();
    renderReportPreview();
  };

  const getReportExportDrafts = () => {
    const scope = document.querySelector('[data-report-export-scope]')?.value || 'all';
    if (scope === 'all') return state.reportDrafts.filter(Boolean);
    return [getActiveReportDraft()].filter(Boolean);
  };

  const withReportDraftSelection = async (draft, callback) => {
    const previousIndex = state.reportSelectedIndex;
    const index = state.reportDrafts.indexOf(draft);
    if (index >= 0) state.reportSelectedIndex = index;
    await callback(draft);
    state.reportSelectedIndex = previousIndex;
  };

  const exportReportDraftImage = async (draft, canvas) => {
    await drawReportCanvas(canvas, draft, { includeSeal: true });
    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, `${getReportFileBase(draft)}.png`);
  };

  const exportReportDraftPdf = async (draft, canvas) => {
    await drawReportCanvas(canvas, draft, { includeSeal: true });
    const blob = createPdfBlobFromCanvas(canvas, `${getReportFileBase(draft)}.PDF`);
    downloadBlob(blob, `${getReportFileBase(draft)}.PDF`);
  };

  const exportActiveReportImage = async () => {
    updateReportDraftFromDialog();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    const drafts = getReportExportDrafts();
    if (!canvas || !drafts.length) return;
    for (const draft of drafts) {
      await withReportDraftSelection(draft, async (item) => exportReportDraftImage(item, canvas));
    }
    await renderReportPreview();
    notify(drafts.length > 1 ? `已导出 ${drafts.length} 张报告图片` : '报告图片已导出', 'success', 'property-report-image');
  };

  const exportActiveReportPdf = async () => {
    updateReportDraftFromDialog();
    const canvas = document.querySelector('[data-report-preview-canvas]');
    const drafts = getReportExportDrafts();
    if (!canvas || !drafts.length) return;
    for (const draft of drafts) {
      await withReportDraftSelection(draft, async (item) => exportReportDraftPdf(item, canvas));
    }
    await renderReportPreview();
    notify(drafts.length > 1 ? `已导出 ${drafts.length} 份报告 PDF` : '报告 PDF 已导出', 'success', 'property-report-pdf');
  };

  const bindReportDialogEvents = () => {
    const dialog = document.querySelector('.analysis-report-dialog');
    if (!dialog) return;
    const sealOverlay = dialog.querySelector('[data-report-seal-overlay]');
    sealOverlay?.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 8 : -8;
      state.reportSealPosition = normalizeReportSealPosition({
        ...state.reportSealPosition,
        size: state.reportSealPosition.size + delta,
      });
      syncReportSealOverlay();
      syncReportSealInputs();
      saveReportSealPosition();
    }, { passive: false });
    sealOverlay?.addEventListener('pointerdown', (event) => {
      const canvas = dialog.querySelector('[data-report-preview-canvas]');
      if (!canvas) return;
      event.preventDefault();
      sealOverlay.setPointerCapture?.(event.pointerId);
      sealOverlay.classList.add('is-dragging');
      const scale = getReportSealScale(canvas);
      const startX = event.clientX;
      const startY = event.clientY;
      const startSeal = { ...state.reportSealPosition };

      const handleMove = (moveEvent) => {
        state.reportSealPosition = normalizeReportSealPosition({
          ...startSeal,
          x: Math.max(0, startSeal.x + (moveEvent.clientX - startX) / scale),
          y: Math.max(0, startSeal.y + (moveEvent.clientY - startY) / scale),
        });
        syncReportSealOverlay();
        syncReportSealInputs();
      };

      const handleUp = () => {
        sealOverlay.classList.remove('is-dragging');
        saveReportSealPosition();
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    });
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
      if (target.closest('[data-report-save-params]')) {
        saveReportDialogParameters();
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
      const sealField = target.getAttribute('data-report-seal-field');
      if (sealField) {
        state.reportSealPosition = normalizeReportSealPosition({
          ...state.reportSealPosition,
          [sealField]: target.value,
        });
        syncReportSealOverlay();
        syncReportSealInputs();
        saveReportSealPosition();
        return;
      }
      updateReportDraftFromDialog();
      const metricField = target.getAttribute('data-report-metric-field');
      if (metricField === 'range') {
        const row = target.closest('[data-report-metric-index]');
        const metricIndex = Number.parseInt(row?.getAttribute('data-report-metric-index') || '', 10);
        if (Number.isFinite(metricIndex)) syncReportMetricRangeToGlobal(metricIndex);
      }
      renderReportPreview();
    });
    window.addEventListener('resize', renderReportPreview);
  };

  const openReportDialog = () => {
    const selectedRows = getSelectedRowsForAllSheets();
    if (!selectedRows.length) {
      notify('请先选择需要生成报告的数据', 'warn', 'property-report-no-selection');
      return;
    }

    const missingRanges = getMissingRangeItems(selectedRows);
    if (missingRanges.length) {
      const missingModels = getMissingRangeModels(missingRanges);
      notify(`有 ${missingModels.length} 个型号还未设置检测范围值，请先在检测范围中设置。`, 'warn', 'property-report-missing-ranges');
      openRangeManagerDialog(missingRanges);
      return;
    }

    closeReportDialog();
    state.reportDrafts = selectedRows.map(createReportDraft);
    state.reportSelectedIndex = 0;
    state.reportDialogOpen = true;
    loadReportSealPosition();
    document.body.insertAdjacentHTML('beforeend', buildReportDialogHtml());
    bindReportDialogEvents();
    document.addEventListener('keydown', handleReportDialogKeydown);
    renderReportPreview();
    document.querySelector('[data-report-close]')?.focus({ preventScroll: true });
  };

  const createRangeDraft = (overrides = {} as any) => {
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

  const buildRangeMetricNameHtml = (item) => {
    const config = getReportMetricConfig(item.metricKey);
    const itemLabel = item.item || config.item;
    if (item.metricKey !== MELT_INDEX_METRIC_KEY) {
      return `<div class="analysis-range-metric-name">${escapeHtml(itemLabel)}</div>`;
    }

    const selectedTemperature = getMeltIndexTemperature(itemLabel);
    return `
      <div class="analysis-range-metric-name analysis-range-metric-name-with-select">
        <span>熔融指数</span>
        <select data-range-metric-field="meltTemperature" aria-label="熔融指数测试温度">
          ${MELT_INDEX_TEMPERATURES.map((temperature) => `
            <option value="${escapeHtml(temperature)}"${temperature === selectedTemperature ? ' selected' : ''}>${escapeHtml(temperature)}</option>
          `).join('')}
        </select>
      </div>
    `;
  };

  const buildRangeRowsHtml = (model = '') => getRangesForModel(model).map((item) => `
    <div class="analysis-range-metric-row" data-range-metric-key="${escapeHtml(item.metricKey)}">
      ${buildRangeMetricNameHtml(item)}
      <input value="${escapeHtml(item.unit)}" data-range-metric-field="unit" aria-label="${escapeHtml(item.item)}单位">
      <input value="${escapeHtml(item.range)}" data-range-metric-field="range" placeholder="例如 28.0~32.0 或 ≥120" aria-label="${escapeHtml(item.item)}检测范围">
    </div>
  `).join('');

  const getRangeSetStatus = (model) => {
    const requiredRanges = getRangesForModel(model).filter((item) => isRequiredReportMetric(item.metricKey));
    const filled = requiredRanges.filter((item) => item.range);
    if (filled.length >= requiredRanges.length) return 'complete';
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
          <strong>${escapeHtml(state.rangeManagerSelectedModel)}</strong>
        </div>
        <input data-range-field="model" value="${escapeHtml(state.rangeManagerSelectedModel)}" hidden>
        <div class="analysis-range-form-actions">
          <button class="analysis-report-btn" type="button" data-range-clear-model>清除</button>
          <button class="analysis-report-btn is-primary" type="submit">保存</button>
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
    const scrollTop = list?.scrollTop || 0;
    if (list) {
      list.innerHTML = buildRangeModelListHtml();
      list.scrollTop = scrollTop;
    }
    if (meta) meta.textContent = `筛选结果型号 ${getRangeCandidateModels().length} 个`;
  };

  const updateRangeEditorPanel = () => {
    const panel = document.querySelector('.analysis-range-editor-panel');
    if (panel) panel.innerHTML = buildRangeEditorHtml();
  };

  const updateRangeModelActiveState = () => {
    document.querySelectorAll('.analysis-range-model-item').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-range-model') === state.rangeManagerSelectedModel);
    });
  };

  const updateRangeManagerSelection = (model) => {
    if ((model || '') === state.rangeManagerSelectedModel) return;
    state.rangeManagerSelectedModel = model || '';
    updateRangeModelActiveState();
    updateRangeEditorPanel();
  };

  const setRangeWordImportStatus = ({ active = false, current = 0, total = 0, success = 0, failed = 0, fileName = '', message = '' } = {} as any) => {
    const dialog = document.querySelector('.analysis-range-dialog');
    const dropzone = dialog?.querySelector('[data-range-word-upload]');
    const progress = dialog?.querySelector('[data-range-word-progress]');
    const bar = dialog?.querySelector('[data-range-word-progress-bar]');
    const text = dialog?.querySelector('[data-range-word-status]');
    if (!dropzone || !progress || !bar || !text) return;

    const percent = total ? Math.round((current / total) * 100) : 0;
    state.rangeWordImporting = active;
    dropzone.classList.toggle('is-importing', active);
    dropzone.disabled = active;
    progress.hidden = !active && !message;
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    text.textContent = message || `正在解析 ${current}/${total}，成功 ${success}，失败 ${failed}${fileName ? `：${fileName}` : ''}`;
  };

  const buildRangeManagerHtml = (missingItems = []) => {
    const missingModels = getMissingRangeModels(missingItems);

    return `
    <div class="analysis-range-dialog dialog-overlay" role="dialog" aria-modal="true" aria-label="检测范围管理">
      <div class="analysis-range-card dialog-card">
        <div class="analysis-report-head">
          <div>
            <div class="analysis-report-title">检测范围管理</div>
            <div class="analysis-report-subtitle">按型号维护报告中的检验项目、单位和检测范围</div>
          </div>
          <div class="analysis-report-actions analysis-range-head-actions">
            <button class="analysis-range-refresh-btn" type="button" aria-label="刷新检测范围数据" title="刷新检测范围数据" data-range-refresh>
              <svg class="analysis-range-refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7.05 7.05A7 7 0 0 1 18.2 8.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M18.2 5.3v3.6h-3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M16.95 16.95A7 7 0 0 1 5.8 15.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M5.8 18.7v-3.6h3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
            <button class="analysis-compare-close dialog-close" type="button" aria-label="关闭检测范围管理" data-range-close>
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="analysis-range-body">
          ${missingModels.length ? `
            <div class="analysis-range-warning">
              <strong>以下型号还未设置检测范围值</strong>
              <span>${missingModels.map((model) => escapeHtml(model)).join('，')}</span>
            </div>
          ` : ''}
          <button class="analysis-range-word-dropzone" type="button" data-range-word-upload>
            <span class="analysis-range-word-icon"><i class="ti ti-file-type-docx" aria-hidden="true"></i></span>
            <span class="analysis-range-word-copy">
              <strong>导入Word检测范围</strong>
              <em>点击选择或拖入多个 .docx 文件，自动提取型号、项目、单位和检测范围</em>
              <span class="analysis-range-word-progress" data-range-word-progress hidden>
                <span class="analysis-range-word-progress-track"><span data-range-word-progress-bar></span></span>
                <span class="analysis-range-word-status" data-range-word-status></span>
              </span>
            </span>
          </button>
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
  };

  const readRangeForm = () => {
    const dialog = document.querySelector('.analysis-range-dialog');
    const form = dialog?.querySelector('[data-range-form]');
    if (!form) return null;
    const model = normalizeReportText(form.querySelector('[data-range-field="model"]').value);
    const ranges = [...form.querySelectorAll('[data-range-metric-key]')].map((row) => {
      const metricKey = row.getAttribute('data-range-metric-key');
      const metric = getReportMetricConfig(metricKey);
      const meltTemperature = row.querySelector('[data-range-metric-field="meltTemperature"]')?.value;
      return createRangeDraft({
        model,
        metricKey,
        item: metricKey === MELT_INDEX_METRIC_KEY ? buildMeltIndexItemLabel(meltTemperature) : metric.item,
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

  const refreshRangeManagerData = async (missingItems = []) => {
    const currentModel = state.rangeManagerSelectedModel;
    const refreshedFromCloud = await loadReportRangesFromCloud();

    const models = getRangeCandidateModels();
    if (currentModel && models.includes(currentModel)) {
      state.rangeManagerSelectedModel = currentModel;
    } else {
      state.rangeManagerSelectedModel = missingItems[0]?.model || models[0] || '';
    }

    updateRangeModelList();
    updateRangeEditorPanel();
    notify(
      refreshedFromCloud ? '检测范围数据已从云端刷新' : '未读取到云端检测范围数据，已保留本机数据',
      refreshedFromCloud ? 'success' : 'warn',
      'property-range-refresh',
    );
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
      if (target.closest('[data-range-word-upload]')) {
        if (!refs.rangeWordInput) return;
        refs.rangeWordInput.value = '';
        refs.rangeWordInput.click();
        return;
      }
      if (target.closest('[data-range-refresh]')) {
        const refreshButton = target.closest('[data-range-refresh]');
        refreshButton.classList.remove('is-spinning');
        void refreshButton.offsetWidth;
        refreshButton.classList.add('is-spinning');
        refreshButton.addEventListener('animationend', () => {
          refreshButton.classList.remove('is-spinning');
        }, { once: true });
        refreshRangeManagerData(missingItems).catch((error) => {
          console.error('[property-analysis] Failed to refresh range data:', error);
          notify('检测范围数据刷新失败，请稍后重试', 'error', 'property-range-refresh-failed');
        });
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
    const dropzone = dialog.querySelector('[data-range-word-upload]');
    dropzone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone?.addEventListener('dragleave', (event) => {
      if (event.currentTarget === event.target) dropzone.classList.remove('is-dragover');
    });
    dropzone?.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
      importRangeWordFiles(event.dataTransfer?.files);
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
    if (state.activeSheet === ALL_PROPERTY_SHEETS_KEY && names.length) return ALL_PROPERTY_SHEETS_KEY;
    if (state.activeSheet && names.includes(state.activeSheet)) return state.activeSheet;
    if (names.includes(data?.project?.activeSheetName)) return data.project.activeSheetName;
    return names.length ? ALL_PROPERTY_SHEETS_KEY : '';
  };

  const getSheetLabel = (sheetName) => (
    sheetName === ALL_PROPERTY_SHEETS_KEY ? ALL_PROPERTY_SHEETS_LABEL : sheetName
  );

  const getRowsForSheet = (sheetName) => {
    if (sheetName === ALL_PROPERTY_SHEETS_KEY) {
      return getSheetNames(state.data).flatMap((name) => getRowsForSheet(name));
    }

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
    const pageSize = Math.max(Number(state.pageSize) || PAGE_SIZE_DEFAULT, 1);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(Math.max(Number(state.page) || 1, 1), totalPages);
    const start = (currentPage - 1) * pageSize;
    return {
      currentPage,
      totalPages,
      rows: rows.slice(start, start + pageSize),
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

  const getCompareColumns = (rows) => {
    const columns = getColumns(rows);
    const mustShow = ['型号', '批次', '测试温度'].filter((column) => columns.includes(column));
    const metricColumns = METRIC_COLUMNS.filter((column) => columns.includes(column));
    const rest = columns.filter((column) => !mustShow.includes(column) && !metricColumns.includes(column));
    return [...mustShow, ...metricColumns, ...rest].filter((column) => column !== '__rowKey');
  };

  const normalizeCompareColumns = (columns, fallbackColumns) => {
    const available = new Set(fallbackColumns);
    const normalized = (columns || []).filter((column) => available.has(column));
    return normalized.length ? normalized : fallbackColumns;
  };

  const getCompareCellText = (row, column, valueMode = 'all') => {
    const cell = getCompareCellParts(row, column, valueMode);
    return `${cell.main}${cell.average}`;
  };

  const getCompareCellParts = (row, column, valueMode = 'all') => {
    const value = row?.[column];
    if (Array.isArray(value)) {
      const averageText = getAverageText(value);
      if (valueMode === 'average') {
        return {
          main: averageText || '--',
          average: '',
        };
      }

      const main = value.map((item) => `[${valueToText(item)}]`).join(' ');
      return {
        main,
        average: averageText ? ` (${averageText})` : '',
      };
    }
    return {
      main: valueToText(value) || '--',
      average: '',
    };
  };

  const getCompareCellDisplay = (row, column, valueMode = 'all') => {
    const value = row?.[column];
    if (Array.isArray(value) && valueMode === 'average') {
      const averageText = getAverageText(value);
      return {
        html: `<span class="analysis-cell-main analysis-cell-avg-only">${escapeHtml(averageText || '--')}</span>`,
        title: `${formatHeader(column)}: ${averageText ? `均值 ${averageText}` : '--'}`,
      };
    }

    return getCellDisplay(value, column);
  };

  const getCompareRowLabel = (row, index) => {
    const model = valueToText(row?.型号).trim();
    const batch = valueToText(row?.批次).trim();
    return [model, batch].filter(Boolean).join(' / ') || `样本 ${index + 1}`;
  };

  const buildCompareTableHtml = (rows, columns, viewMode = 'horizontal', valueMode = 'all') => {
    if (!columns.length) {
      return '<div class="analysis-compare-empty">未选择对比参数</div>';
    }

    if (viewMode === 'vertical') {
      return `
        <table class="analysis-compare-table analysis-compare-table-vertical">
          <tbody>
            ${columns.map((column) => `
              <tr>
                <th>${escapeHtml(formatHeader(column))}</th>
                ${rows.map((row) => {
                  const cell = getCompareCellDisplay(row, column, valueMode);
                  return `<td title="${escapeHtml(cell.title)}">${cell.html}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    return `
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
                const cell = getCompareCellDisplay(row, column, valueMode);
                return `<td title="${escapeHtml(cell.title)}">${cell.html}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  const createCompareImageBlob = async (rows, options = {} as any) => {
    const tableView = options.tableView === 'vertical' ? 'vertical' : 'horizontal';
    const valueMode = options.valueMode === 'average' ? 'average' : 'all';
    const allColumns = getCompareColumns(rows);
    const columns = normalizeCompareColumns(options.columns, allColumns);
    const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建图片画布。');

    if (document.fonts?.ready) await document.fonts.ready;

    const fontFamily = '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
    const font = `700 14px ${fontFamily}`;
    const headerFont = `900 14px ${fontFamily}`;
    const titleFont = `950 20px ${fontFamily}`;
    const footerFont = `800 13px ${fontFamily}`;
    const footerText = '以上测试数据为广俊实验室测试结果，仅供参考！';
    const horizontalPadding = 16;
    const titleHeight = 58;
    const rowHeight = 46;
    const headerHeight = 48;
    const footerHeight = 42;
    const minColumnWidth = 92;
    const maxColumnWidth = 280;

    context.font = font;
    const measureTextWidth = (text, activeFont = font) => {
      context.font = activeFont;
      return Math.ceil(context.measureText(String(text || '')).width);
    };

    const clipTextToWidth = (text, maxWidth, activeFont = font) => {
      const safeText = String(text || '--');
      const availableWidth = Number(maxWidth);
      if (!Number.isFinite(availableWidth) || availableWidth <= 0) return '';
      if (measureTextWidth(safeText, activeFont) <= availableWidth) return safeText;

      const ellipsis = '...';
      if (measureTextWidth(ellipsis, activeFont) > availableWidth) {
        let fallback = '';
        for (const char of ellipsis) {
          const next = fallback + char;
          if (measureTextWidth(next, activeFont) > availableWidth) break;
          fallback = next;
        }
        return fallback;
      }

      let low = 0;
      let high = safeText.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = `${safeText.slice(0, mid)}${ellipsis}`;
        if (measureTextWidth(candidate, activeFont) <= availableWidth) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      return low > 0 ? `${safeText.slice(0, low)}${ellipsis}` : ellipsis;
    };

    const getColumnWidth = (headerText, cellTexts = []) => {
      const headerWidth = measureTextWidth(headerText, headerFont);
      const cellWidth = Math.max(...cellTexts.map((text) => measureTextWidth(text, font)), 0);
      return Math.max(
        minColumnWidth,
        Math.min(Math.max(headerWidth, cellWidth) + horizontalPadding * 2, maxColumnWidth)
      );
    };
    const columnWidths = tableView === 'vertical'
      ? [
          getColumnWidth('项目', columns.map(formatHeader)),
        ...rows.map((row, rowIndex) => getColumnWidth(
          getCompareRowLabel(row, rowIndex),
          columns.map((column) => getCompareCellText(row, column, valueMode))
        )),
      ]
      : columns.map((column) => getColumnWidth(
        formatHeader(column),
        rows.map((row) => getCompareCellText(row, column, valueMode))
      ));

    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const bodyRowCount = tableView === 'vertical' ? columns.length : rows.length;
    const imageWidth = Math.max(tableWidth + 2, measureTextWidth(footerText, footerFont) + horizontalPadding * 2);
    const imageHeight = titleHeight + (tableView === 'vertical' ? 0 : headerHeight) + bodyRowCount * rowHeight + footerHeight + 2;
    const maxCanvasPixels = 24000000;
    const dpr = Math.min(baseDpr, Math.sqrt(maxCanvasPixels / Math.max(1, imageWidth * imageHeight)));

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
      context.textAlign = align as CanvasTextAlign;

      const safeText = String(text || '--');
      const maxTextWidth = Math.max(20, width - horizontalPadding * 2);
      const displayText = clipTextToWidth(safeText, maxTextWidth, activeFont);

      const textX = align === 'left' ? x + horizontalPadding : x + width / 2;
      context.fillText(displayText, textX, y + height / 2);
    };

    const drawCompareBodyCell = ({ x, y, width, height, row, column }) => {
      context.fillStyle = '#ffffff';
      context.fillRect(x, y, width, height);
      context.strokeStyle = '#e7edf5';
      context.lineWidth = 1;
      context.strokeRect(x + .5, y + .5, width, height);

      const { main, average } = getCompareCellParts(row, column, valueMode);
      const maxTextWidth = Math.max(20, width - horizontalPadding * 2);
      context.font = font;
      context.textBaseline = 'middle';
      context.textAlign = 'left';

      if (!average) {
        const displayText = clipTextToWidth(main, maxTextWidth, font);
        const textWidth = measureTextWidth(displayText, font);
        context.fillStyle = '#0b356b';
        context.fillText(displayText, x + (width - textWidth) / 2, y + height / 2);
        return;
      }

      const averageColor = '#dc2626';
      const averageWidth = measureTextWidth(average, font);
      if (averageWidth >= maxTextWidth) {
        const displayAverage = clipTextToWidth(average, maxTextWidth, font);
        const textWidth = measureTextWidth(displayAverage, font);
        context.fillStyle = averageColor;
        context.fillText(displayAverage, x + (width - textWidth) / 2, y + height / 2);
        return;
      }

      const mainText = clipTextToWidth(main, maxTextWidth - averageWidth, font);
      const mainWidth = measureTextWidth(mainText, font);
      const startX = x + (width - mainWidth - averageWidth) / 2;
      context.fillStyle = '#0b356b';
      context.fillText(mainText, startX, y + height / 2);
      context.fillStyle = averageColor;
      context.fillText(average, startX + mainWidth, y + height / 2);
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

    if (tableView === 'vertical') {
      columns.forEach((column) => {
        x = 1;
        drawCell({
          x,
          y,
          width: columnWidths[0],
          height: rowHeight,
          text: formatHeader(column),
          fill: '#f8fbff',
          color: '#1f3150',
          activeFont: headerFont,
        });
        x += columnWidths[0];
        rows.forEach((row, rowIndex) => {
          drawCompareBodyCell({
            x,
            y,
            width: columnWidths[rowIndex + 1],
            height: rowHeight,
            row,
            column,
          });
          x += columnWidths[rowIndex + 1];
        });
        y += rowHeight;
      });
    } else {
      columns.map(formatHeader).forEach((header, index) => {
        drawCell({
          x,
          y,
          width: columnWidths[index],
          height: headerHeight,
          text: header,
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
          drawCompareBodyCell({
            x,
            y,
            width: columnWidths[index],
            height: rowHeight,
            row,
            column,
          });
          x += columnWidths[index];
        });
        y += rowHeight;
      });
    }

    context.strokeStyle = '#e7edf5';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, y + .5);
    context.lineTo(imageWidth, y + .5);
    context.stroke();
    context.font = footerFont;
    context.fillStyle = '#526174';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(footerText, horizontalPadding, y + footerHeight / 2);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片生成失败。'));
      }, 'image/png');
    });
  };

  const copyCompareImage = async (button, options = {} as any) => {
    const rows = getSelectedRowsForAllSheets();
    if (rows.length < 2) return;
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      App.notify?.error?.('当前浏览器不支持复制图片到剪贴板。');
      return;
    }
    if (Array.isArray(options.columns) && !options.columns.length) {
      App.notify?.error?.('请至少选择一个复制参数。');
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.querySelector('span').textContent = '复制中';
      }
      const blob = await createCompareImageBlob(rows, options);
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
              <div class="analysis-compare-view-toggle" aria-label="表格显示方式">
                <button class="analysis-compare-view-btn is-active" type="button" data-analysis-compare-view-toggle aria-label="当前纵向，点击切换横向">
                  <i class="ti ti-table" aria-hidden="true"></i>
                  <span>纵向</span>
                </button>
              </div>
              <div class="analysis-compare-view-toggle analysis-compare-data-toggle" aria-label="数据显示范围">
                <button class="analysis-compare-view-btn is-active" type="button" data-analysis-compare-value-toggle aria-label="当前平均数，点击切换全部数据">
                  <i class="ti ti-percentage" aria-hidden="true"></i>
                  <span>平均数</span>
                </button>
              </div>
              <div class="analysis-compare-param-settings">
                <button class="analysis-compare-copy" type="button" data-analysis-compare-settings aria-expanded="false">
                  <i class="ti ti-table-options" aria-hidden="true"></i>
                  <span>参数设置</span>
                </button>
                <div class="analysis-compare-param-panel" data-analysis-compare-param-panel hidden>
                  <div class="analysis-compare-param-head">
                    <span>复制参数</span>
                    <div class="analysis-compare-param-tools">
                      <button type="button" data-analysis-compare-param-all>全选</button>
                      <button type="button" data-analysis-compare-param-clear>清空</button>
                    </div>
                  </div>
                  <div class="analysis-compare-param-list">
                    ${columns.map((column) => `
                      <label class="analysis-compare-param-item">
                        <input type="checkbox" value="${escapeHtml(column)}" data-analysis-compare-param checked />
                        <span>${escapeHtml(formatHeader(column))}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>
              </div>
              <button class="analysis-compare-copy" type="button" data-analysis-compare-copy>
                <i class="ti ti-clipboard-copy" aria-hidden="true"></i>
                <span>复制图片</span>
              </button>
            </div>
            <button class="analysis-compare-close dialog-close" type="button" aria-label="关闭对比弹窗" data-analysis-compare-close>
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
          <div class="analysis-compare-body">
            <section class="analysis-compare-section">
              <div class="analysis-compare-table-wrap" data-analysis-compare-table-host>
                ${buildCompareTableHtml(rows, columns, 'vertical', COMPARE_VALUE_MODE_DEFAULT)}
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
    const columns = getCompareColumns(rows);
    let tableView = 'vertical';
    let valueMode = COMPARE_VALUE_MODE_DEFAULT;
    let tableSwitchTimer = null;
    const getSelectedCompareColumns = () => Array.from(dialog.querySelectorAll('[data-analysis-compare-param]:checked'))
      .map((input) => input.value)
      .filter((column) => columns.includes(column));
    const refreshCompareToggleButtons = () => {
      const viewToggle = dialog.querySelector('[data-analysis-compare-view-toggle]');
      if (viewToggle) {
        const isVertical = tableView === 'vertical';
        viewToggle.setAttribute('aria-label', isVertical ? '当前纵向，点击切换横向' : '当前横向，点击切换纵向');
        const icon = viewToggle.querySelector('i');
        if (icon) icon.className = `ti ${isVertical ? 'ti-table' : 'ti-layout-columns'}`;
        const label = viewToggle.querySelector('span');
        if (label) label.textContent = isVertical ? '纵向' : '横向';
      }

      const valueToggle = dialog.querySelector('[data-analysis-compare-value-toggle]');
      if (valueToggle) {
        const isAverage = valueMode === 'average';
        valueToggle.setAttribute('aria-label', isAverage ? '当前平均数，点击切换全部数据' : '当前全部数据，点击切换平均数');
        const icon = valueToggle.querySelector('i');
        if (icon) icon.className = `ti ${isAverage ? 'ti-percentage' : 'ti-list-details'}`;
        const label = valueToggle.querySelector('span');
        if (label) label.textContent = isAverage ? '平均数' : '全部数据';
      }
    };
    const renderCompareTable = () => {
      const tableHost = dialog.querySelector('[data-analysis-compare-table-host]');
      if (!tableHost) return;
      if (tableSwitchTimer) window.clearTimeout(tableSwitchTimer);
      tableHost.style.minHeight = `${tableHost.offsetHeight}px`;
      tableHost.classList.remove('is-switching-in');
      tableHost.classList.add('is-switching-out');
      tableSwitchTimer = window.setTimeout(() => {
        tableHost.style.minHeight = '';
        tableHost.innerHTML = buildCompareTableHtml(rows, getSelectedCompareColumns(), tableView, valueMode);
        tableHost.classList.remove('is-switching-out');
        tableHost.classList.add('is-switching-in');
        window.requestAnimationFrame(() => {
          tableHost.classList.remove('is-switching-in');
        });
      }, 80);
    };
    dialog?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const settingsButton = target.closest('[data-analysis-compare-settings]');
      const settingsPanel = dialog.querySelector('[data-analysis-compare-param-panel]');
      if (settingsButton) {
        const expanded = settingsButton.getAttribute('aria-expanded') === 'true';
        settingsButton.setAttribute('aria-expanded', String(!expanded));
        if (settingsPanel) settingsPanel.hidden = expanded;
        return;
      }
      if (target.closest('[data-analysis-compare-param-all]')) {
        dialog.querySelectorAll('[data-analysis-compare-param]').forEach((input) => {
          input.checked = true;
        });
        renderCompareTable();
        return;
      }
      if (target.closest('[data-analysis-compare-param-clear]')) {
        dialog.querySelectorAll('[data-analysis-compare-param]').forEach((input) => {
          input.checked = false;
        });
        renderCompareTable();
        return;
      }
      if (settingsPanel && !settingsPanel.hidden && !target.closest('.analysis-compare-param-settings')) {
        settingsPanel.hidden = true;
        dialog.querySelector('[data-analysis-compare-settings]')?.setAttribute('aria-expanded', 'false');
      }
      const viewButton = target.closest('[data-analysis-compare-view-toggle]');
      if (viewButton) {
        tableView = tableView === 'vertical' ? 'horizontal' : 'vertical';
        refreshCompareToggleButtons();
        renderCompareTable();
        return;
      }
      const valueModeButton = target.closest('[data-analysis-compare-value-toggle]');
      if (valueModeButton) {
        valueMode = valueMode === 'average' ? 'all' : 'average';
        refreshCompareToggleButtons();
        renderCompareTable();
        return;
      }
      const copyButton = target.closest('[data-analysis-compare-copy]');
      if (copyButton && !copyButton.hasAttribute('data-analysis-compare-settings')) {
        copyCompareImage(copyButton, { tableView, valueMode, columns: getSelectedCompareColumns() });
        return;
      }
      if (target.closest('[data-analysis-compare-close]') || target === dialog) closeCompareDialog();
    });
    dialog?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches('[data-analysis-compare-param]')) return;
      renderCompareTable();
    });
    document.addEventListener('keydown', handleCompareDialogKeydown);
    dialog?.querySelector('[data-analysis-compare-close]')?.focus({ preventScroll: true });
  };

  const buildTable = (rows, columns) => {
    if (!rows.length || !columns.length) {
      const filtered = Boolean(state.query.trim() || state.compareOnly);
      return `<div class="analysis-empty" role="status"><i class="ti ti-${filtered ? 'search' : 'file-spreadsheet'}" aria-hidden="true"></i><strong>${filtered ? '没有找到匹配数据' : '暂无物性数据'}</strong><p>${filtered ? '试试其他关键词，或清除筛选查看全部数据。' : '导入 Excel 文件，即可查看、筛选与对比材料数据。'}</p><button type="button" class="analysis-toolbar-btn analysis-toolbar-btn-primary" data-analysis-empty-action="${filtered ? 'reset' : 'import'}">${filtered ? '清除筛选' : '导入 Excel'}</button>${filtered ? '' : '<small class="analysis-empty-hint">支持 .xlsx / .xls 文件</small>'}</div>`;
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

  const renderPagination = (currentPage, totalPages) => {
    if (refs.prevPageBtn) refs.prevPageBtn.disabled = currentPage <= 1;
    if (refs.nextPageBtn) refs.nextPageBtn.disabled = currentPage >= totalPages;

    if (refs.pageNumbers) {
      refs.pageNumbers.innerHTML = getCompactPagination(currentPage, totalPages).map((item) => {
        if (typeof item !== 'number') {
          return '<span class="analysis-page-ellipsis">...</span>';
        }

        return `
          <button
            class="analysis-page-number${item === currentPage ? ' is-active' : ''}"
            type="button"
            aria-label="第 ${item} 页"
            ${item === currentPage ? 'aria-current="page"' : ''}
            data-page-number="${item}">
            ${item}
          </button>
        `;
      }).join('');
    }
  };

  const renderTabs = () => {
    if (!refs.sheetTabs || !state.data) return;

    const sheetNames = getSheetNames(state.data);
    const names = sheetNames.length ? [ALL_PROPERTY_SHEETS_KEY, ...sheetNames] : [];
    const activeSheet = getActiveSheet(state.data);
    const selectedCounts = new Map(names.map((name) => [
      name,
      getRowsForSheet(name).filter((row) => state.selectedKeys.has(row.__rowKey)).length,
    ]));

    refs.sheetTabs.innerHTML = names.map((name) => {
      const selectedCount = selectedCounts.get(name) || 0;
      return `
        <button
          type="button"
          class="analysis-sheet-tab${name === activeSheet ? ' is-active' : ''}"
          data-sheet-name="${escapeHtml(name)}">
          <span>${escapeHtml(getSheetLabel(name).trim() || '未命名')}</span>
          ${selectedCount ? `<span class="analysis-sheet-tab-count">${selectedCount}</span>` : ''}
        </button>
      `;
    }).join('');
  };

  const render = () => {
    const { rows, filteredRows, columns, currentPage, totalPages } = getVisibleRows();
    const hasFilteredRows = filteredRows.length > 0;

    renderTabs();

    if (refs.searchMode) {
      const button = refs.searchMode.querySelector('[data-search-mode-toggle]');
      if (button) {
        const exact = state.searchMode === 'exact';
        button.textContent = exact ? '精准查询' : '模糊查询';
        button.setAttribute('aria-pressed', String(exact));
        button.setAttribute('aria-label', exact ? '当前精准查询，点击切换为模糊查询' : '当前模糊查询，点击切换为精准查询');
      }
    }

    if (refs.panel) {
      refs.panel.hidden = false;
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
    if (refs.footerTotal) refs.footerTotal.textContent = totalText;
    if (refs.pagination) refs.pagination.hidden = !hasFilteredRows || totalPages <= 1;

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

  const setAnalysisData = (data, options = {} as any) => {
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
      const saved = await cloudStorage.putPropertyData(parsed, file, (percent) => {
        setUploadStatus(`上传中 ${percent}%`);
      });
      if (!saved) throw new Error('D1/R2 写入失败');
      await loadData({ bustCache: true });
      setUploadStatus('已同步成功');
    } catch (error) {
      setUploadStatus(`同步失败：${error?.message || '文件格式错误'}`);
      console.error('[property-analysis] Failed to parse Excel:', error);
    }
  };

  const importRangeWordFiles = async (fileList) => {
    if (state.rangeWordImporting) return;
    const files = [...(fileList || [])].filter((file) => /\.docx$/i.test(file.name || ''));
    if (!files.length) {
      notify('请选择 .docx 格式的检测范围 Word 文档', 'warn', 'property-range-word-empty');
      return;
    }

    const imported = [];
    const failed = [];

    state.rangeWordImporting = true;
    setUploadStatus(`解析Word范围 0/${files.length}`);
    setRangeWordImportStatus({ active: true, current: 0, total: files.length, success: 0, failed: 0 });
    for (const file of files) {
      try {
        setRangeWordImportStatus({
          active: true,
          current: imported.length + failed.length,
          total: files.length,
          success: imported.length,
          failed: failed.length,
          fileName: file.name,
        });
        const parsed = await parseRangeWordFile(file);
        imported.push(parsed);
        setUploadStatus(`解析Word范围 ${imported.length}/${files.length}`);
      } catch (error) {
        failed.push({ file: file.name, message: error?.message || '解析失败' });
        console.error('[property-analysis] Failed to parse range Word:', file.name, error);
      }
      setRangeWordImportStatus({
        active: true,
        current: imported.length + failed.length,
        total: files.length,
        success: imported.length,
        failed: failed.length,
        fileName: file.name,
      });
    }
    state.rangeWordImporting = false;

    if (!imported.length) {
      setUploadStatus('Word范围导入失败');
      setRangeWordImportStatus({
        active: false,
        current: files.length,
        total: files.length,
        success: 0,
        failed: failed.length,
        message: `导入失败：${failed.length} 个文件未识别到检测范围`,
      });
      notify(`未导入任何检测范围。${failed[0]?.message || '请检查Word模板格式'}`, 'error', 'property-range-word-failed');
      return;
    }

    const importedModels = new Set(imported.map((item) => item.model));
    state.reportRanges = [
      ...state.reportRanges.filter((item) => !importedModels.has(item.model)),
      ...imported.flatMap((item) => item.ranges),
    ];
    saveReportRanges();

    if (importedModels.size) {
      if (!state.rangeManagerSelectedModel || !importedModels.has(state.rangeManagerSelectedModel)) {
        state.rangeManagerSelectedModel = imported[0].model;
      }
      updateRangeModelList();
      updateRangeEditorPanel();
    }

    const rangeCount = imported.reduce((sum, item) => sum + item.ranges.length, 0);
    const failText = failed.length ? `，${failed.length} 个失败` : '';
    setUploadStatus(`已导入 ${imported.length} 个型号`);
    setRangeWordImportStatus({
      active: false,
      current: files.length,
      total: files.length,
      success: imported.length,
      failed: failed.length,
      message: `导入完成：${imported.length} 个型号，${rangeCount} 项范围${failText}`,
    });
    notify(`已从Word导入 ${imported.length} 个型号、${rangeCount} 项检测范围${failText}`, failed.length ? 'warn' : 'success', 'property-range-word-import');
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

  const loadData = async (options = {} as any) => {
    const requestId = state.loadRequestId + 1;
    state.loadRequestId = requestId;
    state.loadingStartedAt = performance.now();
    const startedAt = performance.now();
    try {
      setUploadStatus('读取中', 'loading');
      const payload = await fetchPropertyData();
      if (requestId !== state.loadRequestId) return;

      setAnalysisData(payload.data, {
        source: 'cloudflare',
        fileName: payload.sourceFileName || '物性数据',
      });
      setUploadStatus(`读取成功 ${formatDuration(startedAt)}`, 'success');
    } catch (error) {
      if (requestId !== state.loadRequestId) return;
      state.data = null;
      state.dataSource = 'cloudflare';
      state.sourceFileName = '';

      if (refs.sheetTabs) refs.sheetTabs.innerHTML = '';
      if (refs.panel) refs.panel.hidden = false;
      if (refs.tableWrap) {
        refs.tableWrap.innerHTML = '<div class="analysis-empty" role="alert"><i class="ti ti-cloud-data-connection" aria-hidden="true"></i><strong>暂时无法读取数据</strong><p>请检查网络与登录状态后重试。也可以使用上方「导入数据」添加 Excel 文件。</p><button type="button" class="analysis-toolbar-btn" data-analysis-empty-action="retry"><i class="ti ti-refresh" aria-hidden="true"></i>重新加载</button></div>';
      }
      if (refs.footerTotal) refs.footerTotal.textContent = '共 0 条';
      if (refs.selectionMeta) refs.selectionMeta.textContent = '已选 0 条';
      setUploadStatus('读取失败');
      if (refs.pagination) refs.pagination.hidden = true;

      console.error('[property-analysis] Failed to load data:', error);
    }
  };

  const ensureLoaded = () => {
    const isLoading = getStatusTone(state.uploadStatusText) === 'loading';
    const hasData = Boolean(state.data);
    const loadingFor = performance.now() - (state.loadingStartedAt || 0);
    if (!hasData && (!isLoading || loadingFor > 8000)) {
      loadData({ bustCache: true });
    }
  };

  const disableNativeSearchAutocomplete = () => {
    if (!refs.searchInput) return;

    refs.searchInput.setAttribute('autocomplete', 'off');
    refs.searchInput.setAttribute('autocorrect', 'off');
    refs.searchInput.setAttribute('autocapitalize', 'off');
    refs.searchInput.setAttribute('spellcheck', 'false');
    refs.searchInput.setAttribute('name', 'gjh-property-analysis-search');
  };

  const bind = () => {
    ensureReportToolbar();
    ensureMobileActionMenu();
    disableNativeSearchAutocomplete();

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
      const button = event.target.closest('[data-search-mode-toggle]');
      if (!button) return;

      state.searchMode = state.searchMode === 'fuzzy' ? 'exact' : 'fuzzy';
      state.page = 1;
      render();
    });

    refs.searchSuggest?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggest-value]');
      if (!button || !refs.searchInput) return;

      const nextValue = button.getAttribute('data-suggest-value') || '';
      applySuggestionValue(nextValue);
    });

    refs.sortToggle?.addEventListener('click', () => {
      state.sort = state.sort === 'forward' ? 'backward' : 'forward';
      const reversed = state.sort === 'backward';
      refs.sortToggle.textContent = reversed ? '反序' : '正序';
      refs.sortToggle.setAttribute('aria-pressed', String(reversed));
      refs.sortToggle.setAttribute('aria-label', `当前${reversed ? '反序' : '正序'}，点击切换为${reversed ? '正序' : '反序'}`);
      refs.sortToggle.title = `点击切换为${reversed ? '正序' : '反序'}`;
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
      const emptyAction = target.closest<HTMLButtonElement>('[data-analysis-empty-action]');
      if (emptyAction) {
        if (emptyAction.dataset.analysisEmptyAction === 'import') document.getElementById('analysisImportExcelBtn')?.click();
        else if (emptyAction.dataset.analysisEmptyAction === 'reset') {
          state.query = '';
          state.compareOnly = false;
          state.page = 1;
          if (refs.searchInput) refs.searchInput.value = '';
          render();
        } else {
          emptyAction.disabled = true;
          emptyAction.textContent = '正在重新加载…';
          void loadData({ bustCache: true });
        }
        return;
      }
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
      renderTabs();
    });

    refs.selectAllBtn?.addEventListener('click', toggleSelectAllFiltered);
    refs.compareBtn?.addEventListener('click', toggleCompareMode);
    refs.exportJsonBtn?.addEventListener('click', exportCurrentJson);
    refs.manageRangesBtn?.addEventListener('click', () => openRangeManagerDialog());
    refs.exportReportBtn?.addEventListener('click', openReportDialog);
    refs.mobileActionToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = refs.mobileActionToggle?.getAttribute('aria-expanded') === 'true';
      setMobileActionMenuOpen(!isOpen);
    });
    refs.mobileActionMenu?.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.analysis-toolbar-btn')) {
        setMobileActionMenuOpen(false);
      }
    });
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
    refs.rangeWordInput?.addEventListener('change', () => {
      const files = refs.rangeWordInput?.files;
      importRangeWordFiles(files);
      if (refs.rangeWordInput) refs.rangeWordInput.value = '';
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

      if (
        refs.mobileActionToggle?.contains?.(target) ||
        refs.mobileActionMenu?.contains?.(target)
      ) {
        return;
      }

      setMobileActionMenuOpen(false);
      state.suggestionOpen = false;
      state.suggestionIndex = -1;
      renderSuggestions();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMobileActionMenuOpen(false);
    });

    window.addEventListener('resize', () => {
      ensureMobileActionMenu();
      setMobileActionMenuOpen(false);
    });
  };

  const init = () => {
    loadReportRanges();
    bind();
    const initialLoading = loadData();
    window.setTimeout(() => {
      if (document.querySelector('[data-page-section="property-analysis"]')?.classList.contains('active')) {
        ensureLoaded();
      }
    }, 8500);
    return initialLoading;
  };

  const cleanup = () => {
    closeReportDialog();
    closeRangeManagerDialog();
    closeCompareDialog();
    setMobileActionMenuOpen(false);
  };

  App.propertyAnalysis = {
    init,
    cleanup,
    loadData,
    ensureLoaded,
    render,
    parseExcelWorkbook,
  };
})();

