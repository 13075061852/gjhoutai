import { getLegacyApp } from '../core/app-context';
import {
  buildAgentRouteClassifierMessages,
  parseAgentRouteClassification,
} from './agent-runtime/router';
import { createAgentExecutionEngine } from './agent-runtime/execution-engine';
import { createIntentGateway } from './agent-runtime/intent-gateway';
import { createAgentPlanner } from './agent-runtime/planner';
import type { AgentIntent } from './agent-runtime/protocol';
import { createProjectToolRegistry } from './agent-runtime/project-tool-definitions';
import { createAgentRuntime } from './agent-runtime/runtime';
import { createLocalStorageAgentRunStore } from './agent-runtime/run-store';
import { createProjectToolAdapters } from './agent-runtime/tools';
import { AI_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../../utils/fetch';
import '../../styles/pages/dashboard-chat.css';
import { createStreamRenderScheduler } from './chat/chat-render';
import { canRunLocalSkillDirectly, selectRecentHistory } from './chat/chat-agent';
import { createChatSessionStore } from './chat/chat-core';
import { selectGroundedAnswer } from './agent-runtime/grounding';
import {
  createChatRuntimeController,
  type ChatRuntimeMessage,
} from './chat/chat-runtime-controller';
import { createChatRuntimeMessageStore } from './chat/chat-runtime-message-store';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { refs, constants, state, utils } = App;
  const NEW_CONVERSATION_TITLE = '新建对话';
  const SKILL_SYNTHESIS_TIMEOUT_MS = 90000;
  const SKILL_SYNTHESIS_CONTEXT_LIMIT = 12000;
  let conversationMenuOpen = false;
  let pendingDraftImages = [];
  let chatAbortRequested = false;
  let chatSubmissionLocked = false;
  let chatEventsBound = false;
  let chatEventController = null;
  let webSearchEnabled = true;
  let chatRuntimeController = null;
  let runtimeRequestContext = null;
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

  let projectPageCatalogCache = '';

  const createRouteClassifier = (config, model, options = {} as any) => async (
    { prompt, activePageId },
  ): Promise<AgentIntent | null> => {
    const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: App.config.getRequestHeaders(config),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages: buildAgentRouteClassifierMessages({ prompt, activePageId }),
        temperature: 0,
        max_tokens: 320,
        stream: false,
      }),
    }, AI_FETCH_TIMEOUT_MS);
    if (!response.ok) return null;
    const payload = await response.json();
    const classification = parseAgentRouteClassification(payload?.choices?.[0]?.message?.content || '');
    if (!classification?.kind) return null;
    const kindMap = {
      'local-tool': 'single_tool',
      'web-search': 'web_search',
      'image-generation': 'image_generation',
      'image-analysis': 'image_analysis',
      chat: 'chat',
    } as const;
    const kind = kindMap[classification.kind];
    if (!kind) return null;
    const queries = Array.isArray(classification.searchQueries)
      ? classification.searchQueries.filter(Boolean).slice(0, 3)
      : [];
    return {
      kind,
      confidence: Math.max(0, Math.min(1, Number(classification.confidence) || 0.5)),
      reason: String(classification.reason || 'AI 辅助意图分类'),
      ...(classification.skillId ? { toolId: classification.skillId } : {}),
      ...(classification.input ? { toolInput: classification.input } : {}),
      ...(kind === 'web_search' && queries.length ? {
        searchPlan: {
          queries,
          maxResults: Math.max(3, Math.min(20, Number(classification.maxResults) || 5)),
          searchDepth: classification.searchDepth === 'advanced' ? 'advanced' : 'basic',
          topic: classification.topic === 'news' ? 'news' : 'general',
        },
      } : {}),
    };
  };

  const makeSessionId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const makeMessageId = () => `message-${makeSessionId()}`;

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

  const normalizeMessageSearchSources = (sources) => (Array.isArray(sources) ? sources.map((source, index) => {
    const title = String(source?.title || source?.url || '').trim();
    const url = String(source?.url || '').trim();
    if (!title && !url) return null;
    return {
      id: Number.parseInt(source?.id, 10) || index + 1,
      title: title || `来源 ${index + 1}`,
      url,
      publishedDate: String(source?.publishedDate || '').trim(),
    };
  }).filter(Boolean).slice(0, 10) : []);

  const normalizeMessage = (message) => ({
    id: String(message?.id || makeMessageId()),
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
    searchSources: normalizeMessageSearchSources(message?.searchSources),
    agentSteps: Array.isArray(message?.agentSteps) ? message.agentSteps : [],
    agentConfirmation: message?.agentConfirmation && typeof message.agentConfirmation === 'object'
      ? message.agentConfirmation
      : null,
    agentRunId: String(
      message?.agentRunId
      || message?.agentConfirmation?.runId
      || '',
    ),
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

  const buildPersistedSession = (session) => ({
    id: session.id,
    title: session.title,
    messages: session.messages.map((item) => ({
      ...item,
      images: Array.isArray(item.images) && item.images.length ? [{
        type: 'image_note',
        image_url: { url: '' },
        label: `已附带 ${item.images.length} 张图片（仅本轮发送，不保存原图）`,
      }] : [],
      tokenUsage: item.tokenUsage || null,
      actions: normalizeSkillActions(item.actions),
      searchSources: normalizeMessageSearchSources(item.searchSources),
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  const chatSessionStore = createChatSessionStore({
    constants,
    utils,
    normalizeSession,
    serializeSession: buildPersistedSession,
    makeSessionId,
    deriveSessionTitle,
    nowIso,
    newConversationTitle: NEW_CONVERSATION_TITLE,
  });

  const saveChatState = () => {
    const activeSession = getActiveSession();
    chatSessionStore.save(state.chatSessions, activeSession?.id || '');
  };

  const loadChatState = () => chatSessionStore.load();

  const isVisibleScrollElement = (element) => {
    if (!element?.isConnected) return false;
    const rects = element.getClientRects?.();
    return Boolean(rects?.length && element.clientHeight > 0);
  };

  const getChatScrollElement = () => {
    const messages = refs.chatMessages;
    if (!messages) return null;
    if (!isVisibleScrollElement(messages)) return null;
    if (messages.scrollHeight > messages.clientHeight + 1) return messages;
    const body = messages.closest?.('.assistant-body');
    if (body && isVisibleScrollElement(body) && body.scrollHeight > body.clientHeight + 1) return body;
    return messages;
  };

  const isChatNearBottom = () => {
    const scrollElement = getChatScrollElement();
    if (!scrollElement) return true;
    const distance = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    return distance < 96;
  };

  const scrollChatToBottom = () => {
    const scrollElement = getChatScrollElement();
    if (!scrollElement) return;
    requestAnimationFrame(() => {
      const currentScrollElement = getChatScrollElement();
      if (!currentScrollElement) return;
      currentScrollElement.scrollTop = currentScrollElement.scrollHeight;
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
    const livePending = item.status === 'pending' && imageUploadAuthResolvers.has(item.id);
    const expired = item.status === 'pending' && !livePending;
    const pending = livePending;
    const approved = item.status === 'approved';
    const statusText = pending ? '等待授权' : approved ? '已授权' : expired ? '已失效' : '已取消';
    const helpText = expired
      ? '这次上传授权请求已失效，请重新发送问题后再授权上传图谱图片。'
      : '授权后才会把这些图片发送给当前配置的 AI 服务，用于曲线、峰形、标注和异常点分析。';
    return `
      <div class="ai-upload-auth ${pending ? 'is-pending' : approved ? 'is-approved' : 'is-cancelled'}">
        <div class="ai-upload-auth-head">
          <span class="ai-upload-auth-icon"><i class="ti ti-photo-up" aria-hidden="true"></i></span>
          <span>
            <strong>上传图谱图片确认</strong>
            <em>${utils.escapeHtml(item.source)} · ${utils.escapeHtml(String(item.count))} 张 · ${utils.escapeHtml(statusText)}</em>
          </span>
        </div>
        <p>${utils.escapeHtml(helpText)}</p>
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

  const PENDING_STATUS_RE = /(?:正在思考|正在理解问题|正在规划|正在选择需要读取的项目数据|正在读取项目数据|正在整理回答|正在获取匹配数据表|正在获取项目数据|正在分析|正在执行项目技能|项目技能已执行，正在整理结果|等待上传授权|准备上传图片|正在分析图谱图片)(?:[.。…]*)?$/;

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
    if (statusText) {
      const normalizedText = text.replace(/[.。…\s]+$/g, '');
      if (normalizedText === statusText) return '';
      if (normalizedText.endsWith(statusText)) {
        text = normalizedText.slice(0, -statusText.length).trim();
      }
    }
    return text.replace(PENDING_STATUS_RE, '').trim();
  };

  const renderPendingContent = (item) => {
    const status = getPendingStatus(item);
    const body = stripPendingStatus(item.content, status);
    const hasExplicitStatus = Boolean(String(item?.pendingStatus || '').trim());
    const isShortStatusBody = hasExplicitStatus && body && !/[\r\n]/.test(body) && body.length <= 48;
    const bodyHtml = body && !isShortStatusBody ? utils.markdownLite(body) : '';
    if (bodyHtml) return bodyHtml;
    return `
      <div class="ai-waiting-row" role="status" aria-live="polite">
        <span class="ai-waiting-pulse" aria-hidden="true"></span>
        <span class="ai-waiting-text">${utils.escapeHtml(status)}</span>
        <span class="ai-waiting-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    `;
  };

  const renderSearchSourceReferences = (html, sources = []) => {
    const sourceMap = new Map(normalizeMessageSearchSources(sources).map((source) => [source.id, source]));
    if (!sourceMap.size) return html;
    return String(html || '').replace(/\[来源\s*(\d+)\]/g, (match, rawId) => {
      const id = Number.parseInt(rawId, 10);
      const source = sourceMap.get(id);
      if (!source) return match;
      const title = source.publishedDate ? `${source.title} · ${source.publishedDate}` : source.title;
      const label = `来源 ${id}`;
      if (!source.url) {
        return `<span class="ai-source-ref" title="${utils.escapeHtml(title)}">${utils.escapeHtml(label)}</span>`;
      }
      return `<a class="ai-source-ref" href="${utils.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" title="${utils.escapeHtml(title)}">${utils.escapeHtml(label)}</a>`;
    });
  };

  const renderedChatMessageNodes = [];
  const renderedChatMessageKeys = [];

  const getChatMessageRenderKey = (item, messageIndex) => JSON.stringify({
    messageIndex,
    role: item?.role || '',
    pending: Boolean(item?.pending),
    pendingStatus: item?.pendingStatus || '',
    content: item?.content || '',
    images: item?.images || [],
    tokenUsage: item?.tokenUsage || null,
    actions: item?.actions || null,
    imageUploadAuth: item?.imageUploadAuth || null,
    searchSources: item?.searchSources || null,
  });

  const createChatMessageElement = (item, messageIndex) => {
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
    const rawContentHtml = pending ? renderPendingContent({ ...item, content: displayContent }) : utils.markdownLite(displayContent);
    const contentHtml = item.role === 'assistant'
      ? renderSearchSourceReferences(rawContentHtml, item.searchSources)
      : rawContentHtml;
    const template = document.createElement('template');
    template.innerHTML = `<div class="ai-message ${item.role === 'user' ? 'user' : ''} ${pending ? 'is-pending' : ''}"><div class="ai-message-content">${contentHtml}</div>${imageUploadAuth}${images}${actions}${tokenMeta}</div>`;
    return template.content.firstElementChild;
  };

  const formatAgentParameter = (value) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value ?? '');
    }
  };

  const createAgentRuntimeElement = (item) => {
    if (item?.role !== 'assistant') return null;
    const normalizeStepLabel = (value) => String(value || '').trim().replace(/[.。!！?？…]+$/g, '');
    const messageContent = normalizeStepLabel(item.content);
    const pendingStatus = normalizeStepLabel(item.pendingStatus);
    const steps = (Array.isArray(item.agentSteps) ? item.agentSteps : [])
      .filter((step) => {
        const label = normalizeStepLabel(step?.label);
        return label && label !== messageContent && label !== pendingStatus;
      });
    const confirmation = item.agentConfirmation && typeof item.agentConfirmation === 'object'
      ? item.agentConfirmation
      : null;
    if (!steps.length && !confirmation) return null;

    const template = document.createElement('template');
    const stepsHtml = steps.length
      ? `<div class="ai-agent-steps" aria-label="Agent 执行进度">${steps.map((step) => `
          <div class="ai-agent-step" data-agent-status="${utils.escapeHtml(step?.status || 'running')}">
            <span class="ai-agent-step-dot" aria-hidden="true"></span>
            <span>${utils.escapeHtml(step?.label || '正在处理')}</span>
          </div>
        `).join('')}</div>`
      : '';
    const confirmationHtml = confirmation
      ? `
        <section class="ai-agent-confirmation" aria-label="Agent 操作确认">
          <div class="ai-agent-confirmation-title">需要确认后继续</div>
          <dl>
            <div><dt>目标</dt><dd>${utils.escapeHtml(confirmation.target || '-')}</dd></div>
            <div><dt>参数</dt><dd>${(confirmation.parameters || []).length
              ? confirmation.parameters.map((parameter) => `<code>${utils.escapeHtml(parameter.name)}=${utils.escapeHtml(formatAgentParameter(parameter.value))}</code>`).join(' ')
              : '无'}</dd></div>
            <div><dt>影响</dt><dd>${utils.escapeHtml(confirmation.impact || '-')}</dd></div>
            <div><dt>有效期</dt><dd>${utils.escapeHtml(confirmation.expiresAt || '-')}</dd></div>
          </dl>
          <div class="ai-agent-confirmation-actions">
            <button class="ui-button is-primary" type="button" data-chat-agent-confirm="${utils.escapeHtml(confirmation.confirmationId || '')}" data-chat-agent-run="${utils.escapeHtml(confirmation.runId || '')}">确认执行</button>
            <button class="ui-button" type="button" data-chat-agent-cancel="${utils.escapeHtml(confirmation.runId || '')}">取消</button>
          </div>
        </section>
      `
      : '';
    template.innerHTML = `<div class="ai-agent-runtime">${stepsHtml}${confirmationHtml}</div>`;
    return template.content.firstElementChild;
  };

  const syncAgentRuntimeElement = (messageNode, item) => {
    if (!messageNode) return;
    messageNode.querySelector('.ai-agent-runtime')?.remove();
    const runtimeElement = createAgentRuntimeElement(item);
    if (runtimeElement) messageNode.appendChild(runtimeElement);
  };

  const stripVerboseSourceUrls = (content) => {
    let text = String(content || '');
    text = text.replace(/\]\((https?:\/\/[^)\s]+)\)/g, ']');
    text = text.replace(/(^|\n)\s*\((?:https?:\/\/|www\.)[^)\s]+\)\s*(?=\n|$)/gi, '$1');
    text = text.replace(/(^|\n)\s*(?:URL|链接|网址)[:：]\s*(?:https?:\/\/|www\.)\S+\s*(?=\n|$)/gi, '$1');
    return text.trim();
  };

  const renderChatMessages = (options = {} as any) => {
    if (!refs.chatMessages) return;
    const shouldStickToBottom = options.forceScroll || (options.autoScroll !== false && isChatNearBottom());
    const intro = refs.chatIntroText;
    const items = state.chatHistory;

    const messageNodes = items.map((item, messageIndex) => {
      const nextKey = getChatMessageRenderKey(item, messageIndex);
      if (renderedChatMessageKeys[messageIndex] !== nextKey || !renderedChatMessageNodes[messageIndex]) {
        renderedChatMessageKeys[messageIndex] = nextKey;
        renderedChatMessageNodes[messageIndex] = createChatMessageElement(item, messageIndex);
      }
      const messageNode = renderedChatMessageNodes[messageIndex];
      syncAgentRuntimeElement(messageNode, item);
      return messageNode;
    }).filter(Boolean);

    renderedChatMessageNodes.length = items.length;
    renderedChatMessageKeys.length = items.length;
    refs.chatMessages.replaceChildren(...messageNodes);

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
    preview.className = 'dialog-overlay chat-image-preview';
    preview.innerHTML = `
      <button class="ui-button dialog-close chat-image-preview-close" type="button" aria-label="关闭图片预览">
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

  const draftPrompt = (prompt, options = {} as any) => {
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
  const shouldUseProjectContext = (prompt) => {
    const text = String(prompt || '').trim();
    if (!text) return false;
    return /(?:项目|网站|站点|本站|应用|平台|后台|系统|页面|打开|进入|切换|查看|订单|库存|商品|产品|成品|生产|物性|图谱|抠图|配方|客户|供应商|人员|员工|账号|账户|用户|部门|权限|调用分析|当前页|当前页面|选中|筛选|批次|型号|熔指|拉伸|弯曲|冲击|阻燃|灰分|dsc|tga|图谱库|图片库|几个|多少|数量|总数|最低|最少|最小|最高|最多|最大|详细|说明|展开|继续|具体|多说|讲讲|介绍|梳理|总结)/i.test(text);
  };

  const getProjectContext = () => {
    const activePageId = getActivePageId();
    const activePageTitle = constants.PAGE_DEFS?.[activePageId]?.title || activePageId || '未知页面';
    if (!projectPageCatalogCache) {
      projectPageCatalogCache = Object.entries(constants.PAGE_DEFS || {})
        .map(([pageId, def]) => `${def?.title || pageId}=${pageId}`)
        .join('；');
    }
    return [
      '【项目背景】',
      '你正在广俊塑料科技后台管理系统中工作。',
      '当用户说“这个项目”“这个网站”“本站”“这个系统”或“这个应用”时，均指广俊塑料科技后台管理系统本身，而不是外部互联网页面。',
      '当用户追问“详细说明一下”“展开说说”“继续”“具体点”等承接性问题时，必须沿用上一轮项目主题继续回答，不要重新要求用户提供背景。',
      `项目当前已注册页面：${projectPageCatalogCache}`,
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

  const shouldUseCorsForImageCompression = (url) => {
    try {
      const parsedUrl = new URL(url, window.location.href);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const loadImageForCompression = (url) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (shouldUseCorsForImageCompression(url)) {
      image.crossOrigin = 'anonymous';
    }
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('图片读取失败')), { once: true });
    image.src = url;
  });

  const canvasToDataUrl = (canvas, mimeType, quality) => new Promise<string>((resolve) => {
    if (canvas.toBlob) {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            try {
              resolve(canvas.toDataURL(mimeType, quality));
            } catch {
              resolve('');
            }
            return;
          }
          const reader = new FileReader();
          reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
          reader.addEventListener('error', () => {
            try {
              resolve(canvas.toDataURL(mimeType, quality));
            } catch {
              resolve('');
            }
          }, { once: true });
          reader.readAsDataURL(blob);
        }, mimeType, quality);
      } catch {
        resolve('');
      }
      return;
    }
    try {
      resolve(canvas.toDataURL(mimeType, quality));
    } catch {
      resolve('');
    }
  });

  const isCanvasReadable = (ctx) => {
    try {
      ctx.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  };

  const compressImageForAi = async (image, options = {} as any) => {
    const sourceUrl = String(image?.image_url?.url || image?.url || '').trim();
    if (!sourceUrl || !/^(?:data:image\/|blob:|https?:\/\/)/i.test(sourceUrl)) return image;

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
      if (!isCanvasReadable(ctx)) return image;

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

  const compressImagesForAi = async (images, options = {} as any) => {
    const parsedLimit = Number.parseInt(options.maxImages, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
    const normalizedImages = normalizeImages(images);
    const normalized = limit ? normalizedImages.slice(0, limit) : normalizedImages;
    const activePageId = getActivePageId();
    const preserveAlpha = activePageId === 'image-cutout' || /(?:透明|抠图|去背|png)/.test(String(options.prompt || ''));
    const maxSize = activePageId === 'image-cutout'
      ? 768
      : normalized.length > 4
        ? 640
        : 896;
    const concurrency = Math.min(3, Math.max(1, normalized.length));
    const compressed = new Array(normalized.length);
    let cursor = 0;
    const runWorker = async () => {
      while (cursor < normalized.length) {
        const index = cursor;
        cursor += 1;
        compressed[index] = await compressImageForAi(normalized[index], { maxSize, preserveAlpha });
      }
    };
    await Promise.all(Array.from({ length: concurrency }, runWorker));
    return compressed.filter(Boolean);
  };

  const findChatMessageLocation = ({ messageRef, pendingIndex, requestId } = {} as any) => {
    if (messageRef?.sessionId && messageRef?.messageId) {
      const session = state.chatSessions.find((item) => item.id === messageRef.sessionId);
      const index = session?.messages?.findIndex((item) => item.id === messageRef.messageId) ?? -1;
      if (session && index >= 0) return { session, index, message: session.messages[index] };
    }
    if (requestId) {
      for (const session of state.chatSessions) {
        const index = session.messages.findIndex((item) => item?.imageUploadAuth?.id === requestId);
        if (index >= 0) return { session, index, message: session.messages[index] };
      }
    }
    const parsedIndex = Number.parseInt(pendingIndex, 10);
    const session = getActiveSession();
    if (session && Number.isFinite(parsedIndex) && parsedIndex >= 0 && session.messages[parsedIndex]) {
      return { session, index: parsedIndex, message: session.messages[parsedIndex] };
    }
    return null;
  };

  const persistChatMessageLocation = (location) => {
    if (!location?.session) return;
    location.session.updatedAt = nowIso();
    if (location.session.id === state.chatSessionId) {
      state.chatHistory = location.session.messages;
      renderChatMessages({ autoScroll: true });
    }
    saveChatState();
  };

  const settleImageUploadAuthorization = (requestId, approved) => {
    const request = imageUploadAuthResolvers.get(requestId);
    if (!request) {
      const expiredLocation = findChatMessageLocation({ requestId });
      if (expiredLocation) {
        const { message } = expiredLocation;
        const baseContent = stripPendingStatus(String(message?.content || ''), message?.pendingStatus);
        expiredLocation.session.messages[expiredLocation.index] = {
          ...message,
          content: [
            baseContent,
            '【提示】这次上传授权请求已失效，请重新发送问题后再授权上传图谱图片。',
          ].filter(Boolean).join('\n\n'),
          pending: false,
          pendingStatus: '',
          imageUploadAuth: {
            ...message.imageUploadAuth,
            status: 'cancelled',
          },
        };
        persistChatMessageLocation(expiredLocation);
      }
      App.notify?.warn?.('上传授权已失效，请重新发送问题后再试。', { key: `image-upload-expired:${requestId}` });
      return;
    }
    imageUploadAuthResolvers.delete(requestId);
    request.cleanup?.();

    const location = findChatMessageLocation(request);
    const message = location?.message;
    if (message?.imageUploadAuth?.id === requestId) {
      message.imageUploadAuth = {
        ...message.imageUploadAuth,
        status: approved ? 'approved' : 'cancelled',
      };
      message.pending = approved;
      message.pendingStatus = approved ? '准备上传图片' : '';
      persistChatMessageLocation(location);
    }

    request.resolve(Boolean(approved));
  };

  const requestImageUploadAuthorization = (images, options = {} as any) => new Promise((resolve, reject) => {
    const normalizedImages = normalizeImages(images);
    const count = normalizedImages.length;
    if (!count) {
      resolve(true);
      return;
    }
    const autoImageUpload = App.config?.getFormConfig?.().autoImageUpload !== false;
    if (autoImageUpload) {
      resolve(true);
      return;
    }
    const pendingIndex = Number.parseInt(options.pendingIndex, 10);
    const messageRef = options.messageRef;
    const location = findChatMessageLocation({ messageRef, pendingIndex });
    if (!location) {
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
      messageRef,
    });

    const content = [
      options.displayPrefix || '',
      `${source}需要上传 ${count} 张图片给当前配置的 AI 服务。`,
      '请在下方确认要上传的图片清单；授权后我会继续让 AI 阅读图片并输出分析结果。',
    ].filter(Boolean).join('\n\n');

    location.session.messages[location.index] = {
      ...buildAssistantRenderMessage(content, {
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
      }),
      id: location.message.id,
      agentRunId: location.message.agentRunId,
    };
    persistChatMessageLocation(location);
  });

  const getContextMessages = (config, prompt, projectContextEnabled = isProjectAccessEnabled(), options = {} as any) => {
    const basePrompt = config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt;
    const attachedDataContext = projectContextEnabled && prompt ? getAttachedDataContext(prompt) : '';
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
      {
        role: 'system',
        content: [
          '【可靠性规则】',
          '区分已确认事实、合理推断和未知信息；不要把推断写成事实。',
          '不得编造项目数据、页面、技能、执行结果、外部来源、链接、版本、价格或日期。',
          '涉及本项目数据或操作时，只能依据本轮项目上下文与技能结果；没有证据时明确说明缺口。',
          '涉及实时或可能变化的外部事实时，必须依据联网搜索资料；搜索不可用时明确说明无法核实。',
          '遇到问题信息不足时，先指出缺少的关键条件，再给出最小必要的追问或安全下一步。',
        ].join('\n'),
      },
    ];
    const skillProtocolContext = projectContextEnabled ? (App.projectSkills?.getAiProtocolContext?.({ plan: options.agentPlan }) || '') : '';

    if (projectContextEnabled) {
      messages.push({
        role: 'system',
        content: [
          getProjectContext(),
          '你负责理解用户意图并决定是否调用项目技能。不要依赖前端本地规则替你判断；当用户要求修改、整理、删除、跳转、查询项目数据或执行页面操作时，优先输出项目技能调用 JSON。只有在不需要执行技能时，才直接自然语言回答。',
          '用户要求分析、查询、对比、总结当前项目数据、当前页数据或选中数据时，不要直接强答，必须先输出项目技能调用 JSON。',
          '用户在同一句里同时提到物性和图谱，或要求“结合/联合/综合”物性与图谱分析时，必须优先调用 analysis.buildJointPackage，不要只调用 property.searchRows 或 spectrum.manageImages。',
          '用户明确询问物性数据时必须调用 property.*，禁止调用 business.queryPageData：查分类/工作表/明细用 property.searchRows，统计用 property.summarizeMetrics，对比用 property.compareRows，合格/超标/检测范围判定用 property.validateRanges。物性分类由工作表页签表达，不要因数据行没有“分类”字段而声称无法读取分类。',
          '用户明确提到图谱、谱图、图片、DSC/TGA 曲线或图谱库时，优先调用图谱相关技能 spectrum.manageImages，并用 action 参数区分查询、新增、更新、删除等动作；不要因为问题里有型号就改调用物性表。',
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

  const toApiMessage = (message, options = {} as any) => {
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

  const recordAiCall = (entry = {} as any) => {
    try {
      const recorded = App.aiCallAnalysis?.record?.(entry);
      if (recorded) return recorded;
      return recordAiCallFallback(entry);
    } catch (error) {
      console.warn('[chat] Failed to record AI call analysis:', error);
      return recordAiCallFallback(entry, { compact: true });
    }
  };

  const truncateAiCallLogText = (value, max = 1200) => {
    const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };

  const recordAiCallFallback = (entry = {} as any, options = {} as any) => {
    try {
      const key = constants.AI_CALL_LOG_KEY;
      const current = utils.readJson(key, []);
      const logs = Array.isArray(current) ? current : [];
      const now = nowIso();
      const model = String(entry.model || entry.tokenUsage?.model || App.config?.getResolvedModel?.() || '').trim();
      const log = {
        id: String(entry.id || `ai-call-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        at: entry.at || entry.endedAt || now,
        startedAt: entry.startedAt || entry.at || now,
        endedAt: entry.endedAt || now,
        durationMs: Number(entry.durationMs || 0),
        provider: String(entry.provider || App.config?.getFormConfig?.()?.aiProvider || '').trim(),
        model: model || '未选择模型',
        endpoint: truncateAiCallLogText(entry.endpoint, 500),
        source: String(entry.source || 'chat'),
        pageId: String(entry.pageId || getActivePageId?.() || ''),
        sessionId: String(entry.sessionId || state.chatSessionId || ''),
        status: entry.status === 'failed' ? 'failed' : 'success',
        statusText: String(entry.statusText || ''),
        error: truncateAiCallLogText(entry.error, 800),
        prompt: truncateAiCallLogText(entry.prompt, options.compact ? 800 : 1600),
        responsePreview: truncateAiCallLogText(entry.responsePreview || entry.completionText, options.compact ? 1000 : 2400),
        requestMeta: entry.requestMeta && typeof entry.requestMeta === 'object' ? {
          messages: Number(entry.requestMeta.messages || 0),
          images: Number(entry.requestMeta.images || 0),
          files: Number(entry.requestMeta.files || 0),
          attachedData: Boolean(entry.requestMeta.attachedData),
          stream: Boolean(entry.requestMeta.stream),
        } : {},
        tokenUsage: entry.tokenUsage || App.aiCallAnalysis?.buildUsageMeta?.({
          apiUsage: entry.apiUsage,
          requestMessages: entry.requestMessages,
          completionText: entry.completionText || entry.responsePreview,
          model,
        }) || null,
      };
      utils.writeJson(key, [log, ...logs.filter((item) => item?.id !== log.id)].slice(0, 500));
      App.aiCallAnalysis?.render?.();
      return log;
    } catch (fallbackError) {
      console.warn('[chat] Failed to write fallback AI call log:', fallbackError);
      return null;
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
    if (skillId === 'spectrum.manageImages' && result.data?.action === 'search') {
      return Boolean(result.data?.context || getSkillResultImages(execution).length);
    }
    if (result.candidates?.length) return false;
    return Boolean(result.data?.context)
      || skillId === 'analysis.buildJointPackage'
      || skillId.startsWith('property.');
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
      '只回答用户实际询问的内容，不要把技能返回的全部字段、页面数量、数据源或内部执行过程一并罗列。',
      '表达应自然并随问题变化，不要使用固定的“执行状态/执行详情/页面 ID”模板。',
      '不要再输出旧版文本工具调用 JSON。',
      '不要只复述“技能已执行”。',
      '必须基于技能返回的数据上下文分析；数据不足时说明缺口。',
      '所有数量、名称、状态、时间和操作结果都必须能在技能返回内容中逐项找到依据；禁止补写、推测或把常识当成项目事实。',
      '技能状态为未完成时，禁止使用“成功、完成、已删除、已修改、已创建”等成功措辞。',
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
          '前端已经完成数据检索或项目操作；你必须直接分析这些数据并给出结论，不要输出旧版文本工具调用 JSON。',
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
    const selectVerifiedContent = (answer = '') => {
      const selected = selectGroundedAnswer({
        answer,
        evidence: [execution?.result || {}],
        fallback: App.projectSkills?.formatSkillMessage?.(execution) || execution?.result?.message || '',
        requiresEvidence: true,
      });
      return [displayPrefix, selected.content].filter(Boolean).join('\n\n');
    };

    try {
      const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
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
      }, AI_FETCH_TIMEOUT_MS);

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
        const verifiedContent = selectVerifiedContent(content);
        if (Number.isInteger(pendingIndex) && pendingIndex >= 0) flushStreamRender(pendingIndex, verifiedContent);

        return {
          content: verifiedContent,
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
        content: selectVerifiedContent(content),
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

  const getAgentRoleModel = (config, role, fallbackModel) => {
    const model = String(config?.agentModels?.[role] || '').trim();
    return model || fallbackModel;
  };

  const cleanCompositeUserFacingText = (content = '') => String(content || '')
    .replace(/作为主\s*Agent[，,、\s]*/g, '')
    .replace(/主\s*Agent/g, '汇总分析')
    .replace(/子\s*Agent/g, '专项分析')
    .replace(/数据分析\s*Agent/g, '物性分析')
    .replace(/图谱分析\s*Agent/g, '图谱分析')
    .trim();

  const parseJsonLikeAssistantContent = (content = '') => {
    const text = String(content || '').trim();
    if (!text || !/^\s*(?:```json\s*)?\{/.test(text)) return null;
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(jsonText);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const formatInternalJsonAnswer = (content = '') => {
    const payload = parseJsonLikeAssistantContent(content);
    if (!payload || !('context' in payload || 'data' in payload)) return content;

    const lines = [];
    const context = String(payload.context || payload.message || '').trim();
    if (context) lines.push(context);

    if (Array.isArray(payload.data) && payload.data.length) {
      if (lines.length) lines.push('');
      payload.data.slice(0, 20).forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          lines.push(`${index + 1}. ${String(item)}`);
          return;
        }
        const name = item.姓名 || item.name || item.title || item.名称 || item.编号 || item.id || `记录 ${index + 1}`;
        const code = item.编号 || item.code || item.id || '';
        const details = Object.entries(item)
          .filter(([key, value]) => value != null && value !== '' && !['姓名', 'name', 'title', '名称', '编号', 'code', 'id'].includes(key))
          .map(([key, value]) => `${key}：${value}`)
          .join('，');
        const heading = code && String(code) !== String(name) ? `${name}（${code}）` : String(name);
        lines.push(`${index + 1}. ${heading}${details ? ` - ${details}` : ''}`);
      });
    }

    return lines.join('\n').trim() || content;
  };

  const synthesizeCompositeAgentResults = async ({
    config,
    model,
    prompt,
    propertyContent,
    spectrumContent,
    signal = null,
  }) => {
    const messages = [
      { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
      {
        role: 'system',
        content: [
          getProjectContext(),
          '你负责把物性数据分析和图谱分析整理成一份面向用户的统一结论。',
          '物性部分已经整理了表格和指标，图谱部分已经整理了曲线图片和图谱上下文。',
          '你的任务是综合两边结论，指出一致性、冲突点、缺口和最终判断；不要重复输出项目技能调用 JSON。',
          '最终回答只能出现和用户问题有关的信息，不要提及“主 Agent”“子 Agent”“数据分析 Agent”“图谱分析 Agent”等内部流程或角色名称。',
        ].join('\n\n'),
      },
      {
        role: 'user',
        content: [
          '【用户原始问题】',
          prompt,
          '',
          '【物性分析结果】',
          propertyContent || '物性分析未返回可用结果。',
          '',
          '【图谱分析结果】',
          spectrumContent || '图谱分析未返回可用结果。',
          '',
          '请结合物性数据和图谱结论给出统一分析，重点说明：1. 综合结论；2. 关键依据；3. 物性和图谱之间是否互相印证；4. 风险或数据缺口；5. 后续建议。',
        ].join('\n'),
      },
    ];
    const streamEnabled = config.aiProvider === 'lmstudio' || Boolean(config.streamEnabled);
    const requestTimer = createAbortTimer('综合汇总分析', SKILL_SYNTHESIS_TIMEOUT_MS, signal);

    try {
      const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        signal: requestTimer.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature,
          max_tokens: Math.max(Number(config.maxTokens) || 0, constants.DEFAULT_CONFIG.maxTokens || 4096),
          stream: streamEnabled,
        }),
      }, AI_FETCH_TIMEOUT_MS);

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
        }, { signal: requestTimer.signal });
        if (!streamResult.receivedDelta) {
          throw new Error('综合汇总没有返回流式内容。');
        }
        return {
          content,
          usage: streamResult.usage || null,
          finishReason: streamResult.finishReason || '',
          messages,
          usedStream: true,
        };
      }
      const data = await response.json();
      return {
        content: data?.choices?.[0]?.message?.content?.trim() || '',
        usage: data?.usage || null,
        finishReason: String(data?.choices?.[0]?.finish_reason || ''),
        messages,
        usedStream: false,
      };
    } catch (error) {
      throw new Error(requestTimer.formatError(error));
    } finally {
      requestTimer.clear();
    }
  };

  const runCompositeAgentAnalysis = async ({ config, mainModel, prompt, pendingIndex, signal = null }) => {
    flushStreamRender(pendingIndex, '正在分别调用物性和图谱技能...', { pending: true, pendingStatus: '正在获取项目数据' });
    const [propertyExecution, spectrumExecution] = await Promise.all([
      App.projectSkills.executeSkill('property.searchRows', { query: prompt }, {
        source: 'chat-composite-agent',
        prompt,
        reason: '联合分析中的物性数据子任务',
      }),
      App.projectSkills.executeSkill('spectrum.manageImages', { action: 'search', query: prompt }, {
        source: 'chat-composite-agent',
        prompt,
        reason: '联合分析中的图谱数据子任务',
      }),
    ]);

    const dataModel = getAgentRoleModel(config, 'data', mainModel);
    const spectrumModel = getAgentRoleModel(config, 'spectrum', mainModel);
    let propertyContent = App.projectSkills.formatSkillMessage(propertyExecution);
    let spectrumContent = App.projectSkills.formatSkillMessage(spectrumExecution);
    let usage = null;
    let messages = [];
    let finishReason = '';
    let usedStream = false;

    if (shouldSynthesizeSkillResult(propertyExecution)) {
      flushStreamRender(pendingIndex, `物性分析（${dataModel}）正在整理数据...`, { pending: true, pendingStatus: '物性分析中' });
      try {
        const synthesized = await synthesizeSkillResult({
          config,
          model: dataModel,
          prompt,
          execution: propertyExecution,
          pendingIndex,
          displayPrefix: getSkillDisplayPrefix(propertyExecution),
          signal,
          images: [],
        });
        propertyContent = synthesized.content || propertyContent;
        usage = synthesized.usage || usage;
        messages = synthesized.messages || messages;
        finishReason = synthesized.finishReason || finishReason;
        usedStream = usedStream || Boolean(synthesized.usedStream);
      } catch (error) {
        propertyContent = `${propertyContent}\n\n【提示】物性分析失败：${error?.message || '未知错误'}`;
      }
    }

    const rawSpectrumImages = getSkillResultImages(spectrumExecution);
    if (shouldSynthesizeSkillResult(spectrumExecution)) {
      flushStreamRender(pendingIndex, `图谱分析（${spectrumModel}）正在分析图谱...`, { pending: true, pendingStatus: '图谱分析中' });
      try {
        let skillImages = [];
        if (rawSpectrumImages.length) {
          const approved = await requestImageUploadAuthorization(rawSpectrumImages, {
            pendingIndex,
            displayPrefix: spectrumContent,
            source: '图谱检索结果',
            signal,
          });
          if (!approved) {
            spectrumContent = `${spectrumContent}\n\n【提示】已取消上传 ${rawSpectrumImages.length} 张图谱图片，本次图谱分析仅使用图谱元数据。`;
          } else {
            skillImages = await compressImagesForAi(rawSpectrumImages, { prompt });
          }
        }
        const synthesized = await synthesizeSkillResult({
          config,
          model: spectrumModel,
          prompt,
          execution: spectrumExecution,
          pendingIndex,
          displayPrefix: '',
          signal,
          images: skillImages,
        });
        spectrumContent = synthesized.content || spectrumContent;
        usage = synthesized.usage || usage;
        messages = synthesized.messages || messages;
        finishReason = synthesized.finishReason || finishReason;
        usedStream = usedStream || Boolean(synthesized.usedStream);
      } catch (error) {
        spectrumContent = `${spectrumContent}\n\n【提示】图谱分析失败：${error?.message || '未知错误'}`;
      }
    }

    flushStreamRender(pendingIndex, `综合汇总（${mainModel}）正在合并物性和图谱结论...`, { pending: true, pendingStatus: '综合汇总中' });
    let finalResult = null;
    try {
      finalResult = await synthesizeCompositeAgentResults({
        config,
        model: mainModel,
        prompt,
        propertyContent,
        spectrumContent,
        signal,
      });
      finalResult.content = cleanCompositeUserFacingText(finalResult.content);
    } catch (error) {
      finalResult = {
        content: [
          '联合分析汇总失败，以下保留两个专项分析结果。',
          '',
          `【提示】${error?.message || '未知错误'}`,
          '',
          '## 物性分析',
          propertyContent,
          '',
          '## 图谱分析',
          spectrumContent,
        ].join('\n'),
      };
    }
    return {
      content: finalResult.content || [propertyContent, spectrumContent].filter(Boolean).join('\n\n'),
      usage: finalResult.usage || usage,
      finishReason: finalResult.finishReason || finishReason,
      messages: finalResult.messages || messages,
      usedStream: usedStream || Boolean(finalResult.usedStream),
    };
  };

  const runLocalSkillPlan = async (prompt, plan, options = {} as any) => {
    const pendingIndex = Number.parseInt(options.pendingIndex, 10);
    const hasPendingMessage = Number.isFinite(pendingIndex) && pendingIndex >= 0;
    setChatBusyState(true);

    if (!hasPendingMessage) {
      pushChatMessage('user', prompt);
      if (refs.chatInput) refs.chatInput.value = '';
      pushChatMessage('assistant', '正在读取项目数据...');
    }
    const targetIndex = hasPendingMessage ? pendingIndex : state.chatHistory.length - 1;
    flushStreamRender(targetIndex, '正在读取项目数据...', { pending: true, pendingStatus: '正在读取项目数据' });

    try {
      const steps = Array.isArray(plan.steps) && plan.steps.length
        ? plan.steps
        : [plan];
      const executions = [];
      for (const step of steps) {
        const execution = await App.projectSkills.executeSkill(step.skillId, step.input || {}, {
          source: 'chat-natural-language',
          prompt,
          reason: step.reason || plan.reason || '',
        });
        executions.push(execution);
        if (execution?.result?.ok === false) break;
      }
      const execution = executions[executions.length - 1];
      const content = executions.length > 1
        ? executions.map((item, index) => `步骤 ${index + 1}/${executions.length}\n${App.projectSkills.formatSkillMessage(item)}`).join('\n\n')
        : App.projectSkills.formatSkillMessage(execution);
      state.chatHistory[targetIndex] = {
        role: 'assistant',
        content,
        images: [],
        actions: normalizeSkillActions(App.projectSkills.getResultActions?.(execution) || []),
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
    } catch (error) {
      state.chatHistory[targetIndex] = {
        role: 'assistant',
        content: `项目技能执行失败：${error?.message || '未知错误'}`,
        images: [],
        pending: false,
      };
      const session = getActiveSession();
      if (session) session.updatedAt = nowIso();
      saveChatState();
      renderChat();
    } finally {
      setChatBusyState(false);
      if (refs.chatInput) {
        refs.chatInput.focus();
      }
    }
  };

  const shouldRunLocalPlanDirectly = (plan, prompt = '') => {
    return canRunLocalSkillDirectly(plan, prompt, App.projectSkills?.getSkillRegistry?.() || []);
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

  const consumeChatCompletionStream = async (response, onDelta, options = {} as any) => {
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

  const buildAssistantRenderMessage = (content, options = {} as any) => ({
    role: 'assistant',
    content: content || '正在思考...',
    images: [],
    pending: Boolean(options.pending),
    pendingStatus: options.pendingStatus || '',
    imageUploadAuth: normalizeImageUploadAuth(options.imageUploadAuth),
    searchSources: normalizeMessageSearchSources(options.searchSources),
  });

  const streamRenderScheduler = createStreamRenderScheduler(({ pendingIndex, content, options }) => {
    state.chatHistory[pendingIndex] = buildAssistantRenderMessage(content, options);
    const session = getActiveSession();
    if (session) session.updatedAt = nowIso();
    renderChatMessages({ autoScroll: true });
  });

  const cancelScheduledStreamRender = () => streamRenderScheduler.cancel();

  const scheduleStreamRender = (pendingIndex, content, options = {} as any) => {
    streamRenderScheduler.schedule({ pendingIndex, content, options });
  };

  const flushStreamRender = (pendingIndex, content, options = {} as any) => {
    cancelScheduledStreamRender();
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
      id: makeMessageId(),
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

  const runtimeMessageStore = createChatRuntimeMessageStore({
    getSessions: () => state.chatSessions,
    getActiveSessionId: () => state.chatSessionId,
    createMessageId: makeMessageId,
    onChange(sessionId) {
      const session = state.chatSessions.find((item) => item.id === sessionId);
      if (!session) return;
      session.updatedAt = nowIso();
      if (session.id === state.chatSessionId) {
        state.chatHistory = session.messages;
        renderChatMessages({ autoScroll: true });
      }
      saveChatState();
    },
  });

  const addRuntimeAssistantMessage = (message: ChatRuntimeMessage, requestedRef) => {
    return runtimeMessageStore.addAssistantMessage({
      ...message,
      role: 'assistant',
      images: normalizeImages(message.images),
      actions: normalizeSkillActions(message.actions),
      searchSources: normalizeMessageSearchSources(message.searchSources),
    }, requestedRef);
  };

  const updateRuntimeAssistantMessage = (messageRef, message: ChatRuntimeMessage) => {
    runtimeMessageStore.updateAssistantMessage(messageRef, {
      ...message,
      role: 'assistant',
      images: normalizeImages(message.images),
      actions: normalizeSkillActions(message.actions),
      searchSources: normalizeMessageSearchSources(message.searchSources),
    });
  };

  const getRuntimeRunConfig = () => {
    const config = App.config?.getFormConfig?.();
    if (!config) throw new Error('AI 配置尚未初始化。');
    if (config.aiProvider !== 'lmstudio' && !String(config.apiKey || '').trim()) {
      throw new Error('请先在配置中心填入模型 API 密钥，或切换到 LM Studio 本地模型。');
    }
    const model = String(App.config?.getResolvedModel?.() || '').trim();
    if (!model) throw new Error('请先选择一个模型。');
    const projectAccessEnabled = isProjectAccessEnabled();
    runtimeRequestContext = {
      config,
      model,
      projectAccessEnabled,
      attachedImages: [],
      attachedDataFile: null,
      attachedDataContext: '',
    };
    return {
      projectAccessEnabled,
      webSearchEnabled,
    };
  };

  const prepareRuntimeAttachments = async ({ prompt, signal, messageRef }) => {
    const context = runtimeRequestContext;
    if (!context) throw new Error('本次运行配置未就绪。');
    const selectedModelOption = Array.from(refs.modelSelect?.options || [])
      .find((option) => option.value === context.model);
    const inputModalities = JSON.parse(selectedModelOption?.dataset?.inputModalities || '[]');
    const modelCategory = String(selectedModelOption?.dataset?.category || '');
    const supportsImageInput = (
      Array.isArray(inputModalities)
      && inputModalities.includes('image')
    ) || modelCategory.includes('图像')
      || /(?:vision|visual|image|vl|multimodal)/i.test(context.model);
    const rawImages = supportsImageInput
      ? [
          ...pendingDraftImages,
          ...(context.projectAccessEnabled ? getAttachedDataImages(prompt) : []),
        ].slice(0, 8)
      : [];
    pendingDraftImages = [];
    context.attachedDataFile = context.projectAccessEnabled ? getAttachedDataFile(prompt) : null;
    context.attachedDataContext = context.projectAccessEnabled ? getAttachedDataContext(prompt) : '';

    if (!rawImages.length) {
      return {
        attachments: { images: [] },
      };
    }
    const approved = await requestImageUploadAuthorization(rawImages, {
      messageRef,
      source: '本次消息',
      signal,
    });
    if (!approved) {
      return {
        terminalMessage: `已取消上传 ${rawImages.length} 张图片，本次未向 AI 发送图片。`,
      };
    }
    context.attachedImages = await compressImagesForAi(rawImages, { prompt });
    const session = messageRef && typeof messageRef === 'object'
      ? state.chatSessions.find((item) => item.id === messageRef.sessionId)
      : getActiveSession();
    const assistantIndex = session?.messages?.findIndex(
      (item) => item.id === messageRef?.messageId,
    ) ?? -1;
    let userMessage = null;
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (session.messages[index]?.role === 'user') {
        userMessage = session.messages[index];
        break;
      }
    }
    if (userMessage?.role === 'user') {
      userMessage.images = context.attachedImages;
      saveChatState();
      if (session?.id === state.chatSessionId) {
        renderChatMessages({ autoScroll: true });
      }
    }
    return {
      attachments: { images: context.attachedImages },
    };
  };

  const requestRuntimeCompletion = async (request) => {
    const context = runtimeRequestContext;
    if (!context) throw new Error('本次运行配置未就绪。');
    const { config, model } = context;
    const requestImages = normalizeImages(request.images || context.attachedImages);
    let messages = [];

    if (request.purpose === 'grounded_response') {
      messages = [
        { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
        ...request.messages.map((item, index, items) => {
          const isLastUserMessage = item.role === 'user'
            && !items.slice(index + 1).some((candidate) => candidate.role === 'user');
          return toApiMessage(item, {
            images: isLastUserMessage ? requestImages : [],
          });
        }),
      ];
    } else {
      const originatingHistory = Array.isArray(request.history)
        ? request.history
        : state.chatHistory;
      const history = selectRecentHistory(
        originatingHistory.filter((item) => (
          (item.role === 'user' || item.role === 'assistant')
          && !item.pending
        )),
      );
      messages = [
        ...getContextMessages(config, '', false),
        ...history.map((item, index, items) => {
          const isCurrentUserMessage = index === items.length - 1 && item.role === 'user';
          const datedPrompt = isCurrentUserMessage
            ? buildPromptWithCurrentDate(item.content)
            : item.content;
          const content = isCurrentUserMessage
            ? (
                context.attachedDataFile
                  ? buildUserPromptWithFile(datedPrompt, context.attachedDataFile)
                  : buildUserPromptWithData(datedPrompt, context.attachedDataContext)
              )
            : item.content;
          return toApiMessage(item, {
            content,
            files: isCurrentUserMessage && context.attachedDataFile
              ? [context.attachedDataFile]
              : [],
            images: isCurrentUserMessage ? requestImages : item.images,
          });
        }),
      ];
    }

    const startedAt = nowIso();
    const startedMs = window.performance?.now?.() ?? Date.now();
    const streamEnabled = config.aiProvider === 'lmstudio' || Boolean(config.streamEnabled);
    const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: App.config.getRequestHeaders(config),
      signal: request.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: config.temperature,
        max_tokens: Math.max(
          Number(config.maxTokens) || 0,
          constants.DEFAULT_CONFIG.maxTokens || 4096,
        ),
        stream: streamEnabled,
      }),
    }, AI_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${errorText ? `：${errorText.slice(0, 300)}` : ''}`);
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    const useStream = Boolean(
      streamEnabled
      && response.body
      && (config.aiProvider === 'lmstudio' || contentType.includes('text/event-stream')),
    );
    let payload = null;
    let content = '';
    let apiUsage = null;
    if (useStream) {
      let accumulated = '';
      const streamResult = await consumeChatCompletionStream(
        response,
        (delta) => {
          accumulated += delta;
          request.onToken?.(accumulated);
        },
        { signal: request.signal },
      );
      if (!streamResult.receivedDelta) throw new Error('流式响应未返回有效内容。');
      content = accumulated.trim();
      apiUsage = streamResult.usage;
    } else {
      payload = await response.json();
      content = String(payload?.choices?.[0]?.message?.content || '').trim();
      apiUsage = payload?.usage || null;
      if (content) request.onToken?.(content);
    }
    recordAiCall({
      source: request.purpose === 'grounded_response' ? 'chat-runtime-grounded' : 'chat-runtime',
      provider: config.aiProvider,
      model,
      endpoint: `${config.baseUrl}/chat/completions`,
      pageId: getActivePageId(),
      sessionId: String(request.sessionId || state.chatSessionId || ''),
      startedAt,
      endedAt: nowIso(),
      durationMs: (window.performance?.now?.() ?? Date.now()) - startedMs,
      status: 'success',
      prompt: request.question,
      responsePreview: content,
      apiUsage,
      requestMessages: messages,
      completionText: content,
      requestMeta: {
        messages: messages.length,
        images: requestImages.length,
        files: context.attachedDataFile ? 1 : 0,
        attachedData: Boolean(context.attachedDataContext || context.attachedDataFile),
        stream: useStream,
      },
    });
    return { content };
  };

  const requestRuntimePlan = async (messages, signal) => {
    const context = runtimeRequestContext;
    if (!context) throw new Error('本次运行配置未就绪。');
    const response = await fetchWithTimeout(`${context.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: App.config.getRequestHeaders(context.config),
      signal,
      body: JSON.stringify({
        model: context.model,
        messages,
        temperature: 0,
        max_tokens: Math.min(
          Math.max(Number(context.config.maxTokens) || 0, 1200),
          2400,
        ),
        stream: false,
      }),
    }, AI_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${errorText ? `：${errorText.slice(0, 300)}` : ''}`);
    }
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content || '';
  };

  const classifyRuntimeIntent = async ({ prompt, activePageId, signal }) => {
    const context = runtimeRequestContext;
    if (!context) throw new Error('本次运行配置未就绪。');
    return createRouteClassifier(context.config, context.model, { signal })({
      prompt,
      activePageId,
    });
  };

  const initializeChatRuntime = () => {
    const registry = createProjectToolRegistry(App, createProjectToolAdapters(App));
    const store = createLocalStorageAgentRunStore();
    const executionEngine = createAgentExecutionEngine({ registry, store });
    const gateway = createIntentGateway({ classifier: classifyRuntimeIntent });
    const planner = createAgentPlanner({
      registry,
      requestPlan: requestRuntimePlan,
    });
    const runtime = createAgentRuntime({
      gateway,
      planner,
      registry,
      executionEngine,
      store,
      chatModel: requestRuntimeCompletion,
    });
    App.agentToolRegistry = registry;
    App.agentRuntime = runtime;
    chatRuntimeController = createChatRuntimeController({
      runtime,
      getActivePageId,
      getRunConfig: getRuntimeRunConfig,
      getSessionContext: runtimeMessageStore.getSessionContext,
      findAssistantMessageByRunId: runtimeMessageStore.findAssistantMessageByRunId,
      createMessageId: makeMessageId,
      prepareAttachments: prepareRuntimeAttachments,
      addAssistantMessage: addRuntimeAssistantMessage,
      updateAssistantMessage: updateRuntimeAssistantMessage,
      setBusy: setChatBusyState,
      focusInput: () => refs.chatInput?.focus(),
    });
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
    const anchor = [refs.assistantExpandBtn, refs.assistantCloseBtn].find((node) => node?.parentNode === headActions) || null;
    headActions.insertBefore(refs.clearChatBtn, anchor);
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
    void chatRuntimeController?.cancel?.().catch((error) => {
      console.warn('[chat] Failed to cancel Agent runtime:', error);
    });
  };

  const getRecentBusinessTopic = () => {
    const recentText = state.chatHistory
      .slice(-6)
      .map((item) => String(item?.content || ''))
      .join('\n');
    if (/配方/.test(recentText)) return '配方';
    if (/账号|账户|用户|登录/.test(recentText)) return '账号';
    if (/人员|员工/.test(recentText)) return '人员';
    if (/订单/.test(recentText)) return '订单';
    if (/供应商/.test(recentText)) return '供应商';
    if (/客户/.test(recentText)) return '客户';
    if (/库存|物料|材料|商品|产品|成品/.test(recentText)) return '库存物料';
    return '';
  };

  const buildDeterministicProjectQuestion = (prompt) => {
    const text = String(prompt || '').trim();
    if (!/^(哪|哪几|哪四|哪几个|列举|列出|展示|罗列|具体|详细|明细|列表|都有|分别|展开|说一下|说明一下)/.test(text)) return text;
    if (/配方|账号|账户|用户|人员|员工|订单|供应商|客户|库存|物料|材料|商品|产品|成品/.test(text)) return text;
    const topic = getRecentBusinessTopic();
    return topic ? `${text} ${topic}` : text;
  };

  const sendChatMessage = async () => {
    if (state.chatBusy) {
      stopCurrentChatAnalysis();
      return;
    }
    if (chatSubmissionLocked) return;
    const prompt = String(refs.chatInput?.value || '').trim();
    if (!prompt) return;

    chatSubmissionLocked = true;
    try {
      if (!chatRuntimeController) initializeChatRuntime();
      pushChatMessage('user', prompt);
      if (refs.chatInput) refs.chatInput.value = '';
      await chatRuntimeController.submit({ prompt });
    } finally {
      chatSubmissionLocked = false;
    }
  };

  const handleAgentRuntimeActionClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !chatRuntimeController) return false;
    const confirmButton = target.closest('[data-chat-agent-confirm]');
    if (confirmButton) {
      event.preventDefault();
      event.stopPropagation();
      const confirmationId = String(confirmButton.getAttribute('data-chat-agent-confirm') || '');
      const runId = String(confirmButton.getAttribute('data-chat-agent-run') || '');
      if (runId && confirmationId) {
        void chatRuntimeController.confirm({ runId, confirmationId });
      }
      return true;
    }
    const cancelButton = target.closest('[data-chat-agent-cancel]');
    if (cancelButton) {
      event.preventDefault();
      event.stopPropagation();
      const runId = String(cancelButton.getAttribute('data-chat-agent-cancel') || '');
      if (runId) void chatRuntimeController.cancel(runId);
      return true;
    }
    return false;
  };

  const handleImageUploadAuthClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return false;
    const imageAuthButton = target.closest('[data-chat-image-auth]');
    if (!imageAuthButton) return false;
    event.preventDefault();
    event.stopPropagation();
    if (imageAuthButton.hasAttribute('disabled')) return true;
    const [requestId, decision] = String(imageAuthButton.getAttribute('data-chat-image-auth') || '').split(':');
    if (requestId) settleImageUploadAuthorization(requestId, decision === 'approve');
    return true;
  };

  const bindChat = () => {
    if (chatEventsBound) return;
    chatEventsBound = true;
    chatEventController = new AbortController();
    const eventSignal = chatEventController.signal;
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

    refs.assistantNewBtn?.addEventListener('click', createNewConversation, { signal: eventSignal });
    refs.assistantFullscreenNewBtn?.addEventListener('click', createNewConversation, { signal: eventSignal });

    refs.assistantFullscreenSearch?.addEventListener('input', () => {
      state.conversationMenuQuery = refs.assistantFullscreenSearch?.value || '';
      renderConversationMenu();
      renderFullscreenSidebar();
    });

    refs.chatSendBtn?.addEventListener('click', sendChatMessage, { signal: eventSignal });
    refs.chatInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });

    document.addEventListener('click', handleImageUploadAuthClick, { capture: true, signal: eventSignal });

    refs.chatMessages?.addEventListener('click', (event) => {
      if (handleAgentRuntimeActionClick(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

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
    if (loaded.needsMigration) saveChatState();
    if (!chatRuntimeController) initializeChatRuntime();
    bindChat();
    renderChat();
    renderDataAttachmentState();
    renderWebSearchState();
    renderChatSubmitState();
    updateHeaderState();
  };

  const cleanup = () => {
    chatSessionStore.flush();
    chatEventController?.abort();
    chatEventController = null;
    chatEventsBound = false;
    cancelScheduledStreamRender();
    void chatRuntimeController?.cancel?.();
    chatRuntimeController = null;
    App.agentRuntime = undefined;
    App.agentToolRegistry = undefined;
    runtimeRequestContext = null;
    closeConversationMenu();
    closeChatImagePreview();
    Array.from(imageUploadAuthResolvers.values()).forEach((resolver) => {
      resolver.cleanup?.();
      resolver.reject?.(createAbortError());
    });
    imageUploadAuthResolvers.clear();
  };

  App.chat = {
    init,
    renderChat,
    sendChatMessage,
    renderFullscreenSidebar,
    draftPrompt,
    cleanup,
  };
})();
