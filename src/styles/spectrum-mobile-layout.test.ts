import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/spectrum-mobile.css', import.meta.url), 'utf8');

describe('spectrum phone toolbar sizing', () => {
  it('hides both the phone disclosure and actions even after resizing an expanded desktop menu', () => {
    const phoneCss = css.slice(css.indexOf('@media (max-width: 720px)'));
    expect(phoneCss).toContain('.spectrum-toolbar-menu-toggle,\n  .app .shell .spectrum-mobile-layout .spectrum-toolbar-actions { display: none; }');
    expect(phoneCss).not.toContain('.is-actions-expanded > .spectrum-toolbar-actions');
  });
  it('keeps wide actions inline and discloses a second-row menu based on available toolbar width', () => {
    expect(css).toContain('container: spectrum-toolbar / inline-size;');
    expect(css).toContain('@media (min-width: 721px)');
    expect(css).toContain('@container spectrum-toolbar (max-width: 900px)');
    expect(css).toContain('.spectrum-toolbar-row { flex-wrap: nowrap; }');
    expect(css).toContain('.spectrum-toolbar-actions { display: none; }');
    expect(css).toContain('.is-actions-expanded > .spectrum-toolbar-actions');
    expect(css).toContain('display: flex; flex: 1 0 100%; width: 100%;');
    expect(css).toContain('.spectrum-toolbar-menu-toggle { display: none; }');
  });
  it('animates the selected action row in both directions without leaving a collapsed gap', () => {
    expect(css).toContain('display: grid; grid-template-rows: 0fr; gap: 0; min-height: 0;');
    expect(css).toContain('margin-top: -12px; padding: 0; border-top: 0 solid var(--border);');
    expect(css).toContain('grid-template-rows: 1fr; margin-top: 0; padding-top: 10px;');
    expect(css).toContain('transition: grid-template-rows 240ms ease');
    expect(css).toContain('min-height: 0; overflow: hidden; align-items: center;');
    expect(css).toContain('visibility: hidden; pointer-events: none;');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
  it('keeps the selected count left and all three selection actions flush right', () => {
    // A legacy flex justify-content:space-between makes an implicit grid column
    // shrink to its contents; a 100%-wide child alone cannot fix that.
    expect(css).toMatch(/\.spectrum-selected-block \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*justify-content: stretch;[^}]*justify-items: stretch/);
    expect(css).toMatch(/\.spectrum-selected-head \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*width: 100%/);
    expect(css).toMatch(/\.spectrum-selected-actions \{[^}]*justify-self: end;[^}]*justify-content: flex-end;[^}]*margin-left: auto/);
  });
  it('makes the body-level detail dialog a viewport-wide bottom sheet', () => {
    expect(css).toContain('body .spectrum-compact-detail-dialog.dialog-overlay');
    expect(css).toContain('position: fixed; inset: 0; width: 100%; height: 100dvh;');
    expect(css).toContain('display: flex; align-items: flex-end; justify-content: center;');
    expect(css).toContain('flex: 0 1 auto; width: 100%; min-width: 0; max-width: 100%; max-height: 94dvh;');
    expect(css).toContain('margin: 0; padding: 16px 16px max(16px, env(safe-area-inset-bottom));');
    expect(css).toContain('border: 0; border-radius: 12px 12px 0 0; box-sizing: border-box;');
  });
  it('resets desktop flex bases on vertical toolbar children', () => {
    for (const name of ['spectrum-toolbar-row', 'spectrum-toolbar-main']) {
      const phoneCss = css.slice(css.indexOf('@media (max-width: 720px)'));
      const rule = phoneCss.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))?.[1];
      expect(rule).toContain('flex: 0 0 auto');
      expect(rule).toContain('min-height: 0');
      expect(rule).toContain('height: auto');
    }
  });
  it('hides upload, import, export and print actions on phones', () => {
    expect(css).toContain('.spectrum-toolbar-actions { display: none; }');
  });
  it('renders two cards per row on phones without changing empty states', () => {
    expect(css).toMatch(/\.spectrum-gallery\.is-grid:not\(\.is-empty\) \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toContain('-webkit-line-clamp: 2');
  });
  it('keeps thumbnail height identical regardless of title wrapping', () => {
    expect(css).toMatch(/\.spectrum-gallery\.is-grid \.spectrum-card-image \{[^}]*flex: 0 0 100px; height: 100px; min-height: 100px/);
    expect(css).toMatch(/\.spectrum-gallery\.is-grid \.spectrum-card-image img \{[^}]*object-fit: contain/);
    expect(css).toMatch(/\.spectrum-gallery\.is-grid \.spectrum-card-body \{[^}]*flex: 1 1 0/);
  });
  it('puts the controls on a right-aligned toolbar row and removes the empty phone gallery header', () => {
    expect(css).toMatch(/\.spectrum-toolbar > \.spectrum-gallery-controls \{[^}]*width: 100%[^}]*justify-content: flex-end; flex-wrap: wrap/);
    expect(css).toContain('.spectrum-toolbar > .spectrum-gallery-controls > .spectrum-sort-field { display: none; }');
    expect(css).toContain('.spectrum-gallery-head { display: none; }');
  });
  it('aligns gallery padding with filters without stacked panel or header spacing', () => {
    expect(css).toMatch(/\.spectrum-gallery-panel \{[^}]*padding: 0;/);
    expect(css).toMatch(/\.spectrum-toolbar \{[^}]*padding: 12px;/);
    expect(css).toMatch(/\.spectrum-gallery \{[^}]*padding: 12px;/);
  });
  it('only expands the toolbar onto extra rows on very narrow phones', () => {
    expect(css).toContain('@media (max-width: 340px)');
    expect(css).not.toContain('420px');
  });
});
