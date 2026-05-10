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

async function loadLegacyFeatures(): Promise<void> {
  await Promise.all([
    import('./features/business-pages'),
    import('./shell/navigation'),
    import('./features/property-analysis'),
    import('./features/spectrum-analysis'),
    import('./features/image-cutout'),
    import('./features/theme-settings'),
    import('./features/config'),
    import('./features/ai-call-analysis'),
    import('./features/project-skills'),
    import('./features/agent-butler'),
    import('./features/chat'),
  ]);
}

export async function bootLegacyApp(): Promise<(() => void) | undefined> {
  if (booted) return undefined;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    await loadLegacyFeatures();
    booted = true;

    const App = getLegacyApp();
    App?.navigation?.init?.();
    App?.themeSettings?.init?.();
    App?.propertyAnalysis?.init?.();
    App?.spectrumAnalysis?.init?.();
    App?.imageCutout?.init?.();
    App?.config?.init?.();
    App?.aiCallAnalysis?.init?.();
    App?.projectSkills?.init?.();
    App?.chat?.init?.();
    return undefined;
  })();

  return bootPromise;
}

export function teardownLegacyApp(): void {
  booted = false;
  bootPromise = null;
  const App = getLegacyApp();
  App?.animations?.cleanup?.();
  App?.motionEffects?.cleanup?.();
}
