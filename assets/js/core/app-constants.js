(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});

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
      'inventory-management': {
        title: '库存管理',
        eyebrow: '生产与配方',
        desc: '统一管理原材料和生产完成后的成品材料，按供应商、分类、批次和库存状态联动供应商档案。',
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
        title: 'AI技能面板',
        eyebrow: '业务中心',
        desc: '集中管理本项目专属技能、AI 调用协议和执行记录，让 Gjun AI 可以按规范调取技能完成项目内操作。',
      },
      'ai-call-analysis': {
        title: 'AI调用分析',
        eyebrow: '业务中心',
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
        eyebrow: '系统管理',
        desc: '这里可以配置 OpenRouter 接入、AI 助手行为和 OSS 数据源。支持导入、导出与本地保存。',
      },
    },
  };

  App.constants = constants;
})();
