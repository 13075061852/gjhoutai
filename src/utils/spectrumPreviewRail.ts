// CSS-rotated previews need screen-axis mapping; native landscape uses -clientY.
// Keep this controller and its DOM alive while the main chart is switched.
export function mountSpectrumPreviewRail(rail: HTMLElement): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  type Sample = { time: number; scroll: number };
  let active: { id: number; position: number; scroll: number; scale: number; rotated: boolean; samples: Sample[] } | null = null;
  let dragged = false;
  let blockClickUntil = 0;
  let frame = 0;
  const landscape = () => Boolean(rail.closest('.spectrum-preview-dialog.is-landscape'));
  const rotated = () => landscape() && window.matchMedia('(max-width: 980px) and (orientation: portrait)').matches;
  const reducedMotion = () => document.documentElement.dataset.reducedMotion === '1'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (scroll: number) => Math.max(0, Math.min(Math.max(0, rail.scrollHeight - rail.clientHeight), scroll));
  const syncBusy = () => { if (active || frame) rail.dataset.previewInteracting = '1'; else delete rail.dataset.previewInteracting; };
  const stopMomentum = () => { cancelAnimationFrame(frame); frame = 0; syncBusy(); };
  const coast = (samples: Sample[]) => {
    if (reducedMotion() || samples.length < 2) return;
    const first = samples[0], last = samples[samples.length - 1];
    if (performance.now() - last.time > 80) return;
    let velocity = Math.max(-3, Math.min(3, (last.scroll - first.scroll) / Math.max(8, last.time - first.time)));
    if (Math.abs(velocity) < .05) return;
    let previous = performance.now();
    let position = last.scroll;
    const tick = (time: number) => {
      frame = 0;
      if (!rail.isConnected || !landscape() || reducedMotion()) { syncBusy(); return; }
      const elapsed = Math.min(50, Math.max(0, time - previous)); previous = time;
      const decay = Math.exp(-.006 * elapsed);
      const target = position + velocity * (1 - decay) / .006;
      position = clamp(target); rail.scrollTop = position; velocity *= decay;
      blockClickUntil = Date.now() + 350;
      if (Math.abs(velocity) > .05 && Math.abs(position - target) < 1) frame = requestAnimationFrame(tick);
      syncBusy();
    };
    frame = requestAnimationFrame(tick); syncBusy();
  };
  rail.querySelectorAll('img').forEach((image) => { image.draggable = false; });
  rail.addEventListener('pointerdown', (event) => {
    if (!landscape() || active || event.button !== 0) return;
    stopMomentum();
    const isRotated = rotated();
    const rect = rail.getBoundingClientRect();
    active = {
      id: event.pointerId, position: isRotated ? event.clientX : -event.clientY, scroll: rail.scrollTop,
      scale: rail.clientHeight / Math.max(1, isRotated ? rect.width : rect.height),
      rotated: isRotated, samples: [{ time: performance.now(), scroll: rail.scrollTop }],
    };
    dragged = false; blockClickUntil = 0; syncBusy();
  }, { signal });
  // Document capture keeps following a finger across thumbnails and capture transfers.
  document.addEventListener('pointermove', (event) => {
    if (!active || active.id !== event.pointerId) return;
    const position = active.rotated ? event.clientX : -event.clientY;
    const delta = position - active.position;
    if (!dragged && Math.abs(delta) < 3) return;
    dragged = true; event.preventDefault();
    if (!rail.hasPointerCapture?.(event.pointerId)) rail.setPointerCapture?.(event.pointerId);
    // WebKit may report the compositor's previous scrollTop for several pointer moves.
    // Accumulate the intended position instead of dropping all but the last movement.
    active.scroll = clamp(active.scroll + delta * active.scale);
    rail.scrollTop = active.scroll;
    active.position = position;
    const now = performance.now();
    active.samples.push({ time: now, scroll: active.scroll });
    while (active.samples.length > 2 && now - active.samples[0].time > 80) active.samples.shift();
    blockClickUntil = Date.now() + 350;
  }, { signal, passive: false, capture: true });
  const end = (event: PointerEvent) => {
    if (active?.id !== event.pointerId) return;
    const samples = active.samples; active = null;
    if (dragged) blockClickUntil = Date.now() + 350;
    if (rail.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    if (dragged && event.type === 'pointerup') coast(samples);
    syncBusy();
  };
  for (const type of ['pointerup', 'pointercancel'] as const) document.addEventListener(type, end, { signal, capture: true });
  const cancelGesture = () => {
    const previous = active; active = null; stopMomentum();
    if (previous && rail.hasPointerCapture?.(previous.id)) rail.releasePointerCapture(previous.id);
    syncBusy();
  };
  window.addEventListener('resize', cancelGesture, { signal });
  window.addEventListener('blur', cancelGesture, { signal });
  rail.addEventListener('click', (event) => {
    if (Date.now() < blockClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { signal, capture: true });
  rail.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
  return () => {
    stopMomentum(); controller.abort();
    if (active && rail.hasPointerCapture?.(active.id)) rail.releasePointerCapture(active.id);
    active = null; syncBusy();
  };
}
