export const ensureLegacyApp = (): any => {
  window.GJHApp = window.GJHApp || {};
  return window.GJHApp;
};

export const getLegacyApp = (): any => window.GJHApp;

export const ensurePublicApp = (): any => {
  window.App = window.App || {};
  return window.App;
};

export const getPublicApp = (): any => window.App;
