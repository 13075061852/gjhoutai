/**
 * 服务端 AI 网关（独立进程，Node 22）。
 *
 * 对外只暴露 /api/ai/*：建运行、订阅 SSE 事件流、停止运行。
 * 鉴权复用主站的 gjh_session Cookie（sha256 后查 sessions 表）。
 * 允许的来源由 CORS_ORIGINS 控制，写操作要求 Origin 在白名单内。
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {
  attachmentStoragePath,
  classifyAttachment,
  isSafeUploadId,
  limits,
  safeAttachmentName,
  validateAttachment,
} from './attachments.mjs';
import { config, uploadsDir } from './config.mjs';
import { queryOne } from './data.mjs';
import { projectAccess } from './project-access.mjs';
import { historyStore } from './history.mjs';
import { abortRun, describeModel, getRun, listThreads, searchWeb, startRun, stats } from './runtime.mjs';

const SESSION_COOKIE = 'gjh_session';
const MAX_BODY_BYTES = 256 * 1024;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const uploadRecords = new Map();
const CONTENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8', tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json; charset=utf-8', md: 'text/markdown; charset=utf-8', log: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const contentTypeFor = (name, fallback = '') => {
  const mime = String(fallback || '').split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = safeAttachmentName(name).toLowerCase().split('.').pop() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
};

/** 进程内记录已上传附件（用于归属校验；过期文件按 TTL 清理）。 */
const registerUpload = (record) => {
  uploadRecords.set(record.id, record);
  return record;
};

const pruneUploads = async () => {
  const now = Date.now();
  for (const [id, record] of uploadRecords) {
    if (now - record.createdAt < config.attachmentTtlMs) continue;
    uploadRecords.delete(id);
    await rm(record.path, { force: true }).catch(() => {});
  }
};

/** 读取原始请求体（附件上传用，不解析 JSON）。 */
const readRawBody = (request, maxBytes) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  let done = false;
  request.on('data', (chunk) => {
    if (done) return;
    size += chunk.length;
    if (size > maxBytes) {
      done = true;
      reject(Object.assign(new Error('附件过大'), { status: 413 }));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (!done) resolve(Buffer.concat(chunks));
  });
  request.on('error', (error) => {
    if (!done) reject(error);
  });
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const parseCookies = (header = '') => Object.fromEntries(
  String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [part, ''];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
);

const getSessionUser = (request) => {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = queryOne(`
    SELECT u.id, u.username, u.display_name, u.role, u.department, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND (s.expires_at > ? OR datetime(s.expires_at) > datetime('now'))
  `, [sha256(token), new Date().toISOString()]);
  if (!row || !row.is_active) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    department: row.department,
  };
};

const sendJson = (response, status, payload, cors = {}) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...cors,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

const readJson = (request, maxBytes = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(Object.assign(new Error('请求体过大'), { status: 413 }));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return resolve({});
    try {
      resolve(JSON.parse(raw));
    } catch {
      reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
    }
  });
  request.on('error', reject);
});

