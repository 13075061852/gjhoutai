import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['motion', 'motion/mini'],
          icons: ['@icon-park/svg'],
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
  },
});
