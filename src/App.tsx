import { useEffect } from 'react';
import { LegacyShell } from './pages/LegacyShell';
import { mountIconParkAdapter } from './utils/iconParkAdapter';

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    const cleanupIcons = mountIconParkAdapter();

    void import('./legacy/bootstrap').then(async ({ bootLegacyApp, teardownLegacyApp }) => {
      if (disposed) return;
      cleanup = await bootLegacyApp();
      if (disposed) {
        cleanup?.();
        teardownLegacyApp();
      }
    });

    return () => {
      disposed = true;
      cleanupIcons();
      cleanup?.();
      void import('./legacy/bootstrap').then(({ teardownLegacyApp }) => {
        teardownLegacyApp();
      });
    };
  }, []);

  return <LegacyShell />;
}

export default App;
