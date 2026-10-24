// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableMainFrameNavigation":true,"disableChildPageNavigation":true}}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadAiImageFile, fetchAiImageFile, shareAiImageFile } from './aiImageFiles';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('authenticated original image files', () => {
  it('fetches with cookies, validates image content and generates a safe real-extension filename', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['original-pixels'], { type: 'image/png' }) });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const file = await fetchAiImageFile('https://www.kingpolymer.com/gjhoutai/api/blob/spectrum/1', 'FTIR:/测试?.jpg', controller.signal);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), { credentials: 'include', signal: controller.signal });
    expect(file.name).toBe('FTIR--测试-.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(15);
  });
  it('rejects login HTML, missing images and empty payloads rather than downloading fake images', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['login'], { type: 'text/html' }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob([], { type: 'image/png' }) });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchAiImageFile('/image', '图谱')).rejects.toThrow('401');
    await expect(fetchAiImageFile('/image', '图谱')).rejects.toThrow('有效图片');
    await expect(fetchAiImageFile('/image', '图谱')).rejects.toThrow('有效图片');
  });
  it('downloads via a named blob anchor in the modal and later releases the object URL', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-original');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let anchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { anchor = this; });
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    downloadAiImageFile(new File(['png'], 'FTIR.png', { type: 'image/png' }), dialog);
    expect(anchor!.download).toBe('FTIR.png');
    expect(anchor!.getAttribute('href')).toBe('blob:test-original');
    expect(dialog.querySelector('a')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:test-original');
  });
  it('calls native file sharing during the click activation, with no fake album-save success', async () => {
    const file = new File(['png'], 'FTIR.png', { type: 'image/png' });
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn().mockReturnValue(true) });
    const result = shareAiImageFile(file);
    expect(share).toHaveBeenCalledWith({ files: [file] }); // Invoked before any await.
    await expect(result).resolves.toBe('shared');
    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    await expect(shareAiImageFile(file)).resolves.toBe('cancelled');
    share.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    await expect(shareAiImageFile(file)).rejects.toThrow('blocked');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    await expect(shareAiImageFile(file)).resolves.toBe('unsupported');
    delete (navigator as Partial<Navigator>).share;
    delete (navigator as Partial<Navigator>).canShare;
    await expect(shareAiImageFile(file)).resolves.toBe('unsupported');
  });
});
