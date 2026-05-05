// @ts-nocheck
﻿// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, state, utils } = App;
  const NEW_CONVERSATION_TITLE = '新建对话';
  const SKILL_SYNTHESIS_TIMEOUT_MS = 90000;
  const SKILL_SYNTHESIS_CONTEXT_LIMIT = 12000;
  let conversationMenuOpen = false;
  let pendingDraftImages = [];
  let streamRenderTimer = 0;
  let activeChatAbortController = null;
  let chatAbortRequested = false;
  let webSearchEnabled = true;
  const imageUploadAuthResolvers = new Map();

  const nowIso = () => new Date().toISOString();

  const createAbortError = (message = '用户已终止本次分析。') => {
    try {
      return new DOMException(message, 'AbortError');
    } catch {
      const error = new Error(message);
      error.name = 'AbortError';
      return error;
    }
  };

  const isAbortError = (error) => error?.name === 'AbortError' || /aborted|abort|终止/i.test(String(error?.message || ''));

  const getCurrentDateTimeLabel = () => new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const shouldAnswerCurrentDateLocally = (prompt) => {
    const text = String(prompt || '').trim();
    if (!text || text.length > 30) return false;
    return /^(?:今天|现在|当前)?(?:是)?(?:几号|几月几号|星期几|周几|日期|时间)(?:了|呢|啊|\?|？)?$/.test(text)
      || /^(?:今天|现在|当前)(?:是)?(?:什么日期|什么时间)(?:了|呢|啊|\?|？)?$/.test(text);
  };

  const buildCurrentDateLocalAnswer = () => `今天是 ${getCurrentDateTimeLabel()}。`;

  const buildPromptWithCurrentDate = (prompt) => [
    '【当前日期时间】',
    `${getCurrentDateTimeLabel()}（北京时间，Asia/Shanghai）`,
    '',
    '【用户问题】',
    prompt,
    '',
    '【日期要求】',
    '用户说“今天”“当前”“现在”等相对日期时，必须以上面的当前日期时间为准；不要把搜索结果中的旧日期或模型训练日期当作今天。',
  ].join('\n');

  const normalizeSearchResults = (payload) => {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.map((item, index) => {
      const title = String(item?.title || item?.url || `搜索结果 ${index + 1}`).trim();
      const url = String(item?.url || '').trim();
      const content = String(item?.content || item?.raw_content || '').trim();
      const publishedDate = String(item?.published_date || item?.publishedDate || '').trim();
      if (!title && !url && !content) return null;
      return {
        title,
        url,
        content: content.slice(0, 1200),
        publishedDate,
      };
    }).filter(Boolean);
  };

  const formatSearchContext = (results) => {
    const items = normalizeSearchResults({ results }).slice(0, 10);
    if (!items.length) return '';
    return [
      '【联网搜索资料，用户不可见】',
      `【当前日期时间】${getCurrentDateTimeLabel()}（北京时间，Asia/Shanghai）`,
      '以下资料来自实时搜索结果。回答时必须优先使用这些资料；涉及事实、新闻、价格、政策、版本或时效信息时，请注明信息可能随时间变化，并在答案末尾列出简短来源标题。',
      '来源只写文章/网页标题，不要单独输出 URL，也不要把 URL 放在括号里追加到标题后面。',
      '如果搜索结果没有覆盖今天，请明确说“未检索到今天的结果”，但仍必须把上面的当前日期当作今天；禁止把旧结果日期改写为今天。',
      '禁止编造未出现在搜索资料中的事件、时间、机构、产品、价格或链接；资料不足时必须说明“搜索资料不足，无法确认”。',
      ...items.map((item, index) => [
        `【来源 ${index + 1}】${item.title}`,
        item.url ? `URL：${item.url}` : '',
        item.publishedDate ? `日期：${item.publishedDate}` : '',
        item.content ? `摘要：${item.content}` : '',
      ].filter(Boolean).join('\n')),
    ].join('\n\n');
  };

  const promptRequiresWebSearch = (prompt) => {
    const text = String(prompt || '').trim();
    if (!text) return false;
    return /(?:搜索|联网|网上|查一下|查找|最新|最近|今天|今日|昨日|昨天|明天|新闻|价格|报价|油价|汇率|天气|股价|行情|政策|法规|官网|资料|来源|链接|引用|现在|当前|版本|发布|趋势|市场)/i.test(text);
  };

  const buildSearchUnavailableAnswer = (reason) => [
    '这个问题涉及最新或实时信息，必须先联网搜索才能可靠回答。',
    '',
    `当前无法完成搜索：${reason}`,
    '',
    '我不会在没有搜索资料的情况下编造答案。请开启“联网搜索”并在配置中心填写 Tavily API Key 后再试。',
  ].join('\n');

  const parseSearchDecision = (content) => {
    const text = String(content || '').trim();
    if (!text) return null;
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed?.needsSearch === 'boolean') {
        return {
          needsSearch: parsed.needsSearch,
          reason: String(parsed.reason || '').trim(),
        };
      }
    } catch {
      // Fall through to a conservative text parse.
    }
    if (/needsSearch\s*[:：]\s*true|需要搜索|需要联网|yes|true/i.test(text)) {
      return { needsSearch: true, reason: 'AI 判断需要联网搜索' };
    }
    if (/needsSearch\s*[:：]\s*false|不需要搜索|不需要联网|no|false/i.test(text)) {
      return { needsSearch: false, reason: 'AI 判断不需要联网搜索' };
    }
    return null;
  };

  const decideSearchWithAi = async (config, model, prompt, options = {}) => {
    const messages = [
      {
        role: 'system',
        content: [
          '你是“联网搜索技能路由器”，只判断用户问题是否必须先调用联网搜索。',
          '如果问题涉及今天/最新/当前/最近、新闻、价格、油价、汇率、天气、股价、政策、法规、版本、官网资料、来源引用、实时行情或可能变化的信息，needsSearch 必须为 true。',
          '如果问题只需要常识、写作、翻译、代码、固定历史知识、本地项目数据或用户已提供的资料，needsSearch 为 false。',
          '只输出严格 JSON，不要解释，不要 Markdown。',
          '格式：{"needsSearch":true,"reason":"一句话原因"}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `当前日期时间：${getCurrentDateTimeLabel()}（北京时间，Asia/Shanghai）`,
          `用户问题：${prompt}`,
        ].join('\n'),
      },
    ];
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: App.config.getRequestHeaders(config),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 120,
        stream: false,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`搜索决策失败：HTTP ${response.status}${errorText ? `：${errorText.slice(0, 180)}` : ''}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || '';
    return parseSearchDecision(content);
  };

  const searchWebForPrompt = async (config, prompt, options = {}) => {
    const provider = String(config.searchProvider || 'tavily').toLowerCase();
    if (provider !== 'tavily') return { results: [], context: '' };
    const datedQuery = [
      prompt,
      `当前日期：${getCurrentDateTimeLabel()}（北京时间）。`,
      '优先查找今天或最近发布的资料。',
    ].join(' ');
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.searchApiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        query: datedQuery,
        topic: config.searchTopic || 'general',
        search_depth: config.searchDepth || 'basic',
        max_results: Math.max(1, Math.min(10, Number(config.searchMaxResults || 5))),
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`联网搜索失败：HTTP ${response.status}${errorText ? `：${errorText.slice(0, 220)}` : ''}`);
    }
    const payload = await response.json();
    const results = normalizeSearchResults(payload);
    return {
      results,
      context: formatSearchContext(results),
    };
  };

  const makeSessionId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const cloneActionInput = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    try {
      return JSON.parse(JSON.stringify(input));
    } catch {
      return {};
    }
  };

  const normalizeSkillActions = (actions) => (Array.isArray(actions) ? actions.map((action, index) => {
    const skillId = String(action?.skillId || '').trim();
    const label = String(action?.label || '').trim();
    if (!skillId || !label) return null;
    return {
      id: String(action?.id || `skill-action-${index}`),
      label,
      description: String(action?.description || '').trim(),
      icon: String(action?.icon || 'ti-player-play').trim(),
      variant: String(action?.variant || 'default').trim(),
      skillId,
      input: cloneActionInput(action?.input),
      disabled: Boolean(action?.disabled),
      consumesGroup: Boolean(action?.consumesGroup),
    };
  }).filter(Boolean) : []);

  const normalizeCostUsage = (cost) => {
    if (!cost || typeof cost !== 'object') return null;
    const totalUsd = Number(cost.totalUsd ?? cost.usd ?? 0);
    const totalCny = Number(cost.totalCny ?? cost.cny ?? 0);
    if (!Number.isFinite(totalUsd) && !Number.isFinite(totalCny)) return null;
    return {
      totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0,
      totalCny: Number.isFinite(totalCny) ? totalCny : 0,
      promptUsd: Number(cost.promptUsd || 0),
      completionUsd: Number(cost.completionUsd || 0),
      usdToCny: Number(cost.usdToCny || 0),
      promptPricePerToken: Number(cost.promptPricePerToken || 0),
      completionPricePerToken: Number(cost.completionPricePerToken || 0),
      estimated: cost.estimated !== false,
    };
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
      cost: normalizeCostUsage(message.tokenUsage.cost),
    } : null,
    actions: normalizeSkillActions(message?.actions),
    imageUploadAuth: normalizeImageUploadAuth(message?.imageUploadAuth),
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

  const isEmptyConversation = (session) => Array.isArray(session?.messages) && session.messages.length === 0;

  const getReusableEmptyConversation = () => {
    const activeSession = getActiveSession();
    if (isEmptyConversation(activeSession)) return activeSession;
    return state.chatSessions
      .filter(isEmptyConversation)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0]
      || null;
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
        actions: normalizeSkillActions(item.actions),
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

  const parseUsdPricing = (value) => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  };

  const formatUsdCost = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '$0.000000';
    if (amount === 0) return '$0';
    if (amount < 0.000001) return `<$0.000001`;
    return `$${amount.toFixed(amount < 0.01 ? 6 : 4)}`;
  };

  const formatCnyCost = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '¥0.0000';
    if (amount === 0) return '¥0';
    if (amount < 0.0001) return '<¥0.0001';
    return `¥${amount.toFixed(amount < 0.1 ? 4 : 2)}`;
  };

  const formatCostLabel = (cost) => {
    const normalized = normalizeCostUsage(cost);
    if (!normalized) return '';
    return `${formatCnyCost(normalized.totalCny)} / ${formatUsdCost(normalized.totalUsd)}`;
  };

  const renderTokenUsage = (usage) => {
    if (!usage || !Number(usage.totalTokens)) return '';
    const contextLength = Number(usage.contextLength || 0);
    const remaining = Number(usage.remainingContext || 0);
    const contextText = contextLength
      ? `剩余上下文 ${formatNumber(Math.max(0, remaining))} / ${formatNumber(contextLength)}`
      : '上下文上限未知';
    const estimateText = usage.estimated ? '估算' : '接口返回';
    const costLabel = formatCostLabel(usage.cost);
    const costTitle = usage.cost
      ? `费用按当前模型 prompt/completion token 单价估算，汇率约 ${Number(usage.cost.usdToCny || 0).toFixed(4)}。`
      : '当前模型没有价格信息，暂不能估算费用。';
    return `
      <div class="ai-token-meta" title="Token ${estimateText}。输入包含系统提示词、聊天历史、管家检索上下文和当前问题。">
        <span>本轮 ${formatNumber(usage.totalTokens)} tokens</span>
        <span>输入 ${formatNumber(usage.promptTokens)}</span>
        <span>输出 ${formatNumber(usage.completionTokens)}</span>
        ${costLabel ? `<span title="${utils.escapeHtml(costTitle)}">费用 ${utils.escapeHtml(costLabel)}</span>` : ''}
        <span>${contextText}</span>
        <span>${estimateText}</span>
      </div>
    `;
  };

  const renderSkillActions = (actions, messageIndex) => {
    const items = normalizeSkillActions(actions);
    if (!items.length) return '';
    return `
      <div class="ai-skill-actions" aria-label="项目技能候选操作">
        ${items.map((action, actionIndex) => `
          <button
            class="ai-skill-action ${action.variant === 'danger' ? 'is-danger' : ''}"
            type="button"
            data-chat-skill-action="${messageIndex}:${actionIndex}"
            ${action.disabled ? 'disabled aria-disabled="true"' : ''}
          >
            <i class="ti ${utils.escapeHtml(action.icon)}" aria-hidden="true"></i>
            <span>
              <strong>${utils.escapeHtml(action.label)}</strong>
              ${action.description ? `<em>${utils.escapeHtml(action.description)}</em>` : ''}
            </span>
          </button>
        `).join('')}
      </div>
    `;
  };

  const normalizeImageUploadAuth = (auth) => {
    if (!auth || typeof auth !== 'object') return null;
    const id = String(auth.id || '').trim();
    const count = Number.parseInt(auth.count, 10);
    if (!id || !Number.isFinite(count) || count <= 0) return null;
    const status = ['pending', 'approved', 'cancelled'].includes(String(auth.status))
      ? String(auth.status)
      : 'pending';
    const items = Array.isArray(auth.items) ? auth.items.map((item, index) => {
      const label = String(item?.label || item?.title || item?.code || '').trim();
      const meta = String(item?.meta || '').trim();
      return label ? { label, meta } : { label: `图谱图片 ${index + 1}`, meta };
    }).filter((item) => item.label).slice(0, 12) : [];
    return {
      id,
      count,
      status,
      source: String(auth.source || '图片上传').trim() || '图片上传',
      items,
    };
  };

  const renderImageUploadItems = (items, count) => {
    if (!Array.isArray(items) || !items.length) return '';
    const hiddenCount = Math.max(0, Number(count || 0) - items.length);
    return `
      <div class="ai-upload-auth-list" aria-label="即将上传的图谱图片">
        <div class="ai-upload-auth-list-title">即将上传的图片</div>
        <ol>
          ${items.map((image, index) => `
            <li>
              <span>${utils.escapeHtml(String(index + 1))}</span>
              <strong title="${utils.escapeHtml(image.label)}">${utils.escapeHtml(image.label)}</strong>
              ${image.meta ? `<em>${utils.escapeHtml(image.meta)}</em>` : ''}
            </li>
          `).join('')}
          ${hiddenCount ? `<li class="is-more">还有 ${utils.escapeHtml(String(hiddenCount))} 张未显示</li>` : ''}
        </ol>
      </div>
    `;
  };

  const renderImageUploadAuthorization = (auth) => {
    const item = normalizeImageUploadAuth(auth);
    if (!item) return '';
    const pending = item.status === 'pending';
    const approved = item.status === 'approved';
    const statusText = pending ? '等待授权' : approved ? '已授权' : '已取消';
    return `
      <div class="ai-upload-auth ${pending ? 'is-pending' : approved ? 'is-approved' : 'is-cancelled'}">
        <div class="ai-upload-auth-head">
          <span class="ai-upload-auth-icon"><i class="ti ti-photo-up" aria-hidden="true"></i></span>
          <span>
            <strong>上传图谱图片确认</strong>
            <em>${utils.escapeHtml(item.source)} · ${utils.escapeHtml(String(item.count))} 张 · ${utils.escapeHtml(statusText)}</em>
          </span>
        </div>
        <p>授权后才会把这些图片发送给当前配置的 AI 服务，用于曲线、峰形、标注和异常点分析。</p>
        ${renderImageUploadItems(item.items, item.count)}
        <div class="ai-upload-auth-actions">
          <button class="ai-upload-auth-btn is-primary" type="button" data-chat-image-auth="${utils.escapeHtml(item.id)}:approve" ${pending ? '' : 'disabled aria-disabled="true"'}>
            <i class="ti ti-check" aria-hidden="true"></i>
            <span>授权上传并分析</span>
          </button>
          <button class="ai-upload-auth-btn" type="button" data-chat-image-auth="${utils.escapeHtml(item.id)}:cancel" ${pending ? '' : 'disabled aria-disabled="true"'}>
            <i class="ti ti-x" aria-hidden="true"></i>
            <span>取消上传</span>
          </button>
        </div>
      </div>
    `;
  };

  const PENDING_STATUS_RE = /(?:正在思考|正在获取匹配数据表|正在获取项目数据|正在分析|正在执行项目技能|项目技能已执行，正在整理结果|等待上传授权|准备上传图片|正在分析图谱图片)(?:[.。…]*)?$/;

  const getPendingStatus = (item) => {
    const explicitStatus = String(item?.pendingStatus || '').trim();
    if (explicitStatus) return explicitStatus.replace(/[.。…]+$/g, '');
    const content = String(item?.content || '').trim();
    const match = content.match(PENDING_STATUS_RE);
    return (match?.[0] || '正在思考').replace(/[.。…]+$/g, '');
  };

  const stripPendingStatus = (content = '', status = '') => {
    let text = String(content || '').trim();
    const statusText = String(status || '').trim();
    if (statusText && text.endsWith(statusText)) {
      text = text.slice(0, -statusText.length).trim();
    }
    return text.replace(PENDING_STATUS_RE, '').trim();
  };

  const renderPendingContent = (item) => {
    const status = getPendingStatus(item);
    const body = stripPendingStatus(item.content, status);
    const bodyHtml = body ? utils.markdownLite(body) : '';
    return `
      ${bodyHtml}
      <div class="ai-waiting-row" role="status" aria-live="polite">
        <span class="ai-waiting-pulse" aria-hidden="true"></span>
        <span class="ai-waiting-text">${utils.escapeHtml(status)}</span>
        <span class="ai-waiting-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    `;
  };

  const stripVerboseSourceUrls = (content) => {
    let text = String(content || '');
    text = text.replace(/\]\((https?:\/\/[^)\s]+)\)/g, ']');
    text = text.replace(/(^|\n)\s*\((?:https?:\/\/|www\.)[^)\s]+\)\s*(?=\n|$)/gi, '$1');
    text = text.replace(/(^|\n)\s*(?:URL|链接|网址)[:：]\s*(?:https?:\/\/|www\.)\S+\s*(?=\n|$)/gi, '$1');
    return text.trim();
  };

  const renderChatMessages = (options = {}) => {
    if (!refs.chatMessages) return;
    const shouldStickToBottom = options.forceScroll || (options.autoScroll !== false && isChatNearBottom());
    const intro = refs.chatIntroText;
    const items = state.chatHistory;

    refs.chatMessages.innerHTML = items.length
      ? items.map((item, messageIndex) => {
          const images = Array.isArray(item.images) && item.images.length
            ? `<div class="ai-message-images">${item.images.map((image) => {
                if (image?.type === 'image_note') {
                  return `<div class="ai-image-note">${utils.escapeHtml(image.label || '已附带图片')}</div>`;
                }
                const imageUrl = String(image?.image_url?.url || image?.url || '').trim();
                if (!imageUrl) return '';
                const previewUrl = String(image?.preview_url || image?.previewUrl || imageUrl).trim();
                return `<button class="ai-message-image-btn" type="button" data-chat-image-preview="${utils.escapeHtml(previewUrl)}" aria-label="放大查看原图"><img class="ai-message-image" src="${utils.escapeHtml(imageUrl)}" alt="AI 生成图片" /></button>`;
              }).join('')}</div>`
            : '';
          const tokenMeta = item.role === 'assistant' ? renderTokenUsage(item.tokenUsage) : '';
          const actions = item.role === 'assistant' ? renderSkillActions(item.actions, messageIndex) : '';
          const imageUploadAuth = item.role === 'assistant' ? renderImageUploadAuthorization(item.imageUploadAuth) : '';
          const pending = item.role === 'assistant' && item.pending;
          const displayContent = item.role === 'assistant' ? stripVerboseSourceUrls(item.content) : item.content;
          const contentHtml = pending ? renderPendingContent({ ...item, content: displayContent }) : utils.markdownLite(displayContent);
          return `<div class="ai-message ${item.role === 'user' ? 'user' : ''} ${pending ? 'is-pending' : ''}"><div class="ai-message-content">${contentHtml}</div>${imageUploadAuth}${images}${actions}${tokenMeta}</div>`;
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

  const deleteConversation = async (sessionId) => {
    const session = state.chatSessions.find((item) => item.id === sessionId);
    if (!session) return;

    const confirmed = await App.confirmDialog?.confirmDelete?.({
      title: '删除对话',
      message: `确定删除「${session.title || NEW_CONVERSATION_TITLE}」吗？此操作不可恢复。`,
    });
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
    App.notify?.success?.('已删除对话', { key: `chat-delete:${sessionId}` });
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
    const reusableSession = getReusableEmptyConversation();
    if (reusableSession) {
      reusableSession.updatedAt = nowIso();
      state.chatSessionId = reusableSession.id;
      state.chatHistory = reusableSession.messages;
      saveChatState();
      renderChat();
      requestAnimationFrame(() => refs.chatInput?.focus());
      return;
    }

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
    label: String(item?.label || item?.title || item?.name || item?.code || ''),
    title: String(item?.title || ''),
    code: String(item?.code || ''),
    meta: String(item?.meta || item?.category || item?.spectrumType || ''),
  })).filter((item) => item.image_url.url) : []);

  const draftPrompt = (prompt, options = {}) => {
    const value = String(prompt || '').trim();
    if (!value || !refs.chatInput) return;

    if (options.newConversation && !isFreshSession()) {
      createNewConversation();
    }

    pendingDraftImages = normalizeImages(options.images);
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

  const isProjectAccessEnabled = () => Boolean(state.dataAttachmentEnabled);

  const getProjectContext = () => {
    const activePageId = getActivePageId();
    const activePageTitle = constants.PAGE_DEFS?.[activePageId]?.title || activePageId || '未知页面';
    const pageCatalog = Object.entries(constants.PAGE_DEFS || {})
      .map(([pageId, def]) => `${def?.title || pageId}=${pageId}`)
      .join('；');
    return [
      '【项目背景】',
      '你正在广俊塑料科技后台管理系统中工作。',
      `项目当前已注册页面：${pageCatalog}`,
      `当前页面：${activePageTitle}`,
      '默认流程：先判断是否需要项目技能；需要数据或页面操作时输出技能调用 JSON，由前端获取数据或执行操作后再交给 AI 分析。',
      '回答时优先结合当前页面上下文、已选数据、筛选条件和业务字段；涉及材料数据时给出结论、风险和下一步建议。',
    ].join('\n');
  };

  const getAttachedDataContext = (prompt) => {
    if (!isProjectAccessEnabled()) return '';
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
    if (!isProjectAccessEnabled()) return null;
    const pageId = getActivePageId();
    if (pageId === 'property-analysis') {
      // OpenRouter rejects text/plain file attachments for some models/routes.
      // Keep selected table data in the message text instead of sending it as a file.
      return null;
    }
    return null;
  };

  const getAttachedDataImages = (prompt) => {
    if (!isProjectAccessEnabled()) return [];
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
    const parsedLimit = Number.parseInt(options.maxImages, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
    const normalizedImages = normalizeImages(images);
    const normalized = limit ? normalizedImages.slice(0, limit) : normalizedImages;
    const activePageId = getActivePageId();
    const preserveAlpha = activePageId === 'image-cutout' || /(?:透明|抠图|去背|png)/.test(String(options.prompt || ''));
    const maxSize = activePageId === 'image-cutout' ? 768 : 768;
    return Promise.all(normalized.map((image) => compressImageForAi(image, { maxSize, preserveAlpha })));
  };

  const settleImageUploadAuthorization = (requestId, approved) => {
    const request = imageUploadAuthResolvers.get(requestId);
    if (!request) return;
    imageUploadAuthResolvers.delete(requestId);
    request.cleanup?.();

    const message = state.chatHistory[request.pendingIndex];
    if (message?.imageUploadAuth?.id === requestId) {
      message.imageUploadAuth = {
        ...message.imageUploadAuth,
        status: approved ? 'approved' : 'cancelled',
      };
      message.pending = approved;
      message.pendingStatus = approved ? '准备上传图片' : '';
      saveChatState();
      renderChatMessages({ autoScroll: true });
    }

    request.resolve(Boolean(approved));
  };

  const requestImageUploadAuthorization = (images, options = {}) => new Promise((resolve, reject) => {
    const normalizedImages = normalizeImages(images);
    const count = normalizedImages.length;
    if (!count) {
      resolve(true);
      return;
    }
    const pendingIndex = Number.parseInt(options.pendingIndex, 10);
    if (!Number.isFinite(pendingIndex) || pendingIndex < 0) {
      resolve(true);
      return;
    }
    const source = String(options.source || '本次请求').trim() || '本次请求';
    const requestId = `image-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const signal = options.signal || null;
    let abortHandler = null;

    const cleanup = () => {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    };

    abortHandler = () => {
      imageUploadAuthResolvers.delete(requestId);
      cleanup();
      reject(createAbortError());
    };

    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    imageUploadAuthResolvers.set(requestId, {
      resolve,
      reject,
      cleanup,
      pendingIndex,
    });

    const content = [
      options.displayPrefix || '',
      `${source}需要上传 ${count} 张图片给当前配置的 AI 服务。`,
      '请在下方确认要上传的图片清单；授权后我会继续让 AI 阅读图片并输出分析结果。',
    ].filter(Boolean).join('\n\n');

    flushStreamRender(pendingIndex, content, {
      pending: true,
      pendingStatus: '等待上传授权',
      imageUploadAuth: {
        id: requestId,
        source,
        count,
        status: 'pending',
        items: normalizedImages.map((image, index) => ({
          label: String(image.label || image.title || image.code || `图谱图片 ${index + 1}`).trim(),
          meta: String(image.meta || '').trim(),
        })),
      },
    });
  });

  const getContextMessages = (config, prompt) => {
    const basePrompt = config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    const projectAccessEnabled = isProjectAccessEnabled();
    const attachedDataContext = projectAccessEnabled && prompt ? getAttachedDataContext(prompt) : '';
    const currentDateTime = getCurrentDateTimeLabel();
    const messages = [
      { role: 'system', content: basePrompt },
      {
        role: 'system',
        content: [
          `当前日期时间是 ${currentDateTime}（北京时间，Asia/Shanghai）。`,
          '如果用户询问今天、昨天、明天、当前日期、当前时间或相对日期，必须以这条日期时间为准，不要使用模型训练数据中的日期。',
        ].join('\n'),
      },
    ];
    const skillProtocolContext = projectAccessEnabled ? (App.projectSkills?.getAiProtocolContext?.() || '') : '';

    if (projectAccessEnabled) {
      messages.push({
        role: 'system',
        content: [
          getProjectContext(),
          '你负责理解用户意图并决定是否调用项目技能。不要依赖前端本地规则替你判断；当用户要求修改、整理、删除、跳转、查询项目数据或执行页面操作时，优先输出项目技能调用 JSON。只有在不需要执行技能时，才直接自然语言回答。',
          '用户要求分析、查询、对比、总结当前项目数据、当前页数据或选中数据时，不要直接强答，必须先输出项目技能调用 JSON。',
          '用户明确询问物性、参数、批次、指标、熔指、拉伸、弯曲、冲击、阻燃或灰份时，调用 property.searchRows 获取物性数据后再分析。',
          '用户明确提到图谱、谱图、图片、DSC/TGA 曲线或图谱库时，优先调用图谱相关技能，通常是 spectrum.searchImages；不要因为问题里有型号就改调用物性表。',
          '如果要调用技能，本次回复只能输出严格 JSON，不要附带解释、Markdown 或多余文本。技能执行结果会由前端回写给用户。',
          skillProtocolContext,
        ].filter(Boolean).join('\n\n'),
      });
    }

    if (attachedDataContext) {
      messages.push({
        role: 'system',
        content: [
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

  const getSelectedModelPricing = (model = '') => {
    const option = Array.from(refs.modelSelect?.options || []).find((item) => item.value === model)
      || Array.from(refs.modelSelect?.options || []).find((item) => item.value === App.config.getResolvedModel());
    const raw = option?.dataset?.pricing || '';
    if (!raw) return null;
    try {
      const pricing = JSON.parse(raw);
      return pricing && typeof pricing === 'object' ? pricing : null;
    } catch {
      return null;
    }
  };

  const buildTokenCostMeta = ({ promptTokens, completionTokens, model }) => {
    const pricing = getSelectedModelPricing(model);
    const promptPrice = parseUsdPricing(pricing?.prompt);
    const completionPrice = parseUsdPricing(pricing?.completion);
    if (promptPrice == null || completionPrice == null) return null;

    const promptUsd = promptTokens * promptPrice;
    const completionUsd = completionTokens * completionPrice;
    const totalUsd = promptUsd + completionUsd;
    const usdToCny = Number(App.config?.getUsdToCnyRate?.() || 0);
    const totalCny = Number.isFinite(usdToCny) && usdToCny > 0 ? totalUsd * usdToCny : 0;
    return {
      promptUsd,
      completionUsd,
      totalUsd,
      totalCny,
      usdToCny,
      promptPricePerToken: promptPrice,
      completionPricePerToken: completionPrice,
      estimated: true,
    };
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
      cost: buildTokenCostMeta({ promptTokens, completionTokens, model }),
    };
  };

  const recordAiCall = (entry = {}) => {
    try {
      App.aiCallAnalysis?.record?.(entry);
    } catch (error) {
      console.warn('[chat] Failed to record AI call analysis:', error);
    }
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

  const shouldSynthesizeSkillResult = (execution) => {
    const skillId = String(execution?.skill?.id || '');
    const result = execution?.result || {};
    if (!result.ok) return false;
    if (skillId === 'spectrum.searchImages') {
      return Boolean(result.data?.context || getSkillResultImages(execution).length);
    }
    if (result.candidates?.length) return false;
    return Boolean(result.data?.context)
      || skillId === 'analysis.buildJointPackage'
      || skillId === 'property.searchRows';
  };

  const getSkillResultImages = (execution) => normalizeImages(execution?.result?.data?.images || []);

  const getSkillDisplayPrefix = (execution) => {
    const table = String(execution?.result?.data?.displayTable || '').trim();
    if (!table) return '';
    return [
      '### 匹配数据表',
      table,
      '',
      '### 分析结果',
    ].join('\n');
  };

  const buildSkillSynthesisPrompt = (prompt, execution, skillImages = []) => {
    const result = execution?.result || {};
    const rawContext = String(result.data?.context || '');
    const displayPrefix = getSkillDisplayPrefix(execution);
    const shouldKeepFullContext = Boolean(result.data?.fullContext || result.data?.stats?.fullMatchedRowsUploaded);
    const context = !shouldKeepFullContext && rawContext.length > SKILL_SYNTHESIS_CONTEXT_LIMIT
      ? `${rawContext.slice(0, SKILL_SYNTHESIS_CONTEXT_LIMIT)}\n...（技能上下文已自动压缩截断，避免一次分析消耗过多 token。）`
      : rawContext;
    const details = Array.isArray(result.details) ? result.details.join('\n') : '';
    return [
      '【用户原始问题】',
      prompt,
      '',
      '【已执行项目技能】',
      `技能：${execution?.skill?.title || execution?.skill?.id || '-'}`,
      `执行状态：${result.ok ? '完成' : '未完成'}`,
      `执行消息：${result.message || '-'}`,
      details ? `执行详情：\n${details}` : '',
      '',
      context ? `【技能返回的完整数据上下文】\n${context}` : '',
      '',
      '【回答要求】',
      displayPrefix
        ? '前端已经在最终回复开头展示完整匹配数据表。你不要重复输出表格，只输出“分析结果”下面的分析内容。'
        : '',
      skillImages.length
        ? `前端已随本次消息上传 ${skillImages.length} 张匹配图谱图片。你必须阅读图片曲线和图中标注，重点做图谱之间的峰形、峰值、温区、吸放热/失重形态和异常点对比，不要只分析标题、标签或分类。`
        : '',
      '请直接回答用户原始问题，给出分析结论、关键依据和必要建议。',
      '不要再输出 gjhSkillCall JSON。',
      '不要只复述“技能已执行”。',
      '必须基于技能返回的数据上下文分析；数据不足时说明缺口。',
    ].filter(Boolean).join('\n');
  };

  const createAbortTimer = (label, timeoutMs = SKILL_SYNTHESIS_TIMEOUT_MS, parentSignal = null) => {
    if (typeof AbortController !== 'function') {
      return {
        signal: parentSignal || undefined,
        clear: () => {},
        formatError: (error) => error?.message || '未知错误',
      };
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    let parentAbortHandler = null;
    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentAbortHandler = () => controller.abort();
        parentSignal.addEventListener('abort', parentAbortHandler, { once: true });
      }
    }
    return {
      signal: controller.signal,
      clear: () => {
        window.clearTimeout(timer);
        if (parentSignal && parentAbortHandler) {
          parentSignal.removeEventListener('abort', parentAbortHandler);
        }
      },
      formatError: (error) => {
        if (error?.name === 'AbortError') {
          if (parentSignal?.aborted || chatAbortRequested) return '用户已终止本次分析。';
          const seconds = Math.round(timeoutMs / 1000);
          return `${label}超过 ${seconds} 秒未返回，请缩小数据范围或切换更快模型后重试。`;
        }
        return error?.message || '未知错误';
      },
    };
  };

  const synthesizeSkillResult = async ({ config, model, prompt, execution, pendingIndex, displayPrefix = '', signal = null, images = [] }) => {
    const skillImages = normalizeImages(images);
    const synthesisMessages = [
      { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
      {
        role: 'system',
        content: [
          getProjectContext(),
          '你正在接收前端项目技能执行后的数据结果。你的任务是把这些结果转成用户真正想要的分析回答，而不是继续调用技能。',
          '前端已经完成数据检索或项目操作；你必须直接分析这些数据并给出结论，不要输出 gjhSkillCall JSON。',
          '如果前端已经展示匹配数据表，你不要重复输出表格，只继续输出分析结果。',
          skillImages.length
            ? '本轮还包含匹配图谱图片作为视觉输入。你要基于图片本身做图谱对比分析，不要停留在元数据摘要。'
            : '',
        ].join('\n\n'),
      },
      toApiMessage(
        { role: 'user', content: buildSkillSynthesisPrompt(prompt, execution, skillImages) },
        { images: skillImages }
      ),
    ];
    const streamEnabled = config.aiProvider === 'lmstudio' || Boolean(config.streamEnabled);
    const requestTimer = createAbortTimer('AI 分析', SKILL_SYNTHESIS_TIMEOUT_MS, signal);

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        signal: requestTimer.signal,
        body: JSON.stringify({
          model,
          messages: synthesisMessages,
          temperature: config.temperature,
          max_tokens: Math.max(Number(config.maxTokens) || 0, constants.DEFAULT_CONFIG.maxTokens || 4096),
          stream: streamEnabled,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errorText ? `：${errorText.slice(0, 300)}` : ''}`);
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const usedStream = streamEnabled
        && response.body
        && (config.aiProvider === 'lmstudio' || contentType.includes('text/event-stream'));

      if (usedStream) {
        let content = '';
        const streamResult = await consumeChatCompletionStream(response, (delta) => {
          content += delta;
          if (Number.isInteger(pendingIndex) && pendingIndex >= 0) {
            scheduleStreamRender(pendingIndex, [displayPrefix, content || '正在分析...'].filter(Boolean).join('\n\n'));
          }
        }, { signal: requestTimer.signal });

        if (!streamResult.receivedDelta) {
          throw new Error('AI 分析没有返回流式内容。');
        }
        if (Number.isInteger(pendingIndex) && pendingIndex >= 0) {
          flushStreamRender(pendingIndex, [displayPrefix, content || '我暂时没有返回内容。'].filter(Boolean).join('\n\n'));
        }

        return {
          content: [displayPrefix, content.trim()].filter(Boolean).join('\n\n'),
          usage: streamResult.usage || null,
          finishReason: streamResult.finishReason || '',
          messages: synthesisMessages,
          usedStream,
        };
      }

      if (requestTimer.signal?.aborted) throw createAbortError();
      const data = await response.json();
      if (requestTimer.signal?.aborted) throw createAbortError();
      const content = data?.choices?.[0]?.message?.content?.trim() || '';
      return {
        content: [displayPrefix, content].filter(Boolean).join('\n\n'),
        usage: data?.usage || null,
        finishReason: String(data?.choices?.[0]?.finish_reason || ''),
        messages: synthesisMessages,
        usedStream,
      };
    } catch (error) {
      throw new Error(requestTimer.formatError(error));
    } finally {
      requestTimer.clear();
    }
  };

  const runLocalSkillPlan = async (prompt, plan) => {
    setChatBusyState(true);

    pushChatMessage('user', prompt);
    if (refs.chatInput) refs.chatInput.value = '';

    try {
      const execution = await App.projectSkills.executeSkill(plan.skillId, plan.input || {}, {
        source: 'chat-natural-language',
        prompt,
      });
      pushChatMessage(
        'assistant',
        App.projectSkills.formatSkillMessage(execution),
        [],
        App.projectSkills.getResultActions?.(execution) || []
      );
    } catch (error) {
      pushChatMessage('assistant', `项目技能执行失败：${error?.message || '未知错误'}`);
    } finally {
      setChatBusyState(false);
      if (refs.chatInput) {
        refs.chatInput.focus();
      }
    }
  };

  const runChatSkillAction = async (messageIndex, actionIndex) => {
    if (state.chatBusy) return;
    const sourceMessage = state.chatHistory[messageIndex];
    const action = normalizeSkillActions(sourceMessage?.actions)[actionIndex];
    if (!sourceMessage || !action || action.disabled) return;

    setChatBusyState(true);

    const actions = normalizeSkillActions(sourceMessage.actions);
    if (action.consumesGroup) {
      sourceMessage.actions = actions.map((item) => ({ ...item, disabled: true }));
    } else {
      actions[actionIndex] = { ...actions[actionIndex], disabled: true };
      sourceMessage.actions = actions;
    }
    saveChatState();
    renderChatMessages({ autoScroll: false });

    try {
      const execution = await App.projectSkills.executeSkill(action.skillId, action.input || {}, {
        source: 'chat-action-button',
        prompt: action.label,
      });
      pushChatMessage(
        'assistant',
        App.projectSkills.formatSkillMessage(execution),
        [],
        App.projectSkills.getResultActions?.(execution) || []
      );
    } catch (error) {
      pushChatMessage('assistant', `项目技能执行失败：${error?.message || '未知错误'}`);
    } finally {
      setChatBusyState(false);
      if (refs.chatInput) {
        refs.chatInput.focus();
      }
    }
  };

  const consumeChatCompletionStream = async (response, onDelta, options = {}) => {
    if (!response.body) return { receivedDelta: false, usage: null, finishReason: '' };

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const signal = options.signal || null;
    let buffer = '';
    let finished = false;
    let receivedDelta = false;
    let streamUsage = null;
    let streamFinishReason = '';
    let abortHandler = null;

    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw createAbortError();
    }
    if (signal) {
      abortHandler = () => {
        reader.cancel().catch(() => {});
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

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
        if (payload?.usage) streamUsage = payload.usage;
        if (payload?.choices?.[0]?.finish_reason) streamFinishReason = String(payload.choices[0].finish_reason || '');
        if (delta) {
          receivedDelta = true;
          onDelta(delta, payload);
        }
      } catch (error) {
        // Ignore malformed heartbeat/control frames and keep streaming.
      }
    };

    try {
      while (!finished) {
        if (signal?.aborted) throw createAbortError();
        const { value, done } = await reader.read();
        if (signal?.aborted) throw createAbortError();
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

      return { receivedDelta, usage: streamUsage, finishReason: streamFinishReason };
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw createAbortError();
      throw error;
    } finally {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      try {
        reader.releaseLock?.();
      } catch {
        // Some browsers keep the reader locked briefly after cancellation.
      }
    }
  };

  const buildAssistantRenderMessage = (content, options = {}) => ({
    role: 'assistant',
    content: content || '正在思考...',
    images: [],
    pending: Boolean(options.pending),
    pendingStatus: options.pendingStatus || '',
    imageUploadAuth: normalizeImageUploadAuth(options.imageUploadAuth),
  });

  const scheduleStreamRender = (pendingIndex, content, options = {}) => {
    if (streamRenderTimer) return;
    streamRenderTimer = window.setTimeout(() => {
      streamRenderTimer = 0;
      state.chatHistory[pendingIndex] = buildAssistantRenderMessage(content, options);
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      renderChatMessages({ autoScroll: true });
    }, 120);
  };

  const flushStreamRender = (pendingIndex, content, options = {}) => {
    if (streamRenderTimer) {
      window.clearTimeout(streamRenderTimer);
      streamRenderTimer = 0;
    }
    state.chatHistory[pendingIndex] = buildAssistantRenderMessage(content, options);
    const session = getActiveSession();
    if (session) session.updatedAt = nowIso();
    saveChatState();
    renderChatMessages({ autoScroll: true });
  };

  const pushChatMessage = (role, content, images = [], actions = []) => {
    const session = getActiveSession();
    if (!session) return;

    session.messages.push({
      role,
      content,
      images: normalizeImages(images),
      actions: normalizeSkillActions(actions),
    });
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
    const enabled = isProjectAccessEnabled();
    const pageId = getActivePageId();
    const pageTitle = constants.PAGE_DEFS?.[pageId]?.title || '当前页';
    const label = enabled ? '接入' : '不接入';
    const icon = enabled ? 'ti-plug-connected' : 'ti-plug-off';

    refs.assistantDataToggleBtn.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i><span>${label}</span>`;
    refs.assistantDataToggleBtn.classList.toggle('is-active', enabled);
    refs.assistantDataToggleBtn.setAttribute('aria-pressed', String(enabled));
    refs.assistantDataToggleBtn.setAttribute('aria-label', enabled ? '已接入项目数据与技能' : '未接入项目数据与技能');
    refs.assistantDataToggleBtn.setAttribute(
      'title',
      enabled
        ? `已接入：AI 会按当前所在页面（${pageTitle}）读取项目数据并可调用项目技能`
        : '未接入：仅进行普通 AI 对话，不读取项目数据，也不调用项目技能'
    );
  };

  const saveDataAttachmentState = () => {
    utils.writeJson(constants.CHAT_DATA_ATTACHMENT_KEY, Boolean(state.dataAttachmentEnabled));
  };

  const loadDataAttachmentState = () => {
    state.dataAttachmentEnabled = Boolean(utils.readJson(constants.CHAT_DATA_ATTACHMENT_KEY, false));
  };

  const saveWebSearchState = () => {
    utils.writeJson(constants.CHAT_SEARCH_ENABLED_KEY, webSearchEnabled);
  };

  const loadWebSearchState = () => {
    webSearchEnabled = Boolean(utils.readJson(constants.CHAT_SEARCH_ENABLED_KEY, true));
  };

  const ensureWebSearchToggleButton = () => {
    if (document.getElementById('assistantSearchToggleBtn')) return;
    const button = document.createElement('button');
    button.className = 'tiny-btn search-toggle-btn';
    button.type = 'button';
    button.id = 'assistantSearchToggleBtn';
    button.setAttribute('aria-pressed', 'true');
    button.innerHTML = '<i class="ti ti-world-search" aria-hidden="true"></i><span>联网搜索</span>';
    refs.assistantDataToggleBtn?.insertAdjacentElement('afterend', button);
  };

  const renderWebSearchState = () => {
    const button = document.getElementById('assistantSearchToggleBtn');
    if (!button) return;
    button.classList.toggle('is-active', webSearchEnabled);
    button.setAttribute('aria-pressed', String(webSearchEnabled));
    const icon = button.querySelector('.ti');
    const label = button.querySelector('span');
    if (icon) {
      icon.classList.toggle('ti-world-search', webSearchEnabled);
      icon.classList.toggle('ti-world-off', !webSearchEnabled);
    }
    if (label) label.textContent = webSearchEnabled ? '联网搜索' : '不搜索';
  };

  const moveClearChatButtonToHeader = () => {
    if (!refs.clearChatBtn) return;
    const headActions = document.querySelector('.assistant-head-actions');
    if (!headActions || headActions.contains(refs.clearChatBtn)) return;
    refs.clearChatBtn.className = 'icon-btn assistant-icon-btn';
    refs.clearChatBtn.setAttribute('aria-label', '清空聊天');
    refs.clearChatBtn.setAttribute('title', '清空聊天');
    refs.clearChatBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    headActions.insertBefore(refs.clearChatBtn, refs.assistantExpandBtn || refs.assistantCloseBtn || null);
  };

  const renderChatSubmitState = () => {
    if (!refs.chatSendBtn) return;
    const busy = Boolean(state.chatBusy);
    refs.chatSendBtn.classList.toggle('is-stop', busy);
    refs.chatSendBtn.classList.toggle('is-stopping', busy && chatAbortRequested);
    refs.chatSendBtn.disabled = busy && chatAbortRequested;
    refs.chatSendBtn.setAttribute('aria-label', busy ? '终止本次 AI 分析' : '开始 AI 分析');
    refs.chatSendBtn.setAttribute('title', busy ? '终止本次 AI 分析' : '开始分析');
    refs.chatSendBtn.innerHTML = busy
      ? `<span>${chatAbortRequested ? '终止中' : '终止分析'}</span><i class="ti ti-player-stop-filled" aria-hidden="true"></i>`
      : '<span>开始分析</span><i class="ti ti-send-2" aria-hidden="true"></i>';
  };

  const setChatBusyState = (busy) => {
    state.chatBusy = Boolean(busy);
    if (!busy) chatAbortRequested = false;
    if (refs.chatInput) refs.chatInput.disabled = Boolean(busy);
    renderChatSubmitState();
  };

  const stopCurrentChatAnalysis = () => {
    if (!state.chatBusy || chatAbortRequested) return;
    chatAbortRequested = true;
    renderChatSubmitState();
    if (activeChatAbortController) {
      activeChatAbortController.abort();
    }
  };

  const sendChatMessage = async () => {
    if (state.chatBusy) {
      stopCurrentChatAnalysis();
      return;
    }
    const prompt = (refs.chatInput?.value || '').trim();
    if (!prompt) return;

    const projectAccessEnabled = isProjectAccessEnabled();
    if (shouldAnswerCurrentDateLocally(prompt)) {
      pushChatMessage('user', prompt);
      if (refs.chatInput) refs.chatInput.value = '';
      pushChatMessage('assistant', buildCurrentDateLocalAnswer());
      return;
    }

    const localPlan = projectAccessEnabled ? App.projectSkills?.routePrompt?.(prompt) : null;
    if (localPlan?.skillId === 'assistant.openPage') {
      await runLocalSkillPlan(prompt, localPlan);
      return;
    }

    const config = App.config.getFormConfig();
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
          ...(projectAccessEnabled ? getAttachedDataImages(prompt) : []),
        ]
        .slice(0, 8)
      : [];
    let attachedImages = [];
    let wantsImages = false;

    activeChatAbortController = typeof AbortController === 'function' ? new AbortController() : null;
    chatAbortRequested = false;
    setChatBusyState(true);

    pushChatMessage('user', prompt);
    pendingDraftImages = [];
    if (refs.chatInput) refs.chatInput.value = '';
    pushChatMessage('assistant', '正在思考...');
    const pendingIndex = state.chatHistory.length - 1;
    flushStreamRender(pendingIndex, '正在思考...', { pending: true, pendingStatus: '正在思考' });
    const isLmStudioProvider = config.aiProvider === 'lmstudio';
    const streamEnabled = isLmStudioProvider || Boolean(config.streamEnabled);
    let streamedContent = '';
    let streamedImages = [];
    let apiUsage = null;
    let apiMessages = [];
    let finishReason = '';
    let attachedDataFile = null;
    let attachedDataContext = '';
    let webSearchContext = '';
    let webSearchResults = [];
    let searchDecision = null;
    let needsWebSearch = false;
    let usedStream = false;
    let skillExecution = null;
    let skipAiRequest = false;
    const callStartedAt = nowIso();
    const callStartMs = window.performance?.now?.() ?? Date.now();

    try {
      attachedDataFile = projectAccessEnabled ? getAttachedDataFile(prompt) : null;
      attachedDataContext = projectAccessEnabled ? getAttachedDataContext(prompt) : '';
      flushStreamRender(pendingIndex, '正在判断是否需要联网搜索...', { pending: true, pendingStatus: '正在判断搜索需求' });
      try {
        searchDecision = await decideSearchWithAi(config, model, prompt, {
          signal: activeChatAbortController?.signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        searchDecision = null;
        console.warn('[chat] Search decision failed, fallback to local rules:', error);
      }
      const localSearchRequired = promptRequiresWebSearch(prompt);
      needsWebSearch = Boolean(searchDecision?.needsSearch || localSearchRequired);

      if (needsWebSearch && !webSearchEnabled) {
        streamedContent = buildSearchUnavailableAnswer('聊天框的“联网搜索”已关闭');
        finishReason = 'web_search_disabled';
        skipAiRequest = true;
        flushStreamRender(pendingIndex, streamedContent);
      } else if (needsWebSearch && !config.searchApiKey) {
        streamedContent = buildSearchUnavailableAnswer('未配置 Tavily API Key');
        finishReason = 'web_search_missing_key';
        skipAiRequest = true;
        flushStreamRender(pendingIndex, streamedContent);
      } else if (needsWebSearch) {
        flushStreamRender(pendingIndex, '正在联网搜索...', { pending: true, pendingStatus: '正在联网搜索' });
        const searchResult = await searchWebForPrompt(config, prompt, {
          signal: activeChatAbortController?.signal,
        });
        webSearchContext = searchResult.context || '';
        webSearchResults = searchResult.results || [];
        if (!webSearchResults.length) {
          streamedContent = [
            '联网搜索没有返回可用结果，因此本次不继续让 AI 直接猜测。',
            '',
            '请稍后重试，或换一个更具体的关键词。',
          ].join('\n');
          finishReason = 'web_search_empty';
          skipAiRequest = true;
          flushStreamRender(pendingIndex, streamedContent);
        } else {
          flushStreamRender(
            pendingIndex,
            `已获取 ${webSearchResults.length} 条联网资料，正在整理回答...`,
            {
              pending: true,
              pendingStatus: '正在整理联网资料',
            }
          );
        }
      }
      if (!skipAiRequest && !needsWebSearch) {
        flushStreamRender(pendingIndex, '正在思考...', { pending: true, pendingStatus: '正在思考' });
      }
      if (!skipAiRequest && rawAttachedImages.length) {
        const approved = await requestImageUploadAuthorization(rawAttachedImages, {
          pendingIndex,
          source: '本次消息',
          signal: activeChatAbortController?.signal,
        });
        if (!approved) {
          streamedContent = `已取消上传 ${rawAttachedImages.length} 张图片，本次未向 AI 发送图片。`;
          finishReason = 'image_upload_cancelled';
          skipAiRequest = true;
        } else {
          flushStreamRender(pendingIndex, `已授权上传 ${rawAttachedImages.length} 张图片，正在准备发送...`, {
            pending: true,
            pendingStatus: '准备上传图片',
          });
          attachedImages = await compressImagesForAi(rawAttachedImages, { prompt });
          const userMessage = state.chatHistory[pendingIndex - 1];
          if (userMessage?.role === 'user') {
            userMessage.images = attachedImages;
            saveChatState();
          }
        }
      }

      wantsImages = supportsImageOutput && !attachedImages.length && /(?:生成图片|出图|画一张|画图|插图|图片|图像|壁纸|海报|封面)/.test(prompt);

      if (!skipAiRequest) {
      const requestMessages = state.chatHistory
        .slice(0, pendingIndex)
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .slice(-12)
        .map((item, index, items) => {
          const isCurrentUserMessage = index === items.length - 1 && item.role === 'user';
          return toApiMessage(item, {
            content: isCurrentUserMessage
              ? (attachedDataFile
                ? buildUserPromptWithFile(buildPromptWithCurrentDate(item.content), attachedDataFile)
                : buildUserPromptWithData(buildPromptWithCurrentDate(item.content), attachedDataContext))
              : item.content,
            files: isCurrentUserMessage && attachedDataFile ? [attachedDataFile] : [],
            images: isCurrentUserMessage ? attachedImages : item.images,
          });
        });
      apiMessages = [
        ...getContextMessages(config, ''),
        ...(webSearchContext ? [
          { role: 'user', content: webSearchContext },
          { role: 'assistant', content: '已读取联网搜索资料。我会结合资料回答，并在需要时列出来源链接。' },
        ] : []),
        ...requestMessages,
      ];

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        signal: activeChatAbortController?.signal,
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
      usedStream = !wantsImages
        && !attachedDataFile
        && streamEnabled
        && response.body
        && (isLmStudioProvider || contentType.includes('text/event-stream'));

      if (usedStream) {
        const streamResult = await consumeChatCompletionStream(response, (delta) => {
          streamedContent += delta;
          scheduleStreamRender(pendingIndex, streamedContent);
        }, { signal: activeChatAbortController?.signal });
        if (!streamResult.receivedDelta) {
          throw new Error('本地模型没有返回流式内容，请确认 LM Studio 已启用 OpenAI Compatible Server。');
        }
        apiUsage = streamResult.usage || apiUsage;
        finishReason = streamResult.finishReason || finishReason;
        flushStreamRender(pendingIndex, streamedContent);
      } else {
        if (activeChatAbortController?.signal.aborted) throw createAbortError();
        const data = await response.json();
        if (activeChatAbortController?.signal.aborted) throw createAbortError();
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

      skillExecution = projectAccessEnabled
        ? await App.projectSkills?.executeSkillCallFromText?.(streamedContent, {
            source: 'assistant-skill-call',
            prompt,
            onBeforeExecute: () => flushStreamRender(pendingIndex, '正在获取项目数据...', { pending: true, pendingStatus: '正在获取项目数据' }),
          })
        : null;
      if (activeChatAbortController?.signal.aborted) throw createAbortError();
      if (skillExecution) {
        const needsSynthesis = shouldSynthesizeSkillResult(skillExecution);
        const displayPrefix = getSkillDisplayPrefix(skillExecution);
        flushStreamRender(
          pendingIndex,
          needsSynthesis
            ? [displayPrefix, '正在分析...'].filter(Boolean).join('\n\n')
            : '项目技能已执行，正在整理结果...',
          {
            pending: true,
            pendingStatus: needsSynthesis ? '正在分析' : '项目技能已执行，正在整理结果',
          }
        );
        if (needsSynthesis) {
          try {
            const rawSkillImages = getSkillResultImages(skillExecution);
            const isSpectrumImageSearch = skillExecution?.skill?.id === 'spectrum.searchImages';
            if (isSpectrumImageSearch && !rawSkillImages.length) {
              streamedContent = [
                App.projectSkills.formatSkillMessage(skillExecution),
                '',
                '【提示】检索结果没有可上传的图谱图片，无法进行曲线、峰形或标注的视觉分析。',
              ].join('\n');
            } else {
              if (rawSkillImages.length) {
                const skillUploadApproved = await requestImageUploadAuthorization(rawSkillImages, {
                  pendingIndex,
                  displayPrefix,
                  source: '图谱检索结果',
                  signal: activeChatAbortController?.signal,
                });
                if (!skillUploadApproved) {
                  streamedContent = [
                    displayPrefix,
                    `已取消上传 ${rawSkillImages.length} 张图谱图片，本次未继续进行视觉图谱分析。`,
                  ].filter(Boolean).join('\n\n');
                } else {
                  flushStreamRender(
                    pendingIndex,
                    [displayPrefix, `已授权上传 ${rawSkillImages.length} 张图谱图片，正在交给 AI 分析...`].filter(Boolean).join('\n\n'),
                    { pending: true, pendingStatus: '正在分析图谱图片' }
                  );
                  const skillImages = await compressImagesForAi(rawSkillImages, { prompt });
                  const imageNotice = rawSkillImages.length && !skillImages.length
                    ? '\n\n【提示】本次没有可上传的图谱图片，因此无法做曲线图片分析。请确认图谱记录里有图片。'
                    : '';
                  const synthesized = await synthesizeSkillResult({
                    config,
                    model,
                    prompt,
                    execution: skillExecution,
                    pendingIndex,
                    displayPrefix,
                    signal: activeChatAbortController?.signal,
                    images: skillImages,
                  });
                  streamedContent = `${synthesized.content || App.projectSkills.formatSkillMessage(skillExecution)}${imageNotice}`;
                  apiUsage = synthesized.usage || apiUsage;
                  finishReason = synthesized.finishReason || finishReason;
                  apiMessages = synthesized.messages || apiMessages;
                  usedStream = usedStream || Boolean(synthesized.usedStream);
                }
              } else {
                const synthesized = await synthesizeSkillResult({
                  config,
                  model,
                  prompt,
                  execution: skillExecution,
                  pendingIndex,
                  displayPrefix,
                  signal: activeChatAbortController?.signal,
                  images: [],
                });
                streamedContent = synthesized.content || App.projectSkills.formatSkillMessage(skillExecution);
                apiUsage = synthesized.usage || apiUsage;
                finishReason = synthesized.finishReason || finishReason;
                apiMessages = synthesized.messages || apiMessages;
                usedStream = usedStream || Boolean(synthesized.usedStream);
              }
            }
          } catch (error) {
            if (isAbortError(error)) throw error;
            const skillImageCount = getSkillResultImages(skillExecution).length;
            streamedContent = skillExecution?.skill?.id === 'spectrum.searchImages' && skillImageCount
              ? [
                  `已找到 ${skillImageCount} 张相关图谱，并已尝试上传图谱图片给 AI 做曲线对比分析。`,
                  '',
                  `【提示】图片分析失败：${error?.message || '未知错误'}`,
                  '请确认当前模型支持图像输入；如果不支持，请切换到图像理解模型后重试。',
                ].join('\n')
              : [
                  App.projectSkills.formatSkillMessage(skillExecution),
                  '',
                  `【提示】技能结果已生成，但二次分析失败：${error?.message || '未知错误'}`,
                ].join('\n');
          }
        } else {
          streamedContent = App.projectSkills.formatSkillMessage(skillExecution);
        }
        streamedImages = [];
      }
      }
      const skillActions = skillExecution
        ? (App.projectSkills.getResultActions?.(skillExecution) || [])
        : [];
      const tokenUsage = buildTokenUsageMeta({
        apiUsage,
        requestMessages: apiMessages,
        completionText: streamedContent,
        model,
      });

      state.chatHistory[pendingIndex] = {
        role: 'assistant',
        content: finishReason === 'length'
          ? `${streamedContent || '我暂时没有返回内容。'}\n\n【提示】本次回答达到模型输出上限，内容可能未完整结束。可以继续追问“继续”。`
          : streamedContent || '我暂时没有返回内容。',
        images: streamedImages,
        actions: normalizeSkillActions(skillActions),
        tokenUsage,
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
      recordAiCall({
        source: 'chat',
        provider: config.aiProvider,
        model,
        endpoint: `${config.baseUrl}/chat/completions`,
        pageId: getActivePageId(),
        sessionId: state.chatSessionId,
        startedAt: callStartedAt,
        endedAt: nowIso(),
        durationMs: (window.performance?.now?.() ?? Date.now()) - callStartMs,
        status: skipAiRequest ? 'cancelled' : 'success',
        statusText: finishReason,
        prompt,
        responsePreview: streamedContent,
        tokenUsage,
        requestMeta: {
          messages: apiMessages.length,
          images: attachedImages.length,
          files: attachedDataFile ? 1 : 0,
          attachedData: Boolean(attachedDataContext || attachedDataFile),
          webSearch: webSearchResults.length,
          webSearchNeeded: needsWebSearch,
          webSearchDecision: searchDecision,
          stream: usedStream,
        },
      });
    } catch (error) {
      if (streamRenderTimer) {
        window.clearTimeout(streamRenderTimer);
        streamRenderTimer = 0;
      }
      const wasStopped = chatAbortRequested || isAbortError(error);
      const currentMessage = state.chatHistory[pendingIndex] || {};
      const currentContent = stripPendingStatus(String(currentMessage.content || '').trim(), currentMessage.pendingStatus);
      const fallbackMessage = wasStopped ? '【已终止】本次 AI 分析已停止。' : `发送失败：${error?.message || '网络或权限错误'}`;
      state.chatHistory[pendingIndex] = {
        role: 'assistant',
        content: currentContent ? `${currentContent}\n\n${fallbackMessage}` : fallbackMessage,
        images: [],
        pending: false,
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
      recordAiCall({
        source: 'chat',
        provider: config.aiProvider,
        model,
        endpoint: `${config.baseUrl}/chat/completions`,
        pageId: getActivePageId(),
        sessionId: state.chatSessionId,
        startedAt: callStartedAt,
        endedAt: nowIso(),
        durationMs: (window.performance?.now?.() ?? Date.now()) - callStartMs,
        status: wasStopped ? 'cancelled' : 'failed',
        error: wasStopped ? '用户终止' : (error?.message || '网络或权限错误'),
        prompt,
        responsePreview: currentContent,
        requestMessages: apiMessages,
        completionText: currentContent,
        requestMeta: {
          messages: apiMessages.length,
          images: attachedImages.length,
          files: attachedDataFile ? 1 : 0,
          attachedData: Boolean(attachedDataContext || attachedDataFile),
          webSearch: webSearchResults.length,
          webSearchNeeded: needsWebSearch,
          webSearchDecision: searchDecision,
          stream: usedStream,
        },
      });
    } finally {
      activeChatAbortController = null;
      setChatBusyState(false);
      if (refs.chatInput) refs.chatInput.focus();
    }
  };

  const bindChat = () => {
    ensureWebSearchToggleButton();
    moveClearChatButtonToHeader();
    refs.assistantDataToggleBtn?.addEventListener('click', () => {
      state.dataAttachmentEnabled = !state.dataAttachmentEnabled;
      saveDataAttachmentState();
      renderDataAttachmentState();
    });

    document.getElementById('assistantSearchToggleBtn')?.addEventListener('click', () => {
      webSearchEnabled = !webSearchEnabled;
      saveWebSearchState();
      renderWebSearchState();
    });

    refs.clearChatBtn?.addEventListener('click', async () => {
      const session = getActiveSession();
      if (!session) return;
      const confirmed = await App.confirmDialog?.confirmDelete?.({
        title: '清空聊天',
        message: `确认清空「${session.title || NEW_CONVERSATION_TITLE}」中的全部消息吗？`,
        confirmText: '确认清空',
      });
      if (!confirmed) return;
      session.messages = [];
      session.title = NEW_CONVERSATION_TITLE;
      session.updatedAt = nowIso();
      state.chatHistory = session.messages;
      saveChatState();
      renderChat();
      App.notify?.warn?.('已清空当前聊天', { key: `chat-clear:${session.id}` });
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
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const imageAuthButton = target.closest('[data-chat-image-auth]');
      if (imageAuthButton) {
        const [requestId, decision] = String(imageAuthButton.getAttribute('data-chat-image-auth') || '').split(':');
        if (requestId) settleImageUploadAuthorization(requestId, decision === 'approve');
        return;
      }

      const actionButton = target.closest('[data-chat-skill-action]');
      if (actionButton) {
        const [messageIndex, actionIndex] = String(actionButton.getAttribute('data-chat-skill-action') || '')
          .split(':')
          .map((value) => Number.parseInt(value, 10));
        if (Number.isFinite(messageIndex) && Number.isFinite(actionIndex)) {
          runChatSkillAction(messageIndex, actionIndex);
        }
        return;
      }

      const button = target.closest('[data-chat-image-preview]');
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
        if (state.chatBusy) stopCurrentChatAnalysis();
        closeConversationMenu();
        closeChatImagePreview();
      }
    });
  };

  const init = () => {
    loadDataAttachmentState();
    loadWebSearchState();
    ensureWebSearchToggleButton();
    moveClearChatButtonToHeader();
    const loaded = loadChatState();
    state.chatSessions = loaded.sessions;
    state.chatSessionId = loaded.activeId;
    const activeSession = getActiveSession();
    state.chatHistory = activeSession?.messages || [];
    bindChat();
    renderChat();
    renderDataAttachmentState();
    renderWebSearchState();
    renderChatSubmitState();
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
