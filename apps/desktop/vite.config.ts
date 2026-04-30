import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const workspacePackageAliases = {
  '@rough-cut/effect-registry': resolve(__dirname, '../../packages/effect-registry/src/index.ts'),
  '@rough-cut/frame-resolver': resolve(__dirname, '../../packages/frame-resolver/src/index.ts'),
  '@rough-cut/project-model': resolve(__dirname, '../../packages/project-model/src/index.ts'),
  '@rough-cut/timeline-engine': resolve(__dirname, '../../packages/timeline-engine/src/index.ts'),
};

export default defineConfig({
  base: './',
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: workspacePackageAliases,
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
  server: {
    port: 7545,
    host: '127.0.0.1',
    strictPort: true,
  },
});
