export const ensureLegacyApp = (): LegacyAppNamespace => {
  window.GJHApp = window.GJHApp || {};
  return window.GJHApp;
};

export const getLegacyApp = (): LegacyAppNamespace => window.GJHApp;

export const ensurePublicApp = (): LegacyAppNamespace => {
  window.App = window.App || {};
  return window.App;
};

export const getPublicApp = (): LegacyAppNamespace => window.App;
