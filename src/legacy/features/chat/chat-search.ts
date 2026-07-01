import { fetchWithTimeout } from '../../../utils/fetch';

const SEARCH_PLAN_MAX_QUERIES = 3;
const SEARCH_PLAN_MIN_RESULTS = 3;
const SEARCH_PLAN_MAX_RESULTS = 20;

const clampSearchResultCount = (value: unknown, fallback = 8) => {
  const parsed = Number.parseInt(String(value), 10);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 8;
  const next = Number.isFinite(parsed) ? parsed : safeFallback;
  return Math.max(SEARCH_PLAN_MIN_RESULTS, Math.min(SEARCH_PLAN_MAX_RESULTS, next));
};

const normalizeSearchQueryText = (value: unknown) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180);

const dedupeSearchQueries = (queries: unknown) => {
  const seen = new Set<string>();
  return (Array.isArray(queries) ? queries : [])
    .map(normalizeSearchQueryText)
    .filter((query) => {
      if (!query) return false;
      const key = query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SEARCH_PLAN_MAX_QUERIES);
};

const QUERY_INTENT_TERMS = [
  '参赛名单', '入选名单', '中国队', '国家队', '大名单', '运动员', '教练员',
  '发布会', '发布', '官网', '官方', '公告', '公示', '名单', '阵容',
  '价格', '报价', '政策', '法规', '文件', '标准', '版本', '更新',
  '财报', '业绩', '销量', '参数', '配置', '型号', '教程', '文档',
  '地址', '电话', '天气', '股价', '汇率', '新闻', '最新', '最近',
];

const STOP_TERMS = new Set([
  '请问', '帮我', '一下', '查询', '搜索', '查找', '查一下', '了解', '关于',
  '有没有', '是什么', '怎么样', '如何', '多少', '哪些', '哪几个', '什么',
]);

const splitChineseChunks = (chunk: string) => {
  let rest = chunk;
  const terms: string[] = [];
  const sortedTerms = [...QUERY_INTENT_TERMS].sort((left, right) => right.length - left.length);
  sortedTerms.forEach((term) => {
    if (!rest.includes(term)) return;
    terms.push(term);
    rest = rest.replaceAll(term, ' ');
  });
  rest.split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !STOP_TERMS.has(item))
    .forEach((item) => {
      terms.push(item);
      if (item.length >= 8) {
        terms.push(item.slice(0, 4), item.slice(-4));
      }
    });
  return terms;
};

