import { describe, expect, it } from 'vitest';
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

describe('worker security controls', () => {
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

    const response = await worker.fetch(authedRequest('/api/blob/reports/payload.html', 'lab-token', {
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
    await env.FILES.put('reports/payload.html', '<script>alert(1)</script>', {
      httpMetadata: { contentType: 'text/html' },
    });

    const response = await worker.fetch(authedRequest('/api/blob/reports/payload.html', 'lab-token'), env as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="payload.html"');
  });

  it('keeps production and formula state shared across users', async () => {
    const env = createEnv();
    env.DB.addUser({
      id: 'prod-1',
      username: 'prod',
      display_name: 'Production',
      role: 'warehouse_manager',
      department: '生产部',
      password_hash: 'unused',
      password_salt: 'unused',
      must_change_password: 0,
      is_active: 1,
    });
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
    await env.DB.addSession('prod-1', 'prod-token');
    await env.DB.addSession('admin-1', 'admin-token');

    const writeResponse = await worker.fetch(authedRequest('/api/state/gjh-formula-recipes-v1', 'prod-token', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify([{ id: 'FM-REAL', name: '真实配方' }]) }),
    }), env as any);
    expect(writeResponse.status).toBe(200);

    const readResponse = await worker.fetch(authedRequest('/api/state/gjh-formula-recipes-v1', 'admin-token'), env as any);
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual({
      value: JSON.stringify([{ id: 'FM-REAL', name: '真实配方' }]),
    });
    expect([...env.DB.appState.keys()]).toEqual(['gjh-formula-recipes-v1']);
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

  it('stores data recognition history in D1 and the image in R2', async () => {
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

    const createResponse = await worker.fetch(authedRequest('/api/data-recognition/history', 'lab-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'sample.png',
        imageDataUrl: 'data:image/png;base64,aGVsbG8=',
        model: 'vision-model',
        rowCount: 1,
        modelCode: '320G6',
        batchCode: 'B605204',
        result: { fields: ['型号', '批次'], rows: [{ 型号: '320G6', 批次: 'B605204' }] },
        rawText: '[{"型号":"320G6","批次":"B605204"}]',
      }),
    }), env as any);

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: string };
    expect(env.DB.dataRecognitionRecords.size).toBe(1);
    expect(env.FILES.objects.size).toBe(1);

    const listResponse = await worker.fetch(authedRequest('/api/data-recognition/history', 'lab-token'), env as any);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [{
        file_name: 'sample.png',
        model_code: '320G6 / B605204',
        batch_code: '',
        row_count: 1,
      }],
    });

    const detailResponse = await worker.fetch(authedRequest(`/api/data-recognition/history/${created.id}`, 'lab-token'), env as any);
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      item: {
        id: created.id,
        file_name: 'sample.png',
        model: 'vision-model',
        model_code: '320G6',
        batch_code: '',
        row_count: 1,
        result: { fields: ['型号', '批次'], rows: [{ 型号: '320G6', 批次: 'B605204' }] },
      },
    });

    const updateResponse = await worker.fetch(authedRequest(`/api/data-recognition/history/${created.id}`, 'lab-token', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rowCount: 2,
        result: {
          fields: ['型号', '批次'],
          rows: [
            { 型号: '320G6', 批次: 'B605204' },
            { 型号: '330G6', 批次: 'A605213' },
          ],
        },
        rawText: 'updated',
      }),
    }), env as any);
    expect(updateResponse.status).toBe(200);

    const updatedListResponse = await worker.fetch(authedRequest('/api/data-recognition/history', 'lab-token'), env as any);
    expect(updatedListResponse.status).toBe(200);
    await expect(updatedListResponse.json()).resolves.toMatchObject({
      items: [{
        model_code: '320G6 / B605204、330G6 / A605213',
        batch_code: '',
        row_count: 2,
      }],
    });

    const imageResponse = await worker.fetch(authedRequest(`/api/data-recognition/history/${created.id}/image`, 'lab-token'), env as any);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get('content-type')).toBe('image/png');
  });

});
