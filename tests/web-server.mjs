import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const root = process.cwd(),
  children = [];
let ready = false;
const readiness = createServer((_request, response) => {
  response.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' });
  response.end(ready ? 'ready' : 'compiling local test routes');
}).listen(4192, '127.0.0.1');
function start(args, cwd = root, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      WRANGLER_SEND_METRICS: 'false',
      ...env,
    },
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code && !stopping) {
      console.error('Local website test service stopped.');
      stop();
      process.exitCode = 1;
    }
  });
}
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  readiness.close();
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {}
    } else child.kill('SIGTERM');
  }
}
process.on('SIGINT', () => {
  stop();
  process.exit();
});
process.on('SIGTERM', () => {
  stop();
  process.exit();
});
process.on('exit', stop);
start([path.resolve('tests/mock-twitch.mjs')]);
start(
  [
    path.resolve('tools/wrangler-local.mjs'),
    'dev',
    '--env',
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    '8787',
    '--log-level',
    'error',
    '--var',
    'HMAC_KEY:local-development-only-web-test-key-000000000000000000',
    '--var',
    'WORKER_OWNER_KEY:local-development-only-owner-key-00000000000000000000',
    '--persist-to',
    path.resolve('.test-runtime/web-worker'),
  ],
  path.resolve('workers/api'),
);
start(
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--webpack',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3000',
  ],
  path.resolve('apps/web'),
  {
    SITE_URL: 'http://127.0.0.1:3000',
    AUTH_TEST_MODE: 'true',
    TWITCH_TEST_ORIGIN: 'http://127.0.0.1:4191',
    TWITCH_CLIENT_ID: 'local-twitch-client',
    TWITCH_CLIENT_SECRET: 'local-twitch-secret',
    SESSION_SECRET: 'local-session-test-only-secret-00000000000000000000000',
    WORKER_API_URL: 'http://127.0.0.1:8787',
    WORKER_OWNER_KEY: 'local-development-only-owner-key-00000000000000000000',
    RELEASE_REPO_OWNER: 'uzerkayat2004-gif',
    RELEASE_REPO_NAME: 'test-only-release',
  },
);
// Compile development routes before browser actions. Cold route compilation can
// trigger Fast Refresh reloads; production already compiles these in next build.
async function warm() {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    try {
      const services = await Promise.all(
        [
          'http://127.0.0.1:3000/version.json',
          'http://127.0.0.1:8787/health',
          'http://127.0.0.1:4191/health',
        ].map((url) => fetch(url, { signal: AbortSignal.timeout(3000) })),
      );
      if (services.every((response) => response.ok)) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (const route of [
    '/',
    '/install',
    '/privacy',
    '/icon.svg',
    '/opengraph-image',
    '/streamers',
    '/demo?tab=past',
    '/auth/login',
    '/auth/callback',
    '/auth/logout',
    '/dashboard/nightowl_tv',
    '/api/dashboard/nightowl_tv',
  ]) {
    const response = await fetch(`http://127.0.0.1:3000${route}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });
    await response.arrayBuffer();
    if (response.status >= 500)
      throw new Error(
        `Local test route failed to compile: ${route.split('?')[0]}`,
      );
  }
  ready = true;
}
warm().catch(() => {
  console.error('Local website test warmup failed.');
  stop();
  process.exitCode = 1;
});
