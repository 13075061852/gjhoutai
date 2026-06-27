import { ensureLegacyApp, ensurePublicApp, getPublicApp } from '../core/app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  let activeDialog = null;

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

  const normalizeDeleteMessage = (message) => {
    const text = String(message ?? '').trim();
    if (!text) return '删除后无法恢复，请确认是否继续。';
    if (text.includes('\n')) return text;
    const match = text.match(/^(.+?[？?])\s*(.+)$/);
    if (!match) return text;
    return `${match[1]}\n${match[2]}`;
  };

  const closeActive = (value = false) => {
    if (!activeDialog) return;
    const { overlay, cleanup, resolve } = activeDialog;
    activeDialog = null;
    cleanup();
    overlay.remove();
    resolve(value);
  };

  const open = ({
    title = '确认操作',
    message = '此操作执行后无法撤销。',
    confirmText = '确认',
    cancelText = '取消',
    variant = 'danger',
    icon = 'ti-alert-triangle',
  } = {} as any) => new Promise((resolve) => {
    closeActive(false);

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay dialog-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog-card dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle" aria-describedby="confirmDialogMessage">
        <div class="confirm-dialog-icon"><i class="ti ${escapeHtml(icon)}" aria-hidden="true"></i></div>
        <div class="confirm-dialog-main">
          <h2 class="confirm-dialog-title" id="confirmDialogTitle">${escapeHtml(title)}</h2>
          <p class="confirm-dialog-message" id="confirmDialogMessage">${escapeHtml(message)}</p>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-dialog-btn" type="button" data-confirm-dialog-cancel>${escapeHtml(cancelText)}</button>
          <button class="confirm-dialog-btn ${variant === 'danger' ? 'is-danger' : ''}" type="button" data-confirm-dialog-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const onClick = (event) => {
      if (event.target === overlay || event.target.closest('[data-confirm-dialog-cancel]')) {
        closeActive(false);
        return;
      }
      if (event.target.closest('[data-confirm-dialog-confirm]')) closeActive(true);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') closeActive(false);
    };
    const cleanup = () => {
      overlay.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeydown);
    };

    activeDialog = { overlay, cleanup, resolve };
    overlay.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm-dialog-confirm]')?.focus({ preventScroll: true });
  });

  const confirmDelete = (options = {} as any) => open({
    title: options.title || '确认删除',
    message: normalizeDeleteMessage(options.message || '删除后无法恢复，请确认是否继续。'),
    confirmText: options.confirmText || '确认删除',
    cancelText: options.cancelText || '取消',
    variant: 'danger',
    icon: options.icon || 'ti-trash',
  });

  PublicApp.confirmDialog = { open, confirmDelete, close: () => closeActive(false) };
  App.confirmDialog = PublicApp.confirmDialog;
}());
