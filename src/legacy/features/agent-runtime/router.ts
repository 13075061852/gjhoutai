type AgentPlanKind =
  | 'local-tool'
  | 'web-search'
  | 'image-generation'
  | 'image-analysis'
  | 'chat';

type AgentSkillPlan = {
  skillId: string;
  input: Record<string, any>;
  confidence?: number;
  reason?: string;
};

type AgentPlan = {
  kind: AgentPlanKind;
  useProjectContext: boolean;
  needsWebSearch: boolean;
  wantsImageGeneration: boolean;
  wantsImageAnalysis: boolean;
  localSkillPlan: AgentSkillPlan | null;
  searchPlan?: {
    queries: string[];
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    topic?: 'general' | 'news';
    reason?: string;
  } | null;
  reason: string;
};

const textOf = (value: unknown) => String(value || '').trim();
const AGENT_PLAN_KINDS = ['local-tool', 'web-search', 'image-generation', 'image-analysis', 'chat'] as const;
const ROUTABLE_LOCAL_SKILL_IDS = [
  'project.searchCapabilities',
  'project.auditRuntime',
  'business.analyzeOverview',
  'assistant.modelInfo',
  'assistant.projectGuide',
  'assistant.currentPage',
  'media.generateImage',
  'media.analyzeImages',
  'dataRecognition.searchHistory',
  'dataRecognition.inspectCurrent',
  'business.queryPageData',
  'property.searchRows',
  'property.summarizeMetrics',
  'property.compareRows',
  'property.validateRanges',
] as const;

