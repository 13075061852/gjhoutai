(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, state, utils } = App;
  const NEW_CONVERSATION_TITLE = '新建对话';
  let conversationMenuOpen = false;
  let pendingDraftImages = [];

  const nowIso = () => new Date().toISOString();

  const makeSessionId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const normalizeMessage = (message) => ({
    role: message?.role === 'user' || message?.role === 'assistant' ? message.role : 'system',
    content: String(message?.content || ''),
    images: Array.isArray(message?.images) ? message.images.map((item) => ({
      type: String(item?.type || 'image_url'),
      image_url: {
        url: String(item?.image_url?.url || item?.url || ''),
      },
    })).filter((item) => item.image_url.url) : [],
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
    const sessionsToSave = state.chatSessions.map((session) => ({
      id: session.id,
      title: session.title,
      messages: session.messages.map((item) => ({
        ...item,
        images: Array.isArray(item.images) ? item.images.map((image) => ({
          type: String(image?.type || 'image_url'),
          image_url: {
            url: String(image?.image_url?.url || image?.url || ''),
          },
        })).filter((image) => image.image_url.url) : [],
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));

    utils.writeJson(constants.CHAT_SESSIONS_KEY, sessionsToSave);
    utils.writeJson(constants.CHAT_ACTIVE_SESSION_KEY, activeSession?.id || '');
    utils.writeJson(constants.CHAT_STORAGE_KEY, activeSession?.messages || []);
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

  const scrollChatToBottom = () => {
    if (!refs.chatMessages) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const lastMessage = refs.chatMessages?.lastElementChild;
        if (lastMessage?.scrollIntoView) {
          lastMessage.scrollIntoView({ block: 'end', inline: 'nearest' });
          return;
        }
        refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
      });
    });
  };

  const renderChatMessages = () => {
    if (!refs.chatMessages) return;
    const intro = refs.chatIntroText;
    const items = state.chatHistory;

    refs.chatMessages.innerHTML = items.length
      ? items.map((item) => {
          const images = Array.isArray(item.images) && item.images.length
            ? `<div class="ai-message-images">${item.images.map((image) => {
                const imageUrl = String(image?.image_url?.url || image?.url || '').trim();
                if (!imageUrl) return '';
                return `<img class="ai-message-image" src="${utils.escapeHtml(imageUrl)}" alt="AI 生成图片" loading="lazy" />`;
              }).join('')}</div>`
            : '';
          return `<div class="ai-message ${item.role === 'user' ? 'user' : ''}"><div class="ai-message-content">${utils.markdownLite(item.content)}</div>${images}</div>`;
        }).join('')
      : '';

    if (intro) {
      const hasKey = Boolean((App.config.getFormConfig().apiKey || '').trim());
      const resolvedModel = App.config.getResolvedModel();
      intro.textContent = hasKey
        ? `已连接到 ${resolvedModel || '未选择模型'}，可以直接在这里对话。`
        : '先保存 OpenRouter 配置，然后就可以在这里直接发起分析。';
    }

    scrollChatToBottom();
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
    renderChatMessages();
    updateHeaderState();
    scrollChatToBottom();
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
  })).filter((item) => item.image_url.url) : []);

  const draftPrompt = (prompt, options = {}) => {
    const value = String(prompt || '').trim();
    if (!value || !refs.chatInput) return;

    if (options.newConversation && !isFreshSession()) {
      createNewConversation();
    }

    pendingDraftImages = normalizeImages(options.images).slice(0, 4);
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
    '项目当前包含物性分析、图谱分析、主题设置和 OpenRouter AI 配置中心。',
    '回答时优先结合当前页面上下文、已选数据、筛选条件和业务字段；涉及材料数据时给出结论、风险和下一步建议。',
  ].join('\n');

  const getAttachedDataContext = (prompt) => {
    if (!state.dataAttachmentEnabled) return '';

    const pageId = getActivePageId();
    if (pageId === 'property-analysis') {
      return App.propertyAnalysis?.getFullAiContext?.(prompt) || '【已请求接入数据】物性分析数据尚未加载完成。';
    }

    if (pageId === 'spectrum-analysis') {
      return App.spectrumAnalysis?.getAiContext?.() || '【已请求接入数据】图谱分析数据尚未加载完成。';
    }

    return '【已请求接入数据】当前页面没有可接入的数据表，请切换到物性分析或图谱分析页面。';
  };

  const getAttachedDataFile = (prompt) => {
    if (!state.dataAttachmentEnabled) return null;
    const pageId = getActivePageId();
    if (pageId === 'property-analysis') return App.propertyAnalysis?.getAiDataFile?.(prompt) || null;
    return null;
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
    if (!content) return null;
    return {
      type: 'file',
      file: {
        filename,
        file_data: encodeTextAsDataUrl(content, mimeType),
      },
    };
  }).filter(Boolean) : []);

  const toApiMessage = (message, options = {}) => {
    const images = normalizeImages(message.images);
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

  const buildUserPromptWithData = (prompt, attachedDataContext) => {
    if (!attachedDataContext) return prompt;
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
      '该文件是物性分析页面的完整表格数据，UTF-8 编码，TSV 格式，包含全部工作表、全部分类、全部列和全部行。',
      '请打开并读取该文件后回答问题。',
      '',
      '【回答要求】',
      '必须优先使用附件表格数据回答。',
      '如果问题中的型号/批次在附件里没有完全匹配，请明确说未找到完全匹配，并列出附件中的相近型号/批次。',
      '禁止把表格里的材料型号解释成服务器、网络设备或其他外部产品型号。',
    ].join('\n');
  };

  const consumeChatCompletionStream = async (response, onDelta) => {
    if (!response.body) return false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finished = false;

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
        if (delta) onDelta(delta, payload);
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

    return true;
  };

  const pushChatMessage = (role, content, images = []) => {
    const session = getActiveSession();
    if (!session) return;

    session.messages.push({ role, content, images: normalizeImages(images).slice(0, 4) });
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
    const label = enabled ? '已接入数据' : '接入数据';

    refs.assistantDataToggleBtn.textContent = label;
    refs.assistantDataToggleBtn.classList.toggle('is-active', enabled);
    refs.assistantDataToggleBtn.setAttribute('aria-pressed', String(enabled));
    refs.assistantDataToggleBtn.setAttribute(
      'title',
      enabled
        ? '已开启：发送问题时会在后台携带当前分析页数据'
        : pageId === 'property-analysis'
          ? '开启后会在后台携带物性分析完整表格数据'
          : '开启后会在后台携带当前分析页数据'
    );
  };

  const sendChatMessage = async () => {
    if (state.chatBusy) return;
    const config = App.config.getFormConfig();
    const prompt = (refs.chatInput?.value || '').trim();
    const attachedImages = pendingDraftImages.slice(0, 4);
    if (!prompt) return;
    if (!config.apiKey) {
      pushChatMessage('assistant', '请先在 AI 配置里填入 OpenRouter API 密钥，然后再发送消息。');
      return;
    }

    const model = App.config.getResolvedModel();
    if (!model) {
      pushChatMessage('assistant', '请先选择一个模型。');
      return;
    }
    const selectedModelOption = Array.from(refs.modelSelect?.options || []).find((option) => option.value === model);
    const outputModalities = JSON.parse(selectedModelOption?.dataset?.outputModalities || '[]');
    const supportsImages = Array.isArray(outputModalities) && outputModalities.includes('image');
    const wantsImages = supportsImages && !attachedImages.length && /(?:生成图片|出图|画一张|画图|插图|图片|图像|壁纸|海报|封面)/.test(prompt);

    state.chatBusy = true;
    if (refs.chatSendBtn) refs.chatSendBtn.disabled = true;
    if (refs.chatInput) refs.chatInput.disabled = true;

    pushChatMessage('user', prompt, attachedImages);
    pendingDraftImages = [];
    if (refs.chatInput) refs.chatInput.value = '';
    pushChatMessage('assistant', '正在思考...');
    const pendingIndex = state.chatHistory.length - 1;
    const streamEnabled = Boolean(config.streamEnabled);
    let streamedContent = '';
    let streamedImages = [];

    try {
      const attachedDataFile = getAttachedDataFile(prompt);
      const attachedDataContext = attachedDataFile ? '' : getAttachedDataContext(prompt);
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
          });
        });

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        body: JSON.stringify({
          model,
          messages: [
            ...getContextMessages(config, ''),
            ...requestMessages,
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          modalities: wantsImages ? ['image', 'text'] : undefined,
          stream: (wantsImages || attachedDataFile) ? false : streamEnabled,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errorText ? `：${errorText.slice(0, 300)}` : ''}`);
      }
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const shouldStream = !wantsImages && streamEnabled && response.body && contentType.includes('text/event-stream');

      if (shouldStream) {
        await consumeChatCompletionStream(response, (delta) => {
          streamedContent += delta;
          state.chatHistory[pendingIndex] = {
            role: 'assistant',
            content: streamedContent || '正在思考...',
            images: [],
          };
          const session = getActiveSession();
          if (session) session.updatedAt = nowIso();
          saveChatState();
          renderChatMessages();
        });
      } else {
        const data = await response.json();
        streamedContent = data?.choices?.[0]?.message?.content?.trim() || '我暂时没有返回内容。';
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
        content: streamedContent || '我暂时没有返回内容。',
        images: streamedImages,
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
    } catch (error) {
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
      if (event.key === 'Escape') closeConversationMenu();
    });
  };

  const init = () => {
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

