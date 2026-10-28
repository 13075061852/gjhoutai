// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync(new URL('./pages/data-toolbar.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
describe('shared property and spectrum toolbar', () => {
  it('loads after workspace overrides and removes both row dividers and extra top padding', () => {
    expect(styles.indexOf('./pages/data-toolbar.css')).toBeGreaterThan(styles.indexOf('./pages/workspace-refinements.css'));
    expect(css).toMatch(/:is\(\.analysis-page \.analysis-filter-bottom, \.spectrum-page \.spectrum-toolbar-tags\)\s*\{\s*border-top: 0;\s*padding-top: 0;/);
  });
  it('removes the visible tag label without reserving an empty grid column', () => {
    expect(css).toContain('.spectrum-toolbar-tags { grid-template-columns: minmax(0, 1fr); }');
    expect(css).toContain('.spectrum-toolbar-tags > .spectrum-toolbar-label { display: none; }');
  });
  it('shares desktop panel, search, action and tag dimensions while preserving phone layouts', () => {
    expect(css).toContain('@media (min-width: 981px)');
    expect(css).toMatch(/:is\(\.analysis-page \.analysis-filter-card, \.spectrum-page \.spectrum-toolbar\)\s*\{\s*padding: 16px;\s*gap: 12px;/);
    expect(css).toMatch(/:is\(\.analysis-page \.analysis-search-lg, \.spectrum-page \.spectrum-search\)\s*\{\s*height: 42px;/);
    expect(css).toMatch(/\.analysis-toolbar-btn\s*\{\s*height: 42px;\s*min-height: 42px;/);
    expect(css).toMatch(/:is\(\.analysis-page \.analysis-sheet-tab, \.spectrum-page \.spectrum-tag-filter\)\s*\{\s*height: 28px;/);
    expect(css).not.toContain('background:');
    expect(css).not.toContain('.analysis-search-mode-btn');
  });
});
