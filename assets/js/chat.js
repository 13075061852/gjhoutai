(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, state, utils } = App;
  const NEW_CONVERSATION_TITLE = '新建对话';
  let conversationMenuOpen = false;
  let pendingDraftImages = [];
  let streamRenderTimer = 0;

  const nowIso = () => new Date().toISOString();

  const makeSessionId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const normalizeMessage = (message) => ({
    role: message?.role === 'user' || message?.role === 'assistant' ? message.role : 'system',
    content: String(message?.content || ''),
    images: Array.isArray(message?.images) ? message.images.map((item) => {
      const type = String(item?.type || 'image_url') === 'image_note' ? 'image_note' : String(item?.type || 'image_url');
      const rawUrl = String(item?.image_url?.url || item?.url || '');
      const isPersistedDataImage = rawUrl.startsWith('data:image/');
      if (type === 'image_note' || isPersistedDataImage) {
        return {
          type: 'image_note',
          image_url: { url: '' },
          label: String(item?.label || '已附带图片（历史图片已清理）'),
        };
      }
      return {
        type,
        image_url: { url: rawUrl },
        preview_url: rawUrl.startsWith('data:image/') ? '' : String(item?.preview_url || item?.previewUrl || rawUrl),
        label: String(item?.label || ''),
      };
    }).filter((item) => item.type === 'image_note' || item.image_url.url) : [],
    tokenUsage: message?.tokenUsage && typeof message.tokenUsage === 'object' ? {
      promptTokens: Number(message.tokenUsage.promptTokens || 0),
      completionTokens: Number(message.tokenUsage.completionTokens || 0),
      totalTokens: Number(message.tokenUsage.totalTokens || 0),
      contextLength: Number(message.tokenUsage.contextLength || 0),
      remainingContext: Number(message.tokenUsage.remainingContext || 0),
      estimated: Boolean(message.tokenUsage.estimated),
      model: String(message.tokenUsage.model || ''),
    } : null,
  });

  const deriveSessionTitle = (messages) => {
    const firstUser = (messages || []).find((item) => item.role === 'user');
    const raw = String(firstUser?.content || '').trim().replace(/\s+/g, ' ');
    if (!raw) return NEW_CONVERSATION_TITLE;
    return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
  };

  const getNextConversationTitle = () => {
    const baseTitle = NEW_CONVERSATION_TITLE;
    const matches = state.chatSessions
      .map((session) => String(session?.title || '').trim())
      .filter((title) => title === baseTitle || title.startsWith(`${baseTitle} `));

    if (!matches.length) return baseTitle;

    const usedNumbers = new Set();
    matches.forEach((title) => {
      const suffix = title.slice(baseTitle.length).trim();
      if (!suffix) {
        usedNumbers.add(1);
        return;
      }
      const numeric = Number.parseInt(suffix, 10);
      if (Number.isFinite(numeric) && numeric > 0) {
        usedNumbers.add(numeric);
      }
    });

    let nextNumber = 2;
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    return `${baseTitle} ${nextNumber}`;
  };

  const normalizeSession = (session) => {
    const messages = Array.isArray(session?.messages) ? session.messages.map(normalizeMessage) : [];
    const updatedAt = String(session?.updatedAt || session?.createdAt || nowIso());
    return {
      id: String(session?.id || makeSessionId()),
      title: String(session?.title || '').trim() || deriveSessionTitle(messages),
      messages,
      createdAt: String(session?.createdAt || updatedAt),
      updatedAt,
    };
  };

  const getActiveSession = () => {
    if (!state.chatSessions.length) return null;
    return state.chatSessions.find((session) => session.id === state.chatSessionId) || state.chatSessions[0];
  };

  const isFreshSession = () => {
    const session = getActiveSession();
    return !session || session.messages.length === 0;
  };

  const isAssistantFullscreen = () => Boolean(refs.shell?.classList.contains('assistant-fullscreen'));

  const getFilteredSessions = () => {
    const query = String(state.conversationMenuQuery || '').trim().toLowerCase();
    const sessions = [...state.chatSessions].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    if (!query) return sessions;

    return sessions.filter((session) => {
      const text = [
        session.title,
        session.messages.map((item) => item.content).join(' '),
      ].join(' ').toLowerCase();
      return text.includes(query);
    });
  };

  const getGroupedSessions = (sessions) => {
    return sessions.reduce((acc, session) => {
      const bucket = getSessionBucket(session);
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(session);
      return acc;
    }, {});
  };

  const saveChatState = () => {
    const activeSession = getActiveSession();
    const stripPersistedImages = (message) => {
      const images = Array.isArray(message.images) ? message.images : [];
      if (!images.length) return [];
      return [{
        type: 'image_note',
        image_url: { url: '' },
        label: `已附带 ${images.length} 张图片（仅本轮发送，不保存原图）`,
      }];
    };
    const sessionsToSave = state.chatSessions.map((session) => ({
      id: session.id,
      title: session.title,
      messages: session.messages.map((item) => ({
        ...item,
        images: stripPersistedImages(item),
        tokenUsage: item.tokenUsage || null,
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));

    utils.writeJson(constants.CHAT_SESSIONS_KEY, sessionsToSave);
    utils.writeJson(constants.CHAT_ACTIVE_SESSION_KEY, activeSession?.id || '');
    utils.writeJson(constants.CHAT_STORAGE_KEY, sessionsToSave.find((session) => session.id === activeSession?.id)?.messages || []);
  };

  const loadChatState = () => {
    const storedSessions = utils.readJson(constants.CHAT_SESSIONS_KEY, null);
    const storedActiveId = utils.readJson(constants.CHAT_ACTIVE_SESSION_KEY, '');

    if (Array.isArray(storedSessions) && storedSessions.length) {
      const sessions = storedSessions.map(normalizeSession);
      const activeSession = sessions.find((session) => session.id === storedActiveId) || sessions[0];
      return { sessions, activeId: activeSession?.id || sessions[0].id };
    }

    const legacyHistory = utils.readJson(constants.CHAT_STORAGE_KEY, []);
    if (Array.isArray(legacyHistory) && legacyHistory.length) {
      const session = normalizeSession({
        id: makeSessionId(),
        title: deriveSessionTitle(legacyHistory),
        messages: legacyHistory,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      return { sessions: [session], activeId: session.id };
    }

    const session = normalizeSession({
      id: makeSessionId(),
      title: NEW_CONVERSATION_TITLE,
      messages: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return { sessions: [session], activeId: session.id };
  };

  const isChatNearBottom = () => {
    if (!refs.chatMessages) return true;
    const distance = refs.chatMessages.scrollHeight - refs.chatMessages.scrollTop - refs.chatMessages.clientHeight;
    return distance < 96;
  };

  const scrollChatToBottom = () => {
    if (!refs.chatMessages) return;
    requestAnimationFrame(() => {
      refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
    });
  };

  const formatNumber = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0';
  };

  const renderTokenUsage = (usage) => {
    if (!usage || !Number(usage.totalTokens)) return '';
    const contextLength = Number(usage.contextLength || 0);
    const remaining = Number(usage.remainingContext || 0);
    const contextText = contextLength
      ? `剩余上下文 ${formatNumber(Math.max(0, remaining))} / ${formatNumber(contextLength)}`
      : '上下文上限未知';
    const estimateText = usage.estimated ? '估算' : '接口返回';
    return `
      <div class="ai-token-meta" title="Token ${estimateText}。输入包含系统提示词、聊天历史、管家检索上下文和当前问题。">
        <span>本轮 ${formatNumber(usage.totalTokens)} tokens</span>
        <span>输入 ${formatNumber(usage.promptTokens)}</span>
        <span>输出 ${formatNumber(usage.completionTokens)}</span>
        <span>${contextText}</span>
        <span>${estimateText}</span>
      </div>
    `;
  };

  const renderChatMessages = (options = {}) => {
    if (!refs.chatMessages) return;
    const shouldStickToBottom = options.forceScroll || (options.autoScroll !== false && isChatNearBottom());
    const intro = refs.chatIntroText;
    const items = state.chatHistory;

    refs.chatMessages.innerHTML = items.length
      ? items.map((item) => {
          const images = Array.isArray(item.images) && item.images.length
            ? `<div class="ai-message-images">${item.images.map((image) => {
                if (image?.type === 'image_note') {
                  return `<div class="ai-image-note">${utils.escapeHtml(image.label || '已附带图片')}</div>`;
                }
                const imageUrl = String(image?.image_url?.url || image?.url || '').trim();
                if (!imageUrl) return '';
                const previewUrl = String(image?.preview_url || image?.previewUrl || imageUrl).trim();
                return `<button class="ai-message-image-btn" type="button" data-chat-image-preview="${utils.escapeHtml(previewUrl)}" aria-label="放大查看原图"><img class="ai-message-image" src="${utils.escapeHtml(imageUrl)}" alt="AI 生成图片" loading="lazy" /></button>`;
              }).join('')}</div>`
            : '';
          const tokenMeta = item.role === 'assistant' ? renderTokenUsage(item.tokenUsage) : '';
          return `<div class="ai-message ${item.role === 'user' ? 'user' : ''}"><div class="ai-message-content">${utils.markdownLite(item.content)}</div>${images}${tokenMeta}</div>`;
        }).join('')
      : '';

    if (intro) {
      const hasKey = Boolean((App.config.getFormConfig().apiKey || '').trim());
      const resolvedModel = App.config.getResolvedModel();
      intro.textContent = hasKey
        ? `已连接到 ${resolvedModel || '未选择模型'}，可以直接在这里对话。`
        : '先保存 OpenRouter 配置，然后就可以在这里直接发起分析。';
    }

    if (shouldStickToBottom) scrollChatToBottom();
  };

  const closeChatImagePreview = () => {
    document.querySelector('.chat-image-preview')?.remove();
  };

  const openChatImagePreview = (imageUrl) => {
    const url = String(imageUrl || '').trim();
    if (!url) return;
    closeChatImagePreview();
    const preview = document.createElement('div');
    preview.className = 'chat-image-preview';
    preview.innerHTML = `
      <button class="chat-image-preview-close" type="button" aria-label="关闭图片预览">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
      <img src="${utils.escapeHtml(url)}" alt="图片预览" />
    `;
    preview.addEventListener('click', (event) => {
      if (event.target === preview || event.target.closest('.chat-image-preview-close')) {
        closeChatImagePreview();
      }
    });
    document.body.appendChild(preview);
  };

  const mountConversationMenu = () => {
    if (!refs.conversationMenuPanel || !refs.conversationMenuWrap) return;
    if (refs.conversationMenuPanel.parentElement !== document.body) {
      document.body.appendChild(refs.conversationMenuPanel);
    }
    refs.conversationMenuPanel.classList.add('assistant-convo-menu-floating');
  };

  const unmountConversationMenu = () => {
    if (!refs.conversationMenuPanel || !refs.conversationMenuWrap) return;
    if (refs.conversationMenuPanel.parentElement !== refs.conversationMenuWrap) {
      refs.conversationMenuWrap.appendChild(refs.conversationMenuPanel);
    }
    refs.conversationMenuPanel.classList.remove('assistant-convo-menu-floating');
    refs.conversationMenuPanel.style.removeProperty('--menu-top');
    refs.conversationMenuPanel.style.removeProperty('--menu-left');
    refs.conversationMenuPanel.style.removeProperty('--menu-width');
    refs.conversationMenuPanel.style.removeProperty('--menu-max-height');
  };

  const updateConversationMenuPosition = () => {
    if (!refs.conversationMenuPanel || !refs.conversationMenuBtn) return;

    const rect = refs.conversationMenuBtn.getBoundingClientRect();
    const width = Math.max(240, Math.min(340, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 4, window.innerHeight - 24);
    const maxHeight = Math.max(180, window.innerHeight - top - 12);

    refs.conversationMenuPanel.style.setProperty('--menu-top', `${top}px`);
    refs.conversationMenuPanel.style.setProperty('--menu-left', `${left}px`);
    refs.conversationMenuPanel.style.setProperty('--menu-width', `${width}px`);
    refs.conversationMenuPanel.style.setProperty('--menu-max-height', `${maxHeight}px`);
  };

  const closeConversationMenu = () => {
    if (refs.conversationMenuPanel) refs.conversationMenuPanel.hidden = true;
    refs.conversationMenuBtn?.setAttribute('aria-expanded', 'false');
    conversationMenuOpen = false;
    unmountConversationMenu();
  };

  const deleteConversation = (sessionId) => {
    const session = state.chatSessions.find((item) => item.id === sessionId);
    if (!session) return;

    const confirmed = window.confirm(`确定删除「${session.title || NEW_CONVERSATION_TITLE}」吗？此操作不可恢复。`);
    if (!confirmed) return;

    const remaining = state.chatSessions.filter((item) => item.id !== sessionId);
    if (remaining.length) {
      state.chatSessions = remaining;
      const nextActive = remaining.find((item) => item.id === state.chatSessionId) || remaining[0];
      state.chatSessionId = nextActive.id;
      state.chatHistory = nextActive.messages;
    } else {
      const freshSession = normalizeSession({
        id: makeSessionId(),
        title: NEW_CONVERSATION_TITLE,
        messages: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      state.chatSessions = [freshSession];
      state.chatSessionId = freshSession.id;
      state.chatHistory = freshSession.messages;
    }

    saveChatState();
    renderChat();
    if (conversationMenuOpen) renderConversationMenu();
  };

  const formatRelativeAge = (isoValue) => {
    const time = new Date(isoValue || Date.now()).getTime();
    if (!Number.isFinite(time)) return '';
    const diffHours = Math.max(0, Math.round((Date.now() - time) / 36e5));
    if (diffHours < 24) return `${Math.max(1, diffHours)}h`;
    return `${Math.max(1, Math.round(diffHours / 24))}d`;
  };

  const getSessionBucket = (session) => {
    const updated = new Date(session?.updatedAt || session?.createdAt || Date.now()).getTime();
    if (!Number.isFinite(updated)) return '更早';
    const diffDays = (Date.now() - updated) / 86400000;
    if (diffDays < 1) return '今天';
    if (diffDays < 7) return '最近一周';
    if (diffDays < 30) return '最近一个月';
    return '更早';
  };

  const renderFullscreenSidebar = () => {
    if (!refs.assistantFullscreenSidebar) return;

    const query = String(state.conversationMenuQuery || '').trim();
    const sessions = getFilteredSessions();
    const grouped = getGroupedSessions(sessions);
    const bucketOrder = ['今天', '最近一周', '最近一个月', '更早'];

    if (refs.assistantFullscreenSearch && refs.assistantFullscreenSearch.value !== query) {
      refs.assistantFullscreenSearch.value = query;
    }

    refs.assistantFullscreenSidebar.innerHTML = `
      <div class="assistant-fs-sidebar-shell">
        ${bucketOrder.map((bucket) => {
          const items = grouped[bucket] || [];
          if (!items.length) return '';
          return `
            <section class="assistant-fs-section">
              <div class="assistant-fs-section-title">${bucket}</div>
              <div class="assistant-fs-section-list">
                ${items.map((session) => {
                  const active = session.id === state.chatSessionId ? ' active' : '';
                  const title = utils.escapeHtml(session.title || NEW_CONVERSATION_TITLE);
                  const lastMessage = session.messages.length ? session.messages[session.messages.length - 1] : null;
                  const preview = session.messages.find((item) => item.role === 'user')?.content || lastMessage?.content || '';
                  const previewText = utils.escapeHtml(String(preview).trim().replace(/\s+/g, ' ').slice(0, 72) || '暂无消息');
                  const ageText = utils.escapeHtml(formatRelativeAge(session.updatedAt || session.createdAt));
                  return `
                    <button class="assistant-fs-item${active}" type="button" data-fs-session-id="${utils.escapeHtml(session.id)}">
                      <span class="assistant-fs-item-main">
                        <span class="assistant-fs-item-title">${title}</span>
                        <span class="assistant-fs-item-preview">${previewText}</span>
                      </span>
                      <span class="assistant-fs-item-age">${ageText}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </section>
          `;
        }).join('') || '<div class="assistant-fs-empty">暂无对话</div>'}
      </div>
    `;

    refs.assistantFullscreenSidebar.querySelectorAll('[data-fs-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = button.getAttribute('data-fs-session-id');
        if (sessionId) setActiveSession(sessionId);
      });
    });
  };

  const renderConversationMenu = () => {
    if (!refs.conversationMenuPanel) return;

    const query = String(state.conversationMenuQuery || '').trim().toLowerCase();
    const sessions = [...state.chatSessions].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const filtered = query
      ? sessions.filter((session) => {
          const text = [
            session.title,
            session.messages.map((item) => item.content).join(' '),
          ].join(' ').toLowerCase();
          return text.includes(query);
        })
      : sessions;

    const grouped = filtered.reduce((acc, session) => {
      const bucket = getSessionBucket(session);
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(session);
      return acc;
    }, {});

    const bucketOrder = ['今天', '最近一周', '最近一个月', '更早'];
    const sectionsHtml = bucketOrder.map((bucket) => {
      const items = grouped[bucket] || [];
      if (!items.length) return '';
      return `
        <section class="assistant-convo-section">
          <div class="assistant-convo-section-title">${bucket}</div>
          <div class="assistant-convo-section-list">
            ${items.map((session) => {
              const active = session.id === state.chatSessionId ? ' active' : '';
              const title = utils.escapeHtml(session.title || NEW_CONVERSATION_TITLE);
              const lastMessage = session.messages.length ? session.messages[session.messages.length - 1] : null;
              const preview = session.messages.find((item) => item.role === 'user')?.content || lastMessage?.content || '';
              const previewText = utils.escapeHtml(String(preview).trim().replace(/\s+/g, ' ').slice(0, 72) || '暂无消息');
              const ageText = utils.escapeHtml(formatRelativeAge(session.updatedAt || session.createdAt));
                  return `
                <div class="assistant-convo-menu-item${active}">
                  <button class="assistant-convo-menu-item-main" type="button" role="menuitem" data-session-id="${utils.escapeHtml(session.id)}">
                    <span class="assistant-convo-menu-main">
                      <span class="assistant-convo-menu-title">${title}</span>
                      <span class="assistant-convo-menu-meta">${previewText}</span>
                    </span>
                    <span class="assistant-convo-menu-age">${ageText}</span>
                  </button>
                  <button class="assistant-convo-delete-btn" type="button" aria-label="删除对话" data-delete-session-id="${utils.escapeHtml(session.id)}">
                    <i class="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('');

    refs.conversationMenuPanel.innerHTML = `
      <div class="assistant-convo-menu-shell">
        <div class="assistant-convo-search">
          <i class="assistant-convo-search-icon ti ti-search" aria-hidden="true"></i>
          <input id="conversationMenuSearch" class="assistant-convo-search-input" type="search" placeholder="搜索..." value="${utils.escapeHtml(state.conversationMenuQuery || '')}" aria-label="搜索对话" />
        </div>
        <div class="assistant-convo-menu-scroll">
          ${sectionsHtml || '<div class="assistant-convo-empty">暂无对话</div>'}
        </div>
        <div class="assistant-convo-menu-footer">
          <button class="assistant-convo-create-btn" type="button" data-action="create-new">+ 新建对话</button>
        </div>
      </div>
    `;

    const searchInput = refs.conversationMenuPanel.querySelector('#conversationMenuSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.conversationMenuQuery = searchInput.value || '';
        renderConversationMenu();
        renderFullscreenSidebar();
      });
    }

    refs.conversationMenuPanel.querySelectorAll('[data-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = button.getAttribute('data-session-id');
        if (sessionId) {
          setActiveSession(sessionId);
          closeConversationMenu();
        }
      });
    });

    refs.conversationMenuPanel.querySelectorAll('[data-delete-session-id]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const sessionId = button.getAttribute('data-delete-session-id');
        if (sessionId) deleteConversation(sessionId);
      });
    });

    refs.conversationMenuPanel.querySelector('[data-action="create-new"]')?.addEventListener('click', () => {
      createNewConversation();
    });

    if (conversationMenuOpen) {
      mountConversationMenu();
      updateConversationMenuPosition();
    }
  };

  const updateHeaderState = () => {
    const activeSession = getActiveSession();
    if (refs.conversationMenuLabel) {
      refs.conversationMenuLabel.textContent = activeSession?.title || NEW_CONVERSATION_TITLE;
    }
    if (refs.assistantFullscreenTitle) {
      refs.assistantFullscreenTitle.textContent = activeSession?.title || NEW_CONVERSATION_TITLE;
    }
    if (refs.assistantNewBtn) {
      refs.assistantNewBtn.disabled = false;
      refs.assistantNewBtn.setAttribute('aria-disabled', 'false');
      refs.assistantNewBtn.setAttribute('title', '新建窗口');
    }
    if (refs.assistantFullscreenNewBtn) {
      refs.assistantFullscreenNewBtn.disabled = false;
      refs.assistantFullscreenNewBtn.setAttribute('aria-disabled', 'false');
      refs.assistantFullscreenNewBtn.setAttribute('title', '新建窗口');
    }
    renderConversationMenu();
    renderFullscreenSidebar();
  };

  const renderChat = () => {
    renderChatMessages({ forceScroll: true });
    updateHeaderState();
  };
  const setActiveSession = (sessionId) => {
    const session = state.chatSessions.find((item) => item.id === sessionId);
    if (!session) return;
    state.chatSessionId = session.id;
    state.chatHistory = session.messages;
    saveChatState();
    renderChat();
    requestAnimationFrame(() => refs.chatInput?.focus());
  };

  const createNewConversation = () => {
    const session = normalizeSession({
      id: makeSessionId(),
      title: getNextConversationTitle(),
      messages: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    state.chatSessions.unshift(session);
    state.chatSessionId = session.id;
    state.chatHistory = session.messages;
    saveChatState();
    renderChat();
    requestAnimationFrame(() => refs.chatInput?.focus());
  };

  const normalizeImages = (images) => (Array.isArray(images) ? images.map((item) => ({
    type: String(item?.type || 'image_url'),
    image_url: {
      url: String(item?.image_url?.url || item?.url || ''),
    },
    preview_url: String(item?.preview_url || item?.previewUrl || item?.image_url?.url || item?.url || ''),
  })).filter((item) => item.image_url.url) : []);

  const draftPrompt = (prompt, options = {}) => {
    const value = String(prompt || '').trim();
    if (!value || !refs.chatInput) return;

    if (options.newConversation && !isFreshSession()) {
      createNewConversation();
    }

    pendingDraftImages = normalizeImages(options.images).slice(0, 1);
    refs.chatInput.value = value;
    refs.chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    App.navigation?.setAssistantCollapsed?.(false);
    requestAnimationFrame(() => {
      refs.chatInput?.focus();
      const length = refs.chatInput.value.length;
      refs.chatInput.setSelectionRange?.(length, length);
    });
  };

  const getActivePageId = () => {
    try {
      return localStorage.getItem(constants.NAV_PAGE_KEY) || '';
    } catch {
      return '';
    }
  };

  const getProjectContext = () => [
    '【项目背景】',
    '你正在广俊塑料科技后台管理系统中工作。',
    '项目当前包含物性分析、图谱分析、抠图助手、主题设置和配置中心。',
    '回答时优先结合当前页面上下文、已选数据、筛选条件和业务字段；涉及材料数据时给出结论、风险和下一步建议。',
  ].join('\n');

  const getAttachedDataContext = (prompt) => {
    const pageId = getActivePageId();
    if (App.agentButler?.buildContext) {
      return App.agentButler.buildContext({
        question: prompt,
        activePageId: pageId,
        forceCurrentPage: Boolean(state.dataAttachmentEnabled),
      });
    }

    if (pageId === 'property-analysis') {
      return App.propertyAnalysis?.getSelectedAiContext?.(prompt)
        || App.propertyAnalysis?.getAiContext?.()
        || '【已请求接入数据】物性分析数据尚未加载完成。';
    }

    if (pageId === 'spectrum-analysis') {
      return App.spectrumAnalysis?.getAiContext?.() || '【已请求接入数据】图谱分析数据尚未加载完成。';
    }

    return '【已请求接入数据】当前页面没有可接入的数据表，请切换到物性分析或图谱分析页面。';
  };

  const getAttachedDataFile = (prompt) => {
    if (!state.dataAttachmentEnabled) return null;
    const pageId = getActivePageId();
    if (pageId === 'property-analysis') {
      // OpenRouter rejects text/plain file attachments for some models/routes.
      // Keep selected table data in the message text instead of sending it as a file.
      return null;
    }
    return null;
  };

  const getAttachedDataImages = (prompt) => {
    const pageId = getActivePageId();
    if (App.agentButler?.getImages) {
      return normalizeImages(App.agentButler.getImages({
        question: prompt,
        activePageId: pageId,
        forceCurrentPage: Boolean(state.dataAttachmentEnabled),
      }) || []);
    }

    if (pageId === 'spectrum-analysis') return normalizeImages(App.spectrumAnalysis?.getSelectedAiImages?.() || []);
    return [];
  };

  const loadImageForCompression = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('图片读取失败')), { once: true });
    image.src = url;
  });

  const canvasToDataUrl = (canvas, mimeType, quality) => new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(canvas.toDataURL(mimeType, quality));
          return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
        reader.addEventListener('error', () => resolve(canvas.toDataURL(mimeType, quality)), { once: true });
        reader.readAsDataURL(blob);
      }, mimeType, quality);
      return;
    }
    resolve(canvas.toDataURL(mimeType, quality));
  });

  const compressImageForAi = async (image, options = {}) => {
    const sourceUrl = String(image?.image_url?.url || image?.url || '').trim();
    if (!sourceUrl || !sourceUrl.startsWith('data:image/')) return image;

    try {
      const img = await loadImageForCompression(sourceUrl);
      const maxSize = Number(options.maxSize || 1200);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) return image;

      const scale = Math.min(1, maxSize / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return image;

      const preserveAlpha = Boolean(options.preserveAlpha);
      const mimeType = preserveAlpha ? 'image/webp' : 'image/jpeg';
      if (!preserveAlpha) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const compressedUrl = await canvasToDataUrl(canvas, mimeType, preserveAlpha ? 0.82 : 0.78);
      if (!compressedUrl || compressedUrl.length >= sourceUrl.length) return image;

      return {
        type: 'image_url',
        image_url: { url: compressedUrl },
        preview_url: String(image?.preview_url || image?.previewUrl || sourceUrl),
      };
    } catch (error) {
      console.warn('[chat] Failed to compress image before AI upload:', error);
      return image;
    }
  };

  const compressImagesForAi = async (images, options = {}) => {
    const normalized = normalizeImages(images).slice(0, 1);
    const activePageId = getActivePageId();
    const preserveAlpha = activePageId === 'image-cutout' || /(?:透明|抠图|去背|png)/.test(String(options.prompt || ''));
    const maxSize = activePageId === 'image-cutout' ? 768 : 768;
    return Promise.all(normalized.map((image) => compressImageForAi(image, { maxSize, preserveAlpha })));
  };

  const getContextMessages = (config, prompt) => {
    const basePrompt = config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    const attachedDataContext = prompt ? getAttachedDataContext(prompt) : '';
    const messages = [{ role: 'system', content: basePrompt }];

    if (attachedDataContext) {
      messages.push({
        role: 'system',
        content: [
          getProjectContext(),
          '如果后续消息中出现“后台接入数据”，必须优先依据该数据回答；不要忽略、不要改用外部常识。',
        ].filter(Boolean).join('\n\n'),
      });
      messages.push({
        role: 'user',
        content: [
          '【后台接入数据，用户不可见】',
          attachedDataContext,
          '请确认你已经读取这些后台数据。接下来回答用户问题时，必须基于这里的数据。',
        ].join('\n\n'),
      });
      messages.push({
        role: 'assistant',
        content: '已读取后台接入的数据。我会优先基于这些数据回答用户问题。',
      });
    }

    return messages;
  };

  const encodeTextAsDataUrl = (text, mimeType = 'text/plain') => {
    const safeMimeType = String(mimeType || 'text/plain').split(';')[0] || 'text/plain';
    const bytes = new TextEncoder().encode(String(text || ''));
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return `data:${safeMimeType};base64,${btoa(binary)}`;
  };

  const normalizeFileAttachments = (files) => (Array.isArray(files) ? files.map((file) => {
    const content = String(file?.content || '');
    const filename = String(file?.filename || 'data.txt').trim() || 'data.txt';
    const mimeType = String(file?.mimeType || 'text/plain');
    const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();
    const isSupportedFileType = normalizedMimeType === 'application/pdf';
    if (!content) return null;
    if (!isSupportedFileType) return null;
    return {
      type: 'file',
      file: {
        filename,
        file_data: encodeTextAsDataUrl(content, mimeType),
      },
    };
  }).filter(Boolean) : []);

  const toApiMessage = (message, options = {}) => {
    const images = normalizeImages(options.images || message.images);
    const content = String(options.content ?? message.content ?? '');
    const files = normalizeFileAttachments(options.files);
    if (message.role === 'user' && (images.length || files.length)) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: content },
          ...files,
          ...images.map((image) => ({
            type: 'image_url',
            image_url: image.image_url,
          })),
        ],
      };
    }

    return {
      role: message.role,
      content,
    };
  };

  const estimateTextTokens = (text) => {
    const value = String(text || '');
    if (!value) return 0;
    const cjkCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherCount = Math.max(0, value.length - cjkCount);
    return Math.max(1, Math.ceil(cjkCount / 1.7 + otherCount / 4));
  };

  const messageContentToText = (content) => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text') return part.text || '';
      if (part.type === 'image_url') return '[image]';
      if (part.type === 'file') return `[file:${part.file?.filename || ''}]`;
      return JSON.stringify(part);
    }).join('\n');
  };

  const estimateMessagesTokens = (messages) => {
    const list = Array.isArray(messages) ? messages : [];
    return list.reduce((sum, message) => {
      const contentText = messageContentToText(message?.content);
      const imageCount = Array.isArray(message?.content)
        ? message.content.filter((part) => part?.type === 'image_url').length
        : 0;
      const fileCount = Array.isArray(message?.content)
        ? message.content.filter((part) => part?.type === 'file').length
        : 0;
      return sum + 4 + estimateTextTokens(message?.role || '') + estimateTextTokens(contentText) + imageCount * 800 + fileCount * 300;
    }, 3);
  };

  const getSelectedModelContextLength = () => {
    const model = App.config.getResolvedModel();
    const option = Array.from(refs.modelSelect?.options || []).find((item) => item.value === model);
    const value = Number.parseInt(option?.dataset?.contextLength || '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const normalizeApiUsage = (usage) => {
    if (!usage || typeof usage !== 'object') return null;
    const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? 0);
    const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? (promptTokens + completionTokens));
    if (!promptTokens && !completionTokens && !totalTokens) return null;
    return { promptTokens, completionTokens, totalTokens };
  };

  const buildTokenUsageMeta = ({ apiUsage, requestMessages, completionText, model }) => {
    const normalized = normalizeApiUsage(apiUsage);
    const estimatedPromptTokens = estimateMessagesTokens(requestMessages);
    const estimatedCompletionTokens = estimateTextTokens(completionText);
    const promptTokens = normalized?.promptTokens || estimatedPromptTokens;
    const completionTokens = normalized?.completionTokens || estimatedCompletionTokens;
    const totalTokens = normalized?.totalTokens || (promptTokens + completionTokens);
    const contextLength = getSelectedModelContextLength();
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      contextLength,
      remainingContext: contextLength ? Math.max(0, contextLength - totalTokens) : 0,
      estimated: !normalized,
      model: model || '',
    };
  };

  const buildUserPromptWithData = (prompt, attachedDataContext) => {
    if (!attachedDataContext) return prompt;
    if (App.agentButler?.buildAgentPrompt) {
      return App.agentButler.buildAgentPrompt(prompt, attachedDataContext);
    }
    return [
      '【用户问题】',
      prompt,
      '',
      '【后台已接入的数据表，界面不显示】',
      attachedDataContext,
      '',
      '【回答要求】',
      '必须优先使用上面的后台数据表回答用户问题。',
      '如果问题中的型号/批次在表格里没有完全匹配，请明确说未找到完全匹配，并列出表格中的相近型号/批次。',
      '禁止把表格里的材料型号解释成服务器、网络设备或其他外部产品型号。',
    ].join('\n');
  };

  const buildUserPromptWithFile = (prompt, dataFile) => {
    if (!dataFile) return prompt;
    return [
      '【用户问题】',
      prompt,
      '',
      `【后台已上传文件】${dataFile.filename}`,
      '该文件是物性分析页面当前选中的表格数据，UTF-8 编码，TSV 格式，只包含用户已选中的数据行。',
      '请打开并读取该文件后回答问题。',
      '',
      '【回答要求】',
      '必须优先使用附件中的已选表格数据回答。',
      '如果问题中的型号/批次在附件里没有完全匹配，请明确说未找到完全匹配，并列出附件已选数据中的相近型号/批次。',
      '禁止把表格里的材料型号解释成服务器、网络设备或其他外部产品型号。',
    ].join('\n');
  };

  const consumeChatCompletionStream = async (response, onDelta) => {
    if (!response.body) return false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finished = false;
    let receivedDelta = false;

    const processBlock = (block) => {
      const dataLines = [];
      block.split('\n').forEach((line) => {
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      const data = dataLines.join('\n').trim();
      if (!data) return;
      if (data === '[DONE]') {
        finished = true;
        return;
      }
      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content ?? '';
        if (delta) {
          receivedDelta = true;
          onDelta(delta, payload);
        }
      } catch (error) {
        // Ignore malformed heartbeat/control frames and keep streaming.
      }
    };

    while (!finished) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        parts.forEach((part) => {
          if (!finished) processBlock(part);
        });
      }
      if (done) break;
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    const tailParts = buffer.split('\n\n');
    tailParts.forEach((part) => {
      if (!finished) processBlock(part);
    });

    return receivedDelta;
  };

  const scheduleStreamRender = (pendingIndex, content) => {
    if (streamRenderTimer) return;
    streamRenderTimer = window.setTimeout(() => {
      streamRenderTimer = 0;
      state.chatHistory[pendingIndex] = {
        role: 'assistant',
        content: content || '正在思考...',
        images: [],
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      renderChatMessages({ autoScroll: true });
    }, 120);
  };

  const flushStreamRender = (pendingIndex, content) => {
    if (streamRenderTimer) {
      window.clearTimeout(streamRenderTimer);
      streamRenderTimer = 0;
    }
    state.chatHistory[pendingIndex] = {
      role: 'assistant',
      content: content || '正在思考...',
      images: [],
    };
    const session = getActiveSession();
    if (session) session.updatedAt = nowIso();
    saveChatState();
    renderChatMessages({ autoScroll: true });
  };

  const pushChatMessage = (role, content, images = []) => {
    const session = getActiveSession();
    if (!session) return;

    session.messages.push({ role, content, images: normalizeImages(images).slice(0, 1) });
    session.updatedAt = nowIso();
    if (role === 'user') {
      session.title = deriveSessionTitle(session.messages);
    }

    state.chatHistory = session.messages;
    saveChatState();
    renderChat();
  };

  const renderDataAttachmentState = () => {
    if (!refs.assistantDataToggleBtn) return;
    const enabled = Boolean(state.dataAttachmentEnabled);
    const pageId = getActivePageId();
    const label = enabled ? '本页' : '全局';

    refs.assistantDataToggleBtn.textContent = label;
    refs.assistantDataToggleBtn.classList.toggle('is-active', enabled);
    refs.assistantDataToggleBtn.setAttribute('aria-pressed', String(enabled));
    refs.assistantDataToggleBtn.setAttribute(
      'title',
      enabled
        ? '本页模式：管家会强制优先携带当前页面数据'
        : pageId === 'property-analysis'
          ? '全局模式：管家会自动检索当前页和相关模块数据'
          : pageId === 'spectrum-analysis'
            ? '全局模式：管家会自动检索当前页和相关模块数据'
            : pageId === 'image-cutout'
              ? '全局模式：管家会自动检索当前页和相关模块数据'
              : '全局模式：管家会自动检索项目内相关数据'
    );
  };

  const saveDataAttachmentState = () => {
    utils.writeJson(constants.CHAT_DATA_ATTACHMENT_KEY, Boolean(state.dataAttachmentEnabled));
  };

  const loadDataAttachmentState = () => {
    state.dataAttachmentEnabled = Boolean(utils.readJson(constants.CHAT_DATA_ATTACHMENT_KEY, false));
  };

  const sendChatMessage = async () => {
    if (state.chatBusy) return;
    const config = App.config.getFormConfig();
    const prompt = (refs.chatInput?.value || '').trim();
    if (!prompt) return;
    if (config.aiProvider !== 'lmstudio' && !config.apiKey) {
      pushChatMessage('assistant', '请先在配置中心填入 OpenRouter API 密钥，或切换到 LM Studio 本地模型。');
      return;
    }

    const model = App.config.getResolvedModel();
    if (!model) {
      pushChatMessage('assistant', '请先选择一个模型。');
      return;
    }
    const selectedModelOption = Array.from(refs.modelSelect?.options || []).find((option) => option.value === model);
    const inputModalities = JSON.parse(selectedModelOption?.dataset?.inputModalities || '[]');
    const outputModalities = JSON.parse(selectedModelOption?.dataset?.outputModalities || '[]');
    const modelCategory = String(selectedModelOption?.dataset?.category || '');
    const supportsImageInput = (Array.isArray(inputModalities) && inputModalities.includes('image'))
      || modelCategory.includes('图像')
      || /(?:vision|visual|image|vl|multimodal)/i.test(model);
    const supportsImageOutput = Array.isArray(outputModalities) && outputModalities.includes('image');
    const rawAttachedImages = supportsImageInput
      ? [
          ...pendingDraftImages,
          ...getAttachedDataImages(prompt),
        ].slice(0, 1)
      : [];
    const attachedImages = supportsImageInput
      ? await compressImagesForAi(rawAttachedImages, { prompt })
      : [];
    const wantsImages = supportsImageOutput && !attachedImages.length && /(?:生成图片|出图|画一张|画图|插图|图片|图像|壁纸|海报|封面)/.test(prompt);

    state.chatBusy = true;
    if (refs.chatSendBtn) refs.chatSendBtn.disabled = true;
    if (refs.chatInput) refs.chatInput.disabled = true;

    pushChatMessage('user', prompt, attachedImages);
    pendingDraftImages = [];
    if (refs.chatInput) refs.chatInput.value = '';
    pushChatMessage('assistant', '正在思考...');
    const pendingIndex = state.chatHistory.length - 1;
    const isLmStudioProvider = config.aiProvider === 'lmstudio';
    const streamEnabled = isLmStudioProvider || Boolean(config.streamEnabled);
    let streamedContent = '';
    let streamedImages = [];
    let apiUsage = null;
    let apiMessages = [];
    let finishReason = '';

    try {
      const attachedDataFile = getAttachedDataFile(prompt);
      const attachedDataContext = getAttachedDataContext(prompt);
      const requestMessages = state.chatHistory
        .slice(0, pendingIndex)
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .slice(-12)
        .map((item, index, items) => {
          const isCurrentUserMessage = index === items.length - 1 && item.role === 'user';
          return toApiMessage(item, {
            content: isCurrentUserMessage
              ? (attachedDataFile ? buildUserPromptWithFile(item.content, attachedDataFile) : buildUserPromptWithData(item.content, attachedDataContext))
              : item.content,
            files: isCurrentUserMessage && attachedDataFile ? [attachedDataFile] : [],
            images: isCurrentUserMessage ? attachedImages : item.images,
          });
        });
      apiMessages = [
        ...getContextMessages(config, ''),
        ...requestMessages,
      ];

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        body: JSON.stringify({
          model,
          messages: apiMessages,
          temperature: config.temperature,
          max_tokens: Math.max(Number(config.maxTokens) || 0, constants.DEFAULT_CONFIG.maxTokens || 4096),
          modalities: wantsImages ? ['image', 'text'] : undefined,
          stream: (wantsImages || attachedDataFile) ? false : streamEnabled,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errorText ? `：${errorText.slice(0, 300)}` : ''}`);
      }
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const shouldStream = !wantsImages
        && !attachedDataFile
        && streamEnabled
        && response.body
        && (isLmStudioProvider || contentType.includes('text/event-stream'));

      if (shouldStream) {
        const didStream = await consumeChatCompletionStream(response, (delta) => {
          streamedContent += delta;
          scheduleStreamRender(pendingIndex, streamedContent);
        });
        if (!didStream) {
          throw new Error('本地模型没有返回流式内容，请确认 LM Studio 已启用 OpenAI Compatible Server。');
        }
        flushStreamRender(pendingIndex, streamedContent);
      } else {
        const data = await response.json();
        streamedContent = data?.choices?.[0]?.message?.content?.trim() || '我暂时没有返回内容。';
        finishReason = String(data?.choices?.[0]?.finish_reason || '');
        apiUsage = data?.usage || null;
        streamedImages = Array.isArray(data?.choices?.[0]?.message?.images)
          ? data.choices[0].message.images.map((image) => ({
              type: String(image?.type || 'image_url'),
              image_url: {
                url: String(image?.image_url?.url || image?.url || ''),
              },
            })).filter((image) => image.image_url.url)
          : [];
      }

      state.chatHistory[pendingIndex] = {
        role: 'assistant',
        content: finishReason === 'length'
          ? `${streamedContent || '我暂时没有返回内容。'}\n\n【提示】本次回答达到模型输出上限，内容可能未完整结束。可以继续追问“继续”。`
          : streamedContent || '我暂时没有返回内容。',
        images: streamedImages,
        tokenUsage: buildTokenUsageMeta({
          apiUsage,
          requestMessages: apiMessages,
          completionText: streamedContent,
          model,
        }),
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
    } catch (error) {
      if (streamRenderTimer) {
        window.clearTimeout(streamRenderTimer);
        streamRenderTimer = 0;
      }
      const currentContent = String(state.chatHistory[pendingIndex]?.content || '').trim();
      const fallbackMessage = `发送失败：${error?.message || '网络或权限错误'}`;
      state.chatHistory[pendingIndex] = {
        role: 'assistant',
        content: currentContent ? `${currentContent}\n\n${fallbackMessage}` : fallbackMessage,
        images: [],
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
    } finally {
      state.chatBusy = false;
      if (refs.chatSendBtn) refs.chatSendBtn.disabled = false;
      if (refs.chatInput) refs.chatInput.disabled = false;
    }
  };

  const bindChat = () => {
    refs.assistantDataToggleBtn?.addEventListener('click', () => {
      state.dataAttachmentEnabled = !state.dataAttachmentEnabled;
      saveDataAttachmentState();
      renderDataAttachmentState();
    });

    refs.clearChatBtn?.addEventListener('click', () => {
      const session = getActiveSession();
      if (!session) return;
      session.messages = [];
      session.title = NEW_CONVERSATION_TITLE;
      session.updatedAt = nowIso();
      state.chatHistory = session.messages;
      saveChatState();
      renderChat();
    });

    refs.conversationMenuBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!refs.conversationMenuPanel) return;
      const shouldOpen = refs.conversationMenuPanel.hidden;
      if (shouldOpen) {
        conversationMenuOpen = true;
        state.conversationMenuQuery = state.conversationMenuQuery || '';
        renderConversationMenu();
        mountConversationMenu();
        refs.conversationMenuPanel.hidden = false;
        refs.conversationMenuBtn?.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => updateConversationMenuPosition());
        requestAnimationFrame(() => refs.conversationMenuPanel.querySelector('#conversationMenuSearch')?.focus());
      } else {
        closeConversationMenu();
      }
    });

    refs.assistantNewBtn?.addEventListener('click', createNewConversation);
    refs.assistantFullscreenNewBtn?.addEventListener('click', createNewConversation);

    refs.assistantFullscreenSearch?.addEventListener('input', () => {
      state.conversationMenuQuery = refs.assistantFullscreenSearch?.value || '';
      renderConversationMenu();
      renderFullscreenSidebar();
    });

    refs.chatSendBtn?.addEventListener('click', sendChatMessage);
    refs.chatInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });

    refs.chatMessages?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chat-image-preview]');
      if (!button) return;
      openChatImagePreview(button.getAttribute('data-chat-image-preview'));
    });

    document.addEventListener('pointerdown', (event) => {
      if (!refs.conversationMenuPanel || refs.conversationMenuPanel.hidden) return;
      if (refs.conversationMenuPanel.contains(event.target) || refs.conversationMenuBtn?.contains(event.target)) return;
      closeConversationMenu();
    });

    window.addEventListener('resize', () => {
      if (conversationMenuOpen) updateConversationMenuPosition();
      if (isAssistantFullscreen()) renderFullscreenSidebar();
    });

    window.addEventListener('storage', (event) => {
      if (event.key === constants.NAV_PAGE_KEY) renderDataAttachmentState();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeConversationMenu();
        closeChatImagePreview();
      }
    });
  };

  const init = () => {
    loadDataAttachmentState();
    const loaded = loadChatState();
    state.chatSessions = loaded.sessions;
    state.chatSessionId = loaded.activeId;
    const activeSession = getActiveSession();
    state.chatHistory = activeSession?.messages || [];
    bindChat();
    renderChat();
    renderDataAttachmentState();
    updateHeaderState();
  };

  App.chat = {
    init,
    renderChat,
    sendChatMessage,
    renderFullscreenSidebar,
    draftPrompt,
  };
})();

