import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Derived files only: originals are never overwritten. Authentication belongs to the caller. */
export function createImageOptimizer({ cacheDir, loadSharp = () => import('sharp'), maxBytes = 16 * 1024 * 1024 } = {}) {
  let sharpPromise;
  let active = 0;
  let writes = 0;
  const pending = new Map();
  const skipped = new Set();
  const rememberSkip = (key) => {
    if (skipped.size >= 512) skipped.delete(skipped.values().next().value);
    skipped.add(key);
  };
  const prune = async () => {
    const files = await fs.readdir(cacheDir, { withFileTypes: true });
    const entries = await Promise.all(files.filter((f) => f.isFile() && /^[a-f0-9]{64}\.webp$/.test(f.name))
      .map(async (f) => { const file = path.join(cacheDir, f.name); const stat = await fs.stat(file).catch(() => null); return stat && { file, size: stat.size, time: stat.mtimeMs }; }));
    let total = entries.reduce((sum, f) => sum + (f?.size || 0), 0);
    for (const entry of entries.filter(Boolean).sort((a, b) => a.time - b.time)) {
      if (total <= 256 * 1024 * 1024) break;
      await fs.rm(entry.file, { force: true }); total -= entry.size;
    }
  };
  return async (source) => {
    if (!source?.length || source.length > maxBytes) return null;
    const key = createHash('sha256').update('lossless-webp-v1:').update(source).digest('hex');
    if (skipped.has(key)) return null;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const cachedFile = cacheDir && path.join(cacheDir, `${key}.webp`);
      if (cachedFile) {
        const cached = await fs.readFile(cachedFile).catch(() => null);
        if (cached?.length) return cached;
      }
      // A cache miss may fall back to the original under load, never queue unlimited work.
      if (active >= 2) return null;
      active += 1;
      try {
        sharpPromise ||= loadSharp().then((m) => m.default || m).catch(() => null);
        const sharp = await sharpPromise;
        if (!sharp) return null;
        const input = sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' });
        const meta = await input.metadata();
        if ((meta.pages || 1) > 1 || !['png', 'jpeg', 'tiff', 'webp', 'heif'].includes(meta.format)) { rememberSkip(key); return null; }
        const result = await input.rotate().webp({ lossless: true, effort: 4 }).toBuffer();
        if (result.length >= source.length) { rememberSkip(key); return null; }
        if (cachedFile) {
          const temp = `${cachedFile}.${randomUUID()}.tmp`;
          try {
            await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
            await fs.writeFile(temp, result, { mode: 0o600 });
            await fs.rename(temp, cachedFile);
            if (++writes % 32 === 0) void prune().catch(() => {});
          } catch { await fs.rm(temp, { force: true }).catch(() => {}); }
        }
        return result;
      } catch { rememberSkip(key); return null; }
      finally { active -= 1; }
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}
