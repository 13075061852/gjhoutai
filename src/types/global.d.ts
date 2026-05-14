export {};

declare global {
  type LegacyLifecycleModule = {
    init?: () => void;
    cleanup?: () => void;
  };

  interface LegacyAppNamespace extends Record<string, unknown> {
    aiCallAnalysis?: LegacyLifecycleModule;
    apimartMedia?: LegacyLifecycleModule;
    animations?: LegacyLifecycleModule;
    chat?: LegacyLifecycleModule;
    config?: LegacyLifecycleModule;
    imageCutout?: LegacyLifecycleModule;
    motionEffects?: LegacyLifecycleModule;
    navigation?: LegacyLifecycleModule;
    projectSkills?: LegacyLifecycleModule;
    propertyAnalysis?: LegacyLifecycleModule;
    spectrumAnalysis?: LegacyLifecycleModule;
    themeSettings?: LegacyLifecycleModule;
  }

  interface Window {
    GJHApp: LegacyAppNamespace;
    App: LegacyAppNamespace;
    XLSX?: unknown;
    JSZip?: unknown;
  }
}
