// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { patchSpectrumPreviewDialog, revealActiveSpectrumThumb } from './spectrumPreviewDom';
import { mountSpectrumPreviewRail } from './spectrumPreviewRail';

const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach((fn) => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const markup = (active: string, ids = ['a', 'b', 'c']) => `<header class="spectrum-preview-topbar"></header>
  <aside class="spectrum-preview-rail">${ids.map((id) => `<div class="spectrum-preview-entry"><button class="spectrum-preview-thumb ${id === active ? 'is-active' : ''}" data-spectrum-preview-open="${id}" aria-pressed="${id === active}"><img alt="${id}"></button></div>`).join('')}</aside>
  <main class="spectrum-preview-main">${active}</main>`;
function fixture() {
  const dialog = document.createElement('div'); dialog.className = 'spectrum-preview-dialog is-landscape'; document.body.append(dialog);
  return dialog;
}

it('keeps the same connected rail, thumbnail nodes and scroll offset when the chart changes', () => {
  const dialog = fixture(); const reset = vi.fn();
  const first = patchSpectrumPreviewDialog(dialog, markup('a'), reset);
  const rail = first.rail; rail.scrollTop = 112;
  const thumb = rail.querySelector('button'); const image = rail.querySelector('img');
  const observer = new MutationObserver(() => {}); observer.observe(dialog, { childList: true });
  reset.mockClear();
  const next = patchSpectrumPreviewDialog(dialog, markup('b'), reset);
  expect(next.retained).toBe(true); expect(next.rail).toBe(rail);
  expect(rail.scrollTop).toBe(112); expect(rail.querySelector('button')).toBe(thumb); expect(rail.querySelector('img')).toBe(image);
  expect(reset).not.toHaveBeenCalled();
  expect(observer.takeRecords().some((record) => [...record.removedNodes].includes(rail))).toBe(false);
  expect(dialog.querySelector('.spectrum-preview-main')!.textContent).toBe('b');
  expect(rail.querySelector('.is-active')!.getAttribute('data-spectrum-preview-open')).toBe('b');
  observer.disconnect();
});

it('allows a captured rail drag to continue through a main-chart update', () => {
  const dialog = fixture(); const { rail } = patchSpectrumPreviewDialog(dialog, markup('a'), () => {});
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  Object.defineProperties(rail, { clientHeight: { value: 300 }, scrollHeight: { value: 900 } });
  rail.getBoundingClientRect = () => new DOMRect(0, 0, 300, 104);
  disposals.push(mountSpectrumPreviewRail(rail));
  const pointer = (type: string, x: number) => rail.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, bubbles: true, cancelable: true }));
  pointer('pointerdown', 100); pointer('pointermove', 160);
  expect(rail.scrollTop).toBe(60);
  patchSpectrumPreviewDialog(dialog, markup('b'), () => { throw new Error('must not dispose active rail'); });
  revealActiveSpectrumThumb(rail);
  pointer('pointermove', 210);
  expect(rail.scrollTop).toBe(110);
  pointer('pointercancel', 210);
});

it('releases the old rail before the preview list really changes', () => {
  const dialog = fixture(); const first = patchSpectrumPreviewDialog(dialog, markup('a'), () => {});
  const reset = vi.fn(() => expect(first.rail.isConnected).toBe(true));
  const next = patchSpectrumPreviewDialog(dialog, markup('c', ['a', 'c']), reset);
  expect(reset).toHaveBeenCalledOnce(); expect(next.retained).toBe(false); expect(next.rail).not.toBe(first.rail);
});

it('reveals active entries in local axes without fighting touch or inertia', () => {
  const dialog = fixture(); const { rail } = patchSpectrumPreviewDialog(dialog, markup('c'), () => {});
  rail.style.flexDirection = 'column';
  Object.defineProperty(rail, 'clientHeight', { value: 200 });
  const entry = rail.querySelector('.is-active')!.parentElement!;
  Object.defineProperties(entry, { offsetTop: { value: 350 }, offsetHeight: { value: 80 } });
  rail.dataset.previewInteracting = '1'; rail.scrollTop = 100;
  revealActiveSpectrumThumb(rail); expect(rail.scrollTop).toBe(100);
  delete rail.dataset.previewInteracting;
  revealActiveSpectrumThumb(rail); expect(rail.scrollTop).toBe(230);
});
