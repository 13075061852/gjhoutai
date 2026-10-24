import { expect, it } from 'vitest';
// @ts-expect-error Tests run in Node; browser app intentionally omits @types/node.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./pages/inspection-reports.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../legacy/features/inspection-reports.ts', import.meta.url), 'utf8');
it('merges report search and upload into one row without a heading or refresh button', () => {
  const toolbar = source.split('<div class="inspection-report-panel-head inspection-report-list-toolbar">')[1]?.split('<div class="inspection-report-list"')[0];
  expect(toolbar).toBeTruthy();
  expect(toolbar).toContain('id="inspectionReportSearchInput"');
  expect(toolbar).toContain('id="inspectionReportUploadBtn"');
  expect(toolbar).not.toContain('<h2>');
  expect(toolbar).not.toContain('inspectionReportRefreshBtn');
  expect(css).toContain('.inspection-report-list-toolbar { display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; }');
  expect(css).toContain('.inspection-report-search-bar { flex: 1 1 0; min-width: 0; padding: 0; }');
});
it('removes redundant report badges and the open button while keeping download', () => {
  expect(source).not.toContain('<span class="inspection-report-card-label">');
  expect(source).not.toContain('inspectionReportPreviewOpen');
  expect(source).not.toContain('id="inspectionReportPreviewDownload"');
  expect(source).not.toContain('<div class="inspection-report-preview-head">');
  expect(source).toContain('data-report-download="${id}"');
  expect(source).toContain('aria-label="下载报告：${title}"');
  expect(source).toContain("downloadReportFile(downloadButton.dataset.reportDownload || '')");
  expect(css).toContain('.inspection-report-card .inspection-report-card-actions { display: flex; flex-direction: row;');
  expect(source).toContain('id="inspectionReportBackBtn"');
  expect(source).toContain('aria-label="删除报告：${title}"');
  expect(source).toContain('aria-pressed="${item.id === state.activeReportId}"');
});
it('gives names two readable lines and removes the oversized hidden action area', () => {
  expect(css).toContain('-webkit-line-clamp: 2;');
  expect(css).toContain('white-space: normal; overflow-wrap: anywhere;');
  expect(css).toContain('width: 28px; min-height: 28px; flex: 0 0 28px;');
  expect(css).toContain('opacity: 1; pointer-events: auto; transform: none;');
});
it('uses real loading and error states rather than a CSS-only placeholder', () => {
  expect(source).toContain('id="inspectionReportPreviewStatus" role="status"');
  expect(source).toContain('data-report-preview-retry');
  expect(source).not.toContain('getPdfPreviewUrl');
  expect(source).toContain('previewController?.dispose()');
  expect(css).not.toContain(':has(> iframe[hidden])::after');
  expect(css).toContain('.inspection-report-preview-status[hidden] { display: none; }');
});
it('keeps list/preview navigation full width on small tablets and phones', () => {
  expect(css).toContain('@media (max-width: 768px)');
  expect(css).toContain('.inspection-reports-page .inspection-report-list-view { width: 100%; min-width: 0; border-right: 0; }');
  expect(css).toContain(':is(button, a):focus-visible');
});
