import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    rollupOptions: {
      input: {
        main: resolve('src/renderer/index.html'),
        toolbar: resolve('src/renderer/toolbar.html'),
      },
    },
  },
  server: {
    port: 7544,
    host: '127.0.0.1',
    strictPort: true,
  },
});
