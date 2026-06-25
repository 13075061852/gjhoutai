import { animate } from 'motion/mini';
import { ensureLegacyApp, ensurePublicApp } from './app-context';

type LegacyMotionPlayback = {
  stop?: () => void;
  finished?: Promise<unknown>;
};

type LegacyMotionKeyframes = Record<string, string | number | Array<string | number>>;
type LegacyMotionOptions = Record<string, unknown>;

(function () {
  'use strict';

  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  const activeAnimations = new WeakMap<HTMLElement | SVGElement, LegacyMotionPlayback>();

  const prefersReducedMotion = () => App.animations?.prefersReducedMotion?.() ?? false;

  const stop = (element: HTMLElement | SVGElement | null | undefined): void => {
    if (!element) return;
    const animation = activeAnimations.get(element);
    animation?.stop?.();
    activeAnimations.delete(element);
  };

  const run = (element: HTMLElement | SVGElement | null | undefined, keyframes: LegacyMotionKeyframes, options: LegacyMotionOptions = {}): LegacyMotionPlayback | null => {
    if (!element) return null;
    stop(element);

    if (prefersReducedMotion()) {
      Object.entries(keyframes).forEach(([property, value]) => {
        const values = Array.isArray(value) ? value : [value];
        element.style.setProperty(property, String(values[values.length - 1] ?? ''));
      });
      return null;
    }

    const animation = animate(element, keyframes, {
      duration: 0.28,
      easing: 'cubic-bezier(.22,.9,.24,1)',
      ...options,
    } as Parameters<typeof animate>[2]) as LegacyMotionPlayback;
    activeAnimations.set(element, animation);
    animation.finished?.finally?.(() => {
      if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
    });
    return animation;
  };

  const enterFromRight = (element: HTMLElement | SVGElement | null | undefined, options: LegacyMotionOptions = {}) => run(element, {
    opacity: [0, 1],
    transform: ['translateX(10px)', 'translateX(0px)'],
  }, options);

  const exitToRight = (element: HTMLElement | SVGElement | null | undefined, options: LegacyMotionOptions = {}) => run(element, {
    opacity: [1, 0],
    transform: ['translateX(0px)', 'translateX(10px)'],
  }, options);

  const softSettle = (element: HTMLElement | SVGElement | null | undefined, options: LegacyMotionOptions = {}) => run(element, {
    opacity: [0.94, 1],
    transform: ['translateY(3px)', 'translateY(0px)'],
  }, {
    duration: 0.2,
    ...options,
  });

  const cleanup = (): void => {
    // WeakMap entries are intentionally not enumerable; active animations stop
    // themselves when their owning elements are removed.
  };

  const api: LegacyMotionEffectsApi = {
    run,
    stop,
    enterFromRight,
    exitToRight,
    softSettle,
    cleanup,
  };

  App.motionEffects = api;
  PublicApp.motionEffects = api;
}());
