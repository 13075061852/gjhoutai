// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { captureOfficeListScroll } from './office-list-scroll';

it('preserves the lower list position across open, save and close rerenders', () => {
  const root = document.createElement('div');
  const markup = '<div data-office-list-key="sampling-page1"></div>';
  root.innerHTML = markup;
  (root.firstElementChild as HTMLElement).scrollTop = 680;
  (root.firstElementChild as HTMLElement).scrollLeft = 24;
  for (const modal of ['<div role="dialog"></div>', '', '<div role="dialog"></div>', '']) {
    const restore = captureOfficeListScroll(root);
    root.innerHTML = markup + modal;
    restore();
    expect(root.firstElementChild!.scrollTop).toBe(680);
    expect(root.firstElementChild!.scrollLeft).toBe(24);
  }
});
it('does not carry old scroll into another page, filter, or section', () => {
  const root = document.createElement('div');
  root.innerHTML = '<div data-office-list-key="old"></div>';
  root.firstElementChild!.scrollTop = 680;
  const restore = captureOfficeListScroll(root);
  root.innerHTML = '<div data-office-list-key="new"></div>';
  restore();
  expect(root.firstElementChild!.scrollTop).toBe(0);
  root.innerHTML = '';
  expect(restore).not.toThrow();
  expect(captureOfficeListScroll(root)).not.toThrow();
});
