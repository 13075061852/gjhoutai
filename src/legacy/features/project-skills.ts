import { getLegacyApp } from '../core/app-context';
import '../../styles/pages/project-skills.css';
import { createAgentExecutionEngine } from './agent-runtime/execution-engine';
import { createProjectToolRegistry } from './agent-runtime/project-tool-definitions';
import { createLocalStorageAgentRunStore } from './agent-runtime/run-store';
import { createProjectToolAdapters, createRuntimeSkillDefinitions } from './agent-runtime/tools';
import { buildSkillCatalogSummary, getSkillSearchText } from './agent-runtime/skill-catalog';
import { normalizeAgentToolResult } from './agent-runtime/grounding';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const { refs, constants, utils } = App;
  const HISTORY_KEY = 'gjh-project-skill-history-v1';
  const MAX_HISTORY = 18;
  let eventController = null;
  let toolRegistry = null;
  let executionEngine = null;

  const EXTRA_PAGE_ALIASES = {
    配置中心: 'ai-config',
    ai配置: 'ai-config',
    AI配置: 'ai-config',
    物性分析: 'property-analysis',
    物性: 'property-analysis',
    图谱分析: 'spectrum-analysis',
    图谱: 'spectrum-analysis',
    谱图: 'spectrum-analysis',
    抠图助手: 'image-cutout',
    抠图: 'image-cutout',
    AI技能面板: 'project-skills',
    技能面板: 'project-skills',
    技能: 'project-skills',
    AI调用分析面板: 'ai-call-analysis',
    AI调用分析: 'ai-call-analysis',
    调用分析: 'ai-call-analysis',
    费用分析: 'ai-call-analysis',
    主题设置: 'theme-settings',
    主题: 'theme-settings',
    仪表盘: 'dashboard',
    首页: 'dashboard',
    订单管理: 'order-management',
    订单: 'order-management',
    开单打印: 'invoice-print',
    开单: 'invoice-print',
    库存管理: 'inventory-management',
    库存: 'inventory-management',
    原材料库存: 'inventory-management',
    成品库存: 'inventory-management',
    配方管理: 'formula-management',
    配方: 'formula-management',
    生产计划: 'production-plan',
    生产: 'production-plan',
    供应商档案: 'supplier-archive',
    供应商: 'supplier-archive',
    客户档案: 'customer-archive',
    客户: 'customer-archive',
    人员档案: 'personnel-archive',
    人员: 'personnel-archive',
    权限管理: 'permission-management',
    权限: 'permission-management',
    日志: 'ai-call-analysis',
  };

  const nowText = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const esc = (value) => utils.escapeHtml(value);
  const normalizeText = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const readHistory = () => {
    const stored = utils.readJson(HISTORY_KEY, []);
    return Array.isArray(stored) ? stored : [];
  };
  const writeHistory = (items) => utils.writeJson(HISTORY_KEY, items.slice(0, MAX_HISTORY));
  const measureJsonSize = (value) => {
    try {
      return new Blob([JSON.stringify(value ?? null)]).size;
    } catch {
      return String(value ?? '').length;
    }
  };
  const formatBytes = (value) => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  };
  const nowMs = () => window.performance?.now?.() ?? Date.now();

  const getActivePageId = () => {
    try {
      return localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    } catch {
      return 'ai-config';
    }
  };

  const stripCommandNoise = (value) => String(value || '')
    .replace(/^(请|帮我|麻烦|能不能|可以)\s*/, '')
    .replace(/(一下|吧|呢|吗|啊|呀|谢谢|请处理|帮忙处理)[？?。！!]*$/g, '')
    .trim();

  const extractQuotedText = (text) => {
    const match = String(text || '').match(/[「“"']([^「」“”"']{1,80})[」”"']/);
    return match ? match[1].trim() : '';
  };

  const extractDeleteTarget = (prompt) => {
    const quoted = extractQuotedText(prompt);
    if (quoted) return quoted;

    const text = stripCommandNoise(prompt)
      .replace(/^.*?(删除|移除|删掉|清理)/, '')
      .replace(/(图谱分析|图谱库|页面|上面|上|里面|里|中的|的|这张|那张|某张|图片|图像|图谱|谱图|名为|名称为|叫做|编号为|id为|：|:)/g, ' ')
      .replace(/[，。,.!?！？]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/^(当前|选中|已选|当前已选|当前选中|已选中|全部|所有)$/.test(text)) return '';
    return text;
  };

  const normalizeTagList = (value) => String(value || '')
    .split(/[，,、/\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag && !/^(标签|图谱|谱图|图片|的|为|成|上)$/.test(tag));

  const extractTagUpdateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const tagMatch = text.match(/(?:加上|加|添加|增加上|增加|打上|写入|标记为|设为|设置为)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})\s*(?:的)?标签/)
      || text.match(/([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})\s*标签/);
    const tags = normalizeTagList(tagMatch?.[1] || '');
    if (!tags.length) return null;

    const selected = /(?:当前已选|当前选中|已选|选中)/.test(text);
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|当前分类)/.test(text);
    const quoted = extractQuotedText(text);
    const targetSource = stripCommandNoise(text).replace(/^(给|把|为)\s*/, '');
    const targetMatch = targetSource.match(/(?:所有|全部)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{2,60})\s*(?:的)?(?:图谱|谱图|图片)/);
    const target = selected || filtered
      ? ''
      : (quoted || targetMatch?.[1] || '')
        .replace(/^(所有|全部|当前|这些|那些)/, '')
        .replace(/(的|上|中|里)$/g, '')
        .trim();

    return {
      tags,
      target,
      mode: selected ? 'selected' : filtered ? 'filtered' : 'query',
    };
  };

  const extractCategoryUpdateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const categoryMatch = text.match(/(?:新分类|分类|归类|整理到|放到|分到|归到)(?:叫|为|到|成|：|:)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})/)
      || text.match(/(?:叫|命名为)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})/);
    const category = String(categoryMatch?.[1] || '')
      .replace(/^(新分类|分类|改成|改为|修改为|设置为|设为|叫做|叫|为|成|到)/, '')
      .trim();
    if (!category) return null;

    const selected = /(?:当前已选|当前选中|已选|选中)/.test(text);
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|当前分类)/.test(text);
    const quoted = extractQuotedText(text);
    const beforeCategory = text.split(categoryMatch?.[0] || '')[0] || text;
    const targetMatch = beforeCategory.match(/(?:把|将|给)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,24})(?:的|相关|产品|图谱|谱图|图片|数据|都|全部|整理|归类|放到|分到)/);
    const target = selected || filtered
      ? ''
      : (quoted || targetMatch?.[1] || beforeCategory)
        .replace(/^(把|将|给|帮我|请|麻烦|可以|能不能)/, '')
        .replace(/(的|相关|产品|图谱|谱图|图片|数据|全部|都|整理出来|整理|归类|放到|分到|做一个|创建|新建|新增|一个|新)$/g, '')
        .replace(/[，。,.!?！？]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
      target,
      category,
      mode: selected ? 'selected' : filtered ? 'filtered' : 'query',
    };
  };

  const extractSpectrumCreateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const title = extractQuotedText(text)
      || text.match(/(?:新增|创建|新建|添加)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{2,80})\s*(?:图谱|谱图|记录|数据)?/)?.[1]
      || '';
    const category = text.match(/(?:分类|归类|放到|分到)(?:为|到|成|：|:)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})/)?.[1] || '';
    const type = text.match(/\b(DSC|TGA)\b/i)?.[1] || '';
    const tags = normalizeTagList(text.match(/(?:标签|tag)(?:为|是|：|:)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/，,、 -]{1,80})/)?.[1] || '');
    if (!title) return null;
    return { title, category, type, tags };
  };

  const extractFormulaCreateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const simpleFormula = text.match(/(?:做|来|搞|弄|配|设计|生成|出)\s*(?:一个|一份|条|个)?\s*(PC\/ABS|ABS|PBT|PET|PA|PP|[A-Za-z0-9._/-]{2,40})?\s*(?:对标|改进|试产|实验)?\s*配方/i);
    const name = extractQuotedText(text)
      || text.match(/(?:新增|创建|新建|添加)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{2,80})\s*(?:配方|配方记录|记录)?/)?.[1]
      || text.match(/配方(?:名称|名)?(?:是|为|叫|：|:)\s*([^，。；;!?！？]{1,80})/)?.[1]
      || (simpleFormula?.[1] ? `${simpleFormula[1].toUpperCase()} 配方` : '')
      || '';
    const code = text.match(/(?:编号|配方编号|code)(?:是|为|：|:)?\s*([A-Za-z0-9._/-]{2,40})/i)?.[1]
      || text.match(/\b([A-Z0-9]{2,}(?:-[A-Z0-9]+){1,5})\b/i)?.[1]
      || '';
    const product = text.match(/(?:产品|型号|产品型号)(?:是|为|：|:)?\s*([A-Za-z0-9._/-]{2,50})/i)?.[1]
      || simpleFormula?.[1]?.toUpperCase()
      || '';
    const category = text.match(/(?:分类|材质|类别)(?:是|为|：|:)?\s*(PC\/ABS|ABS|PP|PBT|PA|PET|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,30})/i)?.[1] || '';
    const line = text.match(/([AB])\s*线/i)?.[1]?.toUpperCase() || '';
    const owner = text.match(/(?:负责人|工程师|owner)(?:是|为|：|:)?\s*([\u4e00-\u9fa5A-Za-z0-9._/-]{1,30})/)?.[1] || '';
    const target = text.match(/(?:目标|说明|备注|用途)(?:是|为|：|:)?\s*([^。；;!?！？]{1,120})/)?.[1] || '';
    const checksText = text.match(/(?:验证|测试|检测|计划)(?:是|为|：|:)?\s*([^。；;!?！？]{1,120})/)?.[1] || '';
    const checks = checksText
      ? checksText.split(/[，,、/]+/).map((item) => item.trim()).filter(Boolean)
      : [];
    if (!name && !code && !product) return null;
    return { name, code, product, category, line, owner, target, checks };
  };

  const extractSpectrumUpdateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const selected = /(?:当前已选|当前选中|已选|选中)/.test(text);
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|当前分类)/.test(text);
    const updates: any = {};
    const category = text.match(/(?:分类|归类|放到|分到|改到|改成|改为)(?:为|到|成|：|:)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{1,40})/)?.[1] || '';
    const note = text.match(/(?:备注|说明)(?:为|改为|写成|：|:)\s*([^，。,.!?！？]{1,120})/)?.[1] || '';
    const title = text.match(/(?:名称|标题)(?:为|改为|写成|：|:)\s*([^，。,.!?！？]{1,80})/)?.[1] || '';
    const tagsAdd = /(?:标签|打标|标记)/.test(text) ? normalizeTagList(text.match(/(?:加上|添加|增加|打上|写入|标记为|设为|设置为)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/，,、 -]{1,80})/)?.[1] || '') : [];
    const tagsRemove = /(?:删除|移除|去掉|清除).*(?:标签|tag)/.test(text)
      ? normalizeTagList(text.match(/(?:删除|移除|去掉|清除)\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/，,、 -]{1,80})\s*(?:标签|tag)/)?.[1] || '')
      : [];

    if (category) updates.category = category;
    if (note) updates.note = note;
    if (title) updates.title = title;
    if (tagsAdd.length) updates.tagsAdd = tagsAdd;
    if (tagsRemove.length) updates.tagsRemove = tagsRemove;
    if (!Object.keys(updates).length) return null;

    const target = selected || filtered
      ? ''
      : (extractQuotedText(text)
        || text.match(/(?:把|将|给)?\s*([A-Za-z0-9._/-]+|[\u4e00-\u9fa5A-Za-z0-9._/-]{2,60})(?:的)?(?:图谱|谱图|图片|记录|数据)/)?.[1]
        || '');
    return {
      target,
      mode: selected ? 'selected' : filtered ? 'filtered' : 'query',
      updates,
      maxAffected: 30,
    };
  };

  const extractSpectrumSelectInput = (prompt) => {
    const text = String(prompt || '').trim();
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|当前分类)/.test(text);
    const active = /(?:当前图谱|当前图片|当前这张|这张)/.test(text);
    const target = filtered || active
      ? ''
      : (extractQuotedText(text)
        || stripCommandNoise(text)
          .replace(/^(选择|选中|勾选|定位|打开|查看|筛出|筛选)\s*/, '')
          .replace(/(图谱|谱图|图片|记录|数据|一下|出来|上)$/g, '')
          .trim());
    return {
      target,
      mode: filtered ? 'filtered' : active ? 'active' : 'query',
      clearExisting: !/(?:追加|加选|保留已选)/.test(text),
      maxAffected: 80,
    };
  };

  const extractSpectrumSearchInput = (prompt) => {
    const text = String(prompt || '');
    const selected = /(?:当前已选|当前选中|已选中|已选|选中|选择的|选出来的)/.test(text);
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前分类)/.test(text);
    const active = /(?:当前图谱|当前图片|当前这张|这张)/.test(text);
    const query = stripCommandNoise(text)
      .replace(/(查找|搜索|检索|找|分析|对比|比较|查看|看|图谱|谱图|图片|图像|曲线|图谱库|里面|中的|一下|帮我|请|我|当前已选|当前选中|已选中|已选|选中|选择的|选出来的|当前筛选|筛选结果|当前列表|当前分类|当前这张|这张|当前)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      query,
      mode: selected ? 'selected' : filtered ? 'filtered' : active ? 'active' : 'query',
    };
  };

  const fillSpectrumSearchInputFallback = (input = {} as any, prompt = '') => {
    const action = String(input?.action || 'search').trim() || 'search';
    if (action !== 'search') return input;
    const explicitQuery = String(input.query || '').trim();
    const explicitTarget = String(input.target || '').trim();
    const explicitQuestion = String(input.question || '').trim();
    if (explicitQuery) return input;

    const promptInput = extractSpectrumSearchInput(prompt);
    const fallbackQuery = explicitTarget || explicitQuestion || promptInput.query || '';
    const rangeModes = new Set(['selected', 'filtered', 'active']);
    const inputMode = String(input.mode || '').trim();
    const promptMode = String(promptInput.mode || '').trim();
    const fallbackMode = rangeModes.has(promptMode)
      ? promptMode
      : (fallbackQuery ? 'query' : (inputMode || 'query'));
    return {
      ...input,
      query: fallbackQuery,
      mode: fallbackMode,
    };
  };

  const hasSpectrumVisualAnalysisIntent = (prompt) => {
    const text = String(prompt || '');
    const wantsAnalysis = /(?:分析|对比|比较|看看|查看|看一下|看|判断|总结|解读)/.test(text);
    const mentionsSpectrum = /(?:图谱|谱图|图片|图像|曲线|dsc|tga|当前已选|当前选中|已选中|已选|选中|选择的|选出来的|当前图谱|当前图片|当前这张|这张)/i.test(text);
    return wantsAnalysis && mentionsSpectrum;
  };

  const getPageAliasEntries = () => {
    const fromPageDefs = Object.entries(constants.PAGE_DEFS || {}).flatMap(([pageId, def]) => {
      const title = String(def?.title || '').trim();
      return [
        [pageId, pageId],
        title ? [title, pageId] : null,
      ].filter(Boolean);
    });
    return [
      ...Object.entries(EXTRA_PAGE_ALIASES),
      ...fromPageDefs,
    ]
      .map(([alias, pageId]) => [normalizeText(alias), pageId])
      .filter(([alias, pageId]) => alias && pageId)
      .sort((a, b) => b[0].length - a[0].length);
  };

  const resolvePageId = (prompt) => {
    const text = normalizeText(prompt);
    const exact = getPageAliasEntries().find(([alias]) => text.includes(alias));
    return exact?.[1] || '';
  };

  const hasOpenPageIntent = (prompt) => {
    const text = String(prompt || '');
    if (/(?:几个|多少|数量|总数|有哪些|哪几个|列表|明细|统计|当前|现在)/.test(text)) return false;
    return /(?:打开|进入|切换到|跳转到|转到|去).*(?:页面|面板|中心|档案|管理|计划|库存|日志|仪表盘|助手|分析|配置|主题|技能|调用|费用|订单|客户|供应商|人员|权限|数据源|生产|配方|销售|开单|抠图|图谱|物性)/.test(text)
      || /查看.*(?:页面|面板|中心|档案|管理页|计划页|库存页|日志页|仪表盘|配置页)/.test(text);
  };

  const isDataQueryIntent = (prompt) => /(?:几个|多少|数量|总数|有哪些|哪几个|列表|明细|统计|当前|现在)/.test(String(prompt || ''));

  const getPageCatalog = () => Object.entries(constants.PAGE_DEFS || {})
    .map(([pageId, def]) => `${def?.title || pageId}=${pageId}`)
    .join('；');

  const normalizeResult = normalizeAgentToolResult;

  const SKILL_CALL_EXAMPLE = {
    gjhSkillCall: {
      skillId: 'spectrum.manageImages',
      input: {
        action: 'delete',
        target: '图谱名称',
        mode: 'target',
      },
      reason: '用户要求删除指定图谱',
    },
  };

  const SKILL_RESULT_EXAMPLE = {
    ok: true,
    message: '技能已执行',
    details: ['执行结果说明'],
    data: {
      deleted: 1,
    },
  };

  const normalizeJsonSpec = (value) => {
    if (value && typeof value === 'object') return value;
    try {
      return JSON.parse(String(value || '').trim());
    } catch {
      return String(value || '').trim();
    }
  };

  const formatJsonSpec = (value) => {
    const normalized = normalizeJsonSpec(value);
    if (normalized && typeof normalized === 'object') {
      return JSON.stringify(normalized, null, 2);
    }
    return String(normalized || '');
  };

  const formatCompactJsonSpec = (value) => {
    const normalized = normalizeJsonSpec(value);
    if (normalized && typeof normalized === 'object') {
      return JSON.stringify(normalized);
    }
    return String(normalized || '');
  };

  const buildProjectManifest = () => {
    const pages = Object.entries(constants.PAGE_DEFS || {}).map(([pageId, def]) => ({
      pageId,
      title: def?.title || pageId,
      desc: def?.desc || '',
      entity: '',
      fields: [],
      skills: ['project.inspectPage'],
      rowCount: undefined as number | undefined,
    }));
    const businessPages = App.businessPages?.getAgentManifestPages?.() || [];
    const byId = new Map(pages.map((page) => [page.pageId, page]));
    businessPages.forEach((page) => {
      byId.set(page.pageId, {
        ...(byId.get(page.pageId) || {}),
        ...page,
      });
    });
    const resolvedPages = [...byId.values()];
    return {
      ok: true,
      systemName: '广俊塑料科技后台管理系统',
      strategy: '先读取页面能力地图，再按用户问题选择必要页面、字段、筛选和技能；不要默认读取全量数据。',
      pages: resolvedPages,
      dataSources: ['本地业务数据', 'OSS 云端同步', '物性分析表格', '图谱图片库'],
      currentData: Object.fromEntries(
        resolvedPages
          .filter((page) => Number.isFinite(Number(page.rowCount)))
          .map((page) => [page.pageId, Number(page.rowCount)])
      ),
      relations: [
        { from: 'formula-management', to: 'inventory-management', desc: '配方组分来自库存材料，库存状态影响配方可排产风险。' },
        { from: 'order-management', to: 'production-plan', desc: '订单交期和状态驱动生产计划。' },
        { from: 'inventory-management', to: 'supplier-archive', desc: '库存材料关联供应商来源。' },
        { from: 'raw-material-procurement', to: 'supplier-archive', desc: '采购记录关联供应商档案。' },
        { from: 'property-analysis', to: 'spectrum-analysis', desc: '物性数据和图谱图片可按型号/批次联合分析。' },
      ],
      skills: [
        'project.getManifest',
        'project.searchCapabilities',
        'project.auditRuntime',
        'project.inspectPage',
        'project.finalAnswerCheck',
        'business.queryPageData',
        'business.analyzeOverview',
        'property.searchRows',
        'property.summarizeMetrics',
        'property.compareRows',
        'property.validateRanges',
        'spectrum.searchImages',
        'spectrum.deleteImages',
        'analysis.buildJointPackage',
        'formula.createRecipe',
        'assistant.modelInfo',
        'assistant.currentPage',
        'assistant.projectGuide',
        'dataRecognition.searchHistory',
        'dataRecognition.inspectCurrent',
        'web.search',
        'media.generateImage',
        'media.analyzeImages',
        'assistant.openPage',
      ],
    };
  };

  const executePropertyAnalysisSkill = async (input = {} as any, operation = 'search') => {
    const context = App.propertyAnalysis?.getAgentContext?.(input.query || input.question || '', {
      activePageId: 'property-analysis',
      compact: true,
      operation,
      mode: input.mode || '',
      selectedOnly: input.mode === 'selected',
      filteredOnly: input.mode === 'filtered',
      fullCurrentTable: input.mode === 'filtered' && operation !== 'search',
    });
    if (!context?.content) return { ok: false, message: '物性分析数据尚未加载，暂时无法分析。' };
    return {
      ok: true,
      message: `已完成物性数据${operation === 'compare' ? '对比' : operation === 'summarize' ? '统计' : operation === 'validate' ? '检测范围判定' : '检索'}。`,
      details: [
        context.reason || '已返回物性分析上下文。',
        context.stats?.uploadedRows ? `已上传匹配明细：${context.stats.uploadedRows} 行` : '',
        context.stats?.contextChars ? `上下文长度：${context.stats.contextChars} 字符` : '',
      ].filter(Boolean),
      data: {
        context: context.content,
        displayTable: context.displayTable || '',
        stats: context.stats || {},
        fullContext: Boolean(context.fullContext),
        operation,
      },
    };
  };

  const createSkillRegistry = () => [
    {
      id: 'project.getManifest',
      title: '读取项目能力地图',
      module: '项目管家',
      icon: 'ti-map',
      level: '查询型',
      summary: '返回系统页面、页面用途、可查实体、字段、技能和跨页面关系；不返回业务明细数据。',
      inputSpec: '{ "includeFields": true }',
      outputSpec: '{ "ok": true, "pages": [{ "pageId": "...", "title": "...", "fields": [] }], "relations": [] }',
      paramDocs: [
        ['includeFields', '是否包含页面可查字段。默认 true', '可选'],
      ],
      resultDocs: [
        ['pages', '项目页面能力地图'],
        ['relations', '页面之间的数据关系'],
        ['skills', '可调用项目技能列表'],
      ],
      examples: ['读取项目说明书', '这个系统有哪些页面能力'],
      infer(prompt) {
        if (/(?:项目|系统|网站|页面|功能|说明书|能力地图|有哪些模块|做什么)/.test(String(prompt || ''))) {
          return { skillId: this.id, confidence: 0.5, input: { includeFields: true } };
        }
        return null;
      },
      async handler() {
        const manifest = buildProjectManifest();
        return {
          ok: true,
          message: '已读取项目能力地图。',
          details: [`页面数：${manifest.pages.length}`, `关系数：${manifest.relations.length}`],
          data: manifest,
        };
      },
    },
    {
      id: 'project.inspectPage',
      title: '查看页面数据结构',
      module: '项目管家',
      icon: 'ti-schema',
      level: '查询型',
      summary: '返回指定页面的数据实体、字段、记录数和字段样例，不返回全量业务数据。',
      inputSpec: '{ "pageId": "inventory-management" }',
      outputSpec: '{ "ok": true, "pageId": "...", "entity": "...", "fields": [], "rowCount": 0 }',
      paramDocs: [
        ['pageId', '目标页面 ID', '必填'],
      ],
      resultDocs: [
        ['entity', '页面核心数据实体'],
        ['fields', '可查询字段'],
        ['rowCount', '当前记录数'],
      ],
      examples: ['查看库存管理的数据结构', '检查配方管理有哪些字段'],
      infer() {
        return null;
      },
      async handler(input = {} as any) {
        const pageId = String(input.pageId || '').trim();
        const inspected = App.businessPages?.inspectAgentPage?.(pageId);
        if (inspected) {
          return {
            ok: true,
            message: inspected.summary || `已读取 ${pageId} 页面结构。`,
            data: inspected,
          };
        }
        const def = constants.PAGE_DEFS?.[pageId];
        if (!def) return { ok: false, message: `没有找到页面：${pageId}` };
        return {
          ok: true,
          message: `页面 ${def.title || pageId} 目前只有说明书信息，暂无结构化数据接口。`,
          data: { pageId, title: def.title || pageId, desc: def.desc || '', fields: [], rowCount: 0 },
        };
      },
    },
    {
      id: 'project.finalAnswerCheck',
      title: '复盘答案充分性',
      module: '项目管家',
      icon: 'ti-checkup-list',
      level: '上下文型',
      summary: 'Agent Loop 内部复盘步骤：检查已取数据是否足够回答用户问题，不直接读取业务明细。',
      inputSpec: '{ "question": "用户问题", "observations": [] }',
      outputSpec: '{ "ok": true, "enough": true, "message": "..." }',
      paramDocs: [
        ['question', '用户原始问题', '必填'],
        ['observations', '已取回的结构化 Observation', '可选'],
      ],
      resultDocs: [
        ['enough', '是否足够生成最终答案'],
        ['message', '复盘结论'],
      ],
      examples: ['复盘当前取数是否足够回答'],
      infer() {
        return null;
      },
      async handler(input = {} as any) {
        const observations = Array.isArray(input.observations) ? input.observations : [];
        return {
          ok: true,
          message: observations.length ? '已有 Observation，可由 Agent Planner 判断是否输出最终答案。' : '尚无 Observation，通常需要先读取项目能力地图或页面数据。',
          data: {
            enough: observations.some((item) => item?.rowCount || item?.data),
            observationCount: observations.length,
          },
        };
      },
    },
    {
      id: 'business.queryPageData',
      title: '查询业务页面数据',
      module: '业务数据',
      icon: 'ti-table-search',
      level: '查询型',
      summary: '按页面、实体、意图、筛选、排序、字段和范围查询业务数据；只返回回答问题所需的裁剪数据。',
      inputSpec: '{ "pageId": "inventory-management", "intent": "count | list | filter | extrema | compare | detail | aggregate", "entity": "inventoryItem", "filters": [{ "field": "type", "op": "contains", "value": "成品" }], "sort": [{ "field": "stockQuantity", "direction": "asc" }], "limit": 1, "fields": ["name", "stockQuantity", "status"], "scope": "allData" }',
      outputSpec: '{ "ok": true, "pageId": "...", "intent": "extrema", "rowCount": 1, "data": [], "summary": "..." }',
      paramDocs: [
        ['pageId', '目标页面 ID，例如 inventory-management、formula-management', '必填'],
        ['intent', '查询意图：count/list/filter/extrema/detail/aggregate 等', '必填'],
        ['filters', '字段筛选条件，支持 contains/eq/in/gt/gte/lt/lte', '可选'],
        ['sort', '排序规则，extrema 通常按比较字段升序或降序', '可选'],
        ['fields', '返回字段白名单，只取回答需要的字段', '可选'],
        ['limit', '返回行数上限，extrema 默认 1', '可选'],
      ],
      resultDocs: [
        ['rowCount', '命中数据行数或返回数据行数'],
        ['data', '裁剪后的结构化数据'],
        ['summary', '取数范围和处理说明'],
      ],
      examples: ['查询库存最低的成品商品', '列出当前系统配方', '统计系统有几个供应商'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:几个|多少|数量|总数|有哪些|哪几个|列表|明细|当前|现在|查看|列举|列出|展示|罗列|最低|最少|最小|最高|最多|最大|库存|配方|订单|供应商|客户|人员|账号)/.test(text)) return null;
        return { skillId: this.id, confidence: 0.66, input: { question: text } };
      },
      async handler(input = {} as any, meta = {} as any) {
        if (!App.businessPages?.queryAgentData) {
          return { ok: false, message: '业务页面尚未接入结构化取数接口。' };
        }
        const data = App.businessPages.queryAgentData({
          question: meta.prompt || input.question || input.query || '',
          ...input,
        });
        return {
          ok: data.ok !== false,
          message: data.summary || '业务页面数据已返回。',
          details: [
            `页面：${data.pageId || input.pageId || '-'}`,
            `意图：${data.intent || input.intent || '-'}`,
            `命中：${data.rowCount ?? 0} 条`,
          ],
          data,
        };
      },
    },
    {
      id: 'spectrum.manageImages',
      title: '管理图谱数据',
      module: '图谱分析',
      icon: 'ti-database-edit',
      level: '执行型',
      summary: '按 action 参数选择图谱数据操作，支持查询、新增、修改、选择、删除、标签和分类管理。',
      inputSpec: '{ "action": "search | create | update | select | delete | tag | categorize", "target": "名称/编号/关键词", "mode": "query | target | selected | filtered | active", "title": "新增标题", "updates": { "category": "...", "note": "...", "tagsAdd": ["..."] }, "tags": ["标签"], "category": "分类", "maxAffected": 30 }',
      outputSpec: '{ "ok": true, "action": "search", "items": [{ "title": "..." }], "images": ["图谱图片"] }',
      actionDocs: [
        ['search', '查询图谱', 'query、mode、limit', '匹配记录、上下文、图谱图片'],
        ['create', '新增记录', 'title、code、type、category、tags、note', '新增记录详情'],
        ['update', '修改字段', 'target、mode、updates、maxAffected', '更新数量和明细'],
        ['select', '选择范围', 'target、mode、clearExisting、maxAffected', '已选数量'],
        ['delete', '删除记录', 'target、mode、maxAffected', '删除数量或候选项'],
        ['tag', '管理标签', 'target、mode、tags、maxAffected', '标签写入结果'],
        ['categorize', '调整分类', 'target、mode、category、maxAffected', '分类更新结果'],
      ],
      paramDocs: [
        ['action', '操作类型，可选 search/create/update/select/delete/tag/categorize', '必填'],
        ['target', '目标名称、编号、关键词或分类范围', '按 action 需要'],
        ['mode', '目标范围：query 精确/模糊查询，selected 当前已选，filtered 当前筛选，active 当前图谱', '可选'],
        ['updates', 'update 时要修改的字段，例如 title、category、note、tagsAdd', 'update 必填'],
        ['maxAffected', '最多影响多少条记录，用于限制批量修改或删除范围', '可选'],
      ],
      resultDocs: [
        ['ok', '执行是否成功'],
        ['message', '执行结果摘要'],
        ['items', '命中的图谱记录或处理后的记录明细'],
        ['images', 'search 时可交给视觉模型分析的图谱图片'],
        ['candidates', '目标不唯一时返回候选项，供用户二次确认'],
      ],
      examples: ['查找 320G6 的 DSC 图谱', '新增一条「320G6-B1 DSC」图谱记录，分类阻燃', '把当前选中的图谱备注改为需要复核', '删除当前已选图谱'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasDeleteIntent = /(?:删除|移除|删掉|清理)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|图像|曲线|dsc|tga)/i.test(text);
        if (!mentionsSpectrum && !activeOnSpectrumPage) return null;
        if (/(?:怎么|如何|教程|说明|能不能)/.test(text)) return null;

        if (hasDeleteIntent) {
          const selected = /(?:当前|选中|已选)/.test(text);
          const target = extractDeleteTarget(text);
          return {
            skillId: this.id,
            confidence: target || selected ? 0.92 : 0.72,
            input: {
              action: 'delete',
              target,
              mode: selected && !target ? 'selected' : 'target',
            },
          };
        }

        const hasCreateIntent = /(?:新增|创建|新建|添加)/.test(text) && /(?:图谱|谱图|图片|记录|数据)/.test(text);
        if (hasCreateIntent) {
          const input = extractSpectrumCreateInput(text);
          if (input) return { skillId: this.id, confidence: 0.86, input: { action: 'create', ...input } };
        }

        const hasTagIntent = /(?:标签|打标|标记)/.test(text)
          && /(?:加上|添加|增加|打上|写入|标记为|设为|设置为|改成|修改|加)/.test(text);
        if (hasTagIntent) {
          const input = extractTagUpdateInput(text);
          if (input) return { skillId: this.id, confidence: 0.9, input: { action: 'tag', ...input } };
        }

        const hasCategoryIntent = /(?:分类|归类|整理|分组|新分类|创建分类|新增分类|放到|分到)/.test(text);
        const hasSetIntent = /(?:叫|为|成|到|整理出来|做一个|创建|新建|新增|归类|放到|分到)/.test(text);
        if (hasCategoryIntent && hasSetIntent) {
          const input = extractCategoryUpdateInput(text);
          if (input) return { skillId: this.id, confidence: 0.93, input: { action: 'categorize', ...input } };
        }

        const hasUpdateIntent = /(?:修改|更新|改成|改为|设置|设为|写入|移除|去掉|清除|备注|标题|名称|标签|分类)/.test(text);
        if (hasUpdateIntent) {
          const input = extractSpectrumUpdateInput(text);
          if (input) return { skillId: this.id, confidence: 0.88, input: { action: 'update', ...input } };
        }

        const hasSelectIntent = /(?:选择|选中|勾选|定位|筛出|筛选|追加选择|加选)/.test(text);
        if (hasSelectIntent) {
          return { skillId: this.id, confidence: 0.82, input: { action: 'select', ...extractSpectrumSelectInput(text) } };
        }

        if (/(?:查找|搜索|检索|找|分析|对比|比较|查看|看).*(?:图谱|谱图|图片|曲线|dsc|tga)|(?:图谱|谱图|图片|曲线|dsc|tga).*(?:查找|搜索|检索|找|分析|对比|比较|查看|看)/i.test(text)) {
          return { skillId: this.id, confidence: 0.76, input: { action: 'search', ...extractSpectrumSearchInput(text) } };
        }

        return null;
      },
      async handler(input = {} as any) {
        const action = String(input.action || 'search').trim();
        const withAction = (result) => ({
          ...(result || {}),
          data: {
            ...(result?.data || {}),
            action,
          },
        });

        if (action === 'delete') {
          if (!App.spectrumAnalysis?.deleteByAgent) return { ok: false, message: '图谱分析模块尚未暴露删除技能接口。' };
          return withAction(await App.spectrumAnalysis.deleteByAgent(input));
        }
        if (action === 'create') {
          if (!App.spectrumAnalysis?.createByAgent) return { ok: false, message: '图谱分析模块尚未暴露新增记录技能接口。' };
          return withAction(await App.spectrumAnalysis.createByAgent(input));
        }
        if (action === 'update') {
          if (!App.spectrumAnalysis?.updateByAgent) return { ok: false, message: '图谱分析模块尚未暴露更新数据技能接口。' };
          return withAction(await App.spectrumAnalysis.updateByAgent(input));
        }
        if (action === 'select') {
          if (!App.spectrumAnalysis?.selectByAgent) return { ok: false, message: '图谱分析模块尚未暴露选择数据技能接口。' };
          return withAction(await App.spectrumAnalysis.selectByAgent(input));
        }
        if (action === 'tag') {
          if (!App.spectrumAnalysis?.tagByAgent) return { ok: false, message: '图谱分析模块尚未暴露标签修改技能接口。' };
          return withAction(await App.spectrumAnalysis.tagByAgent(input));
        }
        if (action === 'categorize') {
          if (!App.spectrumAnalysis?.categorizeByAgent) return { ok: false, message: '图谱分析模块尚未暴露分类整理技能接口。' };
          return withAction(await App.spectrumAnalysis.categorizeByAgent(input));
        }
        if (!App.spectrumAnalysis?.searchByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露检索技能接口。' };
        }
        return withAction(await App.spectrumAnalysis.searchByAgent(fillSpectrumSearchInputFallback(input, input.prompt || input.question || input.target || '')));
      },
    },
    {
      id: 'property.searchRows',
      title: '检索物性数据',
      module: '物性分析',
      icon: 'ti-search',
      level: '查询型',
      summary: '按分类工作表、型号、批次或指标关键词检索物性数据，返回分类目录、强匹配、相近匹配和指标摘要。',
      inputSpec: '{ "query": "型号/批次/指标关键词", "mode": "query | selected | filtered" }',
      outputSpec: '{ "ok": true, "context": "物性分析检索结果..." }',
      paramDocs: [
        ['query', '要检索的型号、批次、材料名称或指标关键词', '必填'],
      ],
      resultDocs: [
        ['ok', '是否检索成功'],
        ['context', '可交给 AI 分析的物性数据上下文'],
        ['displayTable', '前端展示用的匹配数据表'],
        ['stats', '命中行数、上下文长度等统计信息'],
      ],
      examples: ['检索物性型号 320G6-N11', '查一下批次 A2404 的冲击强度'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnPropertyPage = getActivePageId() === 'property-analysis';
        const selected = /(?:当前已选|当前选中|已选中|已选|选中|选择的|选出来的)/.test(text);
        const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|本页)/.test(text);
        const hasPropertyModel = /(?:^|[^A-Z0-9])(?=[A-Z0-9-]*\d)[A-Z0-9]{2,}(?:-[A-Z0-9]+)+(?:$|[^A-Z0-9])/i.test(text);
        const hasPropertyIntent = hasPropertyModel || /(?:物性|分类|工作表|页签|型号|批次|熔指|拉伸|弯曲|冲击|灰份|强度|材料|无卤|阻燃|尼龙|竞品|原料|测试数据|检测数据|数据|PBT|PET|PET胶|PBT胶)/i.test(text);
        const hasAnalyzeIntent = /(?:分析|对比|比较|判断|看看|看一下|评价|怎么样|如何|建议|结论)/.test(text);
        const hasSearchIntent = /(?:查找|搜索|检索|查一下|找)/.test(text);
        if (!(hasPropertyIntent && (hasSearchIntent || hasAnalyzeIntent || selected || filtered || activeOnPropertyPage))) return null;
        return {
          skillId: this.id,
          confidence: selected ? 0.94 : activeOnPropertyPage ? 0.86 : 0.72,
          input: {
            query: stripCommandNoise(text),
            mode: selected ? 'selected' : filtered ? 'filtered' : 'query',
          },
        };
      },
      async handler(input = {} as any) {
        return executePropertyAnalysisSkill(input, 'search');
      },
    },
    {
      id: 'property.summarizeMetrics',
      title: '统计物性指标',
      module: '物性分析',
      icon: 'ti-chart-bar',
      level: '分析型',
      summary: '统计指定型号、批次、已选行或筛选结果的样本数、指标均值、最小值、最大值和波动范围。',
      inputSpec: '{ "query": "型号/批次/指标", "mode": "query | selected | filtered" }',
      outputSpec: '{ "ok": true, "context": "物性指标统计上下文", "stats": {} }',
      examples: ['统计 320G5-B21 各项指标', '汇总当前筛选结果的熔指和拉伸强度'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:物性|型号|批次|熔指|拉伸|弯曲|冲击|灰份|强度|材料|[A-Z0-9]{2,}-[A-Z0-9-]+)/i.test(text)
          || !/(?:统计|汇总|均值|平均|最大|最小|范围|波动|稳定|趋势|离散)/.test(text)) return null;
        return { skillId: this.id, confidence: 0.9, input: { query: stripCommandNoise(text), mode: /(?:已选|选中)/.test(text) ? 'selected' : /(?:筛选|本页|当前列表)/.test(text) ? 'filtered' : 'query' } };
      },
      async handler(input = {} as any) { return executePropertyAnalysisSkill(input, 'summarize'); },
    },
    {
      id: 'property.compareRows',
      title: '对比物性型号与批次',
      module: '物性分析',
      icon: 'ti-arrows-diff',
      level: '分析型',
      summary: '对比多个型号或批次的共同指标、重复测试值、均值、差异、极值、波动与缺失项。',
      inputSpec: '{ "query": "要对比的型号/批次", "mode": "query | selected | filtered" }',
      outputSpec: '{ "ok": true, "context": "物性对比上下文", "displayTable": "..." }',
      examples: ['对比 320G5-B21 和 320G6-B21', '比较当前选中批次的稳定性'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:对比|比较|差异|哪个更|哪.*高|哪.*低|批次间|型号间)/.test(text)
          || !/(?:物性|型号|批次|熔指|拉伸|弯曲|冲击|灰份|强度|材料|[A-Z0-9]{2,}-[A-Z0-9-]+)/i.test(text)) return null;
        return { skillId: this.id, confidence: 0.94, input: { query: stripCommandNoise(text), mode: /(?:已选|选中)/.test(text) ? 'selected' : /(?:筛选|本页|当前列表)/.test(text) ? 'filtered' : 'query' } };
      },
      async handler(input = {} as any) { return executePropertyAnalysisSkill(input, 'compare'); },
    },
    {
      id: 'property.validateRanges',
      title: '判定物性检测范围',
      module: '物性分析',
      icon: 'ti-shield-check',
      level: '分析型',
      summary: '复用检验报告的型号检测范围，判定各指标通过、异常、未设置范围或检验值无效。',
      inputSpec: '{ "query": "型号/批次", "mode": "query | selected | filtered" }',
      outputSpec: '{ "ok": true, "context": "检测范围判定上下文", "stats": { "validation": {} } }',
      examples: ['判断 320G5-B21 是否合格', '检查当前选中批次有没有超出检测范围'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:合格|不合格|达标|超标|异常|检测范围|检验范围|规格范围|上下限|判定)/.test(text)) return null;
        return { skillId: this.id, confidence: 0.95, input: { query: stripCommandNoise(text), mode: /(?:已选|选中)/.test(text) ? 'selected' : /(?:筛选|本页|当前列表)/.test(text) ? 'filtered' : 'query' } };
      },
      async handler(input = {} as any) { return executePropertyAnalysisSkill(input, 'validate'); },
    },
    {
      id: 'formula.createRecipe',
      title: '创建新配方记录',
      module: '配方管理',
      icon: 'ti-flask-2',
      level: '执行型',
      summary: '在配方管理列表中新增一条真实配方草稿，写入编号、名称、产品型号、分类、产线、负责人、说明和验证项，并同步本地配方库。不会重复创建同名或同编号记录。',
      inputSpec: '{ "name": "配方名称", "code": "配方编号", "product": "产品型号", "category": "ABS | PP | PC/ABS | ...", "line": "A | B", "owner": "负责人", "target": "目标说明", "materials": [{ "name": "原料", "ratio": 58, "port": 1 }], "checks": ["验证项"] }',
      outputSpec: '{ "ok": true, "created": 1, "items": [{ "name": "...", "code": "..." }] }',
      paramDocs: [
        ['name', '配方名称，列表中显示的主标题', '必填其一'],
        ['code', '配方编号，用于去重和检索', '必填其一'],
        ['product', '产品型号或目标牌号', '必填其一'],
        ['materials', '配方原料数组，可包含 name、ratio、port、role、stage', '可选'],
        ['checks', '验证或测试项目，例如 DSC/TGA/CTI', '可选'],
      ],
      resultDocs: [
        ['ok', '是否创建成功'],
        ['created', '新增记录数量'],
        ['items', '新增配方的编号、名称、分类、产线和版本'],
        ['message', '创建结果摘要'],
      ],
      examples: ['根据选中的物性数据创建一个配方草稿', '新建 420G6-B3-X6-DuPont 对标改进版配方'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnFormulaPage = getActivePageId() === 'formula-management';
        const hasCreateIntent = /(?:新增|创建|新建|添加|生成|做|来|搞|弄|配|设计|出).*(?:配方|配方记录)|(?:配方|配方记录).*(?:新增|创建|新建|添加|生成|做|来|搞|弄|配|设计|出)/.test(text);
        if (!hasCreateIntent && !activeOnFormulaPage) return null;
        if (!hasCreateIntent || /(?:怎么|如何|教程|说明|能不能)/.test(text)) return null;
        const input = extractFormulaCreateInput(text);
        if (!input) return null;
        return { skillId: this.id, confidence: 0.9, input };
      },
      async handler(input = {} as any) {
        if (!App.businessPages?.createFormulaByAgent) {
          return { ok: false, message: '配方管理模块尚未暴露创建配方技能接口。' };
        }
        return App.businessPages.createFormulaByAgent(input);
      },
    },
    {
      id: 'analysis.buildJointPackage',
      title: '生成联合分析包',
      module: '综合分析',
      icon: 'ti-binary-tree-2',
      level: '上下文型',
      summary: '仅在用户明确要求跨模块/物性+图谱联合分析时，把相关数据整理成统一的 AI 分析上下文。',
      inputSpec: '{ "question": "用户问题", "forceCurrentPage": false }',
      outputSpec: '{ "ok": true, "context": "...", "images": ["图谱图片"], "imageCount": 1 }',
      paramDocs: [
        ['question', '用户要分析的问题或目标型号', '必填'],
        ['forceCurrentPage', '是否强制优先使用当前页面数据', '可选'],
      ],
      resultDocs: [
        ['ok', '是否生成成功'],
        ['context', '联合分析上下文，包含相关物性和业务信息'],
        ['images', '可用于视觉分析的图谱图片'],
        ['imageCount', '图谱图片数量'],
      ],
      examples: ['把当前型号的物性和图谱合成分析包', '生成 320G6-N11 的联合分析上下文'],
      infer(prompt) {
        const text = String(prompt || '');
        const mentionsProperty = /(?:物性|参数|批次|指标|熔指|拉伸|弯曲|冲击|阻燃|灰份|强度)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|图像|曲线|dsc|tga)/i.test(text);
        const explicitJointIntent = /(?:联合|结合|综合|合成|打包|分析包|一起|同时).*(?:物性|图谱|数据)|(?:物性|图谱|数据).*(?:联合|结合|综合|合成|打包|分析包|一起|同时)/.test(text);
        if (!(explicitJointIntent || (mentionsProperty && mentionsSpectrum))) return null;
        return { skillId: this.id, confidence: 0.8, input: { question: text, forceCurrentPage: false } };
      },
      async handler(input = {} as any) {
        const question = String(input.question || input.query || '');
        const activePageId = getActivePageId();
        const context = App.agentButler?.buildContext?.({
          question,
          activePageId,
          forceCurrentPage: Boolean(input.forceCurrentPage),
        }) || '';
        const images = App.agentButler?.getImages?.({
          question,
          activePageId,
          forceCurrentPage: Boolean(input.forceCurrentPage),
        }) || [];
        if (!context) return { ok: false, message: '当前没有可整理的分析上下文。' };
        return {
          ok: true,
          message: '联合分析包已生成，可继续交给 AI 进行综合判断。',
          details: [`上下文长度：${context.length} 字符`, `可上传图片：${images.length} 张`],
          data: { context, images, imageCount: images.length },
        };
      },
    },
    ...createRuntimeSkillDefinitions(App),
    {
      id: 'assistant.openPage',
      title: '切换项目页面',
      module: '导航',
      icon: 'ti-route',
      level: '执行型',
      summary: '根据自然语言跳转到系统内任意已注册页面，包括业务中心、基础数据、系统管理和 AI 功能页。',
      inputSpec: '{ "pageId": "spectrum-analysis" }',
      outputSpec: '{ "ok": true, "pageId": "spectrum-analysis" }',
      paramDocs: [
        ['pageId', '目标页面 ID，例如 formula-management、spectrum-analysis、property-analysis', '必填'],
      ],
      resultDocs: [
        ['ok', '是否切换成功'],
        ['pageId', '已切换到的页面 ID'],
        ['message', '页面切换结果摘要'],
      ],
      examples: ['打开客户档案', '切换到图谱分析', '打开AI调用分析'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!hasOpenPageIntent(text)) return null;
        const pageId = resolvePageId(text);
        if (!pageId) return null;
        return { skillId: this.id, confidence: 0.9, input: { pageId } };
      },
      async handler(input = {} as any) {
        const pageId = String(input.pageId || '').trim();
        const def = constants.PAGE_DEFS?.[pageId];
        if (!def) return { ok: false, message: `没有找到页面：${pageId}` };
        App.navigation?.showPage?.(pageId);
        return {
          ok: true,
          message: `已切换到「${def.title || pageId}」。`,
          data: { pageId },
        };
      },
    },
  ];

  // Legacy callers still consume inference rules until the chat protocol is
  // migrated. Capability pages and the V2 runtime use the registry below.
  const getLegacySkillRegistry = () => createSkillRegistry();
  const getSkillRegistry = getLegacySkillRegistry;
  const getToolRegistry = () => {
    if (!toolRegistry) {
      toolRegistry = createProjectToolRegistry(App, createProjectToolAdapters(App));
    }
    return toolRegistry;
  };
  const getToolCatalog = () => getToolRegistry().getPlannerCatalog().map((tool) => {
    const metadata = tool as any;
    return {
      ...metadata,
      module: metadata.module || tool.category,
      level: metadata.level || (tool.riskLevel === 'read' ? '查询型' : '执行型'),
      summary: metadata.summary || tool.description,
      icon: metadata.icon || 'ti-sparkles',
      examples: Array.isArray(metadata.examples) ? metadata.examples : [],
      inputSpec: { schema: tool.inputShape },
      outputSpec: { schema: tool.outputShape },
    };
  });
  const getExecutionEngine = () => {
    if (!executionEngine) {
      executionEngine = createAgentExecutionEngine({
        registry: getToolRegistry(),
        store: createLocalStorageAgentRunStore(),
      });
    }
    return executionEngine;
  };
  const createExecutionId = (prefix) => {
    const id = globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${id}`;
  };
  const SPECTRUM_LEGACY_ACTIONS = {
    'spectrum.deleteImage': 'delete',
    'spectrum.createImageRecord': 'create',
    'spectrum.updateImages': 'update',
    'spectrum.selectImages': 'select',
    'spectrum.addTags': 'tag',
    'spectrum.categorizeImages': 'categorize',
    'spectrum.searchImages': 'search',
  };
  const normalizeSkillInvocation = (skillId, input = {} as any) => {
    const action = SPECTRUM_LEGACY_ACTIONS[skillId];
    if (!action) return { skillId, input };
    return {
      skillId: 'spectrum.manageImages',
      input: {
        action,
        ...input,
      },
    };
  };
  const getSkillById = (skillId) => getSkillRegistry().find((skill) => skill.id === skillId);

  const routePrompt = (prompt = '') => {
    const plans = getSkillRegistry()
      .map((skill) => skill.infer?.(prompt))
      .filter(Boolean)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const formulaPlan = plans.find((plan) => plan.skillId === 'formula.createRecipe');
    if (formulaPlan) {
      return {
        skillId: 'formula.createRecipe',
        input: formulaPlan.input || {},
        confidence: formulaPlan.confidence || 0.9,
        steps: [
          {
            skillId: 'assistant.openPage',
            input: { pageId: 'formula-management' },
            reason: '创建配方前先打开配方管理页面',
          },
          {
            ...formulaPlan,
            reason: '在配方管理列表中写入新配方',
          },
        ],
      };
    }
    return plans[0] || null;
  };

  const appendHistory = (entry) => {
    const next = [
      {
        id: `skill-run-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: nowText(),
        ...entry,
      },
      ...readHistory(),
    ];
    writeHistory(next);
    renderHistory();
  };

  const resolveV2Invocation = ({ skillId, input }) => {
    if (skillId === 'spectrum.manageImages') {
      if (input?.action === 'search') {
        const { action, ...toolInput } = input;
        return { skillId: 'spectrum.searchImages', input: toolInput };
      }
      if (input?.action === 'delete') {
        const { action, ...toolInput } = input;
        return { skillId: 'spectrum.deleteImages', input: toolInput };
      }
      return null;
    }
    return getToolRegistry().get(skillId) ? { skillId, input } : null;
  };

  const executeSkill = async (skillId, input = {} as any, meta = {} as any) => {
    const normalizedInvocation = normalizeSkillInvocation(skillId, input);
    const startedAt = nowMs();
    const inputSize = measureJsonSize(normalizedInvocation.input);
    const v2Invocation = resolveV2Invocation(normalizedInvocation);
    const legacySkill = getSkillById(normalizedInvocation.skillId);
    const skill = v2Invocation
      ? getToolCatalog().find((tool) => tool.id === v2Invocation.skillId)
      : legacySkill;
    if (!skill) {
      const missing = normalizeResult({ ok: false, message: `未知项目技能：${normalizedInvocation.skillId}` });
      appendHistory({
        skillId: normalizedInvocation.skillId,
        title: normalizedInvocation.skillId,
        ok: false,
        message: missing.message,
        source: meta.source || 'unknown',
        durationMs: Math.round(nowMs() - startedAt),
        inputSize,
        outputSize: measureJsonSize(missing),
      });
      return { skill: { id: normalizedInvocation.skillId, title: normalizedInvocation.skillId }, result: missing };
    }

    let result;
    try {
      if (v2Invocation) {
        const executionResult = await getExecutionEngine().executeSingleTool({
          runId: createExecutionId('manual-run'),
          prompt: String(meta.prompt || ''),
          toolId: v2Invocation.skillId,
          input: v2Invocation.input,
          signal: meta.signal,
        });
        result = {
          ...normalizeResult({
            ok: executionResult.status === 'success',
            message: executionResult.message,
            data: executionResult.data,
            candidates: (executionResult.data as any)?.candidates,
          }),
          status: executionResult.status,
          diagnostics: executionResult.diagnostics,
          actions: executionResult.actions,
          evidence: executionResult.evidence,
        };
      } else {
        // create/update/select/tag/categorize remain on the legacy spectrum
        // compatibility path until their V2 migration is assigned.
        result = normalizeResult(await (legacySkill.handler as any)(normalizedInvocation.input, meta));
      }
    } catch (error) {
      result = normalizeResult({ ok: false, message: '技能执行失败。' });
    }

    appendHistory({
      skillId: v2Invocation?.skillId || normalizedInvocation.skillId,
      title: skill.title,
      ok: result.ok,
      message: result.message,
      source: meta.source || 'unknown',
      durationMs: Math.round(nowMs() - startedAt),
      inputSize,
      outputSize: measureJsonSize(result),
    });
    return { skill, result };
  };

  const formatSkillMessage = ({ skill, result }) => {
    if (skill?.id === 'assistant.currentPage' || skill?.id === 'assistant.projectGuide') {
      return [
        result.message,
        ...(result.details?.length ? ['', ...result.details.map((item) => `- ${item}`)] : []),
      ].filter(Boolean).join('\n');
    }
    if (skill?.id === 'business.queryPageData') {
      const data = result?.data || {};
      const rows = Array.isArray(data.data) ? data.data : [];
      const lines = [
        data.summary || result.message || '已读取业务数据。',
      ];
      if (rows.length) {
        const keys = Object.keys(rows[0] || {}).filter((key) => rows.some((row) => row?.[key] != null && row?.[key] !== ''));
        if (keys.length) {
          lines.push(
            '',
            `| ${keys.join(' | ')} |`,
            `| ${keys.map(() => '---').join(' | ')} |`,
            ...rows.slice(0, 12).map((row) => `| ${keys.map((key) => String(row?.[key] ?? '-').replace(/\|/g, '/')).join(' | ')} |`)
          );
        }
      }
      if (!rows.length && Number(data.rowCount || 0) > 0) {
        lines.push(`命中记录：${data.rowCount} 条。`);
      }
      return lines.join('\n');
    }
    const hasCandidateActions = skill?.id === 'spectrum.manageImages'
      && result?.data?.action === 'delete'
      && result.candidates?.length;
    const lines = [
      `已调用项目技能：${skill.title || skill.id}`,
      `执行状态：${result.ok ? '完成' : '需要处理'}`,
      result.message,
    ];

    if (result.details?.length) {
      lines.push('', '执行详情：', ...result.details.map((item) => `- ${item}`));
    }

    if (result.candidates?.length) {
      lines.push('', hasCandidateActions ? '请在下方选择要删除的对象：' : '可匹配对象：');
      result.candidates.slice(0, 8).forEach((item, index) => {
        lines.push(`${index + 1}. ${item.title || item.code || item.id} ${item.type ? `(${item.type})` : ''}`);
      });
    }

    if (result.data?.context) {
      const preview = String(result.data.context).slice(0, 1200);
      lines.push('', '上下文预览：', preview.length < result.data.context.length ? `${preview}\n...` : preview);
    }

    return lines.filter(Boolean).join('\n');
  };

  const getResultActions = ({ skill, result } = {} as any) => {
    if (
      skill?.id !== 'spectrum.manageImages'
      || result?.data?.action !== 'delete'
      || !Array.isArray(result?.candidates)
      || !result.candidates.length
    ) {
      return [];
    }

    return result.candidates.slice(0, 8).map((item, index) => {
      const title = String(item.title || item.code || item.id || `候选 ${index + 1}`);
      const type = String(item.type || '').trim();
      const category = String(item.category || '').trim();
      const meta = [type, category].filter(Boolean).join(' · ');
      return {
        id: `delete-spectrum-${item.id || index}`,
        label: `删除 ${title}`,
        description: meta || '点击后直接删除这张图谱',
        icon: 'ti-trash',
        variant: 'danger',
        skillId: 'spectrum.manageImages',
        input: {
          action: 'delete',
          target: String(item.id || item.title || item.code || ''),
          mode: 'target',
        },
        consumesGroup: true,
      };
    }).filter((action) => action.input.target);
  };

  const executePrompt = async (prompt = '', meta = {} as any) => {
    const plan = routePrompt(prompt);
    if (!plan) return null;
    return executeSkill(plan.skillId, plan.input || {}, { ...meta, prompt, source: meta.source || 'chat-natural-language' });
  };

  const tryParseJson = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const normalizeSkillCallText = (value) => String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const extractBalancedObjectText = (text, startIndex) => {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(startIndex, index + 1);
      }
    }
    return '';
  };

  const parseLooseSkillCall = (text = '') => {
    const value = normalizeSkillCallText(text);
    const skillId = value.match(/"skillId"\s*:\s*"([^"]+)"/)?.[1]
      || value.match(/'skillId'\s*:\s*'([^']+)'/)?.[1];
    if (!skillId) return null;

    const inputKeyMatch = value.match(/["']input["']\s*:/);
    const inputStart = inputKeyMatch ? value.indexOf('{', inputKeyMatch.index + inputKeyMatch[0].length) : -1;
    const inputText = inputStart >= 0 ? extractBalancedObjectText(value, inputStart) : '';
    const input = inputText ? (tryParseJson(inputText) || {}) : {};
    const reason = value.match(/"reason"\s*:\s*"([^"]*)"/)?.[1]
      || value.match(/'reason'\s*:\s*'([^']*)'/)?.[1]
      || '';

    return { skillId: String(skillId), input: input && typeof input === 'object' ? input : {}, reason: String(reason) };
  };

  const parseSkillCallFromText = (text = '') => {
    const value = normalizeSkillCallText(text);
    if (!value || !value.includes('gjhSkillCall')) return null;

    const candidates = [];
    const fenced = [...value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
    candidates.push(...fenced);
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(value.slice(firstBrace, lastBrace + 1));

    for (const candidate of candidates) {
      const parsed = tryParseJson(candidate);
      const call = parsed?.gjhSkillCall || parsed?.skillCall || null;
      if (call?.skillId) {
        return {
          skillId: String(call.skillId),
          input: call.input && typeof call.input === 'object' ? call.input : {},
          reason: String(call.reason || ''),
        };
      }
    }
    return parseLooseSkillCall(value);
  };

  const executeSkillCallFromText = async (text = '', meta = {} as any) => {
    const call = parseSkillCallFromText(text);
    if (!call) return null;
    const normalizedCall = normalizeSkillInvocation(call.skillId, call.input);
    call.skillId = normalizedCall.skillId;
    call.input = normalizedCall.input;
    if (
      call.skillId === 'spectrum.manageImages'
      && call.input?.action === 'select'
      && hasSpectrumVisualAnalysisIntent(meta.prompt)
    ) {
      call.input = {
        ...extractSpectrumSearchInput(meta.prompt),
        ...call.input,
        action: 'search',
        mode: call.input?.mode === 'filtered' || call.input?.mode === 'active'
          ? call.input.mode
          : 'selected',
      };
    }
    if (call.skillId === 'spectrum.manageImages' && call.input?.action === 'search') {
      call.input = fillSpectrumSearchInputFallback(call.input, meta.prompt);
    }
    if (call.skillId === 'assistant.openPage' && isDataQueryIntent(meta.prompt)) {
      console.info('[project-skills] Ignored accidental openPage skill call for data query:', meta.prompt);
      return null;
    }
    if (typeof meta.onBeforeExecute === 'function') {
      try {
        meta.onBeforeExecute(call);
      } catch (error) {
        console.warn('[project-skills] onBeforeExecute failed:', error);
      }
    }
    return executeSkill(call.skillId, call.input, {
      ...meta,
      source: meta.source || 'assistant-skill-call',
      reason: call.reason,
    });
  };

  const getAiProtocolContext = (options = {} as any) => {
    const kind = String(options.kind || options.plan?.kind || '').trim();
    if (kind === 'chat' || kind === 'web-search') return '';
    const requestedSkillId = String(options.skillId || options.plan?.localSkillPlan?.skillId || '').trim();
    const fullProtocol = !kind || (!requestedSkillId && kind === 'local-tool');
    const selectedSkills = getSkillRegistry().filter((skill) => {
      if (fullProtocol) return true;
      if (requestedSkillId) return skill.id === requestedSkillId;
      if (kind === 'image-generation') return skill.id === 'media.generateImage';
      if (kind === 'image-analysis') return ['media.analyzeImages', 'spectrum.manageImages'].includes(skill.id);
      return false;
    });
    if (!selectedSkills.length) return '';
    const skills = selectedSkills.map((skill) => (
      `- ${skill.id}：${skill.title}；输入 ${formatCompactJsonSpec(skill.inputSpec)}；输出 ${formatCompactJsonSpec(skill.outputSpec)}`
    ));
    const commonRules = [
      '【项目技能调用协议】',
      '你是项目技能调度器：先理解用户真实意图，再从可用技能中选择最合适的技能和参数。',
      '当用户要求执行项目内操作、修改页面数据、整理/删除/归类/打标/跳转/查询项目数据时，优先调用项目技能，不要凭空声称已经操作。',
      '如果需要让前端执行技能，只输出严格 JSON，不要混入解释、Markdown 或自然语言：',
      formatCompactJsonSpec(SKILL_CALL_EXAMPLE),
      '技能执行后，前端会把执行结果回写给用户。',
    ];
    const localRules = [
      `用户明确要求打开、进入、切换、跳转或查看某个“页面/面板/中心”时，才调用 assistant.openPage。可切换页面：${getPageCatalog()}`,
      '用户询问“几个、多少、有哪些、哪几个、列表、明细、统计、当前、现在”等数据问题时，不要调用 assistant.openPage，应直接回答或调取数据上下文。',
      '用户提到“当前、选中、本页、筛选结果”时，必须保留这个范围意图；需要联合当前页面上下文时优先使用 analysis.buildJointPackage，并设置 forceCurrentPage=true。',
      '用户在同一句里同时提到物性和图谱，或要求“结合/联合/综合”物性与图谱分析时，必须优先使用 analysis.buildJointPackage；联合意图优先于下面的单独物性或单独图谱规则。',
      '物性技能分工：查分类目录、工作表、型号、批次或明细用 property.searchRows；均值/极值/波动/趋势用 property.summarizeMetrics；型号或批次差异用 property.compareRows；合格/超标/检测范围用 property.validateRanges。物性分类由页面工作表/页签表达，不要求数据行里存在“分类”字段。物性问题禁止调用 business.queryPageData。',
      '用户明确提到图谱、谱图、图片、DSC/TGA 曲线或图谱库时，优先调用 spectrum.manageImages，并用 action=search 检索；不要因为问题里有型号或系列号就改调 property.searchRows。',
      '只有用户明确要求联合物性+图谱、跨模块分析、当前页完整上下文时才用 analysis.buildJointPackage。',
      '物性数据默认上传所有符合条件的匹配行；只有用户明确说“前 N 条/只要 N 行/显示 N 个”等数量限制时，才限制上传数量。',
      '凡是调用 property.* 查找并上传数据，前端会先展示完整匹配数据表格；AI 后续只需要继续输出分析结果，不要重复生成表格。',
    ];
    const spectrumRules = [
      '凡是调用 spectrum.manageImages 且 action=search 检索图谱，前端会在用户二次授权确认后把全部匹配图谱图片作为视觉输入交给 AI；AI 后续必须基于曲线/峰形/标注做图谱对比分析，不要只总结标题、分类、标签。',
      '图谱图片默认上传所有符合条件的匹配图片；只有用户明确说“前 N 张/只要 N 张/显示 N 个”等数量限制时，才给 spectrum.manageImages 填写 limit。',
      '用户说“当前、选中、已选、本页、筛选结果、这张”等范围词并且要分析图谱时，调用 spectrum.manageImages 时必须填写 action=search 和 mode，例如选中范围用 mode=selected，不要把“选中”当成 query 关键词。',
      '图谱数据处理统一调用 spectrum.manageImages：查询 action=search；新增 action=create；选择 action=select；修改标题/分类/日期/备注 action=update；标签 action=tag；归类 action=categorize；删除 action=delete。',
      '注意：spectrum.manageImages 的 action=select 只用于改变左侧图谱库的勾选状态，不会上传图片、不会做视觉分析。用户说“分析选中的图谱/看一下已选图谱/对比当前选中图片”时，必须调用 action=search 并设置 mode=selected。',
      '所有增删改都必须给出明确 target 或 mode。单个对象优先使用名称/编号精确匹配；用户说“当前选中”用 mode=selected，说“当前筛选/当前分类”用 mode=filtered。',
      '如果目标可能命中无关数据，先调用 spectrum.manageImages 的 action=search 或 action=select 缩小范围，不要一次处理大范围模糊数据。增删改单次默认 maxAffected=30，删除默认更保守。',
    ];
    const formulaRules = [
      '配方数据处理：用户要求创建、 新增或生成配方记录时，调用 formula.createRecipe；不要只用自然语言声称已创建。',
    ];
    const imageRules = [
      '图片生成只调用 media.generateImage，不要输出自然语言假装已生成。',
      '图片分析只在用户明确要求看图、读图、分析图谱或当前图片时调用 media.analyzeImages。',
    ];
    const rules = [
      ...commonRules,
      ...(fullProtocol || ['business.queryPageData', 'assistant.openPage', 'analysis.buildJointPackage'].includes(requestedSkillId) || requestedSkillId.startsWith('property.') ? localRules : []),
      ...(fullProtocol || kind === 'image-analysis' || requestedSkillId === 'spectrum.manageImages' || requestedSkillId === 'media.analyzeImages' ? spectrumRules : []),
      ...(fullProtocol || requestedSkillId === 'formula.createRecipe' ? formulaRules : []),
      ...(kind === 'image-generation' || kind === 'image-analysis' || requestedSkillId?.startsWith('media.') ? imageRules : []),
      '如果技能返回多个候选对象，前端会生成可点击的候选按钮，用户点击后再执行对应对象。',
      '如果用户表达含糊，你可以选择最接近的技能并填入从语义中推断出的参数；缺少关键参数时再自然语言追问。',
      '可用技能：',
      ...skills,
    ];
    return rules.join('\n');
  };

  const renderHistory = () => {
    const node = document.getElementById('projectSkillHistory');
    if (!node) return;
    const history = readHistory();
    if (!history.length) {
      node.innerHTML = `
        <div class="project-skill-empty">
          <span class="project-skill-empty-icon"><i class="ti ti-clock-off" aria-hidden="true"></i></span>
          <strong>暂无技能执行记录</strong>
          <p>点击左侧技能示例按钮，或在聊天中描述操作需求，技能执行后会记录在这里。</p>
        </div>
      `;
      return;
    }
    node.innerHTML = history.map((item, index) => `
      <article class="project-skill-log-item${index === 0 ? ' is-latest' : ''}">
        <div class="project-skill-log-indicator">
          <span class="project-skill-log-dot ${item.ok ? 'is-ok' : 'is-warn'}"></span>
          ${index < history.length - 1 ? '<span class="project-skill-log-line"></span>' : ''}
        </div>
        <div class="project-skill-log-body">
          <div class="project-skill-log-head">
            <span class="project-skill-log-badge ${item.ok ? 'is-ok' : 'is-warn'}">${item.ok ? '完成' : '未完成'}</span>
            <em>${esc(item.at || '')}</em>
          </div>
          <strong>${esc(item.title || item.skillId)}</strong>
          <p>${esc(item.message || '')}</p>
          <div class="project-skill-log-meta">
            <span>耗时 ${esc(`${Math.max(0, Number(item.durationMs || 0))} ms`)}</span>
            <span>输入 ${esc(formatBytes(item.inputSize))}</span>
            <span>输出 ${esc(formatBytes(item.outputSize))}</span>
          </div>
        </div>
      </article>
    `).join('');
  };

  const getLevelClass = (level) => {
    const map = { '执行型': 'action', '查询型': 'query', '分析型': 'analysis', '上下文型': 'context' };
    return map[level] || 'action';
  };

  const render = () => {
    if (!refs.projectSkillPanel) return;
    const skills = getToolCatalog();
    const toolDefinitions = getToolRegistry().list();
    const manifestPages = App.businessPages?.getAgentManifestPages?.() || [];
    const issueCount = skills.reduce((count, skill) => (
      count
      + (skill?.id ? 0 : 1)
      + (skill?.inputShape && skill?.outputShape ? 0 : 1)
    ), 0);
    const catalogSummary = buildSkillCatalogSummary(toolDefinitions, {
      totalPages: Object.keys(constants.PAGE_DEFS || {}).length,
      structuredPages: manifestPages.length,
      issueCount,
    });
    const grouped = new Map();
    skills.forEach((skill) => {
      const module = skill.module || '其他';
      if (!grouped.has(module)) grouped.set(module, []);
      grouped.get(module).push(skill);
    });
    refs.projectSkillPanel.innerHTML = `
      <section class="project-skill-workspace">
        <section class="project-skill-list-panel" aria-label="项目技能列表">
          <div class="project-skill-history-head">
            <div>
              <div class="project-skill-kicker">Skills</div>
              <h2>项目技能 <em class="project-skill-count">${skills.length} 项</em></h2>
            </div>
            <div class="project-skill-search-wrap">
              <i class="ti ti-search" aria-hidden="true"></i>
              <input class="project-skill-search" type="search" id="projectSkillSearch" placeholder="搜索技能..." autocomplete="off">
            </div>
          </div>
          <section class="project-skill-summary" aria-label="AI 技能覆盖概览">
            <article><span>可执行技能</span><strong>${catalogSummary.executableSkills}</strong><em>共 ${catalogSummary.totalSkills} 项</em></article>
            <article><span>能力模块</span><strong>${catalogSummary.modules}</strong><em>分析型 ${catalogSummary.analysisSkills} 项</em></article>
            <article><span>页面数据覆盖</span><strong>${catalogSummary.pageCoveragePercent}%</strong><em>${catalogSummary.structuredPages}/${catalogSummary.totalPages} 个页面</em></article>
            <article class="${catalogSummary.issueCount ? 'is-warn' : 'is-ok'}"><span>注册异常</span><strong>${catalogSummary.issueCount}</strong><em>${catalogSummary.issueCount ? '建议运行能力审计' : '注册层正常'}</em></article>
          </section>
          <div class="project-skill-grid">
            <div class="project-skill-search-empty" id="projectSkillSearchEmpty" hidden>
              <i class="ti ti-search-off" aria-hidden="true"></i>
              <strong>没有匹配的已注册技能</strong>
              <span>请尝试业务对象、技能 ID、操作名称或示例指令。</span>
            </div>
            ${[...grouped.entries()].map(([module, moduleSkills]) => `
              <div class="project-skill-module-group">
                <div class="project-skill-module-header">
                  <span>${esc(module)}</span>
                  <em>${moduleSkills.length} 项技能</em>
                </div>
                ${moduleSkills.map((skill) => `
                  <article class="project-skill-card" data-skill-search="${esc(getSkillSearchText(skill))}">
                    <div class="project-skill-card-top">
                      <span class="project-skill-icon"><i class="ti ${esc(skill.icon)}" aria-hidden="true"></i></span>
                      <div>
                        <strong>${esc(skill.title)}</strong>
                        <em>${esc(skill.module)} · <span class="project-skill-level project-skill-level--${getLevelClass(skill.level)}">${esc(skill.level)}</span></em>
                      </div>
                    </div>
                    <p>${esc(skill.summary)}</p>
                    ${Array.isArray(skill.actionDocs) && skill.actionDocs.length ? `
                      <section class="project-skill-manual-section" aria-label="${esc(skill.title)} 操作类型">
                        <div class="project-skill-section-title">
                          <i class="ti ti-list-check" aria-hidden="true"></i>
                          <span>操作类型</span>
                        </div>
                        <div class="project-skill-action-table">
                          <div class="project-skill-action-row is-head">
                            <span>action</span>
                            <span>用途</span>
                            <span>关键参数</span>
                            <span>返回内容</span>
                          </div>
                          ${skill.actionDocs.map(([action, purpose, params, result]) => `
                            <div class="project-skill-action-row">
                              <code>${esc(action)}</code>
                              <span>${esc(purpose)}</span>
                              <span>${esc(params)}</span>
                              <span>${esc(result)}</span>
                            </div>
                          `).join('')}
                        </div>
                      </section>
                    ` : ''}
                    ${Array.isArray(skill.paramDocs) && skill.paramDocs.length ? `
                      <section class="project-skill-manual-section" aria-label="${esc(skill.title)} 参数说明">
                        <div class="project-skill-section-title">
                          <i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>
                          <span>参数说明</span>
                        </div>
                        <div class="project-skill-doc-table project-skill-doc-table--params">
                          <div class="project-skill-doc-row is-head">
                            <span>参数</span>
                            <span>定义</span>
                            <span>要求</span>
                          </div>
                          ${skill.paramDocs.map(([name, desc, required]) => `
                            <div class="project-skill-doc-row">
                              <code>${esc(name)}</code>
                              <span>${esc(desc)}</span>
                              <span>${esc(required)}</span>
                            </div>
                          `).join('')}
                        </div>
                      </section>
                    ` : ''}
                    ${Array.isArray(skill.resultDocs) && skill.resultDocs.length ? `
                      <section class="project-skill-manual-section" aria-label="${esc(skill.title)} 返回字段">
                        <div class="project-skill-section-title">
                          <i class="ti ti-arrow-back-up" aria-hidden="true"></i>
                          <span>返回字段</span>
                        </div>
                        <div class="project-skill-doc-table project-skill-doc-table--results">
                          <div class="project-skill-doc-row is-head">
                            <span>字段</span>
                            <span>说明</span>
                          </div>
                          ${skill.resultDocs.map(([name, desc]) => `
                            <div class="project-skill-doc-row">
                              <code>${esc(name)}</code>
                              <span>${esc(desc)}</span>
                            </div>
                          `).join('')}
                        </div>
                      </section>
                    ` : ''}
                    <div class="project-skill-schema">
                      <div>
                        <span><i class="ti ti-braces" aria-hidden="true"></i> 输入参数 JSON</span>
                        <pre><code>${esc(formatJsonSpec(skill.inputSpec))}</code></pre>
                      </div>
                      <div>
                        <span><i class="ti ti-arrow-back-up" aria-hidden="true"></i> 返回结果 JSON</span>
                        <pre><code>${esc(formatJsonSpec(skill.outputSpec))}</code></pre>
                      </div>
                    </div>
                    <div class="project-skill-example-block">
                      <div class="project-skill-section-title">
                        <i class="ti ti-message-circle" aria-hidden="true"></i>
                        <span>示例指令</span>
                      </div>
                      <div class="project-skill-examples">
                        ${skill.examples.map((example) => `<button type="button" data-skill-example="${esc(example)}">${esc(example)}</button>`).join('')}
                      </div>
                    </div>
                  </article>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </section>

        <section class="project-skill-history-panel">
          <div class="project-skill-history-head">
            <div>
              <div class="project-skill-kicker">Execution Log</div>
              <h2>调用情况</h2>
            </div>
            <button class="project-skill-clear-btn" type="button" id="projectSkillClearHistoryBtn">
              <i class="ti ti-eraser" aria-hidden="true"></i>
              <span>清空记录</span>
            </button>
          </div>
          <div class="project-skill-history" id="projectSkillHistory"></div>
        </section>
      </section>
    `;
    renderHistory();
  };

  const bind = () => {
    eventController?.abort();
    eventController = new AbortController();
    const eventSignal = eventController.signal;
    refs.projectSkillPanel?.addEventListener('input', (event) => {
      const input = event.target;
      if (input?.id !== 'projectSkillSearch') return;
      const query = normalizeText(input.value || '');
      const terms = query.split(/[\s,，、/]+/).filter(Boolean);
      const cards = refs.projectSkillPanel?.querySelectorAll('.project-skill-card');
      const groups = refs.projectSkillPanel?.querySelectorAll('.project-skill-module-group');
      if (!cards || !groups) return;
      let anyVisible = false;
      groups.forEach((group) => {
        let groupVisible = false;
        group.querySelectorAll('.project-skill-card').forEach((card) => {
          const searchText = normalizeText(card.getAttribute('data-skill-search') || '');
          const visible = !terms.length || terms.every((term) => searchText.includes(term));
          card.style.display = visible ? '' : 'none';
          if (visible) groupVisible = true;
        });
        group.style.display = groupVisible ? '' : 'none';
        if (groupVisible) anyVisible = true;
      });
      const empty = refs.projectSkillPanel?.querySelector('#projectSkillSearchEmpty');
      if (empty instanceof HTMLElement) empty.hidden = anyVisible;
    });

    refs.projectSkillPanel?.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const exampleButton = target.closest('[data-skill-example]');
      if (exampleButton) {
        App.chat?.draftPrompt?.(exampleButton.getAttribute('data-skill-example') || '');
        App.navigation?.setAssistantCollapsed?.(false);
        return;
      }

      if (target.closest('#projectSkillClearHistoryBtn')) {
        const confirmed = await App.confirmDialog?.confirmDelete?.({
          title: '清空调用记录',
          message: '确认清空项目技能调用记录？',
          confirmText: '确认清空',
        });
        if (!confirmed) return;
        writeHistory([]);
        render();
        App.notify?.warn?.('已清空项目技能调用记录', { key: 'project-skills-clear-history' });
      }
    });
  };

  const cleanup = () => {
    eventController?.abort();
    eventController = null;
  };

  const init = () => {
    bind();
    render();
  };

  App.projectSkills = {
    init,
    cleanup,
    render,
    getSkillRegistry,
    getLegacySkillRegistry,
    getToolRegistry,
    getToolCatalog,
    getProjectManifest: buildProjectManifest,
    getAiProtocolContext,
    routePrompt,
    executePrompt,
    executeSkill,
    executeSkillCallFromText,
    formatSkillMessage,
    getResultActions,
  };
})();


