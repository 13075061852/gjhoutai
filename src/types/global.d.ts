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
    | 'property-analysis'
    | 'spectrum-analysis'
    | 'inspection-reports'
    | 'office-records'
    | 'ai-config'
    | 'ai-analysis'
    | 'theme-settings';

  type LegacyAiProvider = 'deepseek' | 'siliconflow' | 'lmstudio';
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
    apimartApiKey: string;
    apimartBaseUrl: string;
    apimartImageModel: string;
    apimartVideoModel: string;
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
    NAV_PAGE_KEY: string;
    NAV_RECENT_PAGES_KEY: string;
    CONFIG_STORAGE_KEY: string;
    CONFIG_LOG_KEY: string;
    AI_CALL_LOG_KEY: string;
    DEFAULT_BASE_URL: string;
    DEFAULT_LM_STUDIO_BASE_URL: string;
    DEFAULT_APIMART_BASE_URL: string;
    DEFAULT_LIBLIB_BASE_URL: string;
    DEFAULT_CONFIG: LegacyConfig;
    PAGE_DEFS: Record<LegacyPageId, LegacyPageDefinition>;
  };

  type LegacyRefs = Record<string, any> & {
    shell: HTMLElement | null;
    navPageButtons: NodeListOf<HTMLElement>;
    groupToggles: NodeListOf<HTMLElement>;
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
    utils?: LegacyUtils;
    aiAnalysis?: LegacyLifecycleModule;
    animations?: LegacyAnimationApi;
    officeRecords?: LegacyLifecycleModule;
    config?: LegacyLifecycleModule;
    dialogConsentAnimation?: LegacyLifecycleModule;
    confirmDialog?: Record<string, any>;
    inspectionReports?: LegacyLifecycleModule;
    motionEffects?: LegacyMotionEffectsApi;
    navigation?: LegacyLifecycleModule;
    notify?: Record<string, any>;
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
