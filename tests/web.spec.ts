import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const identity = JSON.parse(
  readFileSync(
    new URL('../apps/extension/extension-identity.json', import.meta.url),
    'utf8',
  ),
) as { id: string };
const SITE = process.env.WEB_TEST_URL ?? 'http://127.0.0.1:3000';
const product = JSON.parse(
  readFileSync(new URL('../product.config.json', import.meta.url), 'utf8'),
) as { version: string; name: string; pitch: string };
const shots = path.resolve('docs/screenshots/part5');
test('Twitch redirect mismatch shows setup help instead of silently landing on home', async ({
  page,
}) => {
  await page.goto(
    `${SITE}/?error=redirect_mismatch&state=regression-fixture&error_description=untrusted-provider-text`,
  );
  await expect(page).toHaveURL(
    `${SITE}/streamers?login=retry&reason=redirect_mismatch`,
  );
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('Twitch rejected this app’s callback URL');
  await expect(alert).toContainText(`${SITE}/auth/callback`);
  await expect(alert).toContainText('OAuth Redirect URLs');
  await expect(
    page.getByRole('link', { name: 'try Twitch again' }),
  ).toHaveAttribute('href', '/auth/login');
  await expect(page.locator('body')).not.toContainText(
    'untrusted-provider-text',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test.beforeEach(async ({ page }) => {
  if (!process.env.WEB_TEST_DIAGNOSTICS) return;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame())
      console.log('NAV', new URL(frame.url()).pathname);
  });
  page.on('requestfailed', (request) => {
    if (request.isNavigationRequest())
      console.log(
        'FAILED',
        new URL(request.url()).pathname,
        request.failure()?.errorText,
      );
  });
  page.on('response', (response) => {
    if (response.request().isNavigationRequest())
      console.log(
        'DOCUMENT',
        new URL(response.url()).pathname,
        response.status(),
      );
  });
  page.on('console', (message) => {
    if (message.text().startsWith('TEST_CLICK')) console.log(message.text());
  });
  await page.addInitScript(() => {
    addEventListener(
      'click',
      (event) => {
        const element = (event.target as Element).closest('a,button');
        console.log(
          'TEST_CLICK',
          element?.textContent?.trim(),
          event.isTrusted,
          event.clientX,
          event.clientY,
        );
      },
      true,
    );
  });
});
test('public pages, responsive Night Crowd, privacy, configurable links and recorded demo', async ({
  page,
  context,
}) => {
  await mkdir(shots, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(SITE);
  await expect(
    page.getByRole('heading', {
      name: product.pitch,
    }),
  ).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(product.name));
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    product.name,
  );
  const icon = await page.request.get(`${SITE}/icon.svg`);
  expect(await icon.text()).toContain(`<title>${product.name}</title>`);
  const og = await page.request.get(`${SITE}/opengraph-image`);
  expect(og.ok()).toBe(true);
  expect(og.headers()['content-type']).toContain('image/png');
  await page.screenshot({
    path: path.join(shots, 'home-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'get the extension ↗', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'make room for the crowd.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Download ${product.name}`, exact: true }),
  ).toHaveAttribute('href', '/download');
  await page.getByRole('tab', { name: 'Brave', exact: true }).click();
  await expect(
    page.getByText('brave://extensions', { exact: false }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Edge', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /edge:\/\/extensions/ }),
  ).toBeVisible();
  await page.goto(`${SITE}/privacy`);
  await expect(
    page.getByRole('heading', { name: 'your audio stays yours.' }),
  ).toBeVisible();
  await expect(page.getByText(/No trackers, advertising pixels/)).toBeVisible();
  await page.goto(`${SITE}/streamers`);
  await expect(page.getByText(/nothing to install/)).toBeVisible();
  await page.goto(`${SITE}/demo?tab=past`);
  await expect(
    page.getByText('demo · test data', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.moment').first()).toBeVisible();
  await expect(page.locator('.no-vod').first()).toContainText(
    'no available VOD',
  );
  await page.screenshot({
    path: path.join(shots, 'demo-past.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SITE);
  await page.screenshot({
    path: path.join(shots, 'home-mobile.png'),
    fullPage: true,
  });
  for (const route of [
    '/',
    '/install',
    '/privacy',
    '/streamers',
    '/demo?tab=past',
  ]) {
    await page.goto(`${SITE}${route}`);
    // biome-ignore lint/performance/useDomNodeTextContent: check visible copy, excluding scripts with compatibility IDs.
    expect(await page.locator('body').innerText()).not.toMatch(/laughline/i);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(await context.cookies()).toEqual([]);
  expect(errors).toEqual([]);
});
test('OAuth state + owner isolation + real Wrangler and crowd-sim live/history/VOD stories', async ({
  page,
  context,
  request,
  browser,
}) => {
  await mkdir(shots, { recursive: true });
  await request.post('http://127.0.0.1:4191/fixture/user', {
    data: { login: 'nightowl_tv' },
  });
  await expect
    .poll(async () => {
      try {
        return (await (await fetch('http://127.0.0.1:8787/health')).json())
          .crowdEnabled;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const before = await (
    await request.get('http://127.0.0.1:4191/fixture/counts')
  ).json();
  await page.goto(`${SITE}/auth/callback?code=forged&state=${'a'.repeat(64)}`);
  await expect(page).toHaveURL(/login=retry/);
  expect(
    (await (await request.get('http://127.0.0.1:4191/fixture/counts')).json())
      .exchange,
  ).toBe(before.exchange);
  const simulationStarted = Date.now();
  const sim = spawn(
    process.execPath,
    [
      path.resolve('tools/crowd-sim/cli.mjs'),
      '--channel',
      'nightowl_tv',
      '--viewers',
      '4',
      '--duration',
      '130',
      '--origin',
      `chrome-extension://${identity.id}`,
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  const stranger = await browser.newContext();
  try {
    await page.addInitScript(() => {
      const scope = globalThis as typeof globalThis & { crowdFrames: number };
      scope.crowdFrames = 0;
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (this.url.includes('/v1/channels/')) scope.crowdFrames++;
        return original.call(this, data);
      };
    });
    await page.goto(`${SITE}/streamers`);
    await page.getByRole('link', { name: 'log in with Twitch' }).click();
    await expect(page).toHaveURL(`${SITE}/dashboard/nightowl_tv`);
    await expect(
      page.getByRole('heading', { name: 'hey, nightowl_tv.' }),
    ).toBeVisible();
    await expect(page.locator('.scene-label')).toHaveText(
      'live · test traffic',
    );
    await expect(page.locator('.live-words')).toContainText(/bro|no way/);
    await page.waitForTimeout(4200);
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { crowdFrames: number })
            .crowdFrames,
      ),
    ).toBe(0);
    const cookies = await context.cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.httpOnly).toBe(true);
    expect(cookies[0]?.sameSite).toBe('Lax');
    await page.screenshot({
      path: path.join(shots, 'dashboard-live.png'),
      fullPage: true,
    });
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `${SITE}/api/dashboard/nightowl_tv`,
          );
          if (!response.ok()) return false;
          const result = await response.json();
          return result.streams.some(
            (s: { moments: unknown[]; end: number }) =>
              s.moments.length > 0 && s.end > simulationStarted,
          );
        },
        { timeout: 90000, intervals: [1000, 2000] },
      )
      .toBe(true);
    await page.goto(`${SITE}/dashboard/nightowl_tv?tab=past`);
    // biome-ignore lint/performance/useDomNodeTextContent: check visible copy, excluding scripts with compatibility IDs.
    expect(await page.locator('body').innerText()).not.toMatch(/laughline/i);
    await expect(page.locator('.moment').first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'watch the moment ↗' }).first(),
    ).toHaveAttribute(
      'href',
      /^https:\/\/www\.twitch\.tv\/videos\/9001\?t=\d+h\d+m\d+s$/,
    );
    await expect(page.locator('.test-tag').first()).toHaveText('test');
    await page.screenshot({
      path: path.join(shots, 'dashboard-past.png'),
      fullPage: true,
    });
    const result = await page.request.get(`${SITE}/api/dashboard/nightowl_tv`);
    expect(result.headers()['cache-control']).toContain('no-store');
    expect(JSON.stringify(await result.json())).not.toMatch(
      /accessToken|WORKER_OWNER_KEY|Bearer|user_id/,
    );
    await request.post('http://127.0.0.1:4191/fixture/user', {
      data: { login: 'other_streamer' },
    });
    const other = await stranger.newPage();
    await other.goto(`${SITE}/auth/login`);
    await expect(other).toHaveURL(`${SITE}/dashboard/other_streamer`);
    expect(
      (
        await stranger.request.get(`${SITE}/api/dashboard/nightowl_tv`)
      ).status(),
    ).toBe(403);
    await other.goto(`${SITE}/dashboard/nightowl_tv`);
    await expect(
      other.getByRole('heading', { name: /isn’t yours to open/ }),
    ).toBeVisible();
    await expect(other.locator('.moment')).toHaveCount(0);
    expect(
      (
        await page.request.post(`${SITE}/auth/logout`, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status(),
    ).toBe(403);
    await page.goto(`${SITE}/dashboard/nightowl_tv`);
    await page.getByRole('button', { name: 'log out ↗' }).click();
    await expect(page).toHaveURL(`${SITE}/streamers`);
    expect(
      (await context.cookies()).filter((c) => c.name.includes('auth')),
    ).toHaveLength(0);
  } finally {
    await stranger.close();
    if (sim.pid && sim.exitCode === null) {
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/PID', String(sim.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } catch {}
      } else sim.kill('SIGTERM');
    }
  }
});
test('fixed ID survives a copied folder; the extension checks public version metadata and shows its update dot', async () => {
  await mkdir(path.resolve('.test-runtime'), { recursive: true });
  const copy = await mkdtemp(path.resolve('.test-runtime/fixed-id-'));
  await cp(path.resolve('apps/extension/.output/chrome-mv3-site-test'), copy, {
    recursive: true,
  });
  // Model an older installed version using only this temporary copy's manifest.
  // Current code must compare the browser's installed version with the real endpoint.
  const manifestPath = path.join(copy, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = '0.0.0.1';
  await writeFile(manifestPath, JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    expect(new URL(worker.url()).host).toBe(identity.id);
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await chrome.storage.local.get('laughline:update'))[
              'laughline:update'
            ]?.latest,
        ),
      )
      .toBe(product.version);
    expect(
      await worker.evaluate(() => chrome.runtime.getManifest().version),
    ).toBe('0.0.0.1');
    expect(
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get('laughline:update'))[
            'laughline:update'
          ]?.available,
      ),
    ).toBe(true);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${identity.id}/popup.html`);
    await expect(
      popup.getByRole('link', { name: 'new version available' }),
    ).toHaveAttribute('href', `${SITE}/install`);
  } finally {
    await context.close();
  }
});
