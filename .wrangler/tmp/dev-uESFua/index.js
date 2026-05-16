var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
var SESSION_COOKIE = "gjh_session";
var SESSION_DAYS = 7;
var PASSWORD_ITERATIONS = 1e5;
var ROLE_PERMISSIONS = {
  system_admin: ["state:read", "state:write", "blob:read", "blob:write", "users:manage"],
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
var getBlobKey = /* @__PURE__ */ __name((namespace, key) => `${namespace}/${key}`, "getBlobKey");
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
var appendSessionCookie = /* @__PURE__ */ __name((request, headers, token, maxAgeSeconds) => headers.append(
  "set-cookie",
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${getCookieAttributes(request)}; Max-Age=${maxAgeSeconds}`
), "appendSessionCookie");
var clearSessionCookie = /* @__PURE__ */ __name((request, headers) => headers.append(
  "set-cookie",
  `${SESSION_COOKIE}=; Path=/; HttpOnly; ${getCookieAttributes(request)}; Max-Age=0`
), "clearSessionCookie");
var audit = /* @__PURE__ */ __name(async (env, actorUserId, action, targetType, targetId, metadata) => {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(randomId(), actorUserId, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null).run();
}, "audit");
var can = /* @__PURE__ */ __name((user, permission) => ROLE_PERMISSIONS[user.role]?.includes(permission), "can");
var validatePassword = /* @__PURE__ */ __name((password) => password.length >= 10 && password.length <= 128, "validatePassword");
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
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?1").bind(payload.username).first();
    if (!user || !user.is_active) return unauthorized();
    const candidate = await hashPassword(payload.password, user.password_salt);
    if (!constantTimeEqual(candidate.hash, user.password_hash)) return unauthorized();
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
  return notFound();
}
__name(handleUsers, "handleUsers");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
    if (url.pathname === "/api/health") return withCors(request, env, json({ ok: true }));
    const authResponse = await handleAuth(request, env, url);
    if (authResponse) return withCors(request, env, authResponse);
    const usersResponse = await handleUsers(request, env, url);
    if (usersResponse) return withCors(request, env, usersResponse);
    const user = await getSessionUser(request, env);
    if (!user) return withCors(request, env, unauthorized());
    if (user.mustChangePassword) return withCors(request, env, forbidden());
    if (url.pathname.startsWith("/api/state/")) {
      const key = decodeURIComponent(url.pathname.slice("/api/state/".length));
      if (!key) return withCors(request, env, notFound());
      if (request.method === "GET") {
        if (!can(user, "state:read")) return withCors(request, env, forbidden());
        const row = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?1").bind(key).first();
        return withCors(request, env, json({ value: row ? JSON.parse(row.value) : null }));
      }
      if (request.method === "PUT") {
        if (!can(user, "state:write")) return withCors(request, env, forbidden());
        const payload = await request.json();
        await env.DB.prepare(`
          INSERT INTO app_state (key, value, updated_at)
          VALUES (?1, ?2, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(key, JSON.stringify(payload.value)).run();
        await audit(env, user.id, "state.write", "state", key);
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
        return withCors(request, env, new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata?.contentType || "application/octet-stream",
            etag: object.httpEtag
          }
        }));
      }
      if (request.method === "PUT") {
        if (!can(user, "blob:write")) return withCors(request, env, forbidden());
        await env.FILES.put(objectKey, request.body, {
          httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" }
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

// .wrangler/tmp/bundle-6VVeu5/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-6VVeu5/middleware-loader.entry.ts
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
