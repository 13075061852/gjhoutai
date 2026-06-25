import { ensureLegacyApp } from '../core/app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();
  const missing = ['refs', 'constants', 'state', 'utils'].filter((key) => !App[key]);
  if (missing.length) {
    throw new Error(`GJHApp core is incomplete: ${missing.join(', ')}`);
  }
})();
