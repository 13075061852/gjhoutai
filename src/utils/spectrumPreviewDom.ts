/** Update the chart without detaching/recreating an unchanged thumbnail rail.
 * Removing that rail mid-touch drops pointer capture and native scroll momentum. */
export function patchSpectrumPreviewDialog(dialog: HTMLElement, markup: string, beforeReplaceRail: () => void) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const oldRail = dialog.querySelector<HTMLElement>(':scope > .spectrum-preview-rail');
  const nextRail = template.content.querySelector<HTMLElement>('.spectrum-preview-rail')!;
  const oldButtons = [...(oldRail?.querySelectorAll<HTMLElement>('[data-spectrum-preview-open]') || [])];
  const nextButtons = [...nextRail.querySelectorAll<HTMLElement>('[data-spectrum-preview-open]')];
  const retained = Boolean(oldRail && oldButtons.length === nextButtons.length
    && oldButtons.every((button, i) => button.dataset.spectrumPreviewOpen === nextButtons[i].dataset.spectrumPreviewOpen));
  if (!retained) {
    beforeReplaceRail();
    dialog.replaceChildren(template.content);
    return { rail: nextRail, retained: false };
  }
  nextRail.remove();
  for (const node of [...dialog.childNodes]) if (node !== oldRail) node.remove();
  // Leave oldRail connected for the entire patch, including capture and scroll state.
  const header = template.content.querySelector('.spectrum-preview-topbar');
  if (header) dialog.prepend(header);
  dialog.append(template.content);
  oldButtons.forEach((button, i) => {
    button.classList.toggle('is-active', nextButtons[i].classList.contains('is-active'));
    button.setAttribute('aria-pressed', nextButtons[i].getAttribute('aria-pressed') || 'false');
  });
  return { rail: oldRail!, retained: true };
}

/** Scroll only the rail, in its local layout axes; scrollIntoView is unreliable
 * through a rotated ancestor and can fight a finger that is already scrolling. */
export function revealActiveSpectrumThumb(rail: HTMLElement): void {
  if (rail.dataset.previewInteracting === '1') return;
  const active = rail.querySelector<HTMLElement>('.spectrum-preview-thumb.is-active');
  const entry = active?.closest<HTMLElement>('.spectrum-preview-entry');
  if (!entry) return;
  const horizontal = getComputedStyle(rail).flexDirection === 'row';
  const start = horizontal ? entry.offsetLeft : entry.offsetTop;
  const end = start + (horizontal ? entry.offsetWidth : entry.offsetHeight);
  const scroll = horizontal ? rail.scrollLeft : rail.scrollTop;
  const extent = horizontal ? rail.clientWidth : rail.clientHeight;
  if (extent <= 0) return;
  let target = scroll;
  if (start < scroll) target = start;
  else if (end > scroll + extent) target = end - extent;
  if (horizontal) rail.scrollLeft = Math.max(0, target);
  else rail.scrollTop = Math.max(0, target);
}
