import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { acceptedEncoding, matchesEtag } from './http-performance.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

async function statFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

/** Serves the built SPA from a directory with index.html fallback for routes. */
export async function serveStatic(rootDir, urlPath, res, isHead, requestHeaders = {}) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('bad request');
    return;
  }

  const rootResolved = path.resolve(rootDir);
  let relative = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  let filePath = path.resolve(rootResolved, relative);
  if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  let stat = await statFile(filePath);
  if (!stat && !path.extname(relative)) {
    relative = 'index.html';
    filePath = path.join(rootResolved, 'index.html');
    stat = await statFile(filePath);
  }
  if (!stat) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const cacheControl = relative.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = { 'content-type': contentType, 'cache-control': cacheControl, etag };
  if (/\.(?:html?|css|m?js|json|svg|txt|webmanifest)$/i.test(relative)) {
    headers.vary = 'Accept-Encoding';
    const encoding = acceptedEncoding(requestHeaders['accept-encoding']);
    if (encoding) {
      const encodedPath = `${filePath}.${encoding === 'br' ? 'br' : 'gz'}`;
      const encodedStat = await statFile(encodedPath);
      if (encodedStat && encodedStat.size < stat.size) {
        filePath = encodedPath;
        stat = encodedStat;
        headers['content-encoding'] = encoding;
      }
    }
  }
  if (matchesEtag(requestHeaders['if-none-match'], etag)) {
    delete headers['content-encoding'];
    res.writeHead(304, headers); res.end(); return;
  }
  headers['content-length'] = String(stat.size);
  res.writeHead(200, headers);
  if (isHead) {
    res.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
