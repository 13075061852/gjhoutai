import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const legacyRoot = join(process.cwd(), 'src', 'legacy');

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

if (filesWithNoCheck.length) {
  console.error('Legacy // @ts-nocheck is not allowed:');
  filesWithNoCheck.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log('Legacy ts-nocheck check passed (0 files).');
