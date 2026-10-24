// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./pages/spectrum-analysis.css', import.meta.url), 'utf8');
const feature = readFileSync(new URL('../legacy/features/spectrum-analysis.ts', import.meta.url), 'utf8');

describe('spectrum image loading', () => {
  it('draws a spectrum trace while pending with an opacity-only image reveal', () => {
    expect(css).toContain('animation:spectrum-loader-draw 2.4s ease-in-out infinite');
    expect(css).toContain('0%{stroke-dashoffset:1;opacity:.35}');
    expect(css).toContain('.is-image-pending > .spectrum-image-loader{ display:block; }');
    expect(feature).toContain("loader.setAttribute('aria-hidden', 'true')");
    expect(feature).toContain('class="spectrum-loader-trace" pathLength="1"');
    expect(css).toContain('transition:opacity .24s ease-out');
    expect(css).toContain('content:"加载中"');
  });
  it('supports both OS and application reduced-motion settings', () => {
    expect(css).toContain('@media (prefers-reduced-motion:reduce)');
    expect(css).toMatch(/html\[data-reduced-motion="1"\][^{]+\.is-image-pending::before\{ animation:none; \}/);
  });
  it('keeps images pending until load and syncs cached and placeholder loads', () => {
    expect(feature).toContain('setSpectrumImagePending(node, true);\n          node.src = image;\n          syncSpectrumImageState(node);');
    expect(feature).toContain('setSpectrumImagePending(image, !image.complete);');
    expect(feature).toContain("image.addEventListener('load', () => syncSpectrumImageState(image));");
    expect(feature).toContain("frame?.setAttribute('aria-busy', String(pending));");
  });
});
