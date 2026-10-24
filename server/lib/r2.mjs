import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const keyHash = (key) => createHash('sha1').update(String(key)).digest('hex');

async function toBuffer(value) {
  if (value === null || value === undefined) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  if (typeof value.arrayBuffer === 'function') return Buffer.from(await value.arrayBuffer());
  if (typeof value.getReader === 'function') return Buffer.from(await new Response(value).arrayBuffer());
  if (typeof value[Symbol.asyncIterator] === 'function' || typeof value[Symbol.iterator] === 'function') {
    const chunks = [];
    for await (const chunk of value) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error('unsupported_body_type');
}

/**
 * Minimal R2Bucket-compatible adapter backed by the local filesystem.
 * Objects are stored by sha1(key) so arbitrary key characters are safe, with a
 * sidecar JSON document holding the content type and etag metadata.
 */
export function createR2Bucket(rootDir) {
  const pathsFor = (key) => {
    const id = keyHash(key);
    return { data: path.join(rootDir, id), meta: path.join(rootDir, `${id}.json`) };
  };

  const get = async (key) => {
    const { data: dataPath, meta: metaPath } = pathsFor(key);
    let data;
    try {
      data = await fs.readFile(dataPath);
    } catch {
      return null;
    }
    let meta = {};
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch {
      meta = {};
    }
    return {
      key: String(key),
      body: data,
      size: data.byteLength,
      httpMetadata: { contentType: meta.contentType || '' },
      httpEtag: meta.etag || `"${keyHash(key)}"`,
      customMetadata: meta.customMetadata || {},
      uploaded: meta.uploaded ? new Date(meta.uploaded) : undefined,
    };
  };

  const put = async (key, value, options = {}) => {
    const { data: dataPath, meta: metaPath } = pathsFor(key);
    const data = await toBuffer(value);
    const etag = `"${createHash('md5').update(data).digest('hex')}"`;
    const meta = {
      key: String(key),
      contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
      size: data.byteLength,
      etag,
      uploaded: new Date().toISOString(),
    };
    await fs.mkdir(rootDir, { recursive: true });
    await fs.writeFile(dataPath, data);
    await fs.writeFile(metaPath, JSON.stringify(meta));
    return { key: String(key), size: data.byteLength, etag };
  };

  const remove = async (key) => {
    const { data: dataPath, meta: metaPath } = pathsFor(key);
    await fs.rm(dataPath, { force: true });
    await fs.rm(metaPath, { force: true });
  };

  const list = async () => ({ objects: [], truncated: false });

  return { get, put, delete: remove, list };
}
