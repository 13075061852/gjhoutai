export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  CORS_ORIGINS?: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
  CONFIG_ENCRYPTION_KEY?: string;
}

type LegacyRole = 'system_admin' | 'sales_manager' | 'lab_engineer' | 'warehouse_manager';
type Department = '系统管理员' | '研发部' | '测试部' | '销售部' | '生产部' | '生产部主管';
type Permission = 'state:read' | 'state:write' | 'blob:read' | 'blob:write' | 'config:read' | 'config:write' | 'users:manage';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role?: LegacyRole;
  department?: Department;
  password_hash: string;
  password_salt: string;
  must_change_password: number;
  is_active: number;
}

interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  department: Department;
  mustChangePassword: boolean;
}

const SESSION_COOKIE = 'gjh_session';
const SESSION_MARKER_COOKIE = 'gjh_session_present';
const SESSION_DAYS = 7;
const PASSWORD_ITERATIONS = 100_000;
const CONFIG_ALGORITHM = 'AES-GCM';
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const SAFE_BLOB_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DATA_RECOGNITION_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DATA_RECOGNITION_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const INSPECTION_REPORT_MAX_PDF_BYTES = 50 * 1024 * 1024;
const LIBLIBAI_ORIGIN = 'https://openapi.liblibai.cloud';
const LIBLIBAI_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const LIBLIBAI_ALLOWED_PATHS = new Set([
  '/api/generate/status',
  '/api/generate/seedreamV4',
  '/api/generate/kontext/text2img',
  '/api/generate/kontext/img2img',
  '/api/generate/smart-img1/generate',
  '/api/generate/libDream',
  '/api/generate/libEdit',
  '/api/generate/libEditV2',
  '/api/generate/webui/text2img/ultra',
  '/api/generate/webui/img2img/ultra',
  '/api/generate/webui/text2img',
  '/api/generate/video/kling/text2video',
  '/api/generate/video/kling/img2video',
  '/api/generate/video/kling/multiImg2video',
  '/api/generate/video/kling/omni-video',
]);

const LEGACY_ROLE_DEPARTMENTS: Record<LegacyRole, Department> = {
  system_admin: '系统管理员',
  sales_manager: '销售部',
  lab_engineer: '测试部',
  warehouse_manager: '生产部主管',
};
const DEPARTMENT_LEGACY_ROLES: Record<Department, LegacyRole> = {
  系统管理员: 'system_admin',
  研发部: 'system_admin',
  测试部: 'lab_engineer',
  销售部: 'sales_manager',
  生产部: 'warehouse_manager',
  生产部主管: 'warehouse_manager',
};
const DEPARTMENT_PERMISSIONS: Record<Department, Permission[]> = {
  系统管理员: ['state:read', 'state:write', 'blob:read', 'blob:write', 'config:read', 'config:write', 'users:manage'],
  研发部: ['state:read', 'state:write', 'blob:read', 'blob:write'],
  测试部: ['state:read', 'state:write', 'blob:read', 'blob:write'],
  销售部: ['state:read', 'state:write', 'blob:read'],
  生产部: ['state:read', 'state:write', 'blob:read'],
  生产部主管: ['state:read', 'state:write', 'blob:read'],
};

