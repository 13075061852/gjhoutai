const closingOverlays = new WeakSet<HTMLElement>();

/** Keep the modal and viewport backdrop mounted until the exit animation ends. */
export function deferOfficeOverlayClose(overlay: HTMLElement, complete: () => void): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === '1') return false;
  if (closingOverlays.has(overlay)) return true;
  closingOverlays.add(overlay);
  overlay.classList.add('is-closing');
  overlay.inert = true;
  window.setTimeout(() => {
    closingOverlays.delete(overlay);
    if (overlay.isConnected) complete();
  }, 200);
  return true;
}
