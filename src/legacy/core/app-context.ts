// @ts-nocheck

export const ensureLegacyApp = () => {
  window.GJHApp = window.GJHApp || {};
  return window.GJHApp;
};

export const getLegacyApp = () => window.GJHApp;

export const ensurePublicApp = () => {
  window.App = window.App || {};
  return window.App;
};

export const getPublicApp = () => window.App;
