import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@rough-cut/project-model': path.resolve(
        __dirname,
        '../project-model/src/index.ts',
      ),
      '@rough-cut/frame-resolver': path.resolve(
        __dirname,
        '../frame-resolver/src/index.ts',
      ),
      '@rough-cut/effect-registry': path.resolve(
        __dirname,
        '../effect-registry/src/index.ts',
      ),
      '@rough-cut/timeline-engine': path.resolve(
        __dirname,
        '../timeline-engine/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
