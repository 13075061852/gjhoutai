// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cssFiles = (directory: URL): URL[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory(): boolean }) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? cssFiles(url) : entry.name.endsWith('.css') ? [url] : [];
  });

describe('hover motion', () => {
  it('never lifts controls or cards on hover; keeps centering and entry animations intact', () => {
    const violations: string[] = [];
    for (const file of cssFiles(new URL('./', import.meta.url))) {
      const css = readFileSync(file, 'utf8') as string;
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!match[1].includes(':hover')) continue;
        if (/translateY\(\s*-\d*\.?\d+(?:px|rem|em)\b|translate(?:3d)?\([^,]+,\s*-\d*\.?\d+(?:px|rem|em)\b/.test(match[2])) {
          violations.push(`${file.pathname}: ${match[1].trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
