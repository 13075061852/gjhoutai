import { ensureLegacyApp, ensurePublicApp } from './app-context';

(function () {
  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const activeTimers = new Set<number>();

  const prefersReducedMotion = () => Boolean(motionQuery?.matches);

  const syncMotionPreference = () => {
    document.documentElement.dataset.reducedMotion = prefersReducedMotion() ? '1' : '0';
  };

  const frame = (): Promise<number> => new Promise((resolve) => window.requestAnimationFrame(resolve));

  const nextFrame = async (callback?: () => void): Promise<void> => {
    await frame();
    callback?.();
  };

  const doubleFrame = async (callback?: () => void): Promise<void> => {
    await frame();
    await frame();
    callback?.();
  };

  const schedule = (duration = 0, callback?: () => void): number => {
    const timer = window.setTimeout(() => {
      activeTimers.delete(timer);
      callback?.();
    }, Math.max(0, duration));
    activeTimers.add(timer);
    return timer;
  };

  const delay = (duration = 0, callback?: () => void): Promise<void> => new Promise((resolve) => {
    schedule(duration, () => {
      callback?.();
      resolve();
    });
  });

  const clearDelay = (timer?: number | null): void => {
    if (!timer) return;
    window.clearTimeout(timer);
    activeTimers.delete(timer);
  };

  const getMotionDuration = (element: Element | null | undefined, type: LegacyMotionType): number => {
    if (!element || prefersReducedMotion()) return 0;
    const styles = window.getComputedStyle(element);
    const durationValue = type === 'animation' ? styles.animationDuration : styles.transitionDuration;
    const delayValue = type === 'animation' ? styles.animationDelay : styles.transitionDelay;

    const parseTimeList = (value: string) => String(value || '0s').split(',').map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return 0;
      if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed) || 0;
      if (trimmed.endsWith('s')) return (Number.parseFloat(trimmed) || 0) * 1000;
      return Number.parseFloat(trimmed) || 0;
    });

    const durations = parseTimeList(durationValue);
    const delays = parseTimeList(delayValue);
    return Math.max(...durations.map((duration, index) => duration + (delays[index] || delays[0] || 0)), 0);
  };

  const waitForMotion = (element: Element | null | undefined, {
    type = 'transition',
    propertyName = '',
    timeout = 0,
  }: LegacyWaitForMotionOptions = {}): Promise<boolean> => new Promise((resolve) => {
    if (!element || prefersReducedMotion()) {
      resolve(false);
      return;
    }

    const eventName = type === 'animation' ? 'animationend' : 'transitionend';
    const fallbackDuration = timeout || getMotionDuration(element, type) + 80;
    let settled = false;

    const settle = (completed: boolean) => {
      if (settled) return;
      settled = true;
      element.removeEventListener(eventName, onEnd);
      clearDelay(timer);
      resolve(completed);
    };

    const onEnd: EventListener = (event) => {
      if (event.target !== element) return;
      if (propertyName && (!('propertyName' in event) || event.propertyName !== propertyName)) return;
      settle(true);
    };

    element.addEventListener(eventName, onEnd);
    const timer = window.setTimeout(() => settle(false), Math.max(0, fallbackDuration));
    activeTimers.add(timer);
  });

  const setClass = (element: Element | null | undefined, className: string, enabled: boolean): boolean => {
    if (!element || !className) return false;
    element.classList.toggle(className, Boolean(enabled));
    return Boolean(enabled);
  };

  const addClass = (element: Element | null | undefined, className: string): void => {
    if (!element || !className) return;
    element.classList.add(className);
  };

  const removeClass = (element: Element | null | undefined, className: string): void => {
    if (!element || !className) return;
    element.classList.remove(className);
  };

  const runClassAnimation = async (element: Element | null | undefined, className: string, {
    duration = 0,
    type = 'animation',
    hideFromAT = false,
    cleanup = false,
  }: LegacyRunClassAnimationOptions = {}): Promise<boolean> => {
    if (!element || !className) return false;
    if (hideFromAT) element.setAttribute('aria-hidden', 'true');
    addClass(element, className);

    if (prefersReducedMotion()) {
      if (cleanup) removeClass(element, className);
      return false;
    }

    await waitForMotion(element, { type, timeout: duration });
    if (cleanup) removeClass(element, className);
    return true;
  };

  const cleanup = (): void => {
    activeTimers.forEach((timer) => window.clearTimeout(timer));
    activeTimers.clear();
  };

  syncMotionPreference();
  motionQuery?.addEventListener?.('change', syncMotionPreference);
  motionQuery?.addListener?.(syncMotionPreference);

  const api: LegacyAnimationApi = {
    prefersReducedMotion,
    syncMotionPreference,
    frame,
    nextFrame,
    doubleFrame,
    schedule,
    delay,
    clearDelay,
    waitForMotion,
    setClass,
    addClass,
    removeClass,
    runClassAnimation,
    cleanup,
  };

  App.animations = api;
  PublicApp.animations = api;
}());
