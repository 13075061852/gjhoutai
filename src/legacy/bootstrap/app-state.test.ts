// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { delete window.GJHApp; });
it('boots with the real core namespace, without retired chat state', async () => {
  vi.resetModules();
  window.GJHApp = { refs: {} as LegacyRefs, constants: {} as LegacyAppConstants, utils: {} as LegacyUtils };
  await expect(import('./app-state')).resolves.toBeDefined();
});
it('still rejects missing live core dependencies', async () => {
  vi.resetModules();
  window.GJHApp = {};
  await expect(import('./app-state')).rejects.toThrow('refs, constants, utils');
});
