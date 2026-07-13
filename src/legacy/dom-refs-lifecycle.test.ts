import { describe, expect, it } from 'vitest';
import domRefsSource from './core/dom-refs.ts?raw';
import bootstrapSource from './bootstrap.ts?raw';

describe('legacy DOM reference lifecycle', () => {
  it('refreshes the existing refs object after the React shell remounts', () => {
    expect(domRefsSource).toContain('export function refreshLegacyDomRefs()');
    expect(domRefsSource).toContain('Object.assign(refs, nextRefs)');
    expect(bootstrapSource).toContain('refreshLegacyDomRefs()');
  });
});
