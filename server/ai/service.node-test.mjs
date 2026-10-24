/**
 * 网关集成测试：真起一个 HTTP 服务，验证鉴权、附件上传/回读与拒绝策略，
 * 顺便挡住「漏 import 导致运行时 ReferenceError」这类只靠 node --check 发现不了的错误。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';

const TOKEN = 'test-session-token';
const PORT = 18790 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}/gjhoutai`;
let dir = '';
let server;

const json = async (response) => ({ status: response.status, body: await response.json().catch(() => null) });

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'gjh-ai-service-'));
  const db = new DatabaseSync(path.join(dir, 'gjhoutai.sqlite'));
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, role TEXT, department TEXT, is_active INTEGER);
    CREATE TABLE sessions (user_id TEXT, token_hash TEXT, expires_at TEXT);
  `);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,1)').run('u1', 'kingpolymer', '管理员', 'system_admin', '系统管理员');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('u1', createHash('sha256').update(TOKEN).digest('hex'), new Date(Date.now() + 3600_000).toISOString());
  db.close();

  process.env.DATA_DIR = dir;
  process.env.AI_AGENT_DIR = path.join(dir, 'pi');
  process.env.AI_PORT = String(PORT);
  process.env.AI_HOST = '127.0.0.1';
  process.env.APP_BASE_PATH = '/gjhoutai';
  process.env.AI_PROVIDER_ID = 'deepseek';
  process.env.AI_MODEL = 'deepseek:deepseek-chat';
  process.env.AI_BASE_URL = 'https://api.deepseek.com/v1';
  process.env.AI_API_KEY = 'test-key';
  process.env.CORS_ORIGINS = 'http://127.0.0.1:5001';
  ({ server } = await import('./service.mjs'));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/ai/health`);
      if (response.ok) return;
    } catch { /* 还没起来 */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('AI 服务未在预期时间内启动');
});

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  const { closeDataConnection } = await import('./data.mjs');
  closeDataConnection();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

test('health 公开可读，其它接口必须登录', async () => {
  const health = await json(await fetch(`${BASE}/api/ai/health`));
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  const anonymous = await json(await fetch(`${BASE}/api/ai/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi' }),
  }));
  assert.equal(anonymous.status, 401);
});

test('跨域上传预检放行文件名请求头，同时保持来源白名单与凭据限制', async () => {
  const origin = 'http://127.0.0.1:5001';
  const headers = {
    origin,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type,x-file-name',
  };
  const response = await fetch(`${BASE}/api/ai/uploads`, { method: 'OPTIONS', headers });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const allowed = response.headers.get('access-control-allow-headers').toLowerCase().split(',').map((value) => value.trim());
  for (const header of ['content-type', 'x-file-name']) assert.ok(allowed.includes(header));
  assert.equal(response.headers.get('vary'), 'Origin');
  const rejected = await fetch(`${BASE}/api/ai/uploads`, {
    method: 'OPTIONS', headers: { ...headers, origin: 'https://untrusted.example' },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  const anonymous = await fetch(`${BASE}/api/ai/uploads`, {
    method: 'POST', headers: { origin, 'content-type': 'image/png', 'x-file-name': 'test.png' }, body: Buffer.from([1]),
  });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('access-control-allow-origin'), origin);
});

test('active HTML attachments are downloaded with sandbox/no-sniff instead of executing on the application origin', async () => {
  const uploaded = await json(await fetch(`${BASE}/api/ai/uploads`, {
    method:'POST',headers:{cookie:`gjh_session=${TOKEN}`,origin:'http://127.0.0.1:5001','content-type':'text/html','x-file-name':'unsafe.html'},body:'<script>fetch("/api/auth/me")</script>',
  }));
  assert.equal(uploaded.status,201);
  const response = await fetch(`${BASE}/api/ai/uploads/${uploaded.body.attachment.id}`,{headers:{cookie:`gjh_session=${TOKEN}`}});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/^attachment;/);
  assert.match(response.headers.get('content-security-policy'),/sandbox/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('上传图片与文本附件后可回读，并按归属隔离', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const uploaded = await json(await fetch(`${BASE}/api/ai/uploads`, {
    method: 'POST',
    headers: {
      cookie: `gjh_session=${TOKEN}`,
      'content-type': 'image/png',
      'x-file-name': encodeURIComponent('图谱 图.png'),
      'content-length': String(png.length),
      origin: 'http://127.0.0.1:5001',
    },
    body: png,
  }));
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.attachment.name, '图谱 图.png');
  assert.equal(uploaded.body.attachment.kind, 'image');
  assert.equal(uploaded.body.attachment.url, `/gjhoutai/api/ai/uploads/${uploaded.body.attachment.id}`);

  const fetched = await fetch(`${BASE}/api/ai/uploads/${uploaded.body.attachment.id}`, {
    headers: { cookie: `gjh_session=${TOKEN}` },
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), png);

  const anonymous = await fetch(`${BASE}/api/ai/uploads/${uploaded.body.attachment.id}`);
  assert.equal(anonymous.status, 401);
  const unknown = await fetch(`${BASE}/api/ai/uploads/00000000-0000-0000-0000-000000000000`, {
    headers: { cookie: `gjh_session=${TOKEN}` },
  });
  assert.equal(unknown.status, 404);
});

test('文本附件按扩展名识别类型，空附件被拒绝', async () => {
  const csv = Buffer.from('型号,批号\n320G6-B1S,A604201\n', 'utf8');
  const uploaded = await json(await fetch(`${BASE}/api/ai/uploads`, {
    method: 'POST',
    headers: {
      cookie: `gjh_session=${TOKEN}`,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent('data.csv'),
      'content-length': String(csv.length),
    },
    body: csv,
  }));
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.attachment.kind, 'text');
  assert.equal(uploaded.body.attachment.type, 'text/csv; charset=utf-8');

  const empty = await json(await fetch(`${BASE}/api/ai/uploads`, {
    method: 'POST',
    headers: {
      cookie: `gjh_session=${TOKEN}`,
      'content-type': 'image/png',
      'x-file-name': 'empty.png',
      'content-length': '0',
    },
    body: Buffer.alloc(0),
  }));
  assert.equal(empty.status, 400);
  assert.match(String(empty.body.error), /附件/);
});

test('超过单文件上限的上传被拒绝', async () => {
  const big = Buffer.alloc(9 * 1024 * 1024, 1);
  const response = await fetch(`${BASE}/api/ai/uploads`, {
    method: 'POST',
    headers: {
      cookie: `gjh_session=${TOKEN}`,
      'content-type': 'application/pdf',
      'x-file-name': 'big.pdf',
      'content-length': String(big.length),
    },
    body: big,
  });
  assert.equal(response.status, 400);
  assert.match(String((await response.json()).error), /8 MB/);
});

test('运行请求会校验附件归属，未上传的附件 id 被拒绝', async () => {
  const response = await json(await fetch(`${BASE}/api/ai/runs`, {
    method: 'POST',
    headers: { cookie: `gjh_session=${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', attachments: [{ id: '11111111-2222-3333-4444-555555555555' }] }),
  }));
  assert.equal(response.status, 400);
  assert.match(String(response.body.error), /附件不存在|过期/);
});
