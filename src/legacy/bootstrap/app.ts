// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) {
    throw new Error('GJHApp has not been initialized.');
  }

  const boot = () => {
    App.navigation?.init();
    App.themeSettings?.init();
    App.propertyAnalysis?.init();
    App.spectrumAnalysis?.init();
    App.imageCutout?.init();
    App.config?.init();
    App.aiCallAnalysis?.init();
    App.projectSkills?.init();
    App.chat?.init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
