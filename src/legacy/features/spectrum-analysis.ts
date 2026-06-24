// @ts-nocheck
import { getLegacyApp, getPublicApp } from '../core/app-context';
import { cloudStorage } from '../../services/cloud-storage';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;
  const PublicApp = getPublicApp();

  const { utils } = App;
  const STORAGE_KEY = 'gjh-spectrum-user-images-v2';
  const EDIT_STORAGE_KEY = 'gjh-spectrum-edits-v2';
  const FILTER_STORAGE_KEY = 'gjh-spectrum-filter-state-v1';
  const PREVIEW_AI_STORAGE_KEY = 'gjh-spectrum-preview-ai-results-v1';
  const PREVIEW_AI_CACHE_LIMIT = 120;
  const IMAGE_DB_NAME = 'gjh-spectrum-images-db';
  const IMAGE_DB_VERSION = 1;
  const IMAGE_STORE_NAME = 'images';
  const EMPTY_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const EDITABLE_FIELDS = ['title', 'category', 'date', 'tags', 'note'];
  const SPECTRUM_TYPES = ['DSC', 'TGA', 'FTIR'];
  const DELETE_ANIMATION_MS = 240;
  const SKILL_MUTATION_LIMIT = 30;

  const state = {
    items: [],
    edits: {},
    selectedIds: new Set(),
    activeId: '',
    query: '',
    category: '全部',
    categoryOrder: [],
    tag: '全部',
    mode: 'ALL',
    view: 'grid',
    sort: 'date-desc',
    editingId: '',
    detailCollapsed: false,
    detailAutoCompact: false,
    detailModalOpen: false,
    galleryCountTotal: 0,
    galleryCountSelected: 0,
  };

  const refs = {};
  const previewAiState = {};
  let previewAiCollapsed = true;
  let previewAiMergeMode = false;
  let previewAiMergeViewMode = 'table';
  let previewAiMergeRunning = false;
  let imageDbPromise = null;
  let imageObserver = null;
  const pendingImageLoads = new Map();
  let exportCategoryMenuOpen = false;
  let exportCategorySelection = new Set();
  let categoryDragActive = false;
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
    refs.clearSelectedBtn = document.getElementById('spectrumClearSelectedBtn');
    refs.deleteSelectedBtn = document.getElementById('spectrumDeleteSelectedBtn');
    refs.selectedList = document.getElementById('spectrumSelectedList');
    refs.galleryCount = document.getElementById('spectrumGalleryCount');
    refs.galleryTitle = document.querySelector('.spectrum-gallery-title-row .spectrum-panel-title');
    refs.sortSelect = document.getElementById('spectrumSortSelect');
    refs.toggleDetailBtn = document.getElementById('spectrumToggleDetailBtn');
    refs.gallery = document.getElementById('spectrumGallery');
    refs.workbench = refs.gallery?.closest('.spectrum-workbench');
    refs.galleryPanel = refs.gallery?.closest('.spectrum-gallery-panel');
    refs.detailPanel = document.getElementById('spectrumDetailPanel');
    refs.viewButtons = document.querySelectorAll('[data-spectrum-view]');
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

  const getPreviewAiCache = () => {
    const cache = utils.readJson(PREVIEW_AI_STORAGE_KEY, {});
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  };

  const getStoredPreviewAiResult = (id) => {
    const cached = getPreviewAiCache()[id];
    if (!cached || cached.status !== 'success' || !cached.result) return null;
    return {
      status: 'success',
      result: cached.result,
      rawText: String(cached.rawText || ''),
      propertyTableHtml: String(cached.propertyTableHtml || ''),
      model: String(cached.model || ''),
      modelSource: String(cached.modelSource || ''),
      updatedAt: cached.updatedAt || '',
      fromCache: true,
    };
  };

  const restorePreviewAiResult = (id) => {
    if (!id || previewAiState[id]) return;
    const cached = getStoredPreviewAiResult(id);
    if (cached) previewAiState[id] = cached;
  };

  const savePreviewAiResult = (id, aiState) => {
    if (!id || !aiState || aiState.status !== 'success' || !aiState.result) return;
    const cache = getPreviewAiCache();
    cache[id] = {
      status: 'success',
      result: aiState.result,
      rawText: aiState.rawText || '',
      propertyTableHtml: aiState.propertyTableHtml || '',
      model: aiState.model || '',
      modelSource: aiState.modelSource || '',
      updatedAt: aiState.updatedAt || new Date().toISOString(),
    };

    const trimmed = Object.entries(cache)
      .sort((a, b) => String(b[1]?.updatedAt || '').localeCompare(String(a[1]?.updatedAt || '')))
      .slice(0, PREVIEW_AI_CACHE_LIMIT)
      .reduce((map, [key, value]) => {
        map[key] = value;
        return map;
      }, {});
    utils.writeJson(PREVIEW_AI_STORAGE_KEY, trimmed);
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
    const cached = await runImageStore('readonly', (store) => store.get(id));
    if (typeof cached === 'string') return version ? null : cached;
    if (!cached || typeof cached !== 'object') return null;
    if (version && cached.version !== version) return null;
    return typeof cached.dataUrl === 'string' ? cached.dataUrl : null;
  };

  const putCachedImage = (id, dataUrl, version = '') => runImageStore('readwrite', (store) => store.put({ dataUrl, version }, id));

  const deleteCachedImages = (ids) => ids.forEach((id) => runImageStore('readwrite', (store) => store.delete(id)));

  const getStoredImage = (id) => cloudStorage.getDataUrl('spectrum', id);

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
          setSpectrumImagePending(node, false);
          setSpectrumImageMissing(node, false);
          node.src = image;
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
    if (missing) frame?.classList.remove('is-image-pending');
  };

  const setSpectrumImagePending = (image, pending) => {
    if (pending) image.classList.remove('is-image-missing');
    image.classList.toggle('is-image-pending', pending);
    const frame = getSpectrumImageFrame(image);
    frame?.classList.toggle('is-image-pending', pending);
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
    }
  };

  const bindSpectrumImageFallbacks = (root = document) => {
    root.querySelectorAll?.('img[data-spectrum-image-id]').forEach((image) => {
      if (!image.dataset.spectrumFallbackBound) {
        image.dataset.spectrumFallbackBound = 'true';
        image.addEventListener('load', () => {
          setSpectrumImagePending(image, false);
          setSpectrumImageMissing(image, false);
        });
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
    const edits = await cloudStorage.getJson(EDIT_STORAGE_KEY) ?? utils.readJson(EDIT_STORAGE_KEY, {});
    state.edits = edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
    const uploaded = await cloudStorage.getJson(STORAGE_KEY) ?? utils.readJson(STORAGE_KEY, []);
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
    const saved = utils.readJson(FILTER_STORAGE_KEY, {});
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

  const mergeTags = (currentTags, addedTags) => {
    const merged = [...(Array.isArray(currentTags) ? currentTags : [])];
    const existing = new Set(merged.map((tag) => tag.toLowerCase()));
    addedTags.forEach((tag) => {
      const key = tag.toLowerCase();
      if (existing.has(key)) return;
      merged.push(tag);
      existing.add(key);
    });
    return merged;
  };

  const removeTags = (currentTags, removedTags) => {
    const removeSet = new Set(normalizeTags(Array.isArray(removedTags) ? removedTags.join('，') : removedTags)
      .map((tag) => tag.toLowerCase()));
    if (!removeSet.size) return Array.isArray(currentTags) ? currentTags : [];
    return (Array.isArray(currentTags) ? currentTags : []).filter((tag) => !removeSet.has(String(tag).toLowerCase()));
  };

  const normalizeSkillDate = (value) => {
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

  const escapeSvgText = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const createPlaceholderImage = (title = '') => {
    const label = escapeSvgText(String(title || '待上传图谱').slice(0, 48));
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">',
      '<rect width="720" height="420" fill="#f6f8fc"/>',
      '<rect x="56" y="56" width="608" height="308" rx="18" fill="#ffffff" stroke="#d8e0ef"/>',
      '<path d="M96 286 C160 210 222 262 285 198 C348 134 421 174 478 118 C538 60 596 112 626 82" fill="none" stroke="#2f63f4" stroke-width="7" stroke-linecap="round"/>',
      '<text x="96" y="330" fill="#43526b" font-family="Arial, sans-serif" font-size="24" font-weight="700">Pending spectrum record</text>',
      `<text x="96" y="362" fill="#6f7d95" font-family="Arial, sans-serif" font-size="18">${label}</text>`,
      '</svg>',
    ].join('');
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

  const revealItemInGallery = (item) => {
    state.query = '';
    state.mode = 'ALL';
    state.category = item?.category || '全部';
    state.tag = '全部';
    state.activeId = item?.id || state.activeId;
    if (refs.searchInput) refs.searchInput.value = '';
    syncModeButtons();
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
      <button class="spectrum-filter-btn${active}" type="button" draggable="true" ${attr}="${utils.escapeHtml(value)}">
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
      return `<button class="spectrum-tag-filter${active}" type="button" data-spectrum-tag="${utils.escapeHtml(tag)}">${utils.escapeHtml(tag)} <span>${count}</span></button>`;
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
        <button class="spectrum-selected-thumb" type="button" data-spectrum-open="${utils.escapeHtml(item.id)}">
          <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" loading="lazy" alt="${utils.escapeHtml(item.title)}" />
        </button>
        <button class="spectrum-selected-main" type="button" data-spectrum-open="${utils.escapeHtml(item.id)}">
          <span>${utils.escapeHtml(item.title)}</span>
          <em>${utils.escapeHtml(item.category || item.date || '未填写信息')}</em>
        </button>
        <button class="spectrum-selected-remove" type="button" data-spectrum-remove-selected="${utils.escapeHtml(item.id)}" aria-label="移除已选图谱">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </article>
    `).join('');
  };

  const saveDetailForm = (form, options = {}) => {
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
      delete state.edits[id];
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
    syncGalleryTitleText();
    setGalleryCountText(items.length, selectedCount);
    refs.gallery.className = `spectrum-gallery is-${state.view}`;

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
            <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" loading="lazy" draggable="false" alt="${utils.escapeHtml(item.title)}" />
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
      <button class="spectrum-detail-image" type="button" data-spectrum-preview="${utils.escapeHtml(item.id)}" aria-label="放大查看 ${utils.escapeHtml(item.title)}">
        <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" loading="lazy" alt="${utils.escapeHtml(item.title)}" />
      </button>
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
    const icon = refs.toggleDetailBtn.querySelector('.ti');
    const label = refs.toggleDetailBtn.querySelector('span');
    if (icon) icon.className = `ti ${detailVisible ? 'ti-layout-sidebar-right-collapse' : 'ti-layout-sidebar-right-expand'}`;
    if (label) label.textContent = detailVisible ? '\u6536\u8d77\u8be6\u60c5' : '\u5c55\u5f00\u8be6\u60c5';
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
            <div class="spectrum-detail-modal-subtitle">${utils.escapeHtml(item.title)}</div>
          </div>
          <button class="spectrum-detail-modal-close dialog-close" type="button" data-spectrum-detail-close aria-label="关闭详情">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <button class="spectrum-compact-detail-image" type="button" data-spectrum-preview="${utils.escapeHtml(item.id)}" aria-label="放大查看 ${utils.escapeHtml(item.title)}">
          <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" loading="lazy" alt="${utils.escapeHtml(item.title)}" />
        </button>
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
    refs.galleryCount.textContent = isSpectrumMobileLayout()
      ? `${total}/${selected}`
      : `共 ${total} 张，已选 ${selected} 张`;
  };

  const syncGalleryCountText = () => {
    setGalleryCountText(state.galleryCountTotal, state.galleryCountSelected);
  };

  const syncGalleryTitleText = () => {
    if (!refs.galleryTitle) return;
    const title = String(state.category || '').trim() || '图谱库';
    refs.galleryTitle.textContent = title;
    refs.galleryTitle.title = title;
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

  const getAiItems = () => {
    const selected = getSelectedItems();
    return selected.length ? selected : [getActiveItem()].filter(Boolean);
  };

  const getSelectedAiItems = () => getSelectedItems();

  const getAiImages = (items) => items
    .filter((item) => String(item?.image || '').trim())
    .map((item) => ({
      type: 'image_url',
      image_url: {
        url: item.image,
      },
      preview_url: item.image,
      label: item.title || item.code || '图谱图片',
      meta: [item.spectrumType || item.type, item.category].filter(Boolean).join(' · '),
    }));

  const getSpectrumAiConfig = async () => {
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
      maxTokens: Math.max(Number(saved.maxTokens || defaults.maxTokens || 4096), 1024),
      temperature: Number(saved.temperature ?? defaults.temperature ?? 0.2),
    };
  };

  const getPreviewAiModelInfo = (item) => {
    if (item?.id) {
      restorePreviewAiResult(item.id);
      const ai = previewAiState[item.id];
      if (ai?.model) return `(${ai.model})`;
    }

    const config = App.config?.getFormConfig?.() || App.constants?.DEFAULT_CONFIG || {};
    const model = config.modelChoice || config.model || '';
    return model ? `(${model})` : '';
  };

  const extractJsonPayload = (content) => {
    const text = String(content || '').trim();
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const candidates = [fenced, text].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(candidate.slice(start, end + 1));
          } catch {
            // Keep trying less strict fallbacks.
          }
        }
      }
    }
    return null;
  };

  const normalizeSpectrumAiResult = (payload) => {
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const legacySample = data.sample && typeof data.sample === 'object' && !Array.isArray(data.sample)
      ? data.sample
      : {};
    const inferredSpectrumType = String(
      data.testType
      || legacySample.testType
      || (Array.isArray(data.propertyQueryNames) ? data.propertyQueryNames[2] : ''),
    ).trim().toUpperCase();
    const sourceRows = Array.isArray(data.keyPoints)
      ? data.keyPoints
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.rows)
          ? data.rows
          : [];
    const DSC_EVENT_BY_CURVE = {
      红色: '第一次放热',
      黑色: '第一次吸热',
      蓝色: '第二次吸热',
    };
    const DSC_CURVE_ALIASES = new Map([
      ['红', '红色'],
      ['红色', '红色'],
      ['red', '红色'],
      ['黑', '黑色'],
      ['黑色', '黑色'],
      ['black', '黑色'],
      ['蓝', '蓝色'],
      ['蓝色', '蓝色'],
      ['blue', '蓝色'],
    ]);
    const normalizeDscCurve = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const compact = raw.toLowerCase().replace(/\s+/g, '');
      return DSC_CURVE_ALIASES.get(compact) || raw;
    };
    const keyPoints = sourceRows
      .map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
        const curve = normalizeDscCurve(row.curve || row.channel || row.color || '');
        const rawEvent = String(row.event || row.type || row.category || row.stage || '').trim();
        return {
          label: String(row.label || row.name || row.item || row.parameter || '').trim(),
          value: String(row.value ?? row.result ?? row.measurement ?? '').trim(),
          unit: String(row.unit || '').trim(),
          curve,
          event: inferredSpectrumType === 'DSC' ? (DSC_EVENT_BY_CURVE[curve] || rawEvent) : rawEvent,
          strength: String(row.strength || row.intensity || row.peakStrength || row.relativeIntensity || '').trim(),
          sourceText: String(row.sourceText || row.source || row.note || row.description || '').trim(),
        };
      })
      .filter((row) => row && (row.label || row.value || row.sourceText));
    const rawPropertyQueryNames = Array.isArray(data.propertyQueryNames)
      ? data.propertyQueryNames.map((value) => String(value || '').trim())
      : [];
    const propertyQueryNames = [
      rawPropertyQueryNames[0] || legacySample.name || data.sampleName || legacySample.model || data.modelName || '',
      rawPropertyQueryNames[1] || legacySample.batch || data.batch || '',
      rawPropertyQueryNames[2] || legacySample.testType || data.testType || '',
    ].map((value) => String(value || '').trim());

    return {
      propertyQueryNames,
      keyPoints,
      summary: String(data.summary || '').trim(),
    };
  };

  const getPropertyMatchQuery = (item, aiResult) => {
    const stripExtAndType = (str) => {
      let cleaned = String(str || '').trim();
      // Remove file extensions
      cleaned = cleaned.replace(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?|svg)$/i, '');
      // Remove trailing spectrum type keywords (DSC, TGA, FTIR, DMA)
      cleaned = cleaned.replace(/[\s_-]*(DSC|TGA|FTIR|DMA)\s*$/i, '').trim();
      return cleaned;
    };
    const tokenPattern = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+|[A-Za-z]\d{5,}/g;
    const addTokens = (terms, value) => {
      const cleaned = stripExtAndType(value);
      if (!cleaned) return;
      const tokens = cleaned.match(tokenPattern) || [];
      tokens.forEach((token) => terms.add(token));
    };

    const terms = new Set();
    [
      item?.title,
      item?.code,
      ...(aiResult?.propertyQueryNames || []),
    ].forEach((value) => addTokens(terms, value));

    return Array.from(terms).join(' ');
  };

  const getPropertyBatchMatchQuery = (item, aiResult) => {
    const stripExtAndType = (str) => String(str || '')
      .replace(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?|svg)$/i, '')
      .replace(/[\s_-]*(DSC|TGA|FTIR|DMA)\s*$/i, '')
      .trim();
    const batchPattern = /\b[AB]\d{5,}\b/gi;
    const batches = new Set();
    [
      aiResult?.propertyQueryNames?.[1],
      item?.title,
      item?.code,
      ...(aiResult?.propertyQueryNames || []),
    ].forEach((value) => {
      const cleaned = stripExtAndType(value);
      const matches = cleaned.match(batchPattern) || [];
      matches.forEach((batch) => batches.add(batch.toUpperCase()));
    });
    return Array.from(batches).join(' ');
  };

  const getPropertyMatchResult = (item, aiResult) => {
    const batchQuery = getPropertyBatchMatchQuery(item, aiResult);
    if (batchQuery) {
      const batchResult = App.propertyAnalysis?.getAgentContext?.(batchQuery, { forceCurrentPage: true, exactOnly: true }) || null;
      if (String(batchResult?.displayTable || '').trim()) return batchResult;
    }

    const query = getPropertyMatchQuery(item, aiResult);
    return App.propertyAnalysis?.getAgentContext?.(query, { forceCurrentPage: true, exactOnly: true }) || null;
  };

  const getPreviewSortName = (item) => String(item?.title || item?.code || item?.name || item?.id || '').trim();

  const sortPreviewItemsByName = (items) => [...(items || [])].sort((a, b) => (
    getPreviewSortName(a).localeCompare(getPreviewSortName(b), 'zh-Hans-CN', {
      numeric: true,
      sensitivity: 'base',
    })
  ));

  const markdownTableToHtml = (markdown) => {
    const lines = String(markdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const tables = [];
    let current = [];

    const flush = () => {
      if (current.length >= 2) tables.push(current);
      current = [];
    };

    lines.forEach((line) => {
      if (/^\|.*\|$/.test(line)) current.push(line);
      else flush();
    });
    flush();

    if (!tables.length) return '';

    const tableLines = tables[0];
    const rows = tableLines
      .filter((line) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(line))
      .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
    const headers = (rows.shift() || []).map((cell, index) => cell || `列${index + 1}`);
    if (!headers.length) return '';
    const bodyRows = rows.filter((row) => row.some((cell) => String(cell || '').trim()));
    if (!bodyRows.length) return '';

    return `
      <div class="spectrum-ai-table-wrap spectrum-ai-property-table-wrap">
        <table class="spectrum-ai-table spectrum-ai-property-table">
          <thead><tr>${headers.map((cell) => `<th>${utils.escapeHtml(cell)}</th>`).join('')}</tr></thead>
          <tbody>
            ${bodyRows.map((row) => `<tr>${headers.map((_, index) => `<td>${utils.escapeHtml(row[index] || '-')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const parsePropertyTableHtml = (html) => {
    const source = String(html || '').trim();
    if (!source || typeof document === 'undefined') return null;
    const container = document.createElement('div');
    container.innerHTML = source;
    const table = container.querySelector('table');
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th'))
      .map((cell, index) => cell.textContent?.trim() || `列${index + 1}`);
    if (!headers.length) return null;

    const rows = Array.from(table.querySelectorAll('tbody tr'))
      .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() || '-'))
      .filter((row) => row.some((cell) => String(cell || '').trim() && cell !== '-'));
    if (!rows.length) return null;

    return { headers, rows };
  };

  const getSpectrumEvent = (row, spectrumType = '') => {
    const curve = String(row?.curve || '').trim();
    if (String(spectrumType || '').trim().toUpperCase() === 'DSC') {
      if (curve === '红色') return '第一次放热';
      if (curve === '黑色') return '第一次吸热';
      if (curve === '蓝色') return '第二次吸热';
    }
    return row?.event || curve || '未分类';
  };

  const isFtirSpectrum = (item, aiResult) => {
    const text = [
      item?.spectrumType,
      item?.title,
      item?.code,
      aiResult?.propertyQueryNames?.[2],
    ].filter(Boolean).join(' ').toUpperCase();
    return text.includes('FTIR');
  };

  const normalizeFtirStrength = (...values) => {
    const text = values.map((value) => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
    if (!text) return '未判断';
    if (/(?:very\s*)?strong|intense|high|major|强|强峰|强吸收|很强|高强度/.test(text)) return '强';
    if (/medium|moderate|mid|中|中等|中强/.test(text)) return '中';
    if (/weak|low|minor|small|弱|弱峰|弱吸收|低强度/.test(text)) return '弱';
    if (/shoulder|肩/.test(text)) return '肩峰';
    return text.length <= 8 ? text : '未判断';
  };

  const getFtirPeakPosition = (row) => {
    const value = String(row?.value || '').trim();
    const unit = String(row?.unit || '').trim();
    const sourceText = String(row?.sourceText || '').trim();
    const text = [value, unit, sourceText].filter(Boolean).join(' ');
    const match = text.match(/(\d{3,4}(?:\.\d+)?)\s*(?:cm\s*(?:\^-?1|[-−]1|⁻¹)|cm-1|cm\^-1)?/i);
    if (!match) return null;
    const number = Number(match[1]);
    if (!Number.isFinite(number)) return null;
    const rounded = Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)));
    return {
      number,
      text: `${rounded} cm^-1`,
    };
  };

  const renderFtirExtractTable = (aiResult, item) => {
    const rows = aiResult?.keyPoints || [];
    const peaks = [];
    const seen = new Set();
    rows.forEach((row) => {
      const position = getFtirPeakPosition(row);
      if (!position) return;
      const key = String(Math.round(position.number * 10) / 10);
      if (seen.has(key)) return;
      seen.add(key);
      peaks.push({
        ...position,
        strength: normalizeFtirStrength(row.strength, row.event, row.label, row.sourceText),
      });
    });

    if (!peaks.length) {
      return '<div class="spectrum-ai-empty">暂未提取到 FTIR 特征峰。</div>';
    }

    peaks.sort((a, b) => b.number - a.number);
    const imageName = item?.title || item?.code || aiResult?.propertyQueryNames?.[0] || '-';

    return `
      <div class="spectrum-ai-table-wrap spectrum-ai-ftir-table-wrap">
        <table class="spectrum-ai-table spectrum-ai-keypoint-table spectrum-ai-ftir-table">
          <thead>
            <tr>
              <th class="spectrum-ai-keypoint-image-head">图片名称</th>
              <th class="spectrum-ai-keypoint-project-head">项目</th>
              ${peaks.map((_, index) => `<th>特征峰 ${index + 1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th class="spectrum-ai-keypoint-image-cell" title="${utils.escapeHtml(imageName)}">${utils.escapeHtml(imageName)}</th>
              <th class="spectrum-ai-keypoint-project-cell">峰位/强弱</th>
              ${peaks.map((peak) => `
                <td>
                  <span class="spectrum-ai-ftir-peak">
                    <strong>${utils.escapeHtml(peak.text)}</strong>
                    <em data-ftir-strength="${utils.escapeHtml(peak.strength)}">${utils.escapeHtml(peak.strength)}</em>
                  </span>
                </td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  };

  const renderAiExtractTable = (aiResult, item) => {
    const rows = aiResult?.keyPoints || [];
    if (!rows.length) {
      return '<div class="spectrum-ai-empty">暂未提取到可表格化的信息点。</div>';
    }
    const preferredDscEventOrder = ['第一次放热', '第一次吸热', '第二次吸热'];
    if (isFtirSpectrum(item, aiResult)) {
      return renderFtirExtractTable(aiResult, item);
    }
    const eventOrder = [];
    const groups = new Map();
    rows.forEach((row) => {
      const label = row.label || '-';
      const event = getSpectrumEvent(row, item?.spectrumType || aiResult?.propertyQueryNames?.[2]);
      const valueText = [row.value, row.unit].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || '-';
      if (!eventOrder.includes(event)) eventOrder.push(event);
      if (!groups.has(label)) groups.set(label, new Map());
      const eventValues = groups.get(label).get(event) || [];
      if (!eventValues.includes(valueText)) {
        eventValues.push(valueText);
        groups.get(label).set(event, eventValues);
      }
    });
    if (String(item?.spectrumType || aiResult?.propertyQueryNames?.[2] || '').trim().toUpperCase() === 'DSC') {
      eventOrder.sort((a, b) => {
        const aIndex = preferredDscEventOrder.indexOf(a);
        const bIndex = preferredDscEventOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    }
    const orderedGroups = Array.from(groups.entries());
    const bodyRows = eventOrder.flatMap((event) => {
      const maxRows = Math.max(1, ...orderedGroups.map(([, eventMap]) => (eventMap.get(event) || []).length));
      return Array.from({ length: maxRows }, (_, rowIndex) => ({
        event,
        rowIndex,
        rowSpan: maxRows,
        values: orderedGroups.map(([, eventMap]) => (eventMap.get(event) || [])[rowIndex] || '-'),
      }));
    });
    const imageName = item?.title || item?.code || aiResult?.propertyQueryNames?.[0] || '-';

    return `
      <div class="spectrum-ai-table-wrap">
        <table class="spectrum-ai-table spectrum-ai-keypoint-table">
          <thead>
            <tr>
              <th class="spectrum-ai-keypoint-image-head">图片名称</th>
              <th class="spectrum-ai-keypoint-project-head">项目</th>
              ${orderedGroups.map(([label]) => `<th>${utils.escapeHtml(label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${bodyRows.map((row, index) => `
              <tr>
                ${index === 0 ? `<th class="spectrum-ai-keypoint-image-cell" rowspan="${bodyRows.length}" title="${utils.escapeHtml(imageName)}">${utils.escapeHtml(imageName)}</th>` : ''}
                ${row.rowIndex === 0 ? `<th class="spectrum-ai-keypoint-project-cell" rowspan="${row.rowSpan}">${utils.escapeHtml(row.event)}数值</th>` : ''}
                ${row.values.map((value) => `<td>${utils.escapeHtml(value)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const getPreviewMergeItems = () => sortPreviewItemsByName((refs.previewItems || []).filter((entry) => entry?.id));

  const renderMergedPreviewAiTable = (items) => {
    const analyzedItems = items.map((item) => {
      restorePreviewAiResult(item.id);
      const ai = previewAiState[item.id] || { status: 'idle' };
      return { item, result: ai.status === 'success' ? ai.result : null };
    }).filter((entry) => entry.result?.keyPoints?.length);

    if (!analyzedItems.length) {
      return '<div class="spectrum-ai-empty">暂无可合并的数据。请先点击补全分析，或对单张图谱完成 AI 分析后再查看。</div>';
    }

    const eventColumns = [
      {
        event: '第一次放热',
        tone: 'exotherm-1',
        fields: [
          { label: '峰值温度', aliases: ['峰值温度', '峰温'] },
          { label: '标准焓值', aliases: ['标准焓值', '焓值', 'delta h', 'Δh'] },
          { label: '峰高', aliases: ['峰高', '逢高'] },
          { label: '半峰宽', aliases: ['半峰宽'] },
        ],
      },
      {
        event: '第一次吸热',
        tone: 'endotherm-1',
        fields: [
          { label: '峰值温度', aliases: ['峰值温度', '峰温'] },
          { label: '标准焓值', aliases: ['标准焓值', '焓值', 'delta h', 'Δh'] },
          { label: '峰高', aliases: ['峰高', '逢高'] },
          { label: '半峰宽', aliases: ['半峰宽'] },
          { label: '玻璃化转变温度', aliases: ['玻璃化转变温度', '玻璃化温度', 'tg'] },
        ],
      },
      {
        event: '第二次吸热',
        tone: 'endotherm-2',
        fields: [
          { label: '峰值温度', aliases: ['峰值温度', '峰温'] },
          { label: '标准焓值', aliases: ['标准焓值', '焓值', 'delta h', 'Δh'] },
          { label: '峰高', aliases: ['峰高', '逢高'] },
          { label: '半峰宽', aliases: ['半峰宽'] },
        ],
      },
    ];

    const getFieldValue = (eventMap, eventName, field) => {
      const labelMap = eventMap.get(eventName);
      if (!labelMap) return '-';
      const aliases = field.aliases.map((alias) => String(alias).toLowerCase());
      const values = [];
      labelMap.forEach((labelValues, label) => {
        const normalizedLabel = String(label || '').toLowerCase();
        const matched = aliases.some((alias) => normalizedLabel === alias || normalizedLabel.includes(alias) || alias.includes(normalizedLabel));
        if (!matched) return;
        labelValues.forEach((value) => {
          if (!values.includes(value)) values.push(value);
        });
      });
      return values.length ? values.join(' / ') : '-';
    };

    const itemRows = analyzedItems.map(({ item, result }) => {
      const eventMap = new Map();
      result.keyPoints.forEach((row) => {
        const label = row.label || '-';
        const event = getSpectrumEvent(row, item?.spectrumType || result?.propertyQueryNames?.[2]);
        const valueText = [row.value, row.unit].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || '-';
        if (!eventMap.has(event)) eventMap.set(event, new Map());
        const labelMap = eventMap.get(event);
        const labelValues = labelMap.get(label) || [];
        if (!labelValues.includes(valueText)) labelValues.push(valueText);
        labelMap.set(label, labelValues);
      });

      return {
        imageName: item.title || item.code || result.propertyQueryNames?.[0] || '-',
        cells: eventColumns.flatMap((eventColumn) => (
          eventColumn.fields.map((field) => ({
            tone: eventColumn.tone,
            value: getFieldValue(eventMap, eventColumn.event, field),
          }))
        )),
      };
    }).filter((row) => row.cells.some((cell) => cell.value !== '-'));

    if (!itemRows.length) {
      return '<div class="spectrum-ai-empty">暂无可合并的数据。请先点击补全分析，或对单张图谱完成 AI 分析后再查看。</div>';
    }

    return `
      <div class="spectrum-ai-table-wrap spectrum-ai-merged-table-wrap">
        <table class="spectrum-ai-table spectrum-ai-keypoint-table spectrum-ai-merged-table spectrum-ai-pivot-table">
          <colgroup>
            <col class="spectrum-ai-image-col">
            ${eventColumns.flatMap((eventColumn) => eventColumn.fields.map(() => `<col class="spectrum-ai-value-col is-${eventColumn.tone}">`)).join('')}
          </colgroup>
          <thead>
            <tr>
              <th class="spectrum-ai-keypoint-image-head" rowspan="2">图片名称</th>
              ${eventColumns.map((eventColumn) => `<th class="spectrum-ai-event-head is-${eventColumn.tone}" colspan="${eventColumn.fields.length}">${utils.escapeHtml(eventColumn.event)}</th>`).join('')}
            </tr>
            <tr>
              ${eventColumns.flatMap((eventColumn) => (
                eventColumn.fields.map((field) => `<th class="spectrum-ai-field-head is-${eventColumn.tone}">${utils.escapeHtml(field.label)}</th>`)
              )).join('')}
            </tr>
          </thead>
          <tbody>
            ${itemRows.map((row) => `
              <tr>
                <th class="spectrum-ai-keypoint-image-cell" title="${utils.escapeHtml(row.imageName)}">${utils.escapeHtml(row.imageName)}</th>
                ${row.cells.map((cell) => `<td class="spectrum-ai-value-cell is-${cell.tone}">${utils.escapeHtml(cell.value)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderMergedPreviewPropertyTables = (items) => {
    const entries = items.map((item) => {
      restorePreviewAiResult(item.id);
      const ai = previewAiState[item.id] || { status: 'idle' };
      const propertyResult = getPropertyMatchResult(item, ai.result || null);
      const propertyTableHtml = markdownTableToHtml(propertyResult?.displayTable || '')
        || String(ai.propertyTableHtml || '');
      return {
        item,
        imageName: item.title || item.code || ai.result?.propertyQueryNames?.[0] || '-',
        table: parsePropertyTableHtml(propertyTableHtml),
      };
    }).filter((entry) => entry.table?.headers?.length && entry.table?.rows?.length);

    if (!entries.length) {
      return '<div class="spectrum-ai-empty">物性表暂无匹配结果，确认物性分析数据已加载后可重新分析。</div>';
    }

    const headers = [];
    entries.forEach(({ table }) => {
      table.headers.slice(1).forEach((header) => {
        if (!headers.includes(header)) headers.push(header);
      });
    });

    return `
      <div class="spectrum-ai-table-wrap spectrum-ai-property-table-wrap spectrum-ai-merged-property-table-wrap">
        <table class="spectrum-ai-table spectrum-ai-property-table spectrum-ai-merged-property-table">
          <thead>
            <tr>
              ${headers.map((header) => `<th>${utils.escapeHtml(header)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${entries.map(({ table }) => {
              const headerIndex = new Map(table.headers.map((header, index) => [header, index]));
              return table.rows.map((row) => `
                <tr>
                  ${headers.map((header) => `<td>${utils.escapeHtml(row[headerIndex.get(header)] || '-')}</td>`).join('')}
                </tr>
              `).join('');
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const getMergedPreviewAiJsonText = (items) => {
    const payload = items.map((item) => {
      restorePreviewAiResult(item.id);
      const ai = previewAiState[item.id] || { status: 'idle' };
      return {
        id: item.id,
        title: item.title || item.code || '',
        spectrumType: item.spectrumType || '',
        category: item.category || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        status: ai.status || 'idle',
        error: ai.error || '',
        result: ai.result || null,
      };
    });
    return JSON.stringify(payload, null, 2);
  };

  const renderPreviewAiMergeContent = (items, stats) => {
    if (previewAiMergeViewMode === 'json') {
      return `<pre class="spectrum-ai-json-view" aria-label="合并 AI JSON 分析结果"><code>${utils.escapeHtml(getMergedPreviewAiJsonText(items))}</code></pre>`;
    }

    return `
      ${stats.missingCount ? `<div class="spectrum-ai-empty">还有 ${stats.missingCount} 张图谱没有 AI 提取结果，点击“补全分析”后会逐张分析并自动合并。</div>` : ''}
      <div class="spectrum-ai-section-title">合并关键数据</div>
      ${renderMergedPreviewAiTable(items)}
      <div class="spectrum-ai-section-title">匹配物性参数</div>
      ${renderMergedPreviewPropertyTables(items)}
      ${stats.errorItems.length ? `
        <div class="spectrum-ai-error">以下图谱分析失败：${utils.escapeHtml(stats.errorItems.map((entry) => entry.title || entry.code || entry.id).join('、'))}</div>
      ` : ''}
    `;
  };

  const renderPreviewAiMergePanel = (item, items) => {
    const states = items.map((entry) => {
      restorePreviewAiResult(entry.id);
      return previewAiState[entry.id] || { status: 'idle' };
    });
    const successCount = states.filter((ai) => ai.status === 'success' && ai.result).length;
    const busy = previewAiMergeRunning || states.some((ai) => ai.status === 'loading' || ai.status === 'streaming');
    const missingCount = states.filter((ai) => ai.status !== 'success' || !ai.result).length;
    const errorItems = items.filter((entry) => previewAiState[entry.id]?.status === 'error');
    const stats = { successCount, missingCount, errorItems };
    const useJsonLayout = previewAiMergeViewMode === 'json';
    const runLabel = busy ? '合并中' : (missingCount ? '补全分析' : '重新分析全部');

    return `
      <section class="spectrum-ai-extract-panel${useJsonLayout ? ' is-json-view' : ''}" aria-label="AI 合并分析">
        <div class="spectrum-ai-extract-head">
          <div>
            <div class="spectrum-ai-extract-subtitle">当前合并 ${items.length} 张图谱，正在显示跨图谱对比数据</div>
          </div>
          <div class="spectrum-ai-head-actions">
            <div class="spectrum-ai-view-toggle" role="tablist" aria-label="AI 合并结果显示模式">
              <button class="${previewAiMergeViewMode === 'json' ? '' : 'is-active'}" type="button" data-spectrum-ai-view="table" role="tab" aria-selected="${previewAiMergeViewMode === 'json' ? 'false' : 'true'}">表格</button>
              <button class="${previewAiMergeViewMode === 'json' ? 'is-active' : ''}" type="button" data-spectrum-ai-view="json" role="tab" aria-selected="${previewAiMergeViewMode === 'json' ? 'true' : 'false'}">JSON</button>
            </div>
            <button class="analysis-toolbar-btn spectrum-ai-merge-btn is-active" type="button" data-spectrum-ai-merge-toggle>
              <i class="ti ti-layout-grid" aria-hidden="true"></i>
              <span>单图分析</span>
            </button>
            <button class="analysis-toolbar-btn analysis-toolbar-btn-primary spectrum-ai-extract-btn" type="button" data-spectrum-ai-merge-run="${missingCount ? 'missing' : 'all'}" ${busy ? 'disabled' : ''}>
              <i class="ti ${busy ? 'ti-loader-2' : 'ti-sparkles'}" aria-hidden="true"></i>
              <span>${runLabel}</span>
            </button>
          </div>
        </div>
        <div class="spectrum-ai-extract-body${useJsonLayout ? ' is-json-view' : ''}">
          ${renderPreviewAiMergeContent(items, stats)}
        </div>
      </section>
    `;
  };

  const getAiJsonText = (ai) => {
    const raw = String(ai?.rawText || ai?.streamText || '').trim();
    if (raw) {
      const payload = extractJsonPayload(raw);
      if (payload) {
        try { return JSON.stringify(normalizeSpectrumAiResult(payload), null, 2); } catch { /* fall through */ }
      }
      return raw;
    }
    if (ai?.result) {
      try { return JSON.stringify(normalizeSpectrumAiResult(ai.result), null, 2); } catch { /* fall through */ }
    }
    return '正在连接模型...';
  };

  const renderPreviewAiContent = (ai, item, propertyHtml, hasResult) => {
    const viewMode = ai.viewMode === 'json' ? 'json' : 'table';
    const streamingRawJson = ai.status === 'streaming' && !hasResult;
    if (viewMode === 'json' || streamingRawJson) {
      const ariaLabel = streamingRawJson ? 'AI JSON 实时分析输出' : 'AI JSON 分析结果';
      return `<pre class="spectrum-ai-json-view${streamingRawJson ? ' is-streaming' : ''}" aria-label="${ariaLabel}"${streamingRawJson ? ' aria-live="polite"' : ''}><code>${utils.escapeHtml(getAiJsonText(ai))}</code></pre>`;
    }
    return `
      <div class="spectrum-ai-section-title">关键信息表</div>
      ${renderAiExtractTable(ai.result, item)}
      ${ai.status === 'streaming' ? '<div class="spectrum-ai-streaming-hint">AI 仍在输出中，结果持续更新…</div>' : ''}
      <div class="spectrum-ai-section-title">匹配物性参数</div>
      ${propertyHtml || '<div class="spectrum-ai-empty">物性表暂无匹配结果，确认物性分析数据已加载后可重新分析。</div>'}
    `;
  };

  const renderPreviewAiPanel = (item) => {
    const previewItems = getPreviewMergeItems();
    const canMerge = previewItems.length > 1;
    if (previewAiMergeMode && canMerge) {
      return renderPreviewAiMergePanel(item, previewItems);
    }

    restorePreviewAiResult(item.id);
    const ai = previewAiState[item.id] || { status: 'idle' };
    const busy = ai.status === 'loading' || ai.status === 'streaming';
    const resultVisible = ai.status === 'success' || ai.status === 'error' || ai.status === 'streaming';
    const propertyHtml = ai.propertyTableHtml || '';
    const buttonLabel = ai.status === 'streaming' ? '接收中'
      : (busy ? '分析中' : (ai.status === 'success' ? '重新分析' : 'AI 分析'));
    const hasResult = Boolean(ai.result && ai.result?.keyPoints?.length);
    const useJsonLayout = ai.viewMode === 'json' || (ai.status === 'streaming' && !hasResult);
    return `
      <section class="spectrum-ai-extract-panel${useJsonLayout ? ' is-json-view' : ''}" aria-label="AI 信息提取">
        <div class="spectrum-ai-extract-head">
          <div></div>
          <div class="spectrum-ai-head-actions">
            ${resultVisible ? `
              <div class="spectrum-ai-view-toggle" role="tablist" aria-label="AI 结果显示模式">
                <button class="${ai.viewMode === 'json' ? '' : 'is-active'}" type="button" data-spectrum-ai-view="table" role="tab" aria-selected="${ai.viewMode === 'json' ? 'false' : 'true'}">表格</button>
                <button class="${ai.viewMode === 'json' ? 'is-active' : ''}" type="button" data-spectrum-ai-view="json" role="tab" aria-selected="${ai.viewMode === 'json' ? 'true' : 'false'}">JSON</button>
              </div>
            ` : ''}
            ${canMerge ? `
              <button class="analysis-toolbar-btn spectrum-ai-merge-btn" type="button" data-spectrum-ai-merge-toggle>
                <i class="ti ti-layout-grid" aria-hidden="true"></i>
                <span>合并分析</span>
              </button>
            ` : ''}
            <button class="analysis-toolbar-btn analysis-toolbar-btn-primary spectrum-ai-extract-btn" type="button" data-spectrum-ai-extract="${utils.escapeHtml(item.id)}" ${busy ? 'disabled' : ''}>
              <i class="ti ${busy ? 'ti-loader-2' : 'ti-sparkles'}" aria-hidden="true"></i>
              <span>${buttonLabel}</span>
            </button>
          </div>
        </div>
        ${resultVisible ? `
          <div class="spectrum-ai-extract-body${useJsonLayout ? ' is-json-view' : ''}">
            ${ai.status === 'error' ? `<div class="spectrum-ai-error">${utils.escapeHtml(ai.error || 'AI 分析失败，请检查模型配置后重试。')}</div>` : `
              ${renderPreviewAiContent(ai, item, propertyHtml, hasResult)}
            `}
          </div>
        ` : ''}
      </section>
    `;
  };

  const getPreviewAiScrollTarget = (panel) => (
    panel?.querySelector('.spectrum-ai-json-view')
    || panel?.querySelector('.spectrum-ai-extract-body')
    || null
  );

  const syncPreviewAiScroll = (panel, previousScroll, followBottom = false) => {
    const target = getPreviewAiScrollTarget(panel);
    if (!target) return;

    target.scrollLeft = previousScroll?.left || 0;
    target.scrollTop = followBottom
      ? target.scrollHeight
      : Math.min(previousScroll?.top || 0, target.scrollHeight);
  };

  const updatePreviewAiPanelInPlace = (id) => {
    if (!refs.previewDialog) return;
    if (refs.previewActiveId !== id) {
      const belongsToMerge = previewAiMergeMode && (refs.previewItems || []).some((entry) => entry.id === id);
      if (!belongsToMerge) return;
    }
    const panel = refs.previewDialog.querySelector('.spectrum-ai-extract-panel');
    if (!panel) return;
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    const scrollTarget = getPreviewAiScrollTarget(panel);
    const previousScroll = scrollTarget ? {
      top: scrollTarget.scrollTop,
      left: scrollTarget.scrollLeft,
      stickToBottom: scrollTarget.scrollHeight - scrollTarget.scrollTop - scrollTarget.clientHeight <= 64,
    } : null;
    const shouldFollowBottom = previewAiState[id]?.status === 'streaming' || Boolean(previousScroll?.stickToBottom);
    panel.outerHTML = renderPreviewAiPanel(item);
    window.requestAnimationFrame(() => {
      const nextPanel = refs.previewDialog?.querySelector('.spectrum-ai-extract-panel');
      syncPreviewAiScroll(nextPanel, previousScroll, shouldFollowBottom);
    });
  };

  const parseSSEChunk = (chunk) => {
    const lines = String(chunk || '').split(/\r?\n/);
    const results = [];
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try { results.push(JSON.parse(payload)); } catch { /* skip malformed */ }
    }
    return results;
  };

  const progressiveExtract = (rawText) => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return null;
    const payload = extractJsonPayload(trimmed);
    if (!payload) return null;
    try { return normalizeSpectrumAiResult(payload); } catch { return null; }
  };

  const runPreviewAiExtract = async (id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item || !item.image) return;

    const config = await getSpectrumAiConfig();
    const model = config.modelChoice || config.model || '';
    const isLocal = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i.test(config.baseUrl || '');
    if (!config.baseUrl || !model) {
      previewAiState[id] = {
        status: 'error',
        error: '请先在配置中心选择可用于图像理解的模型。',
        model,
        modelSource: config.modelSource,
      };
      renderImagePreview();
      return;
    }
    if (!config.apiKey && !isLocal) {
      previewAiState[id] = {
        status: 'error',
        error: '请先在配置中心填写模型 API 密钥，或切换到 LM Studio 本地模型。',
        model,
        modelSource: config.modelSource,
      };
      renderImagePreview();
      return;
    }

    const previousViewMode = previewAiState[id]?.viewMode === 'json' ? 'json' : 'table';
    previewAiState[id] = { status: 'streaming', model, modelSource: config.modelSource, streamText: '', viewMode: previousViewMode };
    renderImagePreview();

    const spectrumType = item.spectrumType || '未知';
    const buildPrompt = () => {
      const base = [
        '你是材料热分析图谱信息抽取器。请只分析用户提供的这一张图谱图片。',
        '必须只返回一个合法 JSON 对象，不要 Markdown，不要解释，不要包裹代码块。',
      ];

      if (spectrumType === 'DSC') {
        base.push(
          '这是一张 DSC（差示扫描量热）图谱。曲线颜色含义如下：',
          '  - 红色曲线 → 第一次放热（First Exothermic）',
          '  - 黑色曲线 → 第一次吸热（First Endothermic）',
          '  - 蓝色曲线 → 第二次吸热（Second Endothermic）',
          '',
          '请先按颜色把三条曲线严格分开，再分别提取每条曲线上的所有可见吸热峰/放热峰，而不是只提取一个“主要峰”。',
          '对每一个独立峰都分别提取以下信息：',
          '  1. 峰值温度（℃）—— 当前这个峰的最高点温度',
          '  2. 标准焓值（J/g）—— 当前这个峰自身峰面积的积分热量，即标准吸热量或放热量，不是总系热量',
          '  3. 峰高（mW 或 W/g）—— 当前这个峰顶点到基线的垂直高度',
          '  4. 半峰宽（℃）—— 当前这个峰在峰高一半处的峰宽度',
          '',
          '额外要求：黑色曲线（第一次吸热）还需提取玻璃化转变温度 Tg（℃），读取转折区中点温度。',
          '',
          '提取原则：',
          '- 每条曲线可能有多个峰；图中凡是已经标注出的峰，都必须逐个输出，不能因为同属一条曲线就合并、遗漏或只保留最显著的一个',
          '- 同一个峰的多项指标必须保持相同的 curve 与 event；不同峰即使 label 相同，也要分别作为独立行输出',
          '- 先依据颜色确定归属，再读取对应颜色附近的文字标注；禁止把黑色曲线的峰填到蓝色曲线，或把蓝色曲线的峰填到黑色曲线',
          '- 判断峰属于哪条曲线时，只能依据“峰连接到哪一条连续母曲线/基线”来判断，不能依据峰区填充颜色、阴影颜色、标注文字颜色来判断',
          '- 黑色曲线上的峰即使使用绿色、紫色或其他颜色做积分填充/文字标注，也仍然属于黑色曲线（第一次吸热）',
          '- 蓝色曲线是图中下方那条连续蓝线；只有真正连接在蓝色母曲线上的峰，才允许归为第二次吸热',
          '- 若某个峰的标注颜色与母曲线颜色不一致，必须优先服从母曲线颜色，不要被积分区配色误导',
          '- 颜色与事件的绑定是硬规则：红色只能是第一次放热，黑色只能是第一次吸热，蓝色只能是第二次吸热；若图中文字与颜色冲突，以颜色为准',
          '- 不要提取无用的额外信息，只聚焦上述指标',
          '- 焓值必须取单条曲线单个峰的积分热量（标准吸放热量），严禁填写总系热量或全部峰的总积分值',
          '- 如果图中显示了每一段的标准焓值（比如 Peak: xxx℃, Delta H: xxx J/g），请优先使用图中的标注值',
          '- 数值尽量从图面标注或坐标轴读取，无法确定则填空字符串',
          '- 每个峰的每个指标作为独立一行输出',
          '- curve 字段填颜色中文：红色 / 黑色 / 蓝色',
          '- event 字段填：第一次放热 / 第一次吸热 / 第二次吸热',
          '- 表中看不到的信息就不要编造，留空即可',
        );
      } else if (spectrumType === 'FTIR') {
        base.push(
          '这是 FTIR（傅里叶变换红外光谱）图片。请只提取图片上已经标注出来的全部特征峰。',
          'FTIR 提取要求：',
          '- 必须逐个列出图片中可见的所有蓝色峰位标注，不要只提取主峰，不要遗漏弱峰、小峰或肩峰',
          '- value 字段只填写峰位数字，例如 3068；unit 字段填写 cm^-1',
          '- strength 字段必须判断该峰强弱，只能填写：强 / 中 / 弱 / 肩峰',
          '- 强弱依据峰高、峰面积和视觉显著程度判断；最高或最尖锐的一组为强，明显但非最高为中，小峰或浅峰为弱，肩部凸起为肩峰',
          '- label 字段统一填写“特征峰位置”',
          '- event 字段填写“FTIR特征峰”',
          '- sourceText 字段填写图中对应的原始峰位标注，例如 3068 cm^-1',
          '- 按图片从左到右的峰位顺序输出；如果无法判断强弱，也要填写最接近的强/中/弱，不要留空',
        );
      } else if (spectrumType === 'TGA') {
        base.push(
          '这是一张 TGA（热重分析）图谱。请提取：',
          '  1. 各失重阶段的起始温度、终止温度、失重率（%）',
          '  2. DTG 峰值温度（如有）',
          '  3. 残留质量（%）',
          '- curve 字段填颜色中文或曲线标识',
          '- event 字段填：失重阶段1 / 失重阶段2 / ...',
        );
      } else {
        base.push(
          '请提取图中可见的所有热分析关键信息点。',
          '- curve 字段填颜色或曲线标识',
          '- event 字段填对应的热事件类型',
        );
      }

      base.push(
        '',
        '固定 JSON schema：',
        '{',
        '  "propertyQueryNames": ["样品名称/牌号（如 320G6-B11）", "批次号（如 A605283，没有则为空字符串）", "测试类型（DSC/TGA/DMA/未知）"],',
        '  "keyPoints": [',
        '    {',
        '      "label": "中文字段名（如 峰值温度、焓值、峰高、半峰宽、玻璃化转变温度）",',
        '      "value": "数值",',
        '      "unit": "℃ / J/g / mJ / mW / W/g / %",',
        '      "curve": "红色 / 黑色 / 蓝色",',
        '      "event": "第一次放热 / 第一次吸热 / 第二次吸热 / 失重阶段1 / ...",',
        '      "strength": "FTIR 峰强弱：强 / 中 / 弱 / 肩峰；非 FTIR 可为空",',
        '      "sourceText": "图中对应原文，尽量短"',
        '    }',
        '  ],',
        '  "summary": "一句话总结图谱主要特征"',
        '}',
        '注意：schema 中不要 sample 字段，不要 model 字段，不要 field 字段，不要 confidence 字段。',
        'propertyQueryNames 只能输出三个值，顺序固定为：名称/牌号、批次、测试类型。',
        '每个指标一行，不要合并多项数据到一行。',
        `当前图谱标题：${item.title || item.code || '-'}`,
        `当前图谱类型：${spectrumType}`,
      );

      return base.join('\n');
    };

    const prompt = buildPrompt();

    const startTime = Date.now();
    let accumulatedText = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE_MS = 150;

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config?.getRequestHeaders?.(config) || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: item.image } },
            ],
          }],
          temperature: 0.1,
          max_tokens: Math.max(Number(config.maxTokens) || 4096, 2048),
          stream: true,
        }),
      });

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
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';

        for (const block of parts) {
          const events = parseSSEChunk(block);
          for (const evt of events) {
            const delta = evt?.choices?.[0]?.delta?.content;
            if (delta) accumulatedText += delta;
          }
        }

        previewAiState[id].streamText = accumulatedText;
        const partialResult = progressiveExtract(accumulatedText);
        if (partialResult) {
          previewAiState[id].result = partialResult;
          previewAiState[id].rawText = accumulatedText;
        }

        const now = Date.now();
        if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
          lastRenderTime = now;
          updatePreviewAiPanelInPlace(id);
        }
      }

      const rawText = accumulatedText.trim();
      const payload = extractJsonPayload(rawText);
      const result = normalizeSpectrumAiResult(payload);
      const propertyResult = getPropertyMatchResult(item, result);
      const propertyTableHtml = markdownTableToHtml(propertyResult?.displayTable || '');

      const nextAiState = {
        status: 'success',
        result,
        rawText,
        propertyTableHtml,
        model,
        modelSource: config.modelSource,
        viewMode: previewAiState[id]?.viewMode === 'json' ? 'json' : 'table',
        updatedAt: new Date().toISOString(),
      };
      previewAiState[id] = nextAiState;
      savePreviewAiResult(id, nextAiState);
      App.aiCallAnalysis?.record?.({
        id: `spectrum-preview-ai-${Date.now()}`,
        source: 'spectrum-preview-ai-extract',
        status: 'success',
        endpoint: `${config.baseUrl}/chat/completions`,
        model,
        duration: Date.now() - startTime,
        createdAt: new Date().toISOString(),
        usage: null,
        meta: {
          itemId: id,
          itemTitle: item.title || item.code || '',
          extractedRows: result.keyPoints.length,
        },
      });
    } catch (error) {
      previewAiState[id] = {
        status: 'error',
        error: error?.message || 'AI 分析失败，请稍后重试。',
        model,
        modelSource: config.modelSource,
        viewMode: previewAiState[id]?.viewMode === 'json' ? 'json' : 'table',
      };
      App.aiCallAnalysis?.record?.({
        id: `spectrum-preview-ai-${Date.now()}`,
        source: 'spectrum-preview-ai-extract',
        status: 'error',
        endpoint: `${config.baseUrl}/chat/completions`,
        model,
        duration: Date.now() - startTime,
        createdAt: new Date().toISOString(),
        error: error?.message || String(error || ''),
        meta: { itemId: id, itemTitle: item.title || item.code || '' },
      });
    }

    updatePreviewAiPanelInPlace(id);
  };

  const runPreviewAiMergeAnalysis = async (mode = 'missing') => {
    const items = getPreviewMergeItems().filter((item) => item?.image);
    if (!items.length || previewAiMergeRunning) return;

    const targets = mode === 'all'
      ? items
      : items.filter((item) => {
        restorePreviewAiResult(item.id);
        const ai = previewAiState[item.id] || { status: 'idle' };
        return ai.status !== 'success' || !ai.result;
      });

    if (!targets.length) {
      renderImagePreview();
      return;
    }

    previewAiMergeRunning = true;
    renderImagePreview();
    try {
      for (const target of targets) {
        await runPreviewAiExtract(target.id);
        if (previewAiMergeMode && refs.previewDialog) renderImagePreview();
      }
    } finally {
      previewAiMergeRunning = false;
      if (previewAiMergeMode && refs.previewDialog) renderImagePreview();
    }
  };

  const getAiContext = () => {
    const items = getSelectedAiItems();
    const filtered = getFilteredItems();
    const lines = [
      '【当前图谱分析上下文】',
      `图谱总数：${state.items.length}`,
      `当前筛选后：${filtered.length} 张`,
      `已选图谱：${state.selectedIds.size} 张`,
      `类型模式：${state.mode}`,
      `分类筛选：${state.category}`,
      `标签筛选：${state.tag}`,
      `关键词：${state.query.trim() || '无'}`,
    ];

    if (!items.length) {
      lines.push('当前图谱分析页面没有选中图谱。请提示用户先选择需要上传给 AI 的图谱图片，再发送问题。');
      return lines.join('\n');
    }

    if (items.length) {
      lines.push('待分析图谱：');
      items.slice(0, 8).forEach((item, index) => {
        lines.push(`${index + 1}. ${item.title}；类型=${item.spectrumType || '-'}；分类=${item.category || '-'}；标签=${item.tags.join('、') || '-'}；备注=${item.note || '-'}`);
      });
      if (items.length > 8) lines.push(`还有 ${items.length - 8} 张图谱未展开。`);
    }

    return lines.join('\n');
  };

  const normalizeAgentText = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const isStructuredSpectrumQuery = (value) => /[a-z0-9]+(?:[-_/][a-z0-9]+)+/i.test(String(value || ''));
  const compactStructuredSpectrumText = (value) => normalizeAgentText(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');

  const getStructuredSpectrumTerms = (value) => (String(value || '').match(/[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+)+/g) || [])
    .map(normalizeAgentText)
    .filter(Boolean);

  const extractAgentTerms = (question = '') => {
    const text = String(question || '');
    const terms = [
      ...(text.match(/[A-Za-z0-9][A-Za-z0-9._/-]{1,}/g) || []),
      ...(text.match(/[\u4e00-\u9fa5]{2,}/g) || []),
    ];
    return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))];
  };

  const getItemSearchText = (item) => normalizeAgentText([
    item?.title,
    item?.code,
    item?.spectrumType,
    item?.category,
    item?.status,
    item?.date,
    item?.note,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].filter(Boolean).join(' '));

  const matchesStructuredSpectrumTerm = (item, term) => {
    const normalizedTerm = normalizeAgentText(term);
    const itemText = getItemSearchText(item);
    if (itemText.includes(normalizedTerm)) return true;
    const compactTerm = compactStructuredSpectrumText(normalizedTerm);
    if (!compactTerm) return false;
    return compactStructuredSpectrumText(itemText).includes(compactTerm);
  };

  const scoreAgentItem = (item, terms) => {
    if (!terms.length) return 0;
    const itemText = getItemSearchText(item);
    return terms.reduce((score, term) => {
      const normalizedTerm = normalizeAgentText(term);
      if (!normalizedTerm) return score;
      if (itemText.includes(normalizedTerm)) return score + (isStructuredSpectrumQuery(normalizedTerm) ? 6 : 3);
      if (isStructuredSpectrumQuery(normalizedTerm)) {
        return matchesStructuredSpectrumTerm(item, normalizedTerm) ? score + 5 : score;
      }
      if (normalizedTerm.length >= 4 && itemText.includes(normalizedTerm.slice(0, Math.max(3, Math.floor(normalizedTerm.length * 0.7))))) return score + 1;
      return score;
    }, 0);
  };

  const formatAgentItems = (items, limit = 8) => items.slice(0, limit).map((item, index) => (
    `${index + 1}. ${item.title || item.code || '未命名图谱'}；类型=${item.spectrumType || '-'}；分类=${item.category || '-'}；标签=${Array.isArray(item.tags) && item.tags.length ? item.tags.join('、') : '-'}；日期=${item.date || '-'}；备注=${item.note || '-'}`
  ));

  const getAgentItems = (question = '', options = {}) => {
    const selected = getSelectedItems();
    if (selected.length) return { items: selected, reason: '使用当前已选图谱' };

    const terms = extractAgentTerms(question);
    const structuredTerms = terms.map(normalizeAgentText).filter(isStructuredSpectrumQuery);
    const scored = state.items
      .map((item) => ({ item, score: scoreAgentItem(item, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
    const structuredMatches = structuredTerms.length
      ? scored.filter((item) => structuredTerms.some((term) => matchesStructuredSpectrumTerm(item, term)))
      : [];
    if (structuredMatches.length) return { items: structuredMatches, reason: '根据结构化编号匹配图谱库' };
    if (scored.length) return { items: scored, reason: '根据问题关键词匹配图谱库' };

    const active = getActiveItem();
    if (active) return { items: [active], reason: '未命中关键词，使用当前激活图谱' };

    const filtered = getFilteredItems();
    return {
      items: filtered,
      reason: options.forceCurrentPage ? '使用当前图谱筛选结果' : '提供图谱库概览',
    };
  };

  const getAgentContext = (question = '', options = {}) => {
    const filtered = getFilteredItems();
    const { items, reason } = getAgentItems(question, options);
    const lines = [
      '【图谱分析检索结果】',
      `命中原因：${reason}`,
      `图谱总数：${state.items.length}；当前筛选后：${filtered.length}；已选图谱：${state.selectedIds.size}。`,
      `类型模式：${state.mode}；分类筛选：${state.category}；标签筛选：${state.tag}；关键词：${state.query.trim() || '无'}。`,
    ];

    if (!items.length) {
      lines.push('当前没有可检索的图谱数据。');
    } else {
      lines.push('相关图谱元数据（最多 8 张）：', ...formatAgentItems(items, 8));
    }

    return {
      title: '图谱分析',
      reason,
      content: lines.join('\n'),
      score: options.forceCurrentPage ? 8 : (items.length ? 6 : 0),
      stats: {
        selected: state.selectedIds.size,
        matched: items.length,
        filtered: filtered.length,
      },
    };
  };

  const getAgentImages = (question = '', options = {}) => {
    const text = String(question || '').trim();
    const asksAboutPage = /(?:这个|当前|本|该)?(?:页面|模块|功能|系统|项目|网站|应用|平台)|做什么|是什么|用途|作用|介绍|说明|怎么用|如何使用/.test(text);
    const asksToAnalyzeMedia = /(?:分析|看看|识别|读取|提取|对比|判断).*(?:图谱|谱图|曲线|图片|图像|dsc|tga|峰|峰值|温区|失重)|(?:图谱|谱图|曲线|图片|图像).*(?:分析|识别|读取|提取|对比|判断)|分析这张|看这张|当前图/.test(text);
    if (asksAboutPage && !asksToAnalyzeMedia) return [];
    const selected = getSelectedItems();
    if (selected.length) return getAiImages(selected);
    const explicitCurrentImageIntent = /(?:当前图谱|当前图片|当前这张|这张图谱|这张图片|分析这张|看这张|当前图)/.test(text);
    if (explicitCurrentImageIntent) {
      const active = getActiveItem();
      return active ? getAiImages([active]) : [];
    }
    const shouldAttach = /(?:图谱|图片|图像|曲线|谱图)/.test(text);
    if (!shouldAttach) return [];
    return getAiImages(getAgentItems(question, { ...options, forceCurrentPage: false }).items);
  };

  const normalizeSkillText = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const scoreSkillItem = (item, query) => {
    const normalizedQuery = normalizeSkillText(query);
    const text = getItemSearchText(item);
    if (!normalizedQuery) return 0;
    const isStructuredQuery = isStructuredSpectrumQuery(normalizedQuery);
    const structuredTerms = getStructuredSpectrumTerms(query);
    const exactValues = [item.id, item.code, item.title]
      .map(normalizeSkillText)
      .filter(Boolean);
    const compactValues = exactValues.map(compactStructuredSpectrumText).filter(Boolean);
    const scoreStructuredTerm = (term) => {
      const normalizedTerm = normalizeSkillText(term);
      if (!normalizedTerm) return 0;
      if (exactValues.includes(normalizedTerm)) return 100;
      if (exactValues.some((value) => value.includes(normalizedTerm))) return 96;
      const compactTerm = compactStructuredSpectrumText(normalizedTerm);
      if (compactTerm && compactValues.some((value) => value.includes(compactTerm) || compactTerm.includes(value))) return 94;
      return matchesStructuredSpectrumTerm(item, normalizedTerm) ? 90 : 0;
    };
    const structuredScore = structuredTerms.reduce((score, term) => Math.max(score, scoreStructuredTerm(term)), 0);
    if (structuredScore) return structuredScore;
    if (exactValues.includes(normalizedQuery)) return 100;
    if (exactValues.some((value) => value.includes(normalizedQuery))) return isStructuredQuery ? 96 : 80;
    if (isStructuredQuery) {
      const compactQuery = compactStructuredSpectrumText(normalizedQuery);
      if (compactQuery && compactValues.some((value) => value.includes(compactQuery) || compactQuery.includes(value))) return 94;
      if (matchesStructuredSpectrumTerm(item, normalizedQuery)) return 90;
    }
    if (!isStructuredQuery && exactValues.some((value) => normalizedQuery.includes(value))) return 80;

    const terms = normalizedQuery.split(/[\s,，。;；]+/).filter((term) => term.length >= 2);
    return terms.reduce((score, term) => {
      if (text.includes(term)) return score + (isStructuredSpectrumQuery(term) ? 24 : 12);
      if (isStructuredSpectrumQuery(term)) return score;
      if (term.length >= 4 && text.includes(term.slice(0, Math.max(3, Math.floor(term.length * 0.7))))) return score + 4;
      return score;
    }, 0);
  };

  const toSkillItem = (item) => ({
    id: item.id,
    code: item.code || '',
    title: item.title || '',
    type: item.spectrumType || '',
    category: item.category || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    date: item.date || '',
    note: item.note || '',
  });

  const uniqueSkillItems = (items) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const formatSkillItemDetails = (items, limit = 8) => {
    const normalized = uniqueSkillItems(items);
    const lines = normalized.slice(0, limit).map((item, index) => (
      `${index + 1}. ${item.title || item.code || item.id}；类型=${item.type || '-'}；分类=${item.category || '-'}；标签=${item.tags?.length ? item.tags.join('、') : '-'}`
    ));
    if (normalized.length > limit) lines.push(`还有 ${normalized.length - limit} 张未展开。`);
    return lines;
  };

  const buildSpectrumContext = (title, items, reason = '') => {
    const normalized = uniqueSkillItems(items).map(toSkillItem);
    return [
      `【${title}】`,
      reason ? `范围说明：${reason}` : '',
      `返回图谱：${normalized.length} 张。`,
      ...formatSkillItemDetails(normalized, 12),
    ].filter(Boolean).join('\n');
  };

  const normalizeAgentSearchMode = (mode, query = '') => {
    const value = String(mode || '').trim().toLowerCase();
    if (['selected', 'active', 'filtered', 'query'].includes(value)) return value;
    const text = String(query || '');
    if (/(?:当前已选|当前选中|已选中|已选|选中|选择的|选出来的)/.test(text)) return 'selected';
    if (/(?:当前筛选|筛选结果|当前列表|当前分类)/.test(text)) return 'filtered';
    if (/(?:当前图谱|当前图片|当前这张|这张)/.test(text)) return 'active';
    return 'query';
  };

  const searchByAgent = ({ query = '', limit = null, mode = 'query' } = {}) => {
    const parsedLimit = Number.parseInt(limit, 10);
    const hasExplicitLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
    const searchMode = normalizeAgentSearchMode(mode, query);
    const normalizedQuery = String(query || '').trim();
    let matchedItems = [];
    let reason = normalizedQuery ? `按关键词“${normalizedQuery}”检索` : '未提供关键词，未返回全库图谱';

    if (searchMode === 'selected') {
      matchedItems = getSelectedItems();
      reason = '使用当前已选图谱';
    } else if (searchMode === 'active') {
      matchedItems = [getActiveItem()].filter(Boolean);
      reason = '使用当前激活图谱';
    } else if (searchMode === 'filtered') {
      matchedItems = getFilteredItems();
      reason = '使用当前筛选结果';
    } else {
      if (normalizedQuery) {
        const structuredTerms = getStructuredSpectrumTerms(normalizedQuery);
        const scoredItems = state.items
          .map((item) => ({ item, score: scoreSkillItem(item, normalizedQuery) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score);
        const structuredItems = structuredTerms.length
          ? scoredItems
            .map((entry) => entry.item)
            .filter((item) => structuredTerms.some((term) => matchesStructuredSpectrumTerm(item, term)))
          : [];
        matchedItems = structuredItems.length ? structuredItems : scoredItems.map((entry) => entry.item);
      }
    }

    if (hasExplicitLimit) matchedItems = matchedItems.slice(0, parsedLimit);
    const entries = matchedItems.map((item) => toSkillItem(item));
    const images = getAiImages(matchedItems);

    return {
      ok: true,
      message: entries.length ? `已找到 ${entries.length} 张相关图谱。` : '未找到匹配的图谱。',
      details: entries.map((item, index) => `${index + 1}. ${item.title || item.code}；类型=${item.type || '-'}；分类=${item.category || '-'}`),
      data: {
        items: entries,
        context: buildSpectrumContext('图谱库检索结果', entries, reason),
        images,
        imageCount: images.length,
        mode: searchMode,
      },
      candidates: entries,
    };
  };

  const resolvePreciseSkillTargets = ({
    target = '',
    mode = 'query',
    maxAffected = SKILL_MUTATION_LIMIT,
    allowQueryBulk = true,
    allowFuzzySingle = false,
  } = {}) => {
    const normalizedMode = ['selected', 'active', 'filtered', 'query', 'target'].includes(String(mode))
      ? String(mode)
      : 'query';
    const limit = Math.max(1, Math.min(200, Number.parseInt(maxAffected, 10) || SKILL_MUTATION_LIMIT));
    let targets = [];
    let reason = '';

    if (normalizedMode === 'selected') {
      targets = getSelectedItems();
      reason = '当前已选图谱';
    } else if (normalizedMode === 'active') {
      targets = [getActiveItem()].filter(Boolean);
      reason = '当前激活图谱';
    } else if (normalizedMode === 'filtered') {
      targets = getFilteredItems();
      reason = '当前筛选结果';
    } else {
      const query = String(target || '').trim();
      const normalizedQuery = normalizeSkillText(query);
      if (!normalizedQuery) {
        return {
          ok: false,
          targets: [],
          message: '请提供明确的目标名称、编号，或使用 selected/filtered/active 范围。',
          candidates: getFilteredItems().slice(0, 8).map(toSkillItem),
        };
      }

      const exact = state.items.filter((item) => [item.id, item.code, item.title]
        .map(normalizeSkillText)
        .filter(Boolean)
        .includes(normalizedQuery));
      if (exact.length) {
        targets = exact;
        reason = `精确匹配“${query}”`;
      } else {
        const strict = state.items.filter((item) => [
          item.id,
          item.code,
          item.title,
          item.category,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ].map(normalizeSkillText).filter(Boolean)
          .some((value) => value === normalizedQuery || value.includes(normalizedQuery)));

        if (strict.length) {
          targets = strict;
          reason = `字段包含“${query}”`;
        } else if (allowFuzzySingle) {
          const scored = state.items
            .map((item) => ({ item, score: scoreSkillItem(item, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score);
          const topScore = scored[0]?.score || 0;
          const topMatches = scored.filter((entry) => entry.score === topScore).map((entry) => entry.item);
          if (topMatches.length === 1 && topScore >= 80) {
            targets = topMatches;
            reason = `唯一高置信匹配“${query}”`;
          } else {
            return {
              ok: false,
              targets: [],
              message: topMatches.length ? `“${query}”匹配不够明确，暂未处理数据。` : `未找到匹配“${query}”的图谱。`,
              candidates: topMatches.length ? topMatches.slice(0, 8).map(toSkillItem) : state.items.slice(0, 8).map(toSkillItem),
            };
          }
        } else {
          const candidates = state.items
            .map((item) => ({ item, score: scoreSkillItem(item, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map((entry) => toSkillItem(entry.item));
          return {
            ok: false,
            targets: [],
            message: candidates.length ? `“${query}”只命中相近结果，暂未处理数据。` : `未找到匹配“${query}”的图谱。`,
            candidates,
          };
        }
      }
    }

    targets = uniqueSkillItems(targets);
    if (!targets.length) {
      return {
        ok: false,
        targets: [],
        message: normalizedMode === 'selected'
          ? '当前没有已选图谱，暂未处理数据。'
          : normalizedMode === 'filtered'
            ? '当前筛选结果为空，暂未处理数据。'
            : '未找到可处理的图谱。',
      };
    }

    if ((normalizedMode === 'query' || normalizedMode === 'target') && targets.length > 1 && !allowQueryBulk) {
      return {
        ok: false,
        targets: [],
        message: `目标命中 ${targets.length} 张图谱，为避免误处理，请先选择具体图谱或改用“当前筛选/当前已选”。`,
        candidates: targets.slice(0, 8).map(toSkillItem),
        data: { matched: targets.length },
      };
    }

    if (targets.length > limit) {
      return {
        ok: false,
        targets: [],
        message: `目标命中 ${targets.length} 张，超过本次处理上限 ${limit} 张。请缩小关键词、先筛选或提高 maxAffected。`,
        candidates: targets.slice(0, 8).map(toSkillItem),
        data: { matched: targets.length, limit },
      };
    }

    return { ok: true, targets, reason };
  };

  const tagByAgent = ({ target = '', tags = [], mode = 'query', maxAffected = SKILL_MUTATION_LIMIT } = {}) => {
    const normalizedTags = normalizeTags(Array.isArray(tags) ? tags.join('，') : tags);
    if (!normalizedTags.length) {
      return {
        ok: false,
        message: '请提供要写入的标签。',
      };
    }

    const resolved = resolvePreciseSkillTargets({ target, mode, maxAffected, allowQueryBulk: true });
    const targets = resolved.targets || [];
    if (!targets.length) {
      return {
        ok: false,
        message: resolved.message || (target
          ? `未找到匹配“${target}”的图谱，暂未写入标签。`
          : '当前没有可写入标签的图谱。'),
        candidates: resolved.candidates || state.items.slice(0, 8).map(toSkillItem),
        data: resolved.data || {},
      };
    }

    const targetIds = new Set(targets.map((item) => item.id));
    let uploadedChanged = false;
    let changedCount = 0;
    let alreadyTaggedCount = 0;

    state.items = state.items.map((item) => {
      if (!targetIds.has(item.id)) return item;
      const before = Array.isArray(item.tags) ? item.tags.length : 0;
      const next = { ...item, tags: mergeTags(item.tags, normalizedTags) };
      const after = next.tags.length;
      if (after > before) changedCount += 1;
      else alreadyTaggedCount += 1;
      state.edits[next.id] = getEditableSnapshot(next);
      if (next.uploaded) uploadedChanged = true;
      return next;
    });

    saveItemEdits();
    if (uploadedChanged) saveUploadedItems();
    render();
    App.projectSkills?.render?.();

    const taggedItems = state.items.filter((item) => targetIds.has(item.id)).map(toSkillItem);
    return {
      ok: true,
      message: `已为 ${taggedItems.length} 张图谱写入标签：${normalizedTags.join('、')}。`,
      details: [
        `新增标签图谱：${changedCount} 张`,
        `原本已包含标签：${alreadyTaggedCount} 张`,
        ...taggedItems.slice(0, 12).map((item, index) => `${index + 1}. ${item.title || item.code || item.id}；标签=${item.tags.join('、') || '-'}`),
        taggedItems.length > 12 ? `还有 ${taggedItems.length - 12} 张未展开。` : '',
      ].filter(Boolean),
      data: {
        updated: taggedItems.length,
        changed: changedCount,
        unchanged: alreadyTaggedCount,
        tags: normalizedTags,
        items: taggedItems,
      },
    };
  };

  const categorizeByAgent = ({ target = '', category = '', mode = 'query', maxAffected = SKILL_MUTATION_LIMIT } = {}) => {
    const nextCategory = String(category || '').trim();
    if (!nextCategory) {
      return {
        ok: false,
        message: '请提供要整理到的新分类名称。',
      };
    }

    const resolved = resolvePreciseSkillTargets({ target, mode, maxAffected, allowQueryBulk: true });
    const targets = resolved.targets || [];
    const candidates = resolved.candidates || (target ? targets.map(toSkillItem) : []);
    if (!targets.length) {
      return {
        ok: false,
        message: resolved.message || (target
          ? `未找到匹配“${target}”的图谱，暂未更新分类。`
          : '当前没有可更新分类的图谱。'),
        candidates,
        data: resolved.data || {},
      };
    }

    const targetIds = new Set(targets.map((item) => item.id));
    let uploadedChanged = false;
    let changedCount = 0;
    let unchangedCount = 0;

    state.items = state.items.map((item) => {
      if (!targetIds.has(item.id)) return item;
      const before = String(item.category || '').trim();
      const next = { ...item, category: nextCategory };
      if (before === nextCategory) unchangedCount += 1;
      else changedCount += 1;
      state.edits[next.id] = getEditableSnapshot(next);
      if (next.uploaded) uploadedChanged = true;
      return next;
    });

    state.category = nextCategory;
    state.tag = '全部';
    saveItemEdits();
    saveFilterState();
    if (uploadedChanged) saveUploadedItems();
    render();
    App.projectSkills?.render?.();

    const categorizedItems = state.items.filter((item) => targetIds.has(item.id)).map(toSkillItem);
    return {
      ok: true,
      message: `已将 ${categorizedItems.length} 张图谱整理到分类：${nextCategory}。`,
      details: [
        `分类已更新：${changedCount} 张`,
        `原本已在该分类：${unchangedCount} 张`,
        ...categorizedItems.slice(0, 12).map((item, index) => `${index + 1}. ${item.title || item.code || item.id}；类型=${item.type || '-'}；分类=${item.category || '-'}`),
        categorizedItems.length > 12 ? `还有 ${categorizedItems.length - 12} 张未展开。` : '',
      ].filter(Boolean),
      data: {
        updated: categorizedItems.length,
        changed: changedCount,
        unchanged: unchangedCount,
        category: nextCategory,
        items: categorizedItems,
      },
    };
  };

  const createByAgent = ({
    title = '',
    code = '',
    type = '',
    spectrumType = '',
    category = '',
    date = '',
    tags = [],
    note = '',
  } = {}) => {
    const nextTitle = String(title || code || '').trim();
    if (!nextTitle) {
      return { ok: false, message: '请提供要新增的图谱名称或编号。' };
    }

    const duplicate = state.items.find((item) => {
      const values = [item.title, item.code].map(normalizeSkillText).filter(Boolean);
      return values.includes(normalizeSkillText(nextTitle)) || (code && values.includes(normalizeSkillText(code)));
    });
    if (duplicate) {
      return {
        ok: false,
        message: `已存在同名或同编号图谱“${duplicate.title || duplicate.code}”，暂未重复新增。`,
        candidates: [toSkillItem(duplicate)],
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const id = `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item = {
      id,
      code: String(code || `AGENT-${today.replace(/-/g, '')}`).trim(),
      title: nextTitle,
      spectrumType: normalizeSpectrumType(type || spectrumType, nextTitle),
      category: String(category || '').trim(),
      status: '待上传',
      date: normalizeSkillDate(date) || today,
      tags: normalizeTags(Array.isArray(tags) ? tags.join('，') : tags),
      image: createPlaceholderImage(nextTitle),
      imageStored: false,
      note: String(note || 'AI 新增的待上传图谱记录，请补充真实图谱图片。').trim(),
      uploaded: true,
    };

    state.items.unshift(item);
    state.edits[item.id] = getEditableSnapshot(item);
    revealItemInGallery(item);
    saveUploadedItems();
    saveItemEdits();
    render();
    App.projectSkills?.render?.();

    return {
      ok: true,
      message: `已新增待上传图谱记录：${item.title}。`,
      details: formatSkillItemDetails([toSkillItem(item)]),
      data: { created: 1, items: [toSkillItem(item)] },
    };
  };

  const normalizeUpdateInput = (input = {}) => {
    const source = input.updates && typeof input.updates === 'object' ? { ...input.updates } : {};
    ['title', 'category', 'date', 'note'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(input, field)) source[field] = input[field];
    });
    if (input.field && Object.prototype.hasOwnProperty.call(input, 'value')) {
      source[String(input.field)] = input.value;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'tags')) source.tagsSet = input.tags;
    if (Object.prototype.hasOwnProperty.call(input, 'tagsAdd')) source.tagsAdd = input.tagsAdd;
    if (Object.prototype.hasOwnProperty.call(input, 'addTags')) source.tagsAdd = input.addTags;
    if (Object.prototype.hasOwnProperty.call(input, 'tagsRemove')) source.tagsRemove = input.tagsRemove;
    if (Object.prototype.hasOwnProperty.call(input, 'removeTags')) source.tagsRemove = input.removeTags;
    return source;
  };

  const updateByAgent = (input = {}) => {
    const updates = normalizeUpdateInput(input);
    const hasDirectUpdate = ['title', 'category', 'date', 'note'].some((field) => Object.prototype.hasOwnProperty.call(updates, field));
    const tagsSet = Object.prototype.hasOwnProperty.call(updates, 'tagsSet')
      ? normalizeTags(Array.isArray(updates.tagsSet) ? updates.tagsSet.join('，') : updates.tagsSet)
      : null;
    const tagsAdd = normalizeTags(Array.isArray(updates.tagsAdd) ? updates.tagsAdd.join('，') : updates.tagsAdd);
    const tagsRemove = normalizeTags(Array.isArray(updates.tagsRemove) ? updates.tagsRemove.join('，') : updates.tagsRemove);

    if (!hasDirectUpdate && tagsSet === null && !tagsAdd.length && !tagsRemove.length) {
      return { ok: false, message: '请提供要更新的字段，例如分类、标题、日期、备注或标签。' };
    }

    const resolved = resolvePreciseSkillTargets({
      target: input.target,
      mode: input.mode || 'query',
      maxAffected: input.maxAffected || SKILL_MUTATION_LIMIT,
      allowQueryBulk: true,
    });
    const targets = resolved.targets || [];
    if (!targets.length) {
      return {
        ok: false,
        message: resolved.message || '未找到可更新的图谱。',
        candidates: resolved.candidates || [],
        data: resolved.data || {},
      };
    }

    const targetIds = new Set(targets.map((item) => item.id));
    let uploadedChanged = false;
    let changedCount = 0;
    let unchangedCount = 0;

    state.items = state.items.map((item) => {
      if (!targetIds.has(item.id)) return item;
      const before = JSON.stringify(getEditableSnapshot(item));
      const next = { ...item };
      if (Object.prototype.hasOwnProperty.call(updates, 'title')) next.title = String(updates.title || '').trim() || next.title;
      if (Object.prototype.hasOwnProperty.call(updates, 'category')) next.category = String(updates.category || '').trim();
      if (Object.prototype.hasOwnProperty.call(updates, 'date')) next.date = normalizeSkillDate(updates.date) || next.date;
      if (Object.prototype.hasOwnProperty.call(updates, 'note')) next.note = String(updates.note || '').trim();
      if (tagsSet !== null) next.tags = tagsSet;
      if (tagsAdd.length) next.tags = mergeTags(next.tags, tagsAdd);
      if (tagsRemove.length) next.tags = removeTags(next.tags, tagsRemove);

      const after = JSON.stringify(getEditableSnapshot(next));
      if (before === after) unchangedCount += 1;
      else changedCount += 1;
      state.edits[next.id] = getEditableSnapshot(next);
      if (next.uploaded) uploadedChanged = true;
      return next;
    });

    saveItemEdits();
    if (uploadedChanged) saveUploadedItems();
    render();
    App.projectSkills?.render?.();

    const updatedItems = state.items.filter((item) => targetIds.has(item.id)).map(toSkillItem);
    return {
      ok: true,
      message: `已更新 ${updatedItems.length} 张图谱。`,
      details: [
        `实际变更：${changedCount} 张`,
        `内容未变化：${unchangedCount} 张`,
        ...formatSkillItemDetails(updatedItems, 10),
      ],
      data: {
        updated: updatedItems.length,
        changed: changedCount,
        unchanged: unchangedCount,
        items: updatedItems,
      },
    };
  };

  const selectByAgent = ({ target = '', mode = 'query', clearExisting = true, maxAffected = 80 } = {}) => {
    const resolved = resolvePreciseSkillTargets({
      target,
      mode,
      maxAffected,
      allowQueryBulk: true,
    });
    const targets = resolved.targets || [];
    if (!targets.length) {
      return {
        ok: false,
        message: resolved.message || '未找到可选择的图谱。',
        candidates: resolved.candidates || [],
        data: resolved.data || {},
      };
    }

    if (clearExisting) state.selectedIds.clear();
    targets.forEach((item) => state.selectedIds.add(item.id));
    state.activeId = targets[0]?.id || state.activeId;
    render();
    App.projectSkills?.render?.();

    const selectedItems = targets.map(toSkillItem);
    return {
      ok: true,
      message: `${clearExisting ? '已选择' : '已追加选择'} ${selectedItems.length} 张图谱。`,
      details: formatSkillItemDetails(selectedItems, 12),
      data: {
        selected: selectedItems.length,
        totalSelected: state.selectedIds.size,
        items: selectedItems,
      },
    };
  };

  const deleteByAgent = async ({ target = '', mode = 'target', maxAffected = 12 } = {}) => {
    const selected = getSelectedItems();
    const resolved = resolvePreciseSkillTargets({
      target,
      mode,
      maxAffected,
      allowQueryBulk: false,
      allowFuzzySingle: true,
    });
    const targets = resolved.targets || [];

    if (!targets.length) {
      return {
        ok: false,
        message: resolved.message || (mode === 'selected'
          ? '当前没有已选图谱，无法删除。'
          : selected.length
            ? '请说明要删除哪张图谱；如果要删除当前已选图谱，可以说“删除当前已选图谱”。'
            : '请提供要删除的图谱名称、编号或先在图谱分析页选中目标图谱。'),
        candidates: resolved.candidates || selected.map(toSkillItem),
        data: resolved.data || {},
      };
    }

    const ids = [...new Set(targets.map((item) => item.id).filter(Boolean))];
    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: ids.length > 1 ? '删除图谱' : '删除图片',
      message: ids.length > 1
        ? `确认删除这 ${ids.length} 张图谱？删除后无法恢复。`
        : `确认删除「${targets[0]?.title || targets[0]?.code || targets[0]?.id || '当前图谱'}」？删除后无法恢复。`,
    });
    if (!confirmed) {
      return {
        ok: false,
        message: '已取消删除操作。',
        data: { cancelled: true, items: targets.map(toSkillItem) },
      };
    }
    const deleted = targets.map(toSkillItem);
    commitDeleteItems(ids);
    App.projectSkills?.render?.();
    return {
      ok: true,
      message: `已删除 ${deleted.length} 张图谱。`,
      details: deleted.map((item) => `${item.title || item.code || item.id}；类型=${item.type || '-'}；分类=${item.category || '-'}`),
      data: { deleted: deleted.length, items: deleted },
    };
  };

  const closeImagePreview = () => {
    refs.previewDialog?.remove();
    refs.previewDialog = null;
    refs.previewItems = [];
    refs.previewActiveId = '';
    previewAiMergeMode = false;
    previewAiMergeRunning = false;
  };

  const getPreviewItems = (id) => {
    const selected = getSelectedItems();
    if (selected.length) return selected;
    return state.items.filter((item) => item.id === id);
  };

  const renderImagePreview = () => {
    if (!refs.previewDialog) return;

    const items = refs.previewItems || [];
    const item = items.find((entry) => entry.id === refs.previewActiveId) || items[0];
    if (!item) return;

    refs.previewActiveId = item.id;
    if ((items || []).length < 2) previewAiMergeMode = false;
    const modelInfo = getPreviewAiModelInfo(item);
    refs.previewDialog.innerHTML = `
      <button class="spectrum-preview-back" type="button" data-spectrum-preview-close aria-label="返回图谱列表">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
        <span>返回</span>
      </button>
      <aside class="spectrum-preview-rail" aria-label="已选图谱预览列表">
        ${items.map((entry) => `
          <button class="spectrum-preview-thumb${entry.id === item.id ? ' is-active' : ''}" type="button" data-spectrum-preview-open="${utils.escapeHtml(entry.id)}" aria-label="查看 ${utils.escapeHtml(entry.title)}">
            <img src="${utils.escapeHtml(getItemImageSrc(entry))}" data-spectrum-image-id="${utils.escapeHtml(entry.id)}" loading="lazy" alt="${utils.escapeHtml(entry.title)}" />
            <span>${utils.escapeHtml(entry.title)}</span>
          </button>
        `).join('')}
      </aside>
      <main class="spectrum-preview-main">
        <button class="spectrum-preview-close" type="button" data-spectrum-preview-close aria-label="关闭预览">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <div class="spectrum-preview-card dialog-card${previewAiCollapsed ? ' is-ai-collapsed' : ' is-ai-wide'}">
          <div class="spectrum-preview-card-head">
            <div class="spectrum-preview-title-row">
              <div class="spectrum-preview-card-title">${utils.escapeHtml(item.title)}</div>
              <div class="spectrum-preview-model-line">${utils.escapeHtml(modelInfo)}</div>
            </div>
            <div class="spectrum-preview-card-meta">
              <span class="spectrum-type-badge" data-spectrum-type="${utils.escapeHtml(item.spectrumType || 'UNKNOWN')}">${utils.escapeHtml(item.spectrumType || '未识别类型')}</span>
              <span>${utils.escapeHtml(item.date || '-')}</span>
              <button class="spectrum-preview-ai-toggle" type="button" data-spectrum-toggle-ai-panel aria-label="${previewAiCollapsed ? '展开AI分析面板' : '收起AI分析面板'}" title="${previewAiCollapsed ? '展开AI分析面板' : '收起AI分析面板'}">
                <i class="ti ${previewAiCollapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-right-collapse'}" aria-hidden="true"></i>
                <span>${previewAiCollapsed ? '展开AI' : '收起AI'}</span>
              </button>
            </div>
          </div>
          <div class="spectrum-preview-card-body">
            <div class="spectrum-preview-image-frame">
              <img src="${utils.escapeHtml(getItemImageSrc(item))}" data-spectrum-image-id="${utils.escapeHtml(item.id)}" alt="${utils.escapeHtml(item.title)}" />
            </div>
            ${renderPreviewAiPanel(item)}
          </div>
          <div class="spectrum-preview-card-foot">
            <span>分类：${utils.escapeHtml(item.category || '-')}</span>
            <span>标签：${utils.escapeHtml(item.tags.length ? item.tags.join('、') : '-')}</span>
          </div>
        </div>
      </main>
    `;

    refs.previewDialog.querySelector('.spectrum-preview-thumb.is-active')?.scrollIntoView({ block: 'nearest' });
    observeLazyImages();
    ensureItemImage(item.id);
  };

  const setPreviewAiCollapsed = (collapsed) => {
    previewAiCollapsed = Boolean(collapsed);
    const card = refs.previewDialog?.querySelector('.spectrum-preview-card');
    const toggleButton = refs.previewDialog?.querySelector('[data-spectrum-toggle-ai-panel]');
    if (!card || !toggleButton) return;

    card.classList.toggle('is-ai-collapsed', previewAiCollapsed);
    card.classList.toggle('is-ai-wide', !previewAiCollapsed);
    const label = previewAiCollapsed ? '展开AI' : '收起AI';
    const ariaLabel = previewAiCollapsed ? '展开AI分析面板' : '收起AI分析面板';
    toggleButton.setAttribute('aria-label', ariaLabel);
    toggleButton.setAttribute('title', ariaLabel);

    const icon = toggleButton.querySelector('.ti');
    if (icon) {
      icon.classList.toggle('ti-layout-sidebar-right-expand', previewAiCollapsed);
      icon.classList.toggle('ti-layout-sidebar-right-collapse', !previewAiCollapsed);
    }
    const text = toggleButton.querySelector('span');
    if (text) text.textContent = label;

  };

  const ensurePreviewAiResultOnExpand = (id) => {
    if (!id) return;
    restorePreviewAiResult(id);
    const ai = previewAiState[id];
    const alreadyAnalyzed = ai?.status === 'success' && Boolean(ai.result);
    const busy = ai?.status === 'loading' || ai?.status === 'streaming';
    if (!alreadyAnalyzed && !busy) runPreviewAiExtract(id);
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
    previewAiCollapsed = true;
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

  const toggleSelected = (id, force) => {
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

  const ensureUploadProgressNode = () => {
    if (!refs.galleryPanel) return null;
    if (refs.uploadProgress && refs.uploadProgress.isConnected) return refs.uploadProgress;

    const progress = document.createElement('div');
    progress.className = 'spectrum-upload-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    progress.innerHTML = `
      <span class="spectrum-upload-progress-icon"><i class="ti ti-loader-2" aria-hidden="true"></i></span>
      <span class="spectrum-upload-progress-body">
        <strong>\u6b63\u5728\u4e0a\u4f20\u56fe\u8c31</strong>
        <span data-spectrum-upload-progress-text>\u6b63\u5728\u51c6\u5907\u56fe\u7247...</span>
      </span>
    `;
    refs.galleryPanel.appendChild(progress);
    refs.uploadProgress = progress;
    return progress;
  };

  const setUploadProgress = (active, message = '') => {
    if (!refs.galleryPanel) return;
    const progress = ensureUploadProgressNode();
    const text = progress?.querySelector('[data-spectrum-upload-progress-text]');
    if (text) text.textContent = message || '\u6b63\u5728\u5904\u7406\u56fe\u7247...';

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
      image: item.image || await ensureItemImage(item.id),
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
        date: normalizeSkillDate(meta.date) || new Date().toISOString().slice(0, 10),
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
              conflictAction = await openUploadConflictDialog(file.name);
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
        revealItemInGallery(state.items[index]);
      } else {
        const inheritedCategory = state.category === '全部' ? '' : state.category;
        const inheritedTags = state.tag === '全部' ? [] : [state.tag];
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
        revealItemInGallery(item);
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

    refs.sortSelect?.addEventListener('change', () => {
      state.sort = refs.sortSelect.value || 'date-desc';
      render();
    });

    refs.viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.getAttribute('data-spectrum-view') || 'grid';
        refs.viewButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        renderGallery();
      });
    });

    refs.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.getAttribute('data-spectrum-mode') || 'ALL';
        syncModeButtons();
        render();
      });
    });

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

      const toggleAiButton = event.target.closest('[data-spectrum-toggle-ai-panel]');
      if (toggleAiButton) {
        const nextCollapsed = !previewAiCollapsed;
        setPreviewAiCollapsed(nextCollapsed);
        if (!nextCollapsed) ensurePreviewAiResultOnExpand(refs.previewActiveId);
        return;
      }

      const aiViewButton = event.target.closest('[data-spectrum-ai-view]');
      if (aiViewButton) {
        const mode = aiViewButton.getAttribute('data-spectrum-ai-view') === 'json' ? 'json' : 'table';
        if (previewAiMergeMode) {
          previewAiMergeViewMode = mode;
          renderImagePreview();
          return;
        }
        const id = refs.previewActiveId;
        previewAiState[id] = {
          ...(previewAiState[id] || { status: 'idle' }),
          viewMode: mode,
        };
        updatePreviewAiPanelInPlace(id);
        return;
      }

      const mergeToggleButton = event.target.closest('[data-spectrum-ai-merge-toggle]');
      if (mergeToggleButton) {
        previewAiMergeMode = !previewAiMergeMode;
        renderImagePreview();
        if (previewAiMergeMode) runPreviewAiMergeAnalysis('missing');
        return;
      }

      const mergeRunButton = event.target.closest('[data-spectrum-ai-merge-run]');
      if (mergeRunButton) {
        runPreviewAiMergeAnalysis(mergeRunButton.getAttribute('data-spectrum-ai-merge-run') || 'missing');
        return;
      }

      const previewOpenButton = event.target.closest('[data-spectrum-preview-open]');
      if (previewOpenButton) {
        refs.previewActiveId = previewOpenButton.getAttribute('data-spectrum-preview-open') || refs.previewActiveId;
        renderImagePreview();
        return;
      }

      const aiExtractButton = event.target.closest('[data-spectrum-ai-extract]');
      if (aiExtractButton) {
        runPreviewAiExtract(aiExtractButton.getAttribute('data-spectrum-ai-extract'));
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
      if (event.target.closest('.spectrum-ai-extract-body') || event.target.closest('.spectrum-preview-rail')) {
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

  App.spectrumAnalysis = {
    init,
    getAiContext,
    getAiImages: () => getAiImages(getAiItems()),
    getSelectedAiImages: () => getAiImages(getSelectedAiItems()),
    getAgentContext,
    getAgentImages,
    searchByAgent,
    createByAgent,
    updateByAgent,
    selectByAgent,
    deleteByAgent,
    tagByAgent,
    categorizeByAgent,
  };
})();