export const PROJECT_DATA_PATTERN = /(?:这个系统|这个项目|这个网站|后台|当前页面|当前|现在|几个|多少|数量|总数|有哪些|哪几个|列表|明细|最低|最少|最小|最高|最多|最大|库存|配方|订单|供应商|客户|人员|账号|账户|权限|物性|型号|批次|熔指|拉伸|弯曲|冲击|阻燃|灰份|强度|图谱|谱图|曲线|dsc|tga|抠图|识别历史|识别记录|数据识别)/i;
export const WEB_SEARCH_PATTERN = /(?:联网|搜索|网上|查一下|查找|最新|最近|今天|今日|昨日|昨天|明天|新闻|价格|报价|油价|汇率|天气|股价|行情|政策|法规|官网|资料来源|来源|链接|引用|版本|发布|趋势|市场|实时)/i;
export const IMAGE_GENERATION_PATTERN = /(?:生成图片|生成图像|出图|画一张|画图|绘图|海报|封面|壁纸|插图|生成.*(?:图片|图像|视觉|海报|封面))/i;
export const IMAGE_ANALYSIS_PATTERN = /(?:分析|看看|识别|读取|提取|对比|判断|解读).*(?:图谱|谱图|图片|图像|曲线|照片|dsc|tga|峰|标注)|(?:图谱|谱图|图片|图像|曲线|照片).*(?:分析|识别|读取|提取|对比|判断|解读)|分析这张|看这张|当前图/i;
export const OPEN_PAGE_PATTERN = /(?:打开|进入|切换到|跳转到|转到|去).*(?:页面|面板|中心|档案|管理|计划|库存|日志|仪表盘|助手|分析|配置|主题|技能|调用|费用|订单|客户|供应商|人员|权限|数据源|生产|配方|销售|开单|抠图|图谱|物性)/;
export const CURRENT_PAGE_PATTERN = /(?:我)?(?:当前|现在|目前)?(?:在|处于|位于|打开|打开的是|所在|所在的是)?(?:什么|哪个|哪一个)?(?:界面|页面|模块)|(?:我)?(?:当前|现在|目前)(?:在|处于|位于|打开|打开的是|所在|所在的是)|(?:什么|哪个|哪一个)(?:界面|页面|模块)/;
export const PAGE_GUIDE_PATTERN = /(?:这个|当前|本|该)?(?:页面|模块|功能|系统|项目|网站|应用|平台).*(?:做什么|是什么|用途|作用|介绍|说明|怎么用|如何使用|有什么|包含|能干嘛)|(?:你是谁|你是什么|你能做什么|你会什么|介绍一下你自己|这个后台能做什么)/;
export const BUSINESS_QUERY_PATTERN = /(?:查看|看一下|查询|统计|列出|列举|展示|罗列|了解|汇总|看看|查一下).*(?:订单|库存|配方|供应商|客户|人员|员工|账号|账户|生产|采购|权限|情况|状态)|(?:订单|库存|配方|供应商|客户|人员|员工|账号|账户|生产|采购|权限).*(?:情况|状态|几个|多少|数量|总数|有哪些|哪几个|列表|明细|当前|现在|最低|最少|最小|最高|最多|最大|怎么样|如何)/;
export const COMPLEX_PROJECT_ANALYSIS_PATTERN = /(?:综合分析|联合分析|对比分析|风险分析|原因分析|为什么|怎么优化|如何优化|给出建议|诊断|判断).*(?:订单|库存|配方|物性|图谱|生产|采购|客户|供应商|业务|数据)|(?:订单|库存|配方|物性|图谱|生产|采购|客户|供应商|业务|数据).*(?:综合分析|联合分析|对比分析|风险分析|原因分析|为什么|怎么优化|如何优化|给出建议|诊断|判断)/;
export const PROPERTY_MODEL_PATTERN = /(?:^|[^A-Z0-9])(?=[A-Z0-9-]*\d)[A-Z0-9]{2,}(?:-[A-Z0-9]+)+(?:$|[^A-Z0-9])/i;
export const PROPERTY_DATA_PATTERN = /(?:物性|型号|批次|分类情况|材料分类|无卤|阻燃|尼龙|竞品|原料|熔指|熔融指数|拉伸|断裂伸长|弯曲|冲击|灼热丝|CTI|漏电起痕|灰份|灰分|测试温度|检测范围|检验范围|材料性能|PBT|PET)/i;
export const CAPABILITY_SEARCH_PATTERN = /(?:哪个|什么|查找|搜索|有没有|是否有|支持|能不能|可以).*(?:技能|能力|功能)|(?:技能|能力|功能).*(?:哪个|什么|查找|搜索|有没有|支持|能不能)|(?:哪个|查找|搜索).*(?:页面).*(?:可以|支持|负责)/i;
export const AGENT_AUDIT_PATTERN = /(?:审计|检查|诊断|排查).*(?:agent|ai|助手|管家|技能|能力|项目)|(?:agent|ai|助手|管家|技能).*(?:异常|问题|完整|健康|状态)/i;
export const BUSINESS_OVERVIEW_PATTERN = /(?:全局|整体|整个|综合|经营|业务|项目|后台).*(?:总览|概况|情况|状态|分析|风险)|(?:总览|概况).*(?:业务|项目|后台)/i;
export const MODEL_INFO_PATTERN = /(?:你是什么|你是哪个|当前(?:使用|用的|配置的)?|现在(?:使用|用的)?|本次(?:使用|调用)?|这个会话(?:使用|用的)?|用的是什么|使用的是什么|调用的是什么)(?:ai)?模型|(?:哪个|什么)模型(?:在回答|正在回答|生成|用于本次)|模型(?:名称|信息|供应商|提供商)(?:是什么|为|是哪个)?/i;

export type AgentRouteClassification = {
  kind?: AgentPlan['kind'];
  skillId?: string;
  input?: Record<string, any>;
  confidence?: number;
  reason?: string;
  useProjectContext?: boolean;
  needsWebSearch?: boolean;
  searchQueries?: string[];
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  topic?: 'general' | 'news';
};

export type AgentRouteClassifier = (input: {
  prompt: string;
  activePageId: string;
  fallbackPlan: AgentPlan;
}) => Promise<AgentRouteClassification | null>;

