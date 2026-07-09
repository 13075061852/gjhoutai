import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findIconClasses } from './icon-class-pattern.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ADAPTER = path.join(ROOT, 'src/utils/iconParkAdapter.ts');
const BRIDGE = path.join(ROOT, 'src/styles/foundation/iconpark-bridge.css');

const adapterSrc = fs.readFileSync(ADAPTER, 'utf-8');
const bridgeSrc = fs.readFileSync(BRIDGE, 'utf-8');

const adapterMapped = new Set(
  [...adapterSrc.matchAll(/'ti-[a-z0-9-]+'/g)].map((m) => m[0].slice(1, -1)),
);

const bridgeMapped = new Set(
  [...bridgeSrc.matchAll(/\.ti-[a-z0-9-]+/g)].map((m) => m[0].slice(1)),
);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
      files.push(...walk(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const usedIcons = new Set();

for (const file of walk(path.join(ROOT, 'src'))) {
  if (file === ADAPTER || file === BRIDGE) continue;
  const content = fs.readFileSync(file, 'utf-8');
  for (const iconClass of findIconClasses(content)) {
    usedIcons.add(iconClass);
  }
}

const missingAdapter = [...usedIcons].filter((i) => !adapterMapped.has(i)).sort();
const missingBridge = [...usedIcons].filter((i) => !bridgeMapped.has(i)).sort();

let exitCode = 0;

if (missingAdapter.length > 0) {
  console.error(`\n❌ Missing in iconParkAdapter.ts (${missingAdapter.length}):`);
  missingAdapter.forEach((i) => console.error(`     ${i}`));
  exitCode = 1;
}

if (missingBridge.length > 0) {
  console.error(`\n❌ Missing in iconpark-bridge.css (${missingBridge.length}):`);
  missingBridge.forEach((i) => console.error(`     ${i}`));
  exitCode = 1;
}

if (exitCode === 0) {
  console.log('✅ All ti-* icon classes have mappings in both adapter and bridge.');
}

process.exit(exitCode);
