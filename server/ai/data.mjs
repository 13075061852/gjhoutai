/**
 * 只读数据访问层。
 *
 * 全部走 Node 22 内置的 node:sqlite（readOnly 连接），
 * 不写业务库、不加依赖、不与 gjhoutai.service 的写入竞争。
 */
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from './config.mjs';

let connection = null;
let propertyCache = { updatedAt: '', raw: '', parsedAt: 0, data: null };
const PROPERTY_CACHE_MS = 30_000;

const open = () => {
  if (!connection) connection = new DatabaseSync(databasePath, { readOnly: true });
  return connection;
};

/** 关闭只读连接（测试或优雅退出用；服务常驻时无需调用）。 */
export const closeDataConnection = () => {
  if (!connection) return;
  try { connection.close(); } catch { /* 已关闭 */ }
  connection = null;
};

export const queryAll = (sql, params = []) => open().prepare(sql).all(...params);
export const queryOne = (sql, params = []) => open().prepare(sql).get(...params) ?? null;

const text = (value) => String(value ?? '').trim();
const hit = (value, needle) => text(value).toLowerCase().includes(needle.toLowerCase());
const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const clampLimit = (value, fallback = 30, max = 200) => clamp(value, 1, max, fallback);

/** 物性/打版数据（property_data.data_json），带短时缓存，数据更新后自动失效。 */
export function getPropertyData() {
  const row = queryOne('SELECT data_json, source_file_name, updated_at FROM property_data WHERE id = 1');
  if (!row) return null;
  const cached = propertyCache.data
    && propertyCache.updatedAt === row.updated_at
    && propertyCache.raw === row.data_json
    && Date.now() - propertyCache.parsedAt < PROPERTY_CACHE_MS;
  if (!cached) {
    propertyCache = { updatedAt: row.updated_at, raw: row.data_json, parsedAt: Date.now(), data: JSON.parse(row.data_json) };
  }
  return {
    data: propertyCache.data,
    sourceFileName: text(row.source_file_name),
    updatedAt: text(row.updated_at),
  };
}

export function propertyRows() {
  const property = getPropertyData();
  const rows = property?.data?.currentView?.processedData;
  return Array.isArray(rows) ? rows : [];
}

export function propertyFields() {
  const fields = new Set();
  for (const row of propertyRows()) {
    if (row && typeof row === 'object') for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields];
}

export function sheetNames() {
  const sheets = getPropertyData()?.data?.sheets;
  const names = new Set([
    ...Object.keys(sheets?.merged ?? {}),
    ...Object.keys(sheets?.raw ?? {}),
  ]);
  return [...names].map((name) => name.trim()).filter(Boolean);
}

/** 分表数据：variant 为 merged（合并后）或 raw（原始）。 */
export function sheetRows(sheetName, variant = 'merged') {
  const sheets = getPropertyData()?.data?.sheets;
  const wanted = text(sheetName).toLowerCase();
  const source = sheets?.[variant === 'raw' ? 'raw' : 'merged'] ?? {};
  const key = Object.keys(source).find((name) => name.trim().toLowerCase() === wanted)
    ?? Object.keys(source).find((name) => hit(name, wanted));
  if (!key) return null;
  const rows = source[key];
  return {
    sheet: key.trim(),
    variant: variant === 'raw' ? 'raw' : 'merged',
    rows: Array.isArray(rows) ? rows : Object.values(rows ?? {}),
  };
}

/** 按型号/批号/关键字过滤行，只返回原始字段，不做推断。 */
export function filterRows(rows, { model, batch, keyword, limit }) {
  const needleModel = text(model).toLowerCase();
  const needleBatch = text(batch).toLowerCase();
  const needle = text(keyword).toLowerCase();
  const matched = (rows ?? []).filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (needleModel && !hit(row['型号'], needleModel)) return false;
    if (needleBatch && !hit(row['批号'] ?? row['批次'], needleBatch)) return false;
    if (needle && !Object.values(row).some((value) => hit(value, needle))) return false;
    return true;
  });
  return matched.slice(0, clampLimit(limit));
}

export function listRecognitionRecords({ keyword, limit } = {}) {
  const needle = text(keyword);
  const rows = queryAll(`
    SELECT id, file_name, model_code, batch_code, row_count, model, created_at, created_by
    FROM data_recognition_records
    ORDER BY created_at DESC
    LIMIT ?
  `, [needle ? 500 : clampLimit(limit, 30, 200)]);
  const filtered = needle
    ? rows.filter((row) => hit(row.file_name, needle) || hit(row.model_code, needle) || hit(row.batch_code, needle))
    : rows;
  return filtered.slice(0, clampLimit(limit)).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    modelCode: row.model_code,
    batchCode: row.batch_code,
    rowCount: row.row_count,
    model: row.model,
    createdAt: row.created_at,
  }));
}