export const buildLocalSkillPlan = (prompt: string, activePageId = ''): AgentSkillPlan | null => {
  if (AGENT_AUDIT_PATTERN.test(prompt)) {
    return {
      skillId: 'project.auditRuntime',
      input: {},
      confidence: 0.93,
      reason: '用户要求检查 Agent 或项目技能状态，执行确定性运行审计',
    };
  }
  if (CAPABILITY_SEARCH_PATTERN.test(prompt)) {
    return {
      skillId: 'project.searchCapabilities',
      input: { query: prompt, limit: 8 },
      confidence: 0.9,
      reason: '用户询问项目真实能力，从页面与技能注册表中检索',
    };
  }
  if (BUSINESS_OVERVIEW_PATTERN.test(prompt)) {
    return {
      skillId: 'business.analyzeOverview',
      input: { includeStatusGroups: true },
      confidence: 0.91,
      reason: '用户要求跨页面业务总览，读取已接入的结构化业务数据',
    };
  }
  if (MODEL_INFO_PATTERN.test(prompt)) {
    return {
      skillId: 'assistant.modelInfo',
      input: {},
      confidence: 0.96,
      reason: '用户询问当前会话实际使用的模型，读取运行时模型配置',
    };
  }
  if (PAGE_GUIDE_PATTERN.test(prompt)) {
    return {
      skillId: 'assistant.projectGuide',
      input: { question: prompt },
      confidence: 0.88,
      reason: '用户询问项目或页面说明，直接读取本地项目说明书',
    };
  }
  if (CURRENT_PAGE_PATTERN.test(prompt)) {
    return {
      skillId: 'assistant.currentPage',
      input: {},
      confidence: 0.94,
      reason: '用户询问当前所在页面，直接读取本地导航状态',
    };
  }
  if (IMAGE_GENERATION_PATTERN.test(prompt)) {
    return {
      skillId: 'media.generateImage',
      input: { prompt },
      confidence: 0.86,
      reason: '用户要求生成图片，交给媒体生成工具处理',
    };
  }
  if (/识别历史|识别记录|数据识别历史|识别过/.test(prompt)) {
    return {
      skillId: 'dataRecognition.searchHistory',
      input: { query: prompt, limit: 8 },
      confidence: 0.82,
      reason: '用户询问数据识别历史',
    };
  }
  if (/当前.*识别|这张.*识别|识别结果|当前图片.*表格/.test(prompt)) {
    return {
      skillId: 'dataRecognition.inspectCurrent',
      input: {},
      confidence: 0.8,
      reason: '用户询问当前识别结果',
    };
  }
  const hasPropertyModel = PROPERTY_MODEL_PATTERN.test(prompt);
  const hasPropertyIntent = PROPERTY_DATA_PATTERN.test(prompt)
    || (activePageId === 'property-analysis' && (hasPropertyModel || /(?:质量|性能|指标|数据|材料|强度)/i.test(prompt)));
  if (hasPropertyIntent) {
    const skillId = /(?:合格|不合格|达标|超标|异常|检测范围|检验范围|规格范围|上下限|判定)/.test(prompt)
      ? 'property.validateRanges'
      : /(?:对比|比较|差异|哪个更|哪.*高|哪.*低|批次间|型号间)/.test(prompt)
        ? 'property.compareRows'
        : /(?:统计|汇总|均值|平均|最大|最小|范围|波动|稳定|趋势|离散)/.test(prompt)
          ? 'property.summarizeMetrics'
          : 'property.searchRows';
    return {
      skillId,
      input: { query: prompt },
      confidence: hasPropertyModel ? 0.94 : 0.84,
      reason: '识别到物性数据意图，调用物性表结构化分析技能',
    };
  }
  if (activePageId === 'spectrum-analysis' && /(?:分析|谱图|图谱|曲线|峰)/i.test(prompt)) {
    return {
      skillId: 'media.analyzeImages',
      input: { question: prompt },
      confidence: 0.82,
      reason: '结合当前图谱分析页面，将分析请求路由到图谱视觉分析',
    };
  }
  if (BUSINESS_QUERY_PATTERN.test(prompt)) {
    return {
      skillId: 'business.queryPageData',
      input: { question: prompt },
      confidence: 0.86,
      reason: '用户询问本地业务数据，直接查询结构化页面数据',
    };
  }
  if (IMAGE_ANALYSIS_PATTERN.test(prompt)) {
    return {
      skillId: 'media.analyzeImages',
      input: { question: prompt },
      confidence: 0.74,
      reason: '用户要求视觉分析',
    };
  }
  return null;
};

