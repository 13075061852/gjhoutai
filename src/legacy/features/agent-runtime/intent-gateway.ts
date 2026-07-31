import { agentIntentSchema, type AgentIntent } from './protocol';
import {
  COMPLEX_PROJECT_ANALYSIS_PATTERN,
  IMAGE_ANALYSIS_PATTERN,
  IMAGE_GENERATION_PATTERN,
  PROPERTY_MODEL_PATTERN,
  PROPERTY_PAGE_CONTEXT_PATTERN,
  PROJECT_DATA_PATTERN,
  buildLocalSkillPlan,
  shouldUseWebSearchForPrompt,
} from './router';

export const ROUTE_PRIORITY = [
  'image_generation',
  'image_analysis',
  'explicit_project_tool',
  'explicit_web_search',
  'complex_project_analysis',
  'obvious_chat',
  'ambiguous',
] as const;

const GREETING_PATTERN = /^(?:早|早上好|你好|您好|嗨|hello|hi)[!！。?？]*$/i;
const CROSS_DOMAIN_ANALYSIS_PATTERN = /(?:订单|库存|配方|物性|生产|采购|客户|供应商).*(?:订单|库存|配方|物性|生产|采购|客户|供应商).*(?:分析|风险|建议|排产)|(?:分析|风险|建议|排产).*(?:订单|库存|配方|物性|生产|采购|客户|供应商).*(?:订单|库存|配方|物性|生产|采购|客户|供应商)/;
const INDEPENDENT_PROJECT_SIGNAL_PATTERN = /(?:这个系统|这个项目|这个网站|后台|当前页面|库存|配方|订单|供应商|客户|人员|账号|账户|权限|物性|型号|批次|熔指|拉伸|弯曲|冲击|阻燃|灰份|灰分|强度|图谱|谱图|曲线|dsc|tga|抠图|识别历史|识别记录|数据识别|业务|经营|生产|采购|物料|成品|来料|样品)/i;

export type IntentGatewayInput = {
  prompt: unknown;
  activePageId?: string;
  projectAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
};

export type IntentGatewayClassifier = (input: {
  prompt: string;
  activePageId: string;
  signal: AbortSignal;
}) => Promise<AgentIntent | null>;

type IntentGatewayOptions = {
  classifier?: IntentGatewayClassifier | null;
  classifyTimeoutMs?: number;
};

const textOf = (value: unknown) => String(value || '').trim();

const chatIntent = (reason: string): AgentIntent => ({
  kind: 'chat',
  confidence: 0.98,
  reason,
});

const isObviousChat = (prompt: string) => (
  GREETING_PATTERN.test(prompt) || /^(?:随便聊聊|聊两句|闲聊一下|谢谢|感谢)[!！。?？]*$/i.test(prompt)
);

const isComplexProjectAnalysis = (prompt: string) => (
  COMPLEX_PROJECT_ANALYSIS_PATTERN.test(prompt) || CROSS_DOMAIN_ANALYSIS_PATTERN.test(prompt)
);

const requiresProjectAccess = (intent: AgentIntent) => (
  intent.kind === 'single_tool' || intent.kind === 'complex_agent' || intent.kind === 'image_analysis'
);

const isClassifierProjectUpgrade = (intent: AgentIntent) => (
  intent.kind === 'single_tool' || intent.kind === 'complex_agent'
);

const hasIndependentProjectSignal = (prompt: string) => (
  INDEPENDENT_PROJECT_SIGNAL_PATTERN.test(prompt)
  || PROPERTY_PAGE_CONTEXT_PATTERN.test(prompt)
  || PROPERTY_MODEL_PATTERN.test(prompt)
);

const toProjectToolIntent = (skill: NonNullable<ReturnType<typeof buildLocalSkillPlan>>): AgentIntent => ({
  kind: 'single_tool',
  confidence: Math.max(0, Math.min(1, Number(skill.confidence || 0.8))),
  reason: skill.reason || '确定性项目工具路由',
  toolId: skill.skillId,
  toolInput: skill.input,
});

