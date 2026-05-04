// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants } = App;
  let assistantFullscreenExitTimer = null;
  let collapsedNavFlyout = null;
  let collapsedNavFlyoutTimer = null;
  let draggedVisitedPageId = '';
  let draggedVisitedEntry = null;
  let draggedVisitedOriginalNext = null;
  let visitedDragPlaceholder = null;
  let suppressVisitedClick = false;
  const DEFAULT_PAGE_ID = 'ai-config';
  const SIDEBAR_TRANSITION_MS = 520;
  const MAX_RECENT_PAGES = 8;

  const clearCollapsedNavFlyoutTimer = () => {
    if (collapsedNavFlyoutTimer) {
      window.App?.animations?.clearDelay?.(collapsedNavFlyoutTimer) ?? window.clearTimeout(collapsedNavFlyoutTimer);
      collapsedNavFlyoutTimer = null;
    }
  };

  const removeCollapsedNavFlyout = () => {
    clearCollapsedNavFlyoutTimer();
    if (!collapsedNavFlyout) return;
    collapsedNavFlyout.remove();
    collapsedNavFlyout = null;
  };

  const scheduleCollapsedNavFlyoutClose = () => {
    clearCollapsedNavFlyoutTimer();
    collapsedNavFlyoutTimer = window.App?.animations?.schedule?.(120, () => {
      removeCollapsedNavFlyout();
    }) ?? window.setTimeout(() => {
      removeCollapsedNavFlyout();
    }, 120);
  };

  const isSidebarCollapsed = () => refs.shell?.classList.contains('sidebar-collapsed');

  const createCollapsedNavFlyout = (groupToggle, group) => {
    const subitems = [...group.querySelectorAll('.nav-subitem[data-page]')];
    if (!subitems.length || !isSidebarCollapsed()) return;

    removeCollapsedNavFlyout();

    const triggerRect = groupToggle.getBoundingClientRect();
    const flyout = document.createElement('div');
    flyout.className = 'sidebar-flyout';

    const currentPage = localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    const itemsHtml = subitems.map((item) => {
      const pageId = item.dataset.page || '';
      const active = pageId === currentPage ? ' is-active' : '';
      const label = (item.textContent || '').trim();
      return `<button class="sidebar-flyout-item${active}" type="button" data-page="${pageId}">${label}</button>`;
    }).join('');

    flyout.innerHTML = `
      <div class="sidebar-flyout-card">
        <div class="sidebar-flyout-items">${itemsHtml}</div>
      </div>
    `;

    flyout.style.top = `${Math.max(12, triggerRect.top)}px`;
    flyout.style.left = `${triggerRect.right + 12}px`;

    flyout.addEventListener('mouseenter', () => {
      clearCollapsedNavFlyoutTimer();
    });

    flyout.addEventListener('mouseleave', () => {
      scheduleCollapsedNavFlyoutClose();
    });

    flyout.addEventListener('click', (event) => {
      const button = event.target.closest('.sidebar-flyout-item[data-page]');
      if (!button) return;
      const pageId = button.dataset.page;
      if (!pageId) return;
      removeCollapsedNavFlyout();
      showPage(pageId);
    });

    document.body.appendChild(flyout);
    collapsedNavFlyout = flyout;

    const flyoutRect = flyout.getBoundingClientRect();
    const viewportBottom = window.innerHeight - 12;
    if (flyoutRect.bottom > viewportBottom) {
      const adjustedTop = Math.max(12, viewportBottom - flyoutRect.height);
      flyout.style.top = `${adjustedTop}px`;
    }
  };

  const syncSidebarCollapsedAttr = (collapsed) => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? '1' : '0';
  };

  const updateSidebarToggle = (collapsed) => {
    if (!refs.sidebarToggle) return;
    refs.sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    refs.sidebarToggle.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
    const label = refs.sidebarToggle.querySelector('.sidebar-toggle-label');
    if (label) label.textContent = collapsed ? '展开侧边栏' : '收起侧边栏';
  };

  const updateMobileMenuToggle = () => {
    if (!refs.mobileMenuBtn || !refs.shell) return;
    const open = refs.shell.classList.contains('sidebar-open');
    refs.mobileMenuBtn.setAttribute('aria-expanded', String(open));
    refs.mobileMenuBtn.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  };

  const setMobileSidebarOpen = (open) => {
    if (!refs.shell) return;
    refs.shell.classList.toggle('sidebar-open', Boolean(open));
    updateMobileMenuToggle();
  };

  const runSidebarTransition = (direction = '') => {
    if (!refs.shell) return;
    const animations = window.App?.animations;
    animations?.addClass?.(refs.shell, 'sidebar-transitioning') ?? refs.shell.classList.add('sidebar-transitioning');
    refs.shell.classList.toggle('sidebar-expanding', direction === 'expand');
    refs.shell.classList.toggle('sidebar-collapsing', direction === 'collapse');
    animations?.clearDelay?.(refs.sidebarTransitionTimer) ?? window.clearTimeout(refs.sidebarTransitionTimer);
    const clearTransitionState = () => {
      animations?.removeClass?.(refs.shell, 'sidebar-transitioning') ?? refs.shell?.classList.remove('sidebar-transitioning');
      refs.shell?.classList.remove('sidebar-expanding');
      refs.shell?.classList.remove('sidebar-collapsing');
    };
    refs.sidebarTransitionTimer = animations?.schedule?.(SIDEBAR_TRANSITION_MS, clearTransitionState)
      ?? window.setTimeout(clearTransitionState, SIDEBAR_TRANSITION_MS);
  };

  const updateAssistantToggle = () => {
    if (!refs.askAiToggle || !refs.shell) return;
    const collapsed = refs.shell.classList.contains('assistant-collapsed');
    refs.askAiToggle.setAttribute('aria-expanded', String(!collapsed));
    refs.askAiToggle.setAttribute('aria-label', collapsed ? '展开 Gjun AI' : '收起 Gjun AI');
  };

  const updateAssistantFullscreenToggle = () => {
    if (!refs.assistantExpandBtn || !refs.shell) return;
    const fullscreen = refs.shell.classList.contains('assistant-fullscreen');
    refs.assistantExpandBtn.setAttribute('aria-label', fullscreen ? '退出全屏' : '展开聊天区');
  };

  const syncAssistantCollapsedAttr = (collapsed) => {
    document.documentElement.dataset.assistantCollapsed = collapsed ? '1' : '0';
  };

  const syncAssistantFullscreenAttr = (fullscreen) => {
    document.documentElement.dataset.assistantFullscreen = fullscreen ? '1' : '0';
  };

  const clearAssistantFullscreenExitTimer = () => {
    if (assistantFullscreenExitTimer) {
      window.App?.animations?.clearDelay?.(assistantFullscreenExitTimer) ?? window.clearTimeout(assistantFullscreenExitTimer);
      assistantFullscreenExitTimer = null;
    }
  };

  const setAssistantCollapsed = (collapsed) => {
    if (!refs.shell) return;
    clearAssistantFullscreenExitTimer();
    if (!collapsed) {
      removeCollapsedNavFlyout();
    }
    if (collapsed) {
      refs.shell.classList.remove('assistant-fullscreen');
      refs.shell.classList.remove('assistant-fullscreen-open');
      syncAssistantFullscreenAttr(false);
    }
    refs.shell.classList.toggle('assistant-collapsed', collapsed);
    localStorage.setItem(constants.ASSISTANT_STATE_KEY, collapsed ? '1' : '0');
    syncAssistantCollapsedAttr(Boolean(collapsed));
    updateAssistantToggle();
    updateAssistantFullscreenToggle();
  };

  const setAssistantFullscreen = (fullscreen) => {
    if (!refs.shell) return;
    clearAssistantFullscreenExitTimer();
    removeCollapsedNavFlyout();

    if (fullscreen) {
      refs.shell.classList.remove('assistant-collapsed');
      refs.shell.classList.add('assistant-fullscreen');
      refs.shell.classList.remove('assistant-fullscreen-open');
      syncAssistantCollapsedAttr(false);
      syncAssistantFullscreenAttr(true);
      localStorage.setItem(constants.ASSISTANT_STATE_KEY, '0');
      updateAssistantToggle();
      updateAssistantFullscreenToggle();
      (window.App?.animations?.doubleFrame ?? ((callback) => requestAnimationFrame(() => requestAnimationFrame(callback))))(() => {
        void refs.shell?.offsetWidth;
        refs.shell?.classList.add('assistant-fullscreen-open');
        window.GJHApp?.chat?.renderChat?.();
      });
      return;
    }

    refs.shell.classList.remove('assistant-fullscreen-open');
    syncAssistantFullscreenAttr(false);
    assistantFullscreenExitTimer = window.App?.animations?.schedule?.(560, () => {
      refs.shell?.classList.remove('assistant-fullscreen');
      refs.shell?.classList.remove('assistant-fullscreen-open');
      updateAssistantFullscreenToggle();
      window.GJHApp?.chat?.renderChat?.();
      assistantFullscreenExitTimer = null;
    }) ?? window.setTimeout(() => {
      refs.shell?.classList.remove('assistant-fullscreen');
      refs.shell?.classList.remove('assistant-fullscreen-open');
      updateAssistantFullscreenToggle();
      window.GJHApp?.chat?.renderChat?.();
      assistantFullscreenExitTimer = null;
    }, 560);
  };

  const toggleAssistantFullscreen = () => {
    if (!refs.shell) return;
    const fullscreen = refs.shell.classList.contains('assistant-fullscreen');
    setAssistantFullscreen(!fullscreen);
  };

  const getNavLabel = (button) => {
    if (!button) return '';
    const label = button.querySelector('.nav-text');
    return (label?.textContent || button.textContent || '').trim();
  };

  const getPageDefinition = (pageId, fallbackLabel) => {
    return constants.PAGE_DEFS[pageId] || {
      title: fallbackLabel || '未命名页面',
      eyebrow: '业务模块',
      desc: `“${fallbackLabel || '当前模块'}”页面已生成业务工作台，可继续补充真实数据接口。`,
    };
  };

  const isAvailablePageId = (pageId) => Boolean(
    pageId && Object.prototype.hasOwnProperty.call(constants.PAGE_DEFS || {}, pageId)
  );

  const getRecentPages = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(constants.NAV_RECENT_PAGES_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
    } catch (error) {
      return [];
    }
  };

  const saveRecentPages = (pages) => {
    localStorage.setItem(constants.NAV_RECENT_PAGES_KEY, JSON.stringify(pages.slice(0, MAX_RECENT_PAGES)));
  };

  const removeRecentPage = (pageId) => {
    const recentPages = getRecentPages().filter((item) => item !== pageId);
    saveRecentPages(recentPages);
    return recentPages;
  };

  const getRenderedRecentPages = () => {
    if (!refs.topVisitedPages) return [];
    return [...refs.topVisitedPages.querySelectorAll('.top-visited-entry[data-visited-entry]')]
      .map((entry) => entry.getAttribute('data-visited-entry') || '')
      .filter(Boolean);
  };

  const saveRenderedRecentPages = () => {
    const pages = getRenderedRecentPages();
    if (pages.length) {
      saveRecentPages(pages);
    }
    return pages;
  };

  const getTopVisitedEntries = () => {
    if (!refs.topVisitedPages) return [];
    return [...refs.topVisitedPages.querySelectorAll('.top-visited-entry[data-visited-entry], .top-visited-placeholder')];
  };

  const getTopVisitedDropEntries = () => {
    if (!refs.topVisitedPages) return [];
    return [...refs.topVisitedPages.querySelectorAll('.top-visited-entry[data-visited-entry]:not(.is-dragging)')];
  };

  const animateTopVisitedReorder = (moveEntry) => {
    if (!refs.topVisitedPages) return;

    const entries = getTopVisitedEntries();
    const firstRects = new Map(entries.map((entry) => [entry, entry.getBoundingClientRect()]));
    moveEntry();

    const nextEntries = getTopVisitedEntries();
    nextEntries.forEach((entry) => {
      if (entry.classList.contains('is-dragging')) return;
      const firstRect = firstRects.get(entry);
      if (!firstRect) return;

      const nextRect = entry.getBoundingClientRect();
      const offsetX = firstRect.left - nextRect.left;
      const offsetY = firstRect.top - nextRect.top;
      if (!offsetX && !offsetY) return;

      entry.style.transition = 'none';
      entry.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    void refs.topVisitedPages.offsetHeight;

    nextEntries.forEach((entry) => {
      if (entry.classList.contains('is-dragging')) return;
      if (!firstRects.has(entry)) return;

      entry.style.transition = 'transform .24s cubic-bezier(.22,.9,.24,1), background-color .18s ease, border-color .18s ease';
      entry.style.transform = '';

      const clearInlineMotion = (transitionEvent) => {
        if (transitionEvent && transitionEvent.propertyName !== 'transform') return;
        entry.style.transition = '';
        entry.removeEventListener('transitionend', clearInlineMotion);
      };
      entry.addEventListener('transitionend', clearInlineMotion);
      window.App?.animations?.schedule?.(280, clearInlineMotion) ?? window.setTimeout(clearInlineMotion, 280);
    });
  };

  const createVisitedDragGhost = (entry, rect) => {
    const ghost = entry.cloneNode(true);
    ghost.classList.remove('is-dragging');
    ghost.classList.add('top-visited-drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    window.App?.animations?.nextFrame?.(() => ghost.remove()) ?? window.setTimeout(() => ghost.remove(), 0);
    return ghost;
  };

  const createVisitedPlaceholder = (rect) => {
    const placeholder = document.createElement('div');
    placeholder.className = 'top-visited-placeholder';
    placeholder.style.width = '0px';
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.opacity = '0';
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  };

  const openVisitedPlaceholder = () => {
    if (!visitedDragPlaceholder) return;
    visitedDragPlaceholder.classList.add('is-open');
    const width = visitedDragPlaceholder.dataset.width || '0';
    visitedDragPlaceholder.style.width = `${width}px`;
    visitedDragPlaceholder.style.opacity = '1';
  };

  const cleanupVisitedDrag = () => {
    draggedVisitedEntry?.classList.remove('is-dragging');
    draggedVisitedEntry?.removeAttribute('aria-hidden');
    draggedVisitedEntry = null;
    draggedVisitedOriginalNext = null;
    visitedDragPlaceholder?.remove();
    visitedDragPlaceholder = null;
    refs.topVisitedPages?.classList.remove('is-sorting');
  };

  const restoreDraggedVisitedEntry = () => {
    if (!refs.topVisitedPages || !draggedVisitedEntry) return;

    if (visitedDragPlaceholder?.parentNode === refs.topVisitedPages) {
      refs.topVisitedPages.insertBefore(draggedVisitedEntry, visitedDragPlaceholder);
      return;
    }

    if (draggedVisitedOriginalNext?.parentNode === refs.topVisitedPages) {
      refs.topVisitedPages.insertBefore(draggedVisitedEntry, draggedVisitedOriginalNext);
      return;
    }

    refs.topVisitedPages.appendChild(draggedVisitedEntry);
  };

  const returnDraggedVisitedEntry = () => {
    if (!refs.topVisitedPages || !draggedVisitedEntry) return;

    if (draggedVisitedOriginalNext?.parentNode === refs.topVisitedPages) {
      refs.topVisitedPages.insertBefore(draggedVisitedEntry, draggedVisitedOriginalNext);
      return;
    }

    refs.topVisitedPages.appendChild(draggedVisitedEntry);
  };

  const finishVisitedDrag = (commitOrder) => {
    if (!draggedVisitedPageId) return;

    if (commitOrder) {
      restoreDraggedVisitedEntry();
    } else {
      returnDraggedVisitedEntry();
    }

    saveRenderedRecentPages();
    const activePageId = localStorage.getItem(constants.NAV_PAGE_KEY) || '';
    draggedVisitedPageId = '';
    cleanupVisitedDrag();
    renderRecentPages(activePageId);
    suppressVisitedClick = true;
    window.App?.animations?.schedule?.(0, () => {
      suppressVisitedClick = false;
    }) ?? window.setTimeout(() => {
      suppressVisitedClick = false;
    }, 0);
  };

  const placeVisitedPlaceholder = (referenceEntry) => {
    if (!refs.topVisitedPages || !visitedDragPlaceholder) return;
    if (referenceEntry === visitedDragPlaceholder || visitedDragPlaceholder.nextSibling === referenceEntry) return;

    animateTopVisitedReorder(() => {
      refs.topVisitedPages.insertBefore(visitedDragPlaceholder, referenceEntry);
      window.App?.animations?.nextFrame?.(openVisitedPlaceholder) ?? requestAnimationFrame(openVisitedPlaceholder);
    });
  };

  const trackRecentPage = (pageId) => {
    const recentPages = getRecentPages().filter((item) => item !== pageId);
    recentPages.unshift(pageId);
    saveRecentPages(recentPages);
    return recentPages;
  };

  const renderRecentPages = (activePageId) => {
    if (!refs.topVisitedPages) return;

    const recentPages = getRecentPages()
      .filter((pageId) => constants.PAGE_DEFS[pageId] || document.querySelector(`[data-page="${pageId}"]`))
      .slice(0, MAX_RECENT_PAGES);

    if (!recentPages.length) {
      refs.topVisitedPages.innerHTML = '<div class="top-visited-empty">最近打开的页面会显示在这里</div>';
      return;
    }

    refs.topVisitedPages.innerHTML = recentPages.map((pageId) => {
      const active = pageId === activePageId ? ' is-active' : '';
      const button = document.querySelector(`[data-page="${pageId}"]`);
      const label = getPageDefinition(pageId, getNavLabel(button)).title || getNavLabel(button) || pageId;
      return `
        <div class="top-visited-entry${active}" draggable="true" data-visited-entry="${pageId}">
          <button class="top-visited-item${active}" type="button" data-visited-page="${pageId}">${label}</button>
          <button class="top-visited-remove" type="button" data-remove-visited-page="${pageId}" aria-label="移除 ${label}">×</button>
        </div>
      `;
    }).join('');
  };

  const bindTopVisitedDragging = () => {
    if (!refs.topVisitedPages) return;

    refs.topVisitedPages.addEventListener('dragstart', (event) => {
      if (event.target.closest('[data-remove-visited-page]')) {
        event.preventDefault();
        return;
      }

      const entry = event.target.closest('.top-visited-entry[data-visited-entry]');
      if (!entry) return;

      draggedVisitedPageId = entry.getAttribute('data-visited-entry') || '';
      if (!draggedVisitedPageId) {
        event.preventDefault();
        return;
      }

      draggedVisitedEntry = entry;
      draggedVisitedOriginalNext = entry.nextElementSibling;
      const entryRect = entry.getBoundingClientRect();
      visitedDragPlaceholder = createVisitedPlaceholder(entryRect);
      visitedDragPlaceholder.dataset.width = `${entryRect.width}`;
      entry.classList.add('is-dragging');
      entry.setAttribute('aria-hidden', 'true');
      refs.topVisitedPages.classList.add('is-sorting');

      if (event.dataTransfer) {
        const ghost = createVisitedDragGhost(entry, entryRect);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedVisitedPageId);
        event.dataTransfer.setDragImage(ghost, Math.min(entryRect.width / 2, event.offsetX || entryRect.width / 2), Math.min(entryRect.height / 2, event.offsetY || entryRect.height / 2));
      }

      (window.App?.animations?.nextFrame ?? ((callback) => requestAnimationFrame(callback)))(() => {
        animateTopVisitedReorder(() => {
          entry.remove();
        });
      });
    });

    refs.topVisitedPages.addEventListener('dragenter', (event) => {
      if (!draggedVisitedPageId || !visitedDragPlaceholder || visitedDragPlaceholder.parentNode) return;
      const nextEntry = getTopVisitedDropEntries().find((entry) => {
        const rect = entry.getBoundingClientRect();
        return event.clientX < rect.left + rect.width / 2;
      });
      animateTopVisitedReorder(() => {
        refs.topVisitedPages.insertBefore(visitedDragPlaceholder, nextEntry || null);
        window.App?.animations?.nextFrame?.(openVisitedPlaceholder) ?? requestAnimationFrame(openVisitedPlaceholder);
      });
    });

    refs.topVisitedPages.addEventListener('dragleave', (event) => {
      if (!draggedVisitedPageId || !visitedDragPlaceholder) return;
      if (refs.topVisitedPages.contains(event.relatedTarget)) return;
      animateTopVisitedReorder(() => {
        visitedDragPlaceholder.style.width = '0px';
        visitedDragPlaceholder.style.opacity = '0';
        visitedDragPlaceholder.classList.remove('is-open');
        window.App?.animations?.schedule?.(220, () => {
          if (!draggedVisitedPageId || visitedDragPlaceholder?.classList.contains('is-open')) return;
          visitedDragPlaceholder?.remove();
        }) ?? window.setTimeout(() => {
          if (!draggedVisitedPageId || visitedDragPlaceholder?.classList.contains('is-open')) return;
          visitedDragPlaceholder?.remove();
        }, 220);
      });
    });

    refs.topVisitedPages.addEventListener('dragover', (event) => {
      if (!draggedVisitedPageId) return;
      event.preventDefault();

      if (!visitedDragPlaceholder?.parentNode) {
        const nextEntry = getTopVisitedDropEntries().find((entry) => {
          const rect = entry.getBoundingClientRect();
          return event.clientX < rect.left + rect.width / 2;
        });
        placeVisitedPlaceholder(nextEntry || null);
        return;
      }

      if (event.target.closest('.top-visited-placeholder')) return;

      const targetEntry = event.target.closest('.top-visited-entry[data-visited-entry]:not(.is-dragging)');
      const entries = getTopVisitedDropEntries();
      if (!visitedDragPlaceholder || !entries.length) return;

      if (!targetEntry) {
        const nextEntry = entries.find((entry) => {
          const rect = entry.getBoundingClientRect();
          return event.clientX < rect.left + rect.width / 2;
        });
        placeVisitedPlaceholder(nextEntry || null);
        return;
      }

      const targetRect = targetEntry.getBoundingClientRect();
      const insertAfter = event.clientX > targetRect.left + targetRect.width / 2;
      const referenceEntry = insertAfter ? targetEntry.nextSibling : targetEntry;
      placeVisitedPlaceholder(referenceEntry);
    });

    refs.topVisitedPages.addEventListener('drop', (event) => {
      if (!draggedVisitedPageId) return;
      event.preventDefault();
      finishVisitedDrag(true);
    });

    document.addEventListener('dragover', (event) => {
      if (!draggedVisitedPageId) return;
      event.preventDefault();
    }, true);

    document.addEventListener('drop', (event) => {
      if (!draggedVisitedPageId) return;
      if (refs.topVisitedPages?.contains(event.target)) return;
      event.preventDefault();
      finishVisitedDrag(false);
    }, true);

    document.addEventListener('dragend', () => {
      finishVisitedDrag(false);
    }, true);
  };
  const setActiveNavPage = (pageId) => {
    refs.navPageButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.page === pageId);
    });

    document.querySelectorAll('.nav-group .nav-parent').forEach((parent) => {
      parent.classList.remove('active');
    });

    const activeButton = document.querySelector(`[data-page="${pageId}"]`);
    const group = activeButton?.closest('.nav-group');
    const parent = group?.querySelector('.nav-parent');
    if (parent && activeButton !== parent) {
      parent.classList.add('active');
    }
  };

  const showPage = (pageId, options = {}) => {
    pageId = isAvailablePageId(pageId) ? pageId : DEFAULT_PAGE_ID;
    const { scrollTop = true, trackRecent = true } = options;
    const isAiPage = pageId === 'ai-config';
    const isAnalysisPage = pageId === 'property-analysis';
    const isSpectrumPage = pageId === 'spectrum-analysis';
    const isImageCutoutPage = pageId === 'image-cutout';
    const isThemeSettingsPage = pageId === 'theme-settings';
    const isProjectSkillPage = pageId === 'project-skills';
    const isAiCallAnalysisPage = pageId === 'ai-call-analysis';
    const activeButton = document.querySelector(`[data-page="${pageId}"]`);
    const label = getNavLabel(activeButton);
    const def = getPageDefinition(pageId, label);

    refs.aiPageSection?.classList.toggle('active', isAiPage);
    refs.propertyAnalysisPageSection?.classList.toggle('active', isAnalysisPage);
    refs.spectrumAnalysisPageSection?.classList.toggle('active', isSpectrumPage);
    refs.imageCutoutPageSection?.classList.toggle('active', isImageCutoutPage);
    refs.themeSettingsPageSection?.classList.toggle('active', isThemeSettingsPage);
    refs.projectSkillPageSection?.classList.toggle('active', isProjectSkillPage);
    refs.aiCallAnalysisPageSection?.classList.toggle('active', isAiCallAnalysisPage);
    refs.placeholderPageSection?.classList.toggle('active', !isAiPage && !isAnalysisPage && !isSpectrumPage && !isImageCutoutPage && !isThemeSettingsPage && !isProjectSkillPage && !isAiCallAnalysisPage);
    refs.shell?.classList.toggle('page-other', !isAiPage);
    removeCollapsedNavFlyout();

    if (!isAiPage && !isAnalysisPage && !isSpectrumPage && !isImageCutoutPage && !isThemeSettingsPage && !isProjectSkillPage && !isAiCallAnalysisPage) {
      App.businessPages?.render?.(pageId, def);
    }
    if (isAiCallAnalysisPage) {
      App.aiCallAnalysis?.render?.();
    }

    setActiveNavPage(pageId);
    localStorage.setItem(constants.NAV_PAGE_KEY, pageId);
    if (trackRecent) {
      trackRecentPage(pageId);
    }
    renderRecentPages(pageId);

    if (scrollTop) {
      (window.App?.animations?.nextFrame ?? ((callback) => requestAnimationFrame(callback)))(() => {
        const content = document.querySelector('.content');
        content?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  const restoreLayoutState = () => {
    const sidebarCollapsed = localStorage.getItem(constants.SIDEBAR_STATE_KEY) === '1';
    const assistantCollapsed = localStorage.getItem(constants.ASSISTANT_STATE_KEY) === '1';

    refs.shell?.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    refs.shell?.classList.toggle('assistant-collapsed', assistantCollapsed);
    syncSidebarCollapsedAttr(sidebarCollapsed);
    syncAssistantCollapsedAttr(assistantCollapsed);
    syncAssistantFullscreenAttr(false);
    setMobileSidebarOpen(false);
    updateSidebarToggle(sidebarCollapsed);
    updateAssistantToggle();
    updateAssistantFullscreenToggle();
  };

  const bindNavigation = () => {
    if (refs.sidebarToggle) {
      refs.sidebarToggle.addEventListener('click', () => {
        const willCollapse = !refs.shell?.classList.contains('sidebar-collapsed');
        runSidebarTransition(willCollapse ? 'collapse' : 'expand');
        const collapsed = refs.shell?.classList.toggle('sidebar-collapsed');
        if (!collapsed) {
          removeCollapsedNavFlyout();
        }
        localStorage.setItem(constants.SIDEBAR_STATE_KEY, collapsed ? '1' : '0');
        syncSidebarCollapsedAttr(Boolean(collapsed));
        updateSidebarToggle(Boolean(collapsed));
      });
    }

    if (refs.sidebarSearch) {
      refs.sidebarSearch.addEventListener('click', (event) => {
        if (!refs.shell?.classList.contains('sidebar-collapsed')) return;
        event.preventDefault();
        event.stopPropagation();
        runSidebarTransition('expand');
        refs.shell.classList.remove('sidebar-collapsed');
        removeCollapsedNavFlyout();
        localStorage.setItem(constants.SIDEBAR_STATE_KEY, '0');
        syncSidebarCollapsedAttr(false);
        updateSidebarToggle(false);
        window.App?.animations?.nextFrame?.(() => refs.sidebarSearchInput?.focus())
          ?? requestAnimationFrame(() => refs.sidebarSearchInput?.focus());
      });
    }

    refs.mobileMenuBtn?.addEventListener('click', () => {
      setMobileSidebarOpen(!refs.shell?.classList.contains('sidebar-open'));
    });

    refs.groupToggles.forEach((groupToggle) => {
      groupToggle.addEventListener('click', () => {
        if (refs.shell?.classList.contains('sidebar-collapsed')) return;
        const group = groupToggle.closest('.nav-group');
        if (!group) return;
        const expanded = group.classList.toggle('expanded');
        groupToggle.setAttribute('aria-expanded', String(expanded));
      });

      const group = groupToggle.closest('.nav-group');
      if (!group) return;

      groupToggle.addEventListener('mouseenter', () => {
        if (!isSidebarCollapsed()) return;
        createCollapsedNavFlyout(groupToggle, group);
      });

      groupToggle.addEventListener('mouseleave', () => {
        if (!isSidebarCollapsed()) return;
        scheduleCollapsedNavFlyoutClose();
      });

      groupToggle.addEventListener('focus', () => {
        if (!isSidebarCollapsed()) return;
        createCollapsedNavFlyout(groupToggle, group);
      });

      group.addEventListener('mouseleave', () => {
        if (!isSidebarCollapsed()) return;
        scheduleCollapsedNavFlyoutClose();
      });
    });

    if (refs.askAiToggle) {
      updateAssistantToggle();
      refs.askAiToggle.addEventListener('click', () => {
        const collapsed = !refs.shell?.classList.contains('assistant-collapsed');
        setAssistantCollapsed(Boolean(collapsed));
      });
    }

    updateAssistantFullscreenToggle();

    refs.assistantExpandBtn?.addEventListener('click', () => {
      toggleAssistantFullscreen();
    });

    refs.assistantCloseBtn?.addEventListener('click', () => {
      if (refs.shell?.classList.contains('assistant-fullscreen')) {
        setAssistantFullscreen(false);
        return;
      }
      setAssistantCollapsed(true);
    });

    refs.navPageButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const pageId = button.dataset.page;
        if (pageId) {
          showPage(pageId);
          setMobileSidebarOpen(false);
        }
      });
    });

    bindTopVisitedDragging();
    refs.topVisitedPages?.addEventListener('click', (event) => {
      if (suppressVisitedClick) return;

      const removeButton = event.target.closest('[data-remove-visited-page]');
      if (removeButton) {
        const pageId = removeButton.getAttribute('data-remove-visited-page') || '';
        if (pageId) {
          removeRecentPage(pageId);
          renderRecentPages(localStorage.getItem(constants.NAV_PAGE_KEY) || '');
        }
        return;
      }

      const button = event.target.closest('[data-visited-page]');
      if (!button) return;
      const pageId = button.getAttribute('data-visited-page') || '';
      if (pageId) showPage(pageId, { trackRecent: false });
    });

    const savedPage = localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    showPage(savedPage, { scrollTop: false });
    restoreLayoutState();

    window.addEventListener('resize', removeCollapsedNavFlyout);
    window.addEventListener('scroll', removeCollapsedNavFlyout, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        removeCollapsedNavFlyout();
        setMobileSidebarOpen(false);
      }
    });
    document.addEventListener('click', (event) => {
      if (refs.shell?.classList.contains('sidebar-open')) {
        const target = event.target;
        if (!target.closest('.sidebar') && !target.closest('#mobileMenuBtn')) {
          setMobileSidebarOpen(false);
        }
      }

      if (!collapsedNavFlyout) return;
      if (event.target.closest('.sidebar-flyout') || event.target.closest('.nav-group')) return;
      removeCollapsedNavFlyout();
    });
  };

  App.navigation = {
    init: bindNavigation,
    showPage,
    restoreLayoutState,
    setAssistantCollapsed,
    updateSidebarToggle,
    updateAssistantToggle,
  };
})();
