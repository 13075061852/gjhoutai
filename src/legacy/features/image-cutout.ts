// @ts-nocheck
import { getLegacyApp } from '../core/app-context';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { utils } = App;
  const STORAGE_KEY = 'gjh-cutout-session-v1';
  const IMAGE_DB_NAME = 'gjh-cutout-images-db';
  const IMAGE_DB_VERSION = 1;
  const IMAGE_STORE_NAME = 'images';
  const LAST_IMAGE_KEY = 'last-upload';

  const state = {
    fileName: '',
    sourceImage: null,
    imageStored: false,
    sourceCanvas: document.createElement('canvas'),
    cutoutCanvas: document.createElement('canvas'),
    outputCanvas: document.createElement('canvas'),
    mode: 'auto',
    crop: { x: 0, y: 0, w: 0, h: 0 },
    draggingCrop: false,
    dragStart: null,
    cropStart: null,
    cropDragAction: '',
    previewSource: 'source',
    previewZoom: 1,
    previewPanX: 0,
    previewPanY: 0,
    draggingPreview: false,
    previewDragStart: null,
    previewPanStart: null,
    history: [],
    renderTimer: 0,
    renderSeq: 0,
  };
  const refs = {};
  let imageDbPromise = null;

  const initRefs = () => {
    refs.uploadBtn = document.getElementById('cutoutUploadBtn');
    refs.uploadInput = document.getElementById('cutoutUploadInput');
    refs.downloadBtn = document.getElementById('cutoutDownloadBtn');
    refs.autoCropBtn = document.getElementById('cutoutAutoCropBtn');
    refs.applyCropBtn = document.getElementById('cutoutApplyCropBtn');
    refs.confirmCropBtn = document.getElementById('cutoutConfirmCropBtn');
    refs.undoBtn = document.getElementById('cutoutUndoBtn');
    refs.restoreBtn = document.getElementById('cutoutRestoreBtn');
    refs.resetBtn = document.getElementById('cutoutResetBtn');
    refs.tolerance = document.getElementById('cutoutTolerance');
    refs.toleranceValue = document.getElementById('cutoutToleranceValue');
    refs.feather = document.getElementById('cutoutFeather');
    refs.featherValue = document.getElementById('cutoutFeatherValue');
    refs.protection = document.getElementById('cutoutProtection');
    refs.cropX = document.getElementById('cutoutCropX');
    refs.cropY = document.getElementById('cutoutCropY');
    refs.cropW = document.getElementById('cutoutCropW');
    refs.cropH = document.getElementById('cutoutCropH');
    refs.previewFrame = document.getElementById('cutoutPreviewFrame');
    refs.previewCanvas = document.getElementById('cutoutPreviewCanvas');
    refs.cropBox = document.getElementById('cutoutCropBox');
    refs.empty = document.getElementById('cutoutEmpty');
    refs.previewTitle = document.getElementById('cutoutPreviewTitle');
    refs.previewSubtitle = document.getElementById('cutoutPreviewSubtitle');
  };

  const setStatus = () => {};

  const setBusy = (busy) => {
    refs.autoCropBtn?.toggleAttribute('disabled', busy || !hasCutout());
    refs.applyCropBtn?.toggleAttribute('disabled', busy || !hasCutout());
    refs.confirmCropBtn?.toggleAttribute('disabled', busy || !hasOutput());
    refs.downloadBtn?.toggleAttribute('disabled', busy || !hasOutput());
    refs.undoBtn?.toggleAttribute('disabled', busy || !state.history.length);
    refs.restoreBtn?.toggleAttribute('disabled', busy || !hasCutout());
  };

  const hasCutout = () => state.cutoutCanvas.width > 0 && state.cutoutCanvas.height > 0;
  const hasOutput = () => state.outputCanvas.width > 0 && state.outputCanvas.height > 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

  const getCleanFileName = (fileName) => {
    const rawName = String(fileName || 'cutout').trim() || 'cutout';
    const extensionMatch = rawName.match(/(\.[^./\\]+)$/);
    const extension = extensionMatch ? extensionMatch[1] : '';
    const baseName = extension ? rawName.slice(0, -extension.length) : rawName;
    const cleanBaseName = baseName.replace(/(?:-(?:confirmed|transparent))+$/gi, '') || 'cutout';
    return `${cleanBaseName}${extension}`;
  };

  const applyPreviewTransform = () => {
    if (!refs.previewCanvas) return;
    refs.previewCanvas.style.transform = `translate3d(${state.previewPanX}px, ${state.previewPanY}px, 0) scale(${state.previewZoom})`;
    updateCropBox();
  };

  const resetPreviewView = () => {
    state.previewZoom = 1;
    state.previewPanX = 0;
    state.previewPanY = 0;
    applyPreviewTransform();
  };

  const syncActionButtons = () => {
    const canEdit = hasCutout();
    refs.autoCropBtn?.toggleAttribute('disabled', !canEdit);
    refs.applyCropBtn?.toggleAttribute('disabled', !canEdit);
    refs.confirmCropBtn?.toggleAttribute('disabled', !hasOutput());
    refs.downloadBtn?.toggleAttribute('disabled', !hasOutput());
    refs.undoBtn?.toggleAttribute('disabled', !state.history.length);
    refs.restoreBtn?.toggleAttribute('disabled', !canEdit);
  };

  const snapshotCanvas = (canvas) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    return copy;
  };

  const pushHistory = () => {
    if (!hasOutput()) return;
    state.history.push({
      output: snapshotCanvas(state.outputCanvas),
      crop: { ...state.crop },
      mode: state.mode,
      previewSource: state.previewSource,
    });
    if (state.history.length > 20) state.history.shift();
    syncActionButtons();
  };

  const openImageDb = () => {
    if (!window.indexedDB) return Promise.resolve(null);
    if (imageDbPromise) return imageDbPromise;

    imageDbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME);
        }
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => {
        console.warn('[image-cutout] Failed to open image storage:', request.error);
        resolve(null);
      });
    });

    return imageDbPromise;
  };

  const runImageStore = async (mode, handler) => {
    const db = await openImageDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(IMAGE_STORE_NAME, mode);
        const store = transaction.objectStore(IMAGE_STORE_NAME);
        const request = handler(store);
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => {
          console.warn('[image-cutout] Image storage request failed:', request.error);
          resolve(null);
        });
      } catch (error) {
        console.warn('[image-cutout] Image storage transaction failed:', error);
        resolve(null);
      }
    });
  };

  const getStoredImage = () => runImageStore('readonly', (store) => store.get(LAST_IMAGE_KEY));

  const putStoredImage = async (image) => {
    const result = await runImageStore('readwrite', (store) => store.put(image, LAST_IMAGE_KEY));
    return result !== null;
  };

  const getControlSnapshot = () => ({
    tolerance: refs.tolerance?.value || '34',
    feather: refs.feather?.value || '10',
    protection: refs.protection ? refs.protection.checked : true,
  });

  const saveSession = (extra = {}) => {
    utils.writeJson(STORAGE_KEY, {
      fileName: state.fileName || '',
      imageStored: state.imageStored,
      confirmed: false,
      controls: getControlSnapshot(),
      updatedAt: new Date().toISOString(),
      ...extra,
    });
  };

  const saveControlSession = () => {
    if (!state.sourceImage) return;
    saveSession();
  };

  const persistConfirmedOutput = async () => {
    if (!hasOutput()) return;
    if (state.mode === 'custom' && state.previewSource === 'cutout') {
      pushHistory();
      readCropInputs();
      drawCanvasIntoOutput(state.cutoutCanvas, state.crop);
      renderPreview(state.outputCanvas, 'output');
      state.mode = 'auto';
      syncActionButtons();
    }
    const dataUrl = state.outputCanvas.toDataURL('image/png');
    const fileName = getCleanFileName(state.fileName);
    const imageStored = await putStoredImage(dataUrl);
    if (!imageStored) {
      setStatus('确认结果保存失败，本地存储不可用', 'error');
      App.notify?.error?.('确认结果保存失败，本地存储不可用', { key: 'image-cutout-confirm-failed' });
      return;
    }
    state.imageStored = true;
    saveSession({ fileName, imageStored: true, confirmed: true });
    state.fileName = fileName;
    refs.previewTitle.textContent = fileName;
    syncActionButtons();
    refs.previewSubtitle.textContent = '已确认并保存当前结果，刷新后会恢复此状态';
    setStatus('已确认并保存当前结果', 'success');
    App.notify?.success?.('已确认并保存当前结果', { key: 'image-cutout-confirm-save' });
  };

  const syncRangeLabels = () => {
    if (refs.toleranceValue) refs.toleranceValue.textContent = refs.tolerance?.value || '34';
    if (refs.featherValue) refs.featherValue.textContent = refs.feather?.value || '10';
  };

  const applySavedControls = (controls = {}) => {
    if (refs.tolerance && controls.tolerance !== undefined) {
      refs.tolerance.value = clamp(controls.tolerance, Number(refs.tolerance.min || 0), Number(refs.tolerance.max || 100));
    }
    if (refs.feather && controls.feather !== undefined) {
      refs.feather.value = clamp(controls.feather, Number(refs.feather.min || 0), Number(refs.feather.max || 100));
    }
    if (refs.protection && controls.protection !== undefined) {
      refs.protection.checked = typeof controls.protection === 'boolean'
        ? controls.protection
        : Number(controls.protection) > 0;
    }
    syncRangeLabels();
  };

  const syncCropInputs = () => {
    if (!refs.cropX) return;
    refs.cropX.value = Math.round(state.crop.x);
    refs.cropY.value = Math.round(state.crop.y);
    refs.cropW.value = Math.round(state.crop.w);
    refs.cropH.value = Math.round(state.crop.h);
    updateCropBox();
  };

  const readCropInputs = () => {
    if (!hasCutout()) return;
    const maxW = state.cutoutCanvas.width;
    const maxH = state.cutoutCanvas.height;
    const x = clamp(refs.cropX?.value, 0, Math.max(0, maxW - 1));
    const y = clamp(refs.cropY?.value, 0, Math.max(0, maxH - 1));
    const w = clamp(refs.cropW?.value, 1, maxW - x);
    const h = clamp(refs.cropH?.value, 1, maxH - y);
    state.crop = { x, y, w, h };
    syncCropInputs();
  };

  const drawCanvasIntoOutput = (source, crop = null) => {
    const rect = crop || { x: 0, y: 0, w: source.width, h: source.height };
    state.outputCanvas.width = Math.max(1, Math.round(rect.w));
    state.outputCanvas.height = Math.max(1, Math.round(rect.h));
    const ctx = state.outputCanvas.getContext('2d');
    ctx.clearRect(0, 0, state.outputCanvas.width, state.outputCanvas.height);
    ctx.drawImage(
      source,
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.w),
      Math.round(rect.h),
      0,
      0,
      state.outputCanvas.width,
      state.outputCanvas.height,
    );
  };

  const restoreOutputFromCanvas = (canvas) => {
    state.outputCanvas.width = canvas.width;
    state.outputCanvas.height = canvas.height;
    const ctx = state.outputCanvas.getContext('2d');
    ctx.clearRect(0, 0, state.outputCanvas.width, state.outputCanvas.height);
    ctx.drawImage(canvas, 0, 0);
  };

  const renderPreview = (canvas = null, previewSource = 'output') => {
    const source = canvas || (hasOutput() ? state.outputCanvas : state.sourceCanvas);
    if (!refs.previewCanvas || !source.width || !source.height) return;
    state.previewSource = previewSource;
    refs.previewCanvas.width = source.width;
    refs.previewCanvas.height = source.height;
    const ctx = refs.previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
    refs.previewCanvas.hidden = false;
    refs.empty.hidden = true;
    applyPreviewTransform();
  };

  const setDefaultCrop = () => {
    const source = hasCutout() ? state.cutoutCanvas : state.sourceCanvas;
    state.crop = { x: 0, y: 0, w: source.width || 0, h: source.height || 0 };
    syncCropInputs();
  };

  const loadImageData = (dataUrl, fileName, options = {}) => {
    if (!dataUrl) return;
    const image = new Image();
    image.addEventListener('load', () => {
      state.fileName = getCleanFileName(fileName || '已保存图片');
      state.sourceImage = image;
      state.sourceCanvas.width = image.naturalWidth || image.width;
      state.sourceCanvas.height = image.naturalHeight || image.height;
      state.cutoutCanvas.width = 0;
      state.outputCanvas.width = 0;
      state.history = [];
      resetPreviewView();
      const ctx = state.sourceCanvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, state.sourceCanvas.width, state.sourceCanvas.height);
      ctx.drawImage(image, 0, 0);
      setDefaultCrop();
      drawCanvasIntoOutput(state.sourceCanvas);
      renderPreview(state.sourceCanvas, 'source');
      refs.previewTitle.textContent = state.fileName;
      refs.previewSubtitle.textContent = options.confirmed
        ? '已载入上次确认后的结果'
        : options.restored
        ? '已恢复上次上传图片，正在按保存参数生成透明图层'
        : '已载入原图，正在按当前参数生成透明图层';
      setStatus(options.restored ? '已恢复本地图片' : '图片已载入', 'success');
      refs.resetBtn.disabled = false;
      refs.downloadBtn.disabled = false;
      syncActionButtons();
      if (options.confirmed) {
        drawCanvasIntoOutput(state.sourceCanvas);
        state.cutoutCanvas.width = state.sourceCanvas.width;
        state.cutoutCanvas.height = state.sourceCanvas.height;
        state.cutoutCanvas.getContext('2d', { willReadFrequently: true }).drawImage(state.sourceCanvas, 0, 0);
        syncActionButtons();
      } else {
        scheduleCutoutRender(0);
      }
    });
    image.addEventListener('error', () => setStatus('图片读取失败', 'error'), { once: true });
    image.src = dataUrl;
  };

  const persistUploadedImage = async (dataUrl, fileName) => {
    const imageStored = await putStoredImage(dataUrl);
    state.imageStored = imageStored;
    saveSession({ fileName, imageStored });
    if (!imageStored) {
      setStatus('图片已载入，但浏览器本地存储不可用', 'error');
    }
  };

  const restoreStoredSession = async () => {
    const saved = utils.readJson(STORAGE_KEY, {});
    if (!saved || typeof saved !== 'object' || !saved.imageStored) return;
    applySavedControls(saved.controls || {});
    setStatus('正在恢复本地图片...', 'loading');
    const dataUrl = await getStoredImage();
    if (typeof dataUrl !== 'string' || !dataUrl) {
      setStatus('等待上传图片');
      return;
    }
    state.imageStored = true;
    loadImageData(dataUrl, saved.fileName || '已保存图片', { restored: true, confirmed: Boolean(saved.confirmed) });
  };

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('请选择图片文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const dataUrl = String(reader.result || '');
      loadImageData(dataUrl, file.name);
      persistUploadedImage(dataUrl, file.name);
    });
    reader.addEventListener('error', () => setStatus('文件读取失败', 'error'), { once: true });
    reader.readAsDataURL(file);
  };

  const getBackgroundColor = (data, width, height) => {
    const sample = [];
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
    const pushPixel = (x, y) => {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 8) return;
      sample.push([data[index], data[index + 1], data[index + 2]]);
    };

    for (let x = 0; x < width; x += step) {
      pushPixel(x, 0);
      pushPixel(x, height - 1);
    }
    for (let y = 0; y < height; y += step) {
      pushPixel(0, y);
      pushPixel(width - 1, y);
    }
    if (!sample.length) return [255, 255, 255];

    const median = (channel) => {
      const values = sample.map((pixel) => pixel[channel]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)] || 0;
    };
    return [median(0), median(1), median(2)];
  };

  const colorDistance = (data, index, bg) => {
    const dr = data[index] - bg[0];
    const dg = data[index + 1] - bg[1];
    const db = data[index + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const getSubjectMask = (data, width, height, bg, tolerance, feather, protection) => {
    if (!protection) return null;
    const threshold = Math.max(18, tolerance + feather + 6);
    const strong = new Uint8Array(width * height);
    let count = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] < 8) continue;
        if (colorDistance(data, index, bg) <= threshold) continue;
        strong[y * width + x] = 1;
        count += 1;
      }
    }

    if (count < Math.max(24, width * height * 0.002)) return null;
    const pad = 0;
    const bridgeGap = Math.max(3, Math.round(Math.min(width, height) * 0.02));
    const mask = new Uint8Array(width * height);
    const minColPixels = Math.max(3, Math.round(height * 0.006));

    for (let x = 0; x < width; x += 1) {
      let start = -1;
      let lastStrong = -1;
      let strongCount = 0;

      const commitSegment = () => {
        if (start < 0 || strongCount < minColPixels) return;
        const from = clamp(start - pad, 0, height - 1);
        const to = clamp(lastStrong + pad, 0, height - 1);
        for (let yy = from; yy <= to; yy += 1) {
          mask[yy * width + x] = 1;
        }
      };

      for (let y = 0; y < height; y += 1) {
        if (strong[y * width + x]) {
          if (start < 0) start = y;
          lastStrong = y;
          strongCount += 1;
          continue;
        }
        if (start >= 0 && y - lastStrong > bridgeGap) {
          commitSegment();
          start = -1;
          lastStrong = -1;
          strongCount = 0;
        }
      }
      commitSegment();
    }

    return mask;
  };

  const renderCutout = () => {
    if (!state.sourceImage || !state.sourceCanvas.width || !state.sourceCanvas.height) return;
    const seq = state.renderSeq + 1;
    state.renderSeq = seq;
    setBusy(true);
    setStatus('正在实时渲染...', 'loading');

    window.setTimeout(() => {
      if (seq !== state.renderSeq) return;
      const width = state.sourceCanvas.width;
      const height = state.sourceCanvas.height;
      state.cutoutCanvas.width = width;
      state.cutoutCanvas.height = height;
      const ctx = state.cutoutCanvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(state.sourceCanvas, 0, 0);

      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;
      const tolerance = Number(refs.tolerance?.value || 34);
      const feather = Number(refs.feather?.value || 0);
      const protection = refs.protection?.checked ? 0.45 : 0;
      const bg = getBackgroundColor(data, width, height);
      const subjectMask = getSubjectMask(data, width, height, bg, tolerance, feather, protection);
      const visited = new Uint8Array(width * height);
      const stack = [];

      const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const pixel = y * width + x;
        if (visited[pixel]) return;
        const index = pixel * 4;
        if (subjectMask?.[pixel]) return;
        if (colorDistance(data, index, bg) > tolerance + feather) return;
        visited[pixel] = 1;
        stack.push(pixel);
      };

      for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
      }

      while (stack.length) {
        const pixel = stack.pop();
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const index = pixel * 4;
        const distance = colorDistance(data, index, bg);
        const fadeRange = Math.max(1, feather);
        const alpha = distance <= tolerance
          ? 0
          : Math.round(255 * clamp((distance - tolerance) / fadeRange, 0, 1));
        data[index + 3] = Math.min(data[index + 3], alpha);
        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
      }

      ctx.putImageData(imageData, 0, 0);
      drawCanvasIntoOutput(state.cutoutCanvas);
      if (!state.crop.w || !state.crop.h) {
        setDefaultCrop();
      } else {
        readCropInputs();
      }
      renderPreview(state.cutoutCanvas, 'cutout');
      setBusy(false);
      state.mode = 'auto';
      syncCropModeButtons();
      syncActionButtons();
      refs.previewSubtitle.textContent = '参数变化会自动更新透明图层，可继续裁剪';
      setStatus('已实时更新', 'success');
    }, 30);
  };

  const scheduleCutoutRender = (delay = 140) => {
    if (!state.sourceImage) return;
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(renderCutout, delay);
  };

  const getAlphaBounds = () => {
    if (!hasCutout()) return null;
    const width = state.cutoutCanvas.width;
    const height = state.cutoutCanvas.height;
    const data = state.cutoutCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };

  const applyCrop = () => {
    if (!hasCutout()) return;
    pushHistory();
    readCropInputs();
    drawCanvasIntoOutput(state.cutoutCanvas, state.crop);
    renderPreview(state.outputCanvas, 'output');
    state.mode = 'auto';
    refs.downloadBtn.disabled = false;
    syncActionButtons();
    refs.previewSubtitle.textContent = `已裁剪为 ${state.outputCanvas.width} x ${state.outputCanvas.height}`;
    setStatus('裁剪已应用', 'success');
  };

  const startManualCrop = () => {
    if (!hasCutout()) return;
    state.mode = 'custom';
    if (!state.crop.w || !state.crop.h) setDefaultCrop();
    renderPreview(state.cutoutCanvas, 'cutout');
    syncCropModeButtons();
    syncActionButtons();
    refs.previewSubtitle.textContent = '可拖动裁剪框移动，也可拖动边框或四角调整范围';
    setStatus('手动裁剪已开启', 'success');
  };

  const handleManualCrop = () => {
    if (!hasCutout()) return;
    startManualCrop();
  };

  const autoCrop = () => {
    const bounds = getAlphaBounds();
    if (!bounds) {
      setStatus('没有检测到可裁剪的透明边缘', 'error');
      return;
    }
    state.crop = bounds;
    state.mode = 'auto';
    syncCropModeButtons();
    syncCropInputs();
    applyCrop();
  };

  const undoCrop = () => {
    const previous = state.history.pop();
    if (!previous) return;
    restoreOutputFromCanvas(previous.output);
    state.crop = { ...previous.crop };
    state.mode = previous.mode || 'auto';
    renderPreview(state.outputCanvas, 'output');
    syncCropInputs();
    syncActionButtons();
    refs.previewSubtitle.textContent = '已返回上一步';
    setStatus('已返回上一步', 'success');
  };

  const restoreCutout = () => {
    if (!hasCutout()) return;
    pushHistory();
    state.mode = 'auto';
    setDefaultCrop();
    drawCanvasIntoOutput(state.cutoutCanvas);
    renderPreview(state.cutoutCanvas, 'cutout');
    syncActionButtons();
    refs.previewSubtitle.textContent = '已复原为当前透明图层';
    setStatus('已复原', 'success');
  };

  const resetImage = () => {
    if (!state.sourceImage) return;
    window.clearTimeout(state.renderTimer);
    state.renderSeq += 1;
    state.cutoutCanvas.width = 0;
    drawCanvasIntoOutput(state.sourceCanvas);
    setDefaultCrop();
    renderPreview(state.sourceCanvas, 'source');
    refs.autoCropBtn.disabled = true;
    refs.applyCropBtn.disabled = true;
    refs.downloadBtn.disabled = false;
    syncActionButtons();
    refs.previewSubtitle.textContent = '已恢复原图，调整左侧参数会重新生成透明图层';
    setStatus('已重置为原图', 'success');
  };

  const downloadOutput = () => {
    if (!hasOutput()) return;
    state.outputCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getCleanFileName(state.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const getCanvasRectInfo = () => {
    if (!refs.previewCanvas || !hasCutout()) return null;
    const rect = refs.previewCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      rect,
      scaleX: state.cutoutCanvas.width / rect.width,
      scaleY: state.cutoutCanvas.height / rect.height,
    };
  };

  const updateCropBox = () => {
    if (!refs.cropBox || !hasCutout() || state.mode !== 'custom' || state.previewSource !== 'cutout') {
      if (refs.cropBox) refs.cropBox.hidden = true;
      return;
    }
    const info = getCanvasRectInfo();
    if (!info) {
      refs.cropBox.hidden = true;
      return;
    }
    refs.cropBox.hidden = false;
    refs.cropBox.style.left = `${info.rect.left - refs.previewFrame.getBoundingClientRect().left + state.crop.x / info.scaleX}px`;
    refs.cropBox.style.top = `${info.rect.top - refs.previewFrame.getBoundingClientRect().top + state.crop.y / info.scaleY}px`;
    refs.cropBox.style.width = `${state.crop.w / info.scaleX}px`;
    refs.cropBox.style.height = `${state.crop.h / info.scaleY}px`;
  };

  const syncCropModeButtons = () => {
    updateCropBox();
  };

  const getPointInImage = (event, clampToImage = true) => {
    const info = getCanvasRectInfo();
    if (!info) return null;
    const rawX = (event.clientX - info.rect.left) * info.scaleX;
    const rawY = (event.clientY - info.rect.top) * info.scaleY;
    if (!clampToImage && (rawX < 0 || rawY < 0 || rawX > state.cutoutCanvas.width || rawY > state.cutoutCanvas.height)) {
      return null;
    }
    return {
      x: clamp(rawX, 0, state.cutoutCanvas.width),
      y: clamp(rawY, 0, state.cutoutCanvas.height),
    };
  };

  const getCropHitAction = (point) => {
    const info = getCanvasRectInfo();
    if (!info || !state.crop.w || !state.crop.h) return '';
    const threshold = Math.max(8 * Math.max(info.scaleX, info.scaleY), 4);
    const left = state.crop.x;
    const top = state.crop.y;
    const right = state.crop.x + state.crop.w;
    const bottom = state.crop.y + state.crop.h;
    const nearLeft = Math.abs(point.x - left) <= threshold;
    const nearRight = Math.abs(point.x - right) <= threshold;
    const nearTop = Math.abs(point.y - top) <= threshold;
    const nearBottom = Math.abs(point.y - bottom) <= threshold;
    const withinX = point.x >= left - threshold && point.x <= right + threshold;
    const withinY = point.y >= top - threshold && point.y <= bottom + threshold;

    if (!withinX || !withinY) return '';
    if (nearLeft && nearTop) return 'nw';
    if (nearRight && nearTop) return 'ne';
    if (nearLeft && nearBottom) return 'sw';
    if (nearRight && nearBottom) return 'se';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return 'move';
    return '';
  };

  const getCursorForAction = (action) => {
    const cursors = {
      move: 'move',
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
    };
    return cursors[action] || '';
  };

  const updateCropFrameCursor = (event) => {
    if (!refs.previewFrame || state.draggingCrop || state.draggingPreview) return;
    if (refs.previewCanvas?.hidden) {
      refs.previewFrame.style.cursor = '';
      return;
    }
    if (state.mode !== 'custom' || !hasCutout() || state.previewSource !== 'cutout') {
      refs.previewFrame.style.cursor = 'grab';
      return;
    }
    const point = getPointInImage(event, false);
    refs.previewFrame.style.cursor = getCursorForAction(point ? getCropHitAction(point) : '') || 'grab';
  };

  const normalizeCropRect = (rect) => {
    const minSize = 1;
    const maxW = state.cutoutCanvas.width;
    const maxH = state.cutoutCanvas.height;
    const left = clamp(Math.min(rect.x1, rect.x2), 0, Math.max(0, maxW - minSize));
    const top = clamp(Math.min(rect.y1, rect.y2), 0, Math.max(0, maxH - minSize));
    const right = clamp(Math.max(rect.x1, rect.x2), left + minSize, maxW);
    const bottom = clamp(Math.max(rect.y1, rect.y2), top + minSize, maxH);
    return {
      x: Math.round(left),
      y: Math.round(top),
      w: Math.max(minSize, Math.round(right - left)),
      h: Math.max(minSize, Math.round(bottom - top)),
    };
  };

  const getDraggedCrop = (point) => {
    const start = state.cropStart;
    const dx = point.x - state.dragStart.x;
    const dy = point.y - state.dragStart.y;
    if (!start) return state.crop;

    if (state.cropDragAction === 'move') {
      return {
        x: Math.round(clamp(start.x + dx, 0, Math.max(0, state.cutoutCanvas.width - start.w))),
        y: Math.round(clamp(start.y + dy, 0, Math.max(0, state.cutoutCanvas.height - start.h))),
        w: start.w,
        h: start.h,
      };
    }

    const rect = {
      x1: start.x,
      y1: start.y,
      x2: start.x + start.w,
      y2: start.y + start.h,
    };
    if (state.cropDragAction.includes('w')) rect.x1 = start.x + dx;
    if (state.cropDragAction.includes('e')) rect.x2 = start.x + start.w + dx;
    if (state.cropDragAction.includes('n')) rect.y1 = start.y + dy;
    if (state.cropDragAction.includes('s')) rect.y2 = start.y + start.h + dy;
    return normalizeCropRect(rect);
  };

  const zoomPreviewAt = (event) => {
    if (!refs.previewCanvas || refs.previewCanvas.hidden) return;
    event.preventDefault();
    const oldZoom = state.previewZoom;
    const nextZoom = clamp(oldZoom * (event.deltaY < 0 ? 1.12 : 0.88), 0.25, 6);
    if (nextZoom === oldZoom) return;

    const rect = refs.previewFrame.getBoundingClientRect();
    const px = event.clientX - rect.left - rect.width / 2;
    const py = event.clientY - rect.top - rect.height / 2;
    const ratio = nextZoom / oldZoom;
    state.previewPanX = px - (px - state.previewPanX) * ratio;
    state.previewPanY = py - (py - state.previewPanY) * ratio;
    state.previewZoom = nextZoom;
    applyPreviewTransform();
  };

  const bindPreviewView = () => {
    refs.previewFrame?.addEventListener('wheel', zoomPreviewAt, { passive: false });

    refs.previewFrame?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || refs.previewCanvas?.hidden || state.draggingCrop) return;
      const point = getPointInImage(event, false);
      const cropAction = state.mode === 'custom' && state.previewSource === 'cutout' && point
        ? getCropHitAction(point)
        : '';
      if (cropAction) return;
      event.preventDefault();
      state.draggingPreview = true;
      state.previewDragStart = { x: event.clientX, y: event.clientY };
      state.previewPanStart = { x: state.previewPanX, y: state.previewPanY };
      refs.previewFrame.style.cursor = 'grabbing';
      refs.previewFrame.classList.add('is-preview-dragging');
      refs.previewFrame.setPointerCapture?.(event.pointerId);
    });

    refs.previewFrame?.addEventListener('pointermove', (event) => {
      if (!state.draggingPreview || !state.previewDragStart || !state.previewPanStart) return;
      state.previewPanX = state.previewPanStart.x + event.clientX - state.previewDragStart.x;
      state.previewPanY = state.previewPanStart.y + event.clientY - state.previewDragStart.y;
      applyPreviewTransform();
    });

    const stopPreviewDrag = () => {
      if (!state.draggingPreview) return;
      state.draggingPreview = false;
      state.previewDragStart = null;
      state.previewPanStart = null;
      refs.previewFrame?.classList.remove('is-preview-dragging');
      if (refs.previewFrame) refs.previewFrame.style.cursor = '';
    };
    refs.previewFrame?.addEventListener('pointerup', stopPreviewDrag);
    refs.previewFrame?.addEventListener('pointercancel', stopPreviewDrag);
  };

  const bindCropDragging = () => {
    refs.previewFrame?.addEventListener('pointerdown', (event) => {
      if (state.mode !== 'custom' || !hasCutout() || state.previewSource !== 'cutout') return;
      const point = getPointInImage(event, false);
      if (!point) return;
      const action = getCropHitAction(point);
      if (!action) return;
      event.preventDefault();
      state.draggingCrop = true;
      state.dragStart = point;
      state.cropStart = { ...state.crop };
      state.cropDragAction = action;
      refs.previewFrame.style.cursor = getCursorForAction(action);
      refs.previewFrame.classList.add('is-crop-dragging');
      refs.previewFrame.setPointerCapture?.(event.pointerId);
    });

    refs.previewFrame?.addEventListener('pointermove', (event) => {
      if (!state.draggingCrop || state.mode !== 'custom') {
        updateCropFrameCursor(event);
        return;
      }
      const point = getPointInImage(event);
      if (!point) return;
      state.crop = getDraggedCrop(point);
      syncCropInputs();
    });

    const stopDragging = () => {
      state.draggingCrop = false;
      state.dragStart = null;
      state.cropStart = null;
      state.cropDragAction = '';
      refs.previewFrame?.classList.remove('is-crop-dragging');
      if (refs.previewFrame) refs.previewFrame.style.cursor = '';
    };
    refs.previewFrame?.addEventListener('pointerup', stopDragging);
    refs.previewFrame?.addEventListener('pointercancel', stopDragging);
  };

  const bindEvents = () => {
    refs.uploadBtn?.addEventListener('click', () => refs.uploadInput?.click());
    refs.uploadInput?.addEventListener('change', () => {
      const file = refs.uploadInput.files?.[0];
      if (file) loadFile(file);
      refs.uploadInput.value = '';
    });
    refs.autoCropBtn?.addEventListener('click', autoCrop);
    refs.applyCropBtn?.addEventListener('click', handleManualCrop);
    refs.confirmCropBtn?.addEventListener('click', persistConfirmedOutput);
    refs.undoBtn?.addEventListener('click', undoCrop);
    refs.restoreBtn?.addEventListener('click', restoreCutout);
    refs.downloadBtn?.addEventListener('click', downloadOutput);
    refs.resetBtn?.addEventListener('click', resetImage);

    refs.tolerance?.addEventListener('input', () => {
      refs.toleranceValue.textContent = refs.tolerance.value;
      saveControlSession();
      scheduleCutoutRender();
    });
    refs.feather?.addEventListener('input', () => {
      refs.featherValue.textContent = refs.feather.value;
      saveControlSession();
      scheduleCutoutRender();
    });
    refs.protection?.addEventListener('change', () => {
      saveControlSession();
      scheduleCutoutRender();
    });
    [refs.cropX, refs.cropY, refs.cropW, refs.cropH].forEach((input) => {
      input?.addEventListener('change', () => {
        state.mode = 'custom';
        syncCropModeButtons();
        readCropInputs();
        if (hasCutout()) renderPreview(state.cutoutCanvas, 'cutout');
      });
    });

    refs.previewFrame?.addEventListener('dragover', (event) => {
      event.preventDefault();
      refs.previewFrame.classList.add('is-drag-over');
    });
    refs.previewFrame?.addEventListener('dragleave', () => refs.previewFrame.classList.remove('is-drag-over'));
    refs.previewFrame?.addEventListener('drop', (event) => {
      event.preventDefault();
      refs.previewFrame.classList.remove('is-drag-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) loadFile(file);
    });
    window.addEventListener('resize', updateCropBox);
    bindCropDragging();
    bindPreviewView();
  };

  const init = () => {
    initRefs();
    applySavedControls(utils.readJson(STORAGE_KEY, {})?.controls || {});
    bindEvents();
    if (refs.previewCanvas) refs.previewCanvas.hidden = true;
    restoreStoredSession();
  };

  const getAgentContext = (question = '', options = {}) => {
    const saved = utils.readJson(STORAGE_KEY, {}) || {};
    const controls = getControlSnapshot();
    const hasImage = Boolean(state.sourceImage || saved.imageStored || hasOutput());
    const outputSize = hasOutput()
      ? `${state.outputCanvas.width} x ${state.outputCanvas.height}`
      : '尚未生成输出图';
    const cutoutSize = hasCutout()
      ? `${state.cutoutCanvas.width} x ${state.cutoutCanvas.height}`
      : '尚未生成透明图层';
    const sourceSize = state.sourceCanvas.width && state.sourceCanvas.height
      ? `${state.sourceCanvas.width} x ${state.sourceCanvas.height}`
      : '未知';
    const lines = [
      '【抠图助手检索结果】',
      `命中原因：${options.forceCurrentPage ? '当前页面为抠图助手' : '用户问题涉及图片/抠图/裁剪处理'}`,
      `当前文件：${state.fileName || saved.fileName || '未上传图片'}`,
      `图片状态：${hasImage ? '已有图片记录' : '暂无图片'}`,
      `原图尺寸：${sourceSize}`,
      `透明图层：${cutoutSize}`,
      `当前输出：${outputSize}`,
      `裁剪区域：x=${Math.round(state.crop.x || 0)}，y=${Math.round(state.crop.y || 0)}，宽=${Math.round(state.crop.w || 0)}，高=${Math.round(state.crop.h || 0)}`,
      `处理参数：容差=${controls.tolerance}；边缘柔化=${controls.feather}；主体保护=${controls.protection ? '开启' : '关闭'}`,
      `确认保存：${saved.confirmed ? '已确认保存' : '未确认保存'}`,
      `历史步骤：${state.history.length} 步`,
    ];

    return {
      title: '抠图助手',
      reason: hasImage ? '读取当前抠图处理状态' : '抠图助手暂无图片',
      content: lines.join('\n'),
      score: hasImage ? (options.forceCurrentPage ? 8 : 5) : 1,
      stats: {
        hasImage,
        hasCutout: hasCutout(),
        hasOutput: hasOutput(),
        confirmed: Boolean(saved.confirmed),
      },
    };
  };

  const getAgentImages = (question = '', options = {}) => {
    const wantsImage = options.forceCurrentPage || /(?:分析这张|看这张|当前图|图片|图像|抠图结果|透明图|裁剪结果)/.test(String(question || ''));
    if (!wantsImage || !hasOutput()) return [];
    return [{
      type: 'image_url',
      image_url: {
        url: state.outputCanvas.toDataURL('image/png'),
      },
    }];
  };

  App.imageCutout = { init, getAgentContext, getAgentImages };
})();
