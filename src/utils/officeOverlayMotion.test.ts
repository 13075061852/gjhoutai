// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { deferOfficeOverlayClose } from './officeOverlayMotion';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); delete document.documentElement.dataset.reducedMotion; });
it('keeps the shade mounted during exit and completes only once', () => {
  vi.useFakeTimers();
  const overlay = document.createElement('div'); document.body.append(overlay);
  const done = vi.fn();
  expect(deferOfficeOverlayClose(overlay, done)).toBe(true);
  expect(overlay.classList.contains('is-closing')).toBe(true);
  expect(overlay.inert).toBe(true);
  deferOfficeOverlayClose(overlay, done);
  vi.advanceTimersByTime(180); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(20); expect(done).toHaveBeenCalledOnce();
});
it('does not rerender a modal removed by navigation', () => {
  vi.useFakeTimers();
  const overlay = document.createElement('div'); document.body.append(overlay);
  const done = vi.fn(); deferOfficeOverlayClose(overlay, done);
  overlay.remove(); vi.runAllTimers(); expect(done).not.toHaveBeenCalled();
});
it('closes immediately when reduced motion is enabled', () => {
  document.documentElement.dataset.reducedMotion = '1';
  const overlay = document.createElement('div');
  expect(deferOfficeOverlayClose(overlay, vi.fn())).toBe(false);
  expect(overlay.classList.contains('is-closing')).toBe(false);
});
