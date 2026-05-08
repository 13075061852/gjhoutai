import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ADAPTER = path.join(ROOT, 'src/utils/iconParkAdapter.ts');
const BRIDGE = path.join(ROOT, 'src/styles/foundation/iconpark-bridge.css');

const adapterSrc = fs.readFileSync(ADAPTER, 'utf-8');
const bridgeSrc = fs.readFileSync(BRIDGE, 'utf-8');

const adapterMapped = new Set(
  Array.from(adapterSrc.matchAll(/'ti-[a-z0-9-]+'/g)).map((m) => m[0].slice(1, -1)),
);

const bridgeMapped = new Set(
  Array.from(bridgeSrc.matchAll(/\.ti-[a-z0-9-]+/g)).map((m) => m[0].slice(1)),
);

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...walk(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const usedIcons = new Set<string>();

for (const file of walk(path.join(ROOT, 'src'))) {
  if (file === ADAPTER || file === BRIDGE) continue;
  const content = fs.readFileSync(file, 'utf-8');
  for (const m of content.matchAll(/ti-[a-z0-9-]+/g)) {
    usedIcons.add(m[0]);
  }
}

const missingAdapter = Array.from(usedIcons).filter((i) => !adapterMapped.has(i)).sort();
const missingBridge = Array.from(usedIcons).filter((i) => !bridgeMapped.has(i)).sort();

if (missingAdapter.length > 0) {
  console.error(`\n❌ Missing in iconParkAdapter.ts (${missingAdapter.length}):`);
  missingAdapter.forEach((i) => console.error(`  ${i}`));
}

if (missingBridge.length > 0) {
  console.error(`\n❌ Missing in iconpark-bridge.css (${missingBridge.length}):`);
  missingBridge.forEach((i) => console.error(`  ${i}`));
}

if (missingAdapter.length === 0 && missingBridge.length === 0) {
  console.log('✅ All ti-* icon classes have mappings in both adapter and bridge.');
  process.exit(0);
} else {
  process.exit(1);
}
