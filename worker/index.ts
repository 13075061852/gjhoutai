export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  CORS_ORIGINS?: string;
  BOOTSTRAP_ADMIN_TOKEN?: string;
}

type Role = 'system_admin' | 'sales_manager' | 'lab_engineer' | 'warehouse_manager';
type Permission = 'state:read' | 'state:write' | 'blob:read' | 'blob:write' | 'users:manage';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  password_salt: string;
  must_change_password: number;
  is_active: number;
}

interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

const SESSION_COOKIE = 'gjh_session';
const SESSION_DAYS = 7;
const PASSWORD_ITERATIONS = 100_000;

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  system_admin: ['state:read', 'state:write', 'blob:read', 'blob:write', 'users:manage'],
  sales_manager: ['state:read', 'state:write', 'blob:read'],
  lab_engineer: ['state:read', 'state:write', 'blob:read', 'blob:write'],
  warehouse_manager: ['state:read', 'state:write', 'blob:read'],
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
const getBlobKey = (namespace: string, key: string) => `${namespace}/${key}`;

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
const appendSessionCookie = (request: Request, headers: Headers, token: string, maxAgeSeconds: number) => headers.append(
  'set-cookie',
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${getCookieAttributes(request)}; Max-Age=${maxAgeSeconds}`,
);
const clearSessionCookie = (request: Request, headers: Headers) => headers.append(
  'set-cookie',
  `${SESSION_COOKIE}=; Path=/; HttpOnly; ${getCookieAttributes(request)}; Max-Age=0`,
);
const audit = async (env: Env, actorUserId: string | null, action: string, targetType?: string, targetId?: string, metadata?: unknown) => {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(randomId(), actorUserId, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null).run();
};
const can = (user: SessionUser, permission: Permission) => ROLE_PERMISSIONS[user.role]?.includes(permission);
const validatePassword = (password: string) => password.length >= 10 && password.length <= 128;

const getSessionUser = async (request: Request, env: Env): Promise<SessionUser | null> => {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2
  `).bind(tokenHash, nowIso()).first<{
    id: string;
    username: string;
    display_name: string;
    role: Role;
    must_change_password: number;
    is_active: number;
  }>();
  if (!row || !row.is_active) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?1').bind(tokenHash).run();
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
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
      INSERT INTO users (id, username, display_name, role, password_hash, password_salt, must_change_password)
      VALUES (?1, ?2, ?3, 'system_admin', ?4, ?5, 0)
    `).bind(id, payload.username, payload.displayName, password.hash, password.salt).run();
    await audit(env, id, 'auth.bootstrap_admin', 'user', id);
    return json({ ok: true });
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const payload = await request.json<{ username?: string; password?: string }>();
    if (!payload.username || !payload.password) return badRequest('missing_credentials');
    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?1').bind(payload.username).first<UserRow>();
    if (!user || !user.is_active) return unauthorized();
    const candidate = await hashPassword(payload.password, user.password_salt);
    if (!constantTimeEqual(candidate.hash, user.password_hash)) return unauthorized();
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
    return json({ user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, mustChangePassword: Boolean(user.must_change_password) } }, { headers });
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
      SELECT id, username, display_name, role, must_change_password, is_active, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `).all();
    return json({ users: rows.results || [] });
  }
  if (url.pathname === '/api/users' && request.method === 'POST') {
    const payload = await request.json<{ username?: string; displayName?: string; role?: Role; password?: string }>();
    if (!payload.username || !payload.displayName || !payload.role || !payload.password) return badRequest('invalid_user_payload');
    if (!(payload.role in ROLE_PERMISSIONS) || !validatePassword(payload.password)) return badRequest('invalid_user_payload');
    const password = await hashPassword(payload.password);
    const id = randomId();
    await env.DB.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, password_salt)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(id, payload.username, payload.displayName, payload.role, password.hash, password.salt).run();
    await audit(env, user.id, 'users.create', 'user', id, { role: payload.role });
    return json({ ok: true, id }, { status: 201 });
  }
  if (url.pathname.startsWith('/api/users/') && request.method === 'PUT') {
    const targetUserId = decodeURIComponent(url.pathname.slice('/api/users/'.length));
    const payload = await request.json<{ displayName?: string; role?: Role; password?: string }>();
    if (!targetUserId || !payload.role || !(payload.role in ROLE_PERMISSIONS)) return badRequest('invalid_user_payload');
    if (payload.password && !validatePassword(payload.password)) return badRequest('invalid_password_payload');
    const password = payload.password ? await hashPassword(payload.password) : null;
    await env.DB.prepare(`
      UPDATE users
      SET display_name = COALESCE(?1, display_name),
          role = ?2,
          password_hash = COALESCE(?3, password_hash),
          password_salt = COALESCE(?4, password_salt),
          must_change_password = CASE WHEN ?3 IS NULL THEN must_change_password ELSE 1 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?5
    `).bind(payload.displayName || null, payload.role, password?.hash || null, password?.salt || null, targetUserId).run();
    await audit(env, user.id, 'users.update', 'user', targetUserId, { role: payload.role, passwordReset: Boolean(password) });
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

    const user = await getSessionUser(request, env);
    if (!user) return withCors(request, env, unauthorized());
    if (user.mustChangePassword) return withCors(request, env, forbidden());

    if (url.pathname.startsWith('/api/state/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/state/'.length));
      if (!key) return withCors(request, env, notFound());
      if (request.method === 'GET') {
        if (!can(user, 'state:read')) return withCors(request, env, forbidden());
        const row = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?1').bind(key).first<{ value: string }>();
        return withCors(request, env, json({ value: row ? JSON.parse(row.value) : null }));
      }
      if (request.method === 'PUT') {
        if (!can(user, 'state:write')) return withCors(request, env, forbidden());
        const payload = await request.json<{ value: unknown }>();
        await env.DB.prepare(`
          INSERT INTO app_state (key, value, updated_at)
          VALUES (?1, ?2, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(key, JSON.stringify(payload.value)).run();
        await audit(env, user.id, 'state.write', 'state', key);
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
        return withCors(request, env, new Response(object.body, {
          headers: {
            'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
            etag: object.httpEtag,
          },
        }));
      }
      if (request.method === 'PUT') {
        if (!can(user, 'blob:write')) return withCors(request, env, forbidden());
        await env.FILES.put(objectKey, request.body, {
          httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
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
