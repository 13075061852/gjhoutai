// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const normalizeText = (value) => String(value || '').toLowerCase();
  const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));
  const getPageIds = () => Object.keys(App.constants?.PAGE_DEFS || {});
  const getPageTitle = (pageId) => App.constants?.PAGE_DEFS?.[pageId]?.title || pageId || '未知页面';
  const getPageCatalog = () => Object.entries(App.constants?.PAGE_DEFS || {})
    .map(([pageId, def]) => `${def?.title || pageId}（${pageId}）：${def?.desc || '待补充说明'}`)
    .join('\n');
  const MAX_RESULT_CONTEXT_CHARS = 10000;
  const MAX_TOTAL_CONTEXT_CHARS = 12000;

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
      patterns: [/项目|后台|功能|页面|菜单|配置|主题|技能|调用|执行|怎么用|能做什么|管家|agent|助手|打开|进入|切换|跳转|档案|客户|供应商|人员|订单|库存|生产|配方|计划|权限|审计|数据源|仪表盘/],
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
        `当前页面：${activePageLabel}`,
        '已注册页面清单：',
        getPageCatalog(),
        '数据分析能力：物性分析可读取 Excel/JSON 表格并检索型号、批次和指标；图谱分析可管理图谱图片、分类、标签和备注；抠图助手可上传图片、去除背景、裁剪并导出透明 PNG。',
        '库存管理能力：库存管理归在生产与配方下，展示原材料、生产完成后的成品材料、材料分类和供应商来源，并可联动打开供应商档案。',
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
      activePageId,
      activePageLabel: getPageTitle(activePageId),
    };
  };

  const sortSkills = (skills, activePageId, intent) => [...skills].sort((a, b) => {
    const score = (skill) => {
      let value = 0;
      if (skill.pageId && skill.pageId === activePageId) value += 10;
      if (intent.ids.includes(skill.intentId)) value += 5;
      if (skill.id === 'project-guide') value -= 1;
      return value;
    };
    return score(b) - score(a);
  });

  const retrieveContext = ({ question = '', activePageId = '', forceCurrentPage = false } = {}) => {
    const intent = analyzeIntent(question, activePageId);
    const skills = sortSkills(getSkillRegistry(), activePageId, intent);
    const results = [];

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
    '涉及型号、批次、指标、图谱或图片时，先说明命中的数据来源和结论，再给出风险或下一步建议。',
    '如果没有找到完全匹配的数据，明确说“未找到完全匹配”，并列出相近数据或建议用户切换/选择数据。',
    '不要把塑料材料型号解释成服务器、网络设备或外部产品。',
  ].join('\n');

  const getImages = ({ question = '', activePageId = '', forceCurrentPage = false } = {}) => {
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
    getImages,
  };
})();
