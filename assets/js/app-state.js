(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});
  const byId = (id) => document.getElementById(id);
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => document.querySelectorAll(selector);

  const refs = {
    shell: byId('shell'),
    sidebarToggle: byId('sidebarToggle'),
    askAiToggle: byId('askAiToggle'),
    sidebarSearch: qs('.sidebar-search'),
    sidebarSearchInput: qs('.sidebar-search input'),
    navPageButtons: qsa('[data-page]'),
    groupToggles: qsa('[data-toggle="group"]'),
    aiPageSection: qs('[data-page-section="ai-config"]'),
    placeholderPageSection: qs('[data-page-section="placeholder"]'),
    placeholderEyebrow: byId('placeholderEyebrow'),
    placeholderTitle: byId('placeholderTitle'),
    placeholderDesc: byId('placeholderDesc'),
    placeholderBackBtn: byId('placeholderBackBtn'),
    placeholderOpenBtn: byId('placeholderOpenBtn'),
    aiConfigForm: byId('aiConfigForm'),
    configStatus: byId('configStatus'),
    configFileInput: byId('configFileInput'),
    apiKeyToggle: byId('apiKeyToggle'),
    openrouterApiKey: byId('openrouterApiKey'),
    openrouterBaseUrl: byId('openrouterBaseUrl'),
    appTitle: byId('appTitle'),
    httpReferer: byId('httpReferer'),
    modelDropdown: byId('modelDropdown'),
    modelSelectTrigger: byId('modelSelectTrigger'),
    modelSelectTriggerLabel: byId('modelSelectTriggerLabel'),
    modelSelectPanel: byId('modelSelectPanel'),
    modelSelect: byId('modelSelect'),
    systemPrompt: byId('systemPrompt'),
    temperature: byId('temperature'),
    temperatureValue: byId('temperatureValue'),
    maxTokens: byId('maxTokens'),
    streamEnabled: byId('streamEnabled'),
    jsonMode: byId('jsonMode'),
    logEnabled: byId('logEnabled'),
    previewModel: byId('previewModel'),
    previewBaseUrl: byId('previewBaseUrl'),
    previewAppTitle: byId('previewAppTitle'),
    previewKey: byId('previewKey'),
    previewFlags: byId('previewFlags'),
    previewPrompt: byId('previewPrompt'),
    previewStatusText: byId('previewStatusText'),
    chatMessages: byId('chatMessages'),
    chatIntroText: byId('chatIntroText'),
    chatInput: byId('chatInput'),
    chatSendBtn: byId('chatSendBtn'),
    clearChatBtn: byId('clearChatBtn'),
    newConversationBtn: byId('newConversationBtn'),
    assistantNewBtn: byId('assistantNewBtn'),
    assistantExpandBtn: byId('assistantExpandBtn'),
    assistantCloseBtn: byId('assistantCloseBtn'),
    loadModelsBtn: byId('loadModelsBtn'),
    importConfigBtn: byId('importConfigBtn'),
    exportConfigBtn: byId('exportConfigBtn'),
    testConfigBtn: byId('testConfigBtn'),
    clearConfigBtn: byId('clearConfigBtn'),
    copyConfigBtn: byId('copyConfigBtn'),
    syncPreviewBtn: byId('syncPreviewBtn'),
    resetPreviewBtn: byId('resetPreviewBtn'),
    refreshPreviewBtn: byId('refreshPreviewBtn'),
    copyEndpointBtn: byId('copyEndpointBtn'),
    aiConfigNav: byId('aiConfigNav'),
  };

  const constants = {
    SIDEBAR_STATE_KEY: 'sidebar-collapsed',
    ASSISTANT_STATE_KEY: 'assistant-collapsed',
    NAV_PAGE_KEY: 'sidebar-active-page',
    CONFIG_STORAGE_KEY: 'openrouter-ai-config-v1',
    CONFIG_LOG_KEY: 'openrouter-ai-config-log-v1',
    CHAT_STORAGE_KEY: 'openrouter-ai-chat-v1',
    DEFAULT_BASE_URL: 'https://openrouter.ai/api/v1',
    DEFAULT_CONFIG: {
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      appTitle: 'OpenRouter',
      httpReferer: '',
      modelChoice: 'openai/gpt-4o-mini',
      systemPrompt: '你是一个专业、简洁的企业 AI 助手，擅长分析问题、提炼结论并给出可执行建议。',
      temperature: 0.7,
      maxTokens: 1024,
      streamEnabled: true,
      jsonMode: false,
      logEnabled: true,
    },
    PAGE_DEFS: {
      dashboard: {
        title: '仪表盘',
        eyebrow: '功能开发中',
        desc: '仪表盘页面还在建设中，当前先保留导航入口。后续接入后，这里会展示关键指标、趋势和待办事项。',
      },
      'order-management': {
        title: '订单管理',
        eyebrow: '功能开发中',
        desc: '订单管理页面暂未接入，当前仅保留菜单位，后续会支持订单查询、编辑和状态流转。',
      },
      'invoice-print': {
        title: '开单打印',
        eyebrow: '功能开发中',
        desc: '开单打印页面暂未实现，后续会在这里接入单据生成、打印模板和批量输出。',
      },
      'sales-stock': {
        title: '销售库存',
        eyebrow: '功能开发中',
        desc: '销售库存页面暂未接入，后续会展示库存变化、出入库记录和销售联动数据。',
      },
      'formula-management': {
        title: '配方管理',
        eyebrow: '功能开发中',
        desc: '配方管理页面暂未接入，后续会支持配方维护、版本对比和参数查看。',
      },
      'production-plan': {
        title: '生产计划',
        eyebrow: '功能开发中',
        desc: '生产计划页面暂未接入，后续会支持排产、计划调整和产线视图。',
      },
      'supplier-archive': {
        title: '供应商档案',
        eyebrow: '功能开发中',
        desc: '供应商档案页面暂未接入，后续会管理供应商资料、联系人和资质信息。',
      },
      'customer-archive': {
        title: '客户档案',
        eyebrow: '功能开发中',
        desc: '客户档案页面暂未接入，后续会管理客户资料、分组和历史交易信息。',
      },
      'personnel-archive': {
        title: '人员档案',
        eyebrow: '功能开发中',
        desc: '人员档案页面暂未接入，后续会管理员工资料、岗位和权限关联。',
      },
      'data-source-config': {
        title: '数据源配置',
        eyebrow: '功能开发中',
        desc: '数据源配置页面暂未接入，后续会配置接口、同步规则和字段映射。',
      },
      'permission-management': {
        title: '权限管理',
        eyebrow: '功能开发中',
        desc: '权限管理页面暂未接入，后续会支持角色、菜单权限和数据权限配置。',
      },
      'audit-log': {
        title: '审计日志',
        eyebrow: '功能开发中',
        desc: '审计日志页面暂未接入，后续会记录关键操作、配置变更和访问历史。',
      },
      'ai-config': {
        title: 'AI配置中心',
        eyebrow: '当前可用',
        desc: '这里可以配置 OpenRouter 的 API Key、模型 ID 和调用参数。支持导入、导出与本地保存。',
      },
    },
  };

  const state = {
    chatHistory: [],
    chatBusy: false,
  };

  const utils = {
    normalizeBaseUrl(value) {
      return (value || constants.DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    },
    escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch]));
    },
    markdownLite(value) {
      return utils.escapeHtml(value || '')
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    },
    maskKey(key) {
      const value = String(key || '').trim();
      if (!value) return '未填写';
      if (value.length <= 8) return `${value.slice(0, 2)}***`;
      return `${value.slice(0, 4)}…${value.slice(-4)}`;
    },
    readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    downloadUtf8Json(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    async copyText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    },
  };

  Object.assign(App, { refs, constants, state, utils });
})();
