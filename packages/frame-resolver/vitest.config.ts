import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@rough-cut/timeline-engine': path.resolve(
        __dirname,
        '../timeline-engine/src/index.ts',
      ),
      '@rough-cut/effect-registry': path.resolve(
        __dirname,
        '../effect-registry/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
