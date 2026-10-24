// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSpectrumPreviewZoom, pinchPreviewZoom, previewLocalPoint } from './spectrumPreviewZoom';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture(onNavigate?: (step: number) => void) {
  const frame = document.createElement('div');
  frame.style.padding = '0px';
  frame.innerHTML = '<img alt="测试图谱" />';
  document.body.append(frame);
  Object.defineProperties(frame, { clientWidth: { value: 300 }, clientHeight: { value: 200 } });
  frame.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200);
  const image = frame.querySelector('img')!;
  Object.defineProperties(image, { naturalWidth: { value: 400 }, naturalHeight: { value: 200 } });
  const cleanup = mountSpectrumPreviewZoom(frame, { onNavigate });
  cleanups.push(cleanup);
  const pointer = (type: string, id: number, x: number, y = 100) => frame.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true,
  }));
  return { frame, image, cleanup, pointer };
}

describe('spectrum preview pinch zoom', () => {
  it('switches up/down once on release at fit size, but not for tiny or horizontal gestures', () => {
    const navigate = vi.fn();
    const { pointer } = fixture(navigate);
    pointer('pointerdown', 1, 150, 150); pointer('pointermove', 1, 150, 60);
    expect(navigate).not.toHaveBeenCalled();
    pointer('pointerup', 1, 150, 60);
    expect(navigate).toHaveBeenLastCalledWith(1);
    pointer('pointerdown', 1, 150, 50); pointer('pointerup', 1, 150, 140);
    expect(navigate).toHaveBeenLastCalledWith(-1);
    pointer('pointerdown', 1, 150, 100); pointer('pointerup', 1, 150, 120);
    pointer('pointerdown', 1, 50, 100); pointer('pointerup', 1, 250, 140);
    pointer('pointerdown', 1, 150, 150); pointer('pointercancel', 1, 150, 20);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('never switches during a pinch, while zoomed, or on the remaining finger after pinch', () => {
    const navigate = vi.fn();
    const { pointer, frame } = fixture(navigate);
    pointer('pointerdown', 1, 75, 100); pointer('pointerdown', 2, 225, 100);
    pointer('pointermove', 2, 300, 100); pointer('pointerup', 2, 300, 100);
    pointer('pointermove', 1, 75, 20); pointer('pointerup', 1, 75, 20);
    pointer('pointerdown', 1, 150, 150); pointer('pointerup', 1, 150, 20);
    expect(navigate).not.toHaveBeenCalled();
    frame.querySelector<HTMLButtonElement>('button')!.click();
    // A two-finger gesture that ends at 1× is not a single-finger swipe either.
    pointer('pointerdown', 1, 75, 100); pointer('pointerdown', 2, 225, 100);
    pointer('pointerup', 2, 225, 100); pointer('pointerup', 1, 75, 20);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps vertical chart swipes through the manually rotated viewport', () => {
    const navigate = vi.fn();
    const { frame, pointer } = fixture(navigate);
    const wrapper = document.createElement('div'); wrapper.className = 'spectrum-preview-dialog is-landscape';
    document.body.append(wrapper); wrapper.append(frame);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    frame.getBoundingClientRect = () => new DOMRect(0, 0, 200, 300);
    pointer('pointerdown', 1, 100, 150); pointer('pointermove', 1, 170, 150); pointer('pointerup', 1, 170, 150);
    expect(navigate).toHaveBeenLastCalledWith(1);
    pointer('pointerdown', 1, 100, 150); pointer('pointerup', 1, 30, 150);
    expect(navigate).toHaveBeenLastCalledWith(-1);
  });
  it('zooms around the fingers rather than the image center and limits magnification', () => {
    const result = pinchPreviewZoom({ scale: 1, x: 0, y: 0 }, { x: 75, y: 100 }, { x: 75, y: 100 }, 2, { x: 300, y: 200 });
    expect(result).toEqual({ scale: 2, x: 75, y: 0 });
    expect(pinchPreviewZoom(result, { x: 0, y: 0 }, { x: 0, y: 0 }, 100, { x: 300, y: 200 }).scale).toBe(5);
    expect(pinchPreviewZoom(result, { x: 0, y: 0 }, { x: 0, y: 0 }, .01, { x: 300, y: 200 }).scale).toBe(1);
  });
  it('maps finger movement correctly in manually rotated landscape previews', () => {
    expect(previewLocalPoint({ x: 110, y: 170 }, new DOMRect(10, 20, 200, 300), 300, 200, true)).toEqual({ x: 150, y: 100 });
    expect(previewLocalPoint({ x: 60, y: 120 }, new DOMRect(10, 20, 200, 300), 300, 200, true)).toEqual({ x: 100, y: 150 });
  });
  it('supports two-finger pinch followed by single-finger dragging without rerendering', () => {
    const { frame, image, pointer } = fixture();
    pointer('pointerdown', 1, 75);
    pointer('pointerdown', 2, 225);
    pointer('pointermove', 2, 300);
    expect(image.style.transform).toContain('scale(1.5)');
    pointer('pointermove', 1, 0);
    expect(image.style.transform).toBe('translate(0px, 0px) scale(2)');
    pointer('pointerup', 2, 300);
    pointer('pointermove', 1, 30);
    expect(image.style.transform).toBe('translate(30px, 0px) scale(2)');
    pointer('pointermove', 1, 1000, 1000);
    expect(image.style.transform).toBe('translate(150px, 50px) scale(2)');
    expect(frame.classList.contains('is-zoomed')).toBe(true);
    expect(frame.querySelector('img')).toBe(image);
  });
  it('restores the full centered image using reset, load or viewport resize', () => {
    const { frame, image, pointer } = fixture();
    const zoom = () => {
      pointer('pointerdown', 1, 75);
      pointer('pointerdown', 2, 225);
      pointer('pointermove', 2, 300);
    };
    zoom();
    const button = frame.querySelector<HTMLButtonElement>('button')!;
    expect(button.hidden).toBe(false);
    button.click();
    expect(image.style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(button.hidden).toBe(true);
    zoom();
    window.dispatchEvent(new Event('resize'));
    expect(frame.classList.contains('is-zoomed')).toBe(false);
    zoom();
    image.dispatchEvent(new Event('load'));
    expect(image.style.transform).toBe('translate(0px, 0px) scale(1)');
  });
  it('cancels pointers and removes listeners and controls on disposal', () => {
    const { frame, image, pointer, cleanup } = fixture();
    pointer('pointerdown', 1, 75);
    pointer('pointercancel', 1, 75);
    pointer('pointermove', 1, 300);
    expect(image.style.transform).toBe('');
    cleanup();
    pointer('pointerdown', 1, 75);
    pointer('pointerdown', 2, 225);
    pointer('pointermove', 2, 300);
    expect(image.style.transform).toBe('');
    expect(frame.querySelector('button')).toBeNull();
  });
  it('handles trackpad pinch without letting the wheel navigate to another image', () => {
    const { frame, image } = fixture();
    const event = new WheelEvent('wheel', { ctrlKey: true, deltaY: -69.314718, clientX: 150, clientY: 100, bubbles: true, cancelable: true });
    // happy-dom's WheelEvent currently omits inherited MouseEvent properties.
    Object.defineProperties(event, { ctrlKey: { value: true }, clientX: { value: 150 }, clientY: { value: 100 } });
    frame.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(frame.classList.contains('is-zoomed')).toBe(true);
    expect(image.style.transform).toContain('scale(1.999');
  });
});
