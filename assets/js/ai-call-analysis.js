(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;
  const MAX_LOGS = 500;
  let bound = false;
  let activePeriodKey = 'week';

  const nowIso = () => new Date().toISOString();
  const esc = (value) => utils.escapeHtml(value);
  const readLogs = () => {
    const logs = utils.readJson(constants.AI_CALL_LOG_KEY, []);
    return Array.isArray(logs) ? logs : [];
  };
  const writeLogs = (logs) => utils.writeJson(constants.AI_CALL_LOG_KEY, logs.slice(0, MAX_LOGS));
  const truncate = (value, max = 220) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const formatNumber = (value) => new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  const formatDateTime = (value) => {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
  };
  const formatDuration = (value) => {
    const ms = Number(value || 0);
    if (!Number.isFinite(ms) || ms <= 0) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  };
  const formatUsdCost = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '$0.000000';
    if (amount === 0) return '$0';
    if (amount < 0.000001) return '<$0.000001';
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
    if (!normalized) return '暂无价格';
    return `${formatCnyCost(normalized.totalCny)} / ${formatUsdCost(normalized.totalUsd)}`;
  };
  const parseUsdPricing = (value) => {
    if (value == null || value === '') return null;
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  };
  const getModelPricing = (model = '') => {
    const options = Array.from(refs.modelSelect?.options || []);
    const option = options.find((item) => item.value === model)
      || options.find((item) => item.value === App.config?.getResolvedModel?.());
    const raw = option?.dataset?.pricing || '';
    if (!raw) return null;
    try {
      const pricing = JSON.parse(raw);
      return pricing && typeof pricing === 'object' ? pricing : null;
    } catch {
      return null;
    }
  };
  const normalizeCostUsage = (cost) => {
    if (!cost || typeof cost !== 'object') return null;
    const promptUsd = Number(cost.promptUsd || 0);
    const completionUsd = Number(cost.completionUsd || 0);
    const totalUsd = Number(cost.totalUsd ?? cost.usd ?? (promptUsd + completionUsd));
    const totalCny = Number(cost.totalCny ?? cost.cny ?? 0);
    const hasCost = [promptUsd, completionUsd, totalUsd, totalCny].some((item) => Number.isFinite(item) && item > 0)
      || cost.totalUsd === 0
      || cost.usd === 0;
    if (!hasCost) return null;
    return {
      promptUsd,
      completionUsd,
      totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0,
      totalCny: Number.isFinite(totalCny) ? totalCny : 0,
      usdToCny: Number(cost.usdToCny || 0),
      promptPricePerToken: Number(cost.promptPricePerToken || 0),
      completionPricePerToken: Number(cost.completionPricePerToken || 0),
      estimated: cost.estimated !== false,
    };
  };
  const buildCostMeta = ({ promptTokens = 0, completionTokens = 0, model = '', cost = null } = {}) => {
    const normalized = normalizeCostUsage(cost);
    if (normalized) return normalized;

    const pricing = getModelPricing(model);
    const promptPrice = parseUsdPricing(pricing?.prompt);
    const completionPrice = parseUsdPricing(pricing?.completion);
    if (promptPrice == null || completionPrice == null) return null;

    const promptUsd = Number(promptTokens || 0) * promptPrice;
    const completionUsd = Number(completionTokens || 0) * completionPrice;
    const totalUsd = promptUsd + completionUsd;
    const usdToCny = Number(App.config?.getUsdToCnyRate?.() || 0);
    return {
      promptUsd,
      completionUsd,
      totalUsd,
      totalCny: Number.isFinite(usdToCny) && usdToCny > 0 ? totalUsd * usdToCny : 0,
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
  const getModelContextLength = (model = '') => {
    const options = Array.from(refs.modelSelect?.options || []);
    const option = options.find((item) => item.value === model)
      || options.find((item) => item.value === App.config?.getResolvedModel?.());
    const value = Number.parseInt(option?.dataset?.contextLength || '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const normalizeTokenUsage = ({ tokenUsage = null, apiUsage = null, requestMessages = [], completionText = '', model = '' } = {}) => {
    const existing = tokenUsage && typeof tokenUsage === 'object' ? tokenUsage : null;
    const normalizedApiUsage = normalizeApiUsage(apiUsage);
    const estimatedPromptTokens = estimateMessagesTokens(requestMessages);
    const estimatedCompletionTokens = estimateTextTokens(completionText);
    const promptTokens = Number(existing?.promptTokens ?? normalizedApiUsage?.promptTokens ?? estimatedPromptTokens ?? 0);
    const completionTokens = Number(existing?.completionTokens ?? normalizedApiUsage?.completionTokens ?? estimatedCompletionTokens ?? 0);
    const totalTokens = Number(existing?.totalTokens ?? normalizedApiUsage?.totalTokens ?? (promptTokens + completionTokens));
    const contextLength = Number(existing?.contextLength || getModelContextLength(model) || 0);
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      contextLength,
      remainingContext: contextLength ? Math.max(0, contextLength - totalTokens) : 0,
      estimated: existing ? Boolean(existing.estimated) : !normalizedApiUsage,
      model: String(existing?.model || model || ''),
      cost: buildCostMeta({ promptTokens, completionTokens, model: model || existing?.model || '', cost: existing?.cost }),
    };
  };
  const getCurrentPageId = () => {
    try {
      return localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    } catch {
      return 'ai-config';
    }
  };
  const getPageTitle = (pageId) => constants.PAGE_DEFS?.[pageId]?.title || pageId || '-';
  const getProviderLabel = (provider) => {
    const value = String(provider || '').toLowerCase();
    if (value === 'lmstudio') return 'LM Studio';
    if (value === 'openrouter') return 'OpenRouter';
    return provider || '未知供应商';
  };
  const getModelDisplayName = (model) => {
    const value = String(model || '未选择模型').trim();
    const parts = value.split('/').map((item) => item.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : (value || '未选择模型');
  };
  const getSourceLabel = (source) => ({
    chat: '右侧聊天',
    'config-test': '配置测试',
    'chat-natural-language': '自然语言技能',
  }[source] || source || 'AI调用');

  const record = (entry = {}) => {
    const endedAt = entry.endedAt || nowIso();
    const model = String(entry.model || entry.tokenUsage?.model || App.config?.getResolvedModel?.() || '').trim();
    const status = entry.status === 'failed' ? 'failed' : 'success';
    const tokenUsage = normalizeTokenUsage({
      tokenUsage: entry.tokenUsage,
      apiUsage: entry.apiUsage,
      requestMessages: entry.requestMessages,
      completionText: entry.completionText || entry.responsePreview,
      model,
    });
    if (status === 'failed' && !entry.apiUsage && !entry.tokenUsage) {
      tokenUsage.cost = null;
    }
    const pageId = String(entry.pageId || getCurrentPageId() || '');
    const log = {
      id: String(entry.id || `ai-call-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      at: entry.at || endedAt,
      startedAt: entry.startedAt || entry.at || endedAt,
      endedAt,
      durationMs: Number(entry.durationMs || 0),
      provider: String(entry.provider || App.config?.getFormConfig?.()?.aiProvider || '').trim(),
      model: model || '未选择模型',
      endpoint: truncate(entry.endpoint || '', 500),
      source: String(entry.source || 'chat'),
      pageId,
      pageTitle: getPageTitle(pageId),
      sessionId: String(entry.sessionId || ''),
      status,
      statusText: String(entry.statusText || ''),
      error: truncate(entry.error || '', 1200),
      prompt: truncate(entry.prompt || '', 3000),
      responsePreview: truncate(entry.responsePreview || entry.completionText || '', 5000),
      requestMeta: entry.requestMeta && typeof entry.requestMeta === 'object' ? {
        messages: Number(entry.requestMeta.messages || 0),
        images: Number(entry.requestMeta.images || 0),
        files: Number(entry.requestMeta.files || 0),
        attachedData: Boolean(entry.requestMeta.attachedData),
        stream: Boolean(entry.requestMeta.stream),
      } : {},
      tokenUsage,
    };

    const logs = [log, ...readLogs().filter((item) => item?.id !== log.id)];
    writeLogs(logs);
    render();
    return log;
  };

  const getTotals = (logs) => logs.reduce((acc, item) => {
    const usage = item.tokenUsage || {};
    const cost = normalizeCostUsage(usage.cost);
    acc.calls += 1;
    acc.success += item.status === 'success' ? 1 : 0;
    acc.failed += item.status === 'failed' ? 1 : 0;
    acc.promptTokens += Number(usage.promptTokens || 0);
    acc.completionTokens += Number(usage.completionTokens || 0);
    acc.totalTokens += Number(usage.totalTokens || 0);
    acc.totalUsd += Number(cost?.totalUsd || 0);
    acc.totalCny += Number(cost?.totalCny || 0);
    acc.durationMs += Number(item.durationMs || 0);
    acc.estimated += usage.estimated ? 1 : 0;
    if (item.model) acc.models.add(item.model);
    return acc;
  }, {
    calls: 0,
    success: 0,
    failed: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalUsd: 0,
    totalCny: 0,
    durationMs: 0,
    estimated: 0,
    models: new Set(),
  });

  const clampPercent = (value) => {
    const number = Number(value || 0);
    return number <= 0 ? '0%' : `${Math.max(3, Math.min(100, number))}%`;
  };
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };
  const getLogDate = (item) => {
    const date = new Date(item?.at || item?.endedAt || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };
  const getWeekStart = (date = new Date()) => {
    const day = date.getDay() || 7;
    return addDays(startOfDay(date), 1 - day);
  };
  const getMonthStart = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
  const getYearStart = (date = new Date()) => new Date(date.getFullYear(), 0, 1);
  const formatShortDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
  const formatMonthLabel = (date) => `${date.getMonth() + 1}月`;
  const createEmptyMetric = (label, start, end) => ({
    label,
    start,
    end,
    calls: 0,
    success: 0,
    failed: 0,
    tokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cny: 0,
    usd: 0,
    durationMs: 0,
  });
  const addLogToMetric = (metric, item) => {
    const usage = item.tokenUsage || {};
    const cost = normalizeCostUsage(usage.cost);
    metric.calls += 1;
    metric.success += item.status === 'success' ? 1 : 0;
    metric.failed += item.status === 'failed' ? 1 : 0;
    metric.tokens += Number(usage.totalTokens || 0);
    metric.promptTokens += Number(usage.promptTokens || 0);
    metric.completionTokens += Number(usage.completionTokens || 0);
    metric.cny += Number(cost?.totalCny || 0);
    metric.usd += Number(cost?.totalUsd || 0);
    metric.durationMs += Number(item.durationMs || 0);
  };
  const getPeriodLogs = (logs, start, end) => logs.filter((item) => {
    const date = getLogDate(item);
    return date >= start && date < end;
  });
  const buildDayBuckets = (logs, start, days) => {
    const buckets = Array.from({ length: days }, (_, index) => {
      const dayStart = addDays(start, index);
      return createEmptyMetric(formatShortDate(dayStart), dayStart, addDays(dayStart, 1));
    });
    logs.forEach((item) => {
      const date = getLogDate(item);
      const bucket = buckets.find((entry) => date >= entry.start && date < entry.end);
      if (bucket) addLogToMetric(bucket, item);
    });
    return buckets;
  };
  const buildMonthBuckets = (logs, yearStart) => {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(yearStart.getFullYear(), index, 1);
      const end = new Date(yearStart.getFullYear(), index + 1, 1);
      return createEmptyMetric(formatMonthLabel(start), start, end);
    });
    logs.forEach((item) => {
      const date = getLogDate(item);
      const bucket = buckets.find((entry) => date >= entry.start && date < entry.end);
      if (bucket) addLogToMetric(bucket, item);
    });
    return buckets;
  };
  const summarizeBuckets = (buckets) => buckets.reduce((acc, item) => {
    acc.calls += item.calls;
    acc.success += item.success;
    acc.failed += item.failed;
    acc.tokens += item.tokens;
    acc.promptTokens += item.promptTokens;
    acc.completionTokens += item.completionTokens;
    acc.cny += item.cny;
    acc.usd += item.usd;
    acc.durationMs += item.durationMs;
    return acc;
  }, createEmptyMetric('', null, null));
  const getPeriodSummary = (logs) => {
    const today = new Date();
    const weekStart = getWeekStart(today);
    const monthStart = getMonthStart(today);
    const yearStart = getYearStart(today);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextYear = new Date(today.getFullYear() + 1, 0, 1);
    const weekBuckets = buildDayBuckets(getPeriodLogs(logs, weekStart, addDays(weekStart, 7)), weekStart, 7);
    const monthBuckets = buildDayBuckets(getPeriodLogs(logs, monthStart, nextMonth), monthStart, Math.ceil((nextMonth - monthStart) / 86400000));
    const yearBuckets = buildMonthBuckets(getPeriodLogs(logs, yearStart, nextYear), yearStart);
    return {
      week: { label: '本周', buckets: weekBuckets, total: summarizeBuckets(weekBuckets) },
      month: { label: '本月', buckets: monthBuckets, total: summarizeBuckets(monthBuckets) },
      year: { label: '本年', buckets: yearBuckets, total: summarizeBuckets(yearBuckets) },
    };
  };
  const getSuccessRate = (metric) => (metric.calls ? `${Math.round((metric.success / metric.calls) * 100)}%` : '-');
  const getAvgDuration = (metric) => (metric.calls ? formatDuration(metric.durationMs / metric.calls) : '-');
  const buildTrendGeometry = (buckets, valueKey = 'tokens') => {
    const width = 720;
    const height = 210;
    const padding = { top: 28, right: 44, bottom: 34, left: 44 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = buckets.map((item) => Number(item[valueKey] || 0));
    const max = Math.max(...values, 1);
    const step = buckets.length > 1 ? plotWidth / (buckets.length - 1) : plotWidth;
    const points = buckets.map((item, index) => {
      const value = Number(item[valueKey] || 0);
      const x = padding.left + step * index;
      const y = padding.top + (1 - value / max) * plotHeight;
      const valueY = y <= padding.top + 18 ? y + 23 : y - 13;
      return {
        item,
        value,
        x,
        y,
        valueY,
        xPercent: (x / width) * 100,
        yPercent: (y / height) * 100,
        valueYPercent: (valueY / height) * 100,
      };
    });
    const linePath = points.map((point, index) => {
      if (!index) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      const prev = points[index - 1];
      const controlX = ((prev.x + point.x) / 2).toFixed(1);
      return `C ${controlX} ${prev.y.toFixed(1)}, ${controlX} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }).join(' ');
    const baseline = height - padding.bottom;
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`
      : '';
    const gridPath = Array.from({ length: 4 }, (_, index) => {
      const y = padding.top + (plotHeight / 3) * index;
      return `M ${padding.left} ${y.toFixed(1)} H ${width - padding.right}`;
    }).join(' ');
    return { width, height, padding, points, linePath, areaPath, gridPath, max };
  };

  const renderTrendChart = (buckets, valueKey = 'tokens') => {
    const geometry = buildTrendGeometry(buckets, valueKey);
    const total = buckets.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
    const average = buckets.length ? Math.round(total / buckets.length) : 0;
    const peak = buckets.reduce((best, item) => (Number(item[valueKey] || 0) > Number(best[valueKey] || 0) ? item : best), buckets[0] || {});
    return `
      <div class="ai-call-trend-card">
        <div class="ai-call-trend-summary" aria-label="周期摘要">
          <span><b>${formatNumber(total)}</b><em>周期 Tokens</em></span>
          <span><b>${formatNumber(average)}</b><em>日均 Tokens</em></span>
          <span><b>${esc(peak?.label || '-')}</b><em>峰值 ${formatNumber(peak?.[valueKey] || 0)}</em></span>
          <span><b>${esc(getSuccessRate(summarizeBuckets(buckets)))}</b><em>成功率</em></span>
        </div>
        <div class="ai-call-trend-visual">
          <svg class="ai-call-trend-svg" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="none" role="img" aria-label="Token 使用趋势">
            <defs>
              <linearGradient id="aiCallTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="currentColor" stop-opacity=".24"></stop>
                <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <path class="ai-call-trend-grid" d="${geometry.gridPath}"></path>
            <path class="ai-call-trend-area" d="${geometry.areaPath}"></path>
            <path class="ai-call-trend-line" d="${geometry.linePath}"></path>
          </svg>
          <div class="ai-call-trend-markers" aria-hidden="true">
            ${geometry.points.map((point) => `
              <span class="ai-call-trend-value" style="left:${point.xPercent.toFixed(3)}%; top:${point.valueYPercent.toFixed(3)}%;">${formatNumber(point.value)}</span>
              <span class="ai-call-trend-point" style="left:${point.xPercent.toFixed(3)}%; top:${point.yPercent.toFixed(3)}%;" title="${esc(point.item.label)} · ${formatNumber(point.value)} Tokens"></span>
              <span class="ai-call-trend-axis" style="left:${point.xPercent.toFixed(3)}%;">${esc(point.item.label)}</span>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  };
  const renderPeriodTabs = (periods) => {
    const ordered = [
      ['week', periods.week],
      ['month', periods.month],
      ['year', periods.year],
    ];
    const current = periods[activePeriodKey] || periods.week;
    return `
      <section class="ai-call-period-card" aria-label="周期使用分析">
        <div class="ai-call-period-tabs" role="tablist" aria-label="周期切换">
          ${ordered.map(([key, period]) => `
            <button
              class="${key === activePeriodKey ? 'is-active' : ''}"
              type="button"
              role="tab"
              aria-selected="${key === activePeriodKey ? 'true' : 'false'}"
              data-ai-call-period="${key}">
              ${esc(period.label)}
            </button>
          `).join('')}
        </div>
        ${renderTrendChart(current.buckets, 'tokens')}
      </section>
    `;
  };
  const getModelRows = (logs) => {
    const groups = new Map();
    logs.forEach((item) => {
      const model = item.model || '未选择模型';
      const key = `${item.provider || ''}::${model}`;
      const usage = item.tokenUsage || {};
      const cost = normalizeCostUsage(usage.cost);
      const group = groups.get(key) || {
        provider: item.provider || '',
        model,
        calls: 0,
        tokens: 0,
        usd: 0,
        cny: 0,
        lastAt: item.at,
      };
      group.calls += 1;
      group.tokens += Number(usage.totalTokens || 0);
      group.usd += Number(cost?.totalUsd || 0);
      group.cny += Number(cost?.totalCny || 0);
      if (new Date(item.at) > new Date(group.lastAt)) group.lastAt = item.at;
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => b.tokens - a.tokens || b.calls - a.calls);
  };

  const renderEmptyState = ({ icon = 'ti-database-off', title = '暂无数据', description = '', hints = [] } = {}) => `
    <div class="ai-call-empty-state">
      <span class="ai-call-empty-icon"><i class="ti ${esc(icon)}" aria-hidden="true"></i></span>
      <strong>${esc(title)}</strong>
      ${description ? `<p>${esc(description)}</p>` : ''}
      ${hints.length ? `
        <div class="ai-call-empty-hints" aria-label="建议操作">
          ${hints.map((hint) => `<span>${esc(hint)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  const renderModelSummary = (logs) => {
    const rows = getModelRows(logs);
    if (!rows.length) {
      return renderEmptyState({
        icon: 'ti-chart-bar-off',
        title: '还没有模型消耗数据',
        description: '完成一次聊天或配置测试后，这里会按 Token 消耗自动生成模型排行。',
        hints: ['等待首次调用', '自动统计 Token', '按模型汇总'],
      });
    }
    const rankIcons = ['ti-medal', 'ti-medal-2', 'ti-medal'];
    return rows.map((item, index) => `
      <div class="ai-call-model-row ${index < 3 ? `is-top-${index + 1}` : ''}">
        <div class="ai-call-model-rank">
          ${index < 3 ? `<i class="ti ${rankIcons[index]}" aria-hidden="true"></i>` : index + 1}
        </div>
        <div class="ai-call-model-main">
          <strong class="ai-call-model-title">${esc(getModelDisplayName(item.model))}</strong>
          <div class="ai-call-model-meta">
            <span>${formatNumber(item.calls)} 次调用</span>
            <span>${esc(formatCnyCost(item.cny))}</span>
          </div>
        </div>
        <div class="ai-call-model-token">
          <strong>${formatNumber(item.tokens)}</strong>
          <span>Token</span>
        </div>
      </div>
    `).join('');
  };

  const renderRows = (logs) => {
    if (!logs.length) {
      return `
        <tr class="ai-call-empty-row">
          <td colspan="8">
            ${renderEmptyState({
              icon: 'ti-list-details',
              title: '暂无调用明细',
              description: '从右侧聊天发送一次问题，或在配置中心执行一次测试，明细会自动记录到这里。',
              hints: ['时间来源', '模型状态', 'Tokens 与费用', '问题与结果'],
            })}
          </td>
        </tr>
      `;
    }
    return logs.map((item) => {
      const usage = item.tokenUsage || {};
      const cost = normalizeCostUsage(usage.cost);
      const statusClass = item.status === 'failed' ? 'is-failed' : 'is-success';
      const statusText = item.status === 'failed' ? '失败' : '成功';
      const accuracyText = usage.estimated ? '估算' : '接口返回';
      const meta = item.requestMeta || {};
      const requestMeta = [
        meta.messages ? `${meta.messages} 条消息` : '',
        meta.images ? `${meta.images} 张图` : '',
        meta.files ? `${meta.files} 个文件` : '',
        meta.attachedData ? '含数据上下文' : '',
        meta.stream ? '流式' : '非流式',
      ].filter(Boolean).join(' · ');
      return `
        <tr data-ai-call-row="${esc(item.id)}">
          <td>
            <strong class="ai-call-cell-main">${esc(formatDateTime(item.at))}</strong>
            <span class="ai-call-cell-sub">${esc(getSourceLabel(item.source))} · ${esc(item.pageTitle || getPageTitle(item.pageId))}</span>
          </td>
          <td>
            <strong class="ai-call-cell-main">${esc(getModelDisplayName(item.model || '-'))}</strong>
            <span class="ai-call-cell-sub">${esc(getProviderLabel(item.provider))}</span>
          </td>
          <td>
            <mark class="${statusClass}">${statusText}</mark>
            <span class="ai-call-cell-sub">${esc(accuracyText)}</span>
          </td>
          <td>
            <strong class="ai-call-cell-main">${formatNumber(usage.totalTokens || 0)}</strong>
            <span class="ai-call-cell-sub">输入 ${formatNumber(usage.promptTokens || 0)} / 输出 ${formatNumber(usage.completionTokens || 0)}</span>
          </td>
          <td>
            <strong class="ai-call-cell-main">${esc(formatCostLabel(cost))}</strong>
            <span class="ai-call-cell-sub">${cost ? `单价 ${esc(formatUsdCost(cost.promptPricePerToken || 0))}/${esc(formatUsdCost(cost.completionPricePerToken || 0))}` : (item.status === 'failed' ? '失败调用未确认扣费' : '未匹配到模型价格')}</span>
          </td>
          <td>
            <strong class="ai-call-cell-main">${esc(formatDuration(item.durationMs))}</strong>
            <span class="ai-call-cell-sub">${esc(requestMeta || item.sessionId || '-')}</span>
          </td>
          <td>
            <p class="ai-call-cell-main">${esc(item.prompt || '-')}</p>
            <span class="ai-call-cell-sub">${esc(item.error || item.responsePreview || '-')}</span>
          </td>
          <td>
            <button class="ai-call-detail-btn" type="button" data-ai-call-detail="${esc(item.id)}">查看</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderDetailField = (label, value) => `
    <div class="ai-call-detail-field">
      <span>${esc(label)}</span>
      <strong>${esc(value || '-')}</strong>
    </div>
  `;
  const renderDetailModal = (item) => {
    const usage = item.tokenUsage || {};
    const cost = normalizeCostUsage(usage.cost);
    const meta = item.requestMeta || {};
    const detailRows = [
      renderDetailField('时间', formatDateTime(item.at)),
      renderDetailField('来源', `${getSourceLabel(item.source)} · ${item.pageTitle || getPageTitle(item.pageId)}`),
      renderDetailField('模型', getModelDisplayName(item.model)),
      renderDetailField('供应商', getProviderLabel(item.provider)),
      renderDetailField('状态', item.status === 'failed' ? `失败：${item.error || '-'}` : `成功：${item.statusText || '接口返回'}`),
      renderDetailField('Tokens', `总计 ${formatNumber(usage.totalTokens || 0)}，输入 ${formatNumber(usage.promptTokens || 0)}，输出 ${formatNumber(usage.completionTokens || 0)}`),
      renderDetailField('费用', formatCostLabel(cost)),
      renderDetailField('耗时', formatDuration(item.durationMs)),
      renderDetailField('请求', `${meta.messages || 0} 条消息 · ${meta.images || 0} 张图 · ${meta.files || 0} 个文件 · ${meta.stream ? '流式' : '非流式'}`),
      renderDetailField('接口', item.endpoint),
    ].join('');
    return `
      <div class="ai-call-detail-modal" role="dialog" aria-modal="true" aria-label="AI 调用详情">
        <div class="ai-call-detail-backdrop" data-ai-call-close></div>
        <section class="ai-call-detail-card">
          <div class="ai-call-detail-head">
            <div>
              <h2>调用详情</h2>
              <span>${esc(item.id)}</span>
            </div>
            <button class="ai-call-detail-close" type="button" data-ai-call-close aria-label="关闭详情">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
          <div class="ai-call-detail-grid">${detailRows}</div>
          <div class="ai-call-detail-block">
            <h3>问题</h3>
            <p>${esc(item.prompt || '-')}</p>
          </div>
          <div class="ai-call-detail-block">
            <h3>${item.status === 'failed' ? '错误' : '结果'}</h3>
            <p>${esc(item.error || item.responsePreview || '-')}</p>
          </div>
        </section>
      </div>
    `;
  };
  const closeDetailModal = () => refs.aiCallAnalysisPanel?.querySelector('.ai-call-detail-modal')?.remove();
  const openDetailModal = (id) => {
    const item = readLogs().find((log) => log?.id === id);
    if (!item || !refs.aiCallAnalysisPanel) return;
    closeDetailModal();
    refs.aiCallAnalysisPanel.insertAdjacentHTML('beforeend', renderDetailModal(item));
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(readLogs(), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-call-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    if (!window.confirm('确认清空所有 AI 调用分析记录？此操作只清空本地统计日志，不会删除聊天记录。')) return;
    writeLogs([]);
    render();
  };

  const render = () => {
    if (!refs.aiCallAnalysisPanel) return;
    const logs = readLogs();
    const totals = getTotals(logs);
    const periods = getPeriodSummary(logs);
    refs.aiCallAnalysisPanel.innerHTML = `
      <section class="ai-call-analysis-stats" aria-label="AI 调用统计">
        <div>
          <strong>${formatNumber(totals.calls)}</strong>
          <span>累计调用</span>
        </div>
        <div>
          <strong>${formatNumber(totals.totalTokens)}</strong>
          <span>累计 Tokens</span>
        </div>
        <div>
          <strong>${esc(formatCnyCost(totals.totalCny))}</strong>
          <span>${esc(formatUsdCost(totals.totalUsd))}</span>
        </div>
        <div>
          <strong>${formatNumber(totals.models.size)}</strong>
          <span>涉及模型 · 失败 ${formatNumber(totals.failed)} 次</span>
        </div>
      </section>

      <section class="ai-call-analysis-overview">
        ${renderPeriodTabs(periods)}
        <div class="ai-call-analysis-panel">
          <div class="ai-call-analysis-panel-head">
            <h2>模型消耗排行</h2>
            <span class="ai-call-analysis-panel-subtitle">按 Token 消耗排序</span>
          </div>
          <div class="ai-call-model-list${logs.length ? '' : ' is-empty'}">${renderModelSummary(logs)}</div>
        </div>
      </section>

      <section class="ai-call-analysis-grid">
        <div class="ai-call-analysis-panel ai-call-analysis-table-panel">
          <div class="ai-call-analysis-panel-head">
            <div>
              <h2>调用明细</h2>
              <span class="ai-call-analysis-panel-subtitle">最多保留最近 ${formatNumber(MAX_LOGS)} 条</span>
            </div>
            <div class="ai-call-analysis-actions">
              <button class="ai-call-analysis-btn" type="button" id="aiCallExportBtn">
                <i class="ti ti-download" aria-hidden="true"></i>
                <span>导出日志</span>
              </button>
              <button class="ai-call-analysis-btn" type="button" id="aiCallClearBtn">
                <i class="ti ti-trash" aria-hidden="true"></i>
                <span>清空记录</span>
              </button>
            </div>
          </div>
          <div class="ai-call-analysis-table-wrap${logs.length ? '' : ' is-empty'}">
            <table class="ai-call-analysis-table">
              <thead>
                <tr>
                  <th>时间/来源</th>
                  <th>模型</th>
                  <th>状态</th>
                  <th>Tokens</th>
                  <th>费用</th>
                  <th>耗时/请求</th>
                  <th>问题与结果</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>${renderRows(logs)}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  };

  const bind = () => {
    if (bound || !refs.aiCallAnalysisPanel) return;
    bound = true;
    refs.aiCallAnalysisPanel.addEventListener('click', (event) => {
      if (event.target.closest('#aiCallExportBtn')) {
        exportLogs();
        return;
      }
      if (event.target.closest('#aiCallClearBtn')) {
        clearLogs();
        return;
      }
      const detailButton = event.target.closest('[data-ai-call-detail]');
      if (detailButton) {
        openDetailModal(detailButton.getAttribute('data-ai-call-detail'));
        return;
      }
      const periodButton = event.target.closest('[data-ai-call-period]');
      if (periodButton) {
        activePeriodKey = periodButton.getAttribute('data-ai-call-period') || 'week';
        render();
        return;
      }
      if (event.target.closest('[data-ai-call-close]')) {
        closeDetailModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDetailModal();
    });
  };

  const init = () => {
    bind();
    render();
  };

  App.aiCallAnalysis = {
    init,
    render,
    record,
    getLogs: readLogs,
    clearLogs,
    buildUsageMeta: normalizeTokenUsage,
    formatCostLabel,
  };
})();
