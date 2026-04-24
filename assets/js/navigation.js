(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants } = App;
  let assistantFullscreenExitTimer = null;
  let collapsedNavFlyout = null;
  let collapsedNavFlyoutTimer = null;
  const MAX_RECENT_PAGES = 8;

  const clearCollapsedNavFlyoutTimer = () => {
    if (collapsedNavFlyoutTimer) {
      window.clearTimeout(collapsedNavFlyoutTimer);
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
    collapsedNavFlyoutTimer = window.setTimeout(() => {
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
      window.clearTimeout(assistantFullscreenExitTimer);
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
      requestAnimationFrame(() => {
        void refs.shell?.offsetWidth;
        requestAnimationFrame(() => {
          refs.shell?.classList.add('assistant-fullscreen-open');
          window.GJHApp?.chat?.renderChat?.();
        });
      });
      return;
    }

    refs.shell.classList.remove('assistant-fullscreen-open');
    syncAssistantFullscreenAttr(false);
    assistantFullscreenExitTimer = window.setTimeout(() => {
      refs.shell?.classList.remove('assistant-fullscreen');
      refs.shell?.classList.remove('assistant-fullscreen-open');
      updateAssistantFullscreenToggle();
      window.GJHApp?.chat?.renderChat?.();
      assistantFullscreenExitTimer = null;
    }, 420);
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
      eyebrow: '功能开发中',
      desc: `“${fallbackLabel || '当前模块'}”页面正在开发中，当前先保留占位提示。`,
    };
  };

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
        <div class="top-visited-entry${active}">
          <button class="top-visited-item${active}" type="button" data-visited-page="${pageId}">${label}</button>
          <button class="top-visited-remove" type="button" data-remove-visited-page="${pageId}" aria-label="移除 ${label}">×</button>
        </div>
      `;
    }).join('');
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
    const { scrollTop = true, trackRecent = true } = options;
    const isAiPage = pageId === 'ai-config';
    const isAnalysisPage = pageId === 'property-analysis';
    const activeButton = document.querySelector(`[data-page="${pageId}"]`);
    const label = getNavLabel(activeButton);
    const def = getPageDefinition(pageId, label);

    refs.aiPageSection?.classList.toggle('active', isAiPage);
    refs.propertyAnalysisPageSection?.classList.toggle('active', isAnalysisPage);
    refs.placeholderPageSection?.classList.toggle('active', !isAiPage && !isAnalysisPage);
    refs.shell?.classList.toggle('page-other', !isAiPage);
    removeCollapsedNavFlyout();

    if (!isAiPage && !isAnalysisPage) {
      if (refs.placeholderEyebrow) refs.placeholderEyebrow.textContent = def.eyebrow || '功能开发中';
      if (refs.placeholderTitle) refs.placeholderTitle.textContent = def.title || label || '功能开发中';
      if (refs.placeholderDesc) refs.placeholderDesc.textContent = def.desc || `“${label || def.title}”页面正在开发中。`;
      if (refs.placeholderBackBtn) refs.placeholderBackBtn.textContent = '返回 AI 配置';
      if (refs.placeholderOpenBtn) refs.placeholderOpenBtn.textContent = '查看仪表盘';
    }

    setActiveNavPage(pageId);
    localStorage.setItem(constants.NAV_PAGE_KEY, pageId);
    if (trackRecent) {
      trackRecentPage(pageId);
    }
    renderRecentPages(pageId);

    if (scrollTop) {
      requestAnimationFrame(() => {
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
    updateSidebarToggle(sidebarCollapsed);
    updateAssistantToggle();
    updateAssistantFullscreenToggle();
  };

  const bindNavigation = () => {
    if (refs.sidebarToggle) {
      refs.sidebarToggle.addEventListener('click', () => {
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
        refs.shell.classList.remove('sidebar-collapsed');
        removeCollapsedNavFlyout();
        localStorage.setItem(constants.SIDEBAR_STATE_KEY, '0');
        syncSidebarCollapsedAttr(false);
        updateSidebarToggle(false);
        requestAnimationFrame(() => refs.sidebarSearchInput?.focus());
      });
    }

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
        if (pageId) showPage(pageId);
      });
    });

    refs.placeholderBackBtn?.addEventListener('click', () => showPage('ai-config'));
    refs.placeholderOpenBtn?.addEventListener('click', () => showPage('dashboard'));
    refs.topVisitedPages?.addEventListener('click', (event) => {
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
      }
    });
    document.addEventListener('click', (event) => {
      if (!collapsedNavFlyout) return;
      if (event.target.closest('.sidebar-flyout') || event.target.closest('.nav-group')) return;
      removeCollapsedNavFlyout();
    });
  };

  App.navigation = {
    init: bindNavigation,
    showPage,
    restoreLayoutState,
    updateSidebarToggle,
    updateAssistantToggle,
  };
})();
