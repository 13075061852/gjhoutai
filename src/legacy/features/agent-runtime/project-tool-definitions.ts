import { z } from 'zod';
import { mapImageGenerationParams } from './media';
import type {
  AgentToolDefinition,
  AgentToolResultV2,
} from './protocol';
import { createAgentToolRegistry } from './tool-registry';

export type ProjectToolAdapters = {
  searchWeb: (input: {
    queries: string[];
    maxResults: number;
    searchDepth: 'basic' | 'advanced';
    topic: 'general' | 'news';
  }, signal?: AbortSignal) => Promise<unknown>;
};

type ToolContext = Parameters<AgentToolDefinition['handler']>[1];
type PlainRecord = Record<string, unknown>;
type ProjectToolMetadata = {
  icon: string;
  examples: string[];
  level: '查询型' | '分析型' | '上下文型' | '执行型';
  module: string;
  summary: string;
};
type ProjectToolDefinition = AgentToolDefinition<PlainRecord, PlainRecord> & ProjectToolMetadata;

const emptyInput = z.object({}).passthrough();
const queryMode = z.enum(['query', 'selected', 'filtered']);
const spectrumMode = z.enum(['query', 'target', 'selected', 'filtered', 'active']);

const assistantGuideInput = z.object({
  question: z.string().optional(),
}).passthrough();
const openPageInput = z.object({
  pageId: z.string().min(1),
});
const manifestInput = z.object({
  includeFields: z.boolean().default(true),
}).passthrough();
const capabilitySearchInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(8),
}).passthrough();
const inspectPageInput = z.object({
  pageId: z.string().min(1),
});
const finalAnswerInput = z.object({
  question: z.string().min(1),
  observations: z.array(z.record(z.string(), z.unknown())).default([]),
}).passthrough();
const businessQueryInput = z.object({
  question: z.string().min(1),
  pageId: z.string().optional(),
  intent: z.enum(['count', 'list', 'filter', 'detail', 'aggregate', 'extrema']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).passthrough();
const businessOverviewInput = z.object({
  pageIds: z.array(z.string().min(1)).default([]),
  includeStatusGroups: z.boolean().default(true),
}).passthrough();
const propertyInput = z.object({
  query: z.string().default(''),
  question: z.string().optional(),
  mode: queryMode.default('query'),
}).passthrough();
const spectrumSearchInput = z.object({
  query: z.string().default(''),
  target: z.string().optional(),
  question: z.string().optional(),
  mode: spectrumMode.default('query'),
  limit: z.number().int().min(1).max(100).optional(),
}).passthrough();
const spectrumDeleteInput = z.object({
  target: z.string().default(''),
  mode: spectrumMode.default('target'),
  maxAffected: z.number().int().min(1).max(30).default(30),
}).passthrough();
const jointAnalysisInput = z.object({
  question: z.string().min(1),
  forceCurrentPage: z.boolean().default(false),
}).passthrough();
const formulaCreateInput = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  components: z.array(z.object({
    material: z.string().min(1),
    percentage: z.number().positive(),
  })).min(1),
});
const historySearchInput = z.object({
  query: z.string().default(''),
  limit: z.number().int().min(1).max(100).default(8),
}).passthrough();
const webSearchInput = z.object({
  queries: z.array(z.string().min(1)).min(1).max(3),
  maxResults: z.number().int().min(3).max(20).default(5),
  searchDepth: z.enum(['basic', 'advanced']).default('basic'),
  topic: z.enum(['general', 'news']).default('general'),
});
const imageGenerationInput = z.object({
  prompt: z.string().min(1),
  size: z.string().optional(),
  resolution: z.string().optional(),
  count: z.number().int().min(1).max(4).default(1),
  referenceUrls: z.array(z.string()).default([]),
}).passthrough();
const imageAnalysisInput = z.object({
  question: z.string().min(1),
}).passthrough();

