// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { applyThemePreset, getThemePreset, THEME_PRESETS, THEME_VAR_NAMES } from './themePresets';

function contrast(a: string, b: string) {
  const luminance = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((total, n, i) => total + n * [.2126, .7152, .0722][i], 0);
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0] + .05) / (l[1] + .05);
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  delete document.body.dataset.theme;
});

describe('coordinated global themes', () => {
  it('preserves existing theme IDs with unique sidebar palettes and complete tokens', () => {
    expect(THEME_PRESETS).toHaveLength(13);
    expect(new Set(THEME_PRESETS.map((p) => p.vars['--sidebar-bg'])).size).toBe(13);
    for (const theme of THEME_PRESETS) expect(Object.keys(theme.vars)).toEqual(THEME_VAR_NAMES);
    expect(getThemePreset('unknown').id).toBe('workspace');
  });

  it.each(THEME_PRESETS.map((p) => [p.id, p] as const))('%s has readable navigation, text and primary actions', (_id, theme) => {
    const v = theme.vars;
    for (const [fg, bg] of [
      ['--sidebar-text', '--sidebar-bg'], ['--sidebar-muted', '--sidebar-bg'],
      ['--sidebar-active-text', '--sidebar-active'], ['--text', '--surface'],
      ['--muted', '--surface'], ['--on-accent', '--accent'],
    ]) expect(contrast(v[fg], v[bg]), `${theme.id}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--sidebar-focus'], v['--sidebar-bg']), `${theme.id}: navigation focus`).toBeGreaterThanOrEqual(3);
  });

  it('switches every token and removes dark state without disturbing the font', () => {
    document.documentElement.style.setProperty('--app-font-family', 'example-font');
    for (const id of ['midnight', 'emerald-night', 'blue', 'dark', 'white', 'workspace']) {
      const theme = getThemePreset(id);
      applyThemePreset(theme);
      for (const [key, value] of Object.entries(theme.vars)) expect(document.documentElement.style.getPropertyValue(key)).toBe(value);
      expect(document.documentElement.dataset.colorMode).toBe(theme.mode);
      expect(document.body.dataset.theme).toBe(theme.mode === 'dark' ? 'dark' : undefined);
      expect(document.documentElement.style.colorScheme).toBe(theme.mode);
    }
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toBe('example-font');
  });
});