export const extractSearchKeyTerms = (prompt: unknown) => {
  const text = String(prompt || '').trim();
  if (!text) return [];
  const normalized = text
    .replace(/[“”"'`]/g, ' ')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([0-9]{4})(?=[\u4e00-\u9fa5])/g, '$1 ')
    .replace(/([\u4e00-\u9fa5])([0-9]{4})/g, '$1 $2')
    .replace(/[，。！？、；：,.!?;:()[\]{}<>]/g, ' ');
  const terms: string[] = [];
  const pushTerm = (value: string) => {
    const term = value.trim();
    if (term.length < 2 || STOP_TERMS.has(term)) return;
    terms.push(term);
  };

  (normalized.match(/\b(?:19|20)\d{2}\b/g) || []).forEach(pushTerm);
  (text.match(/[A-Za-z][A-Za-z0-9._/-]{1,}/g) || []).forEach(pushTerm);
  (normalized.match(/[\u4e00-\u9fa5]{2,}/g) || [])
    .flatMap(splitChineseChunks)
    .forEach(pushTerm);

  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
};

const buildPrecisionQueries = (prompt: unknown) => {
  const basePrompt = normalizeSearchQueryText(prompt);
  const terms = extractSearchKeyTerms(prompt);
  if (!terms.length) return [basePrompt];
  const yearTerms = terms.filter((term) => /^(?:19|20)\d{2}$/.test(term));
  const intentTerms = terms.filter((term) => QUERY_INTENT_TERMS.includes(term));
  const entityTerms = terms.filter((term) => !yearTerms.includes(term) && !intentTerms.includes(term));
  const coreTerms = [...entityTerms.slice(0, 4), ...yearTerms, ...intentTerms.slice(0, 4)];
  return [
    coreTerms.join(' '),
    [...entityTerms.slice(0, 3), ...intentTerms.slice(0, 3), '官方'].filter(Boolean).join(' '),
    basePrompt,
  ].filter(Boolean);
};

export const normalizeSearchResults = (payload: any) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((item: any, index: number) => {
    const title = String(item?.title || item?.url || `搜索结果 ${index + 1}`).trim();
    const url = String(item?.url || '').trim();
    const content = String(item?.content || item?.raw_content || '').trim();
    const publishedDate = String(item?.published_date || item?.publishedDate || '').trim();
    if (!title && !url && !content) return null;
    return { title, url, content: content.slice(0, 1200), publishedDate };
  }).filter(Boolean);
};

export const normalizeSearchSources = (results: any[]) => normalizeSearchResults({ results })
  .slice(0, 10)
  .map((item: any, index: number) => ({
    id: index + 1,
    title: item.title,
    url: item.url,
    publishedDate: item.publishedDate,
  }));

export const promptRequiresWebSearch = (prompt: unknown) => {
  const text = String(prompt || '').trim();
  return Boolean(text && /(?:搜索|联网|网上|查一下|查找|最新|最近|今天|今日|昨日|昨天|明天|新闻|价格|报价|油价|汇率|天气|股价|行情|政策|法规|官网|资料|来源|链接|引用|现在|当前|版本|发布|趋势|市场)/i.test(text));
};

export const promptRequiresEntityLookupSearch = (prompt: unknown) => {
  const text = String(prompt || '').trim();
  return Boolean(text
    && /(?:\bAI\b|\bLLM\b|\bmodel\b|模型|Claude|GPT|Gemini|Fable|Mythos|Opus|Sonnet|Haiku|OpenRouter|Anthropic|DeepSeek|Qwen|GLM)/i.test(text)
    && /(?:知道|了解|是什么|有没有|发布|官网|最新|模型|查|搜索|\bmodel\b|\bAI\b|\bLLM\b)/i.test(text));
};

export const buildSearchUnavailableAnswer = (reason: unknown) => [
  '这个问题涉及最新或实时信息，必须先联网搜索才能可靠回答。',
  '',
  `当前无法完成搜索：${String(reason || '')}`,
  '',
  '我不会在没有搜索资料的情况下编造答案。请开启“联网搜索”并在配置中心填写 Tavily API Key 后再试。',
].join('\n');

export const buildFallbackSearchPlan = (prompt: unknown, config: any = {}) => {
  const queries = buildPrecisionQueries(prompt);
  const latinTerms = Array.from(new Set(String(prompt || '').match(/[A-Za-z][A-Za-z0-9._/-]{2,}/g) || []));
  latinTerms.slice(0, 2).forEach((term) => {
    queries.push(term);
    const spaced = term.replace(/([A-Za-z])([0-9]+)/g, '$1 $2').replace(/([0-9]+)([A-Za-z])/g, '$1 $2');
    if (spaced !== term) queries.push(spaced);
  });
  return {
    queries: dedupeSearchQueries(queries),
    maxResults: clampSearchResultCount(Math.max(Number(config.searchMaxResults || 0), 8)),
    searchDepth: String(config.searchDepth || 'basic'),
    topic: String(config.searchTopic || 'general'),
    reason: 'fallback',
  };
};

const getPromptRelevanceProfile = (prompt: unknown) => {
  const terms = extractSearchKeyTerms(prompt);
  const requiredTerms = terms.filter((term) => !QUERY_INTENT_TERMS.includes(term)).slice(0, 5);
  const intentTerms = terms.filter((term) => QUERY_INTENT_TERMS.includes(term)).slice(0, 5);
  return { requiredTerms, boosts: [...requiredTerms, ...intentTerms] };
};

export const rankSearchResultsForPrompt = (results: any[], prompt: unknown) => {
  const normalized = normalizeSearchResults({ results });
  const profile = getPromptRelevanceProfile(prompt);
  if (!profile.requiredTerms.length && !profile.boosts.length) return normalized;

  const scored = normalized.map((item: any, index: number) => {
    const haystack = `${item.title || ''}\n${item.content || ''}\n${item.url || ''}`;
    const normalizedHaystack = haystack.toLowerCase();
    const matchedRequired = profile.requiredTerms.filter((term) => normalizedHaystack.includes(term.toLowerCase())).length;
    const boostScore = profile.boosts.reduce((score, term) => score + (haystack.toLowerCase().includes(term.toLowerCase()) ? 1 : 0), 0);
    const titleBoost = profile.boosts.reduce((score, term) => score + (String(item.title || '').toLowerCase().includes(term.toLowerCase()) ? 2 : 0), 0);
    return {
      item,
      index,
      score: matchedRequired * 8 + boostScore + titleBoost,
      matchedRequired,
    };
  });
  const minRequiredMatches = Math.min(2, profile.requiredTerms.length);
  const relevant = scored.filter((entry) => entry.matchedRequired >= minRequiredMatches || entry.score >= 10);
  const ranked = (relevant.length ? relevant : scored)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
  return ranked;
};

const mergeSearchResults = (groups: any[], limit: unknown) => {
  const seen = new Set<string>();
  const merged: any[] = [];
  const normalizeUrlKey = (value: unknown) => String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const tokenize = (value: unknown) => new Set(String(value || '').toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, ' ')
    .split(/\s+/).map((word) => word.trim()).filter((word) => word.length >= 2));
  const similarity = (left: Set<string>, right: Set<string>) => {
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach((word) => { if (right.has(word)) intersection += 1; });
    return intersection / (left.size + right.size - intersection);
  };
  const fingerprints: Set<string>[] = [];
  groups.flat().forEach((item) => {
    const key = normalizeUrlKey(item?.url) || String(item?.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    const fingerprint = tokenize(`${item?.title || ''} ${item?.content || ''}`);
    if (fingerprints.some((existing) => similarity(existing, fingerprint) >= 0.82)) return;
    seen.add(key);
    if (fingerprint.size) fingerprints.push(fingerprint);
    merged.push(item);
  });
  return merged.slice(0, clampSearchResultCount(limit));
};

export const createChatSearchRuntime = ({ getCurrentDateTimeLabel, createAbortError }: any) => {
  const formatSearchContext = (results: any[]) => {
    const items = normalizeSearchResults({ results }).slice(0, 10);
    if (!items.length) return '';
    return [
      '【联网搜索资料，用户不可见】',
      `【当前日期时间】${getCurrentDateTimeLabel()}（北京时间，Asia/Shanghai）`,
      '以下资料来自实时搜索结果。回答时必须优先使用这些资料；涉及事实、新闻、价格、政策、版本或时效信息时，请注明信息可能随时间变化。',
      '凡是引用搜索结果中的事实、数据、发布时间、政策、价格、产品或机构信息，必须在对应句子末尾标注 [来源 N]，N 必须对应下面的来源编号。',
      '如果搜索结果没有覆盖今天，请明确说明，但禁止把旧结果日期改写为今天。资料不足时必须说明无法确认。',
      ...items.map((item: any, index: number) => [
        `【来源 ${index + 1}】${item.title}`,
        item.url ? `URL：${item.url}` : '',
        item.publishedDate ? `日期：${item.publishedDate}` : '',
        item.content ? `摘要：${item.content}` : '',
      ].filter(Boolean).join('\n')),
    ].join('\n\n');
  };

  const searchWebForPromptDynamic = async (config: any, prompt: string, options: any = {}) => {
    if (String(config.searchProvider || 'tavily').toLowerCase() !== 'tavily') return { results: [], context: '', plan: null };
    const searchPlan = options.searchPlan || buildFallbackSearchPlan(prompt, config);
    const fallbackPlan = buildFallbackSearchPlan(prompt, config);
    const plannedQueries = dedupeSearchQueries([
      ...buildPrecisionQueries(prompt),
      ...(Array.isArray(searchPlan.queries) ? searchPlan.queries : []),
    ]);
    const queries = plannedQueries.length ? plannedQueries : fallbackPlan.queries;
    const targetResults = clampSearchResultCount(searchPlan.maxResults, config.searchMaxResults || 8);
    const perQueryResults = clampSearchResultCount(Math.ceil(targetResults / Math.max(1, queries.length)) + 2, targetResults);
    const resultGroups: any[] = [];
    let completedQueries = 0;
    options.onProgress?.({ completedQueries: 0, totalQueries: queries.length, resultCount: 0, targetResults });

    const outcomes = await Promise.allSettled(queries.slice(0, 3).map(async (query) => {
      if (options.signal?.aborted) throw createAbortError();
      const response = await fetchWithTimeout('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.searchApiKey}` },
        signal: options.signal,
        body: JSON.stringify({
          query: [query, query !== prompt ? `Original question: ${prompt}` : '', `Current date: ${getCurrentDateTimeLabel()} Asia/Shanghai.`, 'Prefer official, recent, primary, or highly relevant sources.'].filter(Boolean).join(' '),
          topic: searchPlan.topic || config.searchTopic || 'general',
          search_depth: searchPlan.searchDepth || config.searchDepth || 'basic',
          max_results: perQueryResults,
          include_answer: false,
          include_raw_content: false,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Web search failed: HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 220)}` : ''}`);
      }
      resultGroups.push(normalizeSearchResults(await response.json()));
      completedQueries += 1;
      options.onProgress?.({ completedQueries, totalQueries: queries.length, resultCount: mergeSearchResults(resultGroups, targetResults).length, targetResults });
    }));
    if (!resultGroups.length) {
      const firstFailure = outcomes.find((outcome) => outcome.status === 'rejected');
      if (firstFailure?.status === 'rejected') throw firstFailure.reason;
    }
    const results = rankSearchResultsForPrompt(mergeSearchResults(resultGroups, targetResults), prompt)
      .slice(0, targetResults);
    return { results, context: formatSearchContext(results), plan: searchPlan };
  };

  return { searchWebForPromptDynamic };
};
