import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

const encoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (value: string) => bytesToHex(new Uint8Array(
  await crypto.subtle.digest('SHA-256', encoder.encode(value)),
));

const hashPassword = async (password: string, salt: string) => {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000 },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
};

class FakeStatement {
  private values: unknown[] = [];

  constructor(private db: FakeD1Database, private sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.db.first<T>(this.sql, this.values));
  }

  all<T>() {
    return Promise.resolve({ results: this.db.all<T>(this.sql, this.values) });
  }

  run() {
    this.db.run(this.sql, this.values);
    return Promise.resolve({ success: true });
  }
}

class FakeD1Database {
  users = new Map<string, any>();
  usersByUsername = new Map<string, any>();
  sessions = new Map<string, any>();
  loginAttempts = new Map<string, any>();
  appState = new Map<string, string>();
  dataRecognitionRecords = new Map<string, any>();
  sharedConfig: any = null;

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  batch(statements: FakeStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  addUser(user: any) {
    this.users.set(user.id, user);
    this.usersByUsername.set(user.username, user);
  }

  async addSession(userId: string, token: string) {
    this.sessions.set(await sha256(token), {
      user_id: userId,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes('SELECT password_hash, password_salt FROM users')) {
      return (this.users.get(String(values[0])) || null) as T | null;
    }
    if (sql.includes('SELECT * FROM users WHERE username')) {
      return (this.usersByUsername.get(String(values[0])) || null) as T | null;
    }
    if (sql.includes('FROM sessions s')) {
      const session = this.sessions.get(String(values[0]));
      if (!session || session.expires_at <= String(values[1])) return null;
      const user = this.users.get(session.user_id);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        department: user.department,
        must_change_password: user.must_change_password,
        is_active: user.is_active,
      } as T;
    }
    if (sql.includes('SELECT failures, updated_at FROM login_attempts')) {
      return (this.loginAttempts.get(String(values[0])) || null) as T | null;
    }
    if (sql.includes('SELECT ciphertext, iv FROM shared_config')) {
      return this.sharedConfig as T | null;
    }
    if (sql.includes('SELECT value FROM app_state WHERE key')) {
      const value = this.appState.get(String(values[0]));
      return (value == null ? null : { value }) as T | null;
    }
    if (sql.includes('FROM data_recognition_records') && sql.includes('WHERE id =')) {
      const record = this.dataRecognitionRecords.get(String(values[0]));
      if (!record || record.created_by !== String(values[1])) return null;
      return record as T;
    }
    return null;
  }

  all<T>(sql: string, values: unknown[]): T[] {
    if (sql.includes('SELECT key, value FROM app_state WHERE key IN')) {
      return values.filter((key) => this.appState.has(String(key)))
        .map((key) => ({ key: String(key), value: this.appState.get(String(key)) })) as T[];
    }
    if (sql.includes('FROM login_attempts')) {
      const now = String(values[values.length - 1]);
      return values.slice(0, -1)
        .map((key) => this.loginAttempts.get(String(key)))
        .filter((attempt) => attempt?.locked_until && attempt.locked_until > now) as T[];
    }
    if (sql.includes('FROM data_recognition_records')) {
      return [...this.dataRecognitionRecords.values()]
        .filter((record) => record.created_by === String(values[0]))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .slice(0, Number(values[1]) || 40) as T[];
    }
    return [];
  }

  run(sql: string, values: unknown[]) {
    if (sql.includes('UPDATE sessions SET last_seen_at')) return;
    if (sql.includes('DELETE FROM sessions WHERE user_id')) {
      for (const [hash, session] of this.sessions) {
        if (session.user_id === values[0] && (!sql.includes('token_hash !=') || hash !== values[1])) this.sessions.delete(hash);
      }
      return;
    }
    if (sql.includes('SET password_hash = ?1')) {
      const user = this.users.get(String(values[2]));
      if (user) Object.assign(user, { password_hash: values[0], password_salt: values[1], must_change_password: 0 });
      return;
    }
    if (sql.includes('INSERT INTO audit_logs')) return;
    if (sql.includes('INSERT INTO login_attempts')) {
      this.loginAttempts.set(String(values[0]), {
        identifier: String(values[0]),
        failures: Number(values[1]),
        locked_until: values[2] ? String(values[2]) : null,
        updated_at: String(values[3]),
      });
      return;
    }
    if (sql.includes('DELETE FROM login_attempts')) {
      values.forEach((key) => this.loginAttempts.delete(String(key)));
      return;
    }
    if (sql.includes('INSERT INTO shared_config')) {
      this.sharedConfig = { ciphertext: String(values[0]), iv: String(values[1]) };
    }
    if (sql.includes('INSERT INTO app_state')) {
      this.appState.set(String(values[0]), String(values[1]));
    }
    if (sql.includes('DELETE FROM app_state')) {
      this.appState.delete(String(values[0]));
    }
    if (sql.includes('INSERT INTO data_recognition_records')) {
      this.dataRecognitionRecords.set(String(values[0]), {
        id: String(values[0]),
        created_by: String(values[1]),
        file_name: String(values[2]),
        image_key: String(values[3]),
        image_content_type: String(values[4]),
        model: values[5] == null ? null : String(values[5]),
        model_code: values[6] == null ? null : String(values[6]),
        batch_code: values[7] == null ? null : String(values[7]),
        row_count: Number(values[8]),
        result_json: String(values[9]),
        raw_text: values[10] == null ? null : String(values[10]),
        created_at: new Date().toISOString(),
      });
    }
    if (sql.includes('DELETE FROM data_recognition_records')) {
      const record = this.dataRecognitionRecords.get(String(values[0]));
      if (record?.created_by === String(values[1])) this.dataRecognitionRecords.delete(String(values[0]));
    }
    if (sql.includes('UPDATE data_recognition_records')) {
      const record = this.dataRecognitionRecords.get(String(values[5]));
      if (record?.created_by === String(values[6])) {
        record.model_code = values[0] == null ? null : String(values[0]);
        record.batch_code = values[1] == null ? null : String(values[1]);
        record.row_count = Number(values[2]);
        record.result_json = String(values[3]);
        record.raw_text = values[4] == null ? null : String(values[4]);
      }
    }
  }
}

class FakeR2Bucket {
  objects = new Map<string, any>();

