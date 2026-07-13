import { describe, expect, it } from 'vitest';
import { assertTrustedLegacyMarkup } from './LegacyShell';
import * as LegacyShellModule from './LegacyShell';

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

describe('initial legacy layout state', () => {
  it('renders a persisted collapsed sidebar before legacy boot completes', () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => (key === 'sidebar-collapsed' ? '1' : null) },
    });

    try {
      const getInitialLegacyMarkup = (LegacyShellModule as any).getInitialLegacyMarkup;
      expect(typeof getInitialLegacyMarkup).toBe('function');
      expect(getInitialLegacyMarkup(true)).toContain('class="shell legacy-shell-booting sidebar-collapsed"');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
    }
  });
});