export function getRecognitionRecord(id) {
  const row = queryOne(`
    SELECT id, file_name, model_code, batch_code, row_count, model, raw_text, result_json, created_at
    FROM data_recognition_records WHERE id = ?
  `, [text(id)]);
  if (!row) return null;
  let result = null;
  try { result = JSON.parse(row.result_json); } catch { result = null; }
  return {
    id: row.id,
    fileName: row.file_name,
    modelCode: row.model_code,
    batchCode: row.batch_code,
    rowCount: row.row_count,
    model: row.model,
    rawText: row.raw_text,
    createdAt: row.created_at,
    result,
  };
}

export function listInspectionReports({ keyword, limit } = {}) {
  const needle = text(keyword);
  const rows = queryAll(`
    SELECT id, title, category, file_name, file_size, notes, created_at
    FROM inspection_reports
    ORDER BY created_at DESC
    LIMIT ?
  `, [needle ? 500 : clampLimit(limit, 30, 200)]);
  const filtered = needle
    ? rows.filter((row) => hit(row.title, needle) || hit(row.category, needle) || hit(row.file_name, needle) || hit(row.notes, needle))
    : rows;
  return filtered.slice(0, clampLimit(limit)).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    fileName: row.file_name,
    fileSize: row.file_size,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

export function countRows(table) {
  const allowed = ['property_data', 'data_recognition_records', 'inspection_reports', 'audit_logs', 'users'];
  if (!allowed.includes(table)) return 0;
  return queryOne(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;
}

/* ------------------------------------------------------------------ *
 * 图谱（红外/热分析谱图）库
 *
 * 与「图谱分析」页面同一份数据：app_state 里的全局键
 * gjh-spectrum-user-images-v2（记录）+ gjh-spectrum-edits-v2（编辑覆盖）。
 * 图片本体存在对象存储里，这里只返回元信息，便于模型定位到具体图谱。
 * ------------------------------------------------------------------ */

const SPECTRUM_STORAGE_KEY = 'gjh-spectrum-user-images-v2';
const SPECTRUM_EDIT_KEY = 'gjh-spectrum-edits-v2';

const stateValue = (storageKey) => {
  const row = queryOne('SELECT value FROM app_state WHERE key = ?', [storageKey]);
  if (!row || typeof row.value !== 'string') return null;
  return parseStoredJson(row.value);
};

/** 页面上的部分集合是「JSON 字符串再 JSON」两层存储，这里统一解两层。 */
const parseStoredJson = (raw) => {
  let value = raw;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof value !== 'string') break;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

/** 纯函数：合并页面上的手工编辑，输出稳定的图谱元信息列表。 */
export function normalizeSpectrumRecords(uploaded, edits) {
  const list = Array.isArray(uploaded) ? uploaded : [];
  const overrides = edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
  return list.map((raw) => {
    const item = raw && typeof raw === 'object' ? raw : {};
    const id = text(item.id);
    const override = overrides[id] && typeof overrides[id] === 'object' ? overrides[id] : {};
    const pick = (key) => (override[key] === undefined ? item[key] : override[key]);
    const tags = Array.isArray(pick('tags'))
      ? pick('tags').map((tag) => text(tag)).filter(Boolean)
      : String(pick('tags') ?? '').split(/[,，;；]+/).map((tag) => text(tag)).filter(Boolean);
    return {
      id,
      code: text(pick('code')),
      title: text(pick('title')),
      spectrumType: text(pick('spectrumType') || item.spectrumType).toUpperCase(),
      category: text(pick('category')),
      date: text(pick('date')),
      tags,
      note: text(pick('note')),
      hasImage: Boolean(item.imageStored || item.image || item.imageVersion),
    };
  }).filter((item) => item.id || item.title);
}

/** Comparison-only normalization: preserve stored names, tolerate model spaces/dashes. */
export const normalizeSpectrumKeyword = (value) => text(value).normalize('NFKC').toLowerCase().replace(/[\s\-‐‑‒–—_]+/g, '');

/** All matches, before a display limit can hide a less frequent spectrum type. */
export function matchSpectrumRecords(records, { keyword, type, category, tag } = {}) {
  const needle = normalizeSpectrumKeyword(keyword);
  const namedModel = text(keyword).match(/^([^\d]+)(\d{3,}[-\s]?[a-z][a-z0-9-]*)$/i);
  const keywordParts = namedModel ? [namedModel[1], namedModel[2]].map(normalizeSpectrumKeyword) : [needle];
  const wantedType = text(type).toUpperCase();
  const wantedCategory = text(category).toLowerCase();
  const wantedTag = text(tag).toLowerCase();
  const matched = (records ?? []).filter((item) => {
    if (wantedType && item.spectrumType !== wantedType) return false;
    if (wantedCategory && !hit(item.category, wantedCategory)) return false;
    if (wantedTag && !item.tags.some((entry) => hit(entry, wantedTag))) return false;
    const fields = [item.title, item.code, item.category, item.spectrumType, item.date, item.note, item.tags.join(' ')].map(normalizeSpectrumKeyword);
    if (needle && !keywordParts.every(part => fields.some(value => value.includes(part)))) return false;
    return true;
  });
  return matched;
}

export function filterSpectrumRecords(records, params = {}) {
  return matchSpectrumRecords(records, params).slice(0, clampLimit(params.limit));
}

export function spectrumRecords() {
  return normalizeSpectrumRecords(stateValue(SPECTRUM_STORAGE_KEY), stateValue(SPECTRUM_EDIT_KEY));
}

/** 图谱库整体情况：总数、类型/分类/标签分布、日期范围。 */
export function spectrumOverview() {
  const records = spectrumRecords();
  const counter = (values) => {
    const map = new Map();
    for (const value of values) if (value) map.set(value, (map.get(value) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  const dates = records.map((item) => item.date).filter(Boolean).sort();
  return {
    total: records.length,
    withImage: records.filter((item) => item.hasImage).length,
    types: counter(records.map((item) => item.spectrumType)),
    categories: counter(records.map((item) => item.category)),
    tags: counter(records.flatMap((item) => item.tags)),
    earliestDate: dates[0] ?? '',
    latestDate: dates[dates.length - 1] ?? '',
  };
}

/* ------------------------------------------------------------------ *
 * 办事记录页的其他数据：灰份检测记录
 * ------------------------------------------------------------------ */

const OFFICE_RECORDS_KEY = 'gjh-office-records-v1';
const ASH_RECORDS_KEY = 'gjh-ash-records-v1';
const REPORT_RANGES_KEY = 'gjh-property-report-ranges-v1';

const asArray = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

/** 把一条记录的所有值拼成可搜索文本。 */
const recordText = (item) => {
  const parts = [];
  const walk = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value === 'object') {
      for (const entry of Object.values(value)) walk(entry);
      return;
    }
    const entry = text(value);
    if (entry) parts.push(entry);
  };
  walk(item);
  return parts.join(' ');
};

/** 纯函数：按关键字过滤任意集合。 */
export function filterRecords(items, { keyword, limit } = {}) {
  const needle = text(keyword).toLowerCase();
  const list = asArray(items);
  const matched = needle ? list.filter((item) => hit(recordText(item), needle)) : list;
  return matched.slice(0, clampLimit(limit));
}

/** 办事记录：按类型/项目/日期/关键字过滤，保留明细表（最多 60 行/条）。 */
export function listOfficeRecords({ keyword, type, project, dateFrom, dateTo, limit } = {}) {
  const items = asArray(stateValue(OFFICE_RECORDS_KEY));
  const wantedType = text(type).toLowerCase();
  const wantedProject = text(project).toLowerCase();
  const from = text(dateFrom);
  const to = text(dateTo);
  const needle = text(keyword).toLowerCase();
  const matched = items.filter((item) => {
    if (wantedType && !hit(item.type, wantedType)) return false;
    if (wantedProject && !hit(item.project, wantedProject)) return false;
    if (from && text(item.date) < from) return false;
    if (to && text(item.date) > to) return false;
    if (needle && !hit(recordText(item), needle)) return false;
    return true;
  });
  const trimmed = matched.slice(0, clampLimit(limit)).map((item) => ({
    ...item,
    tableRows: Array.isArray(item.tableRows) ? item.tableRows.slice(0, 60) : item.tableRows,
  }));
  return {
    total: items.length,
    returned: trimmed.length,
    types: [...new Set(items.map((item) => text(item.type)).filter(Boolean))],
    records: trimmed,
  };
}

/** 灰份检测记录（办事记录页的灰份模块）。 */
export function listAshRecords({ keyword, limit } = {}) {
  const items = asArray(stateValue(ASH_RECORDS_KEY));
  const matched = filterRecords(items, { keyword, limit });
  return { total: items.length, returned: matched.length, records: matched };
}

/** 物性分析报告判定范围（型号 + 指标 + 上下限）。 */
export function reportRanges({ model, keyword, limit } = {}) {
  const items = asArray(stateValue(REPORT_RANGES_KEY));
  const matched = filterRecords(items, { keyword: model || keyword, limit });
  return { total: items.length, returned: matched.length, ranges: matched };
}
