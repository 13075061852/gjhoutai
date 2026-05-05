// @ts-nocheck
import { animate } from 'motion/mini';

(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});
  const PublicApp = window.App = window.App || {};
  const activeAnimations = new WeakMap();

  const prefersReducedMotion = () => App.animations?.prefersReducedMotion?.() ?? false;

  const stop = (element) => {
    const animation = activeAnimations.get(element);
    animation?.stop?.();
    activeAnimations.delete(element);
  };

  const run = (element, keyframes, options = {}) => {
    if (!element) return null;
    stop(element);

    if (prefersReducedMotion()) {
      Object.entries(keyframes).forEach(([property, value]) => {
        const values = Array.isArray(value) ? value : [value];
        element.style[property] = values[values.length - 1];
      });
      return null;
    }

    const animation = animate(element, keyframes, {
      duration: 0.28,
      easing: 'cubic-bezier(.22,.9,.24,1)',
      ...options,
    });
    activeAnimations.set(element, animation);
    animation.finished?.finally?.(() => {
      if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
    });
    return animation;
  };

  const enterFromRight = (element, options = {}) => run(element, {
    opacity: [0, 1],
    transform: ['translateX(18px)', 'translateX(0px)'],
  }, options);

  const exitToRight = (element, options = {}) => run(element, {
    opacity: [1, 0],
    transform: ['translateX(0px)', 'translateX(18px)'],
  }, options);

  const pulse = (element, options = {}) => run(element, {
    scale: [1, 1.018, 1],
  }, {
    duration: 0.22,
    ...options,
  });

  const cleanup = () => {
    // WeakMap entries are intentionally not enumerable; active animations stop
    // themselves when their owning elements are removed.
  };

  const api = {
    run,
    stop,
    enterFromRight,
    exitToRight,
    pulse,
    cleanup,
  };

  App.motionEffects = api;
  PublicApp.motionEffects = api;
}());
