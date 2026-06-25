// @ts-nocheck
import { getLegacyApp } from '../core/app-context';
import { cloudStorage } from '../../services/cloud-storage';
import { AI_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../../utils/fetch';
import { parseJsonMaybe } from '../../utils/json';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { utils } = App;
  const PAGE_ID = 'data-recognition';
  const STORAGE_KEY = 'gjh-data-recognition-session-v1';
  const FIELD_KEYS = [
    '型号',
    '批次',
    '测试温度',
    '熔指',
    '拉伸强度[Mpa]',
    '断裂伸长率[%]',
    '弯曲强度[Mpa]',
    '弯曲模量[Mpa]',
    '冲击强度[Mpa]',
    '冲击强度[Mpa]_2',
  ];
  const MODEL_KEY = FIELD_KEYS[0];
  const TEMPERATURE_KEY = FIELD_KEYS[2];
  const DISPLAY_HEADERS = FIELD_KEYS.map((key) => key === '冲击强度[Mpa]_2' ? '冲击强度[Mpa]' : key);
  const GROUP_KEYS = ['型号', '批次', '测试温度'];

  const IMAGE_MIN_SCALE = 1;
  const IMAGE_MAX_SCALE = 4;
  const IMAGE_SCALE_STEP = 0.2;

  const state = {
    fileName: '',
    imageDataUrl: '',
    streamText: '',
    result: null,
    running: false,
    model: '',
    edited: false,
    history: [],
    historyLoading: false,
    activeHistoryId: '',
    historySyncTimer: null,
    historySearch: '',
    imageView: {
      scale: 1,
      x: 0,
      y: 0,
      dragging: false,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      pointerId: null,
    },
  };
  const refs = {};

  const getFreshRefs = () => {
    refs.page = document.querySelector('[data-page-section="data-recognition"]');
    refs.uploadBtn = document.getElementById('dataRecognitionUploadBtn');
    refs.runBtn = document.getElementById('dataRecognitionRunBtn');
    refs.input = document.getElementById('dataRecognitionInput');
    refs.dropzone = document.getElementById('dataRecognitionDropzone');
    refs.preview = document.getElementById('dataRecognitionPreview');
    refs.empty = document.getElementById('dataRecognitionEmpty');
    refs.imageMeta = document.getElementById('dataRecognitionImageMeta');
    refs.status = document.getElementById('dataRecognitionStatus');
    refs.json = document.getElementById('dataRecognitionJson');
    refs.jsonScroller = refs.json?.closest('.data-recognition-json');
    refs.tableWrap = document.getElementById('dataRecognitionTableWrap');
    refs.tableMeta = document.getElementById('dataRecognitionTableMeta');
    refs.copyTableBtn = document.getElementById('dataRecognitionCopyTableBtn');
    refs.historyList = document.getElementById('dataRecognitionHistoryList');
    refs.historyMeta = document.getElementById('dataRecognitionHistoryMeta');
    refs.historySearchInput = document.getElementById('dataRecognitionHistorySearchInput');
    refs.refreshHistoryBtn = document.getElementById('dataRecognitionRefreshHistoryBtn');
  };

  const installPageDefinition = () => {
    App.constants.PAGE_DEFS[PAGE_ID] = {
      title: '数据识别',
      eyebrow: '当前可用',
      desc: '上传手写数据表格图片，调用配置中心的图谱分析模型，按固定字段输出 JSON 并渲染成表格。',
    };
  };

  const installMarkup = () => {
    if (document.querySelector(`[data-page-section="${PAGE_ID}"]`)) return;

    const spectrumNav = document.querySelector('[data-page="spectrum-analysis"]');
    if (spectrumNav && !document.querySelector(`[data-page="${PAGE_ID}"]`)) {
      spectrumNav.insertAdjacentHTML('afterend', `
        <button class="nav-subitem" type="button" data-page="${PAGE_ID}">数据识别</button>
      `);
    }

    const spectrumSection = document.querySelector('[data-page-section="spectrum-analysis"]');
    const section = document.createElement('section');
    section.className = 'dashboard data-recognition-page page-section';
    section.dataset.pageSection = PAGE_ID;
    section.innerHTML = `
      <div class="data-recognition-workbench">
        <section class="data-recognition-preview-panel">
          <div class="data-recognition-panel-head">
            <div>
              <h2>图片预览</h2>
            </div>
            <div class="data-recognition-actions">
              <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" id="dataRecognitionUploadBtn" type="button">
                <i class="ti ti-photo-up" aria-hidden="true"></i>
                <span>上传图片</span>
              </button>
              <button class="analysis-toolbar-btn" id="dataRecognitionRunBtn" type="button" disabled>
                <i class="ti ti-sparkles" aria-hidden="true"></i>
                <span>开始识别</span>
              </button>
            </div>
            <input id="dataRecognitionInput" type="file" accept="image/*" hidden />
          </div>
          <div class="data-recognition-dropzone" id="dataRecognitionDropzone">
            <img id="dataRecognitionPreview" alt="待识别数据表格" draggable="false" hidden />
            <div class="data-recognition-empty" id="dataRecognitionEmpty">
              <i class="ti ti-table-import" aria-hidden="true"></i>
              <span>拖入或上传手写表格图片</span>
            </div>
          </div>
        </section>

        <section class="data-recognition-json-panel">
          <div class="data-recognition-panel-head">
            <div>
              <h2>实时 JSON</h2>
            </div>
          </div>
          <pre class="data-recognition-json"><code id="dataRecognitionJson">{}</code></pre>
        </section>

        <section class="data-recognition-history-panel">
          <div class="data-recognition-panel-head">
            <div>
              <h2>历史图谱</h2>
              <span id="dataRecognitionHistoryMeta">识别成功后自动保存</span>
            </div>
            <input class="data-recognition-history-search" id="dataRecognitionHistorySearchInput" type="search" placeholder="搜索" aria-label="搜索历史图谱" />
            <button class="analysis-toolbar-btn data-recognition-history-refresh" id="dataRecognitionRefreshHistoryBtn" type="button" title="刷新历史">
              <i class="ti ti-refresh" aria-hidden="true"></i>
            </button>
          </div>
          <div class="data-recognition-history-list" id="dataRecognitionHistoryList">
            <div class="data-recognition-history-empty">暂无历史记录</div>
          </div>
        </section>
      </div>

      <section class="data-recognition-table-panel">
        <div class="data-recognition-panel-head">
          <div>
            <h2>识别表格</h2>
          </div>
          <button class="analysis-toolbar-btn data-recognition-copy-btn" id="dataRecognitionCopyTableBtn" type="button" disabled>
            <i class="ti ti-copy" aria-hidden="true"></i>
            <span>复制表格</span>
          </button>
        </div>
        <div class="data-recognition-table-wrap" id="dataRecognitionTableWrap">
          <div class="data-recognition-table-empty">完成识别后生成表格</div>
        </div>
      </section>

      <div class="bottom-space"></div>
    `;
    (spectrumSection || document.querySelector('[data-page-section="placeholder"]'))?.insertAdjacentElement('afterend', section);

    App.refs.navPageButtons = document.querySelectorAll('[data-page]');
    App.refs.dataRecognitionPageSection = section;
  };

  const setStatus = (text, tone = '') => {
    if (!refs.status) return;
    refs.status.textContent = text;
    refs.status.dataset.tone = tone;
  };

  const setBusy = (busy) => {
    state.running = busy;
    refs.runBtn?.toggleAttribute('disabled', busy || !state.imageDataUrl);
    refs.uploadBtn?.toggleAttribute('disabled', busy);
    const icon = refs.runBtn?.querySelector('i');
    const label = refs.runBtn?.querySelector('span');
    if (icon) icon.className = `ti ${busy ? 'ti-loader-2' : 'ti-sparkles'}`;
    if (label) label.textContent = busy ? '识别中' : (state.result ? '重新识别' : '开始识别');
  };

  const hasPreviewImage = () => Boolean(state.imageDataUrl && refs.preview && !refs.preview.hidden);

  const applyImageView = () => {
    if (!refs.preview) return;
    const view = state.imageView;
    refs.preview.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    refs.dropzone?.classList.toggle('is-zoomed', view.scale > IMAGE_MIN_SCALE);
    const hasImage = hasPreviewImage();
  };

  const resetImageView = () => {
    Object.assign(state.imageView, {
      scale: IMAGE_MIN_SCALE,
      x: 0,
      y: 0,
      dragging: false,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      pointerId: null,
    });
    applyImageView();
  };

  const setImageScale = (nextScale) => {
    if (!hasPreviewImage()) return;
    const view = state.imageView;
    view.scale = Math.min(IMAGE_MAX_SCALE, Math.max(IMAGE_MIN_SCALE, Number(nextScale.toFixed(2))));
    if (view.scale === IMAGE_MIN_SCALE) {
      view.x = 0;
      view.y = 0;
    }
    applyImageView();
  };

  const isFileDragEvent = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

  const saveSession = () => {
    utils.writeJson(STORAGE_KEY, {
      fileName: state.fileName || '',
      imageDataUrl: state.imageDataUrl || '',
      streamText: state.streamText || '',
      result: state.result || null,
      edited: Boolean(state.edited),
      model: state.model || '',
      updatedAt: new Date().toISOString(),
    });
  };

  const restoreSession = () => {
    const saved = utils.readJson(STORAGE_KEY, null);
    if (!saved || typeof saved !== 'object') {
      setBusy(false);
      return;
    }
    state.fileName = String(saved.fileName || '');
    state.imageDataUrl = String(saved.imageDataUrl || '');
    state.streamText = String(saved.streamText || '');
    state.result = saved.result && typeof saved.result === 'object' ? saved.result : null;
    state.edited = Boolean(saved.edited);
    state.model = String(saved.model || '');

    if (state.imageDataUrl && refs.preview) {
      refs.preview.src = state.imageDataUrl;
      refs.preview.hidden = false;
      if (refs.empty) refs.empty.hidden = true;
      if (refs.imageMeta) refs.imageMeta.textContent = state.fileName || '已恢复上次上传图片';
      resetImageView();
    }
    if (state.result?.rows?.length) {
      setStatus(`已恢复上次识别结果：${state.result.rows.length} 行`, 'success');
    }
    renderJson();
    renderTable();
    setBusy(false);
  };

  const formatHistoryTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getHistoryTitle = (item) => {
    const model = String(item?.model_code || '').trim();
    const batch = String(item?.batch_code || '').trim();
    if (model && batch) return `${model} / ${batch}`;
    return model || batch || item?.file_name || '未命名图片';
  };

  const renderHistoryTitle = (item) => getHistoryTitle(item)
    .split('、')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<span>${utils.escapeHtml(line)}</span>`)
    .join('');

  const getResultSummary = () => {
    const rows = state.result?.rows || [];
    const pairs = [];
    const seenPairs = new Set();
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const model = normalizeCell(row[MODEL_KEY] || '');
      const batch = normalizeCell(row[FIELD_KEYS[1]] || '');
      const pair = [model, batch].filter(Boolean).join(' / ');
      if (!pair || seenPairs.has(pair)) return;
      seenPairs.add(pair);
      pairs.push(pair);
    });
    if (pairs.length) return { modelCode: pairs.join('、'), batchCode: '' };
    const models = [...new Set(rows.map((row) => normalizeCell(row?.[MODEL_KEY] || '')).filter(Boolean))];
    const batches = [...new Set(rows.map((row) => normalizeCell(row?.[FIELD_KEYS[1]] || '')).filter(Boolean))];
    return { modelCode: models.join('、'), batchCode: batches.join('、') };
  };

  const renderHistory = () => {
    if (!refs.historyList) return;
    const keyword = state.historySearch.trim().toLowerCase();
    const allItems = state.history || [];
    const items = keyword
      ? allItems.filter((item) => [
        getHistoryTitle(item),
        item?.file_name,
        item?.model,
        formatHistoryTime(item?.created_at),
      ].some((value) => String(value || '').toLowerCase().includes(keyword)))
      : allItems;
    if (refs.historyMeta) {
      refs.historyMeta.textContent = state.historyLoading
        ? '正在加载历史'
        : (keyword ? `匹配 ${items.length} / ${allItems.length} 条` : (items.length ? `共 ${items.length} 条历史` : '识别成功后自动保存'));
    }
    if (state.historyLoading) {
      refs.historyList.innerHTML = '<div class="data-recognition-history-empty">正在加载历史记录</div>';
      return;
    }
    if (!items.length) {
      refs.historyList.innerHTML = `<div class="data-recognition-history-empty">${keyword ? '没有匹配历史记录' : '暂无历史记录'}</div>`;
      return;
    }
    refs.historyList.innerHTML = items.map((item) => `
      <article class="data-recognition-history-item ${item.id === state.activeHistoryId ? 'is-active' : ''}" data-history-id="${utils.escapeHtml(item.id)}">
        <button class="data-recognition-history-main" type="button" data-history-open="${utils.escapeHtml(item.id)}">
          <strong>${renderHistoryTitle(item)}</strong>
          <span>${utils.escapeHtml(formatHistoryTime(item.created_at))}</span>
        </button>
        <button class="data-recognition-history-delete" type="button" data-history-delete="${utils.escapeHtml(item.id)}" title="删除历史">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </article>
    `).join('');
  };

  const refreshHistory = async () => {
    const showLoading = !state.history.length;
    if (showLoading) {
      state.historyLoading = true;
      renderHistory();
    }
    const items = await cloudStorage.listDataRecognitionHistory(60);
    state.history = Array.isArray(items) ? items : [];
    state.historyLoading = false;
    renderHistory();
  };

  const removeHistoryItemWithAnimation = (id) => {
    const item = refs.historyList?.querySelector(`[data-history-id="${CSS.escape(id)}"]`);
    if (!item) {
      renderHistory();
      return;
    }
    item.classList.add('is-removing');
    window.setTimeout(() => {
      item.remove();
      if (!state.history.length) renderHistory();
      if (refs.historyMeta) refs.historyMeta.textContent = state.history.length ? `共 ${state.history.length} 条历史` : '识别成功后自动保存';
    }, 240);
  };

  const saveHistoryRecord = async () => {
    if (!state.imageDataUrl || !state.result?.rows?.length) return;
    const summary = getResultSummary();
    const created = await cloudStorage.createDataRecognitionHistory({
      fileName: state.fileName || '未命名图片',
      imageDataUrl: state.imageDataUrl,
      model: state.model || '',
      rowCount: state.result.rows.length,
      modelCode: summary.modelCode,
      batchCode: summary.batchCode,
      result: state.result,
      rawText: state.streamText || '',
    });
    if (!created?.id) {
      App.notify?.warn?.('识别结果已完成，但历史记录保存失败。', { key: 'data-recognition-history-save-failed' });
      return;
    }
    state.activeHistoryId = created.id;
    await refreshHistory();
  };

  const updateActiveHistoryRecord = async () => {
    if (!state.activeHistoryId || !state.result?.rows?.length) return;
    const summary = getResultSummary();
    const ok = await cloudStorage.updateDataRecognitionHistory(state.activeHistoryId, {
      rowCount: state.result.rows.length,
      modelCode: summary.modelCode,
      batchCode: summary.batchCode,
      result: state.result,
      rawText: JSON.stringify(rowsToGroupedPayload(state.result.rows || []), null, 2),
    });
    if (ok) await refreshHistory();
  };

  const scheduleActiveHistorySync = () => {
    if (!state.activeHistoryId) return;
    window.clearTimeout(state.historySyncTimer);
    state.historySyncTimer = window.setTimeout(updateActiveHistoryRecord, 500);
  };

  const openHistoryRecord = async (id) => {
    if (!id || state.running) return;
    const item = await cloudStorage.getDataRecognitionHistory(id);
    if (!item?.result) {
      App.notify?.warn?.('历史记录读取失败。', { key: 'data-recognition-history-open-failed' });
      return;
    }
    state.activeHistoryId = id;
    state.fileName = String(item.file_name || '历史图片');
    state.imageDataUrl = String(item.imageDataUrl || '');
    state.streamText = String(item.raw_text || JSON.stringify(item.result, null, 2));
    state.result = item.result && typeof item.result === 'object' ? item.result : null;
    state.model = String(item.model || '');
    state.edited = false;
    if (state.imageDataUrl && refs.preview) {
      refs.preview.src = state.imageDataUrl;
      refs.preview.hidden = false;
      if (refs.empty) refs.empty.hidden = true;
      if (refs.imageMeta) refs.imageMeta.textContent = state.fileName;
      resetImageView();
    }
    renderJson();
    renderTable();
    saveSession();
    setStatus(`已载入历史记录：${state.result?.rows?.length || 0} 行`, 'success');
    renderHistory();
    setBusy(false);
  };

  const deleteHistoryRecord = async (id) => {
    if (!id || state.running) return;
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除历史记录',
      message: '确定删除这条历史识别记录？',
    });
    if (!confirmed) return;
    const ok = await cloudStorage.deleteDataRecognitionHistory(id);
    if (!ok) {
      App.notify?.warn?.('历史记录删除失败。', { key: 'data-recognition-history-delete-failed' });
      return;
    }
    if (state.activeHistoryId === id) state.activeHistoryId = '';
    state.history = state.history.filter((item) => item.id !== id);
    removeHistoryItemWithAnimation(id);
  };

  const normalizeHistoryAgentItem = (item) => ({
    id: String(item?.id || ''),
    fileName: String(item?.file_name || item?.fileName || ''),
    model: String(item?.model || ''),
    modelCode: String(item?.model_code || item?.modelCode || ''),
    batchCode: String(item?.batch_code || item?.batchCode || ''),
    rowCount: Number(item?.row_count ?? item?.rowCount ?? 0),
    createdAt: String(item?.created_at || item?.createdAt || ''),
    title: getHistoryTitle(item),
  });

  const searchHistoryByAgent = async (input = {}) => {
    const query = String(input.query || input.question || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(20, Number.parseInt(input.limit, 10) || 8));
    if (!state.history.length) {
      try {
        await refreshHistory();
      } catch {
        // Keep local state fallback when cloud history is unavailable.
      }
    }
    const items = state.history
      .map(normalizeHistoryAgentItem)
      .filter((item) => {
        if (!query) return true;
        return [item.fileName, item.model, item.modelCode, item.batchCode, item.title]
          .some((value) => String(value || '').toLowerCase().includes(query));
      });
    return {
      ok: true,
      message: items.length ? `已找到 ${items.length} 条识别历史。` : '没有找到匹配的识别历史。',
      details: items.slice(0, limit).map((item) => `${item.title || item.fileName || item.id}：${item.rowCount} 行`),
      data: {
        rowCount: items.length,
        items: items.slice(0, limit),
      },
    };
  };

  const inspectCurrentByAgent = () => {
    const summary = getResultSummary();
    const rows = Array.isArray(state.result?.rows) ? state.result.rows : [];
    return {
      ok: Boolean(state.imageDataUrl || rows.length),
      message: rows.length ? `当前识别结果包含 ${rows.length} 行。` : '当前没有可用的识别结果。',
      details: [
        state.fileName ? `文件：${state.fileName}` : '',
        summary.modelCode ? `型号：${summary.modelCode}` : '',
        summary.batchCode ? `批次：${summary.batchCode}` : '',
      ].filter(Boolean),
      data: {
        fileName: state.fileName || '',
        model: state.model || '',
        modelCode: summary.modelCode || '',
        batchCode: summary.batchCode || '',
        rowCount: rows.length,
        result: state.result || null,
        hasImage: Boolean(state.imageDataUrl),
        image: state.imageDataUrl ? {
          type: 'image_url',
          image_url: { url: state.imageDataUrl },
          label: state.fileName || '当前识别图片',
        } : null,
      },
    };
  };

  const splitSSEBuffer = (value) => {
    const blocks = [];
    const text = String(value || '');
    const boundaryPattern = /\r\n\r\n|\n\n|\r\r/g;
    let start = 0;
    let match;

    while ((match = boundaryPattern.exec(text)) !== null) {
      blocks.push(text.slice(start, match.index));
      start = match.index + match[0].length;
    }

    return {
      blocks,
      tail: text.slice(start),
    };
  };

  const parseSSEChunk = (chunk) => {
    const rows = String(chunk || '').split(/\r\n|\n|\r/);
    const payloadLines = [];

    rows.forEach((line) => {
      if (!line.startsWith('data:')) return;
      const rawPayload = line.slice(5);
      payloadLines.push(rawPayload.startsWith(' ') ? rawPayload.slice(1) : rawPayload);
    });

    const payload = payloadLines.join('\n').trim();
    if (!payload || payload === '[DONE]') return [];

    const event = parseJsonMaybe(payload);
    return event ? [event] : [];
  };

  const parseSSEBlocks = (blocks) => {
    const events = [];
    blocks.forEach((block) => {
      parseSSEChunk(block).forEach((event) => events.push(event));
    });
    return events;
  };

  const extractJsonPayload = (content) => {
    const text = String(content || '').trim();
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const candidates = [fenced, text].filter(Boolean);
    for (const candidate of candidates) {
      const parsed = parseJsonMaybe(candidate);
      if (parsed) return parsed;
      const objectStart = candidate.indexOf('{');
      const objectEnd = candidate.lastIndexOf('}');
      const arrayStart = candidate.indexOf('[');
      const arrayEnd = candidate.lastIndexOf(']');
      const useArray = arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart);
      const start = useArray ? arrayStart : objectStart;
      const end = useArray ? arrayEnd : objectEnd;
      if (start >= 0 && end > start) {
        const sliced = parseJsonMaybe(candidate.slice(start, end + 1));
        if (sliced) return sliced;
      }
    }
    return null;
  };

  const normalizeCell = (value) => {
    if (value == null) return '';
    return String(value).trim();
  };

  const normalizeTemperature = (value) => {
    const raw = normalizeCell(value);
    if (!raw || raw === '-') return raw;
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    return match ? `${match[0]}°` : raw;
  };

  const normalizeModelCode = (value) => {
    const raw = normalizeCell(value).toUpperCase().replace(/\s+/g, '');
    if (!raw || raw === '-') return raw;
    return raw.replace(/^(\d{3})66(?=[A-Z0-9-]|$)/, '$1G6');
  };

  const normalizeValueList = (value) => {
    if (Array.isArray(value)) return value.map(normalizeCell);
    const cell = normalizeCell(value);
    return cell ? [cell] : [];
  };

  const getSourceGroups = (payload) => {
    if (Array.isArray(payload)) return payload;
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    if (Array.isArray(source.groups)) return source.groups;
    if (Array.isArray(source.data)) return source.data;
    if (Array.isArray(source.rows)) return source.rows;
    return [];
  };

  const expandGroupRows = (group) => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return [];
    const scalar = GROUP_KEYS.reduce((record, key) => {
      const value = normalizeCell(group[key]);
      record[key] = key === TEMPERATURE_KEY ? normalizeTemperature(value) : (key === MODEL_KEY ? normalizeModelCode(value) : value);
      return record;
    }, {});
    const listMap = FIELD_KEYS.reduce((record, key) => {
      if (GROUP_KEYS.includes(key)) return record;
      record[key] = normalizeValueList(group[key]);
      return record;
    }, {});
    const rowCount = Math.max(1, ...Object.values(listMap).map((values) => values.length));
    return Array.from({ length: rowCount }, (_, index) => FIELD_KEYS.reduce((row, key) => {
      row[key] = GROUP_KEYS.includes(key) ? scalar[key] : (listMap[key]?.[index] || '');
      return row;
    }, {}));
  };

  const normalizeRecognitionResult = (payload) => {
    const rows = getSourceGroups(payload)
      .flatMap(expandGroupRows)
      .filter((row) => FIELD_KEYS.some((key) => row[key]));

    return {
      fields: FIELD_KEYS,
      rows,
    };
  };

  const getPrettyJson = () => {
    if (state.edited && state.result) return JSON.stringify(rowsToGroupedPayload(state.result.rows || []), null, 2);
    const payload = extractJsonPayload(state.streamText);
    if (payload) return JSON.stringify(payload, null, 2);
    return state.streamText || '{}';
  };

  const renderJson = () => {
    if (!refs.json) return;
    refs.json.textContent = getPrettyJson();
    if (refs.jsonScroller) {
      refs.jsonScroller.scrollTop = refs.jsonScroller.scrollHeight;
    }
  };

  const buildGroupMeta = (rows) => {
    const metas = rows.map(() => ({}));
    let index = 0;
    while (index < rows.length) {
      const key = GROUP_KEYS.map((field) => rows[index][field]).join('\u0001');
      let end = index + 1;
      while (end < rows.length && GROUP_KEYS.map((field) => rows[end][field]).join('\u0001') === key) end += 1;
      GROUP_KEYS.forEach((field) => {
        metas[index][field] = end - index;
      });
      index = end;
    }
    return metas;
  };

  const getGroupRange = (rows, rowIndex) => {
    if (!rows[rowIndex]) return { start: rowIndex, end: rowIndex + 1 };
    const key = GROUP_KEYS.map((field) => rows[rowIndex][field]).join('\u0001');
    let start = rowIndex;
    while (start > 0 && GROUP_KEYS.map((field) => rows[start - 1][field]).join('\u0001') === key) start -= 1;
    let end = rowIndex + 1;
    while (end < rows.length && GROUP_KEYS.map((field) => rows[end][field]).join('\u0001') === key) end += 1;
    return { start, end };
  };

  const rowsToGroupedPayload = (rows) => {
    const groups = [];
    let index = 0;
    while (index < rows.length) {
      const { start, end } = getGroupRange(rows, index);
      const first = rows[start] || {};
      const group = GROUP_KEYS.reduce((record, key) => {
        record[key] = first[key] || '';
        return record;
      }, {});
      FIELD_KEYS.forEach((key) => {
        if (GROUP_KEYS.includes(key)) return;
        const values = rows.slice(start, end).map((row) => row[key] || '');
        while (values.length && !values[values.length - 1]) values.pop();
        group[key] = values;
      });
      groups.push(group);
      index = Math.max(end, index + 1);
    }
    return groups;
  };

  const buildTableTsv = () => {
    const rows = state.result?.rows || [];
    const lines = [];
    rows.forEach((row) => {
      lines.push(FIELD_KEYS.map((key) => normalizeCell(row[key]).replace(/\s+/g, ' ')).join('\t'));
    });
    return lines.join('\n');
  };

  const buildTableHtml = () => {
    const rows = state.result?.rows || [];
    const groupMeta = buildGroupMeta(rows);
    const cellStyle = 'border:1px solid #000;padding:3px 8px;text-align:center;vertical-align:middle;white-space:nowrap;';
    const headerStyle = `${cellStyle}background:#bdd8ef;font-weight:700;`;
    const bodyRows = rows.map((row, rowIndex) => `
      <tr>
        ${FIELD_KEYS.map((key, colIndex) => {
          const value = utils.escapeHtml(normalizeCell(row[key] || (GROUP_KEYS.includes(key) ? '-' : '')));
          if (GROUP_KEYS.includes(key)) {
            const rowSpan = groupMeta[rowIndex][key];
            if (!rowSpan) return '';
            return `<th rowspan="${rowSpan}" style="${cellStyle}background:#efefef;font-weight:700;">${value}</th>`;
          }
          const bg = colIndex === 3 ? '#dfeeda'
            : (colIndex === 4 || colIndex === 5) ? '#f5dfd0'
              : (colIndex === 6 || colIndex === 7) ? '#fff2c9'
                : (colIndex === 8 || colIndex === 9) ? '#b9cbe7'
                  : '#fff';
          return `<td style="${cellStyle}background:${bg};">${value}</td>`;
        }).join('')}
      </tr>
    `).join('');
    return `
      <html>
        <body>
          <table style="border-collapse:collapse;font-family:Arial,'Microsoft YaHei',sans-serif;font-size:12px;">
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `;
  };

  const updateCopyButton = () => {
    refs.copyTableBtn?.toggleAttribute('disabled', !(state.result?.rows || []).length);
  };

  const copyTableToClipboard = async () => {
    if (!(state.result?.rows || []).length) return;
    const text = buildTableTsv();
    const html = buildTableHtml();
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      const label = refs.copyTableBtn?.querySelector('span');
      if (label) {
        label.textContent = '已复制';
        window.setTimeout(() => {
          if (label) label.textContent = '复制表格';
        }, 1200);
      }
      App.notify?.success?.('表格已复制，可直接粘贴到 Excel。', { key: 'data-recognition-copy-table' });
    } catch (error) {
      App.notify?.error?.('复制失败，请稍后重试。', { key: 'data-recognition-copy-table-failed' });
    }
  };

  const markEdited = () => {
    state.edited = true;
    renderJson();
    saveSession();
    scheduleActiveHistorySync();
    if (refs.tableMeta) refs.tableMeta.textContent = `已识别 ${state.result?.rows?.length || 0} 行 · 已编辑`;
  };

  const renderTable = () => {
    const rows = state.result?.rows || [];
    if (!refs.tableWrap) return;
    if (!rows.length) {
      refs.tableWrap.style.height = '';
      refs.tableWrap.innerHTML = '<div class="data-recognition-table-empty">完成识别后生成表格</div>';
      if (refs.tableMeta) refs.tableMeta.textContent = '只渲染参考表格内的字段';
      updateCopyButton();
      return;
    }

    rows.forEach((row) => {
      row[MODEL_KEY] = normalizeModelCode(row[MODEL_KEY]);
      row[TEMPERATURE_KEY] = normalizeTemperature(row[TEMPERATURE_KEY]);
    });
    const groupMeta = buildGroupMeta(rows);
    refs.tableWrap.style.height = '';
    refs.tableWrap.innerHTML = `
      <table class="data-recognition-result-table">
        <thead>
          <tr>${DISPLAY_HEADERS.map((header) => `<th>${utils.escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => `
            <tr>
              ${FIELD_KEYS.map((key, colIndex) => {
                if (GROUP_KEYS.includes(key)) {
                  const rowSpan = groupMeta[rowIndex][key];
                  if (!rowSpan) return '';
                  return `<th rowspan="${rowSpan}" class="data-recognition-group-cell" contenteditable="true" spellcheck="false" data-row="${rowIndex}" data-key="${utils.escapeHtml(key)}" data-rowspan="${rowSpan}">${utils.escapeHtml(row[key] || '-')}</th>`;
                }
                return `<td contenteditable="true" spellcheck="false" data-col="${colIndex}" data-row="${rowIndex}" data-key="${utils.escapeHtml(key)}">${utils.escapeHtml(row[key] || '')}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    if (refs.tableMeta) refs.tableMeta.textContent = `已识别 ${rows.length} 行`;
    updateCopyButton();
  };

  const updateCellValue = (cell) => {
    if (!cell || !state.result?.rows) return;
    const rowIndex = Number(cell.dataset.row);
    const key = cell.dataset.key || '';
    if (!Number.isFinite(rowIndex) || !FIELD_KEYS.includes(key)) return;
    const value = normalizeCell(cell.textContent).replace(/^-$/, '');
    if (GROUP_KEYS.includes(key)) {
      const nextValue = key === TEMPERATURE_KEY ? normalizeTemperature(value) : (key === MODEL_KEY ? normalizeModelCode(value) : value);
      const span = Math.max(Number(cell.dataset.rowspan) || 1, 1);
      for (let index = rowIndex; index < Math.min(rowIndex + span, state.result.rows.length); index += 1) {
        state.result.rows[index][key] = nextValue;
      }
      markEdited();
      renderTable();
      return;
    }
    state.result.rows[rowIndex][key] = value;
    markEdited();
  };

  const getRecognitionAiConfig = async () => {
    const savedConfig = await (App.config?.loadSavedConfig?.() || {});
    const saved = savedConfig && typeof savedConfig === 'object' ? savedConfig : {};
    const defaults = App.constants?.DEFAULT_CONFIG || {};
    const rawProvider = String(saved.aiProvider || defaults.aiProvider || 'openrouter').toLowerCase();
    const provider = ['lmstudio', 'deepseek', 'siliconflow', 'openrouter'].includes(rawProvider) ? rawProvider : 'openrouter';
    const providerConfig = provider === 'lmstudio'
      ? saved.lmStudioConfig
      : provider === 'deepseek'
        ? saved.deepseekConfig
        : provider === 'siliconflow'
          ? saved.siliconflowConfig
      : saved.openrouterConfig;
    const activeProviderConfig = providerConfig && typeof providerConfig === 'object' ? providerConfig : {};
    const spectrumModel = String(saved.agentModels?.spectrum || '').trim();
    const modelChoice = spectrumModel
      || saved.modelChoice
      || activeProviderConfig.modelChoice
      || defaults.modelChoice
      || '';
    const baseUrl = saved.baseUrl
      || activeProviderConfig.baseUrl
      || defaults.baseUrl
      || App.constants?.DEFAULT_BASE_URL
      || '';
    return {
      ...defaults,
      ...activeProviderConfig,
      ...saved,
      apiKey: provider === 'lmstudio' ? '' : String(saved.apiKey || activeProviderConfig.apiKey || '').trim(),
      aiProvider: provider,
      baseUrl: utils.normalizeBaseUrl(baseUrl),
      modelChoice,
      modelSource: spectrumModel ? '图谱分析模型' : '默认主模型',
      maxTokens: Math.max(Number(saved.maxTokens || defaults.maxTokens || 4096), 2048),
    };
  };

  const buildPrompt = () => [
    '你是手写材料测试数据表格识别器。只分析用户上传的这一张图片。',
    '必须只返回一个合法 JSON 数组，不要 Markdown，不要解释，不要代码块。',
    '图片里可能包含多组数据。同一组的型号、批次、测试温度可能只写在合并单元格里，请向下继承到该组每一行。',
    '只提取下方 schema 中出现的字段；图片中其他字段、备注、日期、单位说明、表外文字一律不要提取。',
    '如果某个单元格看不清或表内没有，填空字符串。不要猜测表外信息。',
    '固定 JSON schema：返回一个数组，数组内每个对象代表一组型号/批次/测试温度。',
    '[',
    '  {',
    '    "型号": "",',
    '    "批次": "",',
    '    "测试温度": "",',
    '    "熔指": ["", "", ""],',
    '    "拉伸强度[Mpa]": ["", "", ""],',
    '    "断裂伸长率[%]": ["", "", ""],',
    '    "弯曲强度[Mpa]": ["", "", ""],',
    '    "弯曲模量[Mpa]": ["", "", ""],',
    '    "冲击强度[Mpa]": ["", "", ""],',
    '    "冲击强度[Mpa]_2": ["", "", ""],',
    '  }',
    ']',
    '注意：图片中有两个同名“冲击强度[Mpa]”列时，从左到右分别填入 "冲击强度[Mpa]" 和 "冲击强度[Mpa]_2"。',
    '字段名必须完全一致。不要输出 confidence、summary、sourceText、extra、notes 等任何额外字段。',
  ].concat([
    '\u91cd\u8981\uff1a\u578b\u53f7\u5b57\u6bb5\u91cc\u7684 G \u662f\u82f1\u6587\u5b57\u6bcd G\uff0c\u4e0d\u662f\u6570\u5b57 6\u3002\u5e38\u89c1\u578b\u53f7\u5f62\u5f0f\u662f 310G6\u3001320G6\u3001320G3\u3001420G6\u3001520G6 \u7b49\uff0c\u540e\u9762\u53ef\u80fd\u8ddf -N6-X\u3001-N1-X1\u3001-N3-X1 \u7b49\u540e\u7f00\u3002',
    '\u91cd\u8981\uff1a\u4e0d\u8981\u8f93\u51fa 31066\u300132066\u300133066 \u8fd9\u79cd\u578b\u53f7\uff1b\u5982\u679c\u770b\u5230\u7c7b\u4f3c 31066-N6-X\uff0c\u5e94\u6309\u578b\u53f7\u89c4\u5219\u8bc6\u522b\u4e3a 310G6-N6-X\u3002G6 \u8868\u793a 30 \u73bb\u7ea4\uff0cG \u4e0d\u80fd\u88ab\u8bc6\u522b\u6210 6\u3002',
    '\u91cd\u8981\uff1a\u6d4b\u8bd5\u6e29\u5ea6\u662f\u5fc5\u987b\u8bc6\u522b\u5b57\u6bb5\u3002\u5b83\u53ef\u80fd\u5199\u5728\u6bcf\u7ec4\u5de6\u4fa7\u3001\u7ec4\u6807\u9898\u9644\u8fd1\u3001MFI/MI/\u7194\u6307\u6807\u9898\u9644\u8fd1\uff0c\u6216\u5199\u6210 250\u3001250\u00b0\u3001250\u00b0C\u3001750\u3001750\u00b0C \u7b49\u5f62\u5f0f\u3002\u53ea\u8981\u5c5e\u4e8e\u8be5\u7ec4\u6570\u636e\uff0c\u5c31\u5fc5\u987b\u586b\u5165 "\u6d4b\u8bd5\u6e29\u5ea6" \u5b57\u6bb5\uff0c\u4e0d\u8981\u56e0\u4e3a\u5b83\u4e0d\u5728\u4e3b\u8868\u683c\u5185\u5c31\u5ffd\u7565\u3002',
    '\u5982\u679c\u540c\u4e00\u578b\u53f7/\u6279\u6b21\u7684\u591a\u4e2a\u5c0f\u8868\u5171\u7528\u4e00\u4e2a\u6e29\u5ea6\uff0c\u8bf7\u5c06\u8be5\u6e29\u5ea6\u586b\u5165\u8be5\u7ec4\u5bf9\u8c61\u7684 "\u6d4b\u8bd5\u6e29\u5ea6" \u5b57\u6bb5\u3002',
  ]).join('\n');

  const runRecognition = async () => {
    if (!state.imageDataUrl || state.running) return;
    const config = await getRecognitionAiConfig();
    const model = config.modelChoice || config.model || '';
    const isLocal = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i.test(config.baseUrl || '');
    state.model = model;

    if (!config.baseUrl || !model) {
      setStatus('请先在配置中心选择可用于图像理解的图谱分析模型。', 'error');
      return;
    }
    if (!config.apiKey && !isLocal) {
      setStatus('请先在配置中心填写模型 API 密钥，或切换到 LM Studio 本地模型。', 'error');
      return;
    }

    state.streamText = '';
    state.result = null;
    state.edited = false;
    renderJson();
    renderTable();
    setBusy(true);
    setStatus(`正在调用${config.modelSource}：${model}`, 'loading');
    const startTime = Date.now();
    let lastRenderTime = 0;

    try {
      const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config?.getRequestHeaders?.(config) || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt() },
              { type: 'image_url', image_url: { url: state.imageDataUrl } },
            ],
          }],
          temperature: 0,
          max_tokens: Math.max(Number(config.maxTokens) || 4096, 2048),
          stream: true,
        }),
      }, AI_FETCH_TIMEOUT_MS);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`AI 接口返回 HTTP ${response.status}${errorText ? `：${errorText.slice(0, 180)}` : ''}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { blocks, tail } = splitSSEBuffer(buffer);
        buffer = tail;

        parseSSEBlocks(blocks).forEach((event) => {
          const delta = event?.choices?.[0]?.delta?.content;
          if (delta) state.streamText += delta;
        });

        const payload = extractJsonPayload(state.streamText);
        if (payload) state.result = normalizeRecognitionResult(payload);

        const now = Date.now();
        if (now - lastRenderTime > 120) {
          lastRenderTime = now;
          renderJson();
          renderTable();
        }
      }

      buffer += decoder.decode();
      parseSSEBlocks([buffer]).forEach((event) => {
        const delta = event?.choices?.[0]?.delta?.content;
        if (delta) state.streamText += delta;
      });
      buffer = '';

      const payload = extractJsonPayload(state.streamText);
      if (!payload) throw new Error('模型没有返回可解析的 JSON。');
      state.result = normalizeRecognitionResult(payload);
      state.edited = false;
      renderJson();
      renderTable();
      setStatus(`识别完成：${state.result.rows.length} 行`, 'success');
      saveSession();
      await saveHistoryRecord();
      App.aiCallAnalysis?.record?.({
        id: `data-recognition-${Date.now()}`,
        source: 'data-recognition',
        status: 'success',
        endpoint: `${config.baseUrl}/chat/completions`,
        model,
        duration: Date.now() - startTime,
        createdAt: new Date().toISOString(),
        usage: null,
        meta: {
          fileName: state.fileName,
          rows: state.result.rows.length,
        },
      });
    } catch (error) {
      setStatus(error?.message || '识别失败，请稍后重试。', 'error');
      App.notify?.error?.(error?.message || '识别失败，请稍后重试。', { key: 'data-recognition-failed' });
      App.aiCallAnalysis?.record?.({
        id: `data-recognition-${Date.now()}`,
        source: 'data-recognition',
        status: 'error',
        endpoint: `${config.baseUrl}/chat/completions`,
        model,
        duration: Date.now() - startTime,
        createdAt: new Date().toISOString(),
        error: error?.message || String(error || ''),
        meta: { fileName: state.fileName },
      });
    } finally {
      setBusy(false);
    }
  };

  const loadFile = (file) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setStatus('请选择图片文件。', 'error');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.fileName = file.name || '未命名图片';
      state.imageDataUrl = String(reader.result || '');
      state.streamText = '';
      state.result = null;
      state.edited = false;
      if (refs.preview) {
        refs.preview.src = state.imageDataUrl;
        refs.preview.hidden = false;
      }
      if (refs.empty) refs.empty.hidden = true;
      if (refs.imageMeta) refs.imageMeta.textContent = `${state.fileName} · ${Math.round(file.size / 1024)} KB`;
      resetImageView();
      setStatus('图片已载入，可以开始识别。', 'success');
      renderJson();
      renderTable();
      setBusy(false);
      saveSession();
    });
    reader.addEventListener('error', () => setStatus('图片读取失败。', 'error'), { once: true });
    reader.readAsDataURL(file);
  };

  const bindEvents = () => {
    refs.uploadBtn?.addEventListener('click', () => refs.input?.click());
    refs.runBtn?.addEventListener('click', runRecognition);
    refs.copyTableBtn?.addEventListener('click', copyTableToClipboard);
    refs.refreshHistoryBtn?.addEventListener('click', refreshHistory);
    refs.historySearchInput?.addEventListener('input', () => {
      state.historySearch = refs.historySearchInput.value || '';
      renderHistory();
    });
    refs.historyList?.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-history-delete]');
      if (deleteButton) {
        deleteHistoryRecord(deleteButton.dataset.historyDelete || '');
        return;
      }
      const openButton = event.target.closest('[data-history-open]');
      if (openButton) openHistoryRecord(openButton.dataset.historyOpen || '');
    });
    refs.dropzone?.addEventListener('wheel', (event) => {
      if (!hasPreviewImage()) return;
      event.preventDefault();
      setImageScale(state.imageView.scale + (event.deltaY < 0 ? IMAGE_SCALE_STEP : -IMAGE_SCALE_STEP));
    }, { passive: false });
    refs.preview?.addEventListener('pointerdown', (event) => {
      if (!hasPreviewImage() || state.imageView.scale <= IMAGE_MIN_SCALE) return;
      event.preventDefault();
      state.imageView.dragging = true;
      state.imageView.pointerId = event.pointerId;
      state.imageView.startX = event.clientX;
      state.imageView.startY = event.clientY;
      state.imageView.originX = state.imageView.x;
      state.imageView.originY = state.imageView.y;
      refs.preview.setPointerCapture?.(event.pointerId);
      refs.dropzone?.classList.add('is-panning');
    });
    refs.preview?.addEventListener('pointermove', (event) => {
      if (!state.imageView.dragging || state.imageView.pointerId !== event.pointerId) return;
      state.imageView.x = state.imageView.originX + event.clientX - state.imageView.startX;
      state.imageView.y = state.imageView.originY + event.clientY - state.imageView.startY;
      applyImageView();
    });
    refs.preview?.addEventListener('pointerup', (event) => {
      if (state.imageView.pointerId !== event.pointerId) return;
      state.imageView.dragging = false;
      state.imageView.pointerId = null;
      refs.preview.releasePointerCapture?.(event.pointerId);
      refs.dropzone?.classList.remove('is-panning');
    });
    refs.preview?.addEventListener('pointercancel', (event) => {
      if (state.imageView.pointerId !== event.pointerId) return;
      state.imageView.dragging = false;
      state.imageView.pointerId = null;
      refs.dropzone?.classList.remove('is-panning');
    });
    refs.preview?.addEventListener('dragstart', (event) => {
      event.preventDefault();
    });
    refs.input?.addEventListener('change', () => {
      const file = refs.input.files?.[0];
      if (file) loadFile(file);
      refs.input.value = '';
    });
    refs.dropzone?.addEventListener('dragover', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      refs.dropzone.classList.add('is-drag-over');
    });
    refs.dropzone?.addEventListener('dragleave', () => refs.dropzone.classList.remove('is-drag-over'));
    refs.dropzone?.addEventListener('drop', (event) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      refs.dropzone.classList.remove('is-drag-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) loadFile(file);
    });
    refs.tableWrap?.addEventListener('keydown', (event) => {
      const cell = event.target.closest('[contenteditable][data-key]');
      if (!cell) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        cell.blur();
      }
    });
    refs.tableWrap?.addEventListener('input', (event) => {
      const cell = event.target.closest('[contenteditable][data-key]');
      if (!cell || GROUP_KEYS.includes(cell.dataset.key || '')) return;
      updateCellValue(cell);
    });
    refs.tableWrap?.addEventListener('blur', (event) => {
      const cell = event.target.closest('[contenteditable][data-key]');
      if (cell) updateCellValue(cell);
    }, true);
  };

  const init = () => {
    getFreshRefs();
    if (!refs.page) return;
    bindEvents();
    restoreSession();
    refreshHistory();
  };

  installPageDefinition();
  installMarkup();

  App.dataRecognition = { init, searchHistoryByAgent, inspectCurrentByAgent };
})();
