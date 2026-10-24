import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const br = promisify(brotliCompress);
const gz = promisify(gzip);
let count = 0;
let originalBytes = 0;
let brotliBytes = 0;
async function visit(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await visit(file); continue; }
    if (!/\.(?:html?|css|m?js|json|svg|txt|webmanifest)$/i.test(entry.name)) continue;
    const input = await fs.readFile(file);
    const [brotli, zipped] = await Promise.all([
      br(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gz(input, { level: 9 }),
    ]);
    if (brotli.length < input.length) await fs.writeFile(`${file}.br`, brotli);
    if (zipped.length < input.length) await fs.writeFile(`${file}.gz`, zipped);
    count++; originalBytes += input.length; brotliBytes += Math.min(input.length, brotli.length);
  }
}
await visit(root);
console.log(`Precompressed ${count} assets: ${originalBytes} → ${brotliBytes} bytes (Brotli).`);
