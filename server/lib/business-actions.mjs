/** Controlled AI business writes run in the main service, NEVER in the read-only AI process.
 * Models can only prepare a proposal. The authenticated browser confirms it separately.
 * All commits recheck permissions + source hashes, and write the data/audit/status atomically.
 */
import { createHash, randomUUID } from 'node:crypto';

const HASH = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const txt = (value) => String(value ?? '').trim();
const DATASETS = {
  ash_records: { page: 'office-records', key: 'gjh-ash-records-v1', label: '灰份记录' },
  office_records: { page: 'office-records', key: 'gjh-office-records-v1', label: '办事记录' },
  spectrum_records: { page: 'spectrum-analysis', key: 'gjh-spectrum-user-images-v2', label: '图谱记录' },
  report_ranges: { page: 'property-analysis', key: 'gjh-property-report-ranges-v1', label: '报告判定范围' },
  property_rows: { page: 'property-analysis', label: '物性记录' },
  inspection_reports: { page: 'inspection-reports', label: '检测报告' },
};
export const businessDatasetNames = Object.keys(DATASETS);
export const propertyRowRef = (row) => `row-${HASH(row)}`;
const EDITS_KEY = 'gjh-spectrum-edits-v2';
const LEGACY_DEPARTMENTS = { system_admin: '系统管理员', lab_engineer: '测试部', sales_manager: '销售部', warehouse_manager: '生产部主管' };
const DEPARTMENTS = new Set(['系统管理员', '研发部', '测试部', '销售部', '生产部', '生产部主管']);
const decode = (raw) => {
  let value = raw;
  for (let i = 0; i < 3 && typeof value === 'string'; i += 1) {
    try { value = JSON.parse(value); } catch { fail(409, '原始数据格式异常，不能覆盖'); }
  }
  return value;
};
const only = (record, keys) => {
  if (!plain(record)) fail(400, '记录必须是对象');
  for (const key of Object.keys(record)) if (!keys.includes(key)) fail(400, `不支持的字段：${key}`);
};
const date = (value) => {
  const text = txt(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) fail(400, '必须提供真实日期 YYYY-MM-DD，不得猜测日期');
  return text;
};
const required = (value, label) => { const result = txt(value); if (!result) fail(400, `缺少${label}，请先询问用户`); return result; };
const number = (value, label, min = 0, max = Infinity) => {
  const text = txt(value).replace(/%$/, '');
  const result = Number(text);
  if (!text || !Number.isFinite(result) || result < min || result > max) fail(400, `${label}不是有效数值`);
  return result;
};
function normalizeRecord(dataset, data, previous = null) {
  const record = { ...(previous || {}), ...data };
  if (dataset === 'ash_records') {
    only(data, ['date', 'name', 'batch', 'rows']);
    record.name = required(record.name, '客户/材料名称');
    record.date = date(record.date);
    record.batch = txt(record.batch);
    if (!Array.isArray(record.rows) || !record.rows.length || record.rows.length > 60) fail(400, '灰份检测需要 1–60 行明细');
    record.rows = record.rows.map((row, index) => {
      only(row, ['index', 'cupWeight', 'materialWeight', 'residueWeight', 'residueMaterialWeight', 'content']);
      const out = { index: String(index + 1) };
      for (const field of ['cupWeight', 'materialWeight', 'residueWeight', 'residueMaterialWeight', 'content']) out[field] = txt(row[field]);
      for (const field of ['cupWeight', 'materialWeight', 'residueWeight', 'residueMaterialWeight']) if (out[field]) number(out[field], field);
      if (out.cupWeight && out.materialWeight && out.residueWeight) {
        const residue = number(out.residueWeight, '剩余重量') - number(out.cupWeight, '杯重');
        const material = number(out.materialWeight, '料重', Number.MIN_VALUE);
        const ratio = residue / material * 100;
        if (ratio < 0 || ratio > 100) fail(400, '杯重/料重/残重不一致，灰份必须在 0–100%');
        if (out.content && Math.abs(number(out.content, '灰份', 0, 100) - ratio) > .06) fail(400, '提供的灰份与称重计算不符，请核实原始数据');
        out.residueMaterialWeight = String(Number(residue.toFixed(3)));
        out.content = `${Number(ratio.toFixed(2))}%`;
      } else if (out.content) out.content = `${number(out.content, '灰份', 0, 100)}%`;
      else fail(400, '灰份明细需提供含量，或完整杯重/料重/剩余重量');
      return out;
    });
  } else if (dataset === 'office_records') {
    only(data, ['type', 'project', 'date', 'tableColumns', 'tableRows', 'target', 'additives', 'customerApprovedRows']);
    if (!['sampling', 'coloring'].includes(record.type)) fail(400, '办事类型仅支持 sampling（送样）/coloring（配色）');
    record.project = required(record.project, '客户/项目');
    record.date = date(record.date);
    if (!Array.isArray(record.tableColumns) || !record.tableColumns.length || record.tableColumns.length > 30 || !record.tableColumns.every((v) => typeof v === 'string' && v.trim())) fail(400, '请提供明细表列名');
    if (!Array.isArray(record.tableRows) || !record.tableRows.length || record.tableRows.length > 100) fail(400, '需要 1–100 行明细');
    record.tableRows = record.tableRows.map((row) => {
      if (!Array.isArray(row) || row.length !== record.tableColumns.length || row.some((v) => v !== null && typeof v === 'object')) fail(400, '明细行与列名数量不一致');
      return row.map((v) => txt(v));
    });
    if (record.tableColumns[0] !== '编号') {
      record.tableColumns = ['编号', ...record.tableColumns];
      record.tableRows = record.tableRows.map((row, i) => [String(i + 1), ...row]);
    } else record.tableRows = record.tableRows.map((row, i) => [String(i + 1), ...row.slice(1)]);
    record.customerApprovedRows = Array.isArray(record.customerApprovedRows) ? record.customerApprovedRows : [];
    if (record.customerApprovedRows.some((i) => !Number.isInteger(i) || i < 0 || i >= record.tableRows.length)) fail(400, '客户认可行号无效');
  } else if (dataset === 'spectrum_records') {
    only(data, ['code', 'title', 'spectrumType', 'category', 'date', 'tags', 'note']);
    record.title = required(record.title, '图谱名称');
    record.date = date(record.date);
    record.spectrumType = txt(record.spectrumType).toUpperCase();
    if (!['FTIR', 'DSC', 'TGA'].includes(record.spectrumType)) fail(400, '图谱类型必须是 FTIR/DSC/TGA');
    if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string')) fail(400, 'tags 必须是文本数组（可为空数组）');
    record.category = txt(record.category); record.code = txt(record.code); record.note = txt(record.note);
    record.uploaded = true;
  } else if (dataset === 'report_ranges') {
    only(data, ['model', 'metricKey', 'item', 'unit', 'range']);
    for (const field of ['model', 'metricKey', 'range']) record[field] = required(record[field], field);
    record.item = txt(record.item || record.metricKey); record.unit = txt(record.unit);
  } else if (dataset === 'inspection_reports') {
    only(data, ['title', 'category', 'notes', 'fileName']);
    record.title = required(record.title, '报告标题'); record.category = txt(record.category); record.notes = txt(record.notes);
  }
  record.updatedAt = new Date().toISOString();
  return record;
}

