import { describe, expect, it } from 'vitest';
// @ts-expect-error Node test dependency; not part of the browser application.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./layout/page-transition.css', import.meta.url), 'utf8');
const residentStyles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('page transition layout', () => {
  it('keeps loading CSS resident and disables slow entrance stacks and reduced-motion spinners', () => {
    expect(residentStyles).toContain('./layout/page-transition.css');
    expect(css).toContain('.content.is-page-loading > .page-section { visibility: hidden; pointer-events: none; }');
    expect(css).toContain('position: absolute; inset: 0;');
    expect(css).toContain('page-transition-enter 120ms');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('html[data-reduced-motion="1"]');
    expect(css).not.toContain('animation-delay');
  });
});
