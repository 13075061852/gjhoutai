export {};

declare global {
  type LegacyLifecycleModule = {
    init?: () => void;
    cleanup?: () => void;
  };

  interface LegacyAppNamespace extends Record<string, unknown> {
    currentUser?: {
      id: string;
      username: string;
      displayName: string;
      department: string;
      mustChangePassword: boolean;
    };
    aiCallAnalysis?: LegacyLifecycleModule;
    apimartMedia?: LegacyLifecycleModule;
    animations?: LegacyLifecycleModule;
    chat?: LegacyLifecycleModule;
    config?: LegacyLifecycleModule;
    dataRecognition?: LegacyLifecycleModule;
    imageCutout?: LegacyLifecycleModule;
    inspectionReports?: LegacyLifecycleModule;
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
