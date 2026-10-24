// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountSpectrumToolbarActions } from './spectrumToolbarActions';

afterEach(() => document.body.replaceChildren());
function fixture() {
  document.body.innerHTML = '<div class="spectrum-toolbar"><div class="spectrum-toolbar-row"><div class="spectrum-toolbar-main"><input></div><div class="spectrum-toolbar-actions"><button id="spectrumUploadBtn">上传图谱</button><button disabled>打印列表</button></div></div></div>';
  const toolbar = document.querySelector<HTMLElement>('.spectrum-toolbar')!;
  const actions = toolbar.querySelector<HTMLElement>('.spectrum-toolbar-actions')!;
  const upload = actions.querySelector<HTMLButtonElement>('button')!;
  const click = vi.fn(); upload.addEventListener('click', click);
  const cleanup = mountSpectrumToolbarActions(toolbar);
  const toggle = toolbar.querySelector<HTMLButtonElement>('.spectrum-toolbar-menu-toggle')!;
  return { toolbar, actions, upload, toggle, click, cleanup };
}
it('starts collapsed and toggles the original action row without replacing controls', () => {
  const { actions, upload, toggle, click, toolbar, cleanup } = fixture();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.getAttribute('aria-controls')).toBe(actions.id);
  expect(toggle.textContent).toBe('更多操作');
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(toolbar.querySelector('.is-actions-expanded')).not.toBeNull();
  expect(toggle.textContent).toBe('收起操作');
  expect(actions.querySelector('#spectrumUploadBtn')).toBe(upload);
  upload.click(); expect(click).toHaveBeenCalledOnce();
  expect(actions.querySelector<HTMLButtonElement>('button:disabled')?.disabled).toBe(true);
  toggle.click(); expect(toggle.getAttribute('aria-expanded')).toBe('false');
  cleanup();
});
it('supports Escape, restores focus, and removes disclosure markup on cleanup', () => {
  const { toolbar, actions, toggle, cleanup } = fixture();
  toggle.click();
  actions.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
  cleanup();
  expect(toolbar.querySelector('.spectrum-toolbar-menu-toggle')).toBeNull();
  expect(toolbar.querySelector('.is-actions-expanded')).toBeNull();
  expect(actions.hasAttribute('id')).toBe(false);
  expect(actions.querySelectorAll('button')).toHaveLength(2);
});
it('preserves an existing action group ID and tolerates absent controls', () => {
  document.body.innerHTML = '<div class="spectrum-toolbar-row"><div id="existingActions" class="spectrum-toolbar-actions"></div></div>';
  const cleanup = mountSpectrumToolbarActions(document.body);
  expect(document.querySelector('button')?.getAttribute('aria-controls')).toBe('existingActions');
  cleanup();
  expect(document.getElementById('existingActions')).not.toBeNull();
  expect(() => mountSpectrumToolbarActions(document.createElement('div'))()).not.toThrow();
});
