const originalStyles = new WeakMap<HTMLElement, { overlay: string | null; card: string | null }>();

export function mountOfficeDetailsOverlay(overlay: HTMLElement): void {
  // Lift the entire modal out of transformed/clipped page containers, in both
  // portrait and landscape. Its backdrop always covers the viewport.
  Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100dvw', height: '100dvh',
    margin: '0', maxWidth: 'none', maxHeight: 'none', border: '0', boxSizing: 'border-box',
    display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', transform: 'none', animation: 'none' });
  if (typeof overlay.showPopover === 'function') {
    overlay.setAttribute('popover', 'manual');
    if (!overlay.matches(':popover-open')) overlay.showPopover();
  }
}

export function toggleOfficeDetailsOrientation(overlay: HTMLElement, button: HTMLButtonElement): void {
  if (!overlay.hasAttribute('popover')) mountOfficeDetailsOverlay(overlay);
  const landscape = overlay.classList.toggle('is-landscape');
  const card = overlay.querySelector<HTMLElement>('.biz-office-details-dialog');
  if (landscape) {
    originalStyles.set(overlay, { overlay: overlay.getAttribute('style'), card: card?.getAttribute('style') ?? null });
    const portrait = window.innerHeight > window.innerWidth;
    Object.assign(overlay.style, { inset: 'auto', top: '50%', left: '50%',
      width: portrait ? '100dvh' : '100dvw', height: portrait ? '100dvw' : '100dvh', padding: '12px',
      transform: `translate(-50%, -50%)${portrait ? ' rotate(90deg)' : ''}` });
    if (card) Object.assign(card.style, { width: '100%', height: '100%', maxHeight: '100%', animation: 'none', transform: 'none' });
  } else {
    const previous = originalStyles.get(overlay);
    if (previous?.overlay) overlay.setAttribute('style', previous.overlay);
    if (card) {
      if (previous?.card) card.setAttribute('style', previous.card); else card.removeAttribute('style');
    }
    originalStyles.delete(overlay);
    // Keep the portrait modal in the top layer too; do not expose the navigation.
  }
  button.textContent = landscape ? '还原' : '横向查看';
  button.setAttribute('aria-pressed', String(landscape));
  button.setAttribute('aria-label', landscape ? '还原竖向查看' : '横向查看详细数据');
  button.focus({ preventScroll: true });
}
