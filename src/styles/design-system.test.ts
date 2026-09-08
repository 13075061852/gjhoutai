import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const globalStyles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('./foundation/base.css', import.meta.url), 'utf8');
const css = readFileSync(new URL('./components/design-system.css', import.meta.url), 'utf8');
describe('shared visual contract', () => {
  it('loads the shared contract on the initial screen, not only after login', () => {
    expect(globalStyles).toContain('./components/design-system.css');
  });
  it('defines one typography and control scale', () => {
    for (const token of ['--font-size-md:14px', '--font-size-sm:13px', '--font-weight-semibold:600', '--control-height-md:40px', '--control-height-sm:32px']) {
      expect(tokens).toContain(token);
    }
  });
  it('keeps keyboard focus, disabled options and reduced motion in the common layer', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('.custom-select-option:disabled');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toMatch(/body\s+button\s*\{[^}]*height:/);
  });
});
