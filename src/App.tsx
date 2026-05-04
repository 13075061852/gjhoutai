import { useEffect, useMemo } from 'react';
import { LegacyShell } from './pages/LegacyShell';
import { applyInitialThemeState } from './utils/themeBootstrap';

function App() {
  useMemo(() => {
    applyInitialThemeState();
    return null;
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    void import('./legacy/bootstrap').then(({ bootLegacyApp, teardownLegacyApp }) => {
      if (disposed) return;
      cleanup = bootLegacyApp();
      if (disposed) {
        cleanup?.();
        teardownLegacyApp();
      }
    });

    return () => {
      disposed = true;
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => {
        teardownLegacyApp();
      });
    };
  }, []);

  return <LegacyShell />;
}

export default App;