export const classifyDeterministically = ({
  prompt,
  activePageId = '',
  projectAccessEnabled = true,
  webSearchEnabled = true,
}: IntentGatewayInput): AgentIntent => {
  const text = textOf(prompt);
  if (!text) return chatIntent('空消息按普通对话处理');

  if (IMAGE_GENERATION_PATTERN.test(text)) {
    return {
      kind: 'image_generation',
      confidence: 0.96,
      reason: '用户明确要求生成图片',
      toolId: 'media.generateImage',
      toolInput: { prompt: text },
    };
  }

  if (IMAGE_ANALYSIS_PATTERN.test(text)) {
    if (!projectAccessEnabled) return chatIntent('项目访问未启用，不能读取项目图片');
    return {
      kind: 'image_analysis',
      confidence: 0.9,
      reason: '用户明确要求分析图片或图谱',
      toolId: 'media.analyzeImages',
      toolInput: { question: text },
    };
  }

  if (isObviousChat(text)) return chatIntent('明确的日常问候或闲聊');

  const localSkill = buildLocalSkillPlan(text, activePageId);
  if (localSkill && projectAccessEnabled) return toProjectToolIntent(localSkill);

  const projectLike = PROJECT_DATA_PATTERN.test(text) || Boolean(localSkill);
  if (webSearchEnabled && shouldUseWebSearchForPrompt(text, { projectFirst: projectLike })) {
    return {
      kind: 'web_search',
      confidence: 0.92,
      reason: '用户明确要求外部或实时信息',
      searchPlan: {
        queries: [text],
        maxResults: 5,
        searchDepth: 'basic',
        topic: /(?:新闻|今日|今天|最新)/.test(text) ? 'news' : 'general',
      },
    };
  }

  if (projectAccessEnabled && isComplexProjectAnalysis(text)) {
    return {
      kind: 'complex_agent',
      confidence: 0.88,
      reason: '用户要求跨领域项目分析',
    };
  }

  return chatIntent('未命中确定性项目或联网意图');
};

const classifyWithinDeadline = async (
  classifier: IntentGatewayClassifier,
  prompt: string,
  activePageId: string,
  timeoutMs: number,
): Promise<AgentIntent | null> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      classifier({ prompt, activePageId, signal: controller.signal }),
      timeout,
    ]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

const parseClassifierIntent = (value: AgentIntent | null): AgentIntent | null => {
  const parsed = agentIntentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const createIntentGateway = ({
  classifier = null,
  classifyTimeoutMs = 12_000,
}: IntentGatewayOptions = {}) => ({
  route: async (input: IntentGatewayInput): Promise<AgentIntent> => {
    const deterministic = classifyDeterministically(input);
    const prompt = textOf(input.prompt);
    const activePageId = input.activePageId || '';
    const projectAccessEnabled = input.projectAccessEnabled ?? true;
    const webSearchEnabled = input.webSearchEnabled ?? true;

    if (!classifier || !prompt || isObviousChat(prompt)) return deterministic;

    if (deterministic.kind === 'web_search') {
      const classified = parseClassifierIntent(await classifyWithinDeadline(classifier, prompt, activePageId, classifyTimeoutMs));
      return classified?.searchPlan
        ? { ...deterministic, searchPlan: classified.searchPlan, reason: classified.reason || deterministic.reason }
        : deterministic;
    }

    if (deterministic.kind !== 'chat') return deterministic;

    const classified = parseClassifierIntent(await classifyWithinDeadline(classifier, prompt, activePageId, classifyTimeoutMs));
    if (!classified) return deterministic;
    if (classified.kind === 'web_search' && !webSearchEnabled) return deterministic;
    if (requiresProjectAccess(classified) && !projectAccessEnabled) return deterministic;
    if (isClassifierProjectUpgrade(classified) && !hasIndependentProjectSignal(prompt)) return deterministic;

    return classified;
  },
});