export function createBusinessActions({ db, files, allowedOrigins = '', aiBaseUrl = 'http://127.0.0.1:8790', appBasePath = '/gjhoutai', readOnly = true }) {
  // AI process has no writable access to this DB. This table is owned by the main service.
  db.exec(`CREATE TABLE IF NOT EXISTS ai_business_actions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,thread_id TEXT NOT NULL,dataset TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',plan_json TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,committed_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_ai_business_actions_owner ON ai_business_actions(user_id,thread_id,created_at)`);
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(aiBaseUrl)) throw new Error('AI attachment endpoint must be loopback');
  const stateRow = (key) => db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
  const rawState = (key) => stateRow(key)?.value ?? null;
  const getState = (key, fallback) => { const raw = rawState(key); return raw === null ? fallback : decode(raw); };
  function canEdit(user, dataset) {
    const def = DATASETS[dataset];
    if (!def) fail(400, '不支持的数据集；不可访问任意存储键、SQL、账户或密钥');
    const department = user.department || LEGACY_DEPARTMENTS[user.role];
    if (!DEPARTMENTS.has(department)) fail(403, '未识别部门，拒绝写入');
    // Match the current server-enforced business scope, never resurrect retired permission overrides.
    if (!['系统管理员', '测试部'].includes(department)) fail(403, '当前账户没有该页面的编辑权限');
    return def;
  }
  function readSource(dataset) {
    const def = DATASETS[dataset];
    if (def.key) {
      const raw = rawState(def.key);
      const items = raw === null ? [] : decode(raw);
      if (!Array.isArray(items)) fail(409, '集合数据不是数组，拒绝覆盖');
      const editsRaw = dataset === 'spectrum_records' ? rawState(EDITS_KEY) : null;
      return { raw, items, editsRaw, edits: editsRaw === null ? {} : decode(editsRaw) };
    }
    if (dataset === 'property_rows') {
      const row = db.prepare('SELECT * FROM property_data WHERE id=1').get();
      if (!row) fail(404, '请先在物性页导入数据文件');
      return { raw: row.data_json, items: JSON.parse(row.data_json), sourceFileName: row.source_file_name };
    }
    const items = db.prepare('SELECT * FROM inspection_reports ORDER BY id').all();
    return { raw: JSON.stringify(items), items };
  }
  function revision(source) { return HASH(JSON.stringify([source.raw, source.editsRaw ?? null])); }
  function publicProposal(row) {
    const plan = JSON.parse(row.plan_json);
    return { id: row.id, threadId: row.thread_id, dataset: row.dataset, operation: plan.operation, label: DATASETS[row.dataset].label, count: plan.changes.length, changes: plan.changes, status: row.status, expiresAt: row.expires_at, pageId: DATASETS[row.dataset].page };
  }
  async function attachment(id, cookie, dataset) {
    if (!/^[a-f0-9-]{36}$/i.test(txt(id))) fail(400, '新增图谱/检测报告需要本次已上传附件的 id');
    const response = await fetch(`${aiBaseUrl}${appBasePath}/api/ai/uploads/${id}`, { headers: { cookie }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) fail(response.status === 404 ? 400 : response.status, '附件不可用、已过期或不属于当前账户');
    const type = txt(response.headers.get('content-type')).split(';')[0].toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) fail(400, '附件大小无效');
    if (dataset === 'inspection_reports') {
      if (type !== 'application/pdf' || bytes.subarray(0, 5).toString() !== '%PDF-') fail(400, '检测报告必须使用真实 PDF 附件');
    } else {
      const magic = type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        || type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216
        || type === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
        || type === 'image/gif' && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString());
      if (!magic) fail(400, '图谱必须使用真实 PNG/JPEG/WebP/GIF 图片附件');
    }
    return { bytes, type };
  }
  async function pruneExpiredFiles() {
    const now = new Date().toISOString();
    const rows = db.prepare("SELECT id,plan_json FROM ai_business_actions WHERE status='pending' AND expires_at<=? LIMIT 25").all(now);
    for (const row of rows) {
      const changed = db.prepare("UPDATE ai_business_actions SET status='expired' WHERE id=? AND status='pending' AND expires_at<=?").run(row.id, now).changes;
      if (changed) await Promise.all((JSON.parse(row.plan_json).fileKeys || []).map((key) => files.delete(key)));
    }
  }
  async function prepare(user, payload, cookie) {
    only(payload, ['dataset', 'operation', 'threadId', 'sheet', 'items']);
    const { dataset, operation } = payload;
    const def = canEdit(user, dataset);
    await pruneExpiredFiles();
    const thread = required(payload.threadId, '会话标识');
    if (thread.length > 64) fail(400, '会话标识过长');
    if (!['create', 'update', 'delete'].includes(operation)) fail(400, '操作必须是 create/update/delete');
    if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 50) fail(400, '一次操作需要 1–50 条记录');
    const pending = db.prepare("SELECT count(*) AS n FROM ai_business_actions WHERE user_id=? AND status='pending' AND expires_at>?").get(user.id, new Date().toISOString()).n;
    if (pending >= 10) fail(429, '待确认操作过多，请先确认或取消已有操作');
    const source = readSource(dataset);
    let items = clone(source.items);
    let target = items;
    let sheet = '';
    if (dataset === 'property_rows') {
      sheet = txt(payload.sheet || items.project?.activeSheetName);
      if (sheet) {
        target = items.sheets?.merged?.[sheet];
        if (!Array.isArray(target)) fail(400, '请从 data_overview 查询并指定真实 merged 分表名');
      } else target = items.currentView?.processedData;
      if (!Array.isArray(target)) fail(400, '物性表数据结构无效');
    }
    const edits = clone(source.edits || {});
    const changes = [];
    const newFiles = [];
    const seen = new Set();
    const knownFields = dataset === 'property_rows' ? new Set(target.flatMap((row) => Object.keys(row))) : null;
    for (const input of payload.items) {
      only(input, ['id', 'data', 'attachmentId']);
      if (operation !== 'create' && !txt(input.id)) fail(400, '修改/删除必须先查询并提供精确 id（物性行使用 rowRef）');
      if (operation === 'delete' && input.data !== undefined) fail(400, '删除操作不接受修改字段');
      if (operation !== 'create' && input.attachmentId) fail(400, '文件替换请新增文件记录后另行确认删除旧记录，不覆盖原文件');
      if (operation === 'create' && input.id) fail(400, '新增记录 id 由服务端生成');
      const identity = txt(input.id);
      if (identity && seen.has(identity)) fail(400, '同一记录不能重复操作');
      seen.add(identity);
      const matches = operation === 'create' ? [] : target.map((row, index) => ({ row, index })).filter(({ row }) => (dataset === 'property_rows' ? propertyRowRef(row) : txt(row.id)) === identity);
      if (operation !== 'create' && matches.length !== 1) fail(409, '记录不存在或标识不唯一，请重新查询并缩小范围');
      const before = matches[0]?.row || null;
      const index = matches[0]?.index;
      const effectiveBefore = dataset === 'spectrum_records' && before ? { ...before, ...edits[before.id], id: before.id } : before;
      let after = null;
      if (operation !== 'delete') {
        if (!plain(input.data) || !Object.keys(input.data).length) fail(400, '缺少新增/修改字段');
        if (dataset === 'property_rows') {
          for (const [key, value] of Object.entries(input.data)) {
            if (!knownFields.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(400, `物性表不存在字段：${key}`);
            if (plain(value) || Array.isArray(value) && value.some((v) => v !== null && typeof v === 'object')) fail(400, '物性字段只允许原始值或数值/文本数组');
          }
          after = { ...(before || {}), ...input.data };
          required(after['型号'], '型号');
        } else after = normalizeRecord(dataset, input.data, effectiveBefore);
        if (dataset !== 'property_rows') after.id = before?.id || `${dataset === 'ash_records' ? 'ASH' : dataset === 'office_records' ? 'OR' : dataset === 'spectrum_records' ? 'upload' : 'ai'}-${randomUUID()}`;
        if (operation === 'create') {
          const duplicate = target.some((row) => dataset === 'ash_records' ? row.date === after.date && row.name === after.name && txt(row.batch) === after.batch
            : dataset === 'report_ranges' ? row.model === after.model && row.metricKey === after.metricKey
            : dataset === 'property_rows' ? HASH(row) === HASH(after) : false);
          if (duplicate) fail(409, '已有相同记录，请先查询，避免重复录入；需要时选择修改');
          if (['spectrum_records', 'inspection_reports'].includes(dataset)) {
            if (newFiles.length >= 4) fail(400, '一次最多保存4个图谱/报告文件');
            const file = await attachment(input.attachmentId, cookie, dataset);
            if (newFiles.reduce((sum, entry) => sum + entry.bytes.length, 0) + file.bytes.length > 16 * 1024 * 1024) fail(413, '单次文件总大小不能超过16MB');
            const key = dataset === 'spectrum_records' ? `spectrum/${after.id}` : `inspection-reports/${after.id}.pdf`;
            newFiles.push({ key, bytes: file.bytes, type: file.type });
            if (dataset === 'spectrum_records') Object.assign(after, { imageStored: true, imageVersion: randomUUID() });
            else Object.assign(after, { created_by: user.id, created_at: new Date().toISOString(), file_name: txt(after.fileName || `${after.title}.pdf`).replace(/[\\/\r\n]/g, '_'), file_key: key, file_size: file.bytes.length });
          }
          target.push(after);
        } else target[index] = after;
      } else target.splice(index, 1);
      if (dataset === 'spectrum_records' && before) delete edits[before.id];
      changes.push({ id: after?.id || identity || propertyRowRef(after), before: effectiveBefore, after });
    }
    if (dataset === 'property_rows' && sheet && items.project?.activeSheetName === sheet) {
      items.currentView ||= {};
      items.currentView.processedData = clone(target);
      items.currentView.compareItems = [];
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const plan = { operation, sheet, revision: revision(source), before: source, after: items, edits, changes, fileKeys: newFiles.map((file) => file.key) };
    const persisted = [];
    try {
      for (const file of newFiles) { await files.put(file.key, file.bytes, { httpMetadata: { contentType: file.type } }); persisted.push(file.key); }
      db.prepare('INSERT INTO ai_business_actions(id,user_id,thread_id,dataset,plan_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(id, user.id, thread, dataset, JSON.stringify(plan), createdAt, expiresAt);
    } catch (error) { await Promise.all(persisted.map((key) => files.delete(key))); throw error; }
    return publicProposal(db.prepare('SELECT * FROM ai_business_actions WHERE id=?').get(id));
  }
  function owned(user, id, thread) {
    const row = db.prepare('SELECT * FROM ai_business_actions WHERE id=? AND user_id=? AND thread_id=?').get(id, user.id, required(thread, '会话标识'));
    if (!row) fail(404, '操作不存在或不属于当前用户/会话');
    return row;
  }
  function commit(user, id, thread) {
    return db.transaction(() => {
      const row = owned(user, id, thread);
      canEdit(user, row.dataset);
      if (row.status === 'committed') return { proposal: publicProposal(row), replayed: true };
      if (row.status !== 'pending' || row.expires_at <= new Date().toISOString()) fail(409, '操作已取消或过期，请让 AI 重新准备');
      const plan = JSON.parse(row.plan_json);
      const current = readSource(row.dataset);
      if (revision(current) !== plan.revision) fail(409, '数据已被其他操作更新，请重新查询并生成预览，不能覆盖新数据');
      const now = new Date().toISOString();
      const def = DATASETS[row.dataset];
      const put = (key, value, previousRaw) => {
        const previousWasString = previousRaw !== null && typeof JSON.parse(previousRaw) === 'string';
        const raw = previousWasString ? JSON.stringify(JSON.stringify(value)) : JSON.stringify(value);
        db.prepare('INSERT INTO app_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key, raw, now);
      };
      if (def.key) {
        put(def.key, plan.after, current.raw);
        if (row.dataset === 'spectrum_records') put(EDITS_KEY, plan.edits, current.editsRaw);
      } else if (row.dataset === 'property_rows') {
        db.prepare('UPDATE property_data SET data_json=?,updated_at=? WHERE id=1').run(JSON.stringify(plan.after), now);
      } else {
        for (const change of plan.changes) {
          const after = change.after;
          if (!after) db.prepare('DELETE FROM inspection_reports WHERE id=?').run(change.id);
          else if (!change.before) db.prepare('INSERT INTO inspection_reports(id,created_by,file_name,file_key,file_size,title,category,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(after.id, after.created_by, after.file_name, after.file_key, after.file_size, after.title, after.category, after.notes, after.created_at);
          else db.prepare('UPDATE inspection_reports SET title=?,category=?,notes=? WHERE id=?').run(after.title, after.category, after.notes, after.id);
        }
      }
      db.prepare('INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(), user.id, `ai.business.${plan.operation}`, row.dataset, id, JSON.stringify({ threadId: thread, count: plan.changes.length, ids: plan.changes.map((change) => change.id), backup: 'ai_business_actions.plan_json.before' }), now);
      db.prepare("UPDATE ai_business_actions SET status='committed',committed_at=? WHERE id=?").run(now, id);
      return { proposal: publicProposal({ ...row, status: 'committed' }), changedKeys: def.key ? [def.key, ...(row.dataset === 'spectrum_records' ? [EDITS_KEY] : [])] : [], pageId: def.page };
    }).immediate();
  }
  async function cancel(user, id, thread) {
    const row = owned(user, id, thread);
    if (row.status === 'committed') fail(409, '已提交操作不能取消');
    db.prepare("UPDATE ai_business_actions SET status='cancelled' WHERE id=? AND status='pending'").run(id);
    const plan = JSON.parse(row.plan_json);
    // Only files created by this proposal; never remove original / deleted business files.
    await Promise.all(plan.fileKeys.map((key) => files.delete(key)));
    return { proposal: publicProposal({ ...row, status: 'cancelled' }) };
  }
  async function handle(request) {
    const url = new URL(request.url);
    if (!/^\/api\/business-actions(?:\/|$)/.test(url.pathname)) return null;
    const origin = request.headers.get('origin');
    const allowed = !origin || origin === url.origin || allowedOrigins.split(',').map(txt).filter((v) => v && v !== 'null').includes(origin);
    const cors = origin && allowed ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin' } : {};
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    try {
      if (!allowed || !origin && request.headers.get('sec-fetch-site') === 'cross-site') fail(403, '来源不受信任');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
      const cookie = request.headers.get('cookie') || '';
      const token = cookie.split(';').map((v) => v.trim()).find((v) => v.startsWith('gjh_session='))?.slice(12);
      if (!token) fail(401, '请重新登录');
      const user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>datetime(?) AND u.is_active=1').get(HASH(token), new Date().toISOString());
      if (!user) fail(401, '请重新登录');
      // Includes historical proposal commits: removing the model tool alone is not sufficient.
      if (readOnly && request.method === 'POST') fail(403, 'AI 对本项目仅有读取权限，业务变更入口已关闭；请在业务页面人工操作。');
      const match = url.pathname.match(/^\/api\/business-actions\/([a-f0-9-]{36})(?:\/(commit|cancel))?$/i);
      if (request.method === 'GET' && match && !match[2]) return json({ proposal: publicProposal(owned(user, match[1], url.searchParams.get('threadId'))) });
      if (request.method !== 'POST') fail(405, '方法不受支持');
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, '需要 application/json');
      let length = 0; const chunks = [];
      if (request.body) for await (const chunk of request.body) { length += chunk.length; if (length > 1024 * 1024) fail(413, '单次操作内容过大'); chunks.push(chunk); }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString()); } catch { fail(400, 'JSON 格式错误'); }
      if (url.pathname === '/api/business-actions/prepare') return json({ proposal: await prepare(user, payload, cookie) }, 201);
      if (match?.[2]) {
        if (!origin) fail(403, '确认或取消必须来自受信任的浏览器页面');
        only(payload, ['threadId']);
        return json(match[2] === 'commit' ? commit(user, match[1], payload.threadId) : await cancel(user, match[1], payload.threadId));
      }
      fail(404, '接口不存在');
    } catch (error) {
      if (!error.status) console.error('[business-actions]', error.message);
      return json({ error: error.status ? error.message : '业务操作失败，请重试' }, error.status || 500);
    }
  }
  return { handle };
}
