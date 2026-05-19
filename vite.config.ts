import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const moduleId = id.replace(/\\/g, '/');
          if (moduleId.includes('/node_modules/react/') || moduleId.includes('/node_modules/react-dom/')) return 'react';
          if (moduleId.includes('/node_modules/motion/')) return 'motion';
          if (moduleId.includes('/node_modules/@icon-park/svg/')) return 'icons';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ['motion/mini'],
  },
  server: {
    host: '0.0.0.0',
    port: 5001,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