  get(key: string) {
    return Promise.resolve(this.objects.get(key) || null);
  }

  async put(key: string, body: BodyInit | null, options?: { httpMetadata?: { contentType?: string } }) {
    const response = new Response(body);
    this.objects.set(key, {
      body: response.body,
      httpEtag: 'etag',
      httpMetadata: options?.httpMetadata || {},
    });
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

const createEnv = () => ({
  DB: new FakeD1Database(),
  FILES: new FakeR2Bucket(),
  CONFIG_ENCRYPTION_KEY: 'test-config-key',
  CORS_ORIGINS: 'https://app.example',
});

const authedRequest = (path: string, token: string, init: RequestInit = {}) => new Request(`https://api.example${path}`, {
  ...init,
  headers: {
    cookie: `gjh_session=${token}`,
    ...(init.headers || {}),
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker security controls', () => {
  it('retires unused project routes and never forwards generation requests', async () => {
    const env = await authenticatedEnv();
    const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
    for (const path of ['/api/users', '/api/data-recognition/history', '/api/liblibai/request', '/api/business-actions/prepare']) {
      const response = await worker.fetch(authedRequest(path, 'token', { method:'POST',headers:{'content-type':'application/json'},body:'{}' }),env as any);
      expect(response.status).toBe(404);
    }
    for (const [path,method] of [['/images/generations','POST'],['/videos/generations','POST'],['/tasks/task','GET']]) {
      const response = await worker.fetch(authedRequest('/api/apimart/request','token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baseUrl:'https://api.apimart.ai/v1',apiKey:'key',path,method})}),env as any);
      expect(response.status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();expect(env.FILES.objects.size).toBe(0);
  });
  it('rejects retired ERP and permission keys for every method, including administrators', async () => {
    const env = await authenticatedEnv();
    for (const key of ['gjh-orders-v1','gjh-formula-recipes-v1','gjh-personnel-v1','gjh-role-page-permissions-v1','unknown']) for (const method of ['GET','PUT','DELETE']) {
      const response = await worker.fetch(authedRequest('/api/state/'+key,'token',{method,...(method==='PUT'?{headers:{'content-type':'application/json'},body:'{"value":"blocked"}'}:{})}),env as any);
      expect(response.status).toBe(400);
    }
    expect(env.DB.appState.size).toBe(0);
  });
  it.each(['销售部','生产部','研发部'])('enforces business write restrictions on the server for %s',async department=>{
    const env=createEnv();env.DB.addUser({id:'restricted',username:'r',department,role:department==='研发部'?'system_admin':'sales_manager',must_change_password:0,is_active:1});await env.DB.addSession('restricted','restricted-token');
    for (const path of ['/api/state/gjh-office-records-v1','/api/state/gjh-ash-records-v1','/api/property-data','/api/blob/spectrum/upload-test']) {
      const response=await worker.fetch(authedRequest(path,'restricted-token',{method:'PUT',headers:{'content-type':path.includes('/blob/')?'image/png':'application/json'},body:'{"value":[],"data":{}}'}),env as any);
      expect(response.status).toBe(403);
    }
    expect(env.DB.appState.size).toBe(0);expect(env.FILES.objects.size).toBe(0);
  });
  it('keeps current office/ash data shared for lab edits, and user preferences isolated',async()=>{
    const env=await authenticatedEnv();
    const key='gjh-office-records-v1';
    const put=await worker.fetch(authedRequest('/api/state/'+key,'token',{method:'PUT',headers:{'content-type':'application/json'},body:'{"value":"office"}'}),env as any);expect(put.status).toBe(200);
    expect((await worker.fetch(authedRequest('/api/state/'+key,'token'),env as any)).status).toBe(200);
    const deleted=await worker.fetch(authedRequest('/api/state/'+key,'token',{method:'DELETE'}),env as any);expect(deleted.status).toBe(200);expect(env.DB.appState.has(key)).toBe(false);
    const pref='openrouter-ai-call-log-v1';
    await worker.fetch(authedRequest('/api/state/'+pref,'token',{method:'PUT',headers:{'content-type':'application/json'},body:'{"value":"private"}'}),env as any);
    expect(env.DB.appState.has('users/admin-1/'+pref)).toBe(true);expect(env.DB.appState.has(pref)).toBe(false);
  });
  it('batches state reads with authentication, per-user keys and missing-key nulls', async () => {
    const env = createEnv();
    const path = '/api/state?key=sidebar-active-page&key=gjh-office-records-v1&key=gjh-ash-records-v1';
    expect((await worker.fetch(new Request(`https://api.example${path}`), env as any)).status).toBe(401);
    env.DB.addUser({ id: 'batch-user', username: 'batch', display_name: 'Batch', role: 'lab_engineer', department: '测试部', must_change_password: 0, is_active: 1 });
    await env.DB.addSession('batch-user', 'batch-token');
    env.DB.appState.set('users/batch-user/sidebar-active-page', JSON.stringify('property-analysis'));
    env.DB.appState.set('users/other-user/sidebar-active-page', JSON.stringify('private-other-user'));
    env.DB.appState.set('gjh-office-records-v1', JSON.stringify('office-data'));
    const response = await worker.fetch(authedRequest(path, 'batch-token'), env as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ values: { 'sidebar-active-page': 'property-analysis', 'gjh-office-records-v1': 'office-data', 'gjh-ash-records-v1': null } });
    for (const query of ['', '?key=../private', '?' + new URLSearchParams(Array.from({ length: 33 }, (_, i) => ['key', `key-${i}`])).toString()]) {
      expect((await worker.fetch(authedRequest(`/api/state${query}`, 'batch-token'), env as any)).status).toBe(400);
    }
  });
  it('requires config-read permission for the official pricing endpoint', async () => {
    const env = createEnv();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await worker.fetch(new Request('https://api.example/api/model-pricing?provider=deepseek'), env as any)).status).toBe(401);
    env.DB.addUser({ id: 'pricing-sales', username: 'sales', display_name: 'Sales', role: 'sales_manager', department: '销售部', password_hash: 'unused', password_salt: 'unused', must_change_password: 0, is_active: 1 });
    await env.DB.addSession('pricing-sales', 'pricing-token');
    expect((await worker.fetch(authedRequest('/api/model-pricing?provider=deepseek', 'pricing-token'), env as any)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forbids non-admin users from reading or changing shared config', async () => {
    const env = createEnv();
    env.DB.addUser({
      id: 'sales-1',
      username: 'sales',
      display_name: 'Sales',
      role: 'sales_manager',
      department: '销售部',
      password_hash: 'unused',
      password_salt: 'unused',
      must_change_password: 0,
      is_active: 1,
    });
    await env.DB.addSession('sales-1', 'sales-token');

    const getResponse = await worker.fetch(authedRequest('/api/config', 'sales-token'), env as any);
    expect(getResponse.status).toBe(403);

    const putResponse = await worker.fetch(authedRequest('/api/config', 'sales-token', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { apiKey: 'secret' } }),
    }), env as any);
    expect(putResponse.status).toBe(403);
  });

  it('allows system admins to write shared config', async () => {
    const env = createEnv();
    env.DB.addUser({
      id: 'admin-1',
      username: 'admin',
      display_name: 'Admin',
      role: 'system_admin',
      department: '系统管理员',
      password_hash: 'unused',
      password_salt: 'unused',
      must_change_password: 0,
      is_active: 1,
    });
    await env.DB.addSession('admin-1', 'admin-token');

    const response = await worker.fetch(authedRequest('/api/config', 'admin-token', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { apiKey: 'secret' } }),
    }), env as any);

    expect(response.status).toBe(200);
    expect(env.DB.sharedConfig).toBeTruthy();
  });

  it('rejects active content uploads to the generic blob route', async () => {
    const env = createEnv();
    env.DB.addUser({
      id: 'lab-1',
      username: 'lab',
      display_name: 'Lab',
      role: 'lab_engineer',
      department: '测试部',
      password_hash: 'unused',
      password_salt: 'unused',
      must_change_password: 0,
      is_active: 1,
    });
    await env.DB.addSession('lab-1', 'lab-token');

    const response = await worker.fetch(authedRequest('/api/blob/spectrum/payload.html', 'lab-token', {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<script>fetch("/api/config")</script>',
    }), env as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_blob_type' });
  });

  it('serves existing unsafe blob metadata as an attachment', async () => {
    const env = createEnv();
    env.DB.addUser({
      id: 'lab-1',
      username: 'lab',
      display_name: 'Lab',
      role: 'lab_engineer',
      department: '测试部',
      password_hash: 'unused',
      password_salt: 'unused',
      must_change_password: 0,
      is_active: 1,
    });
    await env.DB.addSession('lab-1', 'lab-token');
    await env.FILES.put('spectrum/payload.html', '<script>alert(1)</script>', {
      httpMetadata: { contentType: 'text/html' },
    });

    const response = await worker.fetch(authedRequest('/api/blob/spectrum/payload.html', 'lab-token'), env as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="payload.html"; filename*=UTF-8\'\'payload.html');
  });

  it('locks login attempts after repeated failures', async () => {
    const env = createEnv();
    const salt = 'test-salt';
    env.DB.addUser({
      id: 'user-1',
      username: 'operator',
      display_name: 'Operator',
      role: 'warehouse_manager',
      department: '生产部主管',
      password_hash: await hashPassword('correct-password', salt),
      password_salt: salt,
      must_change_password: 0,
      is_active: 1,
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await worker.fetch(new Request('https://api.example/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
        body: JSON.stringify({ username: 'operator', password: 'wrong-password' }),
      }), env as any);
      expect(response.status).toBe(401);
    }

    const lockedResponse = await worker.fetch(new Request('https://api.example/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
      body: JSON.stringify({ username: 'operator', password: 'correct-password' }),
    }), env as any);

    expect(lockedResponse.status).toBe(429);
  });

  async function authenticatedEnv(mustChangePassword = 0) {
    const env = createEnv();
    env.DB.addUser({ id: 'admin-1', username: 'admin', display_name: 'Admin', department: '系统管理员',
      password_hash: await hashPassword('old-password', 'salt'), password_salt: 'salt', must_change_password: mustChangePassword, is_active: 1 });
    await env.DB.addSession('admin-1', 'token');
    return env;
  }

  it.each([
    ['/balance', 'GET'],
  ])('proxies APIMart %s with Bearer auth and correct method', async (path, method) => {
    const env = await authenticatedEnv();
    const upstream = vi.fn(async () => jsonResponse({ code: 200, data: [{ task_id: 'task_123' }] }));
    vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(authedRequest('/api/apimart/request', 'token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.apimart.ai/v1', path, method, apiKey: 'test-key', payload: { prompt: 'test' } }),
    }), env as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstream).toHaveBeenCalledWith(`https://api.apimart.ai/v1${path}`, expect.objectContaining({
      method, headers: expect.objectContaining({ authorization: 'Bearer test-key' }), redirect: 'error',
    }));
    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe(method === 'GET' ? undefined : JSON.stringify({ prompt: 'test' }));
  });

  it.each([
    { baseUrl: 'https://evil.example/v1' }, { path: '/tasks/../balance' },
    { path: '/tasks/task_1?redirect=evil' }, { path: '/balance', method: 'POST' },
    { apiKey: '' }, { apiKey: 'key\r\nInjected: value' }, { payload: [] },
  ])('rejects invalid APIMart proxy input %j before upstream fetch', async (override) => {
    const env = await authenticatedEnv();
    const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(authedRequest('/api/apimart/request', 'token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.apimart.ai/v1', path: '/images/generations', method: 'POST', apiKey: 'test-key', payload: {}, ...override }),
    }), env as any);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('requires an authenticated APIMart session', async () => {
    const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(authedRequest('/api/apimart/request', 'unknown', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }), createEnv() as any);
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects cross-site writes before any database or object changes', async () => {
    const env = await authenticatedEnv();
    const response = await worker.fetch(authedRequest('/api/state/key', 'token', {
      method: 'PUT', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'attacker' }),
    }), env as any);
    expect(response.status).toBe(403);
    expect(env.DB.appState.size).toBe(0);
  });

  it.each(['GET', 'PUT', 'DELETE'])('blocks internal user state keys via %s', async (method) => {
    const env = await authenticatedEnv();
    env.DB.appState.set('users/victim/openrouter-ai-chat-v1', '"private"');
    const response = await worker.fetch(authedRequest('/api/state/users%2Fvictim%2Fopenrouter-ai-chat-v1', 'token', {
      method, ...(method === 'PUT' ? { headers: { 'content-type': 'application/json' }, body: '{"value":"changed"}' } : {}),
    }), env as any);
    expect(response.status).toBe(400);
    expect(env.DB.appState.get('users/victim/openrouter-ai-chat-v1')).toBe('"private"');
  });

  it.each(['avatars/victim', 'data-recognition/victim%2Fimage.png', 'spectrum%2F..%2Favatars/victim'])('blocks reserved blob namespace %s', async (path) => {
    const env = await authenticatedEnv();
    const response = await worker.fetch(authedRequest(`/api/blob/${path}`, 'token'), env as any);
    expect(response.status).toBe(400);
  });

  it.each(['/api/users', '/api/profile/avatar'])('requires initial password change for %s', async (path) => {
    const env = await authenticatedEnv(1);
    const response = await worker.fetch(authedRequest(path, 'token'), env as any);
    expect(response.status).toBe(403);
  });

  it.each(['null', '[]', '{'])('returns a controlled client error for invalid JSON: %s', async (body) => {
    const response = await worker.fetch(new Request('https://api.example/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), createEnv() as any);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects non-string login credentials instead of throwing', async () => {
    const response = await worker.fetch(new Request('https://api.example/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username":{},"password":[]}',
    }), createEnv() as any);
    expect(response.status).toBe(400);
  });

  it('treats malformed cookie encoding as unauthenticated', async () => {
    const response = await worker.fetch(new Request('https://api.example/api/auth/me', {
      headers: { cookie: 'gjh_session=%ZZ' },
    }), createEnv() as any);
    expect(response.status).toBe(401);
  });

  it('revokes other sessions after password changes', async () => {
    const env = await authenticatedEnv();
    await env.DB.addSession('admin-1', 'other-token');
    const response = await worker.fetch(authedRequest('/api/auth/change-password', 'token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password', nextPassword: 'new-password' }),
    }), env as any);
    expect(response.status).toBe(200);
    expect(env.DB.sessions.has(await sha256('token'))).toBe(true);
    expect(env.DB.sessions.has(await sha256('other-token'))).toBe(false);
  });

});

const jsonResponse = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    'content-type': 'application/json',
    ...(init.headers || {}),
  },
});
