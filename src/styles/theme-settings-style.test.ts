import { describe, expect, it } from 'vitest';
// @ts-expect-error This test runs in Node; the browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';

const readStyle = (name: string) => readFileSync(new URL(`./pages/${name}`, import.meta.url), 'utf8');

describe('theme settings styles', () => {
  it('binds desktop and mobile navigation to semantic theme tokens, not a fixed dark teal', () => {
    const workspace = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
    for (const token of ['--sidebar-bg', '--sidebar-text', '--sidebar-muted', '--sidebar-active', '--sidebar-active-icon', '--sidebar-border', '--sidebar-focus']) {
      expect(workspace).toContain(`var(${token})`);
    }
    for (const stale of ['#172d35', '#2c555e', '#8faab3', '#c1d2d7']) expect(workspace).not.toContain(stale);
    const base = readFileSync(new URL('./foundation/base.css', import.meta.url), 'utf8');
    const darkBody = base.match(/body\[data-theme="dark"\]\{([\s\S]*?)\n    }/)?.[1] || '';
    expect(darkBody).not.toMatch(/--(?:bg|surface|accent|text|border|control-bg):/);
  });

  it('keeps selected category counts readable instead of inheriting light text on a light badge', () => {
    const css = readFileSync(new URL('./foundation/theme-colors.css', import.meta.url), 'utf8');
    const selector = 'html[data-color-theme] body .app .shell .analysis-sheet-tab.is-active:not(:disabled) .analysis-sheet-tab-count';
    const rule = css.slice(css.indexOf(selector)).split('}')[0];
    expect(css).toContain(selector);
    expect(rule).toContain('background: var(--on-accent);');
    expect(rule).toContain('color: var(--accent);');
    expect(css.indexOf(selector)).toBeGreaterThan(css.indexOf(':not(:disabled) :is(i, svg, span) { color: inherit; }'));
  });

  it('does not crop miniature theme previews with the old 40px swatch override', () => {
    const refinements = readStyle('workspace-refinements.css');
    expect(refinements).toContain('.theme-card-swatches { height: 110px; flex: 0 0 110px;');
    expect(readStyle('theme-settings.css')).toContain('.theme-preview .theme-preview-panel');
  });
  it('keeps the complete theme and font card layout in its own lazy stylesheet', () => {
    const themeStyles = readStyle('theme-settings.css');

    ['.theme-grid', '.theme-settings-panel', '.font-preset-grid', '.font-card', '.theme-card', '.theme-card-swatches']
      .forEach((selector) => expect(themeStyles).toContain(selector));
  });

  it('owns its styles without the retired AI call analysis module', () => {
    const themeStyles = readStyle('theme-settings.css');
    expect(themeStyles).toContain('.theme-card');
    expect(themeStyles).toContain('.font-card');
  });
});