const normalizeClassifierKind = (value: unknown): AgentPlan['kind'] | '' => {
  const kind = String(value || '').trim();
  return AGENT_PLAN_KINDS.includes(kind as AgentPlan['kind']) ? kind as AgentPlan['kind'] : '';
};

const normalizeClassifierSkillPlan = (classification: AgentRouteClassification, prompt: string): AgentSkillPlan | null => {
  const skillId = String(classification?.skillId || '').trim();
  if (!ROUTABLE_LOCAL_SKILL_IDS.includes(skillId as typeof ROUTABLE_LOCAL_SKILL_IDS[number])) return null;
  const input = classification?.input && typeof classification.input === 'object' && !Array.isArray(classification.input)
    ? classification.input
    : {};
  const defaults: Record<string, Record<string, any>> = {
    'project.searchCapabilities': { query: prompt, limit: 8 },
    'project.auditRuntime': {},
    'business.analyzeOverview': { includeStatusGroups: true },
    'assistant.modelInfo': {},
    'assistant.projectGuide': { question: prompt },
    'assistant.currentPage': {},
    'media.generateImage': { prompt },
    'media.analyzeImages': { question: prompt },
    'dataRecognition.searchHistory': { query: prompt, limit: 8 },
    'dataRecognition.inspectCurrent': {},
    'business.queryPageData': { question: prompt },
    'property.searchRows': { query: prompt },
    'property.summarizeMetrics': { query: prompt },
    'property.compareRows': { query: prompt },
    'property.validateRanges': { query: prompt },
  };
  return {
    skillId,
    input: { ...(defaults[skillId] || {}), ...input },
    confidence: Number(classification.confidence || 0.7),
    reason: String(classification.reason || '').trim() || 'AI 辅助路由命中本地技能',
  };
};

const isConfidentRegexPlan = (plan: AgentPlan) => {
  if (plan.localSkillPlan?.confidence && plan.localSkillPlan.confidence >= 0.8) return true;
  return plan.kind === 'image-generation' || plan.kind === 'image-analysis';
};

export const parseAgentRouteClassification = (content: unknown): AgentRouteClassification | null => {
  const text = textOf(content);
  if (!text) return null;
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(jsonText) as AgentRouteClassification;
    const kind = normalizeClassifierKind(parsed?.kind);
    if (!kind) return null;
    return {
      kind,
      skillId: String(parsed?.skillId || '').trim(),
      input: parsed?.input && typeof parsed.input === 'object' && !Array.isArray(parsed.input) ? parsed.input : {},
      confidence: Number(parsed?.confidence || 0),
      reason: String(parsed?.reason || '').trim(),
      useProjectContext: typeof parsed?.useProjectContext === 'boolean' ? parsed.useProjectContext : undefined,
      needsWebSearch: typeof parsed?.needsWebSearch === 'boolean' ? parsed.needsWebSearch : undefined,
      searchQueries: Array.isArray(parsed?.searchQueries) ? parsed.searchQueries.map(textOf).filter(Boolean).slice(0, 3) : [],
      searchDepth: parsed?.searchDepth === 'advanced' ? 'advanced' : parsed?.searchDepth === 'basic' ? 'basic' : undefined,
      maxResults: Number.isFinite(Number(parsed?.maxResults)) ? Math.max(3, Math.min(20, Number(parsed.maxResults))) : undefined,
      topic: parsed?.topic === 'news' ? 'news' : parsed?.topic === 'general' ? 'general' : undefined,
    };
  } catch {
    return null;
  }
};

