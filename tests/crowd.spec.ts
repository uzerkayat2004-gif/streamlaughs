import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const API = process.env.CROWD_TEST_API ?? 'http://127.0.0.1:8787';
const FIXTURE = process.env.FAKE_TWITCH_URL ?? 'http://127.0.0.1:4179';
const extensionPath = path.resolve(
  'apps/extension/.output/chrome-mv3-crowd-test',
);
function launch(args: string[], cwd = process.cwd()) {
  const child = spawn(process.execPath, args, {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  // Bounded diagnostic output, never session tokens or contribution payloads.
  let output = '';
  child.stdout?.on('data', (data) => {
    output = (output + String(data)).slice(-3000);
  });
  child.stderr?.on('data', (data) => {
    output = (output + String(data)).slice(-3000);
  });
  return { child, output: () => output };
}
function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {}
  } else child.kill('SIGTERM');
}
test('real Worker + simulator: few → live, approved words, watch-only zero sends and immediate opt-out', async () => {
  const children: ChildProcess[] = [];
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const origin = `chrome-extension://${new URL(worker.url()).host}`;
    await worker.evaluate(() => {
      const scope = globalThis as typeof globalThis & { crowdFrames: number };
      scope.crowdFrames = 0;
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        scope.crowdFrames++;
        return original.call(this, data);
      };
    });
    const wrangler = launch(
      [
        path.resolve('tools/wrangler-local.mjs'),
        'dev',
        '--env',
        'dev',
        '--ip',
        '127.0.0.1',
        '--port',
        new URL(API).port,
        '--log-level',
        'error',
        '--var',
        `EXTENSION_ORIGINS:${origin}`,
        '--var',
        'HMAC_KEY:local-development-only-e2e-key-0000000000000000000000',
        '--var',
        'WORKER_OWNER_KEY:local-development-only-owner-key-00000000000000000000',
        '--persist-to',
        path.resolve('.test-runtime/crowd'),
      ],
      path.resolve('workers/api'),
    );
    children.push(wrangler.child);
    await expect
      .poll(
        async () => {
          if (wrangler.child.exitCode !== null)
            throw new Error(wrangler.output());
          try {
            return (await (await fetch(`${API}/health`)).json()).crowdEnabled;
          } catch {
            return false;
          }
        },
        { timeout: 30000 },
      )
      .toBe(true);
    await context.route('https://www.twitch.tv/**', async (route) => {
      const response = await context.request.get(
        `${FIXTURE}${new URL(route.request().url()).pathname}`,
      );
      await route.fulfill({ response });
    });
    const stream = await context.newPage();
    await stream.goto('https://www.twitch.tv/crowd_test');
    const popup = await context.newPage();
    await stream.bringToFront();
    await popup.goto(`${origin}/popup.html`);
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    await popup.getByRole('button', { name: 'listen for my laughs' }).click();
    await expect(
      popup.getByRole('button', { name: 'share with the crowd' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await popup.getByRole('button', { name: 'close', exact: true }).click();
    await popup.getByRole('button', { name: 'start', exact: true }).click();
    await expect(popup.getByText('a few here', { exact: true })).toBeVisible();
    const frames = () =>
      worker.evaluate(
        () =>
          (globalThis as typeof globalThis & { crowdFrames: number })
            .crowdFrames,
      );
    await popup.waitForTimeout(4100);
    expect(await frames()).toBe(0);
    const sim = (viewers: number) => {
      const process = launch([
        path.resolve('tools/crowd-sim/cli.mjs'),
        '--api',
        API,
        '--origin',
        origin,
        '--channel',
        'crowd_test',
        '--viewers',
        String(viewers),
        '--script',
        'funny',
        '--duration',
        '75',
      ]);
      children.push(process.child);
      return process;
    };
    const first = sim(2);
    await expect
      .poll(first.output, { timeout: 15000 })
      .toContain('TEST TRAFFIC: 2');
    await popup.waitForTimeout(2200);
    await expect(popup.getByText('a few here', { exact: true })).toBeVisible();
    expect(
      await popup
        .getByRole('img', { name: /people laughing right now/ })
        .count(),
    ).toBe(0);
    const third = sim(1);
    await expect
      .poll(third.output, { timeout: 15000 })
      .toContain('TEST TRAFFIC: 1');
    await expect(
      popup.getByText('live · test traffic', { exact: true }),
    ).toBeVisible();
    await expect(
      popup.getByRole('img', { name: /[1-3] people laughing right now/ }),
    ).toBeVisible();
    await expect(
      popup
        .locator('.words .word')
        .filter({ hasText: /bro|no way/ })
        .first(),
    ).toBeVisible();
    expect(await frames()).toBe(0);
    expect(
      await worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    ).toBe(0);
    await popup.locator('.popup').screenshot({
      path: path.resolve('docs/screenshots/live-crowd-part4.png'),
    });
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    const sharing = popup.getByRole('button', { name: 'share with the crowd' });
    await sharing.click();
    await expect.poll(frames).toBeGreaterThan(0);
    await sharing.click();
    await expect(sharing).toHaveAttribute('aria-pressed', 'false');
    const stoppedAt = await frames();
    await popup.waitForTimeout(4500);
    expect(await frames()).toBe(stoppedAt);
    await popup.getByRole('button', { name: 'close', exact: true }).click();
    await popup.getByRole('button', { name: 'stop', exact: true }).click();
    const recapOpened = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'see recap', exact: true }).click();
    const recap = await recapOpened;
    await recap.waitForLoadState();
    await recap.emulateMedia({ reducedMotion: 'reduce' });
    await recap.getByRole('button', { name: 'next', exact: true }).click();
    await expect(
      recap.getByText('you vs crowd', { exact: true }),
    ).toBeVisible();
    await expect(
      recap.getByText(/live crowd · test traffic · peak laughing together/),
    ).toBeVisible();
  } finally {
    await context.close();
    for (const child of children.reverse()) stop(child);
  }
});
