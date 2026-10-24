// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableMainFrameNavigation":true,"disableChildPageNavigation":true}}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAiImagePreview } from './aiImagePreview';
import { downloadAiImageFile, fetchAiImageFile, shareAiImageFile } from './aiImageFiles';
vi.mock('./aiImageFiles', () => ({ fetchAiImageFile: vi.fn(), downloadAiImageFile: vi.fn(), shareAiImageFile: vi.fn() }));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }; 

let root: HTMLElement;
let cleanup: () => void;
const preview = () => document.querySelector<HTMLDialogElement>('.ai-image-preview')!;
const button = (name: string) => preview().querySelector<HTMLButtonElement>(`[data-preview-${name}]`)!;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchAiImageFile).mockImplementation(async (_source, title) => new File(['png'], `${title}.png`, { type: 'image/png' }));
  vi.mocked(shareAiImageFile).mockResolvedValue('unsupported');
  document.body.innerHTML = '<div id="thread"><a class="ai-image-link" href="https://example.com/image.png"><img src="https://example.com/image.png" alt="320G6 FTIR"></a><a class="ai-file-link" href="/report.pdf">报告</a></div>';
  root = document.getElementById('thread')!;
  cleanup = mountAiImagePreview(root);
});
afterEach(() => { cleanup(); document.body.innerHTML = ''; });
const open = () => { root.querySelector<HTMLAnchorElement>('.ai-image-link')!.focus(); root.querySelector<HTMLElement>('img')!.click(); };

