import { ensureLegacyApp, ensurePublicApp } from '../core/app-context';

// System toast notifications are disabled across the workspace. Preserve the
// callable API so existing business actions do not fall back to other popups.
(function () {
  const App = ensureLegacyApp();
  const PublicApp = ensurePublicApp();
  const clear = () => {
    document.querySelectorAll('.system-notify-stack, .system-notify-item').forEach((element) => element.remove());
  };
  const silent = (_message?: unknown, _options?: unknown): null => null;
  const api = {
    show: (_options?: unknown): null => null,
    success: silent,
    warn: silent,
    error: silent,
    info: silent,
    close: (_key?: unknown, _immediate?: boolean): void => {},
    clear,
  };
  clear();
  App.notify = api;
  PublicApp.notify = api;
}());
