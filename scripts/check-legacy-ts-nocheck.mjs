import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const legacyRoot = join(process.cwd(), 'src', 'legacy');

const allowedLegacyNoCheckFiles = new Set([
  'src/legacy/core/utils.ts',
  'src/legacy/components/confirm-dialog.ts',
  'src/legacy/components/custom-select.ts',
  'src/legacy/components/dialog-consent-animation.ts',
  'src/legacy/components/search-box.ts',
  'src/legacy/components/system-notify.ts',
  'src/legacy/features/agent-butler.ts',
  'src/legacy/features/ai-call-analysis.ts',
  'src/legacy/features/apimart-media.ts',
  'src/legacy/features/chat.ts',
  'src/legacy/features/config.ts',
  'src/legacy/features/data-recognition.ts',
  'src/legacy/features/image-cutout.ts',
  'src/legacy/features/inspection-reports.ts',
  'src/legacy/features/project-skills.ts',
  'src/legacy/features/property-analysis.ts',
  'src/legacy/features/spectrum-analysis.ts',
  'src/legacy/features/theme-settings.ts',
  'src/legacy/features/business-pages/agent-query.ts',
  'src/legacy/features/business-pages/dashboard.ts',
  'src/legacy/features/business-pages/index.ts',
  'src/legacy/features/business-pages/inventory.ts',
  'src/legacy/features/business-pages/orders.ts',
  'src/legacy/features/business-pages/procurement.ts',
  'src/legacy/features/business-pages/shared.ts',
  'src/legacy/shell/navigation.ts',
]);

const walkTsFiles = (dir) => {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkTsFiles(path));
      continue;
    }
    if (path.endsWith('.ts')) files.push(path);
  }
  return files;
};

const toRepoPath = (path) => relative(process.cwd(), path).split(sep).join('/');

const filesWithNoCheck = walkTsFiles(legacyRoot).filter((file) => {
  const source = readFileSync(file, 'utf8');
  return source.startsWith('// @ts-nocheck');
}).map(toRepoPath);

const unexpected = filesWithNoCheck.filter((file) => !allowedLegacyNoCheckFiles.has(file));
const staleAllowed = [...allowedLegacyNoCheckFiles].filter((file) => !filesWithNoCheck.includes(file));

if (unexpected.length || staleAllowed.length) {
  if (unexpected.length) {
    console.error('Unexpected legacy // @ts-nocheck files:');
    unexpected.forEach((file) => console.error(`- ${file}`));
  }
  if (staleAllowed.length) {
    console.error('Legacy // @ts-nocheck baseline has stale entries:');
    staleAllowed.forEach((file) => console.error(`- ${file}`));
  }
  process.exit(1);
}

console.log(`Legacy ts-nocheck baseline unchanged (${filesWithNoCheck.length} files).`);
