export {};

declare global {
  interface Object {
    [key: string]: any;
  }

  interface Event {
    key?: string;
    deltaY?: number;
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    dataTransfer?: DataTransfer | null;
    isComposing?: boolean;
    target: any;
  }

  type LegacyPageId =
    | 'dashboard'
    | 'order-management'
    | 'order-detail'
    | 'invoice-print'
    | 'formula-management'
    | 'production-plan'
    | 'inventory-management'
    | 'supplier-archive'
    | 'supplier-detail'
    | 'raw-material-procurement'
    | 'customer-archive'
    | 'customer-detail'
    | 'personnel-archive'
    | 'property-analysis'
    | 'spectrum-analysis'
    | 'data-recognition'
    | 'office-records'
    | 'inspection-reports'
    | 'image-cutout'
    | 'project-skills'
    | 'apimart-media'
    | 'ai-call-analysis'
    | 'permission-management'
    | 'theme-settings'
    | 'ai-config';

  type LegacyAiProvider = 'openrouter' | 'deepseek' | 'siliconflow' | 'lmstudio';
  type LegacySearchProvider = 'tavily' | 'serpapi' | 'bing' | 'none';
  type LegacySearchDepth = 'basic' | 'advanced';
  type LegacySearchTopic = 'general' | 'news' | 'finance';
  type LegacyMotionType = 'animation' | 'transition';

  type LegacyLifecycleModule = Record<string, any> & {
    init?: () => void | Promise<void>;
    cleanup?: () => void;
  };

  type LegacyPageDefinition = {
    title: string;
    eyebrow: string;
    desc: string;
  };

  type LegacyConfig = {
    apiKey: string;
    aiProvider: LegacyAiProvider;
    baseUrl: string;
    appTitle: string;
    httpReferer: string;
    modelChoice: string;
    agentModels: {
      data: string;
      spectrum: string;
    };
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    streamEnabled: boolean;
    autoImageUpload: boolean;
    jsonMode: boolean;
    logEnabled: boolean;
    searchProvider: LegacySearchProvider;
    searchApiKey: string;
    searchDepth: LegacySearchDepth;
    searchMaxResults: number;
    searchTopic: LegacySearchTopic;
    liblibAccessKey: string;
    liblibSecretKey: string;
    liblibBaseUrl: string;
    liblibImageModel: string;
    liblibVideoModel: string;
    ossBucket: string;
    ossEndpoint: string;
    ossObjectKey: string;
    ossAccessKeyId: string;
    ossAccessKeySecret: string;
    ossExcelBackupPrefix: string;
  };

  type LegacyAppConstants = {
    SIDEBAR_STATE_KEY: string;
    ASSISTANT_STATE_KEY: string;
    NAV_PAGE_KEY: string;
    NAV_RECENT_PAGES_KEY: string;
    CONFIG_STORAGE_KEY: string;
    CONFIG_LOG_KEY: string;
    CHAT_STORAGE_KEY: string;
    CHAT_SESSIONS_KEY: string;
    CHAT_SESSION_INDEX_KEY: string;
    CHAT_SESSION_PREFIX: string;
    CHAT_ACTIVE_SESSION_KEY: string;
    CHAT_DATA_ATTACHMENT_KEY: string;
    CHAT_SEARCH_ENABLED_KEY: string;
    AI_CALL_LOG_KEY: string;
    DEFAULT_BASE_URL: string;
    DEFAULT_LM_STUDIO_BASE_URL: string;
    DEFAULT_LIBLIB_BASE_URL: string;
    DEFAULT_CONFIG: LegacyConfig;
    PAGE_DEFS: Record<LegacyPageId, LegacyPageDefinition>;
  };

  type LegacyRefs = Record<string, any> & {
    shell: HTMLElement | null;
    navPageButtons: NodeListOf<HTMLElement>;
    groupToggles: NodeListOf<HTMLElement>;
  };

  type LegacyState = {
    chatHistory: any[];
    chatSessions: any[];
    chatSessionId: string;
    conversationMenuQuery: string;
    chatBusy: boolean;
    dataAttachmentEnabled: boolean;
  };

  type LegacyUtils = {
    normalizeBaseUrl: (value?: string | null) => string;
    escapeHtml: (value: unknown) => string;
    markdownLite: (value: unknown) => string;
    maskKey: (key: unknown) => string;
    readJson: <T>(key: string, fallback: T) => T;
    writeJson: (key: string, value: unknown) => boolean;
    downloadUtf8Json: (filename: string, data: unknown) => void;
    copyText: (text: string) => Promise<boolean>;
  };

  type LegacyWaitForMotionOptions = {
    type?: LegacyMotionType;
    propertyName?: string;
    timeout?: number;
  };

  type LegacyRunClassAnimationOptions = LegacyWaitForMotionOptions & {
    duration?: number;
    hideFromAT?: boolean;
    cleanup?: boolean;
  };

  type LegacyAnimationApi = {
    prefersReducedMotion: () => boolean;
    syncMotionPreference: () => void;
    frame: () => Promise<number>;
    nextFrame: (callback?: () => void) => Promise<void>;
    doubleFrame: (callback?: () => void) => Promise<void>;
    schedule: (duration?: number, callback?: () => void) => number;
    delay: (duration?: number, callback?: () => void) => Promise<void>;
    clearDelay: (timer?: number | null) => void;
    waitForMotion: (element: Element | null | undefined, options?: LegacyWaitForMotionOptions) => Promise<boolean>;
    setClass: (element: Element | null | undefined, className: string, enabled: boolean) => boolean;
    addClass: (element: Element | null | undefined, className: string) => void;
    removeClass: (element: Element | null | undefined, className: string) => void;
    runClassAnimation: (element: Element | null | undefined, className: string, options?: LegacyRunClassAnimationOptions) => Promise<boolean>;
    cleanup: () => void;
  };

  type LegacyMotionEffectsApi = {
    run: (element: HTMLElement | SVGElement | null | undefined, keyframes: Record<string, string | number | Array<string | number>>, options?: Record<string, unknown>) => unknown;
    stop: (element: HTMLElement | SVGElement | null | undefined) => void;
    enterFromRight: (element: HTMLElement | SVGElement | null | undefined, options?: Record<string, unknown>) => unknown;
    exitToRight: (element: HTMLElement | SVGElement | null | undefined, options?: Record<string, unknown>) => unknown;
    softSettle: (element: HTMLElement | SVGElement | null | undefined, options?: Record<string, unknown>) => unknown;
    cleanup: () => void;
  };

  type LegacyAgentRunState =
    | 'routing'
    | 'planning'
    | 'executing'
    | 'awaiting_confirmation'
    | 'composing'
    | 'completed'
    | 'failed'
    | 'timed_out'
    | 'cancelled';

  type LegacyAgentProgressEvent = {
    runId?: string;
    at: string;
    phase: LegacyAgentRunState;
    label: string;
    status: 'started' | 'running' | 'completed' | 'failed' | 'waiting_confirmation';
    toolId?: string;
    stepId?: string;
    durationMs?: number;
  };

  type LegacyAgentRunRecord = {
    version: 2;
    id: string;
    prompt: string;
    state: LegacyAgentRunState;
    pendingConfirmation?: {
      version: 2;
      id: string;
      runId: string;
      stepId: string;
      toolId: string;
      riskLevel: 'read' | 'create' | 'update' | 'delete';
      expiresAt: string;
    };
    [key: string]: any;
  };

  type LegacyAgentRuntimeResult = {
    run: LegacyAgentRunRecord;
    state: LegacyAgentRunState;
    answer: string;
    images: unknown[];
    actions: unknown[];
  };

  type LegacyAgentRuntime = {
    run: (input: {
      prompt: string;
      activePageId: string;
      projectAccessEnabled: boolean;
      webSearchEnabled: boolean;
      signal?: AbortSignal;
      onProgress?: (event: LegacyAgentProgressEvent) => void;
    }) => Promise<LegacyAgentRuntimeResult>;
    confirm: (input: {
      runId: string;
      confirmationId: string;
      signal?: AbortSignal;
    }) => Promise<LegacyAgentRuntimeResult>;
    cancel: (runId: string) => Promise<LegacyAgentRunRecord | null>;
  };

  type LegacyAgentToolRegistry = {
    register: (definition: Record<string, unknown>) => void;
    get: (toolId: string) => Record<string, unknown> | null;
    list: () => Array<Record<string, unknown>>;
    getPlannerCatalog: () => Array<Record<string, unknown>>;
    prepareCall: (
      toolId: string,
      input: unknown,
      context: { runId: string; stepId: string },
    ) => Record<string, unknown>;
    validateResult: (toolId: string, result: unknown) => Record<string, unknown>;
  };

  type LegacyProjectSkillsApi = LegacyLifecycleModule & {
    getToolRegistry?: () => LegacyAgentToolRegistry;
    getToolCatalog?: () => Array<Record<string, unknown>>;
    resumeConfirmedRun?: (...args: any[]) => Promise<unknown>;
    executeSkill?: (...args: any[]) => Promise<unknown>;
  };

  interface LegacyAppNamespace extends Record<string, any> {
    currentUser?: {
      id: string;
      username: string;
      displayName: string;
      display_name?: string;
      department: string;
      mustChangePassword: boolean;
    };
    constants?: LegacyAppConstants;
    refs?: LegacyRefs;
    state?: LegacyState;
    utils?: LegacyUtils;
    aiCallAnalysis?: LegacyLifecycleModule;
    apimartMedia?: LegacyLifecycleModule;
    animations?: LegacyAnimationApi;
    agentRuntime?: LegacyAgentRuntime;
    agentToolRegistry?: LegacyAgentToolRegistry;
    businessPages?: LegacyLifecycleModule;
    chat?: LegacyLifecycleModule;
    config?: LegacyLifecycleModule;
    dataRecognition?: LegacyLifecycleModule;
    dialogConsentAnimation?: LegacyLifecycleModule;
    confirmDialog?: Record<string, any>;
    imageCutout?: LegacyLifecycleModule;
    inspectionReports?: LegacyLifecycleModule;
    motionEffects?: LegacyMotionEffectsApi;
    navigation?: LegacyLifecycleModule;
    notify?: Record<string, any>;
    projectSkills?: LegacyProjectSkillsApi;
    propertyAnalysis?: LegacyLifecycleModule;
    spectrumAnalysis?: LegacyLifecycleModule;
    themeSettings?: LegacyLifecycleModule;
  }

  interface EventTarget {
    closest?: (selectors: string) => Element | null;
    matches?: (selectors: string) => boolean;
    getAttribute?: (qualifiedName: string) => string | null;
    value?: any;
    checked?: boolean;
    files?: FileList | null;
    dataset?: DOMStringMap;
  }

  interface Element {
    style?: CSSStyleDeclaration;
    value?: any;
    checked?: boolean;
    disabled?: boolean;
    hidden: boolean;
    files?: FileList | null;
    options?: any;
    selected?: boolean;
    offsetParent?: Element | null;
    offsetWidth?: number;
    offsetHeight?: number;
    complete?: boolean;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
    focus?: (options?: FocusOptions) => void;
    select?: () => void;
    blur?: () => void;
  }

  interface HTMLElement {
    type?: string;
  }

  interface ObjectConstructor {
    entries(o: any): [string, any][];
    values(o: any): any[];
    keys(o: any): string[];
  }

  interface ArrayConstructor {
    from(arrayLike: any, mapfn?: (value: any, index: number) => any, thisArg?: any): any[];
  }

  interface Window {
    GJHApp: LegacyAppNamespace;
    App: LegacyAppNamespace;
    XLSX?: any;
    JSZip?: any;
  }
}
