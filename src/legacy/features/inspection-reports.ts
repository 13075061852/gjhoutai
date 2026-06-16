// @ts-nocheck
import { getLegacyApp } from '../core/app-context';
import { cloudStorage } from '../../services/cloud-storage';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { utils } = App;
  const PAGE_ID = 'inspection-reports';
  const MAX_PDF_SIZE = 50 * 1024 * 1024;

  const state = {
    reports: [],
    loading: false,
    uploading: false,
    search: '',
    activeReportId: '',
    previewCollapsed: false,
  };
  const refs = {};

  const getFreshRefs = () => {
    refs.page = document.querySelector(`[data-page-section="${PAGE_ID}"]`);
    refs.uploadBtn = document.getElementById('inspectionReportUploadBtn');
    refs.input = document.getElementById('inspectionReportInput');
    refs.searchInput = document.getElementById('inspectionReportSearchInput');
    refs.refreshBtn = document.getElementById('inspectionReportRefreshBtn');
    refs.list = document.getElementById('inspectionReportList');
    refs.meta = document.getElementById('inspectionReportMeta');
    refs.leftPanel = document.querySelector('.inspection-report-left-panel');
    refs.previewPanel = document.getElementById('inspectionReportPreviewPanel');
    refs.previewFrame = document.getElementById('inspectionReportPreviewFrame');
    refs.previewTitle = document.getElementById('inspectionReportPreviewTitle');
    refs.previewMeta = document.getElementById('inspectionReportPreviewMeta');
    refs.previewToggle = document.getElementById('inspectionReportPreviewToggle');
    refs.previewOpen = document.getElementById('inspectionReportPreviewOpen');
    refs.previewDownload = document.getElementById('inspectionReportPreviewDownload');
    refs.previewEmpty = document.getElementById('inspectionReportPreviewEmpty');
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
        <section class="inspection-report-left-panel">
          <div class="inspection-report-panel-head">
            <div>
              <h2>检测报告</h2>
              <span id="inspectionReportMeta">PDF 文件保存在 Cloudflare 云端</span>
            </div>
            <div class="inspection-report-actions">
              <input class="inspection-report-search" id="inspectionReportSearchInput" type="search" placeholder="搜索报告" aria-label="搜索检测报告" />
              <button class="analysis-toolbar-btn" id="inspectionReportRefreshBtn" type="button" title="刷新">
                <i class="ti ti-refresh" aria-hidden="true"></i>
              </button>
              <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" id="inspectionReportUploadBtn" type="button">
                <i class="ti ti-file-upload" aria-hidden="true"></i>
                <span>上传PDF</span>
              </button>
              <input id="inspectionReportInput" type="file" accept="application/pdf,.pdf" multiple hidden />
            </div>
          </div>
          <div class="inspection-report-list" id="inspectionReportList">
            <div class="inspection-report-empty">暂无检测报告</div>
          </div>
        </section>

        <section class="inspection-report-preview-panel" id="inspectionReportPreviewPanel">
          <div class="inspection-report-panel-head inspection-report-preview-head">
            <div>
              <h2 id="inspectionReportPreviewTitle">预览区域</h2>
              <span id="inspectionReportPreviewMeta">选择左侧报告后预览 PDF</span>
            </div>
            <div class="inspection-report-preview-actions">
              <a class="analysis-toolbar-btn" id="inspectionReportPreviewOpen" href="#" target="_blank" rel="noopener" title="新窗口打开" aria-disabled="true">
                <i class="ti ti-external-link" aria-hidden="true"></i>
              </a>
              <a class="analysis-toolbar-btn" id="inspectionReportPreviewDownload" href="#" download title="下载PDF" aria-disabled="true">
                <i class="ti ti-download" aria-hidden="true"></i>
              </a>
              <button class="analysis-toolbar-btn" id="inspectionReportPreviewToggle" type="button" title="收起预览" aria-expanded="true">
                <i class="ti ti-layout-sidebar-right-collapse" aria-hidden="true"></i>
                <span>收起</span>
              </button>
            </div>
          </div>
          <div class="inspection-report-preview-body">
            <div class="inspection-report-preview-empty" id="inspectionReportPreviewEmpty">
              <i class="ti ti-file-search" aria-hidden="true"></i>
              <strong>未选择检测报告</strong>
              <span>从左侧列表选择一份 PDF 后在这里预览</span>
            </div>
            <iframe id="inspectionReportPreviewFrame" title="检测报告预览" hidden></iframe>
          </div>
        </section>
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

  const renderMeta = (items) => {
    if (!refs.meta) return;
    if (state.uploading) {
      refs.meta.textContent = '正在上传 PDF';
      return;
    }
    if (state.loading) {
      refs.meta.textContent = '正在加载云端报告';
      return;
    }
    refs.meta.textContent = state.search
      ? `匹配 ${items.length} / ${state.reports.length} 份报告`
      : (state.reports.length ? `共 ${state.reports.length} 份检测报告` : 'PDF 文件保存在 Cloudflare 云端');
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

  const renderPreview = () => {
    const item = getActiveReport();
    const collapsed = Boolean(state.previewCollapsed);
    refs.previewPanel?.classList.toggle('is-collapsed', collapsed);
    refs.page?.classList.toggle('preview-collapsed', collapsed);
    refs.previewToggle?.setAttribute('aria-expanded', String(!collapsed));
    const toggleIcon = refs.previewToggle?.querySelector('i');
    const toggleLabel = refs.previewToggle?.querySelector('span');
    if (toggleIcon) toggleIcon.className = `ti ${collapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-right-collapse'}`;
    if (toggleLabel) toggleLabel.textContent = collapsed ? '展开' : '收起';
    if (refs.previewToggle) refs.previewToggle.title = collapsed ? '展开预览' : '收起预览';

    if (!item) {
      if (refs.previewTitle) refs.previewTitle.textContent = '预览区域';
      if (refs.previewMeta) refs.previewMeta.textContent = '选择左侧报告后预览 PDF';
      if (refs.previewFrame) {
        refs.previewFrame.hidden = true;
        refs.previewFrame.removeAttribute('src');
      }
      if (refs.previewEmpty) refs.previewEmpty.hidden = false;
      setPreviewLinkState(refs.previewOpen, '', '');
      setPreviewLinkState(refs.previewDownload, '', '');
      return;
    }

    const url = cloudStorage.getInspectionReportFileUrl(item.id || '');
    const title = getReportTitle(item);
    if (refs.previewTitle) refs.previewTitle.textContent = title;
    if (refs.previewMeta) refs.previewMeta.textContent = `${formatFileSize(item.file_size)} · ${formatDate(item.created_at)}`;
    if (refs.previewEmpty) refs.previewEmpty.hidden = true;
    if (refs.previewFrame) {
      refs.previewFrame.hidden = false;
      if (refs.previewFrame.getAttribute('src') !== url) refs.previewFrame.setAttribute('src', url);
    }
    setPreviewLinkState(refs.previewOpen, url, item.file_name || '');
    setPreviewLinkState(refs.previewDownload, url, item.file_name || '');
  };

  const renderReports = () => {
    if (!refs.list) return;
    const items = getFilteredReports();
    renderMeta(items);
    if (state.loading && !state.reports.length) {
      refs.list.innerHTML = '<div class="inspection-report-empty">正在加载检测报告</div>';
      return;
    }
    if (!items.length) {
      refs.list.innerHTML = `<div class="inspection-report-empty">${state.search ? '没有匹配的检测报告' : '暂无检测报告'}</div>`;
      return;
    }
    refs.list.innerHTML = items.map((item) => {
      const id = utils.escapeHtml(item.id || '');
      const title = utils.escapeHtml(getReportTitle(item));
      const fileName = utils.escapeHtml(item.file_name || '');
      const category = utils.escapeHtml(item.category || '检测报告');
      const notes = String(item.notes || '').trim();
      const createdBy = utils.escapeHtml(item.created_by_name || '未记录');
      const fileUrl = utils.escapeHtml(cloudStorage.getInspectionReportFileUrl(item.id || ''));
      return `
        <article class="inspection-report-card ${item.id === state.activeReportId ? 'is-active' : ''}" data-report-id="${id}">
          <div class="inspection-report-icon"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></div>
          <button class="inspection-report-main" type="button" data-report-preview="${id}">
            <div class="inspection-report-title-row">
              <h3>${title}</h3>
              <span>${category}</span>
            </div>
            <div class="inspection-report-file">${fileName}</div>
            ${notes ? `<p>${utils.escapeHtml(notes)}</p>` : ''}
            <div class="inspection-report-meta">
              <span>${utils.escapeHtml(formatFileSize(item.file_size))}</span>
              <span>${utils.escapeHtml(formatDate(item.created_at))}</span>
              <span>${createdBy}</span>
            </div>
          </button>
          <div class="inspection-report-card-actions">
            <a class="analysis-toolbar-btn" href="${fileUrl}" target="_blank" rel="noopener" title="新窗口打开">
              <i class="ti ti-eye" aria-hidden="true"></i>
            </a>
            <a class="analysis-toolbar-btn" href="${fileUrl}" download="${fileName}" title="下载PDF">
              <i class="ti ti-download" aria-hidden="true"></i>
            </a>
            <button class="analysis-toolbar-btn inspection-report-delete" type="button" data-report-delete="${id}" title="删除">
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

  const uploadFiles = async (files) => {
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
    renderMeta(getFilteredReports());
    let successCount = 0;
    for (const file of pdfFiles) {
      const created = await cloudStorage.createInspectionReport({
        file,
        title: normalizeTitle(file.name),
        category: '检测报告',
        notes: '',
      });
      if (created?.id) successCount += 1;
    }
    state.uploading = false;
    refs.uploadBtn?.removeAttribute('disabled');
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
    if (!window.confirm('确定删除这份检测报告？')) return;
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
    refs.previewToggle?.addEventListener('click', () => {
      state.previewCollapsed = !state.previewCollapsed;
      renderPreview();
    });
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
      if (deleteButton) deleteReport(deleteButton.dataset.reportDelete || '');
      const previewButton = event.target.closest('[data-report-preview]');
      if (previewButton) {
        state.activeReportId = previewButton.dataset.reportPreview || '';
        renderReports();
      }
    });
    refs.leftPanel?.addEventListener('dragover', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      refs.leftPanel.classList.add('is-drag-over');
    });
    refs.leftPanel?.addEventListener('dragleave', (event) => {
      if (refs.leftPanel.contains(event.relatedTarget)) return;
      refs.leftPanel.classList.remove('is-drag-over');
    });
    refs.leftPanel?.addEventListener('drop', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      refs.leftPanel.classList.remove('is-drag-over');
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
