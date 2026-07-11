import { mapImageGenerationParams } from './media';

const normalizeText = (value: unknown) => String(value || '').trim();
const runtimeSkillDefinitionCache = new WeakMap<object, any[]>();

const getCapabilitySearchTerms = (value: unknown) => {
  const raw = normalizeText(value).toLowerCase();
  const cleaned = raw
    .replace(/(?:请问|帮我|一下|查询|搜索|查找|寻找|能力|功能|技能|支持|有没有|是否|能不能|可以|如何|怎么)/g, ' ')
    .trim();
  const terms = cleaned.split(/[\s,，、/]+/).filter(Boolean);
  return terms.length ? terms : (raw ? [raw] : []);
};

const scoreCapabilityText = (text: unknown, terms: string[]) => {
  const haystack = normalizeText(text).toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? Math.max(1, term.length) : 0), 0);
};

const buildRuntimeSkillDefinitions = (App: any) => [
  {
    id: 'assistant.modelInfo',
    title: '读取当前模型信息',
    module: 'AI 配置',
    icon: 'ti-brain',
    level: '查询型',
    summary: '读取本次会话实际配置的模型提供商和模型标识，不返回 API Key 等敏感配置。',
    inputSpec: '{}',
    outputSpec: '{ "ok": true, "provider": "...", "model": "...", "configured": true }',
    examples: ['你是什么模型', '当前使用哪个模型', '这次回答由哪个模型生成'],
    infer(prompt: string) {
      if (!/(?:你是什么|你是哪个|当前(?:使用|用的|配置的)?|现在(?:使用|用的)?|本次(?:使用|调用)?|这个会话(?:使用|用的)?|用的是什么|使用的是什么|调用的是什么)(?:ai)?模型|(?:哪个|什么)模型(?:在回答|正在回答|生成|用于本次)|模型(?:名称|信息|供应商|提供商)(?:是什么|为|是哪个)?/i.test(normalizeText(prompt))) return null;
      return { skillId: this.id, confidence: 0.96, input: {} };
    },
    async handler() {
      const config = App?.config?.getFormConfig?.() || {};
      const provider = normalizeText(config.aiProvider || '未配置');
      const model = normalizeText(App?.config?.getResolvedModel?.() || config.model || config.modelChoice || '未选择');
      const configured = provider === 'lmstudio' || Boolean(config.apiKey);
      return {
        ok: true,
        message: '已读取当前会话的模型配置。',
        details: [],
        data: { provider, model, configured },
      };
    },
  },
  {
    id: 'project.searchCapabilities',
    title: '搜索项目能力',
    module: '项目管家',
    icon: 'ti-sparkles',
    level: '查询型',
    summary: '从真实页面清单和技能注册表中查找可用能力，明确能做什么、入口在哪里以及是否已有确定性工具。',
    inputSpec: '{ "query": "要解决的问题或能力关键词", "limit": 8 }',
    outputSpec: '{ "ok": true, "pages": [], "skills": [], "supported": true }',
    paramDocs: [
      ['query', '能力、模块或问题关键词', '必填'],
      ['limit', '页面和技能各自最多返回数量，默认 8', '可选'],
    ],
    resultDocs: [
      ['pages', '真实命中的项目页面'],
      ['skills', '真实命中的可执行技能'],
      ['supported', '当前项目是否存在匹配能力'],
    ],
    examples: ['查找库存查询能力', '哪个技能可以检查项目运行状态', '这个项目能不能分析业务总览'],
    infer(prompt: string) {
      const text = normalizeText(prompt);
      if (!/(?:哪个|什么|查找|搜索|有没有|是否有|支持|能不能|可以).*(?:技能|能力|功能|页面)|(?:技能|能力|功能|页面).*(?:哪个|什么|查找|搜索|有没有|支持|能不能)/.test(text)) return null;
      return { skillId: this.id, confidence: 0.9, input: { query: text, limit: 8 } };
    },
    async handler(input: Record<string, any> = {} as any) {
      const query = normalizeText(input.query || input.question);
      if (!query) return { ok: false, message: '请提供要查找的项目能力关键词。' };
      const terms = getCapabilitySearchTerms(query);
      const limit = Math.max(1, Math.min(20, Number(input.limit) || 8));
      const pages = Object.entries(App?.constants?.PAGE_DEFS || {})
        .map(([pageId, def]: [string, any]) => ({
          pageId,
          title: normalizeText(def?.title || pageId),
          desc: normalizeText(def?.desc),
          score: scoreCapabilityText(`${pageId} ${def?.title || ''} ${def?.desc || ''}`, terms),
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map(({ score, ...item }) => item);
      const skills = (App?.projectSkills?.getSkillRegistry?.() || [])
        .map((skill: any) => ({
          id: normalizeText(skill?.id),
          title: normalizeText(skill?.title),
          module: normalizeText(skill?.module),
          summary: normalizeText(skill?.summary),
          level: normalizeText(skill?.level),
          score: scoreCapabilityText(`${skill?.id || ''} ${skill?.title || ''} ${skill?.module || ''} ${skill?.summary || ''}`, terms),
        }))
        .filter((item: any) => item.id && item.score > 0)
        .sort((left: any, right: any) => right.score - left.score)
        .slice(0, limit)
        .map(({ score, ...item }: any) => item);
      const supported = Boolean(pages.length || skills.length);
      return {
        ok: true,
        message: supported ? `找到 ${pages.length} 个相关页面和 ${skills.length} 项相关技能。` : '当前项目没有找到匹配的已注册能力。',
        details: supported ? ['结果来自当前页面清单和技能注册表，不包含模型猜测。'] : ['可以改用更具体的业务对象或操作关键词重试。'],
        data: { query, supported, pages, skills },
      };
    },
  },
  {
    id: 'project.auditRuntime',
    title: '审计 Agent 运行能力',
    module: '项目管家',
    icon: 'ti-shield-check',
    level: '分析型',
    summary: '检查页面、结构化数据、技能处理器和 AI 配置是否完整，输出真实能力覆盖与缺口，不读取或展示密钥。',
    inputSpec: '{}',
    outputSpec: '{ "ok": true, "coverage": {}, "issues": [], "configuration": {} }',
    examples: ['检查 Agent 能力是否完整', '诊断为什么 AI 不能读取项目数据', '审计项目管家运行状态'],
    infer(prompt: string) {
      const text = normalizeText(prompt);
      if (!/(?:审计|检查|诊断|排查).*(?:agent|ai|助手|管家|技能|能力|项目)|(?:agent|ai|助手|管家|技能).*(?:异常|问题|完整|健康|状态)/i.test(text)) return null;
      return { skillId: this.id, confidence: 0.93, input: {} };
    },
    async handler() {
      const pageEntries = Object.entries(App?.constants?.PAGE_DEFS || {});
      const structuredPages = App?.businessPages?.getAgentManifestPages?.() || [];
      const skills = App?.projectSkills?.getSkillRegistry?.() || [];
      const ids = skills.map((skill: any) => normalizeText(skill?.id)).filter(Boolean);
      const duplicateIds = [...new Set(ids.filter((id: string, index: number) => ids.indexOf(id) !== index))];
      const issues: string[] = [];
      skills.forEach((skill: any) => {
        if (!normalizeText(skill?.id)) issues.push(`存在缺少 id 的技能：${normalizeText(skill?.title) || '未命名技能'}`);
        if (typeof skill?.handler !== 'function') issues.push(`技能 ${normalizeText(skill?.id) || normalizeText(skill?.title)} 缺少处理器`);
        if (!skill?.inputSpec || !skill?.outputSpec) issues.push(`技能 ${normalizeText(skill?.id) || normalizeText(skill?.title)} 缺少输入或输出规范`);
      });
      duplicateIds.forEach((id) => issues.push(`技能 ID 重复：${id}`));
      const config = App?.config?.getFormConfig?.() || {};
      const configured = config.aiProvider === 'lmstudio' || Boolean(config.apiKey);
      if (!configured) issues.push('AI 模型尚未配置 API Key，且未使用 LM Studio。');
      const coverage = {
        totalPages: pageEntries.length,
        structuredPages: structuredPages.length,
        pageCoveragePercent: pageEntries.length ? Math.round((structuredPages.length / pageEntries.length) * 100) : 0,
        totalSkills: skills.length,
        executableSkills: skills.filter((skill: any) => typeof skill?.handler === 'function').length,
      };
      return {
        ok: true,
        message: issues.length ? `Agent 运行审计完成，发现 ${issues.length} 项需要处理。` : 'Agent 运行审计完成，当前未发现注册层异常。',
        details: [`页面结构化覆盖：${coverage.structuredPages}/${coverage.totalPages}`, `可执行技能：${coverage.executableSkills}/${coverage.totalSkills}`],
        data: {
          coverage,
          issues,
          configuration: {
            provider: normalizeText(config.aiProvider || '未配置'),
            model: normalizeText(config.model || config.modelId || '未选择'),
            credentialConfigured: configured,
          },
        },
      };
    },
  },
  {
    id: 'business.analyzeOverview',
    title: '分析全局业务总览',
    module: '业务数据',
    icon: 'ti-chart-dots-3',
    level: '分析型',
    summary: '跨已接入业务页面读取记录数和状态分布，生成可追溯的全局业务快照。',
    inputSpec: '{ "pageIds": [], "includeStatusGroups": true }',
    outputSpec: '{ "ok": true, "totalRecords": 0, "pages": [], "statusGroups": {} }',
    examples: ['分析整个后台现在的业务情况', '给我项目经营总览', '检查订单库存采购的整体状态'],
    infer(prompt: string) {
      const text = normalizeText(prompt);
      if (!/(?:全局|整体|整个|综合|经营|业务|项目).*(?:总览|概况|情况|状态|分析|风险)|(?:总览|概况).*(?:业务|项目|后台)/.test(text)) return null;
      return { skillId: this.id, confidence: 0.91, input: { includeStatusGroups: true } };
    },
    async handler(input: Record<string, any> = {} as any) {
      if (!App?.businessPages?.getAgentManifestPages || !App?.businessPages?.queryAgentData) {
        return { ok: false, message: '业务页面尚未完整接入 Agent 结构化查询接口。' };
      }
      const requestedPageIds = Array.isArray(input.pageIds) ? input.pageIds.map(normalizeText).filter(Boolean) : [];
      const manifestPages = (App.businessPages.getAgentManifestPages() || [])
        .filter((page: any) => !requestedPageIds.length || requestedPageIds.includes(page.pageId));
      const pages = manifestPages.map((page: any) => {
        const result = App.businessPages.queryAgentData({ pageId: page.pageId, intent: 'count' });
        return {
          pageId: page.pageId,
          title: page.title || page.pageId,
          ok: result?.ok !== false,
          rowCount: Number(result?.rowCount ?? page.rowCount ?? 0),
          summary: normalizeText(result?.summary),
        };
      });
      const statusGroups: Record<string, any[]> = {};
      if (input.includeStatusGroups !== false) {
        manifestPages.forEach((page: any) => {
          const result = App.businessPages.queryAgentData({ pageId: page.pageId, intent: 'aggregate', groupBy: 'status' });
          if (result?.ok !== false && Array.isArray(result?.data) && result.data.length) statusGroups[page.pageId] = result.data;
        });
      }
      const totalRecords = pages.reduce((total: number, page: any) => total + page.rowCount, 0);
      return {
        ok: true,
        message: `已读取 ${pages.length} 个业务页面，共 ${totalRecords} 条结构化记录。`,
        details: pages.map((page: any) => `${page.title}：${page.rowCount} 条`),
        data: { totalRecords, pages, statusGroups, generatedAt: new Date().toISOString() },
      };
    },
  },
  {
    id: 'assistant.currentPage',
    title: '读取当前页面',
    module: '导航',
    icon: 'ti-current-location',
    level: '查询型',
    summary: '读取当前导航状态，回答用户当前处于哪个页面或模块。',
    inputSpec: '{}',
    outputSpec: '{ "ok": true, "pageId": "...", "title": "...", "eyebrow": "..." }',
    examples: ['我现在处于什么界面', '当前是什么页面'],
    infer(prompt: string) {
      if (!/(?:我)?(?:现在|当前)?(?:处于|在|打开的是|所在的是).*(?:什么|哪个|哪一个)?(?:界面|页面|模块)|(?:当前|现在)(?:是)?(?:什么|哪个|哪一个)?(?:界面|页面|模块)/.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.94, input: {} };
    },
    async handler() {
      const pageKey = App?.constants?.NAV_PAGE_KEY || 'sidebar-active-page';
      const pageId = localStorage.getItem(pageKey) || 'dashboard';
      const def = App?.constants?.PAGE_DEFS?.[pageId] || {};
      const title = String(def.title || pageId);
      const eyebrow = String(def.eyebrow || '');
      const desc = String(def.desc || '');
      return {
        ok: true,
        message: `你当前处于「${title}」页面。`,
        details: [
          `页面 ID：${pageId}`,
          eyebrow ? `模块：${eyebrow}` : '',
          desc ? `说明：${desc}` : '',
        ].filter(Boolean),
        data: { pageId, title, eyebrow, desc },
      };
    },
  },
  {
    id: 'assistant.projectGuide',
    title: '读取项目说明',
    module: '项目管家',
    icon: 'ti-info-circle',
    level: '查询型',
    summary: '读取当前项目、当前页面和已注册模块说明，用于回答页面功能、系统用途和助手能力问题。',
    inputSpec: '{ "question": "用户问题" }',
    outputSpec: '{ "ok": true, "message": "...", "pageId": "...", "title": "..." }',
    examples: ['这个页面是做什么的', '你能做什么', '这个后台有哪些功能'],
    infer(prompt: string) {
      if (!/(?:这个|当前|本|该)?(?:页面|模块|功能|系统|项目|网站|应用|平台).*(?:做什么|是什么|用途|作用|介绍|说明|怎么用|如何使用|有什么|包含|能干嘛)|(?:你是谁|你是什么|你能做什么|你会什么|介绍一下你自己|这个后台能做什么)/.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.88, input: { question: prompt } };
    },
    async handler() {
      const pageKey = App?.constants?.NAV_PAGE_KEY || 'sidebar-active-page';
      const pageId = localStorage.getItem(pageKey) || 'dashboard';
      const pageDef = App?.constants?.PAGE_DEFS?.[pageId] || {};
      const title = String(pageDef.title || pageId);
      const systemName = '广俊塑料科技后台管理系统';
      const manifest = App?.projectSkills?.getProjectManifest?.() || App?.agentButler?.getProjectManifest?.() || {};
      return {
        ok: true,
        message: '已读取项目、当前页面和可用能力信息。',
        details: [],
        data: {
          systemName,
          pageId,
          title,
          eyebrow: String(pageDef.eyebrow || ''),
          desc: String(pageDef.desc || ''),
          manifest,
        },
      };
    },
  },
  {
    id: 'dataRecognition.searchHistory',
    title: '查询识别历史',
    module: '数据识别',
    icon: 'ti-history',
    level: '查询型',
    summary: '按文件名、型号、批次或模型查询数据识别历史摘要。',
    inputSpec: '{ "query": "型号/批次/关键词", "limit": 8 }',
    outputSpec: '{ "ok": true, "items": [], "rowCount": 0 }',
    paramDocs: [
      ['query', '检索关键词，可为空', '可选'],
      ['limit', '返回数量上限，默认 8', '可选'],
    ],
    resultDocs: [
      ['items', '识别历史摘要列表'],
      ['rowCount', '匹配历史数量'],
    ],
    examples: ['查询 320G6 的识别历史', '最近识别过哪些批次'],
    infer(prompt: string) {
      if (!/识别历史|识别记录|数据识别历史|识别过/.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.82, input: { query: prompt, limit: 8 } };
    },
    async handler(input: Record<string, any> = {} as any) {
      if (!App?.dataRecognition?.searchHistoryByAgent) {
        return { ok: false, message: '数据识别模块尚未暴露历史查询接口。' };
      }
      return App.dataRecognition.searchHistoryByAgent(input);
    },
  },
  {
    id: 'dataRecognition.inspectCurrent',
    title: '查看当前识别结果',
    module: '数据识别',
    icon: 'ti-table',
    level: '查询型',
    summary: '读取当前数据识别页的图片、文件名、行数和结构化表格结果。',
    inputSpec: '{}',
    outputSpec: '{ "ok": true, "fileName": "...", "rowCount": 0, "result": {} }',
    examples: ['查看当前识别结果', '当前图片识别出了什么'],
    infer(prompt: string) {
      if (!/当前.*识别|这张.*识别|识别结果|当前图片.*表格/.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.8, input: {} };
    },
    async handler() {
      if (!App?.dataRecognition?.inspectCurrentByAgent) {
        return { ok: false, message: '数据识别模块尚未暴露当前结果接口。' };
      }
      return App.dataRecognition.inspectCurrentByAgent();
    },
  },
  {
    id: 'media.generateImage',
    title: '生成图片',
    module: '媒体生成',
    icon: 'ti-photo-spark',
    level: '执行型',
    summary: '调用 LiblibAI 图片生成任务，返回 generateUuid 并在 AI 绘图页面历史中继续轮询。',
    inputSpec: '{ "prompt": "图片提示词", "size": "16:9", "resolution": "2k", "count": 1, "referenceUrls": [] }',
    outputSpec: '{ "ok": true, "taskId": "...", "params": {} }',
    paramDocs: [
      ['prompt', '图片生成提示词', '必填'],
      ['size', '画面比例，默认 16:9', '可选'],
      ['resolution', '分辨率，默认 2k', '可选'],
      ['count', '生成数量 1-4', '可选'],
    ],
    resultDocs: [
      ['taskId', 'LiblibAI 生成任务 ID'],
      ['params', '提交给图片生成接口的参数'],
    ],
    examples: ['生成一张产品海报', '画一张工厂质检封面图'],
    infer(prompt: string) {
      if (!/(?:生成图片|生成图像|出图|画一张|画图|绘图|海报|封面|壁纸|插图)/.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.86, input: { prompt } };
    },
    async handler(input: Record<string, any> = {} as any) {
      const params = mapImageGenerationParams(input);
      if (!params.prompt) return { ok: false, message: '请先提供图片生成提示词。' };
      if (!App?.apimartMedia?.generateImage) return { ok: false, message: 'AI 绘图模块尚未初始化。' };
      const result = await App.apimartMedia.generateImage(params);
      return {
        ok: true,
        message: `图片生成任务已提交：${result?.taskId || '-'}`,
        details: ['可在 AI 绘图页面查看生成进度和结果。'],
        data: { taskId: result?.taskId || '', params },
      };
    },
  },
  {
    id: 'media.analyzeImages',
    title: '分析图片',
    module: '媒体理解',
    icon: 'ti-photo-search',
    level: '上下文型',
    summary: '整理当前图谱、抠图或上传图片，交给聊天模型做视觉分析。',
    inputSpec: '{ "question": "分析目标" }',
    outputSpec: '{ "ok": true, "context": "...", "images": [], "imageCount": 0 }',
    examples: ['分析当前选中的图谱', '看一下这张图片有什么问题'],
    infer(prompt: string) {
      if (!/(?:分析|看看|识别|读取|提取|对比|判断|解读).*(?:图谱|谱图|图片|图像|曲线|照片|dsc|tga|峰)|(?:图谱|谱图|图片|图像|曲线|照片).*(?:分析|识别|读取|提取|对比|判断|解读)/i.test(String(prompt || ''))) return null;
      return { skillId: this.id, confidence: 0.74, input: { question: prompt } };
    },
    async handler(input: Record<string, any> = {} as any) {
      const question = normalizeText(input.question || input.prompt || input.query);
      const activePageId = localStorage.getItem(App?.constants?.NAV_PAGE_KEY || 'sidebar-active-page') || '';
      const context = App?.agentButler?.buildContext?.({ question, activePageId, forceCurrentPage: true }) || '';
      const images = App?.agentButler?.getImages?.({ question, activePageId, forceCurrentPage: true }) || [];
      return {
        ok: Boolean(context || images.length),
        message: images.length ? `已整理 ${images.length} 张可分析图片。` : '当前没有找到可上传给视觉模型的图片。',
        details: context ? [`上下文长度：${context.length} 字符`] : [],
        data: { context, images, imageCount: images.length },
      };
    },
  },
];

export const createRuntimeSkillDefinitions = (App: any) => {
  if (!App || (typeof App !== 'object' && typeof App !== 'function')) return buildRuntimeSkillDefinitions(App);
  const cached = runtimeSkillDefinitionCache.get(App);
  if (cached) return cached;
  const definitions = buildRuntimeSkillDefinitions(App);
  runtimeSkillDefinitionCache.set(App, definitions);
  return definitions;
};

