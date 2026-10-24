// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_PRESETS } from '../../utils/themePresets';
import { applyInitialThemeState } from '../../utils/themeBootstrap';

beforeEach(async () => {
  vi.resetModules(); localStorage.clear();
  document.body.innerHTML = '<div id="themePresetGrid"></div><div id="fontPresetGrid"></div><button id="themeResetBtn">恢复默认</button>';
  window.GJHApp = {} as NonNullable<typeof window.GJHApp>;
  await import('./theme-settings');
  window.GJHApp.themeSettings.init();
});
afterEach(() => {
  window.GJHApp?.themeSettings?.cleanup?.();
  document.body.innerHTML = ''; delete document.body.dataset.theme;
  document.documentElement.removeAttribute('style'); localStorage.clear();
});
const choose = (id: string) => document.querySelector<HTMLButtonElement>(`[data-theme-preset="${id}"]`)!;

describe('live global palette selection', () => {
  it('previews and applies every coordinated preset, including sidebar state', () => {
    expect(document.querySelectorAll('.theme-preview-nav')).toHaveLength(13);
    for (const theme of THEME_PRESETS) {
      choose(theme.id).click();
      expect(localStorage.getItem('gjh-theme-id-v1')).toBe(theme.id);
      expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe(theme.vars['--sidebar-bg']);
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(theme.vars['--accent']);
      expect(choose(theme.id).getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelectorAll('[data-theme-preset][aria-pressed="true"]')).toHaveLength(1);
    }
  });

  it('restores the same palette after refresh and preserves focus when rebuilding cards', () => {
    choose('rosewood').focus(); choose('rosewood').click();
    expect((document.activeElement as HTMLElement).dataset.themePreset).toBe('rosewood');
    const sidebar = document.documentElement.style.getPropertyValue('--sidebar-bg');
    document.documentElement.removeAttribute('style');
    applyInitialThemeState();
    expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe(sidebar);
  });

  it('keeps a selected font through theme changes and supports reset', () => {
    document.querySelector<HTMLButtonElement>('[data-font-preset="mono"]')!.click();
    const family = document.documentElement.style.getPropertyValue('--app-font-family');
    choose('midnight').click(); choose('green').click();
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toBe(family);
    document.getElementById('themeResetBtn')!.click();
    expect(document.documentElement.dataset.colorTheme).toBe('workspace');
    expect(document.documentElement.dataset.fontPreset).toBe('system');
  });

  it('does not accumulate click handlers during reinitialization', () => {
    window.GJHApp.themeSettings.init(); window.GJHApp.themeSettings.init();
    const listener = vi.fn(); window.addEventListener('gjh:theme-change', listener);
    choose('indigo').click(); expect(listener).toHaveBeenCalledTimes(1);
    window.GJHApp.themeSettings.cleanup();
    choose('blue').click(); expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('gjh:theme-change', listener);
  });
});