const json = (value: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json;charset=utf-8');
  return new Response(JSON.stringify(value), { ...init, headers });
};
const nowIso = () => new Date().toISOString();
const randomId = () => crypto.randomUUID();
const notFound = () => json({ error: 'not_found' }, { status: 404 });
const unauthorized = () => json({ error: 'unauthorized' }, { status: 401 });
const forbidden = () => json({ error: 'forbidden' }, { status: 403 });
const badRequest = (error: string) => json({ error }, { status: 400 });
const tooManyRequests = () => json({ error: 'too_many_login_attempts' }, { status: 429 });
const getBlobKey = (namespace: string, key: string) => `${namespace}/${key}`;
const normalizeContentType = (contentType: string) => contentType.split(';')[0].trim().toLowerCase();
const getSafeBlobContentType = (contentType: string | undefined | null) => {
  const normalized = normalizeContentType(contentType || '');
  return SAFE_BLOB_CONTENT_TYPES.has(normalized) ? normalized : 'application/octet-stream';
};
const getAttachmentFileName = (key: string) => {
  const fileName = key.split('/').filter(Boolean).pop() || 'download';
  return fileName.replace(/[\\\r\n"]/g, '_');
};
const getSafeFileName = (value: unknown, fallback = 'download') => {
  const fileName = String(value || fallback).trim() || fallback;
  return fileName.replace(/[\\/\r\n"]/g, '_').slice(0, 180);
};
const getImageExtension = (contentType: string) => ({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}[contentType] || 'bin');
const parseDataUrlImage = (dataUrl: unknown) => {
  const text = String(dataUrl || '');
  const match = text.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const contentType = normalizeContentType(match[1]);
  if (!DATA_RECOGNITION_IMAGE_TYPES.has(contentType)) return null;
  const bytes = base64ToBytes(match[2].replace(/\s+/g, ''));
  if (!bytes.byteLength || bytes.byteLength > DATA_RECOGNITION_MAX_IMAGE_BYTES) return null;
  return { contentType, bytes };
};
const getRecognitionRows = (result: unknown) => {
  if (!result || typeof result !== 'object') return [];
  const rows = Array.isArray((result as any).rows) ? (result as any).rows : [];
  return rows.filter((row: unknown) => row && typeof row === 'object');
};
const getRecognitionSummary = (resultJson: string) => {
  try {
    const rows = getRecognitionRows(JSON.parse(resultJson));
    const pairs: string[] = [];
    const seen = new Set<string>();
    rows.forEach((row: any) => {
      const modelCode = String(row?.型号 || '').trim();
      const batchCode = String(row?.批次 || '').trim();
      const pair = [modelCode, batchCode].filter(Boolean).join(' / ');
      if (!pair || seen.has(pair)) return;
      seen.add(pair);
      pairs.push(pair);
    });
    const modelCodes = [...new Set(rows.map((row: any) => String(row?.型号 || '').trim()).filter(Boolean))];
    const batchCodes = [...new Set(rows.map((row: any) => String(row?.批次 || '').trim()).filter(Boolean))];
    return {
      modelCode: pairs.join('、') || modelCodes.join('、'),
      batchCode: pairs.length ? '' : batchCodes.join('、'),
    };
  } catch {
    return { modelCode: '', batchCode: '' };
  }
};
const normalizeSummaryText = (value: unknown) => String(value || '').trim().slice(0, 500);
const USER_SCOPED_STATE_KEYS = new Set([
  'sidebar-active-page',
  'sidebar-recent-pages',
  'openrouter-ai-chat-v1',
  'openrouter-ai-chat-sessions-v1',
  'openrouter-ai-chat-active-session-v1',
  'openrouter-ai-chat-data-attachment-v1',
  'openrouter-ai-chat-search-enabled-v1',
]);
const GLOBAL_AI_CALL_LOG_KEY = 'openrouter-ai-call-log-v1';
const MAX_AI_CALL_LOGS = 500;
const getStateStorageKey = (user: SessionUser, key: string) => USER_SCOPED_STATE_KEYS.has(key)
  ? `users/${user.id}/${key}`
  : key;
const normalizeAiCallLogValue = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
const mergeAiCallLogs = (currentValue: unknown, nextValue: unknown, user: SessionUser) => {
  const currentLogs = normalizeAiCallLogValue(currentValue);
  const nextLogs = normalizeAiCallLogValue(nextValue).map((item) => item && typeof item === 'object' ? {
    ...item,
    actorUserId: (item as any).actorUserId || user.id,
    actorUsername: (item as any).actorUsername || user.username,
    actorDisplayName: (item as any).actorDisplayName || user.displayName,
    actorDepartment: (item as any).actorDepartment || user.department,
  } : item);
  const merged = [...nextLogs, ...currentLogs].filter((item) => item && typeof item === 'object');
  const seen = new Set<string>();
  return merged.filter((item: any) => {
    const id = String(item?.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((left: any, right: any) => String(right?.at || right?.endedAt || '').localeCompare(String(left?.at || left?.endedAt || '')))
    .slice(0, MAX_AI_CALL_LOGS);
};

const getAllowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const configured = (env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : null;
};

const withCors = (request: Request, env: Env, response: Response) => {
  const headers = new Headers(response.headers);
  const allowedOrigin = getAllowedOrigin(request, env);
  if (allowedOrigin) {
    headers.set('access-control-allow-origin', allowedOrigin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('vary', 'origin');
  }
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
};

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const randomHex = (size: number) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};
const sha256 = async (value: string) => bytesToHex(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
));
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const bytesToBase64Url = (bytes: Uint8Array) => bytesToBase64(bytes)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const createLiblibSignature = async (
  path: string,
  secretKey: string,
  timestamp: string,
  nonce: string,
) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${path}&${timestamp}&${nonce}`),
  );
  return bytesToBase64Url(new Uint8Array(signature));
};
const createLiblibSignedUrl = async (path: string, accessKey: string, secretKey: string) => {
  const timestamp = String(Date.now());
  const nonce = randomHex(8);
  const signature = await createLiblibSignature(path, secretKey, timestamp, nonce);
  const query = new URLSearchParams({
    AccessKey: accessKey,
    Signature: signature,
    Timestamp: timestamp,
    SignatureNonce: nonce,
  });
  return `${LIBLIBAI_ORIGIN}${path}?${query.toString()}`;
};
const getConfigKey = async (env: Env) => {
  if (!env.CONFIG_ENCRYPTION_KEY) throw new Error('missing_config_encryption_key');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.CONFIG_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw', digest, CONFIG_ALGORITHM, false, ['encrypt', 'decrypt']);
};
const encryptConfig = async (env: Env, value: unknown) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: CONFIG_ALGORITHM, iv }, await getConfigKey(env), plaintext);
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
};
const decryptConfig = async (env: Env, ciphertext: string, iv: string) => {
  const plaintext = await crypto.subtle.decrypt(
    { name: CONFIG_ALGORITHM, iv: base64ToBytes(iv) },
    await getConfigKey(env),
    base64ToBytes(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
};
const hashPassword = async (password: string, salt = randomHex(16)) => {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256,
  );
  return { salt, hash: bytesToHex(new Uint8Array(bits)) };
};
const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};
const parseCookies = (request: Request) => Object.fromEntries(
  (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator === -1 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }),
);
const getCookieAttributes = (request: Request) => {
  const isSecure = new URL(request.url).protocol === 'https:';
  return `${isSecure ? 'Secure; SameSite=None' : 'SameSite=Lax'}`;
};
const appendSessionCookie = (request: Request, headers: Headers, token: string, maxAgeSeconds: number) => {
  const attributes = getCookieAttributes(request);
  headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${attributes}; Max-Age=${maxAgeSeconds}`,
  );
  headers.append(
    'set-cookie',
    `${SESSION_MARKER_COOKIE}=1; Path=/; ${attributes}; Max-Age=${maxAgeSeconds}`,
  );
};
const clearSessionCookie = (request: Request, headers: Headers) => {
  const attributes = getCookieAttributes(request);
  headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; ${attributes}; Max-Age=0`,
  );
  headers.append(
    'set-cookie',
    `${SESSION_MARKER_COOKIE}=; Path=/; ${attributes}; Max-Age=0`,
  );
};
const audit = async (env: Env, actorUserId: string | null, action: string, targetType?: string, targetId?: string, metadata?: unknown) => {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(randomId(), actorUserId, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null).run();
};
const normalizeDepartment = (department: unknown, legacyRole?: unknown): Department => {
  const value = String(department || '').trim();
  if (value in DEPARTMENT_PERMISSIONS) return value as Department;
  const role = String(legacyRole || '') as LegacyRole;
  return LEGACY_ROLE_DEPARTMENTS[role] || '研发部';
};
const getLegacyRoleForDepartment = (department: Department): LegacyRole => DEPARTMENT_LEGACY_ROLES[department] || 'system_admin';
const can = (user: SessionUser, permission: Permission) => DEPARTMENT_PERMISSIONS[user.department]?.includes(permission);
const validatePassword = (password: string) => password.length >= 10 && password.length <= 128;
const getClientIp = (request: Request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
const getLoginRateLimitKeys = (request: Request, username: string) => [
  `user:${username.trim().toLowerCase()}`,
  `ip:${getClientIp(request)}`,
];
const isLoginRateLimited = async (env: Env, keys: string[]) => {
  if (!keys.length) return false;
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(',');
  const result = await env.DB.prepare(`
    SELECT locked_until FROM login_attempts
    WHERE identifier IN (${placeholders}) AND locked_until > ?${keys.length + 1}
  `).bind(...keys, nowIso()).all<{ locked_until: string }>();
  return Boolean(result.results?.length);
};
const recordLoginFailure = async (env: Env, keys: string[]) => {
  const updatedAt = nowIso();
  const windowStartedAt = new Date(Date.now() - LOGIN_WINDOW_SECONDS * 1000).toISOString();
  const lockedUntil = new Date(Date.now() + LOGIN_LOCK_SECONDS * 1000).toISOString();
  await Promise.all(keys.map(async (key) => {
    const current = await env.DB.prepare(
      'SELECT failures, updated_at FROM login_attempts WHERE identifier = ?1',
    ).bind(key).first<{ failures: number; updated_at: string }>();
    const failures = current && current.updated_at > windowStartedAt ? current.failures + 1 : 1;
    await env.DB.prepare(`
      INSERT INTO login_attempts (identifier, failures, locked_until, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(identifier) DO UPDATE SET
        failures = excluded.failures,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `).bind(key, failures, failures >= LOGIN_FAILURE_LIMIT ? lockedUntil : null, updatedAt).run();
  }));
};
const clearLoginFailures = async (env: Env, keys: string[]) => {
  if (!keys.length) return;
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(',');
  await env.DB.prepare(`DELETE FROM login_attempts WHERE identifier IN (${placeholders})`).bind(...keys).run();
};

const getSessionUser = async (request: Request, env: Env): Promise<SessionUser | null> => {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.department, u.must_change_password, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2
  `).bind(tokenHash, nowIso()).first<{
    id: string;
    username: string;
    display_name: string;
    role?: LegacyRole;
    department?: Department;
    must_change_password: number;
    is_active: number;
  }>();
  if (!row || !row.is_active) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?1').bind(tokenHash).run();
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    department: normalizeDepartment(row.department, row.role),
    mustChangePassword: Boolean(row.must_change_password),
  };
};

async function handleAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/auth/bootstrap' && request.method === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    if ((count?.count || 0) > 0) return forbidden();
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!env.BOOTSTRAP_ADMIN_TOKEN || !token || !constantTimeEqual(token, env.BOOTSTRAP_ADMIN_TOKEN)) return forbidden();
    const payload = await request.json<{ username?: string; displayName?: string; password?: string }>();
    if (!payload.username || !payload.displayName || !payload.password || !validatePassword(payload.password)) return badRequest('invalid_bootstrap_payload');
    const password = await hashPassword(payload.password);
    const id = randomId();
    await env.DB.prepare(`
      INSERT INTO users (id, username, display_name, role, department, password_hash, password_salt, must_change_password)
      VALUES (?1, ?2, ?3, 'system_admin', '系统管理员', ?4, ?5, 0)
    `).bind(id, payload.username, payload.displayName, password.hash, password.salt).run();
    await audit(env, id, 'auth.bootstrap_admin', 'user', id);
    return json({ ok: true });
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const payload = await request.json<{ username?: string; password?: string }>();
    if (!payload.username || !payload.password) return badRequest('missing_credentials');
    const rateLimitKeys = getLoginRateLimitKeys(request, payload.username);
    if (await isLoginRateLimited(env, rateLimitKeys)) return tooManyRequests();
    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?1').bind(payload.username).first<UserRow>();
    if (!user || !user.is_active) {
      await recordLoginFailure(env, rateLimitKeys);
      return unauthorized();
    }
    const candidate = await hashPassword(payload.password, user.password_salt);
    if (!constantTimeEqual(candidate.hash, user.password_hash)) {
      await recordLoginFailure(env, rateLimitKeys);
      return unauthorized();
    }
    await clearLoginFailures(env, rateLimitKeys);
    const rawToken = randomHex(32);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(randomId(), user.id, await sha256(rawToken), expiresAt).run();
    await env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?1').bind(user.id).run();
    await audit(env, user.id, 'auth.login', 'user', user.id);
    const headers = new Headers();
    appendSessionCookie(request, headers, rawToken, SESSION_DAYS * 24 * 60 * 60);
    const department = normalizeDepartment(user.department, user.role);
    return json({ user: { id: user.id, username: user.username, displayName: user.display_name, department, mustChangePassword: Boolean(user.must_change_password) } }, { headers });
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const token = parseCookies(request)[SESSION_COOKIE];
    const headers = new Headers();
    clearSessionCookie(request, headers);
    if (token) {
      const tokenHash = await sha256(token);
      const user = await getSessionUser(request, env);
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
      if (user) await audit(env, user.id, 'auth.logout', 'user', user.id);
    }
    return json({ ok: true }, { headers });
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const user = await getSessionUser(request, env);
    return user ? json({ user }) : unauthorized();
  }
  if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
    const user = await getSessionUser(request, env);
    if (!user) return unauthorized();
    const payload = await request.json<{ currentPassword?: string; nextPassword?: string }>();
    if (!payload.currentPassword || !payload.nextPassword || !validatePassword(payload.nextPassword)) return badRequest('invalid_password_payload');
    const row = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?1').bind(user.id).first<{ password_hash: string; password_salt: string }>();
    if (!row) return unauthorized();
    const current = await hashPassword(payload.currentPassword, row.password_salt);
    if (!constantTimeEqual(current.hash, row.password_hash)) return unauthorized();
    const next = await hashPassword(payload.nextPassword);
    await env.DB.prepare(`
      UPDATE users
      SET password_hash = ?1, password_salt = ?2, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?3
    `).bind(next.hash, next.salt, user.id).run();
    await audit(env, user.id, 'auth.change_password', 'user', user.id);
    return json({ ok: true });
  }
  return null;
}