export const buildAgentRouteClassifierMessages = ({
  prompt,
  activePageId = '',
}: {
  prompt: unknown;
  activePageId?: string;
}) => [
  {
    role: 'system',
    content: [
      '你是 Gjun AI 的轻量意图理解与搜索规划器，只输出严格 JSON。',
      '判断用户问题应该进入哪类处理：local-tool、web-search、image-generation、image-analysis、chat。',
      'web-search：最新、最近、今天、价格、行情、政策、新闻、官网、资料来源、需要外部验证。',
      'local-tool：查询或操作本后台数据、当前页面、项目说明、订单/库存/配方/客户/供应商/人员/权限、物性数据、数据识别历史。物性问题必须使用 property.*，禁止使用 business.queryPageData。',
      '用户询问本次会话正在使用什么模型时，使用 assistant.modelInfo；不要把它误判为项目介绍。',
      'image-generation：用户要生成图片、海报、封面、插图。',
      'image-analysis：用户要分析已上传或项目内图谱/图片。',
      'chat：普通闲聊、写作、解释，不需要项目技能或联网。',
      `local-tool 可选 skillId：${ROUTABLE_LOCAL_SKILL_IDS.join(', ')}`,
      '若 needsWebSearch=true，同时生成 1-3 个高质量搜索词；简单查询 maxResults=5，宽泛比较为 8-12，searchDepth 取 basic 或 advanced，topic 取 general 或 news。',
      '生成搜索词时必须保留用户问题中的专有名词、年份、机构、产品、赛事、型号、地点和名单/价格/政策/版本/财报等关键限定词；禁止泛化成宽泛新闻或宽泛行业词。',
      '只输出：{"kind":"local-tool|web-search|image-generation|image-analysis|chat","skillId":"","input":{},"needsWebSearch":false,"searchQueries":[],"searchDepth":"basic","maxResults":5,"topic":"general","confidence":0.0,"reason":"一句话"}',
    ].join('\n'),
  },
  {
    role: 'user',
    content: [
      `当前页面：${String(activePageId || 'unknown')}`,
      `用户问题：${textOf(prompt)}`,
    ].join('\n'),
  },
];

export const shouldUseProjectContextForPrompt = (prompt: unknown) => (
  PROJECT_DATA_PATTERN.test(String(prompt || '').trim())
);

export const shouldUseProjectAgentLoopForPrompt = (prompt: unknown) => COMPLEX_PROJECT_ANALYSIS_PATTERN.test(textOf(prompt));

export const shouldUseWebSearchForPrompt = (prompt: unknown, options: { projectFirst?: boolean } = {} as any) => {
  const text = textOf(prompt);
  if (!text) return false;
  if (options.projectFirst && PROJECT_DATA_PATTERN.test(text) && !/(?:联网|搜索|网上|官网|最新|新闻|政策|法规|价格|行情|汇率|天气|股价|来源|链接|引用)/i.test(text)) {
    return false;
  }
  return WEB_SEARCH_PATTERN.test(text);
};

type CreateAgentPlanInput = {
  prompt: unknown;
  activePageId?: string;
  projectAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
};

