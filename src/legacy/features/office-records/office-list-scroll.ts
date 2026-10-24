/** Restore a replaced list before paint, only while its filter and page are unchanged. */
export function captureOfficeListScroll(root: HTMLElement): () => void {
  const list = root.querySelector<HTMLElement>('[data-office-list-key]');
  if (!list) return () => {};
  const key = list.dataset.officeListKey;
  const top = list.scrollTop, left = list.scrollLeft;
  return () => {
    const replacement = root.querySelector<HTMLElement>('[data-office-list-key]');
    if (!replacement || replacement.dataset.officeListKey !== key) return;
    replacement.scrollTop = top;
    replacement.scrollLeft = left;
  };
}
