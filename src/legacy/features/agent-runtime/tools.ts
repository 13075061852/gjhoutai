import { mapImageGenerationParams } from './media';

const normalizeText = (value: unknown) => String(value || '').trim();
const runtimeSkillDefinitionCache = new WeakMap<object, any[]>();

const buildRuntimeSkillDefinitions = (App: any) => [
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
    async handler(input: Record<string, any> = {} as any) {
      const pageKey = App?.constants?.NAV_PAGE_KEY || 'sidebar-active-page';
      const pageId = localStorage.getItem(pageKey) || 'dashboard';
      const pageDef = App?.constants?.PAGE_DEFS?.[pageId] || {};
      const title = String(pageDef.title || pageId);
      const systemName = '广俊塑料科技后台管理系统';
      const question = normalizeText(input.question);
      const pages = Object.entries(App?.constants?.PAGE_DEFS || {})
        .slice(0, 12)
        .map(([id, def]: [string, any]) => `${def?.title || id}`)
        .join('、');
      const manifest = App?.projectSkills?.getProjectManifest?.() || App?.agentButler?.getProjectManifest?.() || {};
      const manifestPages = Array.isArray(manifest.pages) ? manifest.pages : [];
      const manifestSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
      const dataSources = Array.isArray(manifest.dataSources) ? manifest.dataSources : [];
      const currentData = manifest.currentData && typeof manifest.currentData === 'object' ? manifest.currentData : {};
      const currentRecordCount = Object.values(currentData).reduce((total: number, count) => total + (Number(count) || 0), 0);
      const asksAssistant = /你是谁|你是什么|你能做什么|你会什么|介绍一下你自己/.test(question);
      const message = asksAssistant
        ? `我是 ${systemName} 的项目级 AI 助手。当前可读取 ${manifestPages.length || Object.keys(App?.constants?.PAGE_DEFS || {}).length} 个页面、调用 ${manifestSkills.length || '已注册'} 项项目技能，并结合后台现有数据回答问题。`
        : `当前页面是「${title}」。${pageDef.desc ? `它的用途是：${pageDef.desc}` : '该页面已注册在后台导航中。'}`;
      return {
        ok: true,
        message,
        details: [
          `当前页面 ID：${pageId}`,
          pageDef.eyebrow ? `所属模块：${pageDef.eyebrow}` : '',
          pages ? `已注册页面示例：${pages}` : '',
          dataSources.length ? `可用数据源：${dataSources.join('、')}` : '',
          currentRecordCount ? `当前已接入结构化记录：${currentRecordCount} 条` : '',
        ].filter(Boolean),
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
    summary: '调用 APIMart 图片生成任务，返回 task_id 并在 AI 绘图页面历史中继续轮询。',
    inputSpec: '{ "prompt": "图片提示词", "size": "16:9", "resolution": "1k", "count": 1, "referenceUrls": [] }',
    outputSpec: '{ "ok": true, "taskId": "...", "params": {} }',
    paramDocs: [
      ['prompt', '图片生成提示词', '必填'],
      ['size', '画面比例，默认 16:9', '可选'],
      ['resolution', '分辨率，默认 1k', '可选'],
      ['count', '生成数量 1-4', '可选'],
    ],
    resultDocs: [
      ['taskId', 'APIMart 生成任务 ID'],
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

