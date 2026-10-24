// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync(new URL('./pages/spectrum-preview.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../legacy/features/spectrum-analysis.ts', import.meta.url), 'utf8');

describe('spectrum preview workspace', () => {
  it('renders an image-only preview without AI controls, model labels or analysis handlers', () => {
    const start = source.indexOf('const renderImagePreview =');
    const end = source.indexOf('const switchImagePreview =', start);
    const preview = source.slice(start, end);
    expect(preview).toContain('dialog-card is-image-only');
    expect(preview).not.toContain('renderPreviewAiPanel');
    expect(preview).not.toContain('spectrum-preview-model-line');
    expect(source).not.toContain('data-spectrum-toggle-ai-panel');
    expect(source).not.toContain('const aiExtractButton =');
    expect(source).not.toContain('const mergeRunButton =');
    expect(css).toContain('.spectrum-preview-card.is-image-only .spectrum-preview-card-body { display: grid; grid-template-columns: minmax(0, 1fr);');
  });
  it('places enlarge before clear in the selection actions instead of in detail forms', () => {
    const markup = readFileSync(new URL('../legacy/legacyMarkup.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('<button class="spectrum-detail-image"');
    expect(source).not.toContain('<button class="spectrum-compact-detail-image"');
    expect(source).not.toContain('class="spectrum-detail-preview-button"');
    expect(markup.indexOf('spectrumPreviewSelectedBtn')).toBeLessThan(markup.indexOf('spectrumClearSelectedBtn'));
    expect(source).toContain("refs.previewSelectedBtn?.addEventListener('click'");
    expect(source).toContain('if (refs.previewSelectedBtn) refs.previewSelectedBtn.disabled = selectedCount < 1;');
    expect(source).toContain('const item = selected.find((entry) => entry.id === state.activeId) || selected[0]');
  });

  it('supports an explicit reversible landscape mode confined to the preview', () => {
    expect(source).toContain('data-spectrum-preview-orientation aria-pressed="${landscape}"');
    expect(source).toContain("refs.previewDialog.classList.toggle('is-landscape')");
    expect(source).toContain("landscape ? '还原' : '横屏'");
    expect(source).toContain("dialog.className = 'spectrum-preview-dialog dialog-overlay'");
    expect(css).toContain('@media (max-width: 980px) and (orientation: portrait)');
    expect(css).toContain('width: 100dvh; height: 100dvw; max-width: none; max-height: none;');
    expect(css).toContain('transform: translate(-50%, -50%) rotate(90deg)');
    expect(css).toContain('grid-template-columns: 104px minmax(0, 1fr)');
  });

  it('integrates landscape controls into the image header and removes the extra toolbar row', () => {
    expect(source).toContain('if (landscape) {');
    expect(source).toContain('cardHead.appendChild(topbar)');
    expect(css).toContain('.dialog-overlay.is-landscape { grid-template-rows: minmax(0, 1fr); }');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) auto auto;');
    expect(css).toContain('.spectrum-preview-main { grid-column: 2; grid-row: 1; }');
    expect(css).not.toContain('grid-template-rows: 34px minmax(0, 1fr)');
  });
  it('places return and close controls in their own toolbar, not over thumbnails', () => {
    expect(source).toContain('<header class="spectrum-preview-topbar">');
    expect(source).toContain('class="spectrum-preview-location"');
    expect(css).toContain('grid-template-rows: 44px minmax(0, 1fr)');
    expect(css).toContain('position: static; inset: auto; transform: none;');
  });
  it('keeps the portal viewport upright and uses a bottom thumbnail rail on narrow screens', () => {
    expect(css).toContain('position: fixed; inset: 0; top: 0; left: 0; transform: none;');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('grid-template-rows: 38px minmax(0, 1fr) 86px');
    expect(css).toContain('object-fit: contain');
  });
  it('contains the full image in a definite centered frame without intrinsic grid overflow', () => {
    const frame = css.match(/body \.spectrum-preview-dialog \.spectrum-preview-image-frame \{([^}]+)\}/)?.[1] || '';
    const image = css.match(/body \.spectrum-preview-dialog \.spectrum-preview-image-frame > img \{([^}]+)\}/)?.[1] || '';
    expect(frame).toContain('position: relative');
    expect(frame).toContain('overflow: hidden');
    expect(image).toContain('position: absolute; inset: 0');
    expect(image).toContain('width: 100%; height: 100%');
    expect(image).toContain('padding: inherit; box-sizing: border-box');
    expect(image).toContain('object-fit: contain; object-position: center center');
    expect(css).toContain('grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; padding: 0; overflow: hidden');
  });
  it('exposes the selected thumbnail and omits placeholder metadata', () => {
    expect(source).toContain('aria-pressed="${entry.id === item.id}"');
    const start = source.indexOf('const renderImagePreview =');
    const preview = source.slice(start, source.indexOf('const switchImagePreview =', start));
    expect(preview).not.toContain('spectrum-preview-card-foot');
    expect(preview).not.toContain('分类：');
    expect(preview).not.toContain('标签：');
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr); border:');
    expect(source).toContain('patchSpectrumPreviewDialog(refs.previewDialog, markup');
    expect(source).toContain('revealActiveSpectrumThumb(rail)');
    expect(source).toContain('onNavigate: switchImagePreview');
    expect(css).toContain('.is-landscape .spectrum-preview-rail { touch-action: none; scroll-behavior: auto; scroll-snap-type: none; -webkit-overflow-scrolling: auto; }');
    expect(css).not.toMatch(/gradient\(/);
  });
});
