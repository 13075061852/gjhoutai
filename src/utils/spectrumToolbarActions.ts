/** A disclosure for narrow toolbars; the original action nodes and listeners stay intact. */
export function mountSpectrumToolbarActions(toolbar: HTMLElement): () => void {
  const row = toolbar.querySelector<HTMLElement>('.spectrum-toolbar-row');
  const actions = row?.querySelector<HTMLElement>('.spectrum-toolbar-actions');
  if (!row || !actions) return () => {};
  const originalId = actions.getAttribute('id');
  if (!originalId) actions.id = 'spectrumToolbarActions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spectrum-toolbar-menu-toggle';
  button.setAttribute('aria-controls', actions.id);
  const setOpen = (open: boolean) => {
    row.classList.toggle('is-actions-expanded', open);
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '收起操作' : '更多操作';
  };
  setOpen(false);
  actions.before(button);
  const toggle = () => setOpen(!row.classList.contains('is-actions-expanded'));
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !row.classList.contains('is-actions-expanded')) return;
    event.preventDefault();
    setOpen(false);
    button.focus({ preventScroll: true });
  };
  button.addEventListener('click', toggle);
  row.addEventListener('keydown', onKey);
  return () => {
    button.removeEventListener('click', toggle);
    row.removeEventListener('keydown', onKey);
    button.remove();
    row.classList.remove('is-actions-expanded');
    if (originalId === null) actions.removeAttribute('id');
  };
}
