// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLegacyPageFeature, isLegacyPageFeatureReady, preloadLegacyPageFeature, resetLegacyPageFeatures } from './feature-loader';
vi.mock('../features/theme-settings', () => ({}));

let init: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
beforeEach(() => {
  resetLegacyPageFeatures();
  init = vi.fn().mockResolvedValue(undefined);
  window.GJHApp = { themeSettings: { init } } as any;
});
afterEach(() => { resetLegacyPageFeatures(); });

describe('page feature readiness', () => {
  it('does not call a merely downloaded module ready, and shares one initialization', async () => {
    let resolve!: () => void;
    init.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    preloadLegacyPageFeature('theme-settings');
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(false);
    const first = ensureLegacyPageFeature('theme-settings');
    expect(ensureLegacyPageFeature('theme-settings')).toBe(first);
    await flush();
    expect(init).toHaveBeenCalledOnce();
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(false);
    resolve();
    await first;
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(true);
    expect(ensureLegacyPageFeature('theme-settings')).toBe(first);
  });

  it('releases failed init for retry rather than caching a broken page as ready', async () => {
    init.mockRejectedValueOnce(new Error('offline'));
    await expect(ensureLegacyPageFeature('theme-settings')).rejects.toThrow('offline');
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(false);
    await ensureLegacyPageFeature('theme-settings');
    expect(init).toHaveBeenCalledTimes(2);
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(true);
  });

  it('does not let an older shell completion mark a remounted feature ready', async () => {
    let resolve!: () => void;
    init.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    const old = ensureLegacyPageFeature('theme-settings');
    await flush();
    resetLegacyPageFeatures();
    resolve();
    await old;
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(false);
    await ensureLegacyPageFeature('theme-settings');
    expect(isLegacyPageFeatureReady('theme-settings')).toBe(true);
  });
});
