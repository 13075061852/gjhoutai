import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/workspace-refinements.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../legacy/features/theme-settings.ts', import.meta.url), 'utf8');

describe('cross-page workspace refinements', () => {
  it('removes the desktop/tablet top row without changing the phone navigation header', () => {
    const workspace = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');
    expect(workspace).toMatch(/@media \(min-width: 721px\) \{\s*\.app \.shell \{ --topbar: 0px; \}\s*\.app \.shell \.topbar \{ display: none; \}/);
  });
  it('loads after existing feature workspaces and explicitly scopes every page', () => {
    expect(styles.indexOf('./pages/workspace-refinements.css')).toBeGreaterThan(styles.indexOf('./pages/config-workspace.css'));
    for (const page of ['analysis-page', 'spectrum-page', 'biz-office-page', 'ai-config', 'theme-settings-page', 'ai-analysis-page']) {
      expect(css).toContain(`.app .shell .${page}`);
    }
  });
  it('removes only empty filter areas and balances record cards within each row', () => {
    expect(css).toContain('.analysis-filter-bottom { min-height: 0; }');
    expect(css).toContain('.analysis-filter-bottom:not(:has(button, input, select))');
    expect(css).toContain('.analysis-action-group:not(:has(> *)) { display: none; }');
    expect(css).toContain('.biz-office-record-list { align-items: stretch;');
  });
  it('improves tabular readability without changing horizontal scrolling or sticky positioning', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums;');
    expect(css).toContain('.analysis-table td { font-weight: 400; }');
    expect(css).toContain('.analysis-table-scroll { overscroll-behavior: contain;');
    expect(css).not.toContain('position: static');
    expect(css).not.toContain('overflow-x: hidden');
  });
  it('aligns theme panels with the shared page gutter and avoids doubled header spacing', () => {
    expect(css).toMatch(/\.theme-settings-shell \{ width: 100%; max-width: none; margin: 0;/);
    expect(css).toMatch(/\.theme-settings-shell \{[^}]*border: 1px solid var\(--border\); border-radius: 10px;/);
    expect(css).toMatch(/:is\(\.theme-settings-panel, \.font-settings-panel\) \{[^}]*flex: 0 0 auto;[^}]*border: 0; border-radius: 0;/);
    expect(css).toMatch(/:is\(\.theme-settings-panel-head, \.font-settings-head\) \{[^}]*margin-bottom: 0;/);
  });
  it('scrolls palette and fonts inside one bounded panel instead of the whole page', () => {
    expect(css).toContain('.content:has(> .theme-settings-page.active) { overflow: hidden; }');
    expect(css).toContain('.theme-settings-page.active { height: 100%; min-height: 0; overflow: hidden; }');
    expect(css).toMatch(/\.theme-settings-shell \{[^}]*height: 100%; min-height: 0; gap: 0; overflow-y: auto;/);
    expect(css).toContain('.font-settings-panel { border-top: 1px solid var(--border); }');
    expect(css).not.toContain('.theme-settings-shell { gap: 12px; }');
  });
  it('keeps theme selection accessible and adaptive with unclipped palette previews', () => {
    expect(css).toContain('minmax(min(220px, 100%), 1fr)');
    expect(css).toContain('.theme-card-swatches { height: 110px; flex: 0 0 110px;');
    expect(css).toContain('var(--preview-border, var(--border))');
    expect(css).toContain('.font-card-sample { min-width: 0;');
    expect(theme).toContain('data-theme-preset="${theme.id}" aria-pressed="${isActive}"');
    expect(theme).toContain('data-font-preset="${font.id}" aria-pressed="${isActive}"');
  });
  it('retains phone safety rules and does not override modals, gestures, hidden controls, or price visibility', () => {
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('overflow-wrap: anywhere;');
    for (const forbidden of ['.spectrum-toolbar-actions', '.is-landscape', '.biz-office-modal', '.system-notify', '.model-dropdown-option', '!important']) {
      expect(css).not.toContain(forbidden);
    }
  });
  it('provides keyboard focus, reduced motion and theme tokens for the single AI workspace', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('button:disabled');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('html[data-reduced-motion="1"]');
    expect(css).toContain('.ai-analysis-page .ai-analysis-text a');
    expect(css).not.toContain('.assistant ');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toContain('linear-gradient');
  });
});
