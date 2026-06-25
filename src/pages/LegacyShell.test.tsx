import { describe, expect, it } from 'vitest';
import { assertTrustedLegacyMarkup } from './LegacyShell';

describe('assertTrustedLegacyMarkup', () => {
  it('allows inert legacy shell markup', () => {
    expect(assertTrustedLegacyMarkup('<section class="page-section"></section>')).toBe('<section class="page-section"></section>');
  });

  it('rejects executable legacy shell markup', () => {
    expect(() => assertTrustedLegacyMarkup('<script>alert(1)</script>')).toThrow(/executable HTML/);
    expect(() => assertTrustedLegacyMarkup('<img src="x" onerror="alert(1)">')).toThrow(/executable HTML/);
    expect(() => assertTrustedLegacyMarkup('<a href="javascript:alert(1)">x</a>')).toThrow(/executable HTML/);
  });
});
