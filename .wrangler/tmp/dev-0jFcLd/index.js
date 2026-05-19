var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
var SESSION_COOKIE = "gjh_session";
var SESSION_MARKER_COOKIE = "gjh_session_present";
var SESSION_DAYS = 7;
var PASSWORD_ITERATIONS = 1e5;
var CONFIG_ALGORITHM = "AES-GCM";
var LOGIN_FAILURE_LIMIT = 5;
var LOGIN_LOCK_SECONDS = 15 * 60;
var LOGIN_WINDOW_SECONDS = 15 * 60;
var SAFE_BLOB_CONTENT_TYPES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp"]);
var ROLE_PERMISSIONS = {
  system_admin: ["state:read", "state:write", "blob:read", "blob:write", "config:read", "config:write", "users:manage"],
  sales_manager: ["state:read", "state:write", "blob:read"],
  lab_engineer: ["state:read", "state:write", "blob:read", "blob:write"],
  warehouse_manager: ["state:read", "state:write", "blob:read"]
};
var json = /* @__PURE__ */ __name((value, init = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json;charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}, "json");
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
var randomId = /* @__PURE__ */ __name(() => crypto.randomUUID(), "randomId");
var notFound = /* @__PURE__ */ __name(() => json({ error: "not_found" }, { status: 404 }), "notFound");
var unauthorized = /* @__PURE__ */ __name(() => json({ error: "unauthorized" }, { status: 401 }), "unauthorized");
var forbidden = /* @__PURE__ */ __name(() => json({ error: "forbidden" }, { status: 403 }), "forbidden");
var badRequest = /* @__PURE__ */ __name((error) => json({ error }, { status: 400 }), "badRequest");
var tooManyRequests = /* @__PURE__ */ __name(() => json({ error: "too_many_login_attempts" }, { status: 429 }), "tooManyRequests");
var getBlobKey = /* @__PURE__ */ __name((namespace, key) => `${namespace}/${key}`, "getBlobKey");
var normalizeContentType = /* @__PURE__ */ __name((contentType) => contentType.split(";")[0].trim().toLowerCase(), "normalizeContentType");
var getSafeBlobContentType = /* @__PURE__ */ __name((contentType) => {
  const normalized = normalizeContentType(contentType || "");
  return SAFE_BLOB_CONTENT_TYPES.has(normalized) ? normalized : "application/octet-stream";
}, "getSafeBlobContentType");
var getAttachmentFileName = /* @__PURE__ */ __name((key) => {
  const fileName = key.split("/").filter(Boolean).pop() || "download";
  return fileName.replace(/[\\\r\n"]/g, "_");
}, "getAttachmentFileName");
var USER_SCOPED_STATE_KEYS = /* @__PURE__ */ new Set([
  "sidebar-active-page",
  "sidebar-recent-pages",
  "openrouter-ai-chat-v1",
  "openrouter-ai-chat-sessions-v1",
  "openrouter-ai-chat-active-session-v1",
  "openrouter-ai-chat-data-attachment-v1",
  "openrouter-ai-chat-search-enabled-v1"
]);
var GLOBAL_AI_CALL_LOG_KEY = "openrouter-ai-call-log-v1";
var MAX_AI_CALL_LOGS = 500;
var getStateStorageKey = /* @__PURE__ */ __name((user, key) => USER_SCOPED_STATE_KEYS.has(key) ? `users/${user.id}/${key}` : key, "getStateStorageKey");
var mergeAiCallLogs = /* @__PURE__ */ __name((currentValue, nextValue, user) => {
  const currentLogs = Array.isArray(currentValue) ? currentValue : [];
  const nextLogs = Array.isArray(nextValue) ? nextValue.map((item) => item && typeof item === "object" ? {
    ...item,
    actorUserId: item.actorUserId || user.id,
    actorUsername: item.actorUsername || user.username,
    actorDisplayName: item.actorDisplayName || user.displayName,
    actorRole: item.actorRole || user.role
  } : item) : [];
  const merged = [...nextLogs, ...currentLogs].filter((item) => item && typeof item === "object");
  const seen = /* @__PURE__ */ new Set();
  return merged.filter((item) => {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((left, right) => String(right?.at || right?.endedAt || "").localeCompare(String(left?.at || left?.endedAt || ""))).slice(0, MAX_AI_CALL_LOGS);
}, "mergeAiCallLogs");
var getAllowedOrigin = /* @__PURE__ */ __name((request, env) => {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (env.CORS_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : null;
}, "getAllowedOrigin");
var withCors = /* @__PURE__ */ __name((request, env, response) => {
  const headers = new Headers(response.headers);
  const allowedOrigin = getAllowedOrigin(request, env);
  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "origin");
  }
  headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}, "withCors");
var bytesToHex = /* @__PURE__ */ __name((bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""), "bytesToHex");
var randomHex = /* @__PURE__ */ __name((size) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}, "randomHex");
var sha256 = /* @__PURE__ */ __name(async (value) => bytesToHex(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
)), "sha256");
var bytesToBase64 = /* @__PURE__ */ __name((bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}, "bytesToBase64");
var base64ToBytes = /* @__PURE__ */ __name((value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0)), "base64ToBytes");
var getConfigKey = /* @__PURE__ */ __name(async (env) => {
  if (!env.CONFIG_ENCRYPTION_KEY) throw new Error("missing_config_encryption_key");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.CONFIG_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, CONFIG_ALGORITHM, false, ["encrypt", "decrypt"]);
}, "getConfigKey");
var encryptConfig = /* @__PURE__ */ __name(async (env, value) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: CONFIG_ALGORITHM, iv }, await getConfigKey(env), plaintext);
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv)
  };
}, "encryptConfig");
var decryptConfig = /* @__PURE__ */ __name(async (env, ciphertext, iv) => {
  const plaintext = await crypto.subtle.decrypt(
    { name: CONFIG_ALGORITHM, iv: base64ToBytes(iv) },
    await getConfigKey(env),
    base64ToBytes(ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}, "decryptConfig");
var hashPassword = /* @__PURE__ */ __name(async (password, salt = randomHex(16)) => {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256
  );
  return { salt, hash: bytesToHex(new Uint8Array(bits)) };
}, "hashPassword");
var constantTimeEqual = /* @__PURE__ */ __name((left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}, "constantTimeEqual");
var parseCookies = /* @__PURE__ */ __name((request) => Object.fromEntries(
  (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator === -1 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  })
), "parseCookies");
var getCookieAttributes = /* @__PURE__ */ __name((request) => {
  const isSecure = new URL(request.url).protocol === "https:";
  return `${isSecure ? "Secure; SameSite=None" : "SameSite=Lax"}`;
}, "getCookieAttributes");
var appendSessionCookie = /* @__PURE__ */ __name((request, headers, token, maxAgeSeconds) => {
  const attributes = getCookieAttributes(request);
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${attributes}; Max-Age=${maxAgeSeconds}`
  );
  headers.append(
    "set-cookie",
    `${SESSION_MARKER_COOKIE}=1; Path=/; ${attributes}; Max-Age=${maxAgeSeconds}`
  );
}, "appendSessionCookie");
var clearSessionCookie = /* @__PURE__ */ __name((request, headers) => {
  const attributes = getCookieAttributes(request);
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; ${attributes}; Max-Age=0`
  );
  headers.append(
    "set-cookie",
    `${SESSION_MARKER_COOKIE}=; Path=/; ${attributes}; Max-Age=0`
  );
}, "clearSessionCookie");
var audit = /* @__PURE__ */ __name(async (env, actorUserId, action, targetType, targetId, metadata) => {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(randomId(), actorUserId, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null).run();
}, "audit");
var can = /* @__PURE__ */ __name((user, permission) => ROLE_PERMISSIONS[user.role]?.includes(permission), "can");
var validatePassword = /* @__PURE__ */ __name((password) => password.length >= 10 && password.length <= 128, "validatePassword");
var getClientIp = /* @__PURE__ */ __name((request) => request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown", "getClientIp");
var getLoginRateLimitKeys = /* @__PURE__ */ __name((request, username) => [
  `user:${username.trim().toLowerCase()}`,
  `ip:${getClientIp(request)}`
], "getLoginRateLimitKeys");
var isLoginRateLimited = /* @__PURE__ */ __name(async (env, keys) => {
  if (!keys.length) return false;
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(",");
  const result = await env.DB.prepare(`
    SELECT locked_until FROM login_attempts
    WHERE identifier IN (${placeholders}) AND locked_until > ?${keys.length + 1}
  `).bind(...keys, nowIso()).all();
  return Boolean(result.results?.length);
}, "isLoginRateLimited");
var recordLoginFailure = /* @__PURE__ */ __name(async (env, keys) => {
  const updatedAt = nowIso();
  const windowStartedAt = new Date(Date.now() - LOGIN_WINDOW_SECONDS * 1e3).toISOString();
  const lockedUntil = new Date(Date.now() + LOGIN_LOCK_SECONDS * 1e3).toISOString();
  await Promise.all(keys.map(async (key) => {
    const current = await env.DB.prepare(
      "SELECT failures, updated_at FROM login_attempts WHERE identifier = ?1"
    ).bind(key).first();
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
}, "recordLoginFailure");
var clearLoginFailures = /* @__PURE__ */ __name(async (env, keys) => {
  if (!keys.length) return;
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(",");
  await env.DB.prepare(`DELETE FROM login_attempts WHERE identifier IN (${placeholders})`).bind(...keys).run();
}, "clearLoginFailures");
var getSessionUser = /* @__PURE__ */ __name(async (request, env) => {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2
  `).bind(tokenHash, nowIso()).first();
  if (!row || !row.is_active) return null;
  await env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?1").bind(tokenHash).run();
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password)
  };
}, "getSessionUser");
async function handleAuth(request, env, url) {
  if (url.pathname === "/api/auth/bootstrap" && request.method === "POST") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    if ((count?.count || 0) > 0) return forbidden();
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!env.BOOTSTRAP_ADMIN_TOKEN || !token || !constantTimeEqual(token, env.BOOTSTRAP_ADMIN_TOKEN)) return forbidden();
    const payload = await request.json();
    if (!payload.username || !payload.displayName || !payload.password || !validatePassword(payload.password)) return badRequest("invalid_bootstrap_payload");
    const password = await hashPassword(payload.password);
    const id = randomId();
    await env.DB.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, password_salt, must_change_password)
      VALUES (?1, ?2, ?3, 'system_admin', ?4, ?5, 0)
    `).bind(id, payload.username, payload.displayName, password.hash, password.salt).run();
    await audit(env, id, "auth.bootstrap_admin", "user", id);
    return json({ ok: true });
  }
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const payload = await request.json();
    if (!payload.username || !payload.password) return badRequest("missing_credentials");
    const rateLimitKeys = getLoginRateLimitKeys(request, payload.username);
    if (await isLoginRateLimited(env, rateLimitKeys)) return tooManyRequests();
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?1").bind(payload.username).first();
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
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3).toISOString();
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(randomId(), user.id, await sha256(rawToken), expiresAt).run();
    await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(user.id).run();
    await audit(env, user.id, "auth.login", "user", user.id);
    const headers = new Headers();
    appendSessionCookie(request, headers, rawToken, SESSION_DAYS * 24 * 60 * 60);
    return json({ user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, mustChangePassword: Boolean(user.must_change_password) } }, { headers });
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request)[SESSION_COOKIE];
    const headers = new Headers();
    clearSessionCookie(request, headers);
    if (token) {
      const tokenHash = await sha256(token);
      const user = await getSessionUser(request, env);
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
      if (user) await audit(env, user.id, "auth.logout", "user", user.id);
    }
    return json({ ok: true }, { headers });
  }
  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await getSessionUser(request, env);
    return user ? json({ user }) : unauthorized();
  }
  if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
    const user = await getSessionUser(request, env);
    if (!user) return unauthorized();
    const payload = await request.json();
    if (!payload.currentPassword || !payload.nextPassword || !validatePassword(payload.nextPassword)) return badRequest("invalid_password_payload");
    const row = await env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?1").bind(user.id).first();
    if (!row) return unauthorized();
    const current = await hashPassword(payload.currentPassword, row.password_salt);
    if (!constantTimeEqual(current.hash, row.password_hash)) return unauthorized();
    const next = await hashPassword(payload.nextPassword);
    await env.DB.prepare(`
      UPDATE users
      SET password_hash = ?1, password_salt = ?2, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?3
    `).bind(next.hash, next.salt, user.id).run();
    await audit(env, user.id, "auth.change_password", "user", user.id);
    return json({ ok: true });
  }
  return null;
}
__name(handleAuth, "handleAuth");
async function handleUsers(request, env, url) {
  if (!url.pathname.startsWith("/api/users")) return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (!can(user, "users:manage")) return forbidden();
  if (url.pathname === "/api/users" && request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT id, username, display_name, role, must_change_password, is_active, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `).all();
    return json({ users: rows.results || [] });
  }
  if (url.pathname === "/api/users" && request.method === "POST") {
    const payload = await request.json();
    if (!payload.username || !payload.displayName || !payload.role || !payload.password) return badRequest("invalid_user_payload");
    if (!(payload.role in ROLE_PERMISSIONS) || !validatePassword(payload.password)) return badRequest("invalid_user_payload");
    const password = await hashPassword(payload.password);
    const id = randomId();
    await env.DB.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, password_salt)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(id, payload.username, payload.displayName, payload.role, password.hash, password.salt).run();
    await audit(env, user.id, "users.create", "user", id, { role: payload.role });
    return json({ ok: true, id }, { status: 201 });
  }
  if (url.pathname.startsWith("/api/users/") && request.method === "PUT") {
    const targetUserId = decodeURIComponent(url.pathname.slice("/api/users/".length));
    const payload = await request.json();
    if (!targetUserId || !payload.role || !(payload.role in ROLE_PERMISSIONS)) return badRequest("invalid_user_payload");
    if (payload.password && !validatePassword(payload.password)) return badRequest("invalid_password_payload");
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
    await audit(env, user.id, "users.update", "user", targetUserId, { role: payload.role, passwordReset: Boolean(password) });
    return json({ ok: true });
  }
  return notFound();
}
__name(handleUsers, "handleUsers");
async function handleProfile(request, env, url) {
  if (url.pathname !== "/api/profile/avatar") return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const objectKey = `avatars/${user.id}`;
  if (request.method === "GET") {
    const object = await env.FILES.get(objectKey);
    if (!object) return new Response(null, { status: 204 });
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "application/octet-stream",
        etag: object.httpEtag
      }
    });
  }
  if (request.method === "PUT") {
    const contentType = request.headers.get("content-type") || "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return badRequest("invalid_avatar_type");
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > 2 * 1024 * 1024) return badRequest("invalid_avatar_size");
    await env.FILES.put(objectKey, body, { httpMetadata: { contentType } });
    await audit(env, user.id, "profile.avatar_update", "user", user.id);
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    await env.FILES.delete(objectKey);
    await audit(env, user.id, "profile.avatar_delete", "user", user.id);
    return json({ ok: true });
  }
  return notFound();
}
__name(handleProfile, "handleProfile");
async function handleConfig(request, env, url) {
  if (url.pathname !== "/api/config") return null;
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  if (user.mustChangePassword) return forbidden();
  if (request.method === "GET") {
    if (!can(user, "config:read")) return forbidden();
    const row = await env.DB.prepare(
      "SELECT ciphertext, iv FROM shared_config WHERE id = 1"
    ).first();
    if (!row) return json({ value: null });
    try {
      return json({ value: await decryptConfig(env, row.ciphertext, row.iv) });
    } catch {
      return json({ error: "config_decrypt_failed" }, { status: 500 });
    }
  }
  if (request.method === "PUT") {
    if (!can(user, "config:write")) return forbidden();
    const payload = await request.json();
    if (!Object.prototype.hasOwnProperty.call(payload, "value")) return badRequest("invalid_config_payload");
    const encrypted = await encryptConfig(env, payload.value);
    await env.DB.prepare(`
      INSERT INTO shared_config (id, ciphertext, iv, updated_at)
      VALUES (1, ?1, ?2, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        updated_at = CURRENT_TIMESTAMP
    `).bind(encrypted.ciphertext, encrypted.iv).run();
    await audit(env, user.id, "config.write", "shared_config", "global");
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    if (!can(user, "config:write")) return forbidden();
    await env.DB.prepare("DELETE FROM shared_config WHERE id = 1").run();
    await audit(env, user.id, "config.delete", "shared_config", "global");
    return json({ ok: true });
  }
  return notFound();
}
__name(handleConfig, "handleConfig");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
    if (url.pathname === "/api/health") return withCors(request, env, json({ ok: true }));
    const authResponse = await handleAuth(request, env, url);
    if (authResponse) return withCors(request, env, authResponse);
    const usersResponse = await handleUsers(request, env, url);
    if (usersResponse) return withCors(request, env, usersResponse);
    const profileResponse = await handleProfile(request, env, url);
    if (profileResponse) return withCors(request, env, profileResponse);
    const configResponse = await handleConfig(request, env, url);
    if (configResponse) return withCors(request, env, configResponse);
    const user = await getSessionUser(request, env);
    if (!user) return withCors(request, env, unauthorized());
    if (user.mustChangePassword) return withCors(request, env, forbidden());
    if (url.pathname.startsWith("/api/state/")) {
      const key = decodeURIComponent(url.pathname.slice("/api/state/".length));
      if (!key) return withCors(request, env, notFound());
      const storageKey = getStateStorageKey(user, key);
      if (request.method === "GET") {
        if (!can(user, "state:read")) return withCors(request, env, forbidden());
        const row = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?1").bind(storageKey).first();
        return withCors(request, env, json({ value: row ? JSON.parse(row.value) : null }));
      }
      if (request.method === "PUT") {
        if (!can(user, "state:write")) return withCors(request, env, forbidden());
        const payload = await request.json();
        let nextValue = payload.value;
        if (key === GLOBAL_AI_CALL_LOG_KEY) {
          const current = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?1").bind(storageKey).first();
          nextValue = mergeAiCallLogs(current ? JSON.parse(current.value) : null, payload.value, user);
        }
        await env.DB.prepare(`
          INSERT INTO app_state (key, value, updated_at)
          VALUES (?1, ?2, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(storageKey, JSON.stringify(nextValue)).run();
        await audit(env, user.id, "state.write", "state", storageKey);
        return withCors(request, env, json({ ok: true }));
      }
    }
    if (url.pathname.startsWith("/api/blob/")) {
      const [, , , rawNamespace, ...rawKeyParts] = url.pathname.split("/");
      const namespace = decodeURIComponent(rawNamespace || "");
      const key = decodeURIComponent(rawKeyParts.join("/"));
      if (!namespace || !key) return withCors(request, env, notFound());
      const objectKey = getBlobKey(namespace, key);
      if (request.method === "GET") {
        if (!can(user, "blob:read")) return withCors(request, env, forbidden());
        const object = await env.FILES.get(objectKey);
        if (!object) return withCors(request, env, new Response(null, { status: 204 }));
        const contentType = getSafeBlobContentType(object.httpMetadata?.contentType);
        const headers = {
          "content-type": contentType,
          etag: object.httpEtag
        };
        if (contentType === "application/octet-stream") {
          headers["content-disposition"] = `attachment; filename="${getAttachmentFileName(key)}"`;
        }
        return withCors(request, env, new Response(object.body, {
          headers
        }));
      }
      if (request.method === "PUT") {
        if (!can(user, "blob:write")) return withCors(request, env, forbidden());
        const contentType = normalizeContentType(request.headers.get("content-type") || "");
        if (!SAFE_BLOB_CONTENT_TYPES.has(contentType)) return withCors(request, env, badRequest("invalid_blob_type"));
        await env.FILES.put(objectKey, request.body, {
          httpMetadata: { contentType }
        });
        await audit(env, user.id, "blob.write", "blob", objectKey);
        return withCors(request, env, json({ ok: true }));
      }
      if (request.method === "DELETE") {
        if (!can(user, "blob:write")) return withCors(request, env, forbidden());
        await env.FILES.delete(objectKey);
        await audit(env, user.id, "blob.delete", "blob", objectKey);
        return withCors(request, env, json({ ok: true }));
      }
    }
    return withCors(request, env, notFound());
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-NNwwzf/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-NNwwzf/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
