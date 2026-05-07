import './core/app-namespace';
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
import './features/business-pages';
import './shell/navigation';
import './features/property-analysis';
import './features/spectrum-analysis';
import './features/image-cutout';
import './features/theme-settings';
import './features/config';
import './features/ai-call-analysis';
import './features/project-skills';
import './features/agent-butler';
import './features/chat';

let booted = false;

export function bootLegacyApp(): (() => void) | undefined {
  if (booted) return undefined;
  booted = true;
  window.GJHApp?.navigation?.init?.();
  window.GJHApp?.themeSettings?.init?.();
  window.GJHApp?.propertyAnalysis?.init?.();
  window.GJHApp?.spectrumAnalysis?.init?.();
  window.GJHApp?.imageCutout?.init?.();
  window.GJHApp?.config?.init?.();
  window.GJHApp?.aiCallAnalysis?.init?.();
  window.GJHApp?.projectSkills?.init?.();
  window.GJHApp?.chat?.init?.();
  return undefined;
}

export function teardownLegacyApp(): void {
  booted = false;
  window.GJHApp?.animations?.cleanup?.();
  window.GJHApp?.motionEffects?.cleanup?.();
}
