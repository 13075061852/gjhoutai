(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants } = App;
  let assistantFullscreenExitTimer = null;

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
    const { scrollTop = true } = options;
    const isAiPage = pageId === 'ai-config';
    const activeButton = document.querySelector(`[data-page="${pageId}"]`);
    const label = getNavLabel(activeButton);
    const def = getPageDefinition(pageId, label);

    refs.aiPageSection?.classList.toggle('active', isAiPage);
    refs.placeholderPageSection?.classList.toggle('active', !isAiPage);
    refs.shell?.classList.toggle('page-other', !isAiPage);

    if (!isAiPage) {
      if (refs.placeholderEyebrow) refs.placeholderEyebrow.textContent = def.eyebrow || '功能开发中';
      if (refs.placeholderTitle) refs.placeholderTitle.textContent = def.title || label || '功能开发中';
      if (refs.placeholderDesc) refs.placeholderDesc.textContent = def.desc || `“${label || def.title}”页面正在开发中。`;
      if (refs.placeholderBackBtn) refs.placeholderBackBtn.textContent = '返回 AI 配置';
      if (refs.placeholderOpenBtn) refs.placeholderOpenBtn.textContent = '查看仪表盘';
    }

    setActiveNavPage(pageId);
    localStorage.setItem(constants.NAV_PAGE_KEY, pageId);

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
        localStorage.setItem(constants.SIDEBAR_STATE_KEY, collapsed ? '1' : '0');
        updateSidebarToggle(Boolean(collapsed));
      });
    }

    if (refs.sidebarSearch) {
      refs.sidebarSearch.addEventListener('click', (event) => {
        if (!refs.shell?.classList.contains('sidebar-collapsed')) return;
        event.preventDefault();
        event.stopPropagation();
        refs.shell.classList.remove('sidebar-collapsed');
        localStorage.setItem(constants.SIDEBAR_STATE_KEY, '0');
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

    const savedPage = localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    showPage(savedPage, { scrollTop: false });
    restoreLayoutState();
  };

  App.navigation = {
    init: bindNavigation,
    showPage,
    restoreLayoutState,
    updateSidebarToggle,
    updateAssistantToggle,
  };
})();
