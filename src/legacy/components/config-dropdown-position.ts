export function getConfigDropdownPlacement(top: number, bottom: number, triggerTop: number, triggerBottom: number) {
  const above = Math.max(0, triggerTop - top - 6);
  const below = Math.max(0, bottom - triggerBottom - 6);
  const placement = below < 360 && above > below ? 'up' : 'down';
  return { placement, maxHeight: Math.min(360, placement === 'up' ? above : below) };
}

/** Stay inside the scrolling form, not merely inside the browser viewport. */
export function positionConfigDropdown(dropdown: HTMLElement): void {
  const trigger = dropdown.querySelector<HTMLElement>('.model-dropdown-trigger');
  const content = dropdown.closest<HTMLElement>('.config-content-panel');
  if (!trigger || !content) return;
  const rect = trigger.getBoundingClientRect();
  const bounds = content.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const result = getConfigDropdownPlacement(
    Math.max(bounds.top, viewportTop) + 8,
    Math.min(bounds.bottom, viewportBottom) - 8,
    rect.top,
    rect.bottom,
  );
  dropdown.dataset.placement = result.placement;
  dropdown.style.setProperty('--model-panel-height', `${result.maxHeight}px`);
}

export function watchConfigDropdowns(form: HTMLFormElement): () => void {
  const controller = new AbortController();
  const update = () => form.querySelectorAll<HTMLElement>('.model-dropdown.is-open').forEach(positionConfigDropdown);
  form.addEventListener('scroll', update, { capture: true, signal: controller.signal });
  window.addEventListener('resize', update, { signal: controller.signal });
  window.visualViewport?.addEventListener('resize', update, { signal: controller.signal });
  window.visualViewport?.addEventListener('scroll', update, { signal: controller.signal });
  return () => controller.abort();
}
