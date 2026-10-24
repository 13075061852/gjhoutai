// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSpectrumMobileLayout } from './spectrumMobileLayout';

function fixture(mobile: boolean) {
  let onChange: (() => void) | undefined;
  const mq = { matches: mobile, addEventListener: vi.fn((_event, fn) => { onChange = fn; }), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => mq));
  const root = document.createElement('section');
  root.innerHTML = `<div class="spectrum-toolbar"><div class="spectrum-toolbar-tags">标签</div></div>
    <aside class="spectrum-filter-panel"><div class="spectrum-filter-block"><div id="spectrumCategoryFilters"><button>全部</button></div></div><div class="spectrum-selected-block">已选列表</div></aside>`;
  document.body.append(root);
  return { root, mq, resize: (matches: boolean) => { mq.matches = matches; onChange?.(); } };
}

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('spectrum phone layout', () => {
  it('moves the same category controls directly above tags and adds a category label', () => {
    const { root } = fixture(true);
    const list = root.querySelector('#spectrumCategoryFilters');
    const button = list!.querySelector('button')!;
    const click = vi.fn(); button.addEventListener('click', click);
    const cleanup = mountSpectrumMobileLayout(root);
    const row = root.querySelector('.spectrum-mobile-categories')!;
    expect(row.querySelector('.spectrum-toolbar-label')?.textContent).toBe('分类');
    expect(row.nextElementSibling?.className).toBe('spectrum-toolbar-tags');
    expect(row.querySelector('#spectrumCategoryFilters')).toBe(list);
    expect(root.querySelectorAll('#spectrumCategoryFilters')).toHaveLength(1);
    button.click(); expect(click).toHaveBeenCalledOnce();
    cleanup();
  });

  it('uses the tablet breakpoint for the shared category row', () => {
    const { root } = fixture(true);
    const cleanup = mountSpectrumMobileLayout(root);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 1200px)');
    expect(root.querySelector('.spectrum-mobile-categories #spectrumCategoryFilters')).not.toBeNull();
    cleanup();
  });

  it('restores desktop controls when resizing, without duplicating filter nodes', () => {
    const { root, resize } = fixture(false);
    const cleanup = mountSpectrumMobileLayout(root);
    expect(root.querySelector('.spectrum-mobile-categories')).toBeNull();
    resize(true);
    expect(root.querySelector('.spectrum-toolbar .spectrum-selected-block')).not.toBeNull();
    resize(false);
    expect(root.querySelector('.spectrum-filter-block #spectrumCategoryFilters')).not.toBeNull();
    expect(root.querySelector('.spectrum-filter-panel .spectrum-selected-block')).not.toBeNull();
    expect(root.querySelector('.spectrum-mobile-categories')).toBeNull();
    cleanup();
  });

  it('moves all four actions below tags and preserves listeners, order and desktop positions', () => {
    let onChange: (() => void) | undefined;
    const mq = { matches: true, addEventListener: vi.fn((_event, fn) => { onChange = fn; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => mq));
    const root = document.createElement('section');
    root.innerHTML = `<div class="spectrum-toolbar"><div class="spectrum-toolbar-tags">标签</div></div>
      <div class="spectrum-filter-panel"><div class="spectrum-filter-block"><div id="spectrumCategoryFilters"></div></div>
        <div class="spectrum-selected-block"><div class="spectrum-selected-head">
          <div class="spectrum-filter-label"></div>
          <div class="spectrum-selected-actions"><button id="spectrumClearSelectedBtn">清空</button><button id="spectrumDeleteSelectedBtn">删除</button></div>
        </div></div>
      </div>
      <section class="spectrum-gallery-panel"><div class="spectrum-gallery-head"><div class="spectrum-gallery-controls">
        <button id="spectrumGalleryZoomBtn" disabled>放大</button><button id="spectrumToggleDetailBtn">编辑</button>
      </div></div></section>`;
    document.body.append(root);
    const controls = root.querySelector('.spectrum-gallery-controls')!;
    const edit = root.querySelector<HTMLButtonElement>('#spectrumToggleDetailBtn')!;
    const zoom = root.querySelector<HTMLButtonElement>('#spectrumGalleryZoomBtn')!;
    const click = vi.fn(); edit.addEventListener('click', click);
    const cleanup = mountSpectrumMobileLayout(root);
    const checkMobile = () => {
      expect(root.querySelector('.spectrum-toolbar-tags')?.nextElementSibling).toBe(controls);
      expect([...controls.querySelectorAll('button')].map(b => b.textContent)).toEqual(['放大', '清空', '删除', '编辑']);
      expect(root.querySelector('.spectrum-gallery-head .spectrum-gallery-controls')).toBeNull();
      expect(root.querySelectorAll('.spectrum-selected-actions')).toHaveLength(1);
      expect(root.querySelectorAll('#spectrumToggleDetailBtn')).toHaveLength(1);
      expect(zoom.disabled).toBe(true);
    };
    checkMobile();
    edit.click(); expect(click).toHaveBeenCalledTimes(1);
    for (let n = 0; n < 3; n++) {
      mq.matches = false; onChange?.();
      expect(root.querySelector('.spectrum-gallery-head .spectrum-gallery-controls')).toBe(controls);
      expect(controls.querySelector('.spectrum-selected-actions')).toBeNull();
      expect(root.querySelector('.spectrum-selected-head .spectrum-selected-actions')).not.toBeNull();
      mq.matches = true; onChange?.(); checkMobile();
    }
    cleanup();
    expect(root.querySelector('.spectrum-gallery-head .spectrum-gallery-controls')).toBe(controls);
    expect(root.querySelector('.spectrum-toolbar .spectrum-gallery-controls')).toBeNull();
    expect(root.querySelector('.spectrum-selected-head .spectrum-selected-actions')).not.toBeNull();
    edit.click(); expect(click).toHaveBeenCalledTimes(2);
  });

  it('cleans up responsive listeners and restores source positions on teardown', () => {
    const { root, mq } = fixture(true);
    mountSpectrumMobileLayout(root)();
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(root.classList.contains('spectrum-mobile-layout')).toBe(false);
    expect(root.querySelector('.spectrum-filter-block #spectrumCategoryFilters')).not.toBeNull();
  });
});
