// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./layout/workspace.css', import.meta.url), 'utf8');

describe('workspace spacing contracts', () => {
  it('keeps selected spectrum cards from shrinking and gives metadata its own row', () => {
    expect(css).toContain('.spectrum-selected-item { flex: 0 0 auto;');
    expect(css).toContain('.spectrum-selected-meta { grid-column: 1 / -1; grid-row: 2;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 24px;');
    expect(css).toContain('white-space: nowrap; overflow: hidden; text-overflow: ellipsis;');
    expect(css).toContain('.spectrum-selected-main span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;');
  });

  it('removes old section spacing in both expanded and collapsed navigation', () => {
    expect(css).toContain('.sidebar-scroll > .sidebar-section { margin: 0 0 4px; padding: 0; border: 0; gap: 4px; }');
    expect(css).toContain('.sidebar-scroll > .sidebar-section { padding: 0; margin: 0 0 4px; border: 0; gap: 4px; }');
    expect(css).toContain('.sidebar-section:last-of-type { margin-bottom: 0; }');
    expect(css).not.toContain('.sidebar-section { margin: 0 0 24px;');
  });

  it('defines separate shared scales for page, panel and control spacing', () => {
    expect(css).toContain('--workspace-page-pad: 12px');
    expect(css).toContain('--workspace-panel-gap: 12px');
    expect(css).not.toMatch(/--workspace-page-pad:\s*(16|20)px/);
    expect(css).toContain('--workspace-panel-pad: 16px');
    expect(css).toContain('--workspace-control-gap: 8px');
    expect(css).toContain('.content { padding: var(--workspace-page-pad)');
  });

  it('uses three real spectrum columns and animates the collapsed third track', () => {
    expect(css).toContain('grid-template-columns: clamp(180px, 14vw, 220px) minmax(0, 1fr) clamp(250px, 18vw, 320px)');
    expect(css).toContain('.spectrum-detail-panel { grid-column: 3; padding: 0; visibility: visible; }');
    expect(css).toContain('.spectrum-workbench.is-detail-collapsed { grid-template-columns: clamp(180px, 14vw, 220px) minmax(0, 1fr) 0px; }');
    expect(css).not.toContain('.spectrum-workbench.is-detail-collapsed .spectrum-detail-panel { display: none; }');
    expect(css).toContain('.spectrum-workbench.is-detail-collapsed .spectrum-detail-panel {\n    visibility: hidden;');
  });

  it('contains spectrum search content and uses only one selected mode background', () => {
    expect(css).toContain('.spectrum-search { position: relative; isolation: isolate; overflow: hidden; }');
    expect(css).toContain('.spectrum-search input { flex: 1 1 0; width: 0; min-width: 0; }');
    expect(css).toContain('.spectrum-search .spectrum-mode-switch::before { display: none; }');
    expect(css).toContain('.spectrum-search .spectrum-mode-btn { height: 28px; border-radius: 5px; }');
  });

  it('keeps the query mode switch text-only, including hover, with a keyboard focus indicator', () => {
    expect(css).toMatch(/\.analysis-search-mode-btn \{[^}]*border: 0;[^}]*color: var\(--accent\); background: transparent;/);
    expect(css).toContain('.analysis-search-mode-btn:hover { color: var(--text); background: transparent; }');
    expect(css).toContain('.analysis-search-mode-btn:focus-visible { outline: 2px solid var(--accent);');
    const palette = readFileSync(new URL('./foundation/theme-colors.css', import.meta.url), 'utf8');
    expect(palette).not.toContain('.analysis-search-mode-btn');
  });
  it('keeps module and gallery gutters on the same scale', () => {
    expect(css).toContain('.spectrum-workbench { gap: var(--workspace-panel-gap); }');
    expect(css).toContain('.spectrum-gallery.is-grid { gap: var(--workspace-panel-gap); }');
    expect(css).toContain('.spectrum-page { height: 100%; }');
  });
});
