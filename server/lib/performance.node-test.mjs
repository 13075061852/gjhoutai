import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gzipSync, gunzipSync, brotliDecompressSync } from 'node:zlib';
import sharp from 'sharp';
import { acceptedEncoding, prepareApiResponse } from './http-performance.mjs';
import { serveStatic } from './static.mjs';
import { createImageOptimizer } from './images.mjs';

const payload = JSON.stringify({ data: Array.from({ length: 500 }, (_, id) => ({ id, text: 'test property data' })) });
const response = () => new Response(payload, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

test('encoding negotiation honours q=0 and ordering', () => {
  assert.equal(acceptedEncoding('gzip, br'), 'br');
  assert.equal(acceptedEncoding('br;q=0, gzip;q=0.8'), 'gzip');
  assert.equal(acceptedEncoding('br;q=0,gzip;q=0'), null);
  assert.equal(acceptedEncoding('gzip;q=1, br;q=0.2'), 'gzip');
  assert.equal(acceptedEncoding(''), null);
});

test('authenticated data supports compressed delivery and private 304 revalidation', async () => {
  for (const encoding of ['gzip', 'br']) {
    const request = new Request('https://test/api/property-data', { headers: { 'accept-encoding': encoding } });
    const first = await prepareApiResponse(request, response(), '/api/property-data');
    assert.equal(first.status, 200);
    assert.equal(first.headers['content-encoding'], encoding);
    assert.equal(first.headers['cache-control'], 'private, no-cache');
    assert.ok(first.body.length < payload.length / 4);
    const decoded = encoding === 'br' ? brotliDecompressSync(first.body) : gunzipSync(first.body);
    assert.equal(decoded.toString(), payload);
    const second = await prepareApiResponse(new Request(request, { headers: { 'if-none-match': first.headers.etag, 'accept-encoding': encoding } }), response(), '/api/property-data');
    assert.equal(second.status, 304);
    assert.equal(second.body, null);
    assert.ok(second.headers.vary.includes('cookie'));
    assert.ok(second.headers.vary.includes('accept-encoding'));
    assert.equal(second.headers['content-encoding'], undefined);
    const changed = await prepareApiResponse(new Request(request, { headers: { 'if-none-match': first.headers.etag } }), new Response('{"changed":true}', { headers: { 'content-type': 'application/json' } }), '/api/property-data');
    assert.equal(changed.status, 200);
  }
});

test('errors and sensitive auth/config data cannot become cached successes', async () => {
  for (const status of [401, 403, 404]) {
    const result = await prepareApiResponse(new Request('https://test/api/property-data', { headers: { 'if-none-match': '*' } }), new Response('{}', { status, headers: { 'cache-control': 'no-store' } }), '/api/property-data');
    assert.equal(result.status, status);
    assert.equal(result.headers.etag, undefined);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  for (const endpoint of ['/api/config', '/api/auth/me', '/api/users']) {
    const result = await prepareApiResponse(new Request(`https://test${endpoint}`), response(), endpoint);
    assert.equal(result.headers.etag, undefined);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
});

test('WebP negotiation is separate from the untouched original download', async () => {
  const original = Buffer.from('original-png');
  const converted = Buffer.from('webp');
  let calls = 0;
  const optimizer = async () => { calls++; return converted; };
  for (const [accept, suffix, expectedType] of [['image/webp,image/png', '', 'image/webp'], ['*/*', '', 'image/png'], ['image/webp', '?format=original', 'image/png'], ['image/webp;q=0,image/png', '', 'image/png']]) {
    const result = await prepareApiResponse(new Request(`https://test/api/blob/spectrum/test${suffix}`, { headers: { accept } }), new Response(original, { headers: { 'content-type': 'image/png' } }), '/api/blob/spectrum/test', optimizer);
    assert.equal(result.headers['content-type'], expectedType);
    assert.deepEqual(result.body, expectedType === 'image/webp' ? converted : original);
    assert.ok(result.headers.vary.includes('accept'));
  }
  assert.equal(calls, 1);
});

test('lossless image derivatives preserve pixels and survive a process cache restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gjh-image-test-'));
  try {
    const source = await sharp({ create: { width: 512, height: 256, channels: 3, background: '#ececec' } }).png({ compressionLevel: 0 }).toBuffer();
    const original = Buffer.from(source);
    const optimizer = createImageOptimizer({ cacheDir: dir });
    const [result, same] = await Promise.all([optimizer(source), optimizer(source)]);
    assert.ok(result?.length < source.length / 10);
    assert.deepEqual(result, same);
    assert.equal((await sharp(result).metadata()).format, 'webp');
    assert.deepEqual(await sharp(source).ensureAlpha().raw().toBuffer(), await sharp(result).ensureAlpha().raw().toBuffer());
    assert.deepEqual(source, original);
    const cached = createImageOptimizer({ cacheDir: dir, loadSharp: () => { throw new Error('must not reconvert'); } });
    assert.deepEqual(await cached(source), result);
    assert.equal(await optimizer(Buffer.from('not-an-image')), null);
    assert.equal(await createImageOptimizer({ maxBytes: 2 })(source), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('static responses serve compressed variants, HEAD, 304, and reject traversal', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gjh-static-test-'));
  const server = http.createServer((req, res) => { void serveStatic(dir, req.url, res, req.method === 'HEAD', req.headers); });
  try {
    const content = 'body { color: red; }\n'.repeat(100);
    await writeFile(path.join(dir, 'test.css'), content);
    await writeFile(path.join(dir, 'test.css.gz'), gzipSync(content));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/test.css`;
    const first = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(first.headers.get('content-encoding'), 'gzip');
    assert.equal(await first.text(), content);
    const head = await fetch(url, { method: 'HEAD', headers: { 'accept-encoding': 'gzip' } });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const validated = await fetch(url, { headers: { 'if-none-match': first.headers.get('etag') } });
    assert.equal(validated.status, 304);
    const forbidden = await fetch(url.replace('test.css', '%2e%2e%2fprivate.txt'));
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