const toCompatibilityPlan = (intent: AgentIntent): AgentPlan => {
  const localSkillPlan = intent.toolId
    ? {
      skillId: intent.toolId,
      input: intent.toolInput && typeof intent.toolInput === 'object' ? intent.toolInput : {},
      confidence: intent.confidence,
      reason: intent.reason,
    }
    : null;

  if (intent.kind === 'image_generation') {
    return { kind: 'image-generation', useProjectContext: false, needsWebSearch: false, wantsImageGeneration: true, wantsImageAnalysis: false, localSkillPlan, reason: intent.reason };
  }
  if (intent.kind === 'image_analysis') {
    return { kind: 'image-analysis', useProjectContext: true, needsWebSearch: false, wantsImageGeneration: false, wantsImageAnalysis: true, localSkillPlan, reason: intent.reason };
  }
  if (intent.kind === 'web_search') {
    return {
      kind: 'web-search',
      useProjectContext: false,
      needsWebSearch: true,
      wantsImageGeneration: false,
      wantsImageAnalysis: false,
      localSkillPlan: null,
      searchPlan: intent.searchPlan ? { ...intent.searchPlan, reason: intent.reason } : null,
      reason: intent.reason,
    };
  }
  if (intent.kind === 'single_tool') {
    return { kind: 'local-tool', useProjectContext: true, needsWebSearch: false, wantsImageGeneration: false, wantsImageAnalysis: false, localSkillPlan, reason: intent.reason };
  }
  if (intent.kind === 'complex_agent') {
    return { kind: 'local-tool', useProjectContext: true, needsWebSearch: false, wantsImageGeneration: false, wantsImageAnalysis: false, localSkillPlan: null, reason: intent.reason };
  }
  return { kind: 'chat', useProjectContext: false, needsWebSearch: false, wantsImageGeneration: false, wantsImageAnalysis: false, localSkillPlan: null, reason: intent.reason };
};

export const createAgentPlan = (input: CreateAgentPlanInput): AgentPlan => {
  const intent = classifyDeterministically(input);
  return toCompatibilityPlan(intent);
};

export const createAgentPlanWithAi = async (input: CreateAgentPlanInput & {
  classifier?: AgentRouteClassifier | null;
}): Promise<AgentPlan> => {
  const classifier: IntentGatewayClassifier | null = input.classifier
    ? async ({ prompt, activePageId }) => {
      const fallbackPlan = createAgentPlan({ ...input, prompt, activePageId });
      const classification = await input.classifier?.({ prompt, activePageId, fallbackPlan });
      if (!classification) return null;
      const kind = normalizeClassifierKind(classification.kind);
      if (!kind) return null;
      const searchPlan = Array.isArray(classification.searchQueries) && classification.searchQueries.length
        ? {
          queries: classification.searchQueries.filter(Boolean).slice(0, 3),
          maxResults: classification.maxResults || 5,
          searchDepth: classification.searchDepth || 'basic',
          topic: classification.topic || 'general',
        }
        : undefined;
      if (kind === 'web-search') return { kind: 'web_search', confidence: classification.confidence || 0.7, reason: classification.reason || 'AI 辅助路由判断需要联网搜索', searchPlan };
      if (kind === 'chat') return { kind: 'chat', confidence: classification.confidence || 0.7, reason: classification.reason || 'AI 辅助路由判断为普通对话', searchPlan };

      const localSkillPlan = normalizeClassifierSkillPlan(classification, prompt);
      if (!localSkillPlan) return null;
      const mappedKind = kind === 'image-generation'
        ? 'image_generation'
        : kind === 'image-analysis'
          ? 'image_analysis'
          : 'single_tool';
      return {
        kind: mappedKind,
        confidence: localSkillPlan.confidence || 0.7,
        reason: classification.reason || localSkillPlan.reason || 'AI 辅助路由命中项目工具',
        toolId: localSkillPlan.skillId,
        toolInput: localSkillPlan.input,
      };
    }
    : null;
  const intent = await createIntentGateway({ classifier }).route(input);
  return toCompatibilityPlan(intent);
};

import { classifyDeterministically, createIntentGateway, type IntentGatewayClassifier } from './intent-gateway';
import type { AgentIntent } from './protocol';
