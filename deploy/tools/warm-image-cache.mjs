import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createImageOptimizer } from '../../server/lib/images.mjs';

// Maintenance command: writes derivatives only, never touches originals or database rows.
const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || 'data');
const objectsDir = path.join(dataDir, 'objects');
const optimize = createImageOptimizer({ cacheDir: path.join(dataDir, 'image-cache') });
let count = 0;
let converted = 0;
let originalBytes = 0;
let servedBytes = 0;
for (const name of await fs.readdir(objectsDir)) {
  if (!/^[a-f0-9]{40}\.json$/.test(name)) continue;
  const meta = JSON.parse(await fs.readFile(path.join(objectsDir, name), 'utf8'));
  if (!/^image\/(png|jpeg|tiff|webp|bmp)$/i.test(meta.contentType || '')) continue;
  const source = await fs.readFile(path.join(objectsDir, name.slice(0, -5)));
  const result = await optimize(source);
  count++; if (result) converted++;
  originalBytes += source.length; servedBytes += result?.length || source.length;
}
console.log(JSON.stringify({ inspected: count, converted, originalBytes, servedBytes, savedPercent: originalBytes ? Math.round((1 - servedBytes / originalBytes) * 100) : 0 }));
