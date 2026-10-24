import { ensureLegacyApp } from './app-context';
import { LOCAL_STORAGE_KEYS } from '../../services/local-storage-keys';

﻿(function () {
  'use strict';

  const App = ensureLegacyApp();

  const constants = {
    SIDEBAR_STATE_KEY: LOCAL_STORAGE_KEYS.sidebarCollapsed,
    NAV_PAGE_KEY: 'sidebar-active-page',
    NAV_RECENT_PAGES_KEY: 'sidebar-recent-pages',
    CONFIG_STORAGE_KEY: 'openrouter-ai-config-v1',
    CONFIG_LOG_KEY: 'openrouter-ai-config-log-v1',
    AI_CALL_LOG_KEY: LOCAL_STORAGE_KEYS.aiCallLog,
    DEFAULT_BASE_URL: 'https://api.deepseek.com',
    DEFAULT_LM_STUDIO_BASE_URL: 'http://127.0.0.1:1234/v1',
    DEFAULT_APIMART_BASE_URL: 'https://api.apimart.ai/v1',
    DEFAULT_LIBLIB_BASE_URL: 'https://openapi.liblibai.cloud',
    DEFAULT_CONFIG: {
      apiKey: '',
      aiProvider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      appTitle: 'DeepSeek',
      httpReferer: '',
      modelChoice: 'deepseek-v4-flash',
      agentModels: {
        data: '',
        spectrum: '',
      },
      systemPrompt: '你是一个专业、简洁的企业 AI 助手，擅长分析问题、提炼结论并给出可执行建议。',
      temperature: 0.7,
      maxTokens: 4096,
      streamEnabled: true,
      autoImageUpload: true,
      jsonMode: false,
      logEnabled: true,
      apimartApiKey: '',
      apimartBaseUrl: 'https://api.apimart.ai/v1',
      apimartImageModel: 'seedream-4.5',
      apimartVideoModel: 'kling-v2-6',
      liblibAccessKey: '',
      liblibSecretKey: '',
      liblibBaseUrl: 'https://openapi.liblibai.cloud',
      liblibImageModel: 'doubao-seedream-4-5-251128',
      liblibVideoModel: 'kling-v2-6',
      ossBucket: '',
      ossEndpoint: '',
      ossObjectKey: '',
      ossAccessKeyId: '',
      ossAccessKeySecret: '',
      ossExcelBackupPrefix: '',
    },
    PAGE_DEFS: {
      'property-analysis': {
        title: '物性分析',
        eyebrow: '数据分析',
        desc: '导入 Excel，按型号与批次检索、对比测试数据，并生成检测报告。',
      },
      'spectrum-analysis': {
        title: '图谱分析',
        eyebrow: '数据分析',
        desc: '管理 DSC / TGA 图谱图片、分类标签与多图对比。',
      },
      'inspection-reports': {
        title: '检测报告',
        eyebrow: '文档中心',
        desc: '集中存放检测报告 PDF，支持上传、检索、打开与删除。',
      },
      'office-records': {
        title: '办事记录',
        eyebrow: '业务记录',
        desc: '记录送样、配色和灰份检测的型号批次组合与明细数据。',
      },
      'ai-config': {
        title: '配置中心',
        eyebrow: '系统管理',
        desc: '配置 AI 模型接入、助手行为与数据源。',
      },
      'ai-analysis': {
        title: 'AI 分析',
        eyebrow: '数据分析',
        desc: '用自然语言提问，由服务端 AI 直接读取物性、图谱、报告与办事记录数据并实时作答。',
      },
      'theme-settings': {
        title: '主题设置',
        eyebrow: '系统管理',
        desc: '切换系统主色、背景层级和控件强调色。',
      },
    },
  } satisfies LegacyAppConstants;

  App.constants = constants;
})();
