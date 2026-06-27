import { getLegacyApp } from '../core/app-context';
import { cloudStorage } from '../../services/cloud-storage';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { utils } = App;
  const PAGE_ID = 'inspection-reports';
  const MAX_PDF_SIZE = 50 * 1024 * 1024;

  const state: any = {
    reports: [],
    loading: false,
    uploading: false,
    search: '',
    activeReportId: '',
  };
  const refs: any = {};

  const getFreshRefs = () => {
    refs.page = document.querySelector(`[data-page-section="${PAGE_ID}"]`);
    refs.uploadBtn = document.getElementById('inspectionReportUploadBtn');
    refs.input = document.getElementById('inspectionReportInput');
    refs.searchInput = document.getElementById('inspectionReportSearchInput');
    refs.refreshBtn = document.getElementById('inspectionReportRefreshBtn');
    refs.list = document.getElementById('inspectionReportList');
    refs.listView = document.querySelector('.inspection-report-list-view');
    refs.uploadStatus = document.getElementById('inspectionReportUploadStatus');
    refs.uploadStatusText = document.getElementById('inspectionReportUploadStatusText');
    refs.uploadProgressBar = document.getElementById('inspectionReportUploadProgressBar');
    refs.uploadProgressLabel = document.getElementById('inspectionReportUploadProgressLabel');
    refs.previewView = document.querySelector('.inspection-report-preview-view');
    refs.backBtn = document.getElementById('inspectionReportBackBtn');
    refs.previewFrame = document.getElementById('inspectionReportPreviewFrame');
    refs.previewTitle = document.getElementById('inspectionReportPreviewTitle');
    refs.previewMeta = document.getElementById('inspectionReportPreviewMeta');
    refs.previewOpen = document.getElementById('inspectionReportPreviewOpen');
    refs.previewDownload = document.getElementById('inspectionReportPreviewDownload');
  };

  const installPageDefinition = () => {
    App.constants.PAGE_DEFS[PAGE_ID] = {
      title: '检测报告',
      eyebrow: '当前可用',
      desc: '集中存放数据检测报告 PDF 文件，文件保存在 Cloudflare 云端，支持上传、检索、打开和删除。',
    };
  };

  const installMarkup = () => {
    if (document.querySelector(`[data-page-section="${PAGE_ID}"]`)) return;

    const dataRecognitionNav = document.querySelector('[data-page="data-recognition"]');
    const spectrumNav = document.querySelector('[data-page="spectrum-analysis"]');
    const imageCutoutNav = document.querySelector('[data-page="image-cutout"]');
    if (!document.querySelector(`[data-page="${PAGE_ID}"]`)) {
      (dataRecognitionNav || spectrumNav || imageCutoutNav)?.insertAdjacentHTML('afterend', `
        <button class="nav-subitem" type="button" data-page="${PAGE_ID}">检测报告</button>
      `);
    }

    const dataRecognitionSection = document.querySelector('[data-page-section="data-recognition"]');
    const imageCutoutSection = document.querySelector('[data-page-section="image-cutout"]');
    const section = document.createElement('section');
    section.className = 'dashboard inspection-reports-page page-section';
    section.dataset.pageSection = PAGE_ID;
    section.innerHTML = `
      <div class="inspection-report-shell">
        <div class="inspection-report-list-view">
          <div class="inspection-report-panel-head">
            <div>
              <h2>检测报告</h2>
            </div>
            <div class="inspection-report-actions">
              <button class="analysis-toolbar-btn" id="inspectionReportRefreshBtn" type="button" title="刷新列表">
                <i class="ti ti-refresh" aria-hidden="true"></i>
              </button>
              <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" id="inspectionReportUploadBtn" type="button">
                <i class="ti ti-upload" aria-hidden="true"></i>
                <span>上传</span>
              </button>
              <input id="inspectionReportInput" type="file" accept="application/pdf,.pdf" multiple hidden />
            </div>
          </div>
          <div class="inspection-report-search-bar">
            <input class="inspection-report-search" id="inspectionReportSearchInput" type="search" placeholder="搜索报告名称、文件名..." aria-label="搜索检测报告" />
          </div>
          <div class="inspection-report-list" id="inspectionReportList">
            <div class="inspection-report-empty">
              <div class="inspection-report-empty-icon">
                <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
              </div>
              <strong>暂无检测报告</strong>
              <span>点击「上传」按钮添加 PDF 文件</span>
            </div>
          </div>
          <div class="inspection-report-drop-hint" aria-hidden="true">
            <div class="inspection-report-drop-card">
              <i class="ti ti-upload" aria-hidden="true"></i>
              <strong>松开后上传检测报告</strong>
              <span>仅支持 50MB 以内的 PDF 文件</span>
            </div>
          </div>
          <div class="inspection-report-upload-status" id="inspectionReportUploadStatus" role="status" aria-live="polite" hidden>
            <div class="inspection-report-upload-status-head">
              <span id="inspectionReportUploadStatusText">正在上传检测报告...</span>
              <em id="inspectionReportUploadProgressLabel">0%</em>
            </div>
            <div class="inspection-report-upload-track" aria-hidden="true">
              <span id="inspectionReportUploadProgressBar"></span>
            </div>
          </div>
        </div>

        <div class="inspection-report-preview-view">
          <div class="inspection-report-preview-head">
            <button class="inspection-report-back-btn" id="inspectionReportBackBtn" type="button">
              <i class="ti ti-arrow-left" aria-hidden="true"></i>
              <span>返回</span>
            </button>
            <div class="inspection-report-preview-info">
              <h3 id="inspectionReportPreviewTitle">文档预览</h3>
              <span id="inspectionReportPreviewMeta">-</span>
            </div>
            <div class="inspection-report-preview-actions">
              <a class="analysis-toolbar-btn" id="inspectionReportPreviewOpen" href="#" target="_blank" rel="noopener" title="在新窗口打开" aria-disabled="true">
                <i class="ti ti-external-link" aria-hidden="true"></i>
              </a>
              <a class="analysis-toolbar-btn" id="inspectionReportPreviewDownload" href="#" download title="下载 PDF" aria-disabled="true">
                <i class="ti ti-download" aria-hidden="true"></i>
              </a>
            </div>
          </div>
          <div class="inspection-report-preview-body">
            <iframe id="inspectionReportPreviewFrame" title="检测报告预览" hidden></iframe>
          </div>
        </div>
      </div>
      <div class="bottom-space"></div>
    `;
    (dataRecognitionSection || imageCutoutSection || document.querySelector('[data-page-section="placeholder"]'))?.insertAdjacentElement('afterend', section);

    App.refs.navPageButtons = document.querySelectorAll('[data-page]');
    App.refs.inspectionReportsPageSection = section;
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const formatFileSize = (value) => {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return '-';
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  };

  const getReportTitle = (item) => String(item?.title || item?.file_name || '未命名检测报告').trim();

  const getComparableReportName = (value) => String(value || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .toLowerCase();

  const shouldShowReportFileName = (item) => {
    const titleName = getComparableReportName(getReportTitle(item));
    const fileName = getComparableReportName(item?.file_name);
    return Boolean(fileName && titleName !== fileName);
  };

  const getActiveReport = () => state.reports.find((item) => item.id === state.activeReportId) || null;

  const getFilteredReports = () => {
    const keyword = state.search.trim().toLowerCase();
    if (!keyword) return state.reports;
    return state.reports.filter((item) => [
      getReportTitle(item),
      item?.file_name,
      item?.category,
      item?.notes,
      item?.created_by_name,
      formatDate(item?.created_at),
    ].some((value) => String(value || '').toLowerCase().includes(keyword)));
  };

  const setPreviewLinkState = (element, url, fileName) => {
    if (!element) return;
    if (!url) {
      element.setAttribute('href', '#');
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('tabindex', '-1');
      return;
    }
    element.setAttribute('href', url);
    element.removeAttribute('aria-disabled');
    element.removeAttribute('tabindex');
    if (fileName && element === refs.previewDownload) element.setAttribute('download', fileName);
  };

  const getPdfPreviewUrl = (url) => url ? `${url}#zoom=85` : '';

  const renderPreview = () => {
    const item = getActiveReport();

    if (!item) return;

    const url = cloudStorage.getInspectionReportFileUrl(item.id || '');
    const previewUrl = getPdfPreviewUrl(url);
    const title = getReportTitle(item);
    if (refs.previewTitle) refs.previewTitle.textContent = title;
    if (refs.previewMeta) refs.previewMeta.textContent = `${formatFileSize(item.file_size)} · ${formatDate(item.created_at)}`;
    if (refs.previewFrame) {
      refs.previewFrame.hidden = false;
      if (refs.previewFrame.getAttribute('src') !== previewUrl) refs.previewFrame.setAttribute('src', previewUrl);
    }
    setPreviewLinkState(refs.previewOpen, url, item.file_name || '');
    setPreviewLinkState(refs.previewDownload, url, item.file_name || '');
  };

  const isSmallScreen = () => window.innerWidth <= 768;

  const showPreview = () => {
    if (isSmallScreen()) {
      refs.page?.classList.add('is-previewing');
    }
    renderPreview();
  };

  const showList = () => {
    refs.page?.classList.remove('is-previewing');
  };

  const renderReports = () => {
    if (!refs.list) return;
    const items = getFilteredReports();
    if (state.loading && !state.reports.length) {
      refs.list.innerHTML = `
        <div class="inspection-report-empty">
          <div class="inspection-report-empty-icon">
            <i class="ti ti-loader-2" aria-hidden="true"></i>
          </div>
          <strong>正在加载</strong>
          <span>正在从云端获取检测报告...</span>
        </div>
      `;
      return;
    }
    if (!items.length) {
      refs.list.innerHTML = `
        <div class="inspection-report-empty">
          <div class="inspection-report-empty-icon">
            <i class="ti ti-${state.search ? 'search' : 'folder'}" aria-hidden="true"></i>
          </div>
          <strong>${state.search ? '未找到匹配结果' : '暂无检测报告'}</strong>
          <span>${state.search ? '尝试使用其他关键词搜索' : '点击右上角上传按钮添加 PDF 文件'}</span>
        </div>
      `;
      return;
    }
    refs.list.innerHTML = items.map((item) => {
      const id = utils.escapeHtml(item.id || '');
      const title = utils.escapeHtml(getReportTitle(item));
      const fileName = utils.escapeHtml(item.file_name || '');
      const fileNameHtml = shouldShowReportFileName(item) ? `<div class="inspection-report-file">${fileName}</div>` : '';
      const notes = String(item.notes || '').trim();
      const fileUrl = utils.escapeHtml(cloudStorage.getInspectionReportFileUrl(item.id || ''));
      return `
        <article class="inspection-report-card ${item.id === state.activeReportId ? 'is-active' : ''}" data-report-id="${id}">
          <div class="inspection-report-icon"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></div>
          <button class="inspection-report-main" type="button" data-report-preview="${id}">
            <div class="inspection-report-title-row">
              <h3>${title}</h3>
            </div>
            ${fileNameHtml}
            ${notes ? `<p>${utils.escapeHtml(notes)}</p>` : ''}
            <div class="inspection-report-meta">
              <span>${utils.escapeHtml(formatFileSize(item.file_size))}</span>
              <span>${utils.escapeHtml(formatDate(item.created_at))}</span>
            </div>
          </button>
          <div class="inspection-report-card-actions">
            <span class="inspection-report-card-label">检测报告</span>
            <a class="analysis-toolbar-btn" href="${fileUrl}" target="_blank" rel="noopener" title="在新窗口中打开">
              <i class="ti ti-external-link" aria-hidden="true"></i>
            </a>
            <a class="analysis-toolbar-btn" href="${fileUrl}" download="${fileName}" title="下载文件">
              <i class="ti ti-download" aria-hidden="true"></i>
            </a>
            <button class="analysis-toolbar-btn inspection-report-delete" type="button" data-report-delete="${id}" title="删除报告">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
        </article>
      `;
    }).join('');
    renderPreview();
  };

  const refreshReports = async () => {
    state.loading = true;
    renderReports();
    const items = await cloudStorage.listInspectionReports(160);
    state.reports = Array.isArray(items) ? items : [];
    if (state.activeReportId && !state.reports.some((item) => item.id === state.activeReportId)) {
      state.activeReportId = '';
    }
    if (!state.activeReportId && state.reports.length) {
      state.activeReportId = state.reports[0].id || '';
    }
    state.loading = false;
    renderReports();
    if (!Array.isArray(items)) {
      App.notify?.warn?.('检测报告列表读取失败。', { key: 'inspection-report-list-failed' });
    }
  };

  const normalizeTitle = (fileName) => String(fileName || '检测报告').replace(/\.pdf$/i, '').trim() || '检测报告';

  const setUploadProgress = ({ current = 0, total = 0, fileName = '' } = {} as any) => {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrent = Math.min(Math.max(0, Number(current) || 0), safeTotal);
    const percent = safeTotal ? Math.round((safeCurrent / safeTotal) * 100) : 0;
    const displayCurrent = fileName ? Math.min(safeCurrent + 1, safeTotal) : safeCurrent;
    refs.listView?.classList.toggle('is-uploading', state.uploading);
    if (refs.uploadStatus) refs.uploadStatus.hidden = !state.uploading;
    if (refs.uploadStatusText) {
      refs.uploadStatusText.textContent = state.uploading
        ? `正在上传 ${displayCurrent}/${safeTotal}${fileName ? `：${fileName}` : ''}`
        : '';
    }
    if (refs.uploadProgressLabel) refs.uploadProgressLabel.textContent = `${percent}%`;
    if (refs.uploadProgressBar) refs.uploadProgressBar.style.width = `${percent}%`;
  };

  const uploadFiles = async (files) => {
    if (state.uploading) {
      App.notify?.warn?.('检测报告正在上传，请稍后再试。', { key: 'inspection-report-uploading' });
      return;
    }
    const pdfFiles = Array.from(files || []).filter((file) => {
      const isPdf = file?.type === 'application/pdf' || String(file?.name || '').toLowerCase().endsWith('.pdf');
      return isPdf && file.size > 0 && file.size <= MAX_PDF_SIZE;
    });
    if (!pdfFiles.length) {
      App.notify?.warn?.('请选择 50MB 以内的 PDF 文件。', { key: 'inspection-report-invalid-file' });
      return;
    }

    state.uploading = true;
    refs.uploadBtn?.setAttribute('disabled', '');
    setUploadProgress({ current: 0, total: pdfFiles.length });
    let successCount = 0;
    for (const [index, file] of pdfFiles.entries()) {
      setUploadProgress({ current: index, total: pdfFiles.length, fileName: file.name });
      const created = await cloudStorage.createInspectionReport({
        file,
        title: normalizeTitle(file.name),
        category: '检测报告',
        notes: '',
      });
      if (created?.id) successCount += 1;
      setUploadProgress({ current: index + 1, total: pdfFiles.length });
    }
    state.uploading = false;
    refs.uploadBtn?.removeAttribute('disabled');
    setUploadProgress();
    if (successCount) {
      App.notify?.success?.(`已上传 ${successCount} 份检测报告。`, { key: 'inspection-report-uploaded' });
      await refreshReports();
    } else {
      App.notify?.error?.('检测报告上传失败。', { key: 'inspection-report-upload-failed' });
      renderReports();
    }
  };

  const deleteReport = async (id) => {
    if (!id) return;
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除检测报告',
      message: '确定删除这份检测报告？',
    });
    if (!confirmed) return;
    const ok = await cloudStorage.deleteInspectionReport(id);
    if (!ok) {
      App.notify?.error?.('检测报告删除失败。', { key: 'inspection-report-delete-failed' });
      return;
    }
    if (state.activeReportId === id) state.activeReportId = '';
    state.reports = state.reports.filter((item) => item.id !== id);
    if (!state.activeReportId && state.reports.length) state.activeReportId = state.reports[0].id || '';
    App.notify?.success?.('检测报告已删除。', { key: 'inspection-report-deleted' });
    renderReports();
  };

  const isFileDragEvent = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

  const bindEvents = () => {
    refs.uploadBtn?.addEventListener('click', () => refs.input?.click());
    refs.refreshBtn?.addEventListener('click', refreshReports);
    refs.backBtn?.addEventListener('click', showList);
    refs.previewOpen?.addEventListener('click', (event) => {
      if (!getActiveReport()) event.preventDefault();
    });
    refs.previewDownload?.addEventListener('click', (event) => {
      if (!getActiveReport()) event.preventDefault();
    });
    refs.searchInput?.addEventListener('input', () => {
      state.search = refs.searchInput.value || '';
      renderReports();
    });
    refs.input?.addEventListener('change', () => {
      uploadFiles(refs.input.files);
      refs.input.value = '';
    });
    refs.list?.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-report-delete]');
      if (deleteButton) {
        event.stopPropagation();
        deleteReport(deleteButton.dataset.reportDelete || '');
        return;
      }
      const previewButton = event.target.closest('[data-report-preview]');
      if (previewButton) {
        state.activeReportId = previewButton.dataset.reportPreview || '';
        renderReports();
        showPreview();
      }
    });
    refs.listView?.addEventListener('dragover', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      refs.listView.classList.add('is-drag-over');
    });
    refs.listView?.addEventListener('dragleave', (event) => {
      if (refs.listView.contains(event.relatedTarget)) return;
      refs.listView.classList.remove('is-drag-over');
    });
    refs.listView?.addEventListener('drop', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      refs.listView.classList.remove('is-drag-over');
      uploadFiles(event.dataTransfer?.files);
    });
  };

  const init = () => {
    getFreshRefs();
    if (!refs.page) return;
    bindEvents();
    refreshReports();
  };

  installPageDefinition();
  installMarkup();

  App.inspectionReports = { init, refresh: refreshReports };
})();

