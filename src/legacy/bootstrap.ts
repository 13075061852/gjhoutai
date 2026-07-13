import './core/app-namespace';
import '../styles/pages/config.css';
import '../styles/pages/theme-overrides.css';
import { getLegacyApp } from './core/app-context';
import { resetLegacyPageFeatures } from './bootstrap/feature-loader';
import { refreshLegacyDomRefs } from './core/dom-refs';
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

async function runLegacyInit(name: string, init?: () => void | Promise<void> | undefined): Promise<void> {
  if (typeof init !== 'function') return;
  try {
    await init();
  } catch (error) {
    console.warn(`[legacy] Failed to initialize ${name}.`, error);
  }
}

function startAssistantFeatures(version: number): void {
  void Promise.all([
    import('./features/agent-butler'),
    import('./features/chat'),
  ]).then(async () => {
    if (!booted || version !== bootVersion) return;
    const App = getLegacyApp();
    await runLegacyInit('chat', () => App?.chat?.init?.());
  }).catch((error) => {
    console.warn('[legacy] Failed to load assistant features.', error);
  });
}

export async function bootLegacyApp(): Promise<(() => void) | undefined> {
  if (booted) return undefined;
  if (bootPromise) return bootPromise;
  const version = ++bootVersion;

  bootPromise = (async () => {
    refreshLegacyDomRefs();
    await loadCoreLegacyFeatures();
    booted = true;

    const App = getLegacyApp();
    await runLegacyInit('navigation', () => App?.navigation?.init?.());
    if (!booted || version !== bootVersion) return undefined;
    startAssistantFeatures(version);
    return undefined;
  })();

  return bootPromise;
}

export function teardownLegacyApp(): void {
  bootVersion += 1;
  booted = false;
  bootPromise = null;
  resetLegacyPageFeatures();
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
