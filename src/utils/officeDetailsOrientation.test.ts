// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountOfficeDetailsOverlay, toggleOfficeDetailsOrientation } from './officeDetailsOrientation';
afterEach(() => document.body.replaceChildren());
it('opens a reversible landscape view in the top layer and retains button focus', () => {
  const overlay = document.createElement('div');
  const button = document.createElement('button');
  overlay.appendChild(button); document.body.appendChild(overlay);
  const show = vi.fn(); const hide = vi.fn();
  Object.defineProperties(overlay, { showPopover: { value: show }, hidePopover: { value: hide } });
  toggleOfficeDetailsOrientation(overlay, button);
  expect(overlay.classList.contains('is-landscape')).toBe(true);
  expect(overlay.getAttribute('popover')).toBe('manual');
  expect(show).toHaveBeenCalledOnce();
  expect(overlay.style.position).toBe('fixed');
  expect(overlay.style.animation).toBe('none');
  expect(overlay.style.gridTemplateRows).toBe('minmax(0, 1fr)');
  expect(button.textContent).toBe('还原');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(button);
  toggleOfficeDetailsOrientation(overlay, button);
  expect(hide).not.toHaveBeenCalled();
  expect(overlay.getAttribute('popover')).toBe('manual');
  expect(overlay.classList.contains('is-landscape')).toBe(false);
  expect(button.textContent).toBe('横向查看');
  expect(overlay.style.inset).toBe('0');
  expect(overlay.style.transform).toBe('none');
});
it('mounts the portrait shade against the full viewport rather than the record list', () => {
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  const show = vi.fn();
  Object.defineProperty(overlay, 'showPopover', { value: show });
  mountOfficeDetailsOverlay(overlay);
  expect(show).toHaveBeenCalledOnce();
  expect(overlay.getAttribute('popover')).toBe('manual');
  // happy-dom does not yet parse dynamic viewport units.
  expect(overlay.style.inset).toBe('0');
  expect(overlay.style.maxWidth).toBe('none');
  expect(overlay.style.maxHeight).toBe('none');
  expect(overlay.style.position).toBe('fixed');
});
it('supports browsers without popovers and does not mutate table content', () => {
  const overlay = document.createElement('div');
  overlay.innerHTML = '<table><tbody><tr><td>3kg</td></tr></tbody></table><button>横向查看</button>';
  Object.defineProperty(overlay, 'showPopover', { value: undefined });
  const table = overlay.querySelector('table');
  const button = overlay.querySelector('button')!;
  toggleOfficeDetailsOrientation(overlay, button);
  expect(overlay.querySelector('table')).toBe(table);
  expect(table?.textContent).toBe('3kg');
  toggleOfficeDetailsOrientation(overlay, button);
  expect(button.getAttribute('aria-pressed')).toBe('false');
});
