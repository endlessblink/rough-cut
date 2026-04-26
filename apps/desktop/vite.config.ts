import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const workspacePackageAliases = {
  '@rough-cut/ai-bridge': resolve(__dirname, '../../packages/ai-bridge/src/index.ts'),
  '@rough-cut/effect-registry': resolve(__dirname, '../../packages/effect-registry/src/index.ts'),
  '@rough-cut/export-renderer': resolve(__dirname, '../../packages/export-renderer/src/index.ts'),
  '@rough-cut/frame-resolver': resolve(__dirname, '../../packages/frame-resolver/src/index.ts'),
  '@rough-cut/preview-renderer': resolve(__dirname, '../../packages/preview-renderer/src/index.ts'),
  '@rough-cut/project-model': resolve(__dirname, '../../packages/project-model/src/index.ts'),
  '@rough-cut/store': resolve(__dirname, '../../packages/store/src/index.ts'),
  '@rough-cut/timeline-engine': resolve(__dirname, '../../packages/timeline-engine/src/index.ts'),
};

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: workspacePackageAliases,
  },
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
