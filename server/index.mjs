import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createD1Database } from './lib/d1.mjs';
import { createR2Bucket } from './lib/r2.mjs';
import { serveStatic } from './lib/static.mjs';
import { prepareApiResponse } from './lib/http-performance.mjs';
import { createImageOptimizer } from './lib/images.mjs';
import { createBusinessActions } from './lib/business-actions.mjs';
import worker from './worker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const APP_BASE_PATH = String(process.env.APP_BASE_PATH || '').replace(/\/+$/, '');

const optimizeImage = createImageOptimizer({ cacheDir: path.join(DATA_DIR, 'image-cache') });

const env = {
  DB: createD1Database(path.join(DATA_DIR, 'gjhoutai.sqlite')),
  FILES: createR2Bucket(path.join(DATA_DIR, 'objects')),
  CORS_ORIGINS: process.env.CORS_ORIGINS || '',
  BOOTSTRAP_ADMIN_TOKEN: process.env.BOOTSTRAP_ADMIN_TOKEN || '',
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY || '',
};

const businessActions = createBusinessActions({ db: env.DB._raw, files: env.FILES, allowedOrigins: env.CORS_ORIGINS, appBasePath: APP_BASE_PATH || '/gjhoutai', readOnly: false });

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

function buildWebRequest(req, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_REQUEST_HEADERS.has(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.append(key, value);
  }
  const method = req.method || 'GET';
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }
  return new Request(url, init);
}

async function writeWebResponse(res, response, isHead, request, pathname) {
  const headers = {};
  for (const [key, value] of response.headers) {
    if (key === 'set-cookie' || HOP_BY_HOP_RESPONSE_HEADERS.has(key)) continue;
    headers[key] = value;
  }
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  if (cookies.length) headers['set-cookie'] = cookies;

  const prepared = await prepareApiResponse(request, response, pathname, optimizeImage);
  Object.assign(headers, prepared.headers);
  delete headers['set-cookie'];
  if (cookies.length) headers['set-cookie'] = cookies;
  const body = prepared.body;

  res.writeHead(prepared.status, headers);
  if (isHead || !body) res.end();
  else res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const rawUrl = req.url || '/';
    const queryIndex = rawUrl.indexOf('?');
    const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
    const search = queryIndex === -1 ? '' : rawUrl.slice(queryIndex);

    let internalPath = rawPath;
    if (APP_BASE_PATH) {
      if (rawPath === APP_BASE_PATH) {
        res.writeHead(308, { location: `${APP_BASE_PATH}/${search}` });
        res.end();
        return;
      }
      if (rawPath.startsWith(`${APP_BASE_PATH}/`)) {
        internalPath = rawPath.slice(APP_BASE_PATH.length) || '/';
      } else if (!rawPath.startsWith('/api')) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
    }

    if (internalPath === '/api' || internalPath.startsWith('/api/')) {
      const url = `${forwardedProto}://${forwardedHost}${internalPath}${search}`;
      const request = buildWebRequest(req, url);
      const response = await businessActions.handle(request) || await worker.fetch(request, env);
      await writeWebResponse(res, response, req.method === 'HEAD', request, internalPath);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('method not allowed');
      return;
    }
    await serveStatic(DIST_DIR, internalPath, res, req.method === 'HEAD', req.headers);
  } catch (error) {
    console.error('[gjhoutai] request failed', {
      method: req.method,
      url: req.url,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[gjhoutai] listening on http://${HOST}:${PORT} base=${APP_BASE_PATH || '/'} data=${DATA_DIR}`);
});

const shutdown = () => {
  server.close(() => {
    try {
      env.DB.close();
    } catch {
      // ignore close errors during shutdown
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
