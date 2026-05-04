// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});
  const missing = ['refs', 'constants', 'state', 'utils'].filter((key) => !App[key]);
  if (missing.length) {
    throw new Error(`GJHApp core is incomplete: ${missing.join(', ')}`);
  }
})();