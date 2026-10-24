import { getLegacyApp, getPublicApp } from '../core/app-context';
import '../../styles/pages/spectrum-analysis.css';
import '../../styles/pages/spectrum-mobile.css';
import { cloudStorage } from '../../services/cloud-storage';
import { LOCAL_STORAGE_KEYS } from '../../services/local-storage-keys';
import { mountSpectrumMobileLayout } from '../../utils/spectrumMobileLayout';
import { removePreviewItem } from '../../utils/spectrumPreview';
import { mountSpectrumPreviewZoom } from '../../utils/spectrumPreviewZoom';
import { mountSpectrumPreviewRail } from '../../utils/spectrumPreviewRail';
import { patchSpectrumPreviewDialog, revealActiveSpectrumThumb } from '../../utils/spectrumPreviewDom';
import { createTaskQueue } from '../../utils/taskQueue';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;
  const PublicApp = getPublicApp();

  const { utils } = App;
  const STORAGE_KEY = 'gjh-spectrum-user-images-v2';
  const EDIT_STORAGE_KEY = 'gjh-spectrum-edits-v2';
  const FILTER_STORAGE_KEY = LOCAL_STORAGE_KEYS.spectrumFilterState;
  const IMAGE_DB_NAME = 'gjh-spectrum-images-db';
  const IMAGE_DB_VERSION = 1;
  const IMAGE_STORE_NAME = 'images';
  const EMPTY_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const EDITABLE_FIELDS = ['title', 'category', 'date', 'tags', 'note'];
  const SPECTRUM_TYPES = ['DSC', 'TGA', 'FTIR'];
  const DELETE_ANIMATION_MS = 240;

  const state: any = {
    items: [],
    edits: {},
    selectedIds: new Set(),
    activeId: '',
    query: '',
    category: '全部',
    categoryOrder: [],
    tag: '全部',
    mode: 'ALL',
    sort: 'date-desc',
    editingId: '',
    detailCollapsed: false,
    detailAutoCompact: false,
    detailModalOpen: false,
    galleryCountTotal: 0,
    galleryCountSelected: 0,
  };

  const refs: any = {};
  let imageDbPromise = null;
  let imageObserver = null;
  const pendingImageLoads = new Map();
  let exportCategoryMenuOpen = false;
  let exportCategorySelection = new Set();
  let categoryDragActive = false;
  let cleanupMobileLayout: (() => void) | undefined;
  const DETAIL_COMPACT_MQ = window.matchMedia('(max-width: 1200px)');
  const SPECTRUM_MOBILE_MQ = window.matchMedia('(max-width: 980px)');

  const ensureSpectrumModeButtons = () => {
    const switcher = document.querySelector('.spectrum-mode-switch');
    if (!switcher || switcher.querySelector('[data-spectrum-mode="FTIR"]')) return;
    const button = document.createElement('button');
    button.className = 'spectrum-mode-btn';
    button.type = 'button';
    button.dataset.spectrumMode = 'FTIR';
    button.textContent = 'FTIR';
    switcher.append(button);
  };

  const initRefs = () => {
    ensureSpectrumModeButtons();
    refs.searchInput = document.getElementById('spectrumSearchInput');
    refs.uploadBtn = document.getElementById('spectrumUploadBtn');
    refs.uploadInput = document.getElementById('spectrumUploadInput');
    refs.importBtn = document.getElementById('spectrumImportBtn');
    refs.importInput = document.getElementById('spectrumImportInput');
    refs.exportBtn = document.getElementById('spectrumExportBtn');
    ensureExportCategoryPicker();
    refs.printBtn = document.getElementById('spectrumPrintBtn');
    refs.categorySearchInput = document.getElementById('spectrumCategorySearchInput');
    refs.categoryFilters = document.getElementById('spectrumCategoryFilters');
    refs.tagFilters = document.getElementById('spectrumTagFilters');
    refs.previewSelectedBtn = document.getElementById('spectrumPreviewSelectedBtn');
    refs.galleryZoomBtn = document.getElementById('spectrumGalleryZoomBtn');
    refs.clearSelectedBtn = document.getElementById('spectrumClearSelectedBtn');
    refs.deleteSelectedBtn = document.getElementById('spectrumDeleteSelectedBtn');
    refs.selectedList = document.getElementById('spectrumSelectedList');
    refs.galleryCount = document.getElementById('spectrumGalleryCount');
    refs.uploadStatus = document.getElementById('spectrumUploadStatus');
    if (!refs.uploadStatus && refs.galleryCount?.parentElement) {
      const status = document.createElement('div');
      status.id = 'spectrumUploadStatus';
      status.className = 'spectrum-gallery-upload-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.hidden = true;
      refs.galleryCount.after(status);
      refs.uploadStatus = status;
    }
    refs.gallery = document.getElementById('spectrumGallery');
    refs.toggleDetailBtn = document.getElementById('spectrumToggleDetailBtn');
    refs.workbench = refs.gallery?.closest('.spectrum-workbench');
    refs.galleryPanel = refs.gallery?.closest('.spectrum-gallery-panel');
    refs.galleryPanel?.querySelectorAll('.spectrum-upload-progress').forEach((node) => node.remove());
    refs.detailPanel = document.getElementById('spectrumDetailPanel');
    refs.modeButtons = document.querySelectorAll('[data-spectrum-mode]');
  };

  const ensureExportCategoryPicker = () => {
    if (!refs.exportBtn || refs.exportBtn.closest('.spectrum-export-picker')) return;
    const parent = refs.exportBtn.parentElement;
    if (!parent) return;

    const picker = document.createElement('div');
    picker.className = 'spectrum-export-picker';
    parent.insertBefore(picker, refs.exportBtn);
    picker.append(refs.exportBtn);

    const menu = document.createElement('div');
    menu.className = 'spectrum-export-menu';
    menu.hidden = true;
    picker.append(menu);

    refs.exportPicker = picker;
    refs.exportMenu = menu;
  };

  const getSpectrumTypeFromName = (name) => {
    const baseName = String(name || '').replace(/\.[^.]*$/, '').trim().toUpperCase();
    return SPECTRUM_TYPES.find((type) => baseName.endsWith(type)) || '';
  };

  const getUploadTitle = (file) => file.name.replace(/\.[^.]+$/, '') || file.name;

  const getFileBaseName = (name) => String(name || '').split('/').pop().replace(/\.[^.]+$/, '').trim();

  const getPathFileName = (path) => String(path || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';

  const getPathCategory = (path) => {
    const parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : '';
  };

  const sanitizeArchiveSegment = (value, fallback = '未分类') => {
    const text = String(value || '').trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ');
    return text || fallback;
  };

  const getImageMimeFromName = (name) => {
    const ext = String(name || '').split('.').pop().toLowerCase();
    const map = {
      avif: 'image/avif',
      bmp: 'image/bmp',
      gif: 'image/gif',
      heic: 'image/heic',
      heif: 'image/heif',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      webp: 'image/webp',
    };
    return map[ext] || 'image/png';
  };

  const getImageExtensionFromDataUrl = (dataUrl) => {
    const mime = String(dataUrl || '').match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
    const map = {
      'image/avif': '.avif',
      'image/bmp': '.bmp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/svg+xml': '.svg',
      'image/tiff': '.tif',
      'image/webp': '.webp',
    };
    return map[mime.toLowerCase()] || '.png';
  };

  const isImageUploadFile = (file) => {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/.test(name);
  };

  const isImageArchivePath = (path) => /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(String(path || ''));

  const isZipUploadFile = (file) => {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed';
  };

  const getUploadIssueName = (file) => String(file?.name || '').trim() || '未命名文件';

  const findItemByTitle = (title) => {
    const normalized = String(title || '').trim().toLowerCase();
    return state.items.find((item) => String(item.title || '').trim().toLowerCase() === normalized);
  };

  const applyItemEdits = (item) => {
    const edited = { ...item, ...(state.edits[item.id] || {}) };
    return {
      ...edited,
      spectrumType: edited.spectrumType || getSpectrumTypeFromName(edited.title || edited.code),
    };
  };

  const openImageDb = () => {
    if (!window.indexedDB) return Promise.resolve(null);
    if (imageDbPromise) return imageDbPromise;
    imageDbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) db.createObjectStore(IMAGE_STORE_NAME);
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => resolve(null));
    });
    return imageDbPromise;
  };

  const runImageStore = async (mode, handler) => {
    const db = await openImageDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IMAGE_STORE_NAME, mode);
        const request = handler(tx.objectStore(IMAGE_STORE_NAME));
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => resolve(null));
      } catch {
        resolve(null);
      }
    });
  };

  const getCachedImage = async (id, version = '') => {
    const cached: any = await runImageStore('readonly', (store) => store.get(id));
    if (typeof cached === 'string') return version ? null : cached;
    if (!cached || typeof cached !== 'object') return null;
    if (version && cached.version !== version) return null;
    return typeof cached.dataUrl === 'string' ? cached.dataUrl : null;
  };

  const putCachedImage = (id, dataUrl, version = '') => runImageStore('readwrite', (store) => store.put({ dataUrl, version }, id));

  const deleteCachedImages = (ids) => ids.forEach((id) => runImageStore('readwrite', (store) => store.delete(id)));

  const loadImage = createTaskQueue(4);
  const getStoredImage = (id) => loadImage(() => cloudStorage.getDataUrl('spectrum', id, true));

  const putStoredImage = async (id, image, version = '') => {
    const saved = await cloudStorage.putDataUrl('spectrum', id, image);
    if (saved) await putCachedImage(id, image, version);
    return saved;
  };

  const deleteStoredImages = (ids) => {
    ids.forEach((id) => cloudStorage.deleteBlob('spectrum', id));
    deleteCachedImages(ids);
  };

  const toStoredItem = (item) => {
    const stored = { ...item };
    if (stored.imageStored) delete stored.image;
    return stored;
  };

  const getImageVersion = (item) => String(item.imageVersion || item.imageUpdatedAt || '');

  const ensureItemImage = async (id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item || item.image || !item.imageStored) return item?.image || '';
    if (pendingImageLoads.has(id)) return pendingImageLoads.get(id);
    const promise = (async () => {
      const version = getImageVersion(item);
      const cached = await getCachedImage(id, version);
      const image = cached || await getStoredImage(id);
      if (!image) {
        document.querySelectorAll(`[data-spectrum-image-id="${CSS.escape(id)}"]`).forEach((node) => {
          if (node instanceof HTMLImageElement) setSpectrumImageMissing(node, true);
        });
        return '';
      }
      if (!cached) await putCachedImage(id, image, version);
      item.image = image;
      document.querySelectorAll(`[data-spectrum-image-id="${CSS.escape(id)}"]`).forEach((node) => {
        if (node instanceof HTMLImageElement) {
          setSpectrumImagePending(node, true);
          node.src = image;
          syncSpectrumImageState(node);
        }
      });
      if (state.activeId === id) renderDetail();
      return image;
    })().finally(() => pendingImageLoads.delete(id));
    pendingImageLoads.set(id, promise);
    return promise;
  };

  const getSpectrumImageFrame = (image) => image.closest?.([
    '.spectrum-card-image',
    '.spectrum-detail-image',
    '.spectrum-compact-detail-image',
    '.spectrum-preview-thumb',
    '.spectrum-preview-image-frame',
  ].join(','));

  const setSpectrumImageMissing = (image, missing) => {
    if (missing) image.classList.remove('is-image-pending');
    image.classList.toggle('is-image-missing', missing);
    const frame = getSpectrumImageFrame(image);
    frame?.classList.toggle('is-image-missing', missing);
    if (missing) {
      frame?.classList.remove('is-image-pending');
      frame?.setAttribute('aria-busy', 'false');
    }
  };

  const setSpectrumImagePending = (image, pending) => {
    if (pending) image.classList.remove('is-image-missing');
    image.classList.toggle('is-image-pending', pending);
    const frame = getSpectrumImageFrame(image);
    frame?.classList.toggle('is-image-pending', pending);
    frame?.setAttribute('aria-busy', String(pending));
    if (pending && frame && !frame.querySelector('.spectrum-image-loader')) {
      const loader = document.createElement('div');
      loader.className = 'spectrum-image-loader';
      loader.setAttribute('aria-hidden', 'true');
      loader.innerHTML = `<svg viewBox="0 0 144 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path class="spectrum-loader-grid" d="M0 12H144M0 24H144M0 36H144M24 0V48M48 0V48M72 0V48M96 0V48M120 0V48" />
        <path class="spectrum-loader-trace" pathLength="1" d="M2 36L18 36L23 32L28 36L36 35L42 14L46 36L58 36L64 29L69 36L77 35L83 5L87 36L100 36L106 21L111 36L123 35L128 30L134 36L142 36" />
      </svg>`;
      frame.append(loader);
    }
    if (pending) frame?.classList.remove('is-image-missing');
  };

  const syncSpectrumImageState = (image) => {
    const id = image.getAttribute('data-spectrum-image-id') || '';
    const item = id ? state.items.find((entry) => entry.id === id) : null;
    if (item?.imageStored && !item.image && image.getAttribute('src') === EMPTY_IMAGE_SRC) {
      setSpectrumImagePending(image, true);
      return;
    }
    if (image.complete && image.naturalWidth === 0) {
      setSpectrumImageMissing(image, true);
      return;
    }
    if (image.getAttribute('src') === EMPTY_IMAGE_SRC && item && !item.imageStored && !item.image) {
      setSpectrumImageMissing(image, true);
      return;
    }
    setSpectrumImagePending(image, !image.complete);
    setSpectrumImageMissing(image, false);
  };

  const bindSpectrumImageFallbacks = (root = document) => {
    root.querySelectorAll?.('img[data-spectrum-image-id]').forEach((image) => {
      if (!image.dataset.spectrumFallbackBound) {
        image.dataset.spectrumFallbackBound = 'true';
        image.addEventListener('load', () => syncSpectrumImageState(image));
        image.addEventListener('error', () => {
          const id = image.getAttribute('data-spectrum-image-id') || '';
          const item = id ? state.items.find((entry) => entry.id === id) : null;
          if (item?.imageStored && !item.image && image.getAttribute('src') === EMPTY_IMAGE_SRC) {
            setSpectrumImagePending(image, true);
            return;
          }
          setSpectrumImagePending(image, false);
          setSpectrumImageMissing(image, true);
        });
      }
      syncSpectrumImageState(image);
    });
  };

  const loadItems = async () => {
    const values = await cloudStorage.getJsonBatch([EDIT_STORAGE_KEY, STORAGE_KEY]);
    const edits = values[EDIT_STORAGE_KEY] ?? utils.readJson(EDIT_STORAGE_KEY, {});
    state.edits = edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
    const uploaded = values[STORAGE_KEY] ?? utils.readJson(STORAGE_KEY, []);
    state.items = (Array.isArray(uploaded) ? uploaded : []).map(applyItemEdits);
    loadFilterState();
    validateFilterState();
    state.activeId = state.items[0]?.id || '';
  };

  const saveUploadedItems = async () => {
    const uploaded = state.items.filter((item) => item.uploaded).map(toStoredItem);
    return cloudStorage.putJson(STORAGE_KEY, uploaded);
  };

  const saveItemEdits = () => {
    cloudStorage.putJson(EDIT_STORAGE_KEY, state.edits);
  };

  const observeLazyImages = () => {
    imageObserver?.disconnect();
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const image = entry.target;
        const id = image.getAttribute('data-spectrum-image-id');
        if (id) ensureItemImage(id);
        imageObserver?.unobserve(image);
      });
    }, { rootMargin: '240px 0px' });
    bindSpectrumImageFallbacks();
    document.querySelectorAll('img[data-spectrum-image-id]').forEach((image) => imageObserver.observe(image));
  };

  const getItemImageSrc = (item) => item.image || EMPTY_IMAGE_SRC;

  const loadFilterState = () => {
    const saved: any = utils.readJson(FILTER_STORAGE_KEY, {});
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    state.category = String(saved.category || '全部');
    state.categoryOrder = Array.isArray(saved.categoryOrder)
      ? saved.categoryOrder.map((item) => String(item || '')).filter(Boolean)
      : [];
    state.tag = String(saved.tag || '全部');
  };

  const saveFilterState = () => {
    utils.writeJson(FILTER_STORAGE_KEY, {
      category: state.category || '全部',
      categoryOrder: state.categoryOrder || [],
      tag: state.tag || '全部',
    });
  };

  const getEditableSnapshot = (item) => EDITABLE_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = Array.isArray(item[field]) ? [...item[field]] : item[field];
    return snapshot;
  }, {});

  const normalizeTags = (value) => String(value || '')
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  const normalizeImportDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/[./]/g, '-');
    const exact = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (exact) {
      const [, year, month, day] = exact;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return normalized;
  };

  const normalizeSpectrumType = (value, fallback = '') => {
    const text = String(value || fallback || '').trim().toUpperCase();
    return SPECTRUM_TYPES.find((type) => text.includes(type)) || '';
  };

  const syncTagValue = (form) => {
    const tags = [...form.querySelectorAll('[data-spectrum-tag-chip]')]
      .map((chip) => chip.getAttribute('data-spectrum-tag-chip'))
      .filter(Boolean);
    form.elements.tags.value = tags.join('，');
  };

  const addDetailTag = (form) => {
    const input = form.querySelector('[data-spectrum-tag-input]');
    const list = form.querySelector('[data-spectrum-tag-list]');
    const tag = input?.value.trim();
    if (!input || !list || !tag) return;

    const existing = new Set(normalizeTags(form.elements.tags.value));
    if (!existing.has(tag)) {
      list.insertAdjacentHTML('beforeend', `
        <button class="spectrum-detail-tag-chip" type="button" data-spectrum-tag-chip="${utils.escapeHtml(tag)}">
          <span>${utils.escapeHtml(tag)}</span>
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      `);
      syncTagValue(form);
    }
    input.value = '';
  };

  const uniqueValues = (getter) => [...new Set(state.items.flatMap((item) => getter(item)).filter(Boolean))];

  const validateFilterState = () => {
    const categories = new Set(['全部', ...uniqueValues((item) => [item.category])]);
    const categoryItems = state.items.filter((item) => state.category === '全部' || item.category === state.category);
    const tags = new Set(['全部', ...categoryItems.flatMap((item) => item.tags).filter(Boolean)]);
    if (!categories.has(state.category)) state.category = '全部';
    if (!tags.has(state.tag)) state.tag = '全部';
    saveFilterState();
  };

  const matchesFilter = (item) => {
    return matchesSearchAndMode(item)
      && matchesCategory(item)
      && matchesTag(item);
  };

  const matchesSearchAndMode = (item) => {
    const query = state.query.trim().toLowerCase();
    const text = [item.code, item.title, item.category, item.tags.join(' ')].filter(Boolean).join(' ').toLowerCase();
    return (!query || text.includes(query))
      && (state.mode === 'ALL' || item.spectrumType === state.mode);
  };

  const matchesCategory = (item) => state.category === '全部' || item.category === state.category;
  const matchesTag = (item) => state.tag === '全部' || item.tags.includes(state.tag);

  const getFilteredItems = () => {
    const items = state.items.filter(matchesFilter);
    return items.sort((a, b) => {
      const byDateDesc = () => String(b.date || '').localeCompare(String(a.date || ''));
      const byTitleAsc = () => String(a.title || a.code || '').localeCompare(String(b.title || b.code || ''), 'zh-Hans-CN', { numeric: true });
      const byCategoryAsc = () => String(a.category || '').localeCompare(String(b.category || ''), 'zh-Hans-CN', { numeric: true }) || byTitleAsc();
      const byTypeAsc = () => String(a.spectrumType || '').localeCompare(String(b.spectrumType || ''), 'zh-Hans-CN', { numeric: true }) || byTitleAsc();

      if (state.sort === 'date-asc') return String(a.date || '').localeCompare(String(b.date || '')) || byTitleAsc();
      if (state.sort === 'title-asc') return byTitleAsc();
      if (state.sort === 'title-desc') return -byTitleAsc();
      if (state.sort === 'category-asc') return byCategoryAsc();
      if (state.sort === 'type-asc') return byTypeAsc();
      return byDateDesc() || byTitleAsc();
    });
  };

  const syncActiveWithFilteredItems = () => {
    const filtered = getFilteredItems();
    if (filtered.some((item) => item.id === state.activeId)) return filtered;
    state.activeId = filtered[0]?.id || '';
    return filtered;
  };

  const getActiveItem = () => state.items.find((item) => item.id === state.activeId) || null;
  const getSelectedItems = () => state.items.filter((item) => state.selectedIds.has(item.id));

  const syncModeButtons = () => {
    refs.modeButtons.forEach((button) => {
      button.classList.toggle('is-active', (button.getAttribute('data-spectrum-mode') || 'ALL') === state.mode);
    });
  };

  const captureFilterState = () => ({
    query: state.query || '',
    mode: state.mode || 'ALL',
    category: state.category || '全部',
    tag: state.tag || '全部',
  });

  const restoreFilterState = (snapshot) => {
    if (!snapshot) return;
    state.query = snapshot.query || '';
    state.mode = snapshot.mode || 'ALL';
    state.category = snapshot.category || '全部';
    state.tag = snapshot.tag || '全部';
    if (refs.searchInput) refs.searchInput.value = state.query;
    syncModeButtons();
    saveFilterState();
  };

  const revealItemInGallery = (item, filterSnapshot = null) => {
    state.query = '';
    state.mode = 'ALL';
    state.category = item?.category || '全部';
    state.tag = '全部';
    state.activeId = item?.id || state.activeId;
    if (refs.searchInput) refs.searchInput.value = '';
    syncModeButtons();
    restoreFilterState(filterSnapshot);
    saveFilterState();
  };

  const orderCategories = (categories) => {
    const categorySet = new Set(categories);
    const ordered = (state.categoryOrder || []).filter((category) => categorySet.has(category));
    const rest = categories.filter((category) => !ordered.includes(category));
    return [...ordered, ...rest];
  };

  const renderFilterButton = (value, activeValue, count, attr) => {
    const active = value === activeValue ? ' is-active' : '';
    const selectedCount = value === '全部'
      ? getSelectedItems().length
      : getSelectedItems().filter((item) => item.category === value).length;
    return `
      <button class="spectrum-filter-btn${active}" type="button" draggable="true" aria-pressed="${value === activeValue}" ${attr}="${utils.escapeHtml(value)}">
          <span>${utils.escapeHtml(value)}</span>
        <span class="spectrum-filter-counts">
          <em>${count}</em>
          <strong>${selectedCount}</strong>
        </span>
      </button>
    `;
  };

  const renderFilters = () => {
    const categories = orderCategories(['全部', ...uniqueValues((item) => [item.category])]);
    const categoryQuery = String(refs.categorySearchInput?.value || '').trim().toLowerCase();
    const visibleCategories = categoryQuery
      ? categories.filter((category) => String(category).toLowerCase().includes(categoryQuery))
      : categories;
    document.querySelector('.spectrum-selected-block')?.classList.toggle('has-selection', state.selectedIds.size > 0);
    const selectionLabel = document.querySelector('.spectrum-selected-head .spectrum-filter-label');
    if (selectionLabel) {
      const hasSelection = state.selectedIds.size > 0;
      selectionLabel.textContent = hasSelection ? `已选 ${state.selectedIds.size} 张` : '';
      selectionLabel.hidden = !hasSelection;
      selectionLabel.style.display = hasSelection ? '' : 'none';
    }
    const itemsInSearchAndMode = state.items.filter(matchesSearchAndMode);
    const itemsInCategory = itemsInSearchAndMode.filter(matchesCategory);
    const tags = ['全部', ...new Set(itemsInCategory.flatMap((item) => item.tags).filter(Boolean))];
    if (!tags.includes(state.tag)) {
      state.tag = '全部';
      saveFilterState();
    }

    if (refs.categoryFilters) refs.categoryFilters.innerHTML = visibleCategories.map((category) => {
      const count = category === '全部'
        ? itemsInSearchAndMode.length
        : itemsInSearchAndMode.filter((item) => item.category === category).length;
      return renderFilterButton(category, state.category, count, 'data-spectrum-category');
    }).join('');

    if (refs.tagFilters) refs.tagFilters.innerHTML = tags.map((tag) => {
      const count = tag === '全部'
        ? itemsInCategory.length
        : itemsInCategory.filter((item) => item.tags.includes(tag)).length;
      const active = tag === state.tag ? ' is-active' : '';
      return `<button class="spectrum-tag-filter${active}" type="button" aria-pressed="${tag === state.tag}" data-spectrum-tag="${utils.escapeHtml(tag)}">${utils.escapeHtml(tag)} <span>${count}</span></button>`;
    }).join('');

  };

  const getExportCategory = (item) => {
    const category = String(item?.category || '').trim();
    return category || '未分类';
  };

  const getExportableItems = () => state.items.filter((item) => String(item?.image || '').trim() || item?.imageStored);

  const getExportCategories = () => orderCategories([...new Set(getExportableItems().map(getExportCategory))]);

  const renderExportCategoryMenu = () => {
    if (!refs.exportMenu) return;
    const categories = getExportCategories();
    const validCategories = new Set(categories);
    exportCategorySelection = new Set([...exportCategorySelection].filter((category) => validCategories.has(category)));
    const allChecked = categories.length > 0 && categories.every((category) => exportCategorySelection.has(category));
    const selectedCount = categories.filter((category) => exportCategorySelection.has(category)).length;

    refs.exportMenu.innerHTML = `
      <div class="spectrum-export-menu-head">
        <div>
          <strong>选择导出分类</strong>
          <span>已选 ${selectedCount}/${categories.length}</span>
        </div>
        <label class="spectrum-export-check spectrum-export-check-all">
          <input type="checkbox" data-spectrum-export-all ${allChecked ? 'checked' : ''} ${categories.length ? '' : 'disabled'} />
          <span>全选</span>
        </label>
      </div>
      <div class="spectrum-export-category-list">
        ${categories.length ? categories.map((category) => {
          const count = getExportableItems().filter((item) => getExportCategory(item) === category).length;
          return `
            <label class="spectrum-export-check">
              <input type="checkbox" data-spectrum-export-category="${utils.escapeHtml(category)}" ${exportCategorySelection.has(category) ? 'checked' : ''} />
              <span>${utils.escapeHtml(category)}</span>
              <em>${count}</em>
            </label>
          `;
        }).join('') : '<div class="spectrum-export-empty">暂无可导出的图谱</div>'}
      </div>
      <div class="spectrum-export-menu-actions">
        <button class="analysis-toolbar-btn" type="button" data-spectrum-export-cancel>取消</button>
        <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-export-confirm ${selectedCount ? '' : 'disabled'}>导出</button>
      </div>
    `;
  };

  const closeExportCategoryMenu = () => {
    exportCategoryMenuOpen = false;
    if (refs.exportMenu) refs.exportMenu.hidden = true;
    refs.exportPicker?.classList.remove('is-open');
  };

  const openExportCategoryMenu = () => {
    const categories = getExportCategories();
    exportCategorySelection = new Set(categories);
    exportCategoryMenuOpen = true;
    renderExportCategoryMenu();
    if (refs.exportMenu) refs.exportMenu.hidden = false;
    refs.exportPicker?.classList.add('is-open');
  };

  const renderSelectedList = () => {
    if (!refs.selectedList) return;
    const selected = getSelectedItems();

    if (!selected.length) {
      refs.selectedList.innerHTML = '<div class="spectrum-selected-empty">暂无已选图谱</div>';
      return;
    }

    refs.selectedList.innerHTML = selected.map((item) => `
      <article class="spectrum-selected-item" data-spectrum-selected-item="${utils.escapeHtml(item.id)}">
        <button class="spectrum-selected-main" type="button" data-spectrum-open="${utils.escapeHtml(item.id)}" title="${utils.escapeHtml(item.title)}">
          <span>${utils.escapeHtml(item.title)}</span>
        </button>
        <span class="spectrum-selected-meta" title="${utils.escapeHtml(item.date || '-')}">${utils.escapeHtml(item.date || '-')}</span>
        <button class="spectrum-selected-remove" type="button" data-spectrum-remove-selected="${utils.escapeHtml(item.id)}" aria-label="移除已选图谱">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </article>
    `).join('');
  };

  const saveDetailForm = (form, options = {} as any) => {
    const id = form.elements.id.value;
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const updates = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value.trim(),
      date: form.elements.date.value,
      tags: normalizeTags(form.elements.tags.value),
      note: form.elements.note.value.trim(),
    };

    state.items[index] = { ...state.items[index], ...updates };
    state.edits[id] = getEditableSnapshot(state.items[index]);
    state.activeId = id;
    saveItemEdits();
    if (state.items[index].uploaded) saveUploadedItems();
    if (!options.skipRender) render();
    return state.items[index];
  };

  const commitDeleteItems = (ids) => {
    const targets = new Set(ids);
    if (!targets.size) return;

    state.items = state.items.filter((entry) => !targets.has(entry.id));
    targets.forEach((id) => {
      state.selectedIds.delete(id);
      delete state.edits[id as any];
    });
    deleteStoredImages(targets);
    state.activeId = state.items[0]?.id || '';
    if (refs.previewDialog) closeImagePreview();
    saveUploadedItems();
    saveItemEdits();
    render();
    App.notify?.success?.(`已删除 ${targets.size} 张图谱`, { key: `spectrum-delete:${[...targets].sort().join('|')}` });
  };

  const animateDeleteItems = (ids, onDone) => {
    const targets = [...new Set(ids)].filter(Boolean);
    if (!targets.length) return;

    const escapeSelectorValue = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
    const selector = targets.map((id) => {
      const escapedId = escapeSelectorValue(id);
      return `[data-spectrum-id="${escapedId}"], [data-spectrum-selected-item="${escapedId}"]`;
    }).join(', ');
    const nodes = selector ? [...document.querySelectorAll(selector)] : [];
    const animations = PublicApp?.animations;
    const reducedMotion = animations?.prefersReducedMotion?.() ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!nodes.length || reducedMotion) {
      onDone();
      return;
    }

    nodes.forEach((node) => {
      animations?.addClass?.(node, 'is-deleting') ?? node.classList.add('is-deleting');
      node.setAttribute('aria-hidden', 'true');
    });
    animations?.delay?.(DELETE_ANIMATION_MS, onDone) ?? window.setTimeout(onDone, DELETE_ANIMATION_MS);
  };

  const deleteSpectrumItem = (id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;

    animateDeleteItems([id], () => commitDeleteItems([id]));
  };

  const deleteSelectedItems = () => {
    const ids = [...state.selectedIds];
    if (!ids.length) return;

    animateDeleteItems(ids, () => commitDeleteItems(ids));
  };

  const openDeleteDialog = async (id, mode = 'single') => {
    const item = state.items.find((entry) => entry.id === id);
    const selectedCount = state.selectedIds.size;
    if (mode === 'single' && !item) return;
    if (mode === 'selected' && !selectedCount) return;

    const title = mode === 'selected' ? '删除已选图片' : '删除图片';
    const message = mode === 'selected'
      ? `确定删除已选列表中的 ${selectedCount} 张图片吗？删除后无法在图谱库中恢复。`
      : `确定删除「${item.title}」吗？删除后无法在图谱库中恢复。`;
    const confirmed = await App.confirmDialog?.confirmDelete?.({ title, message });
    if (!confirmed) return;
    if (mode === 'selected') deleteSelectedItems();
    else deleteSpectrumItem(id);
  };

  const openUploadConflictDialog = (fileName) => new Promise((resolve) => {
    refs.uploadConflictDialog?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog dialog-overlay';
    dialog.innerHTML = `
      <div class="spectrum-delete-card spectrum-upload-conflict-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="spectrumUploadConflictTitle">
        <div class="spectrum-delete-icon spectrum-upload-conflict-icon"><i class="ti ti-file-alert" aria-hidden="true"></i></div>
        <div class="spectrum-delete-main">
          <div class="spectrum-delete-title" id="spectrumUploadConflictTitle">发现同名图片</div>
          <div class="spectrum-delete-text">“${utils.escapeHtml(fileName)}” 已存在。本次选择将应用到当前批次所有同名图片：跳过会保留原图片，覆盖会替换原图片。</div>
        </div>
        <div class="spectrum-delete-actions">
          <button class="analysis-toolbar-btn" type="button" data-spectrum-upload-skip>全部跳过</button>
          <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-upload-overwrite>全部覆盖</button>
        </div>
      </div>
    `;
    const finish = (action) => {
      dialog.remove();
      refs.uploadConflictDialog = null;
      refs.uploadConflictResolver = null;
      resolve(action);
    };
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-spectrum-upload-skip]')) finish('skip');
      if (event.target.closest('[data-spectrum-upload-overwrite]')) finish('overwrite');
    });
    refs.uploadConflictResolver = finish;
    document.body.appendChild(dialog);
    refs.uploadConflictDialog = dialog;
  });

  const openImportConflictDialog = (count) => new Promise((resolve) => {
    refs.uploadConflictDialog?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog dialog-overlay';
    dialog.innerHTML = `
      <div class="spectrum-delete-card spectrum-upload-conflict-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="spectrumImportConflictTitle">
        <div class="spectrum-delete-icon spectrum-upload-conflict-icon"><i class="ti ti-file-alert" aria-hidden="true"></i></div>
        <div class="spectrum-delete-main">
          <div class="spectrum-delete-title" id="spectrumImportConflictTitle">发现 ${count} 项同名冲突</div>
          <div class="spectrum-delete-text">导入包中有 ${count} 张图片与当前图谱库同名。跳过会保留原图片，覆盖会替换原图片并更新分类和标签。</div>
        </div>
        <div class="spectrum-delete-actions">
          <button class="analysis-toolbar-btn" type="button" data-spectrum-upload-skip>全部跳过</button>
          <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-upload-overwrite>全部覆盖</button>
        </div>
      </div>
    `;
    const finish = (action) => {
      dialog.remove();
      refs.uploadConflictDialog = null;
      refs.uploadConflictResolver = null;
      resolve(action);
    };
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-spectrum-upload-skip]')) finish('skip');
      if (event.target.closest('[data-spectrum-upload-overwrite]')) finish('overwrite');
    });
    refs.uploadConflictResolver = finish;
    document.body.appendChild(dialog);
    refs.uploadConflictDialog = dialog;
  });

  const openUploadIssueDialog = (issues) => {
    const entries = Array.isArray(issues) ? issues.filter(Boolean) : [];
    if (!entries.length) return;

    refs.uploadIssueDialog?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog dialog-overlay';
    dialog.innerHTML = `
      <div class="spectrum-delete-card spectrum-upload-issue-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="spectrumUploadIssueTitle">
        <div class="spectrum-delete-icon spectrum-upload-issue-icon"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
        <div class="spectrum-delete-main">
          <div class="spectrum-delete-title" id="spectrumUploadIssueTitle">发现 ${entries.length} 张异常图片</div>
          <div class="spectrum-delete-text">以下文件未能导入，请检查格式或文件是否损坏。</div>
          <ol class="spectrum-upload-issue-list">
            ${entries.map((item) => `
              <li>
                <span>${utils.escapeHtml(item.name || '未命名文件')}</span>
                <em>${utils.escapeHtml(item.reason || '无法识别')}</em>
              </li>
            `).join('')}
          </ol>
        </div>
        <div class="spectrum-delete-actions">
          <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-upload-issue-close>知道了</button>
        </div>
      </div>
    `;

    const close = () => {
      dialog.remove();
      refs.uploadIssueDialog = null;
    };

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-spectrum-upload-issue-close]')) close();
    });
    refs.uploadIssueDialog = dialog;
    document.body.appendChild(dialog);
  };

  const openImportProgressDialog = ({ total, categoryCount, hasTags }) => {
    refs.importProgressDialog?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog dialog-overlay';
    dialog.innerHTML = `
      <div class="spectrum-delete-card spectrum-import-progress-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="spectrumImportProgressTitle">
        <div class="spectrum-delete-icon"><i class="ti ti-package-import" aria-hidden="true"></i></div>
        <div class="spectrum-delete-copy">
          <div class="spectrum-delete-title" id="spectrumImportProgressTitle">正在导入图谱包</div>
          <div class="spectrum-delete-text" data-spectrum-import-status>已识别 ${total} 张图片，${categoryCount} 个分类，${hasTags ? '已读取 tags.json' : '未发现 tags.json'}</div>
        </div>
        <div class="spectrum-import-progress-track" aria-hidden="true">
          <div class="spectrum-import-progress-bar" data-spectrum-import-bar style="width:0%"></div>
        </div>
        <div class="spectrum-import-progress-meta">
          <span data-spectrum-import-count>0 / ${total}</span>
          <span data-spectrum-import-stage>准备上传</span>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    refs.importProgressDialog = dialog;
    return {
      update({ completed = 0, stage = '上传中', detail = '' }) {
        const percent = total ? Math.round((completed / total) * 100) : 0;
        const bar = dialog.querySelector('[data-spectrum-import-bar]');
        const count = dialog.querySelector('[data-spectrum-import-count]');
        const stageNode = dialog.querySelector('[data-spectrum-import-stage]');
        const status = dialog.querySelector('[data-spectrum-import-status]');
        if (bar) bar.style.width = `${percent}%`;
        if (count) count.textContent = `${completed} / ${total}`;
        if (stageNode) stageNode.textContent = `${stage} ${percent}%`;
        if (status && detail) status.textContent = detail;
      },
      close() {
        dialog.remove();
        if (refs.importProgressDialog === dialog) refs.importProgressDialog = null;
      },
    };
  };

  const renderGallery = () => {
    const items = syncActiveWithFilteredItems();
    const selectedCount = state.selectedIds.size;
    setGalleryCountText(items.length, selectedCount);
    refs.gallery.className = 'spectrum-gallery is-grid';

    if (!items.length) {
      const hasFilter = Boolean(state.query.trim()) || state.mode !== 'ALL' || state.category !== '全部' || state.tag !== '全部';
      const emptyTitle = hasFilter ? '没有匹配的图谱' : '暂无图谱文件';
      const emptyText = hasFilter
        ? '请调整搜索关键词、分类、标签或图谱类型后再查看。'
        : '拖拽图片到这里，或点击“上传图谱”添加你的文件。';
      refs.gallery.className = 'spectrum-gallery is-empty';
      refs.gallery.innerHTML = `
          <div class="spectrum-empty-state">
            <div class="spectrum-empty-icon"><i class="ti ti-photo-up" aria-hidden="true"></i></div>
            <div class="spectrum-empty-title">${utils.escapeHtml(emptyTitle)}</div>
          <div class="spectrum-empty-text">${utils.escapeHtml(emptyText)}</div>
          </div>
      `;
      return;
    }

    refs.gallery.innerHTML = items.map((item) => {
      const selected = state.selectedIds.has(item.id) ? ' is-selected' : '';
      const active = item.id === state.activeId ? ' is-active' : '';
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const tagChips = tags.slice(0, 3)
        .map((tag) => `<span title="${utils.escapeHtml(tag)}">${utils.escapeHtml(tag)}</span>`);
      if (tags.length > 3) tagChips.push(`<span title="还有 ${tags.length - 3} 个标签">+${tags.length - 3}</span>`);
      return `
        <article class="spectrum-card${selected}${active}" data-spectrum-id="${utils.escapeHtml(item.id)}" data-spectrum-type="${utils.escapeHtml(item.spectrumType || 'UNKNOWN')}" role="button" tabindex="0" aria-pressed="${state.selectedIds.has(item.id) ? 'true' : 'false'}">
          <div class="spectrum-card-image">
            <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" loading="lazy" decoding="async" draggable="false" alt="${utils.escapeHtml(item.title)}" />
          </div>
          <div class="spectrum-card-body">
            <div class="spectrum-card-top">
              <div class="spectrum-card-title">${utils.escapeHtml(item.title)}</div>
            </div>
            <div class="spectrum-card-meta">
              ${item.spectrumType ? `<span class="spectrum-type-badge">${utils.escapeHtml(item.spectrumType)}</span>` : ''}
              <span>${utils.escapeHtml([item.category, item.date].filter(Boolean).join(' · '))}</span>
            </div>
            <div class="spectrum-card-tags">
              ${tagChips.join('')}
            </div>
          </div>
        </article>
      `;
    }).join('');
    observeLazyImages();
  };

  const getCategoryButtons = () => [...(refs.categoryFilters?.querySelectorAll('[data-spectrum-category]') || [])];

  const animateCategoryReorder = (mutate) => {
    if (!refs.categoryFilters) return;
    const before = new Map(getCategoryButtons().map((button) => [button, button.getBoundingClientRect()]));
    mutate();
    getCategoryButtons().forEach((button) => {
      const from = before.get(button);
      if (!from) return;
      const to = button.getBoundingClientRect();
      const deltaX = from.left - to.left;
      const deltaY = from.top - to.top;
      if (!deltaX && !deltaY) return;
      button.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    });
  };

  const getCurrentCategoryOrderFromDom = () => getCategoryButtons()
    .map((button) => button.getAttribute('data-spectrum-category') || '')
    .filter(Boolean);

  const renderDetail = () => {
    const item = getActiveItem();
    if (!item) {
      refs.detailPanel.innerHTML = `
        <button class="spectrum-detail-modal-close" type="button" data-spectrum-detail-close aria-label="关闭详情">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <div class="spectrum-empty-state spectrum-empty-state-compact">
          <div class="spectrum-empty-icon"><i class="ti ti-file-search" aria-hidden="true"></i></div>
          <div class="spectrum-empty-title">等待选择图谱</div>
          <div class="spectrum-empty-text">上传并选择图谱后，这里会显示文件详情。</div>
        </div>
      `;
      return;
    }

    refs.detailPanel.innerHTML = `
      <div class="spectrum-detail-body">
        <div class="spectrum-detail-modal-head">
          <div>
            <div class="spectrum-detail-modal-title">图谱详情</div>
            <div class="spectrum-detail-modal-subtitle">${utils.escapeHtml(item.title)}</div>
          </div>
          <button class="spectrum-detail-modal-close" type="button" data-spectrum-detail-close aria-label="关闭详情">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <form class="spectrum-detail-form" data-spectrum-detail-form>
          <input name="id" type="hidden" value="${utils.escapeHtml(item.id)}" />
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>图谱名称</span>
            <input name="title" type="text" value="${utils.escapeHtml(item.title)}" required />
          </label>
          <label class="spectrum-detail-field">
            <span>分类</span>
            <input name="category" type="text" value="${utils.escapeHtml(item.category || '')}" />
          </label>
          <label class="spectrum-detail-field">
            <span>日期</span>
            <input name="date" type="date" value="${utils.escapeHtml(item.date || '')}" />
          </label>
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>标签</span>
            <input name="tags" type="hidden" value="${utils.escapeHtml(Array.isArray(item.tags) ? item.tags.join('，') : '')}" />
            <div class="spectrum-detail-tag-editor">
              <input type="text" data-spectrum-tag-input placeholder="输入标签后按回车添加" />
              <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-tag-add>添加</button>
            </div>
            <div class="spectrum-detail-tag-list" data-spectrum-tag-list>
              ${(Array.isArray(item.tags) ? item.tags : []).map((tag) => `
                <button class="spectrum-detail-tag-chip" type="button" data-spectrum-tag-chip="${utils.escapeHtml(tag)}">
                  <span>${utils.escapeHtml(tag)}</span>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              `).join('')}
            </div>
          </label>
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>备注</span>
            <textarea name="note" rows="4">${utils.escapeHtml(item.note || '')}</textarea>
          </label>
          <div class="spectrum-detail-actions">
            <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="submit">
              <i class="ti ti-device-floppy" aria-hidden="true"></i>
              <span>保存信息</span>
            </button>
            <button class="analysis-toolbar-btn spectrum-danger-btn" type="button" data-spectrum-delete="${utils.escapeHtml(item.id)}">
              <i class="ti ti-trash" aria-hidden="true"></i>
              <span>删除图片</span>
            </button>
          </div>
        </form>
      </div>
    `;
  };

  const updateActions = () => {
    const selectedCount = state.selectedIds.size;
    if (refs.printBtn) refs.printBtn.disabled = selectedCount < 1;
    if (refs.previewSelectedBtn) refs.previewSelectedBtn.disabled = selectedCount < 1;
    if (refs.galleryZoomBtn) refs.galleryZoomBtn.disabled = selectedCount < 1;
    if (refs.batchTagBtn) refs.batchTagBtn.disabled = selectedCount < 1;
  };

  const updateDetailCollapsed = () => {
    const animations = PublicApp?.animations;
    animations?.setClass?.(refs.workbench, 'is-detail-collapsed', state.detailCollapsed)
      ?? refs.workbench?.classList.toggle('is-detail-collapsed', state.detailCollapsed);
    if (!refs.toggleDetailBtn) return;

    const detailVisible = state.detailModalOpen || !state.detailCollapsed;
    refs.toggleDetailBtn.setAttribute('aria-expanded', String(detailVisible));
    animations?.setClass?.(refs.toggleDetailBtn, 'is-collapsed', !detailVisible)
      ?? refs.toggleDetailBtn.classList.toggle('is-collapsed', !detailVisible);
    const label = refs.toggleDetailBtn.querySelector('span');
    if (label) label.textContent = detailVisible ? '\u6536\u8d77\u8be6\u60c5' : '\u7f16\u8f91';
  };

  const setDetailCollapsed = (collapsed) => {
    if (!refs.detailPanel) {
      state.detailCollapsed = collapsed;
      state.detailModalOpen = false;
      updateDetailCollapsed();
      return;
    }

    state.detailCollapsed = collapsed;
    if (!collapsed) state.detailModalOpen = false;
    refs.detailPanel.hidden = false;
    updateDetailCollapsed();
  };

  const openDetailModal = () => {
    refs.detailModal?.remove();
    let item = getActiveItem();
    if (!item) {
      item = getFilteredItems()[0] || null;
      if (item) state.activeId = item.id;
    }

    const modal = document.createElement('div');
    modal.className = 'spectrum-compact-detail-dialog dialog-overlay';
    modal.innerHTML = item ? `
      <div class="spectrum-compact-detail-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="spectrumCompactDetailTitle">
        <div class="spectrum-detail-modal-head">
          <div>
            <div class="spectrum-detail-modal-title" id="spectrumCompactDetailTitle">图谱详情</div>
          </div>
          <button class="spectrum-detail-modal-close dialog-close" type="button" data-spectrum-detail-close aria-label="关闭详情">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <form class="spectrum-detail-form" data-spectrum-detail-form>
          <input name="id" type="hidden" value="${utils.escapeHtml(item.id)}" />
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>图谱名称</span>
            <input name="title" type="text" value="${utils.escapeHtml(item.title)}" required />
          </label>
          <label class="spectrum-detail-field">
            <span>分类</span>
            <input name="category" type="text" value="${utils.escapeHtml(item.category || '')}" />
          </label>
          <label class="spectrum-detail-field">
            <span>日期</span>
            <input name="date" type="date" value="${utils.escapeHtml(item.date || '')}" />
          </label>
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>标签</span>
            <input name="tags" type="hidden" value="${utils.escapeHtml(Array.isArray(item.tags) ? item.tags.join('，') : '')}" />
            <div class="spectrum-detail-tag-editor">
              <input type="text" data-spectrum-tag-input placeholder="输入标签后按回车添加" />
              <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-tag-add>添加</button>
            </div>
            <div class="spectrum-detail-tag-list" data-spectrum-tag-list>
              ${(Array.isArray(item.tags) ? item.tags : []).map((tag) => `
                <button class="spectrum-detail-tag-chip" type="button" data-spectrum-tag-chip="${utils.escapeHtml(tag)}">
                  <span>${utils.escapeHtml(tag)}</span>
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              `).join('')}
            </div>
          </label>
          <label class="spectrum-detail-field spectrum-detail-field-full">
            <span>备注</span>
            <textarea name="note" rows="4">${utils.escapeHtml(item.note || '')}</textarea>
          </label>
          <div class="spectrum-detail-actions">
            <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="submit">
              <i class="ti ti-device-floppy" aria-hidden="true"></i>
              <span>保存信息</span>
            </button>
            <button class="analysis-toolbar-btn spectrum-danger-btn" type="button" data-spectrum-delete="${utils.escapeHtml(item.id)}">
              <i class="ti ti-trash" aria-hidden="true"></i>
              <span>删除图片</span>
            </button>
          </div>
        </form>
      </div>
    ` : `
      <div class="spectrum-compact-detail-card" role="dialog" aria-modal="true" aria-labelledby="spectrumCompactDetailTitle">
        <button class="spectrum-detail-modal-close" type="button" data-spectrum-detail-close aria-label="关闭详情">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <div class="spectrum-detail-modal-head">
          <div>
            <div class="spectrum-detail-modal-title" id="spectrumCompactDetailTitle">图谱详情</div>
            <div class="spectrum-detail-modal-subtitle">等待选择图谱</div>
          </div>
        </div>
        <div class="spectrum-empty-state spectrum-empty-state-compact">
          <div class="spectrum-empty-icon"><i class="ti ti-file-search" aria-hidden="true"></i></div>
          <div class="spectrum-empty-title">等待选择图谱</div>
          <div class="spectrum-empty-text">上传并选择图谱后，这里会显示文件详情。</div>
        </div>
      </div>
    `;

    state.detailCollapsed = true;
    state.detailModalOpen = true;
    refs.detailModal = modal;
    document.body.appendChild(modal);
    updateDetailCollapsed();
  };

  const closeDetailModal = () => {
    refs.detailModal?.remove();
    refs.detailModal = null;
    state.detailModalOpen = false;
    state.detailCollapsed = true;
    updateDetailCollapsed();
  };

  const isDetailCompactMode = () => {
    return DETAIL_COMPACT_MQ.matches;
  };

  const isSpectrumMobileLayout = () => {
    return SPECTRUM_MOBILE_MQ.matches || window.innerWidth <= 980;
  };

  const setGalleryCountText = (total, selected) => {
    state.galleryCountTotal = total;
    state.galleryCountSelected = selected;
    if (!refs.galleryCount) return;
    const compact = isSpectrumMobileLayout();
    refs.galleryCount.hidden = compact && selected < 1;
    refs.galleryCount.textContent = compact
      ? (selected > 0 ? `已选 ${selected} 张` : '')
      : `共 ${total} 张，已选 ${selected} 张`;
  };

  const syncGalleryCountText = () => {
    setGalleryCountText(state.galleryCountTotal, state.galleryCountSelected);
  };

  const syncDetailAutoCollapse = () => {
    if (!refs.workbench) return;
    const compact = isDetailCompactMode();
    state.detailAutoCompact = compact;
    PublicApp?.animations?.setClass?.(refs.workbench, 'is-detail-auto-compact', compact)
      ?? refs.workbench.classList.toggle('is-detail-auto-compact', compact);
    if (compact && !state.detailCollapsed) setDetailCollapsed(true);
    if (!compact && state.detailModalOpen) closeDetailModal();
  };

  const setupDetailAutoCollapse = () => {
    syncDetailAutoCollapse();

    DETAIL_COMPACT_MQ.addEventListener('change', syncDetailAutoCollapse);
  };

  const printSelectedList = () => {
    const items = getSelectedItems();
    if (!items.length) return;

    const title = '已选图谱打印列表';
    const opened = window.open('', '_blank');
    if (!opened) return;

    const cards = items.map((item, index) => `
      <article class="print-card" aria-label="${utils.escapeHtml(`${index + 1}. ${item.title}`)}">
        <div class="print-image-wrap">
          <img src="${utils.escapeHtml(item.image)}" alt="${utils.escapeHtml(item.title)}" />
        </div>
        <div class="print-meta">
          <strong>${utils.escapeHtml(item.title)}</strong>
          <span>${utils.escapeHtml([item.spectrumType, item.category, item.date].filter(Boolean).join(' · '))}</span>
        </div>
      </article>
    `).join('');

    opened.document.write(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <title>${utils.escapeHtml(title)}</title>
          <style>
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;background:#fff}
            .print-grid{display:block}
            .print-card{height:100vh;break-after:page;page-break-after:always;padding:9mm 18mm 11mm;display:flex;flex-direction:column}
            .print-card:last-child{break-after:auto;page-break-after:auto}
            .print-image-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
            img{width:100%;height:100%;object-fit:contain;display:block}
            .print-meta{flex:0 0 auto;border-top:1px solid #e5ebf3;margin-top:8mm;padding-top:4mm;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;color:#0f172a}
            strong{font-size:13px;line-height:1.35;font-weight:800}
            span{font-size:11px;color:#64748b;font-weight:700;white-space:nowrap}
            @page{size:A4 landscape;margin:0}
            @media print{
              .print-card{height:100vh}
            }
          </style>
        </head>
        <body>
          <main class="print-grid">${cards}</main>
          <script>
            const images = [...document.images];
            Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }))).then(() => {
              setTimeout(() => {
                window.focus();
                window.print();
              }, 120);
            });
          <\/script>
        </body>
      </html>`);
    opened.document.close();
  };

  const render = () => {
    syncActiveWithFilteredItems();
    renderFilters();
    renderGallery();
    renderDetail();
    renderSelectedList();
    observeLazyImages();
    updateActions();
    updateDetailCollapsed();
  };

  const getPreviewSortName = (item) => String(item?.title || item?.code || item?.name || item?.id || '').trim();

  const sortPreviewItemsByName = (items) => [...(items || [])].sort((a, b) => (
    getPreviewSortName(a).localeCompare(getPreviewSortName(b), 'zh-Hans-CN', {
      numeric: true,
      sensitivity: 'base',
    })
  ));

  let cleanupPreviewZoom: (() => void) | null = null;
  let cleanupPreviewRail: (() => void) | null = null;
  const closeImagePreview = () => {
    cleanupPreviewZoom?.();
    cleanupPreviewZoom = null;
    cleanupPreviewRail?.();
    cleanupPreviewRail = null;
    refs.previewDialog?.remove();
    refs.previewDialog = null;
    refs.previewItems = [];
    refs.previewActiveId = '';
  };

  const getPreviewItems = (id) => {
    const selected = getSelectedItems();
    if (selected.length) return selected;
    return state.items.filter((item) => item.id === id);
  };

  const renderImagePreview = () => {
    if (!refs.previewDialog) return;
    cleanupPreviewZoom?.();
    cleanupPreviewZoom = null;

    const items = refs.previewItems || [];
    const item = items.find((entry) => entry.id === refs.previewActiveId) || items[0];
    if (!item) return;

    refs.previewActiveId = item.id;
    const landscape = refs.previewDialog.classList.contains('is-landscape');
    const markup = `
      <header class="spectrum-preview-topbar">
        ${landscape ? '' : `<button class="spectrum-preview-back" type="button" data-spectrum-preview-close aria-label="返回图谱列表">
          <i class="ti ti-arrow-left" aria-hidden="true"></i><span>返回列表</span>
        </button>
        <div class="spectrum-preview-location"><strong>图谱预览</strong><span>${items.findIndex((entry) => entry.id === item.id) + 1} / ${items.length}</span></div>`}
        <button class="spectrum-preview-orientation" type="button" data-spectrum-preview-orientation aria-pressed="${landscape}" aria-label="${landscape ? '还原竖屏显示' : '切换横屏显示'}"><i class="ti ti-device-mobile" aria-hidden="true"></i><span>${landscape ? '还原' : '横屏'}</span></button>
        <button class="spectrum-preview-close" type="button" data-spectrum-preview-close aria-label="关闭预览"><i class="ti ti-x" aria-hidden="true"></i></button>
      </header>
      <aside class="spectrum-preview-rail" aria-label="已选图谱预览列表">
        ${items.map((entry) => `
          <div class="spectrum-preview-entry">
          <button class="spectrum-preview-thumb${entry.id === item.id ? ' is-active' : ''}" type="button" data-spectrum-preview-open="${utils.escapeHtml(entry.id)}" aria-label="查看 ${utils.escapeHtml(entry.title)}" aria-pressed="${entry.id === item.id}" title="${utils.escapeHtml(entry.title)}">
            <img src="${utils.escapeHtml(getItemImageSrc(entry))}" data-spectrum-image-id="${utils.escapeHtml(entry.id)}" loading="lazy" decoding="async" alt="${utils.escapeHtml(entry.title)}" />
            <span>${utils.escapeHtml(entry.title)}</span>
          </button>
          <button class="spectrum-preview-remove" type="button" data-spectrum-preview-remove="${utils.escapeHtml(entry.id)}" aria-label="从预览中移除 ${utils.escapeHtml(entry.title)}" title="从预览和已选列表移除，不删除原图"><i class="ti ti-x" aria-hidden="true"></i></button>
          </div>
        `).join('')}
      </aside>
      <main class="spectrum-preview-main">
        <div class="spectrum-preview-card dialog-card is-image-only">
          <div class="spectrum-preview-card-head">
            <div class="spectrum-preview-title-row">
              <div class="spectrum-preview-card-title">${utils.escapeHtml(item.title)}</div>
            </div>
            <div class="spectrum-preview-card-meta">
              <span class="spectrum-type-badge" data-spectrum-type="${utils.escapeHtml(item.spectrumType || 'UNKNOWN')}">${utils.escapeHtml(item.spectrumType || '未识别类型')}</span>
              <span>${utils.escapeHtml(item.date || '-')}</span>
            </div>
          </div>
          <div class="spectrum-preview-card-body">
            <div class="spectrum-preview-image-frame">
              <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" alt="${utils.escapeHtml(item.title)}" />
            </div>
          </div>

        </div>
      </main>
    `;

    const { rail } = patchSpectrumPreviewDialog(refs.previewDialog, markup, () => {
      cleanupPreviewRail?.();
      cleanupPreviewRail = null;
    });
    if (landscape) {
      const topbar = refs.previewDialog.querySelector('.spectrum-preview-topbar');
      const cardHead = refs.previewDialog.querySelector('.spectrum-preview-card-head');
      if (topbar && cardHead) cardHead.appendChild(topbar);
    }
    const zoomFrame = refs.previewDialog.querySelector('.spectrum-preview-image-frame') as HTMLElement | null;
    cleanupPreviewZoom = zoomFrame ? mountSpectrumPreviewZoom(zoomFrame, { onNavigate: switchImagePreview }) : null;
    if (rail.dataset.previewLandscape !== String(landscape)) {
      cleanupPreviewRail?.();
      cleanupPreviewRail = null;
      rail.dataset.previewLandscape = String(landscape);
    }
    if (!cleanupPreviewRail) cleanupPreviewRail = mountSpectrumPreviewRail(rail);
    revealActiveSpectrumThumb(rail);
    observeLazyImages();
    ensureItemImage(item.id);
  };

  const switchImagePreview = (step) => {
    const items = refs.previewItems || [];
    if (!refs.previewDialog || items.length < 2) return;

    const currentIndex = Math.max(0, items.findIndex((item) => item.id === refs.previewActiveId));
    const nextIndex = (currentIndex + step + items.length) % items.length;
    refs.previewActiveId = items[nextIndex].id;
    renderImagePreview();
  };

  const openImagePreview = async (id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    await ensureItemImage(id);

    closeImagePreview();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-preview-dialog dialog-overlay';
    document.body.appendChild(dialog);
    refs.previewDialog = dialog;
    refs.previewItems = sortPreviewItemsByName(getPreviewItems(id));
    refs.previewActiveId = refs.previewItems.some((entry) => entry.id === id)
      ? id
      : refs.previewItems[0]?.id || id;
    renderImagePreview();
  };

  const toggleSelected = (id, force = undefined) => {
    const selected = force ?? !state.selectedIds.has(id);
    if (selected) state.selectedIds.add(id);
    else state.selectedIds.delete(id);

    const prevActiveId = state.activeId;
    state.activeId = id || state.activeId;

    if (prevActiveId && prevActiveId !== id) {
      const prevCard = refs.gallery?.querySelector(`[data-spectrum-id="${CSS.escape(prevActiveId)}"]`);
      if (prevCard) prevCard.classList.remove('is-active');
    }

    const card = refs.gallery?.querySelector(`[data-spectrum-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.toggle('is-selected', selected);
      card.classList.add('is-active');
      card.setAttribute('aria-pressed', String(selected));
    }

    const filtered = getFilteredItems();
    setGalleryCountText(filtered.length, state.selectedIds.size);

    renderFilters();
    renderDetail();
    renderSelectedList();
    updateActions();
    updateDetailCollapsed();
  };

  const readFileAsDataUrl = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => resolve(''));
    reader.readAsDataURL(file);
  });

  const hasSpectrumUploadDragData = (dataTransfer) => {
    if (!dataTransfer) return false;
    if ([...(dataTransfer.items || [])].some((item) => item.kind === 'file')) return true;
    return (dataTransfer.files?.length || 0) > 0;
  };

  const dataUrlToBase64 = (dataUrl) => {
    const match = String(dataUrl || '').match(/^data:[^;]+;base64,(.+)$/);
    return match ? match[1] : '';
  };

  const normalizeImportTags = (value) => {
    if (Array.isArray(value)) return value.map((tag) => String(tag || '').trim()).filter(Boolean);
    return normalizeTags(value);
  };

  const normalizeZipPath = (path) => String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');

  const getZipEntryMeta = (entryPath, metaByPath, metaByName) => {
    const normalizedPath = normalizeZipPath(entryPath);
    const fileName = getPathFileName(normalizedPath);
    return metaByPath.get(normalizedPath.toLowerCase())
      || metaByName.get(fileName.toLowerCase())
      || metaByName.get(getFileBaseName(fileName).toLowerCase())
      || {};
  };

  const buildImportMetadataMaps = async (zip) => {
    const metaByPath = new Map();
    const metaByName = new Map();
    const tagsEntry = Object.values(zip.files).find((entry) => !entry.dir && getPathFileName(entry.name).toLowerCase() === 'tags.json');
    if (!tagsEntry) return { metaByPath, metaByName };

    const text = await tagsEntry.async('string');
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];

    entries.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const path = normalizeZipPath(item.path || item.file || item.filePath || '');
      const name = String(item.name || item.fileName || getPathFileName(path) || '').trim();
      if (path) metaByPath.set(path.toLowerCase(), item);
      if (name) {
        metaByName.set(name.toLowerCase(), item);
        metaByName.set(getFileBaseName(name).toLowerCase(), item);
      }
    });

    return { metaByPath, metaByName };
  };

  const canDecodeImage = (dataUrl) => new Promise((resolve) => {
    if (!dataUrl) {
      resolve(false);
      return;
    }

    const image = new Image();
    image.addEventListener('load', () => {
      resolve(Boolean(image.naturalWidth || image.width) && Boolean(image.naturalHeight || image.height));
    }, { once: true });
    image.addEventListener('error', () => resolve(false), { once: true });
    image.src = dataUrl;
  });

  const setUploadProgress = (active, message = '') => {
    if (!refs.galleryPanel) return;
    if (refs.uploadStatus) {
      refs.uploadStatus.hidden = !active;
      refs.uploadStatus.textContent = active ? (message || '\u6b63\u5728\u5904\u7406\u56fe\u7247...') : '';
    }

    refs.galleryPanel.classList.toggle('is-uploading', active);
    refs.galleryPanel.setAttribute('aria-busy', active ? 'true' : 'false');
    refs.uploadBtn?.classList.toggle('is-uploading', active);
    if (refs.uploadBtn) refs.uploadBtn.disabled = active;
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadScriptOnce = (src, globalName) => new Promise((resolve, reject) => {
    if (globalName && window[globalName]) {
      resolve(window[globalName]);
      return;
    }

    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', () => reject(new Error('脚本加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error('脚本加载失败'));
    document.head.appendChild(script);
  });

  const ensureJsZipLoaded = async () => {
    if (window.JSZip) return window.JSZip;

    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip');
    } catch {
      throw new Error('ZIP 处理库未加载。当前网络或代理无法访问 jsDelivr CDN，请稍后重试或使用可联网环境导入/导出。');
    }

    if (!window.JSZip) {
      throw new Error('ZIP 处理库加载异常，请刷新页面后重试。');
    }

    return window.JSZip;
  };

  const exportSpectrumPackage = async (categorySelection = null) => {
    try {
      await ensureJsZipLoaded();
    } catch (error) {
      App.notify?.error?.(error?.message || 'ZIP 导出库尚未加载，请检查网络后重试。', { key: 'spectrum-export-zip-failed' });
      return;
    }

    const selectedCategories = categorySelection instanceof Set ? categorySelection : null;
    const candidateItems = getExportableItems()
      .filter((item) => !selectedCategories || selectedCategories.has(getExportCategory(item)));
    if (!candidateItems.length) {
      openUploadIssueDialog([{ name: '图谱库', reason: selectedCategories ? '所选分类没有可导出的图片' : '当前没有可导出的图片' }]);
      return;
    }

    const items = (await Promise.all(candidateItems.map(async (item) => ({
      ...item,
      // A displayed WebP derivative must never replace the original in an export.
      image: item.imageStored ? await loadImage(() => cloudStorage.getDataUrl('spectrum', item.id)) : item.image,
    })))).filter((item) => String(item.image || '').trim());

    if (!items.length) {
      openUploadIssueDialog([{ name: '图谱库', reason: '所选分类的图片暂时无法读取，请稍后重试' }]);
      return;
    }

    const zip = new window.JSZip();
    const usedPaths = new Set();
    const tags = [];

    items.forEach((item, index) => {
      const category = sanitizeArchiveSegment(getExportCategory(item));
      const sourceName = getPathFileName(item.title || item.code || `图谱-${index + 1}`);
      const extension = getImageExtensionFromDataUrl(item.image);
      const fileName = sanitizeArchiveSegment(/\.[^.]+$/.test(sourceName) ? sourceName : `${sourceName}${extension}`, `图谱-${index + 1}${extension}`);
      const basePath = `${category}/${fileName}`;
      let path = basePath;
      let copyIndex = 2;
      while (usedPaths.has(path.toLowerCase())) {
        const extMatch = fileName.match(/(\.[^.]+)$/);
        const ext = extMatch?.[1] || '.png';
        const stem = fileName.slice(0, fileName.length - ext.length);
        path = `${category}/${stem}-${copyIndex}${ext}`;
        copyIndex += 1;
      }
      usedPaths.add(path.toLowerCase());

      const base64 = dataUrlToBase64(item.image);
      if (base64) zip.file(path, base64, { base64: true });
      else zip.file(path, item.image);

      tags.push({
        name: getPathFileName(path),
        path,
        title: item.title || getFileBaseName(path),
        category: item.category || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        spectrumType: item.spectrumType || getSpectrumTypeFromName(item.title || item.code || path),
        date: item.date || '',
        note: item.note || '',
      });
    });

    zip.file('tags.json', JSON.stringify(tags, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `图谱库-${new Date().toISOString().slice(0, 10)}.zip`);
  };

  const importSpectrumPackage = async (file) => {
    if (!file) return;
    try {
      await ensureJsZipLoaded();
    } catch (error) {
      App.notify?.error?.(error?.message || 'ZIP 导入库尚未加载，请检查网络后重试。', { key: 'spectrum-import-zip-failed' });
      return;
    }

    const issues = [];
    let zip;
    try {
      zip = await window.JSZip.loadAsync(file);
    } catch (error) {
      openUploadIssueDialog([{ name: getUploadIssueName(file), reason: '压缩包读取失败' }]);
      return;
    }

    let metadata;
    try {
      metadata = await buildImportMetadataMaps(zip);
    } catch (error) {
      openUploadIssueDialog([{ name: 'tags.json', reason: 'JSON 格式错误或无法读取' }]);
      return;
    }

    const allEntries = Object.values(zip.files);
    const hasTagsEntry = allEntries.some((entry) => !entry.dir && getPathFileName(entry.name).toLowerCase() === 'tags.json');
    const imageEntries = allEntries
      .filter((entry) => !entry.dir && isImageArchivePath(entry.name));

    if (!imageEntries.length) {
      openUploadIssueDialog([{ name: getUploadIssueName(file), reason: '压缩包内没有找到图片' }]);
      return;
    }

    const plans = imageEntries.map((entry) => {
      const path = normalizeZipPath(entry.name);
      const meta = getZipEntryMeta(path, metadata.metaByPath, metadata.metaByName);
      const fileName = getPathFileName(path);
      const title = String(meta.title || getFileBaseName(fileName) || fileName).trim();
      const category = String(meta.category || getPathCategory(path) || '').trim();
      const existing = findItemByTitle(title);
      return {
        entry,
        path,
        fileName,
        title,
        category,
        tags: normalizeImportTags(meta.tags),
        spectrumType: normalizeSpectrumType(meta.spectrumType || meta.type, title || fileName),
        date: normalizeImportDate(meta.date) || new Date().toISOString().slice(0, 10),
        note: String(meta.note || '').trim(),
        existing,
      };
    });

    const categories = new Set(plans.map((plan) => plan.category).filter(Boolean));
    const invalidPlans = plans.filter((plan) => !plan.category || !plan.title);
    if (invalidPlans.length) {
      openUploadIssueDialog(invalidPlans.map((plan) => ({
        name: plan.fileName,
        reason: !plan.category ? '缺少分类目录' : '缺少图谱名称',
      })));
      return;
    }

    const conflictCount = plans.filter((plan) => plan.existing).length;
    const conflictAction = conflictCount ? await openImportConflictDialog(conflictCount) : 'overwrite';
    let changed = false;
    let editsChanged = false;
    let uploadedCount = 0;
    const importProgress = openImportProgressDialog({
      total: plans.length,
      categoryCount: categories.size,
      hasTags: hasTagsEntry,
    });

    for (const plan of plans) {
      if (plan.existing && conflictAction === 'skip') {
        uploadedCount += 1;
        importProgress.update({
          completed: uploadedCount,
          stage: '跳过冲突',
          detail: `已跳过同名图谱：${plan.title}`,
        });
        continue;
      }

      let image = '';
      try {
        const base64 = await plan.entry.async('base64');
        image = `data:${getImageMimeFromName(plan.fileName)};base64,${base64}`;
      } catch (error) {
        issues.push({ name: plan.fileName, reason: '图片读取失败' });
        continue;
      }

      const decoded = await canDecodeImage(image);
      if (!decoded) {
        issues.push({ name: plan.fileName, reason: '图片无法解析或文件已损坏' });
        continue;
      }

      if (plan.existing) {
        const imageVersion = new Date().toISOString();
        const imageStored = await putStoredImage(plan.existing.id, image, imageVersion);
        if (!imageStored) {
          issues.push({ name: plan.fileName, reason: '云端文件上传失败' });
          uploadedCount += 1;
          importProgress.update({ completed: uploadedCount, stage: '上传失败', detail: `上传失败：${plan.fileName}` });
          continue;
        }
        const index = state.items.findIndex((item) => item.id === plan.existing.id);
        if (index < 0) continue;
        if (state.edits[plan.existing.id]) {
          delete state.edits[plan.existing.id];
          editsChanged = true;
        }
        state.items[index] = {
          ...state.items[index],
          title: plan.title,
          spectrumType: plan.spectrumType,
          category: plan.category,
          date: plan.date,
          tags: plan.tags,
          note: plan.note,
          image,
          imageStored,
          imageVersion,
          uploaded: true,
        };
        revealItemInGallery(state.items[index]);
      } else {
        const id = `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const imageVersion = new Date().toISOString();
        const imageStored = await putStoredImage(id, image, imageVersion);
        if (!imageStored) {
          issues.push({ name: plan.fileName, reason: '云端文件上传失败' });
          uploadedCount += 1;
          importProgress.update({ completed: uploadedCount, stage: '上传失败', detail: `上传失败：${plan.fileName}` });
          continue;
        }
        const item = {
          id,
          code: `IMPORT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
          title: plan.title,
          spectrumType: plan.spectrumType,
          category: plan.category,
          status: '',
          date: plan.date,
          tags: plan.tags,
          image,
          imageStored,
          imageVersion,
          note: plan.note,
          uploaded: true,
        };
        state.items.unshift(item);
        revealItemInGallery(item);
      }
      changed = true;
      uploadedCount += 1;
      importProgress.update({
        completed: uploadedCount,
        stage: '上传中',
        detail: `正在处理 ${plan.category} / ${plan.fileName}`,
      });
    }

    if (changed) {
      if (editsChanged) saveItemEdits();
      importProgress.update({ completed: uploadedCount, stage: '写入索引', detail: '图片已上传，正在写入 D1 图谱目录' });
      const indexSaved = await saveUploadedItems();
      if (!indexSaved) {
        issues.push({ name: '图谱目录', reason: 'D1 索引写入失败，请勿刷新页面并重试导入' });
      }
      render();
    }
    importProgress.update({
      completed: plans.length,
      stage: issues.length ? '完成但有异常' : '导入完成',
      detail: issues.length
        ? `已完成 ${plans.length - issues.length} 张，发现 ${issues.length} 个问题`
        : `已完成 ${plans.length} 张，分类与标签已写入云端`,
    });
    window.setTimeout(() => importProgress.close(), issues.length ? 1200 : 700);
    openUploadIssueDialog(issues);
  };

  const uploadSpectrumFiles = async (fileList) => {
    const selectedFiles = [...(fileList || [])];
    if (!selectedFiles.length) return;

    // Capture once so revealItemInGallery cannot change the metadata inherited by later files.
    const uploadFilterState = captureFilterState();
    const inheritedCategory = uploadFilterState.category === '全部' ? '' : uploadFilterState.category;
    const inheritedTags = uploadFilterState.tag === '全部' ? [] : [uploadFilterState.tag];

    const issues = [];
    const files = selectedFiles.filter((file) => {
      if (isImageUploadFile(file)) return true;
      issues.push({
        name: getUploadIssueName(file),
        reason: '不是支持的图片文件',
      });
      return false;
    });

    if (files.length) {
      let conflictAction = '';
      let completed = 0;
      setUploadProgress(true, `\u5df2\u9009\u62e9 ${files.length} \u5f20\u56fe\u8c31\uff0c\u6b63\u5728\u51c6\u5907\u4e0a\u4f20`);
      try {
        for (const file of files) {
          const title = getUploadTitle(file);
          const existing = findItemByTitle(title);
          setUploadProgress(true, `\u6b63\u5728\u4e0a\u4f20 ${completed + 1}/${files.length}\uff1a${file.name}`);
          if (existing) {
            if (!conflictAction) {
              conflictAction = String(await openUploadConflictDialog(file.name));
            }
            if (conflictAction === 'skip') {
              completed += 1;
              setUploadProgress(true, `\u5df2\u5904\u7406 ${completed}/${files.length}`);
              continue;
            }
          }

      const image = await readFileAsDataUrl(file);
      if (!image) {
        issues.push({
          name: getUploadIssueName(file),
          reason: '文件读取失败',
        });
            completed += 1;
            setUploadProgress(true, `\u5df2\u5904\u7406 ${completed}/${files.length}`);
            continue;
      }

      const decoded = await canDecodeImage(image);
      if (!decoded) {
        issues.push({
          name: getUploadIssueName(file),
          reason: '图片无法解析或文件已损坏',
        });
            completed += 1;
            setUploadProgress(true, `\u5df2\u5904\u7406 ${completed}/${files.length}`);
            continue;
      }

      const today = new Date().toISOString().slice(0, 10);
      const spectrumType = getSpectrumTypeFromName(file.name);
      if (existing) {
        const imageVersion = new Date().toISOString();
        const imageStored = await putStoredImage(existing.id, image, imageVersion);
        const index = state.items.findIndex((item) => item.id === existing.id);
            if (index < 0) {
              completed += 1;
              setUploadProgress(true, `\u5df2\u5904\u7406 ${completed}/${files.length}`);
              continue;
            }
        state.items[index] = {
          ...state.items[index],
          title,
          spectrumType,
          image,
          imageStored,
          imageVersion,
          uploaded: true,
        };
        revealItemInGallery(state.items[index], uploadFilterState);
      } else {
        const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const imageVersion = new Date().toISOString();
        const imageStored = await putStoredImage(id, image, imageVersion);
        const item = {
          id,
          code: `UPLOAD-${today.replace(/-/g, '')}`,
          title,
          spectrumType,
          category: inheritedCategory,
          status: '',
          date: today,
          tags: inheritedTags,
          image,
          imageStored,
          imageVersion,
          note: '',
          uploaded: true,
        };
        state.items.unshift(item);
        revealItemInGallery(item, uploadFilterState);
      }
          await saveUploadedItems();
          completed += 1;
          setUploadProgress(true, `\u5df2\u4e0a\u4f20 ${completed}/${files.length}`);
          render();
        }
      } finally {
        setUploadProgress(false);
      }
    }

    openUploadIssueDialog(issues);
  };

  const bindEvents = () => {
    SPECTRUM_MOBILE_MQ.addEventListener('change', syncGalleryCountText);

    refs.searchInput?.addEventListener('input', () => {
      state.query = refs.searchInput.value || '';
      render();
    });

    refs.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.getAttribute('data-spectrum-mode') || 'ALL';
        syncModeButtons();
        render();
      });
    });

    const previewSelected = () => {
      const selected = getSelectedItems();
      if (!selected.length) return;
      const item = selected.find((entry) => entry.id === state.activeId) || selected[0];
      openImagePreview(item.id);
    };

    refs.previewSelectedBtn?.addEventListener('click', previewSelected);
    refs.galleryZoomBtn?.addEventListener('click', previewSelected);

    refs.clearSelectedBtn?.addEventListener('click', () => {
    state.selectedIds.clear();
    render();
    });

    refs.deleteSelectedBtn?.addEventListener('click', () => {
      openDeleteDialog('', 'selected');
    });

    refs.categorySearchInput?.addEventListener('input', renderFilters);

    refs.categoryFilters?.addEventListener('click', (event) => {
      if (categoryDragActive) {
        event.preventDefault();
        return;
      }
      const button = event.target.closest('[data-spectrum-category]');
      if (!button) return;
      state.category = button.getAttribute('data-spectrum-category') || '全部';
      state.tag = '全部';
      saveFilterState();
      render();
    });

    refs.categoryFilters?.addEventListener('dragstart', (event) => {
      const button = event.target.closest('[data-spectrum-category]');
      if (!button) return;
      const category = button.getAttribute('data-spectrum-category') || '';
      event.dataTransfer?.setData('text/plain', category);
      event.dataTransfer?.setData('application/x-spectrum-category', category);
      event.dataTransfer.effectAllowed = 'move';
      button.classList.add('is-dragging');
      refs.categoryFilters?.classList.add('is-reordering');
      categoryDragActive = true;
    });

    refs.categoryFilters?.addEventListener('dragend', (event) => {
      event.target.closest('[data-spectrum-category]')?.classList.remove('is-dragging');
      refs.categoryFilters?.querySelectorAll('.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
      refs.categoryFilters?.classList.remove('is-reordering');
      state.categoryOrder = getCurrentCategoryOrderFromDom();
      saveFilterState();
      window.setTimeout(() => {
        categoryDragActive = false;
      }, 0);
    });

    refs.categoryFilters?.addEventListener('dragover', (event) => {
      const button = event.target.closest('[data-spectrum-category]');
      if (!button) return;
      event.preventDefault();
      const dragging = refs.categoryFilters?.querySelector('.is-dragging');
      if (dragging && dragging !== button) {
        const rect = button.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        animateCategoryReorder(() => {
          if (insertAfter) button.after(dragging);
          else button.before(dragging);
        });
      }
      refs.categoryFilters?.querySelectorAll('.is-drag-over').forEach((item) => {
        if (item !== button) item.classList.remove('is-drag-over');
      });
      button.classList.add('is-drag-over');
    });

    refs.categoryFilters?.addEventListener('drop', (event) => {
      const target = event.target.closest('[data-spectrum-category]');
      if (!target) return;
      event.preventDefault();
      const sourceCategory = event.dataTransfer?.getData('application/x-spectrum-category')
        || event.dataTransfer?.getData('text/plain')
        || '';
      const targetCategory = target.getAttribute('data-spectrum-category') || '';
      refs.categoryFilters?.querySelectorAll('.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
      if (!sourceCategory || !targetCategory || sourceCategory === targetCategory) return;
      state.categoryOrder = getCurrentCategoryOrderFromDom();
      saveFilterState();
    });

    refs.tagFilters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-spectrum-tag]');
      if (!button) return;
      state.tag = button.getAttribute('data-spectrum-tag') || '全部';
      saveFilterState();
      render();
    });

    refs.gallery?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-spectrum-id]');
      if (card) {
        toggleSelected(card.getAttribute('data-spectrum-id'));
      }
    });

    refs.gallery?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('[data-spectrum-id]');
      if (!card) return;
      event.preventDefault();
      toggleSelected(card.getAttribute('data-spectrum-id'));
    });

    refs.detailPanel?.addEventListener('click', (event) => {
      if (state.detailModalOpen && event.target === refs.detailPanel) {
        closeDetailModal();
        return;
      }

      const closeButton = event.target.closest('[data-spectrum-detail-close]');
      if (closeButton) {
        if (state.detailModalOpen) closeDetailModal();
        else setDetailCollapsed(true);
        return;
      }

      const tagAddButton = event.target.closest('[data-spectrum-tag-add]');
      if (tagAddButton) {
        const form = tagAddButton.closest('[data-spectrum-detail-form]');
        if (form) addDetailTag(form);
        return;
      }

      const tagChip = event.target.closest('[data-spectrum-tag-chip]');
      if (tagChip) {
        const form = tagChip.closest('[data-spectrum-detail-form]');
        tagChip.remove();
        if (form) syncTagValue(form);
        return;
      }

      const previewButton = event.target.closest('[data-spectrum-preview]');
      if (previewButton) {
        openImagePreview(previewButton.getAttribute('data-spectrum-preview'));
        return;
      }

      const deleteButton = event.target.closest('[data-spectrum-delete]');
      if (deleteButton) {
        openDeleteDialog(deleteButton.getAttribute('data-spectrum-delete'));
      }
    });

    refs.detailPanel?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const input = event.target.closest('[data-spectrum-tag-input]');
      if (!input) return;
      event.preventDefault();
      const form = input.closest('[data-spectrum-detail-form]');
      if (form) addDetailTag(form);
    });

    refs.detailPanel?.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-spectrum-detail-form]');
      if (!form) return;
      event.preventDefault();
      syncTagValue(form);
      saveDetailForm(form);
    });

    document.addEventListener('click', (event) => {
      if (!refs.detailModal) return;
      if (event.target === refs.detailModal || event.target.closest('[data-spectrum-detail-close]')) {
        closeDetailModal();
        return;
      }

      const tagAddButton = event.target.closest('[data-spectrum-tag-add]');
      if (tagAddButton && refs.detailModal.contains(tagAddButton)) {
        const form = tagAddButton.closest('[data-spectrum-detail-form]');
        if (form) addDetailTag(form);
        return;
      }

      const tagChip = event.target.closest('[data-spectrum-tag-chip]');
      if (tagChip && refs.detailModal.contains(tagChip)) {
        const form = tagChip.closest('[data-spectrum-detail-form]');
        tagChip.remove();
        if (form) syncTagValue(form);
        return;
      }

      const deleteButton = event.target.closest('[data-spectrum-delete]');
      if (deleteButton && refs.detailModal.contains(deleteButton)) {
        openDeleteDialog(deleteButton.getAttribute('data-spectrum-delete'));
        return;
      }

      const previewButton = event.target.closest('[data-spectrum-preview]');
      if (previewButton && refs.detailModal.contains(previewButton)) {
        openImagePreview(previewButton.getAttribute('data-spectrum-preview'));
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!refs.detailModal) return;
      if (event.key === 'Escape') {
        closeDetailModal();
        return;
      }
      if (event.key !== 'Enter') return;
      const input = event.target.closest('[data-spectrum-tag-input]');
      if (!input || !refs.detailModal.contains(input)) return;
      event.preventDefault();
      const form = input.closest('[data-spectrum-detail-form]');
      if (form) addDetailTag(form);
    });

    document.addEventListener('submit', (event) => {
      if (!refs.detailModal) return;
      const form = event.target.closest('[data-spectrum-detail-form]');
      if (!form || !refs.detailModal.contains(form)) return;
      event.preventDefault();
      syncTagValue(form);
      const updated = saveDetailForm(form, { skipRender: true });
      if (!updated) return;
      const subtitle = refs.detailModal.querySelector('.spectrum-detail-modal-subtitle');
      const imageButton = refs.detailModal.querySelector('[data-spectrum-preview]');
      const image = refs.detailModal.querySelector('.spectrum-compact-detail-image img');
      if (subtitle) subtitle.textContent = updated.title;
      if (imageButton) imageButton.setAttribute('aria-label', `放大查看 ${updated.title}`);
      if (image) image.alt = updated.title;
      renderGallery();
      renderFilters();
      updateActions();
    });

    document.addEventListener('click', (event) => {
      if (!refs.previewDialog) return;
      if (event.target === refs.previewDialog || event.target.closest('[data-spectrum-preview-close]')) {
        closeImagePreview();
        return;
      }

      const orientationButton = event.target.closest('[data-spectrum-preview-orientation]');
      if (orientationButton && refs.previewDialog.contains(orientationButton)) {
        refs.previewDialog.classList.toggle('is-landscape');
        renderImagePreview();
        refs.previewDialog.querySelector('[data-spectrum-preview-orientation]')?.focus({ preventScroll: true });
        return;
      }

      const removePreviewButton = event.target.closest('[data-spectrum-preview-remove]');
      if (removePreviewButton && refs.previewDialog.contains(removePreviewButton)) {
        const id = removePreviewButton.getAttribute('data-spectrum-preview-remove') || '';
        const next = removePreviewItem(refs.previewItems || [], refs.previewActiveId, id);
        refs.previewItems = next.items;
        refs.previewActiveId = next.activeId;
        state.selectedIds.delete(id);
        render();
        if (!next.items.length) {
          closeImagePreview();
          return;
        }
        renderImagePreview();
        refs.previewDialog.querySelector('.spectrum-preview-thumb.is-active')?.focus({ preventScroll: true });
        return;
      }

      const previewOpenButton = event.target.closest('[data-spectrum-preview-open]');
      if (previewOpenButton) {
        refs.previewActiveId = previewOpenButton.getAttribute('data-spectrum-preview-open') || refs.previewActiveId;
        renderImagePreview();
        return;
      }
    });

    document.addEventListener('keydown', (event) => {
      if (refs.uploadConflictDialog && event.key === 'Escape') {
        refs.uploadConflictResolver?.('skip');
        refs.uploadConflictResolver = null;
        return;
      }

      if (refs.uploadIssueDialog && event.key === 'Escape') {
        refs.uploadIssueDialog.remove();
        refs.uploadIssueDialog = null;
        return;
      }

      if (state.detailModalOpen && event.key === 'Escape') {
        closeDetailModal();
        return;
      }

      if (!refs.previewDialog) return;
      if (event.key === 'Escape') {
        closeImagePreview();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        switchImagePreview(1);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        switchImagePreview(-1);
      }
    });

    document.addEventListener('wheel', (event) => {
      if (!refs.previewDialog) return;
      if (event.target.closest('.spectrum-preview-rail')) {
        return;
      }
      event.preventDefault();
      switchImagePreview(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    refs.selectedList?.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-spectrum-remove-selected]');
      if (removeButton) {
        const removedId = removeButton.getAttribute('data-spectrum-remove-selected');
        state.selectedIds.delete(removedId);
        const removedCard = refs.gallery?.querySelector(`[data-spectrum-id="${CSS.escape(removedId)}"]`);
        if (removedCard) {
          removedCard.classList.remove('is-selected');
          removedCard.setAttribute('aria-pressed', 'false');
        }
        const filtered = getFilteredItems();
        setGalleryCountText(filtered.length, state.selectedIds.size);
        renderFilters();
        renderSelectedList();
        renderDetail();
        updateActions();
        return;
      }

      const openButton = event.target.closest('[data-spectrum-open]');
      if (openButton) {
        const prevActiveId = state.activeId;
        state.activeId = openButton.getAttribute('data-spectrum-open') || state.activeId;
        if (prevActiveId && prevActiveId !== state.activeId) {
          const prevCard = refs.gallery?.querySelector(`[data-spectrum-id="${CSS.escape(prevActiveId)}"]`);
          if (prevCard) prevCard.classList.remove('is-active');
        }
        const activeCard = refs.gallery?.querySelector(`[data-spectrum-id="${CSS.escape(state.activeId)}"]`);
        if (activeCard) activeCard.classList.add('is-active');
        renderDetail();
        updateDetailCollapsed();
      }
    });

    refs.toggleDetailBtn?.addEventListener('click', () => {
      const compact = isDetailCompactMode();
      state.detailAutoCompact = compact;
      PublicApp?.animations?.setClass?.(refs.workbench, 'is-detail-auto-compact', compact)
        ?? refs.workbench?.classList.toggle('is-detail-auto-compact', compact);
      if (compact) {
        if (state.detailModalOpen) closeDetailModal();
        else openDetailModal();
        return;
      }
      setDetailCollapsed(!state.detailCollapsed);
    });

    refs.printBtn?.addEventListener('click', printSelectedList);

    refs.exportBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (exportCategoryMenuOpen) closeExportCategoryMenu();
      else openExportCategoryMenu();
    });
    refs.exportMenu?.addEventListener('click', (event) => {
      event.stopPropagation();
      const cancelButton = event.target.closest('[data-spectrum-export-cancel]');
      if (cancelButton) {
        closeExportCategoryMenu();
        return;
      }

      const confirmButton = event.target.closest('[data-spectrum-export-confirm]');
      if (confirmButton) {
        const selectedCategories = new Set(exportCategorySelection);
        closeExportCategoryMenu();
        exportSpectrumPackage(selectedCategories);
      }
    });
    refs.exportMenu?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.matches('[data-spectrum-export-all]')) {
        exportCategorySelection = target.checked ? new Set(getExportCategories()) : new Set();
        renderExportCategoryMenu();
        return;
      }

      const category = target.getAttribute('data-spectrum-export-category') || '';
      if (!category) return;
      if (target.checked) exportCategorySelection.add(category);
      else exportCategorySelection.delete(category);
      renderExportCategoryMenu();
    });
    document.addEventListener('click', (event) => {
      if (!exportCategoryMenuOpen || refs.exportPicker?.contains(event.target)) return;
      closeExportCategoryMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && exportCategoryMenuOpen) closeExportCategoryMenu();
    });
    refs.importBtn?.addEventListener('click', () => refs.importInput?.click());
    refs.importInput?.addEventListener('change', () => {
      importSpectrumPackage(refs.importInput.files?.[0]);
      refs.importInput.value = '';
    });

    refs.uploadBtn?.addEventListener('click', () => refs.uploadInput?.click());
    refs.uploadInput?.addEventListener('change', () => {
      uploadSpectrumFiles(refs.uploadInput.files);
      refs.uploadInput.value = '';
    });

    refs.galleryPanel?.addEventListener('dragenter', (event) => {
      if (!hasSpectrumUploadDragData(event.dataTransfer)) return;
      event.preventDefault();
      refs.galleryPanel.classList.add('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('dragover', (event) => {
      if (!hasSpectrumUploadDragData(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      refs.galleryPanel.classList.add('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('dragleave', (event) => {
      if (refs.galleryPanel.contains(event.relatedTarget)) return;
      refs.galleryPanel.classList.remove('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('drop', (event) => {
      if (!hasSpectrumUploadDragData(event.dataTransfer)) {
        refs.galleryPanel.classList.remove('is-drag-over');
        return;
      }
      event.preventDefault();
      refs.galleryPanel.classList.remove('is-drag-over');
      const files = [...(event.dataTransfer.files || [])];
      if (!files.length) return;
      const zipFile = files.find(isZipUploadFile);
      if (zipFile) importSpectrumPackage(zipFile);
      else uploadSpectrumFiles(files);
    });
  };

  const init = async () => {
    initRefs();
    if (!refs.gallery) return;
    if (refs.uploadBtn) refs.uploadBtn.disabled = true;
    if (refs.importBtn) refs.importBtn.disabled = true;
    bindEvents();
    cleanupMobileLayout?.();
    const page = refs.gallery.closest('.spectrum-page');
    if (page) cleanupMobileLayout = mountSpectrumMobileLayout(page);
    setupDetailAutoCollapse();
    refs.gallery.className = 'spectrum-gallery is-empty';
    refs.gallery.innerHTML = `
      <div class="spectrum-empty-state">
        <div class="spectrum-empty-icon"><i class="ti ti-loader-2" aria-hidden="true"></i></div>
        <div class="spectrum-empty-title">正在加载图谱</div>
        <div class="spectrum-empty-text">正在读取本地保存的图片。</div>
      </div>
    `;
    await loadItems();
    if (refs.uploadBtn) refs.uploadBtn.disabled = false;
    if (refs.importBtn) refs.importBtn.disabled = false;
    render();
  };

  const cleanup = () => {
    cleanupMobileLayout?.();
    cleanupMobileLayout = undefined;
    SPECTRUM_MOBILE_MQ.removeEventListener?.('change', syncGalleryCountText);
    DETAIL_COMPACT_MQ.removeEventListener?.('change', syncDetailAutoCollapse);
    closeImagePreview();
    closeDetailModal();
    closeExportCategoryMenu();
    refs.uploadConflictDialog?.remove();
    refs.uploadConflictDialog = null;
    refs.uploadConflictResolver?.('skip');
    refs.uploadConflictResolver = null;
    refs.uploadIssueDialog?.remove();
    refs.uploadIssueDialog = null;
    refs.importProgressDialog?.remove();
    refs.importProgressDialog = null;
  };

  App.spectrumAnalysis = {
    refresh: async () => {
      const activeId = state.activeId;
      await loadItems();
      const ids = new Set(state.items.map((item) => item.id));
      state.selectedIds = new Set([...state.selectedIds].filter((id) => ids.has(id)));
      if (ids.has(activeId)) state.activeId = activeId;
      render();
    },
    init,
    cleanup,
  };
})();

