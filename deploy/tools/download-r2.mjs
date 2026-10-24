import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [listUrl, rootDir, token] = process.argv.slice(2);
if (!listUrl || !rootDir || !token) {
  console.error('usage: node download-r2.mjs <https://.../list> <objectsDir> <token>');
  process.exit(1);
}

const fileUrl = listUrl.replace(/\/list\/?$/, '/file');
const keyHash = (key) => createHash('sha1').update(String(key)).digest('hex');
const headers = { 'x-migrate-token': token };

await fs.mkdir(rootDir, { recursive: true });

const listResponse = await fetch(listUrl, { headers });
if (!listResponse.ok) {
  console.error(`list failed: HTTP ${listResponse.status}`);
  process.exit(1);
}
const items = await listResponse.json();
console.log(`objects to download: ${items.length}`);

let done = 0;
let failed = 0;
let bytes = 0;
const concurrency = 8;
let cursor = 0;

async function worker() {
  while (cursor < items.length) {
    const item = items[cursor];
    cursor += 1;
    try {
      const response = await fetch(`${fileUrl}?key=${encodeURIComponent(item.key)}`, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const id = keyHash(item.key);
      await fs.writeFile(path.join(rootDir, id), data);
      await fs.writeFile(path.join(rootDir, `${id}.json`), JSON.stringify({
        key: item.key,
        contentType: item.contentType || '',
        customMetadata: item.customMetadata || {},
        size: data.byteLength,
        etag: item.etag ? `"${String(item.etag).replace(/^"|"$/g, '')}"` : `"${id}"`,
        uploaded: new Date().toISOString(),
      }));
      bytes += data.byteLength;
      done += 1;
      if (done % 50 === 0) console.log(`downloaded ${done}/${items.length}`);
    } catch (error) {
      failed += 1;
      console.error(`failed ${item.key}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`done=${done} failed=${failed} bytes=${bytes}`);
if (failed > 0) process.exit(1);