async function handleUsers(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/users')) return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (!can(user, 'users:manage')) return forbidden();
  if (url.pathname === '/api/users' && request.method === 'GET') {
    const rows = await env.DB.prepare(`
      SELECT id, username, display_name, role, department, must_change_password, is_active, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `).all();
    return json({
      users: (rows.results || []).map((row: any) => ({
        ...row,
        department: normalizeDepartment(row.department, row.role),
      })),
    });
  }
  if (url.pathname === '/api/users' && request.method === 'POST') {
    const payload = await request.json<{ username?: string; displayName?: string; department?: Department; role?: LegacyRole; password?: string }>();
    const department = normalizeDepartment(payload.department, payload.role);
    if (!payload.username || !payload.displayName || !payload.password) return badRequest('invalid_user_payload');
    if (!(department in DEPARTMENT_PERMISSIONS) || !validatePassword(payload.password)) return badRequest('invalid_user_payload');
    const password = await hashPassword(payload.password);
    const id = randomId();
    await env.DB.prepare(`
      INSERT INTO users (id, username, display_name, role, department, password_hash, password_salt)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(id, payload.username, payload.displayName, getLegacyRoleForDepartment(department), department, password.hash, password.salt).run();
    await audit(env, user.id, 'users.create', 'user', id, { department });
    return json({ ok: true, id }, { status: 201 });
  }
  if (url.pathname.startsWith('/api/users/') && request.method === 'PUT') {
    const targetUserId = decodeURIComponent(url.pathname.slice('/api/users/'.length));
    const payload = await request.json<{ username?: string; displayName?: string; department?: Department; role?: LegacyRole; password?: string }>();
    const department = normalizeDepartment(payload.department, payload.role);
    if (!targetUserId || !(department in DEPARTMENT_PERMISSIONS)) return badRequest('invalid_user_payload');
    const username = payload.username?.trim();
    if (payload.password && !validatePassword(payload.password)) return badRequest('invalid_password_payload');
    const password = payload.password ? await hashPassword(payload.password) : null;
    await env.DB.prepare(`
      UPDATE users
      SET username = COALESCE(?1, username),
          display_name = COALESCE(?2, display_name),
          role = ?3,
          department = ?4,
          password_hash = COALESCE(?5, password_hash),
          password_salt = COALESCE(?6, password_salt),
          must_change_password = CASE
            WHEN ?5 IS NULL THEN must_change_password
            WHEN id = ?7 THEN 0
            ELSE 1
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?7
    `).bind(username || null, payload.displayName || null, getLegacyRoleForDepartment(department), department, password?.hash || null, password?.salt || null, targetUserId).run();
    await audit(env, user.id, 'users.update', 'user', targetUserId, { username: username || undefined, department, passwordReset: Boolean(password) });
    return json({ ok: true });
  }
  return notFound();
}

async function handleProfile(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/profile/avatar') return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const objectKey = `avatars/${user.id}`;

  if (request.method === 'GET') {
    const object = await env.FILES.get(objectKey);
    if (!object) return new Response(null, { status: 204 });
    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
        etag: object.httpEtag,
      },
    });
  }

  if (request.method === 'PUT') {
    const contentType = request.headers.get('content-type') || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return badRequest('invalid_avatar_type');
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > 2 * 1024 * 1024) return badRequest('invalid_avatar_size');
    await env.FILES.put(objectKey, body, { httpMetadata: { contentType } });
    await audit(env, user.id, 'profile.avatar_update', 'user', user.id);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    await env.FILES.delete(objectKey);
    await audit(env, user.id, 'profile.avatar_delete', 'user', user.id);
    return json({ ok: true });
  }

  return notFound();
}

async function handleConfig(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/config') return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (user.mustChangePassword) return forbidden();

  if (request.method === 'GET') {
    if (!can(user, 'config:read')) return forbidden();
    const row = await env.DB.prepare(
      'SELECT ciphertext, iv FROM shared_config WHERE id = 1',
    ).first<{ ciphertext: string; iv: string }>();
    if (!row) return json({ value: null });
    try {
      return json({ value: await decryptConfig(env, row.ciphertext, row.iv) });
    } catch {
      return json({ error: 'config_decrypt_failed' }, { status: 500 });
    }
  }

  if (request.method === 'PUT') {
    if (!can(user, 'config:write')) return forbidden();
    const payload = await request.json<{ value?: unknown }>();
    if (!Object.prototype.hasOwnProperty.call(payload, 'value')) return badRequest('invalid_config_payload');
    const encrypted = await encryptConfig(env, payload.value);
    await env.DB.prepare(`
      INSERT INTO shared_config (id, ciphertext, iv, updated_at)
      VALUES (1, ?1, ?2, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        updated_at = CURRENT_TIMESTAMP
    `).bind(encrypted.ciphertext, encrypted.iv).run();
    await audit(env, user.id, 'config.write', 'shared_config', 'global');
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    if (!can(user, 'config:write')) return forbidden();
    await env.DB.prepare('DELETE FROM shared_config WHERE id = 1').run();
    await audit(env, user.id, 'config.delete', 'shared_config', 'global');
    return json({ ok: true });
  }

  return notFound();
}

async function handleLiblibAiProxy(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/liblibai/request') return null;
  if (request.method !== 'POST') return notFound();

  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (user.mustChangePassword) return forbidden();

  let payload: {
    baseUrl?: unknown;
    path?: unknown;
    accessKey?: unknown;
    secretKey?: unknown;
    payload?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return badRequest('invalid_liblib_payload');
  }

  const baseUrl = String(payload.baseUrl || '').replace(/\/+$/, '');
  const path = String(payload.path || '');
  const accessKey = String(payload.accessKey || '').trim();
  const secretKey = String(payload.secretKey || '').trim();
  if (baseUrl !== LIBLIBAI_ORIGIN) return badRequest('invalid_liblib_origin');
  if (!LIBLIBAI_ALLOWED_PATHS.has(path)) return badRequest('invalid_liblib_path');
  if (!accessKey || accessKey.length > 256 || !secretKey || secretKey.length > 512) {
    return badRequest('invalid_liblib_credentials');
  }
  if (!payload.payload || typeof payload.payload !== 'object' || Array.isArray(payload.payload)) {
    return badRequest('invalid_liblib_payload');
  }

  const upstreamBody = JSON.stringify(payload.payload);
  if (new TextEncoder().encode(upstreamBody).byteLength > LIBLIBAI_MAX_PAYLOAD_BYTES) {
    return badRequest('liblib_payload_too_large');
  }

  const upstream = await fetch(await createLiblibSignedUrl(path, accessKey, secretKey), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: upstreamBody,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json;charset=utf-8',
    },
  });
}

async function handleDataRecognitionHistory(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/data-recognition/history')) return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (user.mustChangePassword) return forbidden();

  const prefix = '/api/data-recognition/history';
  const suffix = url.pathname.slice(prefix.length).replace(/^\/+/, '');
  const parts = suffix ? suffix.split('/').map((part) => decodeURIComponent(part)) : [];
  const id = parts[0] || '';
  const isImageRoute = parts[1] === 'image';

  if (!id && request.method === 'GET') {
    if (!can(user, 'state:read')) return forbidden();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 40), 1), 100);
    const rows = await env.DB.prepare(`
      SELECT id, file_name, image_content_type, model, model_code, batch_code, row_count, result_json, created_at
      FROM data_recognition_records
      WHERE created_by = ?1
      ORDER BY created_at DESC
      LIMIT ?2
    `).bind(user.id, limit).all();
    return json({
      items: (rows.results || []).map((row: any) => {
        const summary = getRecognitionSummary(String(row.result_json || ''));
        const { result_json: _resultJson, ...item } = row;
        return {
          ...item,
          model_code: summary.modelCode || row.model_code || '',
          batch_code: summary.modelCode ? summary.batchCode : (summary.batchCode || row.batch_code || ''),
        };
      }),
    });
  }

  if (!id && request.method === 'POST') {
    if (!can(user, 'state:write') || !can(user, 'blob:write')) return forbidden();
    const payload = await request.json<{
      fileName?: string;
      imageDataUrl?: string;
      model?: string;
      rowCount?: number;
      result?: unknown;
      rawText?: string;
      modelCode?: string;
      batchCode?: string;
    }>();
    const image = parseDataUrlImage(payload.imageDataUrl);
    if (!image) return badRequest('invalid_image');
    if (!payload.result || typeof payload.result !== 'object') return badRequest('invalid_result');

    const id = randomId();
    const fileName = String(payload.fileName || '识别图片').slice(0, 180);
    const rowCount = Math.max(0, Math.min(Number(payload.rowCount || 0), 100000));
    const summary = getRecognitionSummary(JSON.stringify(payload.result));
    const modelCode = normalizeSummaryText(payload.modelCode) || summary.modelCode;
    const batchCode = normalizeSummaryText(payload.batchCode) || summary.batchCode;
    const imageKey = `data-recognition/${user.id}/${id}.${getImageExtension(image.contentType)}`;
    await env.FILES.put(imageKey, image.bytes, { httpMetadata: { contentType: image.contentType } });
    await env.DB.prepare(`
      INSERT INTO data_recognition_records (
        id, created_by, file_name, image_key, image_content_type, model, model_code, batch_code, row_count, result_json, raw_text
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `).bind(
      id,
      user.id,
      fileName,
      imageKey,
      image.contentType,
      String(payload.model || '').slice(0, 200) || null,
      modelCode || null,
      batchCode || null,
      rowCount,
      JSON.stringify(payload.result),
      String(payload.rawText || '').slice(0, 200000) || null,
    ).run();
    await audit(env, user.id, 'data_recognition.create', 'data_recognition_record', id, { fileName, rowCount, modelCode, batchCode });
    return json({ ok: true, id }, { status: 201 });
  }

  if (!id) return notFound();

  const row = await env.DB.prepare(`
    SELECT id, created_by, file_name, image_key, image_content_type, model, model_code, batch_code, row_count, result_json, raw_text, created_at
    FROM data_recognition_records
    WHERE id = ?1 AND created_by = ?2
  `).bind(id, user.id).first<{
    id: string;
    file_name: string;
    image_key: string;
    image_content_type: string;
    model?: string | null;
    model_code?: string | null;
    batch_code?: string | null;
    row_count: number;
    result_json: string;
    raw_text?: string | null;
    created_at: string;
  }>();
  if (!row) return notFound();

  if (request.method === 'GET' && isImageRoute) {
    if (!can(user, 'blob:read')) return forbidden();
    const object = await env.FILES.get(row.image_key);
    if (!object) return new Response(null, { status: 204 });
    return new Response(object.body, {
      headers: {
        'content-type': getSafeBlobContentType(object.httpMetadata?.contentType || row.image_content_type),
        etag: object.httpEtag,
      },
    });
  }

  if (request.method === 'GET') {
    if (!can(user, 'state:read')) return forbidden();
    return json({
      item: {
        id: row.id,
        file_name: row.file_name,
        image_content_type: row.image_content_type,
        model: row.model,
        model_code: row.model_code || getRecognitionSummary(row.result_json).modelCode,
        batch_code: getRecognitionSummary(row.result_json).modelCode ? getRecognitionSummary(row.result_json).batchCode : (row.batch_code || getRecognitionSummary(row.result_json).batchCode),
        row_count: row.row_count,
        result: JSON.parse(row.result_json),
        raw_text: row.raw_text || '',
        created_at: row.created_at,
      },
    });
  }

  if (request.method === 'PUT') {
    if (!can(user, 'state:write')) return forbidden();
    const payload = await request.json<{
      result?: unknown;
      rawText?: string;
      rowCount?: number;
      modelCode?: string;
      batchCode?: string;
    }>();
    if (!payload.result || typeof payload.result !== 'object') return badRequest('invalid_result');
    const resultJson = JSON.stringify(payload.result);
    const summary = getRecognitionSummary(resultJson);
    const modelCode = normalizeSummaryText(payload.modelCode) || summary.modelCode;
    const batchCode = normalizeSummaryText(payload.batchCode) || summary.batchCode;
    const rowCount = Math.max(0, Math.min(Number(payload.rowCount || 0), 100000));
    await env.DB.prepare(`
      UPDATE data_recognition_records
      SET model_code = ?1,
          batch_code = ?2,
          row_count = ?3,
          result_json = ?4,
          raw_text = ?5
      WHERE id = ?6 AND created_by = ?7
    `).bind(
      modelCode || null,
      batchCode || null,
      rowCount,
      resultJson,
      String(payload.rawText || '').slice(0, 200000) || null,
      id,
      user.id,
    ).run();
    await audit(env, user.id, 'data_recognition.update', 'data_recognition_record', id, { rowCount, modelCode, batchCode });
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    if (!can(user, 'state:write') || !can(user, 'blob:write')) return forbidden();
    await env.FILES.delete(row.image_key);
    await env.DB.prepare('DELETE FROM data_recognition_records WHERE id = ?1 AND created_by = ?2').bind(id, user.id).run();
    await audit(env, user.id, 'data_recognition.delete', 'data_recognition_record', id);
    return json({ ok: true });
  }

  return notFound();
}

async function handleInspectionReports(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/inspection-reports')) return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (user.mustChangePassword) return forbidden();

  const prefix = '/api/inspection-reports';
  const suffix = url.pathname.slice(prefix.length).replace(/^\/+/, '');
  const parts = suffix ? suffix.split('/').map((part) => decodeURIComponent(part)) : [];
  const id = parts[0] || '';
  const isFileRoute = parts[1] === 'file';

  if (!id && request.method === 'GET') {
    if (!can(user, 'state:read')) return forbidden();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 200);
    const rows = await env.DB.prepare(`
      SELECT r.id, r.file_name, r.file_size, r.title, r.category, r.notes, r.created_at,
             u.display_name AS created_by_name
      FROM inspection_reports r
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.created_at DESC
      LIMIT ?1
    `).bind(limit).all();
    return json({ items: rows.results || [] });
  }

  if (!id && request.method === 'POST') {
    if (!can(user, 'state:write') || !can(user, 'blob:write')) return forbidden();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return badRequest('missing_pdf');
    const contentType = normalizeContentType(file.type || 'application/pdf');
    if (contentType !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
      return badRequest('invalid_pdf_type');
    }
    if (file.size <= 0 || file.size > INSPECTION_REPORT_MAX_PDF_BYTES) return badRequest('invalid_pdf_size');

    const id = randomId();
    const fileName = getSafeFileName(file.name || '检测报告.pdf', '检测报告.pdf');
    const title = normalizeSummaryText(form.get('title')) || fileName.replace(/\.pdf$/i, '');
    const category = normalizeSummaryText(form.get('category'));
    const notes = normalizeSummaryText(form.get('notes'));
    const fileKey = `inspection-reports/${id}.pdf`;
    await env.FILES.put(fileKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: 'application/pdf' },
    });
    await env.DB.prepare(`
      INSERT INTO inspection_reports (id, created_by, file_name, file_key, file_size, title, category, notes)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(id, user.id, fileName, fileKey, file.size, title, category || null, notes || null).run();
    await audit(env, user.id, 'inspection_report.create', 'inspection_report', id, { fileName, title, category });
    return json({ ok: true, id }, { status: 201 });
  }

  if (!id) return notFound();

  const row = await env.DB.prepare(`
    SELECT id, created_by, file_name, file_key, file_size, title, category, notes, created_at
    FROM inspection_reports
    WHERE id = ?1
  `).bind(id).first<{
    id: string;
    created_by: string;
    file_name: string;
    file_key: string;
    file_size: number;
    title: string;
    category?: string | null;
    notes?: string | null;
    created_at: string;
  }>();
  if (!row) return notFound();

  if (request.method === 'GET' && isFileRoute) {
    if (!can(user, 'blob:read')) return forbidden();
    const object = await env.FILES.get(row.file_key);
    if (!object) return new Response(null, { status: 204 });
    return new Response(object.body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${getSafeFileName(row.file_name, 'report.pdf')}"`,
        etag: object.httpEtag,
      },
    });
  }

  if (request.method === 'DELETE') {
    if (!can(user, 'state:write') || !can(user, 'blob:write')) return forbidden();
    await env.FILES.delete(row.file_key);
    await env.DB.prepare('DELETE FROM inspection_reports WHERE id = ?1').bind(id).run();
    await audit(env, user.id, 'inspection_report.delete', 'inspection_report', id, { fileName: row.file_name });
    return json({ ok: true });
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return withCors(request, env, new Response(null, { status: 204 }));
    if (url.pathname === '/api/health') return withCors(request, env, json({ ok: true }));
    const authResponse = await handleAuth(request, env, url);
    if (authResponse) return withCors(request, env, authResponse);
    const usersResponse = await handleUsers(request, env, url);
    if (usersResponse) return withCors(request, env, usersResponse);
    const profileResponse = await handleProfile(request, env, url);
    if (profileResponse) return withCors(request, env, profileResponse);
    const configResponse = await handleConfig(request, env, url);
    if (configResponse) return withCors(request, env, configResponse);
    const liblibAiResponse = await handleLiblibAiProxy(request, env, url);
    if (liblibAiResponse) return withCors(request, env, liblibAiResponse);
    const dataRecognitionHistoryResponse = await handleDataRecognitionHistory(request, env, url);
    if (dataRecognitionHistoryResponse) return withCors(request, env, dataRecognitionHistoryResponse);
    const inspectionReportsResponse = await handleInspectionReports(request, env, url);
    if (inspectionReportsResponse) return withCors(request, env, inspectionReportsResponse);

    const user = await getSessionUser(request, env);
    if (!user) return withCors(request, env, unauthorized());
    if (user.mustChangePassword) return withCors(request, env, forbidden());

    if (url.pathname.startsWith('/api/state/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/state/'.length));
      if (!key) return withCors(request, env, notFound());
      const storageKey = getStateStorageKey(user, key);
      if (request.method === 'GET') {
        if (!can(user, 'state:read')) return withCors(request, env, forbidden());
        const row = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?1').bind(storageKey).first<{ value: string }>();
        return withCors(request, env, json({ value: row ? JSON.parse(row.value) : null }));
      }
      if (request.method === 'PUT') {
        if (!can(user, 'state:write')) return withCors(request, env, forbidden());
        const payload = await request.json<{ value: unknown }>();
        let nextValue = payload.value;
        if (key === GLOBAL_AI_CALL_LOG_KEY) {
          const current = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?1').bind(storageKey).first<{ value: string }>();
          nextValue = mergeAiCallLogs(current ? JSON.parse(current.value) : null, payload.value, user);
        }
        await env.DB.prepare(`
          INSERT INTO app_state (key, value, updated_at)
          VALUES (?1, ?2, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(storageKey, JSON.stringify(nextValue)).run();
        await audit(env, user.id, 'state.write', 'state', storageKey);
        return withCors(request, env, json({ ok: true }));
      }
      if (request.method === 'DELETE') {
        if (!can(user, 'state:write')) return withCors(request, env, forbidden());
        await env.DB.prepare('DELETE FROM app_state WHERE key = ?1').bind(storageKey).run();
        await audit(env, user.id, 'state.delete', 'state', storageKey);
        return withCors(request, env, json({ ok: true }));
      }
    }

    if (url.pathname.startsWith('/api/blob/')) {
      const [, , , rawNamespace, ...rawKeyParts] = url.pathname.split('/');
      const namespace = decodeURIComponent(rawNamespace || '');
      const key = decodeURIComponent(rawKeyParts.join('/'));
      if (!namespace || !key) return withCors(request, env, notFound());
      const objectKey = getBlobKey(namespace, key);
      if (request.method === 'GET') {
        if (!can(user, 'blob:read')) return withCors(request, env, forbidden());
        const object = await env.FILES.get(objectKey);
        if (!object) return withCors(request, env, new Response(null, { status: 204 }));
        const contentType = getSafeBlobContentType(object.httpMetadata?.contentType);
        const headers: Record<string, string> = {
          'content-type': contentType,
          etag: object.httpEtag,
        };
        if (contentType === 'application/octet-stream') {
          headers['content-disposition'] = `attachment; filename="${getAttachmentFileName(key)}"`;
        }
        return withCors(request, env, new Response(object.body, {
          headers,
        }));
      }
      if (request.method === 'PUT') {
        if (!can(user, 'blob:write')) return withCors(request, env, forbidden());
        const contentType = normalizeContentType(request.headers.get('content-type') || '');
        if (!SAFE_BLOB_CONTENT_TYPES.has(contentType)) return withCors(request, env, badRequest('invalid_blob_type'));
        await env.FILES.put(objectKey, request.body, {
          httpMetadata: { contentType },
        });
        await audit(env, user.id, 'blob.write', 'blob', objectKey);
        return withCors(request, env, json({ ok: true }));
      }
      if (request.method === 'DELETE') {
        if (!can(user, 'blob:write')) return withCors(request, env, forbidden());
        await env.FILES.delete(objectKey);
        await audit(env, user.id, 'blob.delete', 'blob', objectKey);
        return withCors(request, env, json({ ok: true }));
      }
    }
    return withCors(request, env, notFound());
  },
};
