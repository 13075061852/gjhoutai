// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountInspectionReportPreview } from './inspectionReportPreview';
const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
function fixture(loader = vi.fn(async (_id: string, _signal: AbortSignal): Promise<Blob | null> => new Blob(['%PDF-1.7\nbody']))) {
  // Keep the fixture detached: happy-dom cannot navigate native PDF blob URLs.
  const root = document.createElement('div');
  root.innerHTML = '<iframe hidden></iframe><div id="status"><strong></strong><p></p><button data-report-preview-retry hidden>重试</button></div>'; 
  vi.stubGlobal('navigator', { pdfViewerEnabled: true });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const frame = root.querySelector('iframe')!;
  const status = root.querySelector<HTMLElement>('#status')!;
  const preview = mountInspectionReportPreview(frame, status, loader);
  disposals.push(preview.dispose);
  return { frame, status, preview, loader, create, revoke };
}
it('loads authenticated PDF bytes into a local blob URL rather than a remote iframe page', async () => {
  const { frame, status, preview, loader } = fixture();
  const pending = preview.select('report-a');
  expect(status.dataset.phase).toBe('loading');
  expect(frame.hidden).toBe(true);
  await pending;
  expect(loader).toHaveBeenCalledWith('report-a', expect.any(AbortSignal));
  expect(frame.getAttribute('src')).toBe('blob:report#toolbar=0&navpanes=0&pagemode=none&view=FitH&zoom=page-width');
  expect(status.hidden).toBe(true);
  expect(frame.hidden).toBe(false);
});
it('rejects HTML and empty responses with an inline retry state', async () => {
  for (const value of [null, new Blob(['<html>login required</html>'])]) {
    const { preview, frame, status, create } = fixture(vi.fn(async () => value));
    await preview.select('invalid');
    expect(status.dataset.phase).toBe('error');
    expect(status.querySelector<HTMLButtonElement>('button')!.hidden).toBe(false);
    expect(frame.hidden).toBe(true);
    expect(create).not.toHaveBeenCalled();
  }
});
it('ignores stale requests and aborts them when another report is selected', async () => {
  let resolveFirst!: (blob: Blob) => void;
  const loader = vi.fn(async (id: string, _signal: AbortSignal): Promise<Blob | null> => id === 'a' ? new Promise<Blob>((resolve) => { resolveFirst = resolve; }) : new Blob(['%PDF-b']));
  const { preview, create } = fixture(loader);
  const first = preview.select('a');
  await preview.select('b');
  expect(loader.mock.calls[0][1].aborted).toBe(true);
  resolveFirst(new Blob(['%PDF-a']));
  await first;
  expect(create).toHaveBeenCalledTimes(1);
});
it('does not refetch on unrelated renders and supports explicit retry', async () => {
  const { preview, loader, revoke } = fixture();
  await preview.select('a'); await preview.select('a');
  expect(loader).toHaveBeenCalledTimes(1);
  await preview.select('a', true);
  expect(loader).toHaveBeenCalledTimes(2);
  expect(revoke).toHaveBeenCalledWith('blob:report');
});
it('clears old files and revokes blob URLs when the active report disappears or the page is disposed', async () => {
  const { preview, frame, status, revoke } = fixture();
  await preview.select('a');
  preview.clear();
  expect(frame.hasAttribute('src')).toBe(false);
  expect(status.dataset.phase).toBe('empty');
  expect(revoke).toHaveBeenCalledWith('blob:report');
  await preview.select('b'); preview.dispose();
  expect(frame.hasAttribute('src')).toBe(false);
});
it('provides open/download guidance when native PDF viewing is unsupported', async () => {
  const { preview, status, frame } = fixture();
  vi.stubGlobal('navigator', { pdfViewerEnabled: false });
  await preview.select('a');
  expect(frame.hidden).toBe(true);
  expect(status.dataset.phase).toBe('error');
  expect(status.textContent).toContain('当前浏览器不支持');
});
it('handles iframe errors without displaying a browser error page', async () => {
  const { preview, frame, status } = fixture();
  await preview.select('a');
  frame.dispatchEvent(new Event('error'));
  expect(status.dataset.phase).toBe('error');
  expect(frame.hidden).toBe(true);
});
