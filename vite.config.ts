import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['motion/mini'],
  },
  server: {
    host: '127.0.0.1',
    port: 5001,
  },
});
