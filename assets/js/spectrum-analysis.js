(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { utils } = App;
  const STORAGE_KEY = 'gjh-spectrum-user-images-v2';
  const EDIT_STORAGE_KEY = 'gjh-spectrum-edits-v2';
  const EDITABLE_FIELDS = ['title', 'category', 'date', 'tags', 'note'];
  const DELETE_ANIMATION_MS = 240;
  const DETAIL_ANIMATION_MS = 520;

  const state = {
    items: [],
    edits: {},
    selectedIds: new Set(),
    activeId: '',
    query: '',
    category: '全部',
    tag: '全部',
    mode: 'ALL',
    view: 'grid',
    sort: 'date-desc',
    editingId: '',
    detailCollapsed: false,
  };

  const refs = {};

  const initRefs = () => {
    refs.searchInput = document.getElementById('spectrumSearchInput');
    refs.uploadBtn = document.getElementById('spectrumUploadBtn');
    refs.uploadInput = document.getElementById('spectrumUploadInput');
    refs.printBtn = document.getElementById('spectrumPrintBtn');
    refs.sendAiBtn = document.getElementById('spectrumSendAiBtn');
    refs.categoryFilters = document.getElementById('spectrumCategoryFilters');
    refs.tagFilters = document.getElementById('spectrumTagFilters');
    refs.clearSelectedBtn = document.getElementById('spectrumClearSelectedBtn');
    refs.deleteSelectedBtn = document.getElementById('spectrumDeleteSelectedBtn');
    refs.selectedList = document.getElementById('spectrumSelectedList');
    refs.galleryCount = document.getElementById('spectrumGalleryCount');
    refs.sortSelect = document.getElementById('spectrumSortSelect');
    refs.toggleDetailBtn = document.getElementById('spectrumToggleDetailBtn');
    refs.gallery = document.getElementById('spectrumGallery');
    refs.workbench = refs.gallery?.closest('.spectrum-workbench');
    refs.galleryPanel = refs.gallery?.closest('.spectrum-gallery-panel');
    refs.detailPanel = document.getElementById('spectrumDetailPanel');
    refs.viewButtons = document.querySelectorAll('[data-spectrum-view]');
    refs.modeButtons = document.querySelectorAll('[data-spectrum-mode]');
  };

  const getSpectrumTypeFromName = (name) => {
    const baseName = String(name || '').replace(/\.[^.]*$/, '').trim().toUpperCase();
    const suffix = baseName.slice(-3);
    return suffix === 'DSC' || suffix === 'TGA' ? suffix : '';
  };

  const getUploadTitle = (file) => file.name.replace(/\.[^.]+$/, '') || file.name;

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

  const loadItems = () => {
    const edits = utils.readJson(EDIT_STORAGE_KEY, {});
    state.edits = edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
    const uploaded = utils.readJson(STORAGE_KEY, []);
    state.items = (Array.isArray(uploaded) ? uploaded : []).map(applyItemEdits);
    state.activeId = state.items[0]?.id || '';
  };

  const saveUploadedItems = () => {
    const uploaded = state.items.filter((item) => item.uploaded);
    utils.writeJson(STORAGE_KEY, uploaded);
  };

  const saveItemEdits = () => {
    utils.writeJson(EDIT_STORAGE_KEY, state.edits);
  };

  const getEditableSnapshot = (item) => EDITABLE_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = Array.isArray(item[field]) ? [...item[field]] : item[field];
    return snapshot;
  }, {});

  const normalizeTags = (value) => String(value || '')
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

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

  const matchesFilter = (item) => {
    const query = state.query.trim().toLowerCase();
    const text = [item.code, item.title, item.category, item.tags.join(' ')].filter(Boolean).join(' ').toLowerCase();
    return (!query || text.includes(query))
      && (state.mode === 'ALL' || item.spectrumType === state.mode)
      && (state.category === '全部' || item.category === state.category)
      && (state.tag === '全部' || item.tags.includes(state.tag));
  };

  const getFilteredItems = () => {
    const items = state.items.filter(matchesFilter);
    return items.sort((a, b) => {
      return b.date.localeCompare(a.date);
    });
  };

  const getActiveItem = () => state.items.find((item) => item.id === state.activeId) || state.items[0] || null;
  const getSelectedItems = () => state.items.filter((item) => state.selectedIds.has(item.id));

  const renderFilterButton = (value, activeValue, count, attr) => {
    const active = value === activeValue ? ' is-active' : '';
    const selectedCount = value === '全部'
      ? getSelectedItems().length
      : getSelectedItems().filter((item) => item.category === value).length;
    return `
      <button class="spectrum-filter-btn${active}" type="button" ${attr}="${utils.escapeHtml(value)}">
          <span>${utils.escapeHtml(value)}</span>
        <span class="spectrum-filter-counts">
          <em>${count}</em>
          <strong>${selectedCount}</strong>
        </span>
      </button>
    `;
  };

  const renderFilters = () => {
    const categories = ['全部', ...uniqueValues((item) => [item.category])];
    const tags = ['全部', ...uniqueValues((item) => item.tags)];

    if (refs.categoryFilters) refs.categoryFilters.innerHTML = categories.map((category) => {
      const count = category === '全部' ? state.items.length : state.items.filter((item) => item.category === category).length;
      return renderFilterButton(category, state.category, count, 'data-spectrum-category');
    }).join('');

    if (refs.tagFilters) refs.tagFilters.innerHTML = tags.map((tag) => {
      const count = tag === '全部' ? state.items.length : state.items.filter((item) => item.tags.includes(tag)).length;
      const active = tag === state.tag ? ' is-active' : '';
      return `<button class="spectrum-tag-filter${active}" type="button" data-spectrum-tag="${utils.escapeHtml(tag)}">${utils.escapeHtml(tag)} <span>${count}</span></button>`;
    }).join('');

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
          <img src="${utils.escapeHtml(item.image)}" alt="${utils.escapeHtml(item.title)}" loading="lazy" />
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

  const saveDetailForm = (form) => {
    const id = form.elements.id.value;
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return;

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
    render();
  };

  const commitDeleteItems = (ids) => {
    const targets = new Set(ids);
    if (!targets.size) return;

    state.items = state.items.filter((entry) => !targets.has(entry.id));
    targets.forEach((id) => {
      state.selectedIds.delete(id);
      delete state.edits[id];
    });
    state.activeId = state.items[0]?.id || '';
    if (refs.previewDialog) closeImagePreview();
    saveUploadedItems();
    saveItemEdits();
    render();
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!nodes.length || reducedMotion) {
      onDone();
      return;
    }

    nodes.forEach((node) => {
      node.classList.add('is-deleting');
      node.setAttribute('aria-hidden', 'true');
    });
    window.setTimeout(onDone, DELETE_ANIMATION_MS);
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

  const closeDeleteDialog = () => {
    refs.deleteDialog?.remove();
    refs.deleteDialog = null;
    refs.deleteTargetId = '';
    refs.deleteMode = '';
  };

  const openDeleteDialog = (id, mode = 'single') => {
    const item = state.items.find((entry) => entry.id === id);
    const selectedCount = state.selectedIds.size;
    if (mode === 'single' && !item) return;
    if (mode === 'selected' && !selectedCount) return;

    const title = mode === 'selected' ? '删除已选图片' : '删除图片';
    const text = mode === 'selected'
      ? `确定删除已选列表中的 ${selectedCount} 张图片吗？删除后无法在图谱库中恢复。`
      : `确定删除“${utils.escapeHtml(item.title)}”吗？删除后无法在图谱库中恢复。`;
    const confirmText = '确认删除';

    closeDeleteDialog();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog';
    dialog.innerHTML = `
      <div class="spectrum-delete-card" role="dialog" aria-modal="true" aria-labelledby="spectrumDeleteTitle">
        <div class="spectrum-delete-icon"><i class="ti ti-trash" aria-hidden="true"></i></div>
        <div class="spectrum-delete-main">
          <div class="spectrum-delete-title" id="spectrumDeleteTitle">${title}</div>
          <div class="spectrum-delete-text">${text}</div>
        </div>
        <div class="spectrum-delete-actions">
          <button class="analysis-toolbar-btn" type="button" data-spectrum-delete-cancel>取消</button>
          <button class="analysis-toolbar-btn spectrum-danger-btn" type="button" data-spectrum-delete-confirm>${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    refs.deleteDialog = dialog;
    refs.deleteTargetId = id;
    refs.deleteMode = mode;
  };

  const openUploadConflictDialog = (fileName) => new Promise((resolve) => {
    refs.uploadConflictDialog?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-delete-dialog spectrum-upload-conflict-dialog';
    dialog.innerHTML = `
      <div class="spectrum-delete-card spectrum-upload-conflict-card" role="dialog" aria-modal="true" aria-labelledby="spectrumUploadConflictTitle">
        <div class="spectrum-delete-icon spectrum-upload-conflict-icon"><i class="ti ti-file-alert" aria-hidden="true"></i></div>
        <div class="spectrum-delete-main">
          <div class="spectrum-delete-title" id="spectrumUploadConflictTitle">发现同名图片</div>
          <div class="spectrum-delete-text">“${utils.escapeHtml(fileName)}” 已存在，是否覆盖现有图片？选择跳过将保留原图片。</div>
        </div>
        <div class="spectrum-delete-actions">
          <button class="analysis-toolbar-btn" type="button" data-spectrum-upload-skip>跳过</button>
          <button class="analysis-toolbar-btn analysis-toolbar-btn-primary" type="button" data-spectrum-upload-overwrite>覆盖</button>
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

  const renderGallery = () => {
    const items = getFilteredItems();
    const selectedCount = state.selectedIds.size;
    refs.galleryCount.textContent = `共 ${items.length} 张，已选 ${selectedCount} 张`;
    refs.gallery.className = `spectrum-gallery is-${state.view}`;

    if (!items.length) {
      const emptyTitle = state.mode === 'ALL' ? '暂无图谱文件' : `暂无 ${state.mode} 图谱文件`;
      const emptyText = state.mode === 'ALL'
        ? '拖拽图片到这里，或点击“上传图谱”添加你的文件。'
        : `当前模式只显示文件名以 ${state.mode} 结尾的图片，可切换 ALL 查看全部。`;
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
      return `
        <article class="spectrum-card${selected}${active}" data-spectrum-id="${utils.escapeHtml(item.id)}" data-spectrum-type="${utils.escapeHtml(item.spectrumType || 'UNKNOWN')}" role="button" tabindex="0" aria-pressed="${state.selectedIds.has(item.id) ? 'true' : 'false'}">
          <div class="spectrum-card-image">
            <img src="${utils.escapeHtml(item.image)}" alt="${utils.escapeHtml(item.title)}" loading="lazy" />
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
              ${item.tags.slice(0, 3).map((tag) => `<span>${utils.escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>
        </article>
      `;
    }).join('');
  };

  const renderDetail = () => {
    const item = getActiveItem();
    if (!item) {
      refs.detailPanel.innerHTML = `
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
        <img src="${utils.escapeHtml(item.image)}" alt="${utils.escapeHtml(item.title)}" />
      </button>
      <div class="spectrum-detail-body">
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
            <button class="analysis-toolbar-btn" type="button" data-spectrum-ai="${utils.escapeHtml(item.id)}">
              <i class="ti ti-sparkles" aria-hidden="true"></i>
              <span>让 AI 分析</span>
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
    if (refs.sendAiBtn) refs.sendAiBtn.disabled = selectedCount < 1 && !state.activeId;
  };

  const updateDetailCollapsed = () => {
    refs.workbench?.classList.toggle('is-detail-collapsed', state.detailCollapsed);
    if (!refs.toggleDetailBtn) return;

    refs.toggleDetailBtn.setAttribute('aria-expanded', String(!state.detailCollapsed));
    refs.toggleDetailBtn.classList.toggle('is-collapsed', state.detailCollapsed);
    const icon = refs.toggleDetailBtn.querySelector('.ti');
    const label = refs.toggleDetailBtn.querySelector('span');
    if (icon) icon.className = `ti ${state.detailCollapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-right-collapse'}`;
    if (label) label.textContent = state.detailCollapsed ? '展开详情' : '收起详情';
  };

  const setDetailCollapsed = (collapsed) => {
    if (!refs.detailPanel) {
      state.detailCollapsed = collapsed;
      updateDetailCollapsed();
      return;
    }

    window.clearTimeout(refs.detailCollapseTimer);
    state.detailCollapsed = collapsed;
    if (!collapsed) refs.detailPanel.hidden = false;
    updateDetailCollapsed();

    if (collapsed) {
      refs.detailCollapseTimer = window.setTimeout(() => {
        if (state.detailCollapsed && refs.detailPanel) refs.detailPanel.hidden = true;
      }, DETAIL_ANIMATION_MS);
    }
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
            .print-meta{flex:0 0 auto;border-top:1px solid #e5ebf3;margin-top:8mm;padding-top:4mm;display:flex;align-items:flex-end;justify-content:space-between;gap:12mm;color:#0f172a}
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
    renderFilters();
    renderGallery();
    renderDetail();
    renderSelectedList();
    updateActions();
    updateDetailCollapsed();
  };

  const buildAiPrompt = (items) => {
    const targetItems = items.length ? items : [getActiveItem()].filter(Boolean);
    const intro = '请分析以下图谱，重点说明图谱特征、异常点、建议标签和后续处理建议。';
    const lines = targetItems.map((item, index) => [
      `${index + 1}. ${item.title}`,
      `编号：${item.code}`,
      `分类：${item.category}`,
      `标签：${item.tags.join('、')}`,
      `备注：${item.note}`,
    ].join('\n'));

    return `${intro}\n\n${lines.join('\n\n')}\n\n图片已在图谱分析页面选中，请结合图谱图片和上述业务信息给出结论。`;
  };

  const sendToAi = (items) => {
    const prompt = buildAiPrompt(items);
    App.chat?.draftPrompt?.(prompt);
  };

  const closeImagePreview = () => {
    refs.previewDialog?.remove();
    refs.previewDialog = null;
    refs.previewItems = [];
    refs.previewActiveId = '';
  };

  const getPreviewItems = (id) => {
    const selected = getSelectedItems();
    if (!selected.length) return state.items.filter((item) => item.id === id);
    return selected.some((item) => item.id === id)
      ? selected
      : [state.items.find((item) => item.id === id), ...selected].filter(Boolean);
  };

  const renderImagePreview = () => {
    if (!refs.previewDialog) return;

    const items = refs.previewItems || [];
    const item = items.find((entry) => entry.id === refs.previewActiveId) || items[0];
    if (!item) return;

    refs.previewActiveId = item.id;
    refs.previewDialog.innerHTML = `
      <aside class="spectrum-preview-rail" aria-label="已选图谱预览列表">
        ${items.map((entry) => `
          <button class="spectrum-preview-thumb${entry.id === item.id ? ' is-active' : ''}" type="button" data-spectrum-preview-open="${utils.escapeHtml(entry.id)}" aria-label="查看 ${utils.escapeHtml(entry.title)}">
            <img src="${utils.escapeHtml(entry.image)}" alt="${utils.escapeHtml(entry.title)}" />
            <span>${utils.escapeHtml(entry.title)}</span>
          </button>
        `).join('')}
      </aside>
      <main class="spectrum-preview-main">
        <button class="spectrum-preview-close" type="button" data-spectrum-preview-close aria-label="关闭预览">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <div class="spectrum-preview-card">
          <div class="spectrum-preview-card-head">
            <div>
              <div class="spectrum-preview-card-title">${utils.escapeHtml(item.title)}</div>
            </div>
            <div class="spectrum-preview-card-meta">
              <span class="spectrum-type-badge" data-spectrum-type="${utils.escapeHtml(item.spectrumType || 'UNKNOWN')}">${utils.escapeHtml(item.spectrumType || '未识别类型')}</span>
              <span>${utils.escapeHtml(item.date || '-')}</span>
            </div>
          </div>
          <div class="spectrum-preview-image-frame">
            <img src="${utils.escapeHtml(item.image)}" alt="${utils.escapeHtml(item.title)}" />
          </div>
          <div class="spectrum-preview-card-foot">
            <span>分类：${utils.escapeHtml(item.category || '-')}</span>
            <span>标签：${utils.escapeHtml(item.tags.length ? item.tags.join('、') : '-')}</span>
          </div>
        </div>
      </main>
    `;

    refs.previewDialog.querySelector('.spectrum-preview-thumb.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  const switchImagePreview = (step) => {
    const items = refs.previewItems || [];
    if (!refs.previewDialog || items.length < 2) return;

    const currentIndex = Math.max(0, items.findIndex((item) => item.id === refs.previewActiveId));
    const nextIndex = (currentIndex + step + items.length) % items.length;
    refs.previewActiveId = items[nextIndex].id;
    renderImagePreview();
  };

  const openImagePreview = (id) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;

    closeImagePreview();
    const dialog = document.createElement('div');
    dialog.className = 'spectrum-preview-dialog';
    document.body.appendChild(dialog);
    refs.previewDialog = dialog;
    refs.previewItems = getPreviewItems(id);
    refs.previewActiveId = id;
    renderImagePreview();
  };

  const toggleSelected = (id, force) => {
    const selected = force ?? !state.selectedIds.has(id);
    if (selected) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    state.activeId = id || state.activeId;
    render();
  };

  const readFileAsDataUrl = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => resolve(''));
    reader.readAsDataURL(file);
  });

  const uploadSpectrumFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;

    for (const file of files) {
      const title = getUploadTitle(file);
      const existing = findItemByTitle(title);
      if (existing) {
        const action = await openUploadConflictDialog(file.name);
        if (action === 'skip') continue;
      }

      const image = await readFileAsDataUrl(file);
      if (!image) continue;

      const today = new Date().toISOString().slice(0, 10);
      const spectrumType = getSpectrumTypeFromName(file.name);
      if (existing) {
        const index = state.items.findIndex((item) => item.id === existing.id);
        if (index < 0) continue;
        state.items[index] = {
          ...state.items[index],
          title,
          spectrumType,
          image,
          uploaded: true,
        };
        state.activeId = existing.id;
      } else {
        const inheritedCategory = state.category === '全部' ? '' : state.category;
        const inheritedTags = state.tag === '全部' ? [] : [state.tag];
        const item = {
          id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          code: `UPLOAD-${today.replace(/-/g, '')}`,
          title,
          spectrumType,
          category: inheritedCategory,
          status: '',
          date: today,
          tags: inheritedTags,
          image,
          note: '',
          uploaded: true,
        };
        state.items.unshift(item);
        state.activeId = item.id;
      }
      saveUploadedItems();
      render();
    }
  };

  const bindEvents = () => {
    refs.searchInput?.addEventListener('input', () => {
      state.query = refs.searchInput.value || '';
      renderGallery();
      updateActions();
    });

    refs.sortSelect?.addEventListener('change', () => {
      state.sort = refs.sortSelect.value || 'date-desc';
      renderGallery();
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
        refs.modeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        const visibleItems = getFilteredItems();
        if (!visibleItems.some((item) => item.id === state.activeId)) {
          state.activeId = visibleItems[0]?.id || '';
        }
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

    refs.categoryFilters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-spectrum-category]');
      if (!button) return;
      state.category = button.getAttribute('data-spectrum-category') || '全部';
      render();
    });

    refs.tagFilters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-spectrum-tag]');
      if (!button) return;
      state.tag = button.getAttribute('data-spectrum-tag') || '全部';
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

      const aiButton = event.target.closest('[data-spectrum-ai]');
      if (aiButton) {
        const item = state.items.find((entry) => entry.id === aiButton.getAttribute('data-spectrum-ai'));
        if (item) sendToAi([item]);
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
      if (refs.deleteDialog) {
        if (event.target === refs.deleteDialog || event.target.closest('[data-spectrum-delete-cancel]')) {
          closeDeleteDialog();
          return;
        }
        if (event.target.closest('[data-spectrum-delete-confirm]')) {
          const id = refs.deleteTargetId;
          const mode = refs.deleteMode;
          closeDeleteDialog();
          if (mode === 'selected') deleteSelectedItems();
          else deleteSpectrumItem(id);
          return;
        }
      }

      if (!refs.previewDialog) return;
      if (event.target === refs.previewDialog || event.target.closest('[data-spectrum-preview-close]')) {
        closeImagePreview();
        return;
      }

      const previewOpenButton = event.target.closest('[data-spectrum-preview-open]');
      if (previewOpenButton) {
        refs.previewActiveId = previewOpenButton.getAttribute('data-spectrum-preview-open') || refs.previewActiveId;
        renderImagePreview();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (refs.uploadConflictDialog && event.key === 'Escape') {
        refs.uploadConflictResolver?.('skip');
        refs.uploadConflictResolver = null;
        return;
      }

      if (refs.deleteDialog && event.key === 'Escape') {
        closeDeleteDialog();
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
      event.preventDefault();
      switchImagePreview(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    refs.selectedList?.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-spectrum-remove-selected]');
      if (removeButton) {
        state.selectedIds.delete(removeButton.getAttribute('data-spectrum-remove-selected'));
        render();
        return;
      }

      const openButton = event.target.closest('[data-spectrum-open]');
      if (openButton) {
        state.activeId = openButton.getAttribute('data-spectrum-open') || state.activeId;
        render();
      }
    });

    refs.toggleDetailBtn?.addEventListener('click', () => {
      setDetailCollapsed(!state.detailCollapsed);
    });

    refs.printBtn?.addEventListener('click', printSelectedList);

    refs.sendAiBtn?.addEventListener('click', () => {
      const selected = getSelectedItems();
      sendToAi(selected.length ? selected : [getActiveItem()].filter(Boolean));
    });

    refs.uploadBtn?.addEventListener('click', () => refs.uploadInput?.click());
    refs.uploadInput?.addEventListener('change', () => {
      uploadSpectrumFiles(refs.uploadInput.files);
      refs.uploadInput.value = '';
    });

    refs.galleryPanel?.addEventListener('dragenter', (event) => {
      event.preventDefault();
      refs.galleryPanel.classList.add('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      refs.galleryPanel.classList.add('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('dragleave', (event) => {
      if (refs.galleryPanel.contains(event.relatedTarget)) return;
      refs.galleryPanel.classList.remove('is-drag-over');
    });

    refs.galleryPanel?.addEventListener('drop', (event) => {
      event.preventDefault();
      refs.galleryPanel.classList.remove('is-drag-over');
      uploadSpectrumFiles(event.dataTransfer.files);
    });
  };

  const init = () => {
    initRefs();
    if (!refs.gallery) return;
    loadItems();
    bindEvents();
    render();
  };

  App.spectrumAnalysis = { init };
})();
