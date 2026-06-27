import { ensureLegacyApp, ensurePublicApp, getPublicApp } from '../core/app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  const MAX_VISIBLE = 3;
  const DEFAULT_DURATION = 2800;
  const REPEAT_GUARD_MS = 900;
  const activeItems = new Map();
  const recentKeys = new Map();
  let container = null;

  const escapeHtml = (value) => {
    if (getPublicApp()?.utils?.escapeHtml) return getPublicApp().utils.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  };

  const normalizeTone = (tone) => (['success', 'warn', 'error', 'info'].includes(tone) ? tone : 'info');

  const getIcon = (tone) => ({
    success: 'ti-check',
    warn: 'ti-alert-triangle',
    error: 'ti-alert-triangle',
    info: 'ti-message-2-cog',
  }[tone] || 'ti-message-2-cog');

  const ensureContainer = () => {
    if (container?.isConnected) return container;
    container = document.createElement('div');
    container.className = 'system-notify-stack';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
  };

  const removeItem = (key, immediate = false) => {
    const item = activeItems.get(key);
    if (!item) return;
    window.clearTimeout(item.timer);
    activeItems.delete(key);
    if (immediate || App.animations?.prefersReducedMotion?.()) {
      item.element.remove();
      return;
    }
    item.element.classList.add('is-leaving');
    window.setTimeout(() => item.element.remove(), 180);
  };

  const refreshTimer = (key, duration) => {
    const item = activeItems.get(key);
    if (!item) return;
    window.clearTimeout(item.timer);
    item.timer = window.setTimeout(() => removeItem(key), Math.max(1000, duration));
  };

  const enforceLimit = () => {
    const extra = activeItems.size - MAX_VISIBLE;
    if (extra <= 0) return;
    [...activeItems.keys()].slice(0, extra).forEach((key) => removeItem(key, true));
  };

  const show = ({
    message,
    title = '',
    tone = 'info',
    key = '',
    duration = DEFAULT_DURATION,
  } = {} as any) => {
    const text = String(message || '').trim();
    if (!text) return null;
    const normalizedTone = normalizeTone(tone);
    const stableKey = key || `${normalizedTone}:${text}`;
    const now = Date.now();
    const existing = activeItems.get(stableKey);

    if (!existing && now - (recentKeys.get(stableKey) || 0) < REPEAT_GUARD_MS) return null;
    recentKeys.set(stableKey, now);

    if (existing) {
      existing.element.className = `system-notify-item is-${normalizedTone}`;
      existing.element.querySelector('.system-notify-icon').innerHTML = `<i class="ti ${getIcon(normalizedTone)}" aria-hidden="true"></i>`;
      existing.element.querySelector('.system-notify-message').textContent = text;
      const titleNode = existing.element.querySelector('.system-notify-title');
      if (titleNode) titleNode.textContent = title || '系统提示';
      refreshTimer(stableKey, duration);
      return existing.element;
    }

    const root = ensureContainer();
    const element = document.createElement('div');
    element.className = `system-notify-item is-${normalizedTone}`;
    element.setAttribute('role', normalizedTone === 'error' ? 'alert' : 'status');
    element.innerHTML = `
      <span class="system-notify-icon"><i class="ti ${getIcon(normalizedTone)}" aria-hidden="true"></i></span>
      <span class="system-notify-content">
        <strong class="system-notify-title">${escapeHtml(title || '系统提示')}</strong>
        <span class="system-notify-message">${escapeHtml(text)}</span>
      </span>
      <button class="system-notify-close" type="button" aria-label="关闭提示">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    `;
    element.querySelector('.system-notify-close')?.addEventListener('click', () => removeItem(stableKey));
    root.appendChild(element);
    activeItems.set(stableKey, {
      element,
      timer: window.setTimeout(() => removeItem(stableKey), Math.max(1000, duration)),
    });
    enforceLimit();
    return element;
  };

  const api = {
    show,
    success: (message, options = {} as any) => show({ ...options, message, tone: 'success' }),
    warn: (message, options = {} as any) => show({ ...options, message, tone: 'warn' }),
    error: (message, options = {} as any) => show({ ...options, message, tone: 'error' }),
    info: (message, options = {} as any) => show({ ...options, message, tone: 'info' }),
    close: removeItem,
    clear: () => [...activeItems.keys()].forEach((key) => removeItem(key, true)),
  };

  App.notify = api;
  PublicApp.notify = api;
}());
