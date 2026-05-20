// @ts-nocheck
import { getLegacyApp } from '../core/app-context';

(function () {
  'use strict';

  const App = getLegacyApp();
  if (!App) return;

  const normalizeText = (value) => String(value || '').toLowerCase();
  const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));
  const getPageIds = () => Object.keys(App.constants?.PAGE_DEFS || {});
  const getPageTitle = (pageId) => App.constants?.PAGE_DEFS?.[pageId]?.title || pageId || '未知页面';
  const getPageCatalog = () => Object.entries(App.constants?.PAGE_DEFS || {})
    .map(([pageId, def]) => `${def?.title || pageId}（${pageId}）：${def?.desc || '待补充说明'}`)
    .join('\n');
  const getProjectManifest = () => {
    const pages = Object.entries(App.constants?.PAGE_DEFS || {}).map(([pageId, def]) => ({
      pageId,
      title: def?.title || pageId,
      desc: def?.desc || '',
      entity: '',
      fields: [],
      skills: ['project.inspectPage'],
    }));
    const businessPages = App.businessPages?.getAgentManifestPages?.() || [];
    const byId = new Map(pages.map((page) => [page.pageId, page]));
    businessPages.forEach((page) => byId.set(page.pageId, { ...(byId.get(page.pageId) || {}), ...page }));
    return {
      systemName: '广俊塑料科技后台管理系统',
      pages: [...byId.values()],
      relations: [
        { from: 'formula-management', to: 'inventory-management', desc: '配方组分和库存材料联动。' },
        { from: 'order-management', to: 'production-plan', desc: '订单驱动生产计划。' },
        { from: 'inventory-management', to: 'supplier-archive', desc: '库存材料关联供应商。' },
        { from: 'property-analysis', to: 'spectrum-analysis', desc: '物性与图谱可按型号/批次联合分析。' },
      ],
    };
  };
  const isPageGuideQuestion = (question = '') => {
    const text = String(question || '').trim();
    if (!text) return false;
    const asksAboutPage = /(?:这个|当前|本|该)?(?:页面|模块|功能|系统|项目|网站|应用|平台)|做什么|是什么|用途|作用|介绍|说明|怎么用|如何使用/.test(text);
    const asksToAnalyzeMedia = /(?:分析|看看|识别|读取|提取|对比|判断).*(?:图谱|谱图|曲线|图片|图像|dsc|tga|峰|峰值|温区|失重)|(?:图谱|谱图|曲线|图片|图像).*(?:分析|识别|读取|提取|对比|判断)|分析这张|看这张|当前图/.test(text);
    return asksAboutPage && !asksToAnalyzeMedia;
  };
  const MAX_RESULT_CONTEXT_CHARS = 10000;
  const MAX_TOTAL_CONTEXT_CHARS = 12000;
  const BUSINESS_QUERY_PATTERN = /(?:当前|现在|页面|表格|列表|有几个|多少|数量|总数|最低|最少|最小|最高|最多|最大|账号|账户|用户|人员|员工|部门|客户|供应商|订单|库存|商品|产品|成品|配方|采购|生产)/;
  const PAGE_RESOURCE_RULES = [
    { pageIds: ['personnel-archive', 'permission-management'], label: '账号/人员/权限', patterns: [/账号|账户|用户|登录|人员|员工|部门|角色|权限|在线|在岗/] },
    { pageIds: ['formula-management'], label: '配方/工艺', patterns: [/配方|工艺|组分|比例|版本|实验版本|成本/] },
    { pageIds: ['order-management', 'invoice-print'], label: '销售/订单履约', patterns: [/订单|交付|交期|销售|开单/] },
    { pageIds: ['inventory-management', 'supplier-archive', 'raw-material-procurement'], label: '库存/供应商/采购', patterns: [/库存|商品|产品|材料|原料|成品|仓库|供应商|采购|供货|进货/] },
    { pageIds: ['customer-archive'], label: '客户经营', patterns: [/客户|联系人|交易|信用|客群|需求/] },
    { pageIds: ['production-plan'], label: '生产排程', patterns: [/生产|排产|产线|批次|质检|待排|已完成/] },
    { pageIds: ['property-analysis'], label: '物性数据', patterns: [/物性|型号|批次|熔指|拉伸|弯曲|冲击|阻燃|灰份|强度/] },
    { pageIds: ['spectrum-analysis'], label: '图谱数据', patterns: [/图谱|谱图|曲线|图片|dsc|tga|峰|温区|失重/] },
    { pageIds: ['image-cutout'], label: '抠图处理', patterns: [/抠图|去背|透明|裁剪|背景/] },
    { pageIds: ['project-skills', 'ai-call-analysis', 'ai-config'], label: 'AI 配置/技能/成本', patterns: [/ai|模型|技能|调用|token|费用|配置|openrouter|lm studio|apimart/] },
    { pageIds: ['dashboard'], label: '经营总览', patterns: [/仪表盘|首页|总览|风险|趋势|待办|概览/] },
    { pageIds: ['theme-settings'], label: '系统体验', patterns: [/主题|皮肤/] },
  ];

  const getResourceRoutingContext = (question = '', activePageId = '') => {
    const text = String(question || '').toLowerCase();
    const matched = PAGE_RESOURCE_RULES
      .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
      .map((rule) => ({
        ...rule,
        titles: rule.pageIds.map((pageId) => `${getPageTitle(pageId)}(${pageId})`),
      }));
    if (activePageId && App.constants?.PAGE_DEFS?.[activePageId] && !matched.some((rule) => rule.pageIds.includes(activePageId))) {
      matched.push({
        label: '当前页面补充',
        pageIds: [activePageId],
        titles: [`${getPageTitle(activePageId)}(${activePageId})`],
      });
    }
    if (!matched.length) return null;

    const asksForData = BUSINESS_QUERY_PATTERN.test(text) || /(?:几个|多少|有哪些|哪几个|列表|明细|统计|数据|状态)/.test(text);
    return {
      title: '资源调度计划',
      reason: '先模糊识别相关页面，再按问题读取必要数据源',
      score: asksForData ? 12 : 6,
      content: [
        '【本轮资源调度计划】',
        `用户问题：${question || '-'}`,
        `问题类型：${asksForData ? '数据查询/统计/列表' : isPageGuideQuestion(question) ? '页面功能说明' : '项目通用问答'}`,
        '候选资源：',
        ...matched.map((rule, index) => `${index + 1}. ${rule.label}：${rule.titles.join('、')}`),
        `调度原则：${asksForData ? '只读取候选页面的数据源，优先回答数量、列表和状态，不要跳转页面。' : '先说明能力和入口，需要具体数据时再读取对应页面。'}`,
      ].join('\n'),
    };
  };

  const getCurrentPageDomContext = (question = '', options = {}) => {
    const activePageId = options.activePageId || '';
    const pageTitle = getPageTitle(activePageId);
    const root = App.refs?.businessPageContent
      || document.querySelector(`[data-page-section="${activePageId}"]`)
      || document.querySelector(`[data-page="${activePageId}"]`);
    if (!root) return null;

    const tables = Array.from(root.querySelectorAll('table')).filter((table) => table.offsetParent !== null);
    if (!tables.length) return null;

    const sections = tables.slice(0, 3).map((table, tableIndex) => {
      const headers = Array.from(table.querySelectorAll('thead th'))
        .map((cell) => cell.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
      const rows = Array.from(table.querySelectorAll('tbody tr'))
        .filter((row) => row.offsetParent !== null)
        .map((row) => Array.from(row.querySelectorAll('td'))
          .map((cell) => cell.textContent.trim().replace(/\s+/g, ' '))
          .filter(Boolean))
        .filter((cells) => cells.length && !cells.join('').includes('暂无匹配'));
      const sampleRows = rows.slice(0, 20).map((cells, rowIndex) => {
        if (headers.length) {
          return `${rowIndex + 1}. ${cells.map((cell, index) => `${headers[index] || `列${index + 1}`}=${cell}`).join('；')}`;
        }
        return `${rowIndex + 1}. ${cells.join('；')}`;
      });
      return [
        `表格 ${tableIndex + 1}`,
        `列：${headers.join('、') || '未识别'}`,
        `当前可见数据行数：${rows.length}`,
        ...sampleRows,
      ].join('\n');
    });

    return {
      title: `${pageTitle}当前页面表格`,
      reason: '读取当前页面可见业务表格',
      score: options.forceCurrentPage || BUSINESS_QUERY_PATTERN.test(String(question || '')) ? 10 : 5,
      content: [
        '【当前页面可见表格数据】',
        `页面：${pageTitle}（${activePageId || '未知页面'}）`,
        '说明：以下是当前页面 DOM 中可见表格的实时内容，可直接用于回答“几个、多少、当前有哪些”等问题。',
        sections.join('\n\n'),
      ].join('\n'),
    };
  };

  const INTENT_RULES = [
    {
      id: 'property',
      label: '物性数据查询',
      pages: ['property-analysis'],
      patterns: [/物性|型号|批次|材料|熔指|拉伸|弯曲|冲击|灰份|强度|伸长率|对比|异常|指标|数据/],
    },
    {
      id: 'spectrum',
      label: '图谱分析',
      pages: ['spectrum-analysis'],
      patterns: [/图谱|谱图|曲线|dsc|tga|标签|分类|图片|图像/],
    },
    {
      id: 'cutout',
      label: '抠图处理',
      pages: ['image-cutout'],
      patterns: [/抠图|去背|去除背景|透明|裁剪|图片|图像|png|背景|主体保护/],
    },
    {
      id: 'project',
      label: '项目管家',
      pages: [],
      patterns: [/项目|网站|站点|本站|应用|平台|后台|系统|功能|页面|菜单|配置|主题|技能|调用|执行|怎么用|能做什么|管家|agent|助手|打开|进入|切换|跳转|档案|客户|供应商|人员|员工|账号|账户|用户|部门|订单|库存|生产|配方|计划|权限|数据源|仪表盘|几个|多少|数量|总数|详细|说明|展开|继续|具体|多说|讲讲|介绍|梳理|总结/],
    },
  ];

  const getProjectGuideContext = (question = '', options = {}) => {
    const activePageLabel = getPageTitle(options.activePageId);
    return {
      title: '项目管家',
      reason: '回答项目功能和当前页面问题',
      score: options.forceCurrentPage ? 7 : 4,
      content: [
        '【项目管家知识】',
        '系统名称：广俊塑料科技后台管理系统。',
        '用户说“这个项目”“这个网站”“本站”“这个系统”或“这个应用”时，默认指本后台管理系统。',
        '用户说“详细说明一下”“展开说说”“继续”“具体点”等短追问时，默认是在追问上一轮项目主题。',
        `当前页面：${activePageLabel}`,
        '已注册页面清单：',
        getPageCatalog(),
        '调度策略：先根据问题在全系统页面能力地图中做模糊调度，判断可能相关的页面；只有涉及数量、列表、状态、明细、当前数据或具体业务对象时，才读取对应页面的数据源做精准回答。',
        '数据分析能力：物性分析可读取 Excel/JSON 表格并检索型号、批次和指标；图谱分析可管理图谱图片、分类、标签和备注；抠图助手可上传图片、去除背景、裁剪并导出透明 PNG。',
        '库存管理能力：库存管理归在生产与配方下，展示原材料、生产完成后的成品材料、材料分类、库存数量和供应商来源；数量类问题只回答数量，列举类问题才输出表格，最低/最高类问题要先计算结论。',
        '配方管理能力：配方由库存管理中的库存材料组成，配方组分应关联材料分类、供应商、当前库存和库存状态。',
        '页面操作能力：当用户要求打开、进入、切换或查看某个系统页面时，应优先调用项目技能 assistant.openPage，而不是回答“未找到页面”。',
        '技能化操作：AI技能面板定义项目专属技能、输入输出规范和执行记录，右侧 Gjun AI 可按技能协议调用确定性的项目操作。',
        'AI调用分析：AI调用分析记录模型、Token、费用、耗时、来源和成功失败状态，方便追踪成本。',
        '回答策略：优先结合当前页面、用户问题中的型号/批次/图谱/图片关键词，以及后台检索到的数据；没有命中数据时要明确说明未找到。',
        question ? `用户问题：${question}` : '',
      ].filter(Boolean).join('\n'),
    };
  };

  const getSkillRegistry = () => [
    {
      id: 'property-analysis',
      intentId: 'property',
      label: '物性分析',
      pageId: 'property-analysis',
      canHandle(question, activePageId, intent) {
        return activePageId === this.pageId || intent.ids.includes(this.intentId);
      },
      retrieve(question, options) {
        return App.propertyAnalysis?.getAgentContext?.(question, options) || null;
      },
    },
    {
      id: 'spectrum-analysis',
      intentId: 'spectrum',
      label: '图谱分析',
      pageId: 'spectrum-analysis',
      canHandle(question, activePageId, intent) {
        return activePageId === this.pageId || intent.ids.includes(this.intentId);
      },
      retrieve(question, options) {
        return App.spectrumAnalysis?.getAgentContext?.(question, options) || null;
      },
      getImages(question, options) {
        return App.spectrumAnalysis?.getAgentImages?.(question, options) || [];
      },
    },
    {
      id: 'image-cutout',
      intentId: 'cutout',
      label: '抠图助手',
      pageId: 'image-cutout',
      canHandle(question, activePageId, intent) {
        return activePageId === this.pageId || intent.ids.includes(this.intentId);
      },
      retrieve(question, options) {
        return App.imageCutout?.getAgentContext?.(question, options) || null;
      },
      getImages(question, options) {
        return App.imageCutout?.getAgentImages?.(question, options) || [];
      },
    },
    {
      id: 'business-pages',
      intentId: 'project',
      label: '业务页面数据',
      pageId: '',
      canHandle(question, activePageId, intent) {
        return intent.ids.includes(this.intentId) || BUSINESS_QUERY_PATTERN.test(String(question || ''));
      },
      retrieve(question, options) {
        return App.businessPages?.getAgentContext?.(question, options) || null;
      },
    },
    {
      id: 'project-guide',
      intentId: 'project',
      label: '项目管家',
      pageId: '',
      canHandle(question, activePageId, intent) {
        return intent.ids.includes(this.intentId) || !intent.ids.length || !['property-analysis', 'spectrum-analysis', 'image-cutout'].includes(activePageId);
      },
      retrieve(question, options) {
        return getProjectGuideContext(question, options);
      },
    },
  ];

  const analyzeIntent = (question = '', activePageId = '') => {
    const text = normalizeText(question);
    const matched = INTENT_RULES
      .filter((rule) => {
        const pages = rule.id === 'project' ? getPageIds() : rule.pages;
        return pages.includes(activePageId) || hasAny(text, rule.patterns);
      })
      .map((rule) => ({
        id: rule.id,
        label: rule.label,
        currentPageBoost: (rule.id === 'project' ? getPageIds() : rule.pages).includes(activePageId),
      }));

    return {
      ids: [...new Set(matched.map((item) => item.id))],
      labels: [...new Set(matched.map((item) => item.label))],
      pageGuide: isPageGuideQuestion(question),
      activePageId,
      activePageLabel: getPageTitle(activePageId),
    };
  };

  const sortSkills = (skills, activePageId, intent) => [...skills].sort((a, b) => {
    const score = (skill) => {
      let value = 0;
      if (skill.pageId && skill.pageId === activePageId) value += 10;
      if (intent.ids.includes(skill.intentId)) value += 5;
      if (intent.pageGuide && skill.id === 'project-guide') value += 12;
      if (intent.pageGuide && skill.pageId) value -= 3;
      if (skill.id === 'project-guide') value -= 1;
      return value;
    };
    return score(b) - score(a);
  });

  const retrieveContext = ({ question = '', activePageId = '', forceCurrentPage = false } = {}) => {
    const intent = analyzeIntent(question, activePageId);
    const skills = sortSkills(getSkillRegistry(), activePageId, intent);
    const results = [];
    const routingContext = getResourceRoutingContext(question, activePageId);
    if (routingContext) {
      results.push({
        skillId: 'resource-routing-plan',
        label: '资源调度计划',
        ...routingContext,
      });
    }
    const currentPageContext = getCurrentPageDomContext(question, { activePageId, forceCurrentPage });
    if (currentPageContext) {
      results.push({
        skillId: 'current-page-table',
        label: '当前页面表格',
        ...currentPageContext,
      });
    }

    skills.forEach((skill) => {
      const shouldRun = forceCurrentPage && skill.pageId === activePageId
        ? true
        : skill.canHandle(question, activePageId, intent);
      if (!shouldRun) return;

      const result = skill.retrieve(question, {
        activePageId,
        forceCurrentPage: forceCurrentPage && skill.pageId === activePageId,
        intent,
      });
      if (!result || !String(result.content || '').trim()) return;
      results.push({
        skillId: skill.id,
        label: skill.label,
        ...result,
      });
    });

    if (!results.length) {
      results.push(getProjectGuideContext(question, { activePageId, forceCurrentPage }));
    }

    return {
      intent,
      results: results
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, forceCurrentPage ? 4 : 3),
    };
  };

  const compressContext = ({ intent, results } = {}) => {
    const hasFullContextResult = (results || []).some((result) => result?.fullContext);
    const limitText = (value, limit, bypass = false) => {
      const text = String(value || '').trim();
      if (bypass || text.length <= limit) return text;
      return `${text.slice(0, limit)}\n...（上下文已自动压缩，避免一次分析消耗过多 token。）`;
    };
    const sections = [
      '【Gjun AI 项目管家自动检索】',
      `当前页面：${intent?.activePageLabel || '未知页面'}`,
      `识别意图：${intent?.labels?.length ? intent.labels.join('、') : '通用项目问答'}`,
      '检索策略：当前页面优先；必要时跨数据分析模块补充；只保留命中数据、摘要和必要元数据。',
    ];

    (results || []).forEach((result, index) => {
      sections.push(
        '',
        `## 数据源 ${index + 1}：${result.title || result.label || result.skillId}`,
        `命中说明：${result.reason || '与当前问题相关'}`,
        limitText(result.content, MAX_RESULT_CONTEXT_CHARS, Boolean(result.fullContext))
      );
    });

    return limitText(sections.join('\n'), MAX_TOTAL_CONTEXT_CHARS, hasFullContextResult);
  };

  const buildContext = (options = {}) => compressContext(retrieveContext(options));

  const buildAgentPrompt = (question = '', context = '') => [
    '【用户问题】',
    question,
    '',
    '【项目管家检索上下文】',
    context,
    '',
    '【回答要求】',
    '你是这个后台项目的 AI 管家，必须优先依据项目管家检索上下文回答。',
    '如果用户是短追问或承接上一轮的问题，要主动沿用对话里的上一轮主题继续展开，不要让用户重新提供项目名称或背景。',
    '回答项目介绍类问题时，要直接给出更完整的业务定位、核心模块、数据流、典型使用场景和下一步可操作建议。',
    '禁止把内部数据对象、JSON、字段名 ok/context/data 原样输出给用户；必须转成自然语言或 Markdown 列表。',
    '回答业务记录列表时，优先使用 Markdown 表格或无序列表；不要把每条记录都编号为 1。',
    '只能使用检索上下文中明确给出的字段；如果字段说明要求与页面表格一致，不要自行补充负责人、产品等未出现字段。',
    '涉及型号、批次、指标、图谱或图片时，先说明命中的数据来源和结论，再给出风险或下一步建议。',
    '如果没有找到完全匹配的数据，明确说“未找到完全匹配”，并列出相近数据或建议用户切换/选择数据。',
    '不要把塑料材料型号解释成服务器、网络设备或外部产品。',
  ].join('\n');

  const getImages = ({ question = '', activePageId = '', forceCurrentPage = false } = {}) => {
    if (isPageGuideQuestion(question)) return [];
    const intent = analyzeIntent(question, activePageId);
    const skills = sortSkills(getSkillRegistry(), activePageId, intent);
    const images = [];

    skills.forEach((skill) => {
      if (!skill.getImages) return;
      const shouldRun = forceCurrentPage && skill.pageId === activePageId
        ? true
        : skill.canHandle(question, activePageId, intent);
      if (!shouldRun) return;
      images.push(...skill.getImages(question, {
        activePageId,
        forceCurrentPage: forceCurrentPage && skill.pageId === activePageId,
        intent,
      }));
    });

    return images;
  };

  App.agentButler = {
    analyzeIntent,
    retrieveContext,
    compressContext,
    buildContext,
    buildAgentPrompt,
    getProjectManifest,
    answerQuestion: (question = '', options = {}) => App.businessPages?.answerQuestion?.(question, options) || '',
    getImages,
  };
})();
