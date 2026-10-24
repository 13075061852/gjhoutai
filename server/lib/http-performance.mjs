import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

const br = promisify(brotliCompress);
const gz = promisify(gzip);

/** Honour explicit q=0 exclusions and wildcard preferences. */
export function acceptedEncoding(header = '', supported = ['br', 'gzip']) {
  const preferences = new Map(String(header).toLowerCase().split(',').filter(Boolean).map((part) => {
    const [name, ...params] = part.trim().split(';');
    const q = params.find((value) => value.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    return [name.trim(), Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0];
  }));
  return supported.map((name, index) => ({ name, index, q: preferences.get(name) ?? preferences.get('*') ?? 0 }))
    .filter(({ q }) => q > 0).sort((a, b) => b.q - a.q || a.index - b.index)[0]?.name || null;
}

export function addVary(headers, ...names) {
  const current = String(headers.vary || '').split(',').map((v) => v.trim()).filter(Boolean);
  headers.vary = [...new Set([...current, ...names].map((v) => v.toLowerCase()))].join(', ');
}

export function matchesEtag(header, etag) {
  return String(header || '').split(',').some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));
}

export function isRevalidatable(pathname) {
  return pathname === '/api/property-data' || pathname === '/api/state'
    || pathname.startsWith('/api/state/') || pathname === '/api/inspection-reports'
    || pathname.startsWith('/api/blob/') || pathname === '/api/profile/avatar';
}

/** Called only AFTER the worker has authenticated and authorised this request. */
export async function prepareApiResponse(request, response, pathname, optimizeImage) {
  const headers = Object.fromEntries(response.headers);
  let body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  let status = response.status;
  if (request.method === 'GET' && status === 200 && body && isRevalidatable(pathname)) {
    if (optimizeImage && /^image\/(png|jpeg|webp|tiff|bmp)$/i.test(headers['content-type']?.split(';')[0] || '')) {
      addVary(headers, 'Accept');
      // Fetch downloads use */* (or format=original); <img> requests advertise WebP.
      const url = new URL(request.url);
      if (url.searchParams.get('format') !== 'original'
        && acceptedEncoding(request.headers.get('accept'), ['image/webp'])) {
        const optimized = await optimizeImage(body);
        if (optimized) { body = optimized; headers['content-type'] = 'image/webp'; }
      }
    }
    headers['cache-control'] = 'private, no-cache';
    addVary(headers, 'Cookie');
    if (/^(application\/json|text\/)/i.test(headers['content-type'] || '')) addVary(headers, 'Accept-Encoding');
    const etag = `W/"${createHash('sha256').update(body).digest('hex')}"`;
    headers.etag = etag;
    if (matchesEtag(request.headers.get('if-none-match'), etag)) { status = 304; body = null; }
  }
  const type = headers['content-type'] || '';
  if (body && status === 200 && body.length >= 1024 && /^(application\/json|text\/)/i.test(type)) {
    addVary(headers, 'Accept-Encoding');
    const encoding = acceptedEncoding(request.headers.get('accept-encoding'));
    if (encoding) {
      const compressed = encoding === 'br'
        ? await br(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
        : await gz(body, { level: 6 });
      if (compressed.length < body.length) { body = compressed; headers['content-encoding'] = encoding; }
    }
  }
  if (status === 304) { delete headers['content-length']; delete headers['content-encoding']; }
  else if (body) headers['content-length'] = String(body.length);
  return { status, headers, body };
}
