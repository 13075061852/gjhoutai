export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** CORS controls response visibility, not whether a cookie-authenticated write executes. */
export function isTrustedMutation(request: Request, allowedOrigins = ''): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (origin) {
    return origin === new URL(request.url).origin
      || allowedOrigins.split(',').map((value) => value.trim()).filter((value) => value !== 'null').includes(origin);
  }
  // Browser cross-site requests without Origin must not fall through to API-client access.
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

export async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new RequestError(413, 'payload_too_large');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, 'payload_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Bound JSON before parsing; a Content-Length check alone misses chunked uploads. */
export async function prepareJsonRequest(request: Request): Promise<Request> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return request;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/blob/') || path === '/api/profile/avatar'
    || path === '/api/property-data/backup' || path === '/api/inspection-reports') return request;
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'json_content_type_required');
  }
  const limit = path.startsWith('/api/auth/') || path.startsWith('/api/users')
    ? 16 * 1024
    : path.startsWith('/api/data-recognition/') ? 12 * 1024 * 1024 : 2 * 1024 * 1024;
  const bytes = await readLimitedBody(request, limit);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError(400, 'invalid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(400, 'json_object_required');
  }
  return new Request(request, { body: bytes });
}

export const isPublicStorageKey = (key: string): boolean =>
  key.length > 0 && key.length <= 255 && !/[\/\\\u0000-\u001f\u007f]/.test(key) && key !== '.' && key !== '..';

export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const safeName = fileName.replace(/[\/\\\u0000-\u001f\u007f"]/g, '_');
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(safeName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}
