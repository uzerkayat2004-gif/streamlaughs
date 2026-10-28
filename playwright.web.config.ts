import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['web.spec.ts', 'download.spec.ts'],
  timeout: 180000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.WEB_TEST_URL ?? 'http://127.0.0.1:3000',
    headless: false,
    trace: 'off',
  },
  webServer: {
    command: 'node tests/web-server.mjs',
    url: 'http://127.0.0.1:4192/health',
    reuseExistingServer: !!process.env.REUSE_WEB_PREVIEW,
    timeout: 180000,
  },
});
