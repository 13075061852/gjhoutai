import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const lockRoot = packageLock.packages?.[''];

if (!lockRoot) {
  throw new Error('package-lock.json is missing the root package entry.');
}

const exactSections = ['dependencies', 'devDependencies', 'optionalDependencies', 'overrides'];
const rangePattern = /^[~^]/;
const errors = [];

for (const section of exactSections) {
  const entries = Object.entries(packageJson[section] ?? {});

  for (const [name, version] of entries) {
    if (rangePattern.test(version)) {
      errors.push(`${section}.${name} uses ranged version "${version}". Use an exact version.`);
    }
  }
}

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const packageEntries = packageJson[section] ?? {};
  const lockEntries = lockRoot[section] ?? {};

  for (const [name, version] of Object.entries(packageEntries)) {
    if (lockEntries[name] !== version) {
      errors.push(
        `package-lock root ${section}.${name} is "${lockEntries[name] ?? '<missing>'}", expected "${version}".`,
      );
    }

    const lockedPackage = packageLock.packages?.[`node_modules/${name}`];
    if (!lockedPackage) {
      errors.push(`package-lock.json is missing node_modules/${name}.`);
    } else if (lockedPackage.version !== version) {
      errors.push(`node_modules/${name} locks "${lockedPackage.version}", expected "${version}".`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('package-lock.json is consistent with exact package.json dependencies.');
