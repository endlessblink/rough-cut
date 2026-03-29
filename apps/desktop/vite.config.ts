import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        panel: resolve(__dirname, 'src/renderer/panel.html'),
      },
    },
  },
  server: {
    port: 7544,
    host: '127.0.0.1',
    strictPort: true,
  },
});
