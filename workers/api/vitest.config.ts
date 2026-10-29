import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          ENVIRONMENT: 'test',
          CROWD_ENABLED: 'true',
          ALLOW_TEST_TRAFFIC: 'true',
          EXTENSION_ORIGINS:
            'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,chrome-extension://fkocldgggcmhihelohiicoakcfomhepg,chrome-extension://fkdfjgnhifofdjpbenlkhpfhmmhglmkb',
          HMAC_KEY: 'local-development-only-signing-key-00000000000000000000',
          WORKER_OWNER_KEY:
            'local-development-only-owner-key-00000000000000000000',
        },
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 20000,
  },
});
