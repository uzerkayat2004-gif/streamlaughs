import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: 'web.spec.ts',
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: 'list',
  // Audio/debug responses may contain ephemeral text; never archive them in browser traces.
  use: { trace: 'off' },
  webServer: {
    command: 'node tests/fake-server.mjs',
    url: 'http://127.0.0.1:4179/health',
    reuseExistingServer: false,
  },
});
