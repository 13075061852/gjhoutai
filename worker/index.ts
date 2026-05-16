export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
}

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    ...(init.headers || {}),
  },
});

const notFound = () => json({ error: 'not_found' }, { status: 404 });

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  return new Response(response.body, { status: response.status, headers });
};

const getBlobKey = (namespace: string, key: string) => `${namespace}/${key}`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === '/api/health') {
      return withCors(json({ ok: true }));
    }

    if (url.pathname.startsWith('/api/state/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/state/'.length));
      if (!key) return withCors(notFound());

      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?1').bind(key).first<{ value: string }>();
        return withCors(json({ value: row ? JSON.parse(row.value) : null }));
      }

      if (request.method === 'PUT') {
        const payload = await request.json<{ value: unknown }>();
        await env.DB.prepare(`
          INSERT INTO app_state (key, value, updated_at)
          VALUES (?1, ?2, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(key, JSON.stringify(payload.value)).run();
        return withCors(json({ ok: true }));
      }
    }

    if (url.pathname.startsWith('/api/blob/')) {
      const [, , , rawNamespace, ...rawKeyParts] = url.pathname.split('/');
      const namespace = decodeURIComponent(rawNamespace || '');
      const key = decodeURIComponent(rawKeyParts.join('/'));
      if (!namespace || !key) return withCors(notFound());
      const objectKey = getBlobKey(namespace, key);

      if (request.method === 'GET') {
        const object = await env.FILES.get(objectKey);
        if (!object) return withCors(new Response(null, { status: 204 }));
        return withCors(new Response(object.body, {
          headers: {
            'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
            etag: object.httpEtag,
          },
        }));
      }

      if (request.method === 'PUT') {
        await env.FILES.put(objectKey, request.body, {
          httpMetadata: {
            contentType: request.headers.get('content-type') || 'application/octet-stream',
          },
        });
        return withCors(json({ ok: true }));
      }

      if (request.method === 'DELETE') {
        await env.FILES.delete(objectKey);
        return withCors(json({ ok: true }));
      }
    }

    return withCors(notFound());
  },
};
