(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});
  const byId = (id) => document.getElementById(id);
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => document.querySelectorAll(selector);

  const refs = {
    shell: byId('shell'),
    mobileMenuBtn: byId('mobileMenuBtn'),
    sidebarToggle: byId('sidebarToggle'),
    askAiToggle: byId('askAiToggle'),
    topVisitedPages: byId('topVisitedPages'),
    sidebarSearch: qs('.sidebar-search'),
    sidebarSearchInput: qs('.sidebar-search input'),
    navPageButtons: qsa('[data-page]'),
    groupToggles: qsa('[data-toggle="group"]'),
    aiPageSection: qs('[data-page-section="ai-config"]'),
    propertyAnalysisPageSection: qs('[data-page-section="property-analysis"]'),
    spectrumAnalysisPageSection: qs('[data-page-section="spectrum-analysis"]'),
    imageCutoutPageSection: qs('[data-page-section="image-cutout"]'),
    themeSettingsPageSection: qs('[data-page-section="theme-settings"]'),
    placeholderPageSection: qs('[data-page-section="placeholder"]'),
    placeholderEyebrow: byId('placeholderEyebrow'),
    placeholderTitle: byId('placeholderTitle'),
    placeholderDesc: byId('placeholderDesc'),
    placeholderBackBtn: byId('placeholderBackBtn'),
    placeholderOpenBtn: byId('placeholderOpenBtn'),
    analysisSearchInput: byId('analysisSearchInput'),
    analysisSheetTabs: byId('analysisSheetTabs'),
    analysisTableWrap: byId('analysisTableWrap'),
    analysisPagination: byId('analysisPagination'),
    analysisPrevPageBtn: byId('analysisPrevPageBtn'),
    analysisNextPageBtn: byId('analysisNextPageBtn'),
    analysisPageInfo: byId('analysisPageInfo'),
    analysisImportExcelBtn: byId('analysisImportExcelBtn'),
    analysisExportJsonBtn: byId('analysisExportJsonBtn'),
    analysisExcelInput: byId('analysisExcelInput'),
    analysisImportStatus: byId('analysisImportStatus'),
    aiConfigForm: byId('aiConfigForm'),
    configStatus: byId('configStatus'),
    configFileInput: byId('configFileInput'),
    aiProviderInputs: qsa('input[name="aiProvider"]'),
    aiProviderOpenRouter: byId('aiProviderOpenRouter'),
    aiProviderLmStudio: byId('aiProviderLmStudio'),
    apiKeyLabelText: byId('apiKeyLabelText'),
    apiKeyNoteText: byId('apiKeyNoteText'),
    aiProviderHelp: byId('aiProviderHelp'),
    apiKeyField: byId('apiKeyField'),
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
    ossBucket: byId('ossBucket'),
    ossEndpoint: byId('ossEndpoint'),
    ossObjectKey: byId('ossObjectKey'),
    ossAccessKeyId: byId('ossAccessKeyId'),
    ossAccessKeySecret: byId('ossAccessKeySecret'),
    ossSecretToggle: byId('ossSecretToggle'),
    ossExcelBackupPrefix: byId('ossExcelBackupPrefix'),
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
    assistantDataToggleBtn: byId('assistantDataToggleBtn'),
    clearChatBtn: byId('clearChatBtn'),
    conversationMenuBtn: byId('conversationMenuBtn'),
    conversationMenuLabel: byId('conversationMenuLabel'),
    conversationMenuPanel: byId('conversationMenuPanel'),
    conversationMenuWrap: byId('conversationMenuWrap'),
    conversationMenuSearch: byId('conversationMenuSearch'),
    assistantNewBtn: byId('assistantNewBtn'),
    assistantFullscreenNewBtn: byId('assistantFullscreenNewBtn'),
    assistantExpandBtn: byId('assistantExpandBtn'),
    assistantCloseBtn: byId('assistantCloseBtn'),
    assistantFullscreenTitle: byId('assistantFullscreenTitle'),
    assistantFullscreenSidebar: byId('assistantFullscreenSidebar'),
    assistantFullscreenSearch: byId('assistantFullscreenSearch'),
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
    NAV_RECENT_PAGES_KEY: 'sidebar-recent-pages',
    CONFIG_STORAGE_KEY: 'openrouter-ai-config-v1',
    CONFIG_LOG_KEY: 'openrouter-ai-config-log-v1',
    CHAT_STORAGE_KEY: 'openrouter-ai-chat-v1',
    CHAT_SESSIONS_KEY: 'openrouter-ai-chat-sessions-v1',
    CHAT_ACTIVE_SESSION_KEY: 'openrouter-ai-chat-active-session-v1',
    CHAT_DATA_ATTACHMENT_KEY: 'openrouter-ai-chat-data-attachment-v1',
    DEFAULT_BASE_URL: 'https://openrouter.ai/api/v1',
    DEFAULT_LM_STUDIO_BASE_URL: 'http://127.0.0.1:1234/v1',
    PROPERTY_ANALYSIS_DATA_URL: './assets/data/测试数据.json',
    DEFAULT_CONFIG: {
      apiKey: '',
      aiProvider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      appTitle: 'OpenRouter',
      httpReferer: '',
      modelChoice: 'openai/gpt-4o-mini',
      systemPrompt: '你是一个专业、简洁的企业 AI 助手，擅长分析问题、提炼结论并给出可执行建议。',
      temperature: 0.7,
      maxTokens: 4096,
      streamEnabled: true,
      jsonMode: false,
      logEnabled: true,
      ossBucket: 'gjhoutai',
      ossEndpoint: 'oss-cn-shanghai.aliyuncs.com',
      ossObjectKey: '测试数据.json',
      ossAccessKeyId: '',
      ossAccessKeySecret: '',
      ossExcelBackupPrefix: '',
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
      'property-analysis': {
        title: '物性分析',
        eyebrow: '功能开发中',
        desc: '物性分析页面暂未接入，后续会在这里展示材料物性参数、对比结果和分析结论。',
      },
      'spectrum-analysis': {
        title: '图谱分析',
        eyebrow: '当前可用',
        desc: '图谱分析页面用于管理图谱图片、分类标签、图谱查看、多图对比，并可把图片上下文发送到右侧 Gjun AI。',
      },
      'image-cutout': {
        title: '抠图助手',
        eyebrow: '当前可用',
        desc: '抠图助手支持上传图片、识别边缘背景并生成透明 PNG，也可以裁剪透明背景或输入自定义裁剪区域。',
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
      'theme-settings': {
        title: '主题设置',
        eyebrow: '当前可用',
        desc: '这里可以切换系统主色、背景层级和控件强调色，并把选择保存在本地。',
      },
      'ai-config': {
        title: '配置中心',
        eyebrow: '当前可用',
        desc: '这里可以配置 OpenRouter 接入、AI 助手行为和 OSS 数据源。支持导入、导出与本地保存。',
      },
    },
  };

  const state = {
    chatHistory: [],
    chatSessions: [],
    chatSessionId: '',
    conversationMenuQuery: '',
    chatBusy: false,
    dataAttachmentEnabled: false,
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
      const text = String(value || '').replace(/\r\n/g, '\n').trim();
      if (!text) return '';

      const escape = (input) => utils.escapeHtml(input);
      const formatInline = (input) => {
        const escaped = escape(input);
        return escaped
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      };
      const isTableSeparator = (line) => /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line) && line.includes('|');
      const splitTableRow = (line) => {
        return line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      };

      const lines = text.split('\n');
      const blocks = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
          i += 1;
          continue;
        }

        if (/^---+$/.test(trimmed)) {
          blocks.push('<hr>');
          i += 1;
          continue;
        }

        if (trimmed.includes('|')) {
          const tableLines = [];
          let j = i;
          while (j < lines.length) {
            const candidate = lines[j].trim();
            if (!candidate) break;
            if (!candidate.includes('|') && !isTableSeparator(candidate)) break;
            tableLines.push(candidate);
            j += 1;
          }

          const hasTableSeparator = tableLines.some(isTableSeparator);
          const hasMultipleRows = tableLines.length >= 2;
          const isLikelyTable = hasMultipleRows && (hasTableSeparator || tableLines.every((line) => line.includes('|')));

          if (isLikelyTable) {
            const rows = tableLines.filter((line) => !isTableSeparator(line)).map(splitTableRow);
            if (rows.length >= 2) {
              const header = rows[0];
              const body = rows.slice(1);
              const headHtml = `<thead><tr>${header.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>`;
              const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
              blocks.push(`<div class="markdown-table-wrap"><table>${headHtml}${bodyHtml}</table></div>`);
              i = j;
              continue;
            }
          }
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          blocks.push(`<h${level}>${formatInline(headingMatch[2].trim())}</h${level}>`);
          i += 1;
          continue;
        }

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
          const items = [];
          while (i < lines.length) {
            const current = lines[i].trim();
            const match = current.match(/^[-*+]\s+(.+)$/);
            if (!match) break;
            items.push(`<li>${formatInline(match[1].trim())}</li>`);
            i += 1;
          }
          blocks.push(`<ul>${items.join('')}</ul>`);
          continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
          const items = [];
          while (i < lines.length) {
            const current = lines[i].trim();
            const match = current.match(/^\d+\.\s+(.+)$/);
            if (!match) break;
            items.push(`<li>${formatInline(match[1].trim())}</li>`);
            i += 1;
          }
          blocks.push(`<ol>${items.join('')}</ol>`);
          continue;
        }

        const paragraph = [];
        while (i < lines.length) {
          const current = lines[i];
          const currentTrimmed = current.trim();
          if (!currentTrimmed) break;
          if (/^---+$/.test(currentTrimmed) || /^(#{1,6})\s+/.test(currentTrimmed) || /^[-*+]\s+/.test(currentTrimmed) || /^\d+\.\s+/.test(currentTrimmed)) {
            break;
          }
          paragraph.push(currentTrimmed);
          i += 1;
        }

        const paragraphHtml = formatInline(paragraph.join(' ')).replace(/\n/g, '<br>');
        blocks.push(`<p>${paragraphHtml}</p>`);
      }

      return blocks.join('');
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
