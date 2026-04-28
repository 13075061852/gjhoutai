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
    projectSkillPageSection: qs('[data-page-section="project-skills"]'),
    projectSkillPanel: byId('projectSkillPanel'),
    aiCallAnalysisPageSection: qs('[data-page-section="ai-call-analysis"]'),
    aiCallAnalysisPanel: byId('aiCallAnalysisPanel'),
    placeholderPageSection: qs('[data-page-section="placeholder"]'),
    businessPageContent: byId('businessPageContent'),
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
    AI_CALL_LOG_KEY: 'openrouter-ai-call-log-v1',
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
        eyebrow: '经营总览',
        desc: '汇总订单、库存、生产、客户和质量数据，帮助管理层快速看到今天的运营节奏。',
      },
      'order-management': {
        title: '订单管理',
        eyebrow: '销售履约',
        desc: '集中跟进订单状态、交期风险、待审核变更和客户交付节奏。',
      },
      'invoice-print': {
        title: '开单打印',
        eyebrow: '单据中心',
        desc: '面向出库、对账和随货资料的开单打印工作台，支持模板、批量和异常提示。',
      },
      'sales-stock': {
        title: '销售库存',
        eyebrow: '库存协同',
        desc: '连接销售订单与可用库存，提前暴露缺货、锁库和周转压力。',
      },
      'formula-management': {
        title: '配方管理',
        eyebrow: '工艺资产',
        desc: '沉淀配方版本、工艺参数、材料比例和变更记录，减少重复试错。',
      },
      'production-plan': {
        title: '生产计划',
        eyebrow: '排产协同',
        desc: '以订单交期、产线负荷和原料到位情况组织每日生产计划。',
      },
      'supplier-archive': {
        title: '供应商档案',
        eyebrow: '采购基础',
        desc: '管理供应商资质、联系人、供货品类、价格条款和风险等级。',
      },
      'customer-archive': {
        title: '客户档案',
        eyebrow: '客户经营',
        desc: '沉淀客户资料、交易历史、信用状态和跟进事项，支持长期服务。',
      },
      'personnel-archive': {
        title: '人员档案',
        eyebrow: '组织管理',
        desc: '管理员工资料、岗位职责、在岗状态和系统权限关联。',
      },
      'data-source-config': {
        title: '数据源配置',
        eyebrow: '数据治理',
        desc: '统一查看接口、文件、OSS、表格与业务模块之间的数据同步关系。',
      },
      'property-analysis': {
        title: '物性分析',
        eyebrow: '当前可用',
        desc: '物性分析页面用于导入 Excel、搜索型号批次、分页查看测试数据，并支持把数据上下文发送给右侧 Gjun AI。',
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
      'project-skills': {
        title: '技能面板',
        eyebrow: 'Agent 管家',
        desc: '集中管理本项目专属技能、AI 调用协议和执行记录，让 Gjun AI 可以按规范调取技能完成项目内操作。',
      },
      'ai-call-analysis': {
        title: 'AI调用分析面板',
        eyebrow: 'AI 功能',
        desc: '追踪每一次 AI 模型调用、Token 消耗、费用估算、调用来源和执行状态，方便分析成本与使用质量。',
      },
      'permission-management': {
        title: '权限管理',
        eyebrow: '系统安全',
        desc: '围绕角色、菜单、数据范围和审批动作建立可追踪的权限体系。',
      },
      'audit-log': {
        title: '审计日志',
        eyebrow: '操作追踪',
        desc: '记录关键操作、配置变更、登录访问和异常事件，方便追溯。',
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