describe('AI in-page image preview', () => {
  it('prevents popup navigation and opens a labelled modal with full image', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('img')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(preview().open).toBe(true);
    expect(preview().getAttribute('aria-label')).toBe('图片放大预览');
    expect(preview().querySelector('img')!.src).toBe('https://example.com/image.png');
    expect(preview().querySelector('.ai-image-preview-title')!.textContent).toBe('320G6 FTIR');
    expect(preview().querySelectorAll('button svg')).toHaveLength(9);
    expect(preview().querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(true);
    expect(preview().textContent).not.toContain('旋转横向查看');
  });
  it('supports toolbar zoom, wheel zoom, double click and reset with limits', () => {
    open();
    expect(button('out').disabled).toBe(true);
    button('in').click();
    expect(preview().querySelector('output')!.value).toBe('125%');
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, cancelable: true }));
    expect(parseInt(preview().querySelector('output')!.value)).toBeGreaterThan(125);
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(preview().querySelector('output')!.value).toBe('100%');
    for (let i = 0; i < 20; i++) button('in').click();
    expect(preview().querySelector('output')!.value).toBe('500%');
    expect(button('in').disabled).toBe(true);
    button('reset').click();
    expect(preview().querySelector('output')!.value).toBe('100%');
  });
  it('closes on button, native Escape cancel and backdrop; restores focus', () => {
    for (const close of [() => button('close').click(), () => preview().dispatchEvent(new Event('cancel', { cancelable: true })), () => preview().click()]) {
      open();
      close();
      expect(preview()).toBeNull();
      expect(document.activeElement).toBe(root.querySelector('a'));
    }
  });
  it('supports pointer dragging after zoom and clamps the image inside the view', () => {
    open();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    const image = stage.querySelector('img')!;
    Object.defineProperties(stage, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    button('in').click();
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 110 }));
    expect(image.style.transform).toContain('translate(20px, 10px)');
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 9999, clientY: 9999 }));
    expect(image.style.transform).toContain('translate(75px, 50px)');
    stage.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  });
  it('supports two-finger pinch scaling', () => {
    open();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 300, clientY: 100 }));
    expect(preview().querySelector('output')!.value).toBe('200%');
  });
  it('rotates 90 degrees each time, fits swapped bounds, and cycles back after four clicks', () => {
    open();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    const image = stage.querySelector('img')!;
    Object.defineProperties(stage, { clientWidth: { value: 360 }, clientHeight: { value: 640 } });
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } });
    image.dispatchEvent(new Event('load'));
    expect(image.style.width).toBe('360px');
    button('in').click();
    button('rotate').click();
    expect(image.style.transform).toContain('rotate(90deg) scale(1)');
    expect(image.style.width).toBe('640px');
    expect(image.style.height).toBe('320px');
    expect(button('rotate').getAttribute('aria-label')).toContain('当前90度');
    button('rotate').click();
    expect(image.style.transform).toContain('rotate(180deg)');
    expect(image.style.width).toBe('360px');
    button('rotate').click();
    expect(image.style.transform).toContain('rotate(270deg)');
    expect(image.style.width).toBe('640px');
    button('rotate').click();
    expect(image.style.transform).toContain('rotate(0deg)');
    expect(image.style.width).toBe('360px');
  });
  it('keeps rotated dragging in screen coordinates with correct clipping bounds', () => {
    open();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    const image = stage.querySelector('img')!;
    Object.defineProperties(stage, { clientWidth: { value: 360 }, clientHeight: { value: 640 } });
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } });
    button('rotate').click();
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(preview().querySelector('output')!.value).toBe('200%');
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 130 }));
    expect(image.style.transform).toBe('translate(20px, 30px) rotate(90deg) scale(2)');
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 9999, clientY: 9999 }));
    expect(image.style.transform).toBe('translate(140px, 320px) rotate(90deg) scale(2)');
    stage.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    button('reset').click();
    expect(image.style.transform).toBe('translate(0px, 0px) rotate(90deg) scale(1)');
    window.dispatchEvent(new Event('resize'));
    expect(image.style.transform).toContain('rotate(90deg)');
  });
  it('supports two-finger scaling after rotation', () => {
    open();
    button('rotate').click();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 300, clientY: 100 }));
    expect(stage.querySelector('img')!.style.transform).toContain('rotate(90deg) scale(2)');
  });
  it('handles user image attachments and dynamically inserted history images', () => {
    root.innerHTML = '<a class="ai-analysis-message-image" href="/file"><img src="https://example.com/upload.png" alt="上传图"></a>';
    root.querySelector('img')!.click();
    expect(preview().querySelector('img')!.alt).toBe('上传图');
    expect(preview().querySelector('img')!.src).toBe('https://example.com/upload.png');
  });
  it('switches only active conversation images, dedupes sources and keeps rotation but resets zoom', () => {
    document.body.insertAdjacentHTML('beforeend', '<a class="ai-image-link"><img src="https://example.com/outside.png"></a>');
    root.insertAdjacentHTML('beforeend', '<a class="ai-image-link"><img src="https://example.com/image.png" alt="重复"></a><a class="ai-analysis-message-image"><img src="https://example.com/second.png" alt="第二张"></a><a class="ai-image-link"><img src="https://example.com/third.png" alt="第三张"></a>');
    open();
    expect(preview().querySelector('.ai-image-preview-counter')!.textContent).toBe('1 / 3');
    expect(button('prev').disabled).toBe(true);
    button('rotate').click();
    button('in').click();
    button('next').click();
    expect(preview().querySelector('img')!.src).toBe('https://example.com/second.png');
    expect(preview().querySelector('.ai-image-preview-title')!.textContent).toBe('第二张');
    expect(preview().querySelector('img')!.style.transform).toContain('rotate(90deg) scale(1)');
    preview().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(preview().querySelector('img')!.src).toBe('https://example.com/third.png');
    expect(button('next').disabled).toBe(true);
    preview().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(preview().querySelector('.ai-image-preview-counter')!.textContent).toBe('2 / 3');
    expect(fetchAiImageFile).toHaveBeenCalledWith('https://example.com/second.png', '第二张', expect.any(AbortSignal));
  });
  it('swipes between images only at fit size, not when panning a zoomed image', () => {
    root.insertAdjacentHTML('beforeend', '<a class="ai-image-link"><img src="https://example.com/second.png" alt="第二张"></a>');
    open();
    const stage = preview().querySelector<HTMLElement>('.ai-image-preview-stage')!;
    const swipe = () => {
      stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 250, clientY: 200, button: 0 }));
      stage.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 80, clientY: 210 }));
    };
    button('in').click();
    swipe();
    expect(preview().querySelector('.ai-image-preview-counter')!.textContent).toBe('1 / 2');
    button('reset').click();
    swipe();
    expect(preview().querySelector('.ai-image-preview-counter')!.textContent).toBe('2 / 2');
  });
  it('downloads the currently selected original and offers an honest unsupported-save fallback', async () => {
    root.insertAdjacentHTML('beforeend', '<a class="ai-image-link"><img src="https://example.com/second.png" alt="第二张"></a>');
    open();
    button('next').click();
    await flush();
    button('download').click();
    expect(downloadAiImageFile).toHaveBeenCalledWith(expect.objectContaining({ name: '第二张.png' }), preview());
    button('save').click();
    await flush();
    expect(shareAiImageFile).toHaveBeenCalledWith(expect.objectContaining({ name: '第二张.png' }));
    expect(preview().querySelector('[role="status"]')!.textContent).toContain('长按图片');
    expect(preview().querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(false);
    expect(preview().querySelector('[role="status"]')!.textContent).not.toContain('已保存');
  });
  it('ignores stale file preparations and aborts pending fetches on switch and close', async () => {
    let resolve!: (file: File) => void;
    vi.mocked(fetchAiImageFile).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    root.insertAdjacentHTML('beforeend', '<a class="ai-image-link"><img src="https://example.com/second.png" alt="第二张"></a>');
    open();
    const firstSignal = vi.mocked(fetchAiImageFile).mock.calls[0][2]!;
    button('next').click();
    expect(firstSignal.aborted).toBe(true);
    await flush();
    resolve(new File(['old'], '第一张.png', { type: 'image/png' }));
    await flush();
    button('download').click();
    expect(downloadAiImageFile).toHaveBeenCalledWith(expect.objectContaining({ name: '第二张.png' }), preview());
    const lastSignal = vi.mocked(fetchAiImageFile).mock.calls.at(-1)![2]!;
    cleanup();
    expect(lastSignal.aborted).toBe(true);
  });
  it('shows fetch/share errors without claiming success, and allows retrying download', async () => {
    vi.mocked(fetchAiImageFile).mockRejectedValueOnce(new Error('403'));
    open();
    await flush();
    expect(preview().querySelector('[role="status"]')!.textContent).toContain('下载准备失败');
    button('download').click();
    await flush();
    expect(downloadAiImageFile).toHaveBeenCalledOnce();
    vi.mocked(shareAiImageFile).mockRejectedValueOnce(new Error('NotAllowedError'));
    button('save').click();
    await flush();
    expect(preview().querySelector('[role="status"]')!.textContent).toContain('系统保存菜单不可用');
  });
  it('does not hijack file links; displays loading errors and cleans listeners on unmount', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('.ai-file-link')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(preview()).toBeNull();
    open();
    preview().querySelector('img')!.dispatchEvent(new Event('error'));
    expect(preview().querySelector('[role="status"]')!.textContent).toContain('加载失败');
    cleanup();
    expect(preview()).toBeNull();
    root.querySelector('img')!.click();
    expect(preview()).toBeNull();
  });
});
