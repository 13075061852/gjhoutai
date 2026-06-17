import type { AgentPlan, AgentSkillPlan } from './types';

const textOf = (value: unknown) => String(value || '').trim();

export const PROJECT_DATA_PATTERN = /(?:这个系统|这个项目|这个网站|后台|当前页面|当前|现在|几个|多少|数量|总数|有哪些|哪几个|列表|明细|最低|最少|最小|最高|最多|最大|库存|配方|订单|供应商|客户|人员|账号|账户|权限|物性|型号|批次|熔指|拉伸|弯曲|冲击|阻燃|灰份|强度|图谱|谱图|曲线|dsc|tga|抠图|识别历史|识别记录|数据识别)/i;
export const WEB_SEARCH_PATTERN = /(?:联网|搜索|网上|查一下|查找|最新|最近|今天|今日|昨日|昨天|明天|新闻|价格|报价|油价|汇率|天气|股价|行情|政策|法规|官网|资料来源|来源|链接|引用|版本|发布|趋势|市场|实时)/i;
export const IMAGE_GENERATION_PATTERN = /(?:生成图片|生成图像|出图|画一张|画图|绘图|海报|封面|壁纸|插图|生成.*(?:图片|图像|视觉|海报|封面))/i;
export const IMAGE_ANALYSIS_PATTERN = /(?:分析|看看|识别|读取|提取|对比|判断|解读).*(?:图谱|谱图|图片|图像|曲线|照片|dsc|tga|峰|标注)|(?:图谱|谱图|图片|图像|曲线|照片).*(?:分析|识别|读取|提取|对比|判断|解读)|分析这张|看这张|当前图/i;
export const OPEN_PAGE_PATTERN = /(?:打开|进入|切换到|跳转到|转到|去).*(?:页面|面板|中心|档案|管理|计划|库存|日志|仪表盘|助手|分析|配置|主题|技能|调用|费用|订单|客户|供应商|人员|权限|数据源|生产|配方|销售|开单|抠图|图谱|物性)/;
export const CURRENT_PAGE_PATTERN = /(?:我)?(?:当前|现在|目前)?(?:在|处于|位于|打开|打开的是|所在|所在的是)?(?:什么|哪个|哪一个)?(?:界面|页面|模块)|(?:我)?(?:当前|现在|目前)(?:在|处于|位于|打开|打开的是|所在|所在的是)|(?:什么|哪个|哪一个)(?:界面|页面|模块)/;
export const PAGE_GUIDE_PATTERN = /(?:这个|当前|本|该)?(?:页面|模块|功能|系统|项目|网站|应用|平台).*(?:做什么|是什么|用途|作用|介绍|说明|怎么用|如何使用|有什么|包含|能干嘛)|(?:你是谁|你是什么|你能做什么|你会什么|介绍一下你自己|这个后台能做什么)/;
export const BUSINESS_QUERY_PATTERN = /(?:查看|看一下|查询|统计|列出|列举|展示|罗列|了解|汇总|看看|查一下).*(?:订单|库存|配方|供应商|客户|人员|员工|账号|账户|生产|采购|权限|情况|状态)|(?:订单|库存|配方|供应商|客户|人员|员工|账号|账户|生产|采购|权限).*(?:情况|状态|几个|多少|数量|总数|有哪些|哪几个|列表|明细|当前|现在|最低|最少|最小|最高|最多|最大|怎么样|如何)/;
export const COMPLEX_PROJECT_ANALYSIS_PATTERN = /(?:综合分析|联合分析|对比分析|风险分析|原因分析|为什么|怎么优化|如何优化|给出建议|诊断|判断).*(?:订单|库存|配方|物性|图谱|生产|采购|客户|供应商|业务|数据)|(?:订单|库存|配方|物性|图谱|生产|采购|客户|供应商|业务|数据).*(?:综合分析|联合分析|对比分析|风险分析|原因分析|为什么|怎么优化|如何优化|给出建议|诊断|判断)/;

const buildLocalSkillPlan = (prompt: string): AgentSkillPlan | null => {
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

export const shouldUseProjectContextForPrompt = (prompt: unknown, activePageId = '') => {
  const text = textOf(prompt);
  if (!text) return false;
  if (PROJECT_DATA_PATTERN.test(text)) return true;
  return Boolean(activePageId && !['ai-config', 'apimart-media'].includes(activePageId));
};

export const shouldUseProjectAgentLoopForPrompt = (prompt: unknown) => COMPLEX_PROJECT_ANALYSIS_PATTERN.test(textOf(prompt));

export const shouldUseWebSearchForPrompt = (prompt: unknown, options: { projectFirst?: boolean } = {}) => {
  const text = textOf(prompt);
  if (!text) return false;
  if (options.projectFirst && PROJECT_DATA_PATTERN.test(text) && !/(?:联网|搜索|网上|官网|最新|新闻|政策|法规|价格|行情|汇率|天气|股价|来源|链接|引用)/i.test(text)) {
    return false;
  }
  return WEB_SEARCH_PATTERN.test(text);
};

export const createAgentPlan = ({
  prompt,
  activePageId = '',
  projectAccessEnabled = true,
  webSearchEnabled = true,
}: {
  prompt: unknown;
  activePageId?: string;
  projectAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
}): AgentPlan => {
  const text = textOf(prompt);
  const localSkillPlan = buildLocalSkillPlan(text);
  const useProjectContext = projectAccessEnabled && shouldUseProjectContextForPrompt(text, activePageId);
  const wantsImageGeneration = IMAGE_GENERATION_PATTERN.test(text);
  const wantsImageAnalysis = IMAGE_ANALYSIS_PATTERN.test(text);
  const needsWebSearch = Boolean(webSearchEnabled && shouldUseWebSearchForPrompt(text, { projectFirst: useProjectContext }));

  if (localSkillPlan?.skillId === 'media.generateImage') {
    return { kind: 'image-generation', useProjectContext: false, needsWebSearch: false, wantsImageGeneration: true, wantsImageAnalysis: false, localSkillPlan, reason: localSkillPlan.reason || '图片生成' };
  }
  if (localSkillPlan?.skillId === 'media.analyzeImages') {
    return { kind: 'image-analysis', useProjectContext: true, needsWebSearch: false, wantsImageGeneration: false, wantsImageAnalysis: true, localSkillPlan, reason: localSkillPlan.reason || '图片分析' };
  }
  if (localSkillPlan) {
    return { kind: 'local-tool', useProjectContext: true, needsWebSearch: false, wantsImageGeneration, wantsImageAnalysis, localSkillPlan, reason: localSkillPlan.reason || '本地工具' };
  }
  if (needsWebSearch) {
    return { kind: 'web-search', useProjectContext, needsWebSearch: true, wantsImageGeneration, wantsImageAnalysis, localSkillPlan: null, reason: '问题涉及实时或外部信息' };
  }
  return { kind: useProjectContext && shouldUseProjectAgentLoopForPrompt(text) ? 'local-tool' : 'chat', useProjectContext, needsWebSearch: false, wantsImageGeneration, wantsImageAnalysis, localSkillPlan: null, reason: useProjectContext ? '项目上下文优先' : '普通对话' };
};
