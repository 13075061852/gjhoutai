(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, utils } = App;
  const HISTORY_KEY = 'gjh-project-skill-history-v1';
  const MAX_HISTORY = 18;

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
    销售库存: 'sales-stock',
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
    审计日志: 'audit-log',
    审计: 'audit-log',
    日志: 'audit-log',
  };

  const nowText = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const esc = (value) => utils.escapeHtml(value);
  const normalizeText = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const readHistory = () => {
    const stored = utils.readJson(HISTORY_KEY, []);
    return Array.isArray(stored) ? stored : [];
  };
  const writeHistory = (items) => utils.writeJson(HISTORY_KEY, items.slice(0, MAX_HISTORY));

  const getActivePageId = () => {
    try {
      return localStorage.getItem(constants.NAV_PAGE_KEY) || 'ai-config';
    } catch {
      return 'ai-config';
    }
  };

  const stripCommandNoise = (value) => String(value || '')
    .replace(/^(请|帮我|麻烦|能不能|可以)\s*/, '')
    .replace(/(一下|吧|谢谢|请处理|帮忙处理)$/g, '')
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

  const extractSpectrumUpdateInput = (prompt) => {
    const text = String(prompt || '').trim();
    const selected = /(?:当前已选|当前选中|已选|选中)/.test(text);
    const filtered = /(?:当前筛选|筛选结果|当前列表|当前页面|当前分类)/.test(text);
    const updates = {};
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
    return /(?:打开|进入|切换到|跳转到|转到|去|查看).*(?:页面|面板|中心|档案|管理|计划|库存|日志|仪表盘|助手|分析|配置|主题|技能|调用|费用|订单|客户|供应商|人员|权限|审计|数据源|生产|配方|销售|开单|抠图|图谱|物性)/.test(text);
  };

  const getPageCatalog = () => Object.entries(constants.PAGE_DEFS || {})
    .map(([pageId, def]) => `${def?.title || pageId}=${pageId}`)
    .join('；');

  const normalizeResult = (result, fallbackMessage = '技能已执行。') => {
    if (!result || typeof result !== 'object') {
      return { ok: true, message: fallbackMessage, details: [], data: {} };
    }
    return {
      ok: result.ok !== false,
      message: String(result.message || fallbackMessage),
      details: Array.isArray(result.details) ? result.details.map((item) => String(item)) : [],
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
      data: result.data && typeof result.data === 'object' ? result.data : {},
    };
  };

  const SKILL_CALL_EXAMPLE = {
    gjhSkillCall: {
      skillId: 'spectrum.deleteImage',
      input: {
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

  const createSkillRegistry = () => [
    {
      id: 'spectrum.deleteImage',
      title: '删除图谱图片',
      module: '图谱分析',
      icon: 'ti-trash',
      level: '执行型',
      summary: '按图谱名称、编号或当前已选状态删除图谱库图片，并同步本地图片库和编辑记录。',
      inputSpec: '{ "target": "图谱名称/编号", "mode": "target | selected | active" }',
      outputSpec: '{ "ok": true, "deleted": 1, "message": "..." }',
      examples: ['帮我删除图谱分析上的「320G6-N11 DSC」', '删除当前已选图谱'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasDeleteIntent = /(?:删除|移除|删掉|清理)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|图像)/.test(text);
        const matched = hasDeleteIntent && (mentionsSpectrum || activeOnSpectrumPage);
        if (!matched || /(?:怎么|如何|教程|说明|能不能)/.test(text)) return null;
        const selected = /(?:当前|选中|已选)/.test(text);
        const target = extractDeleteTarget(text);
        return {
          skillId: this.id,
          confidence: target || selected ? 0.92 : 0.72,
          input: {
            target,
            mode: selected && !target ? 'selected' : 'target',
          },
        };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.deleteByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露删除技能接口。' };
        }
        return App.spectrumAnalysis.deleteByAgent(input);
      },
    },
    {
      id: 'spectrum.createImageRecord',
      title: '新增图谱记录',
      module: '图谱分析',
      icon: 'ti-file-plus',
      level: '执行型',
      summary: '新增一条待上传图谱记录，写入名称、编号、类型、分类、标签、日期和备注；不会重复创建同名记录。',
      inputSpec: '{ "title": "图谱名称", "code": "编号", "type": "DSC | TGA", "category": "分类", "date": "YYYY-MM-DD", "tags": ["标签"], "note": "备注" }',
      outputSpec: '{ "ok": true, "created": 1, "items": [{ "title": "..." }] }',
      examples: ['新增一条「320G6-B1 DSC」图谱记录，分类阻燃', '创建一个杜邦 PET FR530 DSC 的待上传图谱'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasCreateIntent = /(?:新增|创建|新建|添加)/.test(text) && /(?:图谱|谱图|图片|记录|数据)/.test(text);
        if (!hasCreateIntent || (!activeOnSpectrumPage && !/(?:图谱|谱图)/.test(text))) return null;
        const input = extractSpectrumCreateInput(text);
        if (!input) return null;
        return { skillId: this.id, confidence: 0.86, input };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.createByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露新增记录技能接口。' };
        }
        return App.spectrumAnalysis.createByAgent(input);
      },
    },
    {
      id: 'spectrum.updateImages',
      title: '更新图谱数据',
      module: '图谱分析',
      icon: 'ti-edit',
      level: '执行型',
      summary: '精确更新图谱标题、分类、日期、备注或标签；支持当前已选、当前筛选或明确关键词范围，并限制单次影响数量。',
      inputSpec: '{ "target": "名称/编号/分类/标签", "mode": "query | selected | filtered | active", "updates": { "title": "...", "category": "...", "date": "YYYY-MM-DD", "note": "...", "tagsAdd": ["..."], "tagsRemove": ["..."], "tagsSet": ["..."] }, "maxAffected": 30 }',
      outputSpec: '{ "ok": true, "updated": 3, "changed": 2, "items": [{ "title": "..." }] }',
      examples: ['把当前选中的图谱备注改为需要复核', '给杜邦相关图谱移除 PET 标签', '把 320G6-B1 的分类改为阻燃'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasUpdateIntent = /(?:修改|更新|改成|改为|设置|设为|写入|移除|去掉|清除|备注|标题|名称|标签|分类)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|记录|数据|当前已选|当前筛选|选中)/.test(text);
        if (!hasUpdateIntent || (!mentionsSpectrum && !activeOnSpectrumPage)) return null;
        const input = extractSpectrumUpdateInput(text);
        if (!input) return null;
        return { skillId: this.id, confidence: 0.88, input };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.updateByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露更新数据技能接口。' };
        }
        return App.spectrumAnalysis.updateByAgent(input);
      },
    },
    {
      id: 'spectrum.selectImages',
      title: '选择图谱数据',
      module: '图谱分析',
      icon: 'ti-checklist',
      level: '执行型',
      summary: '按明确关键词、当前筛选或当前图谱选择数据，供后续分析、更新或删除复用，避免一次处理过宽范围。',
      inputSpec: '{ "target": "名称/编号/分类/标签", "mode": "query | filtered | active", "clearExisting": true, "maxAffected": 80 }',
      outputSpec: '{ "ok": true, "selected": 3, "totalSelected": 3 }',
      examples: ['先选中杜邦相关图谱', '选择当前筛选结果', '追加选择 320G6-B1 图谱'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasSelectIntent = /(?:选择|选中|勾选|定位|筛出|筛选|追加选择|加选)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|记录|数据|当前筛选|当前图谱)/.test(text);
        if (!hasSelectIntent || (!mentionsSpectrum && !activeOnSpectrumPage)) return null;
        return { skillId: this.id, confidence: 0.82, input: extractSpectrumSelectInput(text) };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.selectByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露选择数据技能接口。' };
        }
        return App.spectrumAnalysis.selectByAgent(input);
      },
    },
    {
      id: 'spectrum.addTags',
      title: '批量添加图谱标签',
      module: '图谱分析',
      icon: 'ti-tags',
      level: '执行型',
      summary: '按明确关键词、当前筛选结果或已选图谱批量写入标签，并同步图谱库、详情编辑和本地保存。',
      inputSpec: '{ "target": "420", "tags": ["PET"], "mode": "query | selected | filtered", "maxAffected": 30 }',
      outputSpec: '{ "ok": true, "updated": 17, "tags": ["PET"] }',
      examples: ['帮我把所有 420 的图谱加上 PET 标签', '给当前已选图谱添加阻燃标签'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasTagIntent = /(?:标签|打标|标记)/.test(text)
          && /(?:加上|添加|增加|打上|写入|标记为|设为|设置为|改成|修改|加)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|图像)/.test(text);
        if (!hasTagIntent || (!mentionsSpectrum && !activeOnSpectrumPage)) return null;
        const input = extractTagUpdateInput(text);
        if (!input) return null;
        return {
          skillId: this.id,
          confidence: 0.9,
          input,
        };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.tagByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露标签修改技能接口。' };
        }
        return App.spectrumAnalysis.tagByAgent(input);
      },
    },
    {
      id: 'spectrum.categorizeImages',
      title: '批量整理图谱分类',
      module: '图谱分析',
      icon: 'ti-tags',
      level: '执行型',
      summary: '按明确关键词、当前筛选结果或已选图谱批量更新分类，并自动切换到新分类视图。',
      inputSpec: '{ "target": "杜邦", "category": "杜邦", "mode": "query | selected | filtered", "maxAffected": 30 }',
      outputSpec: '{ "ok": true, "updated": 17, "category": "杜邦" }',
      examples: ['把杜邦的产品整理出来做一个新分类叫杜邦', '把当前筛选结果归类为PET'],
      infer(prompt) {
        const text = String(prompt || '');
        const activeOnSpectrumPage = getActivePageId() === 'spectrum-analysis';
        const hasCategoryIntent = /(?:分类|归类|整理|分组|新分类|创建分类|新增分类|放到|分到)/.test(text);
        const hasSetIntent = /(?:叫|为|成|到|整理出来|做一个|创建|新建|新增|归类|放到|分到)/.test(text);
        const mentionsSpectrum = /(?:图谱|谱图|图片|图像|产品|型号|数据)/.test(text);
        if (!hasCategoryIntent || !hasSetIntent || (!mentionsSpectrum && !activeOnSpectrumPage)) return null;
        const input = extractCategoryUpdateInput(text);
        if (!input) return null;
        return {
          skillId: this.id,
          confidence: 0.93,
          input,
        };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.categorizeByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露分类整理技能接口。' };
        }
        return App.spectrumAnalysis.categorizeByAgent(input);
      },
    },
    {
      id: 'spectrum.searchImages',
      title: '检索图谱库',
      module: '图谱分析',
      icon: 'ti-photo-search',
      level: '查询型',
      summary: '按标题、编号、分类、标签、DSC/TGA 类型或备注检索图谱，并返回可上传给视觉模型的图谱图片。',
      inputSpec: '{ "query": "关键词", "limit": "可选，只有用户明确要求数量时才填写" }',
      outputSpec: '{ "ok": true, "items": [{ "title": "...", "type": "DSC" }], "images": ["图谱图片"] }',
      examples: ['查找 320G6 的 DSC 图谱', '检索标签里有异常的 TGA 图片'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:查找|搜索|检索|找|分析|对比|比较|查看|看).*(?:图谱|谱图|图片|曲线|dsc|tga)|(?:图谱|谱图|图片|曲线|dsc|tga).*(?:查找|搜索|检索|找|分析|对比|比较|查看|看)/i.test(text)) return null;
        const query = stripCommandNoise(text)
          .replace(/(查找|搜索|检索|找|分析|对比|比较|查看|看|图谱|谱图|图片|图像|曲线|图谱库|里面|中的|一下|帮我|请)/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { skillId: this.id, confidence: 0.76, input: { query } };
      },
      async handler(input = {}) {
        if (!App.spectrumAnalysis?.searchByAgent) {
          return { ok: false, message: '图谱分析模块尚未暴露检索技能接口。' };
        }
        return App.spectrumAnalysis.searchByAgent(input);
      },
    },
    {
      id: 'property.searchRows',
      title: '检索物性数据',
      module: '物性分析',
      icon: 'ti-search',
      level: '查询型',
      summary: '按型号、批次或指标关键词检索物性数据，返回强匹配、相近匹配和指标摘要。',
      inputSpec: '{ "query": "型号/批次/指标关键词" }',
      outputSpec: '{ "ok": true, "context": "物性分析检索结果..." }',
      examples: ['检索物性型号 320G6-N11', '查一下批次 A2404 的冲击强度'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:查找|搜索|检索|查一下|找).*(?:物性|型号|批次|熔指|拉伸|弯曲|冲击|灰份|强度)|(?:物性|型号|批次|熔指|拉伸|弯曲|冲击|灰份|强度).*(?:查找|搜索|检索|查一下|找)/.test(text)) return null;
        return { skillId: this.id, confidence: 0.72, input: { query: stripCommandNoise(text) } };
      },
      async handler(input = {}) {
        const context = App.propertyAnalysis?.getAgentContext?.(input.query || input.question || '', {
          activePageId: 'property-analysis',
          compact: true,
        });
        if (!context?.content) return { ok: false, message: '物性分析数据尚未加载，暂时无法检索。' };
        return {
          ok: true,
          message: '已完成物性数据检索。',
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
          },
        };
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
      examples: ['把当前型号的物性和图谱合成分析包', '生成 320G6-N11 的联合分析上下文'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!/(?:联合|结合|合成|打包|分析包).*(?:物性|图谱|数据)|(?:物性|图谱|数据).*(?:联合|结合|合成|打包|分析包)/.test(text)) return null;
        return { skillId: this.id, confidence: 0.8, input: { question: text, forceCurrentPage: false } };
      },
      async handler(input = {}) {
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
    {
      id: 'assistant.openPage',
      title: '切换项目页面',
      module: '导航',
      icon: 'ti-route',
      level: '执行型',
      summary: '根据自然语言跳转到系统内任意已注册页面，包括业务中心、基础数据、系统管理和 AI 功能页。',
      inputSpec: '{ "pageId": "spectrum-analysis" }',
      outputSpec: '{ "ok": true, "pageId": "spectrum-analysis" }',
      examples: ['打开客户档案', '切换到图谱分析', '打开AI调用分析'],
      infer(prompt) {
        const text = String(prompt || '');
        if (!hasOpenPageIntent(text)) return null;
        const pageId = resolvePageId(text);
        if (!pageId) return null;
        return { skillId: this.id, confidence: 0.9, input: { pageId } };
      },
      async handler(input = {}) {
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

  const getSkillRegistry = () => createSkillRegistry();
  const getSkillById = (skillId) => getSkillRegistry().find((skill) => skill.id === skillId);

  const routePrompt = (prompt = '') => {
    const plans = getSkillRegistry()
      .map((skill) => skill.infer?.(prompt))
      .filter(Boolean)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
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

  const executeSkill = async (skillId, input = {}, meta = {}) => {
    const skill = getSkillById(skillId);
    if (!skill) {
      const missing = normalizeResult({ ok: false, message: `未知项目技能：${skillId}` });
      appendHistory({ skillId, title: skillId, ok: false, message: missing.message, source: meta.source || 'unknown' });
      return { skill: { id: skillId, title: skillId }, result: missing };
    }

    let result;
    try {
      result = normalizeResult(await skill.handler(input, meta));
    } catch (error) {
      result = normalizeResult({ ok: false, message: error?.message || '技能执行失败。' });
    }

    appendHistory({
      skillId,
      title: skill.title,
      ok: result.ok,
      message: result.message,
      source: meta.source || 'unknown',
    });
    return { skill, result };
  };

  const formatSkillMessage = ({ skill, result }) => {
    const hasCandidateActions = skill?.id === 'spectrum.deleteImage' && result.candidates?.length;
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

  const getResultActions = ({ skill, result } = {}) => {
    if (skill?.id !== 'spectrum.deleteImage' || !Array.isArray(result?.candidates) || !result.candidates.length) {
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
        skillId: 'spectrum.deleteImage',
        input: {
          target: String(item.id || item.title || item.code || ''),
          mode: 'target',
        },
        consumesGroup: true,
      };
    }).filter((action) => action.input.target);
  };

  const executePrompt = async (prompt = '', meta = {}) => {
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

  const executeSkillCallFromText = async (text = '', meta = {}) => {
    const call = parseSkillCallFromText(text);
    if (!call) return null;
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

  const getAiProtocolContext = () => {
    const skills = getSkillRegistry().map((skill) => (
      `- ${skill.id}：${skill.title}；输入 ${formatCompactJsonSpec(skill.inputSpec)}；输出 ${formatCompactJsonSpec(skill.outputSpec)}`
    ));
    return [
      '【项目技能调用协议】',
      '你是项目技能调度器：先理解用户真实意图，再从可用技能中选择最合适的技能和参数。',
      '当用户要求执行项目内操作、修改页面数据、整理/删除/归类/打标/跳转/查询项目数据时，优先调用项目技能，不要凭空声称已经操作。',
      `用户要求打开、进入、切换或查看系统页面时，优先调用 assistant.openPage。可切换页面：${getPageCatalog()}`,
      '如果需要让前端执行技能，只输出严格 JSON，不要混入解释、Markdown 或自然语言：',
      formatCompactJsonSpec(SKILL_CALL_EXAMPLE),
      '技能执行后，前端会把执行结果回写给用户。',
      '用户提到“当前、选中、本页、筛选结果”时，必须保留这个范围意图；需要联合当前页面上下文时优先使用 analysis.buildJointPackage，并设置 forceCurrentPage=true。',
      '用户明确询问物性、参数、批次、指标、熔指、拉伸、弯曲、冲击、阻燃或灰份时，优先调用 property.searchRows，不要调用 analysis.buildJointPackage。',
      '用户明确提到图谱、谱图、图片、DSC/TGA 曲线或图谱库时，优先调用 spectrum.searchImages；不要因为问题里有型号或系列号就改调 property.searchRows。',
      '只有用户明确要求联合物性+图谱、跨模块分析、当前页完整上下文时才用 analysis.buildJointPackage。',
      '物性数据默认上传所有符合条件的匹配行；只有用户明确说“前 N 条/只要 N 行/显示 N 个”等数量限制时，才限制上传数量。',
      '凡是调用 property.searchRows 查找并上传数据，前端会先展示完整匹配数据表格；AI 后续只需要继续输出分析结果，不要重复生成表格。',
      '凡是调用 spectrum.searchImages 检索图谱，前端会在用户二次授权确认后把全部匹配图谱图片作为视觉输入交给 AI；AI 后续必须基于曲线/峰形/标注做图谱对比分析，不要只总结标题、分类、标签。',
      '图谱图片默认上传所有符合条件的匹配图片；只有用户明确说“前 N 张/只要 N 张/显示 N 个”等数量限制时，才给 spectrum.searchImages 填写 limit。',
      '图谱数据处理按 CRUD 选择技能：查询用 spectrum.searchImages；新增待上传记录用 spectrum.createImageRecord；选择范围用 spectrum.selectImages；修改标题/分类/日期/备注/标签用 spectrum.updateImages 或专用标签/分类技能；删除用 spectrum.deleteImage。',
      '所有增删改都必须给出明确 target 或 mode。单个对象优先使用名称/编号精确匹配；用户说“当前选中”用 mode=selected，说“当前筛选/当前分类”用 mode=filtered。',
      '如果目标可能命中无关数据，先调用 spectrum.searchImages 或 spectrum.selectImages 缩小范围，不要一次处理大范围模糊数据。增删改单次默认 maxAffected=30，删除默认更保守。',
      '如果技能返回多个候选对象，前端会生成可点击的候选按钮，用户点击后再执行对应对象。',
      '如果用户表达含糊，你可以选择最接近的技能并填入从语义中推断出的参数；缺少关键参数时再自然语言追问。',
      '可用技能：',
      ...skills,
    ].join('\n');
  };

  const renderHistory = () => {
    const node = document.getElementById('projectSkillHistory');
    if (!node) return;
    const history = readHistory();
    node.innerHTML = history.length
      ? history.map((item) => `
          <article class="project-skill-log-item">
            <span class="${item.ok ? 'is-ok' : 'is-warn'}">${item.ok ? '完成' : '未完成'}</span>
            <strong>${esc(item.title || item.skillId)}</strong>
            <em>${esc(item.at || '')}</em>
            <p>${esc(item.message || '')}</p>
          </article>
        `).join('')
      : '<div class="project-skill-empty">暂无技能执行记录</div>';
  };

  const render = () => {
    if (!refs.projectSkillPanel) return;
    const skills = getSkillRegistry();
    refs.projectSkillPanel.innerHTML = `
      <section class="project-skill-workspace">
        <section class="project-skill-list-panel" aria-label="项目技能列表">
          <div class="project-skill-history-head">
            <div>
              <div class="project-skill-kicker">Skills</div>
              <h2>项目技能</h2>
            </div>
          </div>
          <div class="project-skill-grid">
            ${skills.map((skill) => `
              <article class="project-skill-card">
                <div class="project-skill-card-top">
                  <span class="project-skill-icon"><i class="ti ${esc(skill.icon)}" aria-hidden="true"></i></span>
                  <div>
                    <strong>${esc(skill.title)}</strong>
                    <em>${esc(skill.module)} · ${esc(skill.level)}</em>
                  </div>
                </div>
                <p>${esc(skill.summary)}</p>
                <div class="project-skill-examples">
                  ${skill.examples.map((example) => `<button type="button" data-skill-example="${esc(example)}">${esc(example)}</button>`).join('')}
                </div>
              </article>
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
      }
    });
  };

  const init = () => {
    bind();
    render();
  };

  App.projectSkills = {
    init,
    render,
    getSkillRegistry,
    getAiProtocolContext,
    routePrompt,
    executePrompt,
    executeSkill,
    executeSkillCallFromText,
    formatSkillMessage,
    getResultActions,
  };
})();
