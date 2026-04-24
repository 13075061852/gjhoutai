(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) {
    throw new Error('GJHApp has not been initialized.');
  }

  const boot = () => {
    App.navigation?.init();
    App.propertyAnalysis?.init();
    App.spectrumAnalysis?.init();
    App.config?.init();
    App.chat?.init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
