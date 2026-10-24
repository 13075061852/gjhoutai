type Point = { x: number; y: number };
type Zoom = { scale: number; x: number; y: number };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function previewLocalPoint(point: Point, rect: DOMRect, width: number, height: number, rotated: boolean): Point {
  return rotated
    ? { x: (point.y - rect.top) * width / rect.height, y: (rect.right - point.x) * height / rect.width }
    : { x: (point.x - rect.left) * width / rect.width, y: (point.y - rect.top) * height / rect.height };
}

export function pinchPreviewZoom(base: Zoom, start: Point, center: Point, ratio: number, size: Point): Zoom {
  const scale = Math.max(1, Math.min(5, base.scale * ratio));
  const factor = scale / base.scale;
  return {
    scale,
    x: center.x - size.x / 2 - (start.x - size.x / 2 - base.x) * factor,
    y: center.y - size.y / 2 - (start.y - size.y / 2 - base.y) * factor,
  };
}

export function mountSpectrumPreviewZoom(frame: HTMLElement, options: { onNavigate?: (step: number) => void } = {}): () => void {
  const image = frame.querySelector('img');
  if (!image) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  const pointers = new Map<number, Point>();
  let zoom: Zoom = { scale: 1, x: 0, y: 0 };
  let base = { ...zoom };
  let start: Point = { x: 0, y: 0 };
  let distance = 0;
  let swipe: { id: number; start: Point } | null = null;
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'spectrum-preview-zoom-reset';
  resetButton.textContent = '复位';
  resetButton.setAttribute('aria-label', '恢复图谱原始缩放');
  resetButton.hidden = true;
  frame.appendChild(resetButton);
  image.draggable = false;

  const point = (event: PointerEvent | WheelEvent): Point => {
    const rotated = Boolean(frame.closest('.is-landscape'))
      && window.matchMedia('(max-width: 980px) and (orientation: portrait)').matches;
    return previewLocalPoint({ x: event.clientX, y: event.clientY }, frame.getBoundingClientRect(), frame.clientWidth, frame.clientHeight, rotated);
  };
  const center = (): Point => {
    const points = [...pointers.values()].slice(0, 2);
    return points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0] || { x: 0, y: 0 };
  };
  const separation = () => {
    const points = [...pointers.values()].slice(0, 2);
    return points.length > 1 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
  };
  const rebase = () => { base = { ...zoom }; start = center(); distance = separation(); };
  const paint = () => {
    const style = getComputedStyle(frame);
    const width = Math.max(0, frame.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'));
    const height = Math.max(0, frame.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0'));
    const fit = image.naturalWidth && image.naturalHeight ? Math.min(width / image.naturalWidth, height / image.naturalHeight) : 0;
    zoom.x = clamp(zoom.x, Math.max(0, (image.naturalWidth * fit * zoom.scale - width) / 2));
    zoom.y = clamp(zoom.y, Math.max(0, (image.naturalHeight * fit * zoom.scale - height) / 2));
    image.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    frame.classList.toggle('is-zoomed', zoom.scale > 1);
    resetButton.hidden = zoom.scale <= 1;
  };
  const reset = () => {
    zoom = { scale: 1, x: 0, y: 0 };
    swipe = null;
    for (const id of pointers.keys()) {
      if (frame.hasPointerCapture?.(id)) frame.releasePointerCapture(id);
    }
    pointers.clear();
    rebase();
    paint();
  };
  frame.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('button') || event.button !== 0) return;
    const local = point(event);
    swipe = pointers.size === 0 && zoom.scale <= 1 && options.onNavigate ? { id: event.pointerId, start: local } : null;
    pointers.set(event.pointerId, local);
    frame.setPointerCapture?.(event.pointerId);
    rebase();
  }, { signal });
  frame.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, point(event));
    const next = center();
    if (pointers.size >= 2 && distance > 0) {
      zoom = pinchPreviewZoom(base, start, next, separation() / distance, { x: frame.clientWidth, y: frame.clientHeight });
    } else if (zoom.scale > 1) {
      zoom = { scale: base.scale, x: base.x + next.x - start.x, y: base.y + next.y - start.y };
    } else {
      // A 1× swipe needs no image transform or forced layout on each move.
      return;
    }
    paint();
  }, { signal, passive: false });
  const end = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === 'lostpointercapture' && (event.target !== frame || frame.hasPointerCapture?.(event.pointerId))) return;
    let step = 0;
    if (event.type === 'pointerup' && swipe?.id === event.pointerId && pointers.size === 1 && zoom.scale <= 1) {
      const local = point(event);
      const dx = local.x - swipe.start.x, dy = local.y - swipe.start.y;
      const threshold = Math.max(36, Math.min(72, frame.clientHeight * .12));
      if (Math.abs(dy) >= threshold && Math.abs(dy) > Math.abs(dx) * 1.25) step = dy < 0 ? 1 : -1;
    }
    swipe = null;
    pointers.delete(event.pointerId);
    if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    rebase();
    // Only after release: the caller can replace the chart without interrupting capture.
    if (step) options.onNavigate?.(step);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) frame.addEventListener(type, end, { signal });
  frame.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && zoom.scale <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey) {
      const anchor = point(event);
      zoom = pinchPreviewZoom(zoom, anchor, anchor, Math.exp(-event.deltaY * .01), { x: frame.clientWidth, y: frame.clientHeight });
      paint();
    }
  }, { signal, passive: false });
  resetButton.addEventListener('click', (event) => { event.stopPropagation(); reset(); }, { signal });
  image.addEventListener('load', reset, { signal });
  window.addEventListener('resize', reset, { signal });
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reset) : null;
  observer?.observe(frame);
  return () => {
    controller.abort();
    observer?.disconnect();
    reset();
    image.style.removeProperty('transform');
    resetButton.remove();
    frame.classList.remove('is-zoomed');
  };
}
