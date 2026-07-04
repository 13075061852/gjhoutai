import './core/app-namespace';
import { getLegacyApp } from './core/app-context';
import './core/dom-refs';
import './core/app-constants';
import './core/runtime-state';
import './core/utils';
import './bootstrap/app-state';
import './core/animation-manager';
import './core/motion-effects';
import './components/custom-select';
import './components/search-box';
import './components/confirm-dialog';
import './components/dialog-consent-animation';
import './components/system-notify';

let booted = false;
let bootPromise: Promise<(() => void) | undefined> | null = null;
let bootVersion = 0;

async function loadCoreLegacyFeatures(): Promise<void> {
  await import('./shell/navigation');
}

async function loadDeferredLegacyFeatures(): Promise<void> {
  await Promise.all([
    import('./features/theme-settings'),
    import('./features/property-analysis'),
    import('./features/spectrum-analysis'),
    import('./features/data-recognition'),
    import('./features/inspection-reports'),
    import('./features/image-cutout'),
    import('./features/config'),
    import('./features/apimart-media'),
    import('./features/ai-call-analysis'),
    import('./features/project-skills'),
    import('./features/agent-butler'),
    import('./features/chat'),
  ]);
}

async function runLegacyInit(name: string, init?: () => void | Promise<void> | undefined): Promise<void> {
  if (typeof init !== 'function') return;
  try {
    await init();
  } catch (error) {
    console.warn(`[legacy] Failed to initialize ${name}.`, error);
  }
}

function startDeferredLegacyFeatures(version: number): void {
  void (async () => {
    await loadDeferredLegacyFeatures();
    if (!booted || version !== bootVersion) return;

    const App = getLegacyApp();
    await Promise.all([
      runLegacyInit('themeSettings', () => App?.themeSettings?.init?.()),
      runLegacyInit('propertyAnalysis', () => App?.propertyAnalysis?.init?.()),
      runLegacyInit('spectrumAnalysis', () => App?.spectrumAnalysis?.init?.()),
      runLegacyInit('dataRecognition', () => App?.dataRecognition?.init?.()),
      runLegacyInit('inspectionReports', () => App?.inspectionReports?.init?.()),
      runLegacyInit('imageCutout', () => App?.imageCutout?.init?.()),
      runLegacyInit('config', () => App?.config?.init?.()),
      runLegacyInit('apimartMedia', () => App?.apimartMedia?.init?.()),
      runLegacyInit('aiCallAnalysis', () => App?.aiCallAnalysis?.init?.()),
      runLegacyInit('projectSkills', () => App?.projectSkills?.init?.()),
      runLegacyInit('chat', () => App?.chat?.init?.()),
    ]);
  })().catch((error) => {
    console.warn('[legacy] Failed to load deferred features.', error);
  });
}

export async function bootLegacyApp(): Promise<(() => void) | undefined> {
  if (booted) return undefined;
  if (bootPromise) return bootPromise;
  const version = ++bootVersion;

  bootPromise = (async () => {
    await loadCoreLegacyFeatures();
    booted = true;

    const App = getLegacyApp();
    await runLegacyInit('navigation', () => App?.navigation?.init?.());
    startDeferredLegacyFeatures(version);
    return undefined;
  })();

  return bootPromise;
}

export function teardownLegacyApp(): void {
  bootVersion += 1;
  booted = false;
  bootPromise = null;
  const App = getLegacyApp();
  const modules: Array<LegacyLifecycleModule | LegacyAnimationApi | LegacyMotionEffectsApi | undefined> = [
    App?.chat,
    App?.projectSkills,
    App?.aiCallAnalysis,
    App?.apimartMedia,
    App?.config,
    App?.themeSettings,
    App?.imageCutout,
    App?.inspectionReports,
    App?.dataRecognition,
    App?.spectrumAnalysis,
    App?.propertyAnalysis,
    App?.businessPages,
    App?.navigation,
    App?.dialogConsentAnimation,
    App?.animations,
    App?.motionEffects,
  ];
  modules.forEach((module) => {
    try {
      module?.cleanup?.();
    } catch (error) {
      console.warn('[legacy] Failed to cleanup module.', error);
    }
  });
}
