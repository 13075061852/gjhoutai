type PdfLoader = (id: string, signal: AbortSignal) => Promise<Blob | null>;

/** Load through the authenticated API, not a remote page inside an iframe. */
export function mountInspectionReportPreview(frame: HTMLIFrameElement, status: HTMLElement, loadFile: PdfLoader) {
  let activeId = '';
  let generation = 0;
  let controller: AbortController | null = null;
  let objectUrl = '';
  const setStatus = (phase: 'empty' | 'loading' | 'error' | 'ready', message = '') => {
    status.dataset.phase = phase;
    status.hidden = phase === 'ready';
    frame.hidden = phase !== 'ready';
    frame.parentElement?.setAttribute('aria-busy', String(phase === 'loading'));
    const title = status.querySelector('strong');
    const copy = status.querySelector('p');
    const retry = status.querySelector<HTMLButtonElement>('[data-report-preview-retry]');
    if (title) title.textContent = phase === 'loading' ? '正在加载报告' : phase === 'error' ? '暂时无法预览' : '选择一份检测报告';
    if (copy) copy.textContent = message || (phase === 'loading' ? '正在安全读取 PDF 文件，请稍候' : '从列表选择报告，即可在此查看内容');
    if (retry) retry.hidden = phase !== 'error';
  };
  const release = () => {
    controller?.abort();
    controller = null;
    frame.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  };
  const clear = () => {
    generation++;
    activeId = '';
    release();
    setStatus('empty');
  };
  const select = async (id: string, retry = false) => {
    if (!id) { clear(); return; }
    if (!retry && id === activeId) return;
    const current = ++generation;
    activeId = id;
    release();
    controller = new AbortController();
    const { signal } = controller;
    setStatus('loading');
    try {
      const blob = await loadFile(id, signal);
      if (current !== generation || signal.aborted) return;
      if (!blob || blob.size > 50 * 1024 * 1024 || !(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('invalid_pdf');
      if (current !== generation || signal.aborted) return;
      if (navigator.pdfViewerEnabled === false) {
        setStatus('error', '当前浏览器不支持内嵌 PDF，请使用报告列表中的下载按钮。');
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      // Start with the report itself, not a thumbnail sidebar that consumes half
      // of a tablet preview. Native PDF controls are unnecessary in this inline preview.
      // FitH + page-width cover the sizing conventions used by native viewers;
      // these are viewer hints, not access restrictions on the original PDF.
      frame.src = `${objectUrl}#toolbar=0&navpanes=0&pagemode=none&view=FitH&zoom=page-width`;
      setStatus('ready');
    } catch {
      if (current === generation && !signal.aborted) setStatus('error', '文件暂时无法读取，请重试，或使用报告列表中的下载按钮。');
    }
  };
  const onError = () => {
    if (objectUrl) setStatus('error', '浏览器无法显示这份 PDF，请使用报告列表中的下载按钮。');
  };
  frame.addEventListener('error', onError);
  clear();
  return {
    select, clear,
    dispose() { clear(); frame.removeEventListener('error', onError); },
  };
}
