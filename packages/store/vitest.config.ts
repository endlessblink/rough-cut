import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const zustandDir = resolve(__dirname, 'node_modules/zustand');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // Force vitest to process zundo through vite so aliases apply
        inline: ['zundo'],
      },
    },
  },
  resolve: {
    alias: [
      // Must come before the bare 'zustand' alias — zustand/vanilla stays as-is
      {
        find: 'zustand/vanilla',
        replacement: resolve(zustandDir, 'vanilla.js'),
      },
      // Redirect bare 'zustand' imports (from zundo) to vanilla-only build
      {
        find: /^zustand$/,
        replacement: resolve(zustandDir, 'vanilla.js'),
      },
    ],
  },
});
