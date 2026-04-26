import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/electron',
  testMatch: '**/*.spec.ts',
  // 60s gives cold Electron + Vite startup enough headroom on first test in a
  // run; per-test test.setTimeout calls inside specs apply on top of fixture
  // setup (which the per-test option in Playwright 1.58 does not extend).
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
