import { Add, Close, Download, Left, Minus, Refresh, Right, Rotate, Share } from '@icon-park/svg';
import { pinchPreviewZoom } from './spectrumPreviewZoom';
import { downloadAiImageFile, fetchAiImageFile, shareAiImageFile } from './aiImageFiles';

const IMAGE_LINK = 'a.ai-image-link, a.ai-analysis-message-image';
const previewSource = (image: HTMLImageElement) => {
  const source = image.currentSrc || image.src;
  try { return ['http:', 'https:', 'blob:'].includes(new URL(source, location.href).protocol) ? source : ''; }
  catch { return ''; }
};

/** Delegated binding survives streaming DOM patches and history re-rendering. */
export function mountAiImagePreview(root: HTMLElement): () => void {
  const binding = new AbortController();
  let closeCurrent: (() => void) | null = null;

  const open = (link: HTMLAnchorElement) => {
    const thumbnail = link.querySelector('img');
    if (!thumbnail) return;
    const source = previewSource(thumbnail);
    if (!source) return;
    // The root contains only the active conversation, not other history sessions.
    // Dedupe repeated references while preserving their conversation order.
    const gallery: { source: string; title: string }[] = [];
    root.querySelectorAll<HTMLAnchorElement>(IMAGE_LINK).forEach((anchor) => {
      const img = anchor.querySelector('img');
      const src = img && previewSource(img);
      if (src && !gallery.some((item) => item.source === src)) gallery.push({ source: src, title: img!.alt || '图片预览' });
    });
    let index = gallery.findIndex((item) => item.source === source);
    if (index < 0) return;
    closeCurrent?.();
    const previousFocus = document.activeElement as HTMLElement | null;
    const scrollTop = root.scrollTop;
    const scrollLeft = root.scrollLeft;
    const controller = new AbortController();
    const { signal } = controller;
    const dialog = document.createElement('dialog');
    dialog.className = 'ai-image-preview';
    dialog.setAttribute('aria-label', '图片放大预览');
    const icon = (renderer: typeof Add) => renderer({ size: 18, strokeWidth: 2, fill: 'currentColor' });
    dialog.innerHTML = `<header class="ai-image-preview-head">
      <span class="ai-image-preview-title"></span>
      <div class="ai-image-preview-controls">
        <button type="button" data-preview-out aria-label="缩小图片" title="缩小图片">${icon(Minus)}</button>
        <output class="ai-image-preview-scale" aria-live="polite">100%</output>
        <button type="button" data-preview-in aria-label="放大图片" title="放大图片">${icon(Add)}</button>
        <button type="button" data-preview-rotate aria-label="顺时针旋转90度，当前0度" title="顺时针旋转90度">${icon(Rotate)}<span>旋转</span></button>
        <button type="button" data-preview-reset aria-label="适应窗口" title="适应窗口">${icon(Refresh)}</button>
        <button type="button" data-preview-close aria-label="关闭图片预览" title="关闭图片预览" autofocus>${icon(Close)}</button>
      </div>
    </header>
    <div class="ai-image-preview-stage"><img draggable="false" alt=""></div>
    <footer class="ai-image-preview-footer">
      <div class="ai-image-preview-gallery" aria-label="会话图片切换">
        <button type="button" data-preview-prev aria-label="上一张图片" title="上一张图片">${icon(Left)}</button>
        <output class="ai-image-preview-counter" aria-label="当前图片" aria-live="polite"></output>
        <button type="button" data-preview-next aria-label="下一张图片" title="下一张图片">${icon(Right)}</button>
      </div>
      <div class="ai-image-preview-file-actions">
        <button type="button" data-preview-download aria-label="下载原图" title="下载原图">${icon(Download)}<span>下载</span></button>
        <button type="button" data-preview-save aria-label="保存图片到相册" title="通过系统菜单保存图片到相册">${icon(Share)}<span>存到相册</span></button>
      </div>
    </footer>
    <p class="ai-image-preview-hint" role="status" hidden></p>`;
    dialog.querySelectorAll('svg').forEach((svg) => { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); });
    const stage = dialog.querySelector<HTMLElement>('.ai-image-preview-stage')!;
    const image = stage.querySelector('img')!;
    const title = dialog.querySelector<HTMLElement>('.ai-image-preview-title')!;
    const output = dialog.querySelector<HTMLOutputElement>('output')!;
    const zoomOut = dialog.querySelector<HTMLButtonElement>('[data-preview-out]')!;
    const zoomIn = dialog.querySelector<HTMLButtonElement>('[data-preview-in]')!;
    const rotateButton = dialog.querySelector<HTMLButtonElement>('[data-preview-rotate]')!;
    const hint = dialog.querySelector<HTMLElement>('.ai-image-preview-hint')!;
    const counter = dialog.querySelector<HTMLOutputElement>('.ai-image-preview-counter')!;
    const previous = dialog.querySelector<HTMLButtonElement>('[data-preview-prev]')!;
    const next = dialog.querySelector<HTMLButtonElement>('[data-preview-next]')!;
    const download = dialog.querySelector<HTMLButtonElement>('[data-preview-download]')!;
    const save = dialog.querySelector<HTMLButtonElement>('[data-preview-save]')!;
    const showHint = (message = '') => {
      hint.textContent = message;
      hint.hidden = !message;
    };
    let currentFile: File | null = null;
    let assetController: AbortController | null = null;
    let saving = false;
    let rotation = 0;
    let zoom = { scale: 1, x: 0, y: 0 };
    let base = { ...zoom };
    const pointers = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 };
    let distance = 0;
    const point = (event: PointerEvent | WheelEvent) => {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const center = () => {
      const p = [...pointers.values()].slice(0, 2);
      return p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0] || { x: 0, y: 0 };
    };
    const separation = () => {
      const p = [...pointers.values()].slice(0, 2);
      return p.length > 1 ? Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) : 0;
    };
    const rebase = () => { base = { ...zoom }; start = center(); distance = separation(); };
    const paint = () => {
      const { clientWidth: width, clientHeight: height } = stage;
      // Fit the rotated bounds, not the original image box. A landscape chart
      // can then use the phone's long edge without clipping or staying tiny.
      const sideways = rotation % 180 !== 0;
      const rotatedWidth = sideways ? image.naturalHeight : image.naturalWidth;
      const rotatedHeight = sideways ? image.naturalWidth : image.naturalHeight;
      const fit = rotatedWidth && rotatedHeight ? Math.min(width / rotatedWidth, height / rotatedHeight, 1) : 0;
      if (fit) {
        image.style.width = `${image.naturalWidth * fit}px`;
        image.style.height = `${image.naturalHeight * fit}px`;
      }
      const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
      zoom.x = clamp(zoom.x, Math.max(0, (rotatedWidth * fit * zoom.scale - width) / 2));
      zoom.y = clamp(zoom.y, Math.max(0, (rotatedHeight * fit * zoom.scale - height) / 2));
      // Translation stays in screen coordinates, so dragging/pinching doesn't
      // swap directions when the image has been rotated.
      image.style.transform = `translate(${zoom.x}px, ${zoom.y}px) rotate(${rotation}deg) scale(${zoom.scale})`;
      rotateButton.setAttribute('aria-label', `顺时针旋转90度，当前${rotation}度`);
      rotateButton.title = `顺时针旋转90度（当前${rotation}度）`;
      stage.classList.toggle('is-zoomed', zoom.scale > 1);
      output.value = `${Math.round(zoom.scale * 100)}%`;
      zoomOut.disabled = zoom.scale <= 1;
      zoomIn.disabled = zoom.scale >= 5;
    };
    const reset = () => { zoom = { scale: 1, x: 0, y: 0 }; rebase(); paint(); };
    const scaleBy = (ratio: number, anchor = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }) => {
      zoom = pinchPreviewZoom(zoom, anchor, anchor, ratio, { x: stage.clientWidth, y: stage.clientHeight });
      paint();
    };
    const close = () => {
      assetController?.abort();
      controller.abort();
      observer?.disconnect();
      if (dialog.open) dialog.close();
      dialog.remove();
      closeCurrent = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      else if (link.isConnected) link.focus({ preventScroll: true });
      root.scrollTop = scrollTop;
      root.scrollLeft = scrollLeft;
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reset) : null;
    const clearPointers = () => {
      for (const id of pointers.keys()) {
        if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
      }
      pointers.clear();
    };
    const prepareFile = async () => {
      assetController?.abort();
      const task = new AbortController();
      assetController = task;
      const item = gallery[index];
      currentFile = null;
      download.disabled = true;
      save.disabled = true;
      try {
        const file = await fetchAiImageFile(item.source, item.title, task.signal);
        if (task.signal.aborted || signal.aborted || assetController !== task) return;
        currentFile = file;
      } catch {
        if (task.signal.aborted || signal.aborted || assetController !== task) return;
        showHint('下载准备失败，可点下载重试，或长按图片保存。');
      } finally {
        if (!task.signal.aborted && !signal.aborted && assetController === task) {
          download.disabled = false;
          save.disabled = false;
        }
      }
    };
    const showImage = () => {
      const item = gallery[index];
      clearPointers();
      title.textContent = item.title;
      title.title = item.title;
      image.alt = item.title;
      counter.value = `${index + 1} / ${gallery.length}`;
      previous.disabled = index === 0;
      next.disabled = index === gallery.length - 1;
      dialog.querySelector<HTMLElement>('.ai-image-preview-gallery')!.hidden = gallery.length < 2;
      image.hidden = true;
      image.style.removeProperty('width');
      image.style.removeProperty('height');
      image.src = item.source;
      showHint();
      reset(); // Keep the selected orientation, reset only zoom and pan.
      void prepareFile();
    };
    const switchBy = (step: number) => {
      if (saving) return;
      const target = index + step;
      if (target < 0 || target >= gallery.length) return;
      index = target;
      showImage();
    };
    previous.addEventListener('click', () => switchBy(-1), { signal });
    next.addEventListener('click', () => switchBy(1), { signal });
    dialog.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      switchBy(event.key === 'ArrowLeft' ? -1 : 1);
    }, { signal });
    download.addEventListener('click', async () => {
      const requestedSource = gallery[index].source;
      if (!currentFile) await prepareFile();
      if (!currentFile || signal.aborted || gallery[index].source !== requestedSource) return;
      downloadAiImageFile(currentFile, dialog);
      showHint('已发起原图下载；手机可在下载文件中选择“存储图像”。');
    }, { signal });
    save.addEventListener('click', async () => {
      if (!currentFile) {
        showHint('请长按图片选择“存储图像 / 保存图片”，或点击下载重试。');
        return;
      }
      saving = true;
      save.disabled = true;
      try {
        // File was prepared before this click, preserving mobile user activation.
        const result = await shareAiImageFile(currentFile);
        if (signal.aborted) return;
        showHint(result === 'unsupported'
          ? '此浏览器不支持系统保存菜单，请长按图片选择“存储图像 / 保存图片”，或使用下载。'
          : result === 'cancelled' ? '' : '系统菜单操作已结束，请以系统的保存结果为准。');
      } catch {
        if (!signal.aborted) showHint('系统保存菜单不可用，请长按图片保存，或使用下载。');
      } finally {
        saving = false;
        if (!signal.aborted) save.disabled = false;
      }
    }, { signal });
    closeCurrent = close;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); }, { signal });
    dialog.addEventListener('close', close, { signal });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); }, { signal });
    dialog.querySelector('[data-preview-close]')!.addEventListener('click', close, { signal });
    zoomIn.addEventListener('click', () => scaleBy(1.25), { signal });
    zoomOut.addEventListener('click', () => scaleBy(1 / 1.25), { signal });
    dialog.querySelector('[data-preview-reset]')!.addEventListener('click', reset, { signal });
    rotateButton.addEventListener('click', () => {
      clearPointers();
      rotation = (rotation + 90) % 360;
      reset();
    }, { signal });
    stage.addEventListener('dblclick', () => zoom.scale > 1 ? reset() : scaleBy(2), { signal });
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scaleBy(Math.exp(-event.deltaY * .002), point(event));
    }, { signal, passive: false });
    let swipe: { x: number; y: number; at: number } | null = null;
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, point(event));
      swipe = pointers.size === 1 ? { x: event.clientX, y: event.clientY, at: performance.now() } : null;
      rebase();
    }, { signal });
    stage.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      pointers.set(event.pointerId, point(event));
      const next = center();
      if (pointers.size >= 2 && distance > 0) {
        zoom = pinchPreviewZoom(base, start, next, separation() / distance, { x: stage.clientWidth, y: stage.clientHeight });
      } else if (zoom.scale > 1) {
        zoom = { scale: base.scale, x: base.x + next.x - start.x, y: base.y + next.y - start.y };
      }
      paint();
    }, { signal });
    const end = (event: PointerEvent) => {
      const gesture = swipe;
      swipe = null;
      const isSwipe = event.type === 'pointerup' && pointers.size === 1 && zoom.scale === 1 && gesture
        && performance.now() - gesture.at < 700
        && Math.abs(event.clientX - gesture.x) >= 60
        && Math.abs(event.clientX - gesture.x) > Math.abs(event.clientY - gesture.y) * 1.4;
      pointers.delete(event.pointerId);
      rebase();
      if (isSwipe) switchBy(event.clientX < gesture.x ? 1 : -1);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) stage.addEventListener(type, end, { signal });
    image.addEventListener('load', () => { image.hidden = false; reset(); }, { signal });
    image.addEventListener('error', () => { showHint('图片加载失败，请关闭后重试。'); }, { signal });
    window.addEventListener('resize', reset, { signal });
    document.body.appendChild(dialog);
    dialog.showModal();
    showImage();
    observer?.observe(stage);
  };

  root.addEventListener('click', (event) => {
    const link = (event.target as Element)?.closest<HTMLAnchorElement>(IMAGE_LINK);
    if (!link || !root.contains(link)) return;
    event.preventDefault();
    open(link);
  }, { signal: binding.signal });
  return () => { binding.abort(); closeCurrent?.(); };
}