const streamRun = (request, response, run, cors) => {
  const url = new URL(request.url, 'http://localhost');
  const from = Math.max(0, Number(url.searchParams.get('from') || 0) || 0);
  response.writeHead(200, {
    ...cors,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  let closed = false;
  let unsubscribe = () => {};
  let heartbeat;
  const release = () => {
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  const write = (event) => {
    if (closed) return;
    response.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  unsubscribe = run.subscribe((event) => {
    write(event);
    if (event.type === 'done') finish();
  }, from);
  if (closed) unsubscribe();
  else if (run.finished) finish();
  else heartbeat = setInterval(() => {
    if (!closed) response.write(': ping\n\n');
  }, config.sseHeartbeatMs);

  function finish() {
    if (closed) return;
    release();
    response.end();
  }

  request.on('close', release);
};

const handle = async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const origin = request.headers.origin;
  const allowedOrigin = origin && config.corsOrigins.includes(origin) ? origin : null;
  const cors = allowedOrigin
    ? { 'access-control-allow-origin': allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin' }
    : {};

  // 跨域写操作必须来自白名单来源（防止第三方站点带 Cookie 调接口）
  if (origin && !allowedOrigin) return sendJson(response, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...cors,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      // Cross-origin uploads send the original file name in this header.
      'access-control-allow-headers': 'content-type, accept, x-file-name',
      'access-control-max-age': '600',
      'content-length': '0',
    });
    return response.end();
  }

  let pathname = url.pathname;
  if (config.appBasePath && pathname.startsWith(config.appBasePath)) pathname = pathname.slice(config.appBasePath.length) || '/';
  const route = pathname.startsWith('/api/ai') ? (pathname.slice('/api/ai'.length) || '/') : null;
  if (route === null) return sendJson(response, 404, { error: 'not_found' }, cors);

  if (request.method === 'GET' && (route === '/health' || route === '/model')) {
    const model = await describeModel();
    return sendJson(response, model.ready ? 200 : 503, { ok: model.ready, model, stats: stats() }, cors);
  }

  const user = getSessionUser(request);
  if (!user) return sendJson(response, 401, { error: 'unauthorized' }, cors);

  if (route === '/history') {
    try {
      if (request.method === 'GET') {
        if (url.searchParams.get('ownerId') !== String(user.id)) return sendJson(response, 403, { error: 'account_changed' }, cors);
        return sendJson(response, 200, { sessions: historyStore().list(user.id) }, cors);
      }
      if (request.method === 'POST') {
        if (!allowedOrigin) return sendJson(response, 403, { error: '历史同步必须来自受信任页面' }, cors);
        const body = await readJson(request, 4 * 1024 * 1024);
        if (body.ownerId !== String(user.id)) return sendJson(response, 403, { error: 'account_changed' }, cors);
        historyStore().save(user.id, body);
        return sendJson(response, 200, { ok: true }, cors);
      }
      return sendJson(response, 405, { error: 'method_not_allowed' }, cors);
    } catch (error) { return sendJson(response, Number(error.status) || 500, { error: Number(error.status) === 400 ? error.message : '云端历史暂时不可用' }, cors); }
  }

  // Only authenticated browser requests can confirm; no model tool calls this route.
  const projectAction = route.match(/^\/project-actions\/([a-f0-9-]{36})\/(confirm|cancel)$/);
  if (request.method === 'POST' && projectAction) {
    if (!allowedOrigin) return sendJson(response, 403, { error: '确认项目启停必须来自受信任页面' }, cors);
    try {
      const body = await readJson(request);
      const action = await projectAccess.submit(user, projectAction[1], body.threadId, projectAction[2]);
      return sendJson(response, 200, { action }, cors);
    } catch (error) { return sendJson(response, Number(error.status) || 500, { error: error.message || '项目确认失败' }, cors); }
  }

  if (request.method === 'GET' && route === '/threads') {
    return sendJson(response, 200, { threads: listThreads(user.id) }, cors);
  }

  if (request.method === 'POST' && route === '/search') {
    const body = await readJson(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(config.runTimeoutMs, 120_000));
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnect);
    try {
      const result = await searchWeb({ user, query: body.query, urls: body.urls, signal: controller.signal });
      return sendJson(response, 200, result, cors);
    } catch (error) {
      console.error('[ai] 搜索失败：', error instanceof Error ? error.message : 'unknown');
      return sendJson(response, Number(error?.status) || 502, { error: controller.signal.aborted ? '搜索已停止或超时' : '原生联网搜索失败，请检查服务端模型是否支持搜索及服务状态。' }, cors);
    } finally {
      clearTimeout(timeout);
      response.off('close', disconnect);
    }
  }

  if (request.method === 'POST' && route === '/uploads') {
    const rawName = String(request.headers['x-file-name'] ?? '');
    let decodedName = rawName;
    try { decodedName = decodeURIComponent(rawName); } catch { decodedName = rawName; }
    const name = safeAttachmentName(decodedName, 'attachment');
    const size = Number(request.headers['content-length'] || 0);
    const type = contentTypeFor(name, String(request.headers['content-type'] || ''));
    const verdict = validateAttachment({ name, type, size });
    if (!verdict.ok) return sendJson(response, 400, { error: verdict.error }, cors);
    let body;
    try {
      body = await readRawBody(request, Math.min(limits.maxBytes, size || limits.maxBytes));
    } catch (error) {
      return sendJson(response, Number(error?.status) || 400, { error: error instanceof Error ? error.message : '附件读取失败' }, cors);
    }
    const realVerdict = validateAttachment({ name, type, size: body.length });
    if (!realVerdict.ok) return sendJson(response, 400, { error: realVerdict.error }, cors);
    const id = randomUUID();
    const filePath = attachmentStoragePath(uploadsDir, user.id, id, name);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, body, { mode: 0o600 });
    const record = registerUpload({
      id,
      name,
      type,
      size: body.length,
      kind: classifyAttachment({ name, type }),
      userId: user.id,
      path: filePath,
      createdAt: Date.now(),
    });
    return sendJson(response, 201, {
      attachment: {
        id: record.id,
        name: record.name,
        type: record.type,
        size: record.size,
        kind: record.kind,
        url: `${config.appBasePath}/api/ai/uploads/${record.id}`,
      },
    }, cors);
  }

  const upload = route.match(/^\/uploads\/([^/]+)$/);
  if (request.method === 'GET' && upload && isSafeUploadId(upload[1])) {
    const record = uploadRecords.get(upload[1]);
    if (!record || record.userId !== user.id) return sendJson(response, 404, { error: 'attachment_not_found' }, cors);
    const data = await readFile(record.path).catch(() => null);
    if (!data) return sendJson(response, 404, { error: 'attachment_not_found' }, cors);
    response.writeHead(200, {
      ...cors,
      'content-type': record.type || 'application/octet-stream',
      'content-length': data.length,
      'content-disposition': `${['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].includes(record.type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.name)}`,
      'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
    return response.end(data);
  }

  if (request.method === 'POST' && route === '/runs') {
    const body = await readJson(request);
    const requested = Array.isArray(body.attachments) ? body.attachments.slice(0, config.maxAttachments) : [];
    const files = [];
    for (const item of requested) {
      const id = typeof item === 'string' ? item : item?.id;
      const record = isSafeUploadId(id) ? uploadRecords.get(id) : null;
      if (!record || record.userId !== user.id) return sendJson(response, 400, { error: '附件不存在或已过期，请重新上传' }, cors);
      files.push({ id: record.id, name: record.name, type: record.type, size: record.size, path: record.path });
    }
    const run = await startRun({ user, prompt: body.prompt, threadId: body.threadId, attachments: files,
      sessionCookie: `gjh_session=${parseCookies(request.headers.cookie)[SESSION_COOKIE]}` });
    return sendJson(response, 202, { run: run.toJSON() }, cors);
  }

  const events = route.match(/^\/runs\/([^/]+)\/events$/);
  if (request.method === 'GET' && events) {
    const run = getRun(events[1]);
    if (!run || run.userId !== user.id) return sendJson(response, 404, { error: 'run_not_found' }, cors);
    return streamRun(request, response, run, cors);
  }

  const abort = route.match(/^\/runs\/([^/]+)\/abort$/);
  if (request.method === 'POST' && abort) {
    const run = getRun(abort[1]);
    if (!run || run.userId !== user.id) return sendJson(response, 404, { error: 'run_not_found' }, cors);
    return sendJson(response, 200, { stopped: abortRun(abort[1]) }, cors);
  }

  const detail = route.match(/^\/runs\/([^/]+)$/);
  if (request.method === 'GET' && detail) {
    const run = getRun(detail[1]);
    if (!run || run.userId !== user.id) return sendJson(response, 404, { error: 'run_not_found' }, cors);
    return sendJson(response, 200, { run: run.toJSON() }, cors);
  }

  return sendJson(response, 404, { error: 'not_found' }, cors);
};

export const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[ai] 处理请求失败：', error);
    if (!response.headersSent) sendJson(response, status, { error: error instanceof Error ? error.message : 'internal_error' });
    else response.end();
  });
});

setInterval(() => { void pruneUploads(); }, Math.max(60_000, Math.min(config.attachmentTtlMs, 30 * 60_000))).unref();

// 附件目录必须存在且位于服务可写路径（默认 agentDir/uploads，可由 AI_UPLOAD_DIR 覆盖）。
await mkdir(uploadsDir, { recursive: true, mode: 0o700 }).catch((error) => {
  console.error('[ai] 附件目录不可写：', error instanceof Error ? error.message : String(error));
});

server.listen(config.port, config.host, () => {
  console.log(`[ai] gjhoutai AI 服务已启动：http://${config.host}:${config.port}${config.appBasePath}/api/ai/health`);
  void describeModel().then((model) => {
    console.log(`[ai] 模型状态：${model.ready ? '就绪' : '不可用'} ${model.providerId}:${model.modelId} ${model.reason || ''}`);
  });
});