const projectOutputSchemas: Record<string, z.ZodType<PlainRecord>> = {
  'assistant.modelInfo': z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    configured: z.boolean().optional(),
  }).passthrough(),
  'assistant.currentPage': z.object({
    pageId: z.string().optional(),
    title: z.string().optional(),
    eyebrow: z.string().optional(),
    desc: z.string().optional(),
  }).passthrough(),
  'assistant.projectGuide': z.object({
    systemName: z.string().optional(),
    pageId: z.string().optional(),
    title: z.string().optional(),
    eyebrow: z.string().optional(),
    desc: z.string().optional(),
    manifest: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  'assistant.openPage': z.object({
    pageId: z.string().optional(),
  }).passthrough(),
  'project.getManifest': z.object({
    systemName: z.string().optional(),
    pages: z.array(z.unknown()).optional(),
    relations: z.array(z.unknown()).optional(),
    skills: z.array(z.string()).optional(),
  }).passthrough(),
  'project.searchCapabilities': z.object({
    query: z.string().optional(),
    supported: z.boolean().optional(),
    pages: z.array(z.unknown()).optional(),
    tools: z.array(z.unknown()).optional(),
  }).passthrough(),
  'project.auditRuntime': z.object({
    coverage: z.record(z.string(), z.unknown()).optional(),
    issues: z.array(z.string()).optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  'project.inspectPage': z.object({
    pageId: z.string().optional(),
    title: z.string().optional(),
    entity: z.string().optional(),
    fields: z.array(z.unknown()).optional(),
    rowCount: z.number().optional(),
  }).passthrough(),
  'project.finalAnswerCheck': z.object({
    enough: z.boolean().optional(),
    observationCount: z.number().int().nonnegative().optional(),
  }).passthrough(),
  'business.queryPageData': z.object({
    pageId: z.string().optional(),
    intent: z.string().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    data: z.array(z.unknown()).optional(),
    summary: z.string().optional(),
  }).passthrough(),
  'business.analyzeOverview': z.object({
    totalRecords: z.number().int().nonnegative().optional(),
    pages: z.array(z.unknown()).optional(),
    statusGroups: z.record(z.string(), z.array(z.unknown())).optional(),
    generatedAt: z.string().optional(),
  }).passthrough(),
  'property.searchRows': z.object({
    context: z.string().optional(),
    displayTable: z.string().optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    fullContext: z.boolean().optional(),
    operation: z.literal('search').optional(),
  }).passthrough(),
  'property.summarizeMetrics': z.object({
    context: z.string().optional(),
    displayTable: z.string().optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    fullContext: z.boolean().optional(),
    operation: z.literal('summarize').optional(),
  }).passthrough(),
  'property.compareRows': z.object({
    context: z.string().optional(),
    displayTable: z.string().optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    fullContext: z.boolean().optional(),
    operation: z.literal('compare').optional(),
  }).passthrough(),
  'property.validateRanges': z.object({
    context: z.string().optional(),
    displayTable: z.string().optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    fullContext: z.boolean().optional(),
    operation: z.literal('validate').optional(),
  }).passthrough(),
  'spectrum.searchImages': z.object({
    action: z.literal('search').optional(),
    context: z.string().optional(),
    items: z.array(z.unknown()).optional(),
    images: z.array(z.unknown()).optional(),
    candidates: z.array(z.unknown()).optional(),
  }).passthrough(),
  'spectrum.deleteImages': z.object({
    action: z.literal('delete').optional(),
    deleted: z.number().int().nonnegative().optional(),
    items: z.array(z.unknown()).optional(),
    candidates: z.array(z.unknown()).optional(),
  }).passthrough(),
  'analysis.buildJointPackage': z.object({
    context: z.string().optional(),
    images: z.array(z.unknown()).optional(),
    imageCount: z.number().int().nonnegative().optional(),
  }).passthrough(),
  'formula.createRecipe': z.object({
    created: z.number().int().nonnegative().optional(),
    items: z.array(z.unknown()).optional(),
  }).passthrough(),
  'dataRecognition.searchHistory': z.object({
    items: z.array(z.unknown()).optional(),
    rowCount: z.number().int().nonnegative().optional(),
  }).passthrough(),
  'dataRecognition.inspectCurrent': z.object({
    fileName: z.string().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  'web.search': z.object({
    results: z.array(z.unknown()).optional(),
    context: z.string().optional(),
    plan: z.record(z.string(), z.unknown()).nullable().optional(),
  }).passthrough(),
  'media.generateImage': z.object({
    taskId: z.string().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  'media.analyzeImages': z.object({
    context: z.string().optional(),
    images: z.array(z.unknown()).optional(),
    imageCount: z.number().int().nonnegative().optional(),
  }).passthrough(),
};

const isRecord = (value: unknown): value is PlainRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const EVIDENCE_SECRET_KEY = /(?:api.?key|authorization|password|secret|token|credential)/i;
const EVIDENCE_IMAGE_KEY = /^(?:image|images|imageData|rawImage|rawImages|dataUrl|base64|blob|b64_json)$/i;
const RAW_IMAGE_VALUE = /^data:image\/[^;]+;base64,/i;

const sanitizeEvidenceValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') {
    return RAW_IMAGE_VALUE.test(value) ? '[raw image omitted]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEvidenceValue(item, seen));
  }
  if (!isRecord(value)) return value;
  if (seen.has(value)) return '[circular value omitted]';
  seen.add(value);

  const sanitized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !EVIDENCE_SECRET_KEY.test(key) && !EVIDENCE_IMAGE_KEY.test(key))
      .map(([key, item]) => [key, sanitizeEvidenceValue(item, seen)]),
  );
  seen.delete(value);
  return sanitized;
};

const buildEvidence = (toolId: string, data: PlainRecord): PlainRecord[] => {
  const sanitized = sanitizeEvidenceValue(data);
  return [{ toolId, data: isRecord(sanitized) ? sanitized : {} }];
};

const resultMessage = (value: unknown, fallback: string): string => {
  const text = normalizeText(value);
  return text || fallback;
};

const normalizeToolResult = (
  toolId: string,
  rawResult: unknown,
  fallbackMessage: string,
): AgentToolResultV2<PlainRecord> => {
  if (!isRecord(rawResult)) {
    return {
      status: 'error',
      message: '工具没有返回有效的结构化结果。',
      data: {},
      evidence: [],
      actions: [],
      diagnostics: {
        code: 'LEGACY_RESULT_INVALID',
        detail: 'The legacy capability returned a non-object result.',
      },
    };
  }

  const data = isRecord(rawResult.data)
    ? rawResult.data
    : Object.fromEntries(Object.entries(rawResult).filter(([key]) => ![
      'ok',
      'status',
      'message',
      'details',
      'evidence',
      'actions',
      'diagnostics',
    ].includes(key)));
  const status = rawResult.status === 'success'
    || rawResult.status === 'error'
    || rawResult.status === 'cancelled'
    || rawResult.status === 'timeout'
    ? rawResult.status
    : rawResult.ok === false
      ? 'error'
      : 'success';
  const actions = Array.isArray(rawResult.actions)
    ? rawResult.actions.filter(isRecord)
    : [];
  const evidence = status === 'success' ? buildEvidence(toolId, data) : [];

  return {
    status,
    message: resultMessage(rawResult.message, fallbackMessage),
    data,
    evidence,
    actions,
    ...(status === 'error'
      ? {
          diagnostics: {
            code: normalizeText((rawResult.diagnostics as PlainRecord | undefined)?.code)
              || 'LEGACY_CAPABILITY_ERROR',
            detail: 'The legacy capability reported an unsuccessful result.',
          },
        }
      : {}),
  };
};

const thrownToolResult = (): AgentToolResultV2<PlainRecord> => ({
  status: 'error',
  message: '工具执行失败。',
  data: {},
  evidence: [],
  actions: [],
  diagnostics: {
    code: 'LEGACY_HANDLER_ERROR',
    detail: 'The legacy capability handler threw an error. Sensitive error details were omitted.',
  },
});

const invokeMethod = async (
  owner: any,
  methodName: string,
  input: PlainRecord,
  context: ToolContext,
  unavailableMessage: string,
): Promise<unknown> => {
  const method = owner?.[methodName];
  if (typeof method !== 'function') {
    return { ok: false, message: unavailableMessage };
  }
  if (context.signal?.aborted) {
    return {
      status: 'cancelled',
      message: '操作已取消。',
      data: {},
      evidence: [],
      actions: [],
    };
  }
  return method.call(owner, input, {
    idempotencyKey: context.idempotencyKey,
    runId: context.runId,
    signal: context.signal,
    stepId: context.stepId,
  });
};

const forceAction = (result: unknown, action: 'search' | 'delete'): unknown => {
  if (!isRecord(result)) return result;
  return {
    ...result,
    data: {
      ...(isRecord(result.data) ? result.data : {}),
      action,
    },
  };
};

const readPageId = (App: any): string => {
  try {
    return globalThis.localStorage?.getItem(App?.constants?.NAV_PAGE_KEY || 'sidebar-active-page')
      || 'dashboard';
  } catch {
    return 'dashboard';
  }
};

const capabilitySearchTerms = (value: unknown): string[] => {
  const raw = normalizeText(value).toLowerCase();
  const cleaned = raw
    .replace(/(?:请问|帮我|一下|查询|搜索|查找|寻找|能力|功能|技能|支持|有没有|是否|能不能|可以|如何|怎么)/g, ' ')
    .trim();
  const terms = cleaned.split(/[\s,，、/]+/).filter(Boolean);
  return terms.length ? terms : (raw ? [raw] : []);
};

const capabilityScore = (value: unknown, terms: string[]): number => {
  const text = normalizeText(value).toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? Math.max(1, term.length) : 0), 0);
};

const createDefinition = ({
  id,
  title,
  description,
  category,
  riskLevel = 'read',
  inputSchema,
  outputSchema,
  timeoutMs,
  maxRetries,
  idempotent,
  supportsAbort = true,
  icon,
  examples,
  level,
  handler,
}: {
  id: string;
  title: string;
  description: string;
  category: string;
  riskLevel?: AgentToolDefinition['riskLevel'];
  inputSchema: z.ZodType<PlainRecord>;
  outputSchema?: z.ZodType<PlainRecord>;
  timeoutMs?: number;
  maxRetries?: number;
  idempotent?: boolean;
  supportsAbort?: boolean;
  icon: string;
  examples: string[];
  level: ProjectToolMetadata['level'];
  handler: (input: PlainRecord, context: ToolContext) => Promise<unknown> | unknown;
}): ProjectToolDefinition => ({
  id,
  version: 2,
  title,
  description,
  category,
  riskLevel,
  inputSchema,
  outputSchema: outputSchema ?? projectOutputSchemas[id],
  timeoutMs: timeoutMs ?? (riskLevel === 'read' ? 15_000 : 30_000),
  maxRetries: maxRetries ?? (riskLevel === 'read' ? 1 : 0),
  idempotent: idempotent ?? riskLevel === 'read',
  supportsAbort,
  module: category,
  icon,
  level,
  summary: description,
  examples,
  async handler(input, context) {
    try {
      const rawResult = await handler(input, context);
      return normalizeToolResult(id, rawResult, `${title}已完成。`);
    } catch {
      return thrownToolResult();
    }
  },
});

const propertyHandler = (
  App: any,
  operation: 'search' | 'summarize' | 'compare' | 'validate',
) => async (input: PlainRecord): Promise<unknown> => {
  const context = App?.propertyAnalysis?.getAgentContext?.(
    input.query || input.question || '',
    {
      activePageId: 'property-analysis',
      compact: true,
      filteredOnly: input.mode === 'filtered',
      fullCurrentTable: input.mode === 'filtered' && operation !== 'search',
      mode: input.mode || '',
      operation,
      selectedOnly: input.mode === 'selected',
    },
  );
  if (!context?.content) {
    return { ok: false, message: '物性分析数据尚未加载，暂时无法分析。' };
  }
  const actionLabel = operation === 'compare'
    ? '对比'
    : operation === 'summarize'
      ? '统计'
      : operation === 'validate'
        ? '检测范围判定'
        : '检索';
  return {
    ok: true,
    message: `已完成物性数据${actionLabel}。`,
    data: {
      context: context.content,
      displayTable: context.displayTable || '',
      fullContext: Boolean(context.fullContext),
      operation,
      stats: context.stats || {},
    },
  };
};

export const createProjectToolDefinitions = (
  App: any,
  adapters: ProjectToolAdapters,
): AgentToolDefinition[] => {
  if (!adapters || typeof adapters.searchWeb !== 'function') {
    throw new TypeError('createProjectToolDefinitions requires a searchWeb adapter.');
  }

  const definitions: ProjectToolDefinition[] = [
    createDefinition({
      id: 'assistant.modelInfo',
      title: '读取当前模型信息',
      description: '读取本次会话配置的模型提供商和模型标识，不返回 API Key。',
      category: 'AI 配置',
      inputSchema: emptyInput,
      icon: 'ti-brain',
      level: '查询型',
      examples: ['你是什么模型'],
      async handler() {
        const config = App?.config?.getFormConfig?.() || {};
        const provider = normalizeText(config.aiProvider || '未配置');
        const model = normalizeText(App?.config?.getResolvedModel?.() || config.model || config.modelChoice || '未选择');
        return {
          ok: true,
          message: '已读取当前会话的模型配置。',
          data: {
            provider,
            model,
            configured: provider === 'lmstudio' || Boolean(config.apiKey),
          },
        };
      },
    }),
    createDefinition({
      id: 'assistant.currentPage',
      title: '读取当前页面',
      description: '读取当前导航状态和页面说明。',
      category: '导航',
      inputSchema: emptyInput,
      icon: 'ti-current-location',
      level: '查询型',
      examples: ['当前是什么页面'],
      async handler() {
        const pageId = readPageId(App);
        const definition = App?.constants?.PAGE_DEFS?.[pageId] || {};
        return {
          ok: true,
          message: `你当前处于「${definition.title || pageId}」页面。`,
          data: {
            pageId,
            title: normalizeText(definition.title || pageId),
            eyebrow: normalizeText(definition.eyebrow),
            desc: normalizeText(definition.desc),
          },
        };
      },
    }),
    createDefinition({
      id: 'assistant.projectGuide',
      title: '读取项目说明',
      description: '读取项目、当前页面和已注册能力说明。',
      category: '项目管家',
      inputSchema: assistantGuideInput,
      icon: 'ti-info-circle',
      level: '查询型',
      examples: ['这个后台能做什么'],
      async handler() {
        const pageId = readPageId(App);
        const definition = App?.constants?.PAGE_DEFS?.[pageId] || {};
        const manifest = App?.projectSkills?.getProjectManifest?.()
          || App?.agentButler?.getProjectManifest?.()
          || {};
        return {
          ok: true,
          message: '已读取项目、当前页面和可用能力信息。',
          data: {
            systemName: '广俊塑料科技后台管理系统',
            pageId,
            title: normalizeText(definition.title || pageId),
            eyebrow: normalizeText(definition.eyebrow),
            desc: normalizeText(definition.desc),
            manifest,
          },
        };
      },
    }),
    createDefinition({
      id: 'assistant.openPage',
      title: '切换项目页面',
      description: '切换到系统内已注册页面。',
      category: '导航',
      inputSchema: openPageInput,
      icon: 'ti-route',
      level: '执行型',
      examples: ['打开客户档案'],
      async handler(input) {
        const pageId = normalizeText(input.pageId);
        const definition = App?.constants?.PAGE_DEFS?.[pageId];
        if (!definition) return { ok: false, message: `没有找到页面：${pageId}` };
        App?.navigation?.showPage?.(pageId);
        return {
          ok: true,
          message: `已切换到「${definition.title || pageId}」。`,
          data: { pageId },
        };
      },
    }),
    createDefinition({
      id: 'project.getManifest',
      title: '读取项目能力地图',
      description: '返回系统页面、字段、工具和跨页面关系。',
      category: '项目管家',
      inputSchema: manifestInput,
      icon: 'ti-map',
      level: '查询型',
      examples: ['读取项目能力地图'],
      async handler() {
        const manifest = App?.projectSkills?.getProjectManifest?.()
          || App?.agentButler?.getProjectManifest?.();
        if (!manifest) return { ok: false, message: '项目能力地图尚未初始化。' };
        return {
          ok: true,
          message: '已读取项目能力地图。',
          data: manifest,
        };
      },
    }),
    createDefinition({
      id: 'project.searchCapabilities',
      title: '搜索项目能力',
      description: '从真实页面清单和 V2 工具注册表查找项目能力。',
      category: '项目管家',
      inputSchema: capabilitySearchInput,
      icon: 'ti-sparkles',
      level: '查询型',
      examples: ['查找库存查询能力'],
      async handler(input) {
        const query = normalizeText(input.query);
        const limit = Number(input.limit || 8);
        const terms = capabilitySearchTerms(query);
        const pages = Object.entries(App?.constants?.PAGE_DEFS || {})
          .map(([pageId, definition]: [string, any]) => ({
            pageId,
            title: normalizeText(definition?.title || pageId),
            desc: normalizeText(definition?.desc),
            score: capabilityScore(`${pageId} ${definition?.title || ''} ${definition?.desc || ''}`, terms),
          }))
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, limit)
          .map(({ score, ...item }) => item);
        const tools = (App?.projectSkills?.getToolRegistry?.().list?.() || [])
          .map((tool: any) => ({
            id: normalizeText(tool?.id),
            title: normalizeText(tool?.title),
            category: normalizeText(tool?.category),
            description: normalizeText(tool?.description),
            score: capabilityScore(`${tool?.id || ''} ${tool?.title || ''} ${tool?.category || ''} ${tool?.description || ''}`, terms),
          }))
          .filter((item: any) => item.id && item.score > 0)
          .sort((left: any, right: any) => right.score - left.score)
          .slice(0, limit)
          .map(({ score, ...item }: any) => item);
        const supported = Boolean(pages.length || tools.length);
        return {
          ok: true,
          message: supported
            ? `找到 ${pages.length} 个相关页面和 ${tools.length} 项相关工具。`
            : '当前项目没有找到匹配的已注册能力。',
          data: { query, supported, pages, tools },
        };
      },
    }),
    createDefinition({
      id: 'project.auditRuntime',
      title: '审计 Agent 运行能力',
      description: '检查页面、结构化数据、V2 工具和 AI 配置完整性。',
      category: '项目管家',
      inputSchema: emptyInput,
      icon: 'ti-shield-check',
      level: '分析型',
      examples: ['检查 Agent 能力是否完整'],
      async handler() {
        const pageEntries = Object.entries(App?.constants?.PAGE_DEFS || {});
        const structuredPages = App?.businessPages?.getAgentManifestPages?.() || [];
        const tools = App?.projectSkills?.getToolRegistry?.().list?.() || [];
        const issues: string[] = [];
        tools.forEach((tool: any) => {
          if (!normalizeText(tool?.id)) issues.push('存在缺少 id 的工具');
          if (typeof tool?.handler !== 'function') issues.push(`工具 ${normalizeText(tool?.id)} 缺少处理器`);
          if (!tool?.inputSchema || !tool?.outputSchema) issues.push(`工具 ${normalizeText(tool?.id)} 缺少输入或输出 Schema`);
        });
        const config = App?.config?.getFormConfig?.() || {};
        const configured = config.aiProvider === 'lmstudio' || Boolean(config.apiKey);
        if (!configured) issues.push('AI 模型尚未配置 API Key，且未使用 LM Studio。');
        return {
          ok: true,
          message: issues.length
            ? `Agent 运行审计完成，发现 ${issues.length} 项需要处理。`
            : 'Agent 运行审计完成，当前未发现注册层异常。',
          data: {
            coverage: {
              totalPages: pageEntries.length,
              structuredPages: structuredPages.length,
              pageCoveragePercent: pageEntries.length
                ? Math.round((structuredPages.length / pageEntries.length) * 100)
                : 0,
              totalTools: tools.length,
              executableTools: tools.filter((tool: any) => typeof tool?.handler === 'function').length,
            },
            issues,
            configuration: {
              provider: normalizeText(config.aiProvider || '未配置'),
              model: normalizeText(config.model || config.modelId || '未选择'),
              configured,
            },
          },
        };
      },
    }),
    createDefinition({
      id: 'project.inspectPage',
      title: '查看页面数据结构',
      description: '返回指定页面的数据实体、字段、记录数和字段样例。',
      category: '项目管家',
      inputSchema: inspectPageInput,
      icon: 'ti-schema',
      level: '查询型',
      examples: ['查看库存管理的数据结构'],
      async handler(input) {
        const pageId = normalizeText(input.pageId);
        const inspected = App?.businessPages?.inspectAgentPage?.(pageId);
        if (inspected) {
          return {
            ok: true,
            message: inspected.summary || `已读取 ${pageId} 页面结构。`,
            data: inspected,
          };
        }
        const definition = App?.constants?.PAGE_DEFS?.[pageId];
        if (!definition) return { ok: false, message: `没有找到页面：${pageId}` };
        return {
          ok: true,
          message: `页面 ${definition.title || pageId} 暂无结构化数据接口。`,
          data: {
            pageId,
            title: definition.title || pageId,
            desc: definition.desc || '',
            fields: [],
            rowCount: 0,
          },
        };
      },
    }),
    createDefinition({
      id: 'project.finalAnswerCheck',
      title: '复盘答案充分性',
      description: '检查已取 Observation 是否足够生成最终答案。',
      category: '项目管家',
      inputSchema: finalAnswerInput,
      icon: 'ti-checkup-list',
      level: '上下文型',
      examples: ['复盘当前取数是否充分'],
      async handler(input) {
        const observations = Array.isArray(input.observations) ? input.observations : [];
        return {
          ok: true,
          message: observations.length
            ? '已有 Observation，可由 Agent Planner 判断是否输出最终答案。'
            : '尚无 Observation，通常需要先读取项目能力地图或页面数据。',
          data: {
            enough: observations.some((item: any) => item?.rowCount || item?.data),
            observationCount: observations.length,
          },
        };
      },
    }),
    createDefinition({
      id: 'business.queryPageData',
      title: '查询业务页面数据',
      description: '按页面、意图、筛选、排序和字段查询裁剪后的业务数据。',
      category: '业务数据',
      inputSchema: businessQueryInput,
      icon: 'ti-table-search',
      level: '查询型',
      examples: ['查询库存最低的成品商品'],
      async handler(input) {
        if (!App?.businessPages?.queryAgentData) {
          return { ok: false, message: '业务页面尚未接入结构化取数接口。' };
        }
        const data = await App.businessPages.queryAgentData(input);
        return {
          ok: data?.ok !== false,
          message: data?.summary || '业务页面数据已返回。',
          data: isRecord(data) ? data : {},
        };
      },
    }),
    createDefinition({
      id: 'business.analyzeOverview',
      title: '分析全局业务总览',
      description: '跨已接入业务页面生成记录数和状态分布快照。',
      category: '业务数据',
      inputSchema: businessOverviewInput,
      icon: 'ti-chart-dots-3',
      level: '分析型',
      examples: ['分析整个后台的业务情况'],
      async handler(input) {
        if (!App?.businessPages?.getAgentManifestPages || !App?.businessPages?.queryAgentData) {
          return { ok: false, message: '业务页面尚未完整接入 Agent 结构化查询接口。' };
        }
        const requestedPageIds = Array.isArray(input.pageIds)
          ? input.pageIds.map(normalizeText).filter(Boolean)
          : [];
        const manifestPages = (App.businessPages.getAgentManifestPages() || [])
          .filter((page: any) => !requestedPageIds.length || requestedPageIds.includes(page.pageId));
        const pages = await Promise.all(manifestPages.map(async (page: any) => {
          const result = await App.businessPages.queryAgentData({ pageId: page.pageId, intent: 'count' });
          return {
            pageId: page.pageId,
            title: page.title || page.pageId,
            ok: result?.ok !== false,
            rowCount: Number(result?.rowCount ?? page.rowCount ?? 0),
            summary: normalizeText(result?.summary),
          };
        }));
        const statusGroups: Record<string, unknown[]> = {};
        if (input.includeStatusGroups !== false) {
          await Promise.all(manifestPages.map(async (page: any) => {
            const result = await App.businessPages.queryAgentData({
              pageId: page.pageId,
              intent: 'aggregate',
              groupBy: 'status',
            });
            if (result?.ok !== false && Array.isArray(result?.data) && result.data.length) {
              statusGroups[page.pageId] = result.data;
            }
          }));
        }
        const totalRecords = pages.reduce((total, page) => total + page.rowCount, 0);
        return {
          ok: true,
          message: `已读取 ${pages.length} 个业务页面，共 ${totalRecords} 条结构化记录。`,
          data: { totalRecords, pages, statusGroups, generatedAt: new Date().toISOString() },
        };
      },
    }),
    createDefinition({
      id: 'property.searchRows',
      title: '检索物性数据',
      description: '按分类工作表、型号、批次或指标关键词检索物性数据。',
      category: '物性分析',
      inputSchema: propertyInput,
      icon: 'ti-search',
      level: '查询型',
      examples: ['检索物性型号 320G6-N11'],
      handler: propertyHandler(App, 'search'),
    }),
    createDefinition({
      id: 'property.summarizeMetrics',
      title: '统计物性指标',
      description: '统计指定范围的样本数、均值、极值和波动。',
      category: '物性分析',
      inputSchema: propertyInput,
      icon: 'ti-chart-bar',
      level: '分析型',
      examples: ['统计当前筛选结果的物性指标'],
      handler: propertyHandler(App, 'summarize'),
    }),
    createDefinition({
      id: 'property.compareRows',
      title: '对比物性型号与批次',
      description: '对比多个型号或批次的共同指标和差异。',
      category: '物性分析',
      inputSchema: propertyInput,
      icon: 'ti-arrows-diff',
      level: '分析型',
      examples: ['对比两个型号的物性数据'],
      handler: propertyHandler(App, 'compare'),
    }),
    createDefinition({
      id: 'property.validateRanges',
      title: '判定物性检测范围',
      description: '按检验范围判定指标通过、异常或缺少范围。',
      category: '物性分析',
      inputSchema: propertyInput,
      icon: 'ti-shield-check',
      level: '分析型',
      examples: ['判断当前批次是否合格'],
      handler: propertyHandler(App, 'validate'),
    }),
    createDefinition({
      id: 'spectrum.searchImages',
      title: '检索图谱图片',
      description: '检索图谱记录并返回可用于视觉分析的图片。',
      category: '图谱分析',
      inputSchema: spectrumSearchInput,
      icon: 'ti-photo-search',
      level: '查询型',
      examples: ['查找 320G6 的 DSC 图谱'],
      async handler(input, context) {
        const result = await invokeMethod(
          App?.spectrumAnalysis,
          'searchByAgent',
          { ...input, action: 'search' },
          context,
          '图谱分析模块尚未暴露检索技能接口。',
        );
        return forceAction(result, 'search');
      },
    }),
    createDefinition({
      id: 'spectrum.deleteImages',
      title: '删除图谱图片',
      description: '按目标或当前选择范围删除图谱记录。',
      category: '图谱分析',
      riskLevel: 'delete',
      inputSchema: spectrumDeleteInput,
      icon: 'ti-trash',
      level: '执行型',
      examples: ['删除当前已选图谱'],
      async handler(input, context) {
        const result = await invokeMethod(
          App?.spectrumAnalysis,
          'deleteByAgent',
          { ...input, action: 'delete' },
          context,
          '图谱分析模块尚未暴露删除技能接口。',
        );
        return forceAction(result, 'delete');
      },
    }),
    createDefinition({
      id: 'analysis.buildJointPackage',
      title: '生成联合分析包',
      description: '整理跨模块上下文和图片，生成统一分析包。',
      category: '综合分析',
      inputSchema: jointAnalysisInput,
      icon: 'ti-binary-tree-2',
      level: '上下文型',
      examples: ['生成物性和图谱联合分析包'],
      async handler(input) {
        const activePageId = readPageId(App);
        const options = {
          question: normalizeText(input.question),
          activePageId,
          forceCurrentPage: Boolean(input.forceCurrentPage),
        };
        const context = App?.agentButler?.buildContext?.(options) || '';
        const images = App?.agentButler?.getImages?.(options) || [];
        if (!context) return { ok: false, message: '当前没有可整理的分析上下文。' };
        return {
          ok: true,
          message: '联合分析包已生成，可继续交给 AI 进行综合判断。',
          data: { context, images, imageCount: images.length },
        };
      },
    }),
    createDefinition({
      id: 'formula.createRecipe',
      title: '创建新配方记录',
      description: '根据名称和组分在配方管理中创建真实配方记录。',
      category: '配方管理',
      riskLevel: 'create',
      inputSchema: formulaCreateInput,
      icon: 'ti-flask-2',
      level: '执行型',
      examples: ['创建一个阻燃配方'],
      async handler(input, context) {
        return invokeMethod(
          App?.businessPages,
          'createFormulaByAgent',
          input,
          context,
          '配方管理模块尚未暴露创建配方技能接口。',
        );
      },
    }),
    createDefinition({
      id: 'dataRecognition.searchHistory',
      title: '查询识别历史',
      description: '按文件名、型号、批次或模型查询数据识别历史。',
      category: '数据识别',
      inputSchema: historySearchInput,
      icon: 'ti-history',
      level: '查询型',
      examples: ['查询 320G6 的识别历史'],
      async handler(input, context) {
        return invokeMethod(
          App?.dataRecognition,
          'searchHistoryByAgent',
          input,
          context,
          '数据识别模块尚未暴露历史查询接口。',
        );
      },
    }),
    createDefinition({
      id: 'dataRecognition.inspectCurrent',
      title: '查看当前识别结果',
      description: '读取当前数据识别页的结构化结果。',
      category: '数据识别',
      inputSchema: emptyInput,
      icon: 'ti-table',
      level: '查询型',
      examples: ['查看当前识别结果'],
      async handler(input, context) {
        return invokeMethod(
          App?.dataRecognition,
          'inspectCurrentByAgent',
          input,
          context,
          '数据识别模块尚未暴露当前结果接口。',
        );
      },
    }),
    createDefinition({
      id: 'web.search',
      title: '联网搜索',
      description: '通过显式注入的搜索适配器获取实时网页资料。',
      category: '联网能力',
      inputSchema: webSearchInput,
      timeoutMs: 30_000,
      icon: 'ti-world-search',
      level: '查询型',
      examples: ['联网搜索最新官方资料'],
      async handler(input, context) {
        const result = await adapters.searchWeb(input as {
          queries: string[];
          maxResults: number;
          searchDepth: 'basic' | 'advanced';
          topic: 'general' | 'news';
        }, context.signal);
        return isRecord(result)
          ? { ok: true, message: '联网搜索已完成。', data: result }
          : result;
      },
    }),
    createDefinition({
      id: 'media.generateImage',
      title: '生成图片',
      description: '提交图片生成任务并返回任务标识。',
      category: '媒体生成',
      riskLevel: 'create',
      inputSchema: imageGenerationInput,
      timeoutMs: 60_000,
      icon: 'ti-photo-spark',
      level: '执行型',
      examples: ['生成一张产品海报'],
      async handler(input, context) {
        const params = mapImageGenerationParams(input);
        if (!params.prompt) return { ok: false, message: '请先提供图片生成提示词。' };
        const result = await invokeMethod(
          App?.apimartMedia,
          'generateImage',
          params,
          context,
          'AI 绘图模块尚未初始化。',
        );
        if (isRecord(result) && result.ok === false) return result;
        return {
          ok: true,
          message: `图片生成任务已提交：${(result as any)?.taskId || '-'}`,
          data: { taskId: (result as any)?.taskId || '', params },
        };
      },
    }),
    createDefinition({
      id: 'media.analyzeImages',
      title: '分析图片',
      description: '整理当前图片和上下文供视觉模型分析。',
      category: '媒体理解',
      inputSchema: imageAnalysisInput,
      icon: 'ti-photo-search',
      level: '上下文型',
      examples: ['分析当前选中的图谱'],
      async handler(input) {
        const question = normalizeText(input.question);
        const activePageId = readPageId(App);
        const options = { question, activePageId, forceCurrentPage: true };
        const context = App?.agentButler?.buildContext?.(options) || '';
        const images = App?.agentButler?.getImages?.(options) || [];
        return {
          ok: Boolean(context || images.length),
          message: images.length
            ? `已整理 ${images.length} 张可分析图片。`
            : '当前没有找到可上传给视觉模型的图片。',
          data: { context, images, imageCount: images.length },
        };
      },
    }),
  ];

  return definitions;
};

export const createProjectToolRegistry = (
  App: any,
  adapters: ProjectToolAdapters,
) => createAgentToolRegistry(createProjectToolDefinitions(App, adapters));
