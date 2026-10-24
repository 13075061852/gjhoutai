// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountSpectrumPreviewRail } from './spectrumPreviewRail';
const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks(); document.body.replaceChildren(); delete document.documentElement.dataset.reducedMotion; });
function fixture(rotated = true) {
  document.body.innerHTML = `<div class="spectrum-preview-dialog ${rotated ? 'is-landscape' : ''}"><div class="spectrum-preview-rail"><button type="button">切图</button><button type="button">移除</button></div></div>`;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: !query.includes('prefers-reduced-motion') }) as MediaQueryList);
  const rail = document.querySelector<HTMLElement>('.spectrum-preview-rail')!;
  Object.defineProperties(rail, { clientHeight: { value: 300 }, scrollHeight: { value: 900 } });
  rail.getBoundingClientRect = () => new DOMRect(0, 0, 300, 104);
  rail.scrollTop = 100;
  const pointer = (type: string, x: number, y = 50, target: HTMLElement = rail) => {
    const event = new PointerEvent(type, { pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const dispose = mountSpectrumPreviewRail(rail);
  disposals.push(dispose);
  return { rail, pointer, dispose };
}
it('does not mistake implicit thumbnail capture transfer for the end of a drag', () => {
  const { rail, pointer } = fixture();
  const thumb = rail.querySelector('button')!;
  let captured = false;
  rail.hasPointerCapture = () => captured;
  rail.setPointerCapture = () => {
    captured = true;
    pointer('lostpointercapture', 100, 50, thumb);
  };
  rail.releasePointerCapture = () => { captured = false; };
  pointer('pointerdown', 100, 50, thumb);
  pointer('pointermove', 180, 50, thumb);
  expect(rail.scrollTop).toBe(180);
  expect(rail.dataset.previewInteracting).toBe('1');
  pointer('pointermove', 240);
  expect(rail.scrollTop).toBe(240);
  captured = false;
  pointer('lostpointercapture', 240);
  pointer('pointermove', 280, 50, document.body);
  expect(rail.scrollTop).toBe(280);
  pointer('pointercancel', 280, 50, document.body);
  expect(rail.dataset.previewInteracting).toBeUndefined();
});

it('tracks vertical finger movement in actual landscape without CSS rotation', () => {
  const { rail, pointer } = fixture();
  vi.mocked(window.matchMedia).mockImplementation(() => ({ matches: false }) as MediaQueryList);
  rail.getBoundingClientRect = () => new DOMRect(0, 0, 104, 300);
  pointer('pointerdown', 50, 200);
  pointer('pointermove', 50, 120);
  expect(rail.scrollTop).toBe(180);
  pointer('pointermove', 50, 140);
  expect(rail.scrollTop).toBe(160);
});

it('keeps cumulative finger motion when the compositor reports a delayed scrollTop', () => {
  const { rail, pointer } = fixture();
  const writes: number[] = [];
  Object.defineProperty(rail, 'scrollTop', { configurable: true, get: () => 100, set: (value: number) => writes.push(value) });
  pointer('pointerdown', 100);
  pointer('pointermove', 180); pointer('pointermove', 260); pointer('pointermove', 340);
  expect(writes).toEqual([180, 260, 340]);
  pointer('pointercancel', 340);
});

it('maps physical horizontal swipes to vertical rail scrolling in CSS-rotated landscape mode', () => {
  const { rail, pointer } = fixture();
  pointer('pointerdown', 100);
  expect(pointer('pointermove', 180).defaultPrevented).toBe(true);
  expect(rail.scrollTop).toBe(180);
  pointer('pointermove', 20);
  expect(rail.scrollTop).toBe(20);
  pointer('pointermove', -1000);
  expect(rail.scrollTop).toBe(0);
  pointer('pointermove', 2000);
  expect(rail.scrollTop).toBe(600);
});
it('preserves thumbnail and remove taps but suppresses accidental clicks after dragging', () => {
  const { rail, pointer } = fixture();
  const buttons = rail.querySelectorAll('button');
  const click = vi.fn();
  buttons.forEach((button) => button.addEventListener('click', click));
  pointer('pointerdown', 100); pointer('pointerup', 100);
  buttons[0].click(); buttons[1].click();
  expect(click).toHaveBeenCalledTimes(2);
  pointer('pointerdown', 100); pointer('pointermove', 180); pointer('pointerup', 180);
  buttons[0].click();
  expect(click).toHaveBeenCalledTimes(2);
  pointer('pointerdown', 100); pointer('pointerup', 100);
  buttons[1].click();
  expect(click).toHaveBeenCalledTimes(3);
});
it('leaves native portrait and non-rotated landscape scrolling alone', () => {
  const { rail, pointer } = fixture(false);
  pointer('pointerdown', 100);
  expect(pointer('pointermove', 180).defaultPrevented).toBe(false);
  expect(rail.scrollTop).toBe(100);
});
it('stops scrolling after cancellation and removes handlers on preview disposal', () => {
  const { rail, pointer, dispose } = fixture();
  pointer('pointerdown', 100); pointer('pointercancel', 100); pointer('pointermove', 180);
  expect(rail.scrollTop).toBe(100);
  dispose();
  pointer('pointerdown', 100); pointer('pointermove', 180);
  expect(rail.scrollTop).toBe(100);
});

it('reverses immediately after overshooting either edge without retracing the overshoot', () => {
  const { rail, pointer } = fixture();
  pointer('pointerdown', 100);
  pointer('pointermove', -1000);
  expect(rail.scrollTop).toBe(0);
  pointer('pointermove', -980);
  expect(rail.scrollTop).toBe(20);
  pointer('pointermove', 2000);
  expect(rail.scrollTop).toBe(600);
  pointer('pointermove', 1990);
  expect(rail.scrollTop).toBe(590);
});

function animationClock() {
  let now = 100;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++id, callback); return id; });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((key) => { frames.delete(key); });
  return {
    frames,
    advance(ms: number) { now += ms; },
    tick(ms = 16) {
      now += ms;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

it('coasts after a flick, decelerates, and stops when touched again or disposed', () => {
  const { rail, pointer, dispose } = fixture();
  const clock = animationClock();
  pointer('pointerdown', 100);
  clock.advance(20); pointer('pointermove', 140);
  clock.advance(20); pointer('pointermove', 180);
  pointer('pointerup', 180);
  expect(rail.scrollTop).toBe(180);
  expect(clock.frames.size).toBe(1);
  clock.tick();
  const firstStep = rail.scrollTop - 180;
  expect(firstStep).toBeGreaterThan(0);
  const before = rail.scrollTop;
  clock.tick();
  expect(rail.scrollTop - before).toBeLessThan(firstStep);
  pointer('pointerdown', 180);
  expect(clock.frames.size).toBe(0);
  const stopped = rail.scrollTop;
  clock.tick();
  expect(rail.scrollTop).toBe(stopped);
  clock.advance(20); pointer('pointermove', 210); pointer('pointerup', 210);
  expect(clock.frames.size).toBe(1);
  dispose();
  expect(clock.frames.size).toBe(0);
});

it('stops inertia at the boundary and never exceeds the scroll range', () => {
  const { rail, pointer } = fixture();
  const clock = animationClock();
  rail.scrollTop = 550;
  pointer('pointerdown', 100);
  clock.advance(20); pointer('pointermove', 140); pointer('pointerup', 140);
  clock.tick();
  expect(rail.scrollTop).toBe(600);
  expect(clock.frames.size).toBe(0);
});

it('does not coast after a paused drag, cancellation, or with reduced motion', () => {
  const { pointer } = fixture();
  const clock = animationClock();
  pointer('pointerdown', 100);
  clock.advance(20); pointer('pointermove', 140);
  clock.advance(100); pointer('pointerup', 140);
  expect(clock.frames.size).toBe(0);
  pointer('pointerdown', 100);
  clock.advance(20); pointer('pointermove', 140); pointer('pointercancel', 140);
  expect(clock.frames.size).toBe(0);
  document.documentElement.dataset.reducedMotion = '1';
  pointer('pointerdown', 100);
  clock.advance(20); pointer('pointermove', 140); pointer('pointerup', 140);
  expect(clock.frames.size).toBe(0);
});
