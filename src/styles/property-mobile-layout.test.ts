import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/property-mobile.css', import.meta.url), 'utf8');

describe('property analysis mobile layout', () => {
  it('toggles forward and reverse sorting with a single button instead of a select', () => {
    const markup = readFileSync(new URL('../legacy/legacyMarkup.ts', import.meta.url), 'utf8');
    const feature = readFileSync(new URL('../legacy/features/property-analysis.ts', import.meta.url), 'utf8');
    expect(markup).toContain('analysisSortToggle');
    expect(markup).not.toContain('analysisSortSelect');
    expect(feature).toContain("refs.sortToggle?.addEventListener('click'");
    expect(feature).toContain("state.sort = state.sort === 'forward' ? 'backward' : 'forward'");
    expect(feature).toContain("refs.sortToggle.textContent = reversed ? '反序' : '正序'");
  });
  it('keeps compare dialog actions readable in a two-column mobile toolbar', () => {
    expect(css).toContain('.analysis-compare-actions { grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('.analysis-compare-close { position: static; grid-column: 2; grid-row: 1;');
    expect(css).toContain('white-space: nowrap; word-break: normal;');
    expect(css).toContain('gap: 8px; overflow: visible;');
  });

  it('shares control height, corner radius and spacing across desktop and tablet', () => {
    expect(css).toContain('--analysis-control-height: 42px;');
    expect(css).toContain('--analysis-control-height: 38px;');
    expect(css).toContain('--analysis-control-radius: 6px;');
    expect(css).toContain('--analysis-control-gap: 8px;');
    expect(css).toMatch(/\.analysis-search-lg,\s*\.app \.shell \.analysis-page \.analysis-action-menu-toggle \{\s*height: var\(--analysis-control-height\);\s*min-height: var\(--analysis-control-height\);\s*border-radius: var\(--analysis-control-radius\);\s*box-sizing: border-box;/);
    expect(css).toContain('.analysis-filter-top { align-items: center; gap: var(--analysis-control-gap); }');
    expect(css).toContain('.analysis-search-mode-btn { border-radius: var(--analysis-control-radius); font-size: 12px; }');
  });

  it('places tablet actions beside search, above categories, matching phone', () => {
    const tablet = css.split('@media (min-width: 721px) and (max-width: 980px) {')[1]?.split('/* Phone analysis')[0];
    expect(tablet).toBeTruthy();
    expect(tablet).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(tablet).toContain('.analysis-filter-bottom { display: contents; }');
    expect(tablet).toContain('.analysis-search-lg { grid-column: 1; grid-row: 1;');
    expect(tablet).toContain('.analysis-status-row { grid-column: 2; grid-row: 1; position: relative;');
    expect(tablet).toContain('.analysis-sheet-tabs { grid-column: 1 / -1; grid-row: 2;');
  });

  it('keeps search and a single mode toggle on one row', () => {
    expect(css).toContain('grid-template-columns: 16px minmax(0, 1fr) auto');
    expect(css).toContain('grid-template-rows: 28px;');
    expect(css).toContain('#analysisSearchInput { grid-row: 1');
    expect(css).toContain('grid-row: 1; grid-column: 3');
    const markup = readFileSync(new URL('../legacy/legacyMarkup.ts', import.meta.url), 'utf8');
    expect(markup).toContain('data-search-mode-toggle');
    expect(markup).not.toContain('data-search-mode=');
    const feature = readFileSync(new URL('../legacy/features/property-analysis.ts', import.meta.url), 'utf8');
    expect(feature).toContain("state.searchMode = state.searchMode === 'fuzzy' ? 'exact' : 'fuzzy'");
    expect(feature).toContain("button.setAttribute('aria-pressed', String(exact))");
  });

  it('compacts the filter card and removes the internal divider', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; gap: 8px;');
    expect(css).toContain('.analysis-filter-bottom { display: contents; border-top: 0;');
    expect(css).toContain('.app .shell .analysis-page .analysis-action-group { display: none; }');
    expect(css).toContain('.analysis-filter-card > input[hidden] { display: none; }');
    expect(css).toContain('height: 38px;');
    expect(css).toContain('.analysis-status-row { grid-column: 2; grid-row: 1;');
    expect(css).toContain('.analysis-sheet-tabs { grid-column: 1 / -1; grid-row: 2;');
    const workspace = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
    expect(workspace).toContain('.analysis-selection-meta { display: none; }');
  });
  it('keeps action menu text readable in hovered, selected and disabled states', () => {
    const workspace = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
    expect(workspace).toContain('.analysis-toolbar-btn-primary:hover:not(:disabled)');
    expect(workspace).toContain('background: var(--accent-soft); color: var(--accent); border-color: var(--accent);');
    expect(workspace).toContain('.analysis-toolbar-btn:disabled:hover { background: var(--surface-2); color: var(--muted);');
    expect(workspace).toContain('.analysis-toolbar-btn :is(span, i, svg) { color: inherit; }');
  });

  it('centers the entire pagination group on desktop, tablet and phone', () => {
    const shared = css.split('/* One toolbar geometry')[0];
    expect(shared).toContain('.analysis-panel-footer { justify-content: center; }');
    expect(shared).toContain('.analysis-pagination { justify-content: center; margin-inline: auto; }');
    expect(css).toMatch(/\.analysis-page-numbers \{[^}]*flex: 0 1 auto/);
    expect(css).not.toMatch(/\.analysis-page-numbers \{[^}]*flex: 1 1 0/);
  });

  it('keeps navigation arrows fixed and centers compact page numbers without wrapping', () => {
    expect(css).toMatch(/\.analysis-pagination \{[^}]*flex-wrap: nowrap/);
    expect(css).toMatch(/\.analysis-page-numbers \{[^}]*flex-wrap: nowrap[^}]*justify-content: center[^}]*overflow: hidden/);
    expect(css).toMatch(/\.analysis-page-btn \{[^}]*flex: 0 0 36px/);
  });
});
