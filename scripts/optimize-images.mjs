import { access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
const assets = [
  { input: 'logo.png', output: 'logo.webp', width: 256, options: { quality: 82, effort: 6 } },
  { input: 'auth-factory-buildings.png', output: 'auth-factory-buildings.webp', options: { quality: 78, effort: 6 } },
  { input: 'inspection-seal.png', output: 'inspection-seal.webp', options: { quality: 82, effort: 6 } },
];

await Promise.all(assets.map(async ({ input, output, width, options }) => {
  const inputPath = path.join(publicDir, input);
  try {
    await access(inputPath);
  } catch {
    await access(path.join(publicDir, output));
    return;
  }
  const image = sharp(inputPath);
  if (width) image.resize({ width, withoutEnlargement: true });
  await image.webp(options).toFile(path.join(publicDir, output));
}));
