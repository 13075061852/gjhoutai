// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});
  const PublicApp = window.App = window.App || {};
  let activeBurst = null;
  let activeTimer = null;

  const dialogSelector = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.confirm-dialog-overlay',
    '.spectrum-delete-dialog',
    '.spectrum-preview-dialog',
    '.spectrum-compact-detail-dialog',
    '.biz-inventory-material-modal',
    '.biz-inventory-category-modal',
    '.ai-call-detail-modal',
  ].join(',');

  const directConsentSelector = [
    '[data-confirm-dialog-confirm]',
    '[data-spectrum-upload-overwrite]',
    '[data-spectrum-upload-issue-close]',
    '[data-inventory-save-material]',
    '[data-inventory-save-category]',
    '[data-supplier-save]',
    '[data-archive-save]',
  ].join(',');

  const negativeSelector = [
    '[data-confirm-dialog-cancel]',
    '[data-inventory-cancel-material]',
    '[data-inventory-cancel-category]',
    '[data-supplier-cancel]',
    '[data-archive-cancel]',
    '[data-spectrum-upload-skip]',
    '[data-spectrum-detail-close]',
    '[data-spectrum-preview-close]',
    '[data-ai-call-close]',
    '[aria-label*="关闭"]',
  ].join(',');

  const consentTextPattern = /^(确认|确定|同意|保存|添加|新增|应用|提交|完成|知道了|全部覆盖|覆盖|继续)/;
  const destructiveTextPattern = /(删除|清空|移除)/;

  const getButtonText = (button) => (button?.textContent || '').replace(/\s+/g, '').trim();

  const isConsentButton = (button) => {
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    if (!button.closest(dialogSelector)) return false;
    if (button.matches(negativeSelector)) return false;
    if (button.classList.contains('is-danger') || destructiveTextPattern.test(getButtonText(button))) return false;
    if (button.matches(directConsentSelector)) return true;
    if (button.classList.contains('biz-inventory-primary-btn')) return true;
    if (button.classList.contains('analysis-toolbar-btn-primary')) return true;
    if (button.classList.contains('confirm-dialog-btn') && button.matches('[data-confirm-dialog-confirm]')) return true;
    return consentTextPattern.test(getButtonText(button));
  };

  const cleanupBurst = () => {
    if (activeTimer) {
      window.clearTimeout(activeTimer);
      activeTimer = null;
    }
    activeBurst?.remove();
    activeBurst = null;
  };

  const createBurst = (button) => {
    cleanupBurst();
    const rect = button.getBoundingClientRect();
    const size = Math.max(42, Math.min(64, Math.max(rect.width, rect.height) * 0.62));
    const burst = document.createElement('span');
    burst.className = 'dialog-consent-burst';
    burst.setAttribute('aria-hidden', 'true');
    burst.style.setProperty('--dialog-consent-x', `${rect.left + (rect.width / 2)}px`);
    burst.style.setProperty('--dialog-consent-y', `${rect.top + (rect.height / 2)}px`);
    burst.style.setProperty('--dialog-consent-size', `${size}px`);
    burst.innerHTML = '<span class="dialog-consent-burst-ring"></span><span class="dialog-consent-burst-mark"></span>';
    document.body.appendChild(burst);
    activeBurst = burst;
    activeTimer = window.setTimeout(cleanupBurst, 720);
  };

  const play = (button) => {
    if (!button || App.animations?.prefersReducedMotion?.()) return false;
    button.classList.remove('is-consent-animating');
    void button.offsetWidth;
    button.classList.add('is-consent-animating');
    createBurst(button);
    window.setTimeout(() => button.classList.remove('is-consent-animating'), 520);
    return true;
  };

  const onClick = (event) => {
    const button = event.target?.closest?.('button');
    if (isConsentButton(button)) play(button);
  };

  document.addEventListener('click', onClick, true);

  const api = { play, cleanup: cleanupBurst };
  App.dialogConsentAnimation = api;
  PublicApp.dialogConsentAnimation = api;
}());
