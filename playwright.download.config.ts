import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'download.spec.ts',
  timeout: 120000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.WEB_TEST_URL ?? 'http://127.0.0.1:3000',
    headless: true,
    acceptDownloads: true,
    trace: 'off',
  },
});
