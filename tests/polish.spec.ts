import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import {
  createRecap,
  initialSnapshot,
  MySessionSchema,
  PRODUCT,
} from '../packages/shared/src/index';
import { slug } from '../tools/release/config.mjs';

const build = path.resolve('apps/extension/.output/chrome-mv3'),
  shots = path.resolve('docs/screenshots/part6');
const identity = JSON.parse(
  readFileSync(path.resolve('apps/extension/extension-identity.json'), 'utf8'),
);
const flags = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
];

test('clean ZIP install: fixed ID, first run, mic choice, zero dev controls, keyboard and touch recap toast', async () => {
  await mkdir(shots, { recursive: true });
  await mkdir('.test-runtime', { recursive: true });
  const copy = await mkdtemp(path.resolve('.test-runtime/unzipped-release-'));
  const product = JSON.parse(readFileSync('product.config.json', 'utf8'));
  const archive = path.resolve(
    `releases/offline-preview/${slug(product.name)}-chrome-v${product.version}.zip`,
  );
  expect(existsSync(archive), 'Run pnpm release:preview first').toBe(true);
  execFileSync(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['-m', 'zipfile', '-e', archive, copy],
    { windowsHide: true },
  );
  expect(existsSync(path.join(copy, 'manifest.json'))).toBe(true);
  expect(existsSync(path.join(copy, 'debug.html'))).toBe(false);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    hasTouch: true,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${copy}`,
      `--load-extension=${copy}`,
      ...flags,
    ],
  });
  try {
    await context.route('https://www.twitch.tv/**', async (route) => {
      const response = await context.request.get(
        'http://127.0.0.1:4179/nightowl_tv',
      );
      await route.fulfill({ response });
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    expect(new URL(worker.url()).host).toBe(identity.id);
    const began = Date.now(),
      welcome =
        context.pages().find((p) => p.url().includes('/welcome.html')) ??
        (await context.newPage());
    await welcome.goto(`chrome-extension://${identity.id}/welcome.html`);
    // biome-ignore lint/performance/useDomNodeTextContent: check visible copy, excluding scripts with compatibility IDs.
    expect(await welcome.locator('body').innerText()).not.toMatch(/laughline/i);
    await expect(welcome).toHaveTitle(`welcome to ${PRODUCT.name}`);
    await welcome.getByRole('button', { name: 'let’s go' }).click();
    await welcome
      .getByRole('button', { name: 'allow mic', exact: true })
      .click();
    await expect(
      welcome.getByRole('button', { name: 'share with the crowd' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await welcome.getByRole('button', { name: 'share with the crowd' }).click();
    await expect(
      welcome.getByRole('button', { name: 'share with the crowd' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const opened = context.waitForEvent('page');
    await welcome
      .getByRole('button', { name: 'open twitch', exact: true })
      .click();
    const stream = await opened;
    await stream.goto('https://www.twitch.tv/nightowl_tv');
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, idle` }),
    ).toBeVisible();
    const popup = await context.newPage();
    await stream.bringToFront();
    await popup.goto(`chrome-extension://${identity.id}/popup.html`);
    await expect(
      popup.getByRole('button', { name: 'start', exact: true }),
    ).toBeEnabled();
    expect(
      Date.now() - began,
      'fake-media first-run steps through ready-to-start should take under a minute',
    ).toBeLessThan(60000);
    // The real permission flow above uses fake devices. Actual tabCapture remains manual.
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    // biome-ignore lint/performance/useDomNodeTextContent: check visible copy, excluding scripts with compatibility IDs.
    expect(await popup.locator('body').innerText()).not.toMatch(/laughline/i);
    await popup.getByRole('button', { name: 'listen for my laughs' }).click();
    await popup.getByRole('button', { name: 'close', exact: true }).click();
    await popup.getByRole('button', { name: 'start', exact: true }).click();
    await expect(
      popup.getByText('offline', { exact: true }).first(),
    ).toBeVisible();
    await expect(popup.locator('.switcher, .sim, [data-screen]')).toHaveCount(
      0,
    );
    await expect(
      popup.getByRole('button', { name: /debug|simulate|test microphone/i }),
    ).toHaveCount(0);
    await popup
      .locator('.popup')
      .screenshot({ path: path.join(shots, 'popup-offline.png') });
    const dot = stream.getByRole('button', {
      name: `${PRODUCT.name}, recording`,
    });
    await dot.focus();
    await stream.keyboard.press('Enter');
    const pause = stream.getByRole('button', { name: 'pause', exact: true });
    await expect(pause).toBeFocused();
    await stream.keyboard.press('Escape');
    await expect(dot).toBeFocused();
    await popup.getByRole('button', { name: 'stop', exact: true }).click();
    const recapLink = stream.getByRole('button', {
      name: 'see recap',
      exact: true,
    });
    await recapLink.focus();
    await stream.waitForTimeout(6500); // Must outlive the previous six-second mouse-only opportunity.
    await expect(recapLink).toBeFocused();
    const recapOpened = context.waitForEvent('page');
    await stream.keyboard.press('Enter');
    await expect(
      (await recapOpened).getByText('you laughed', { exact: true }),
    ).toBeVisible();
    const touched = context.waitForEvent('page');
    await recapLink.tap();
    await expect(
      (await touched).getByText('you laughed', { exact: true }),
    ).toBeVisible();
    await stream
      .getByRole('button', { name: 'dismiss recap notification' })
      .tap();
    await expect(recapLink).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('saved stream bubbles select their own stored data; calm and audio states fit with reduced motion', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1000, height: 900 },
    args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`],
  });
  try {
    const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker')),
      id = new URL(worker.url()).host;
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${id}/popup.html`);
    await setup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GET_STATE' }),
    );
    const base = {
      tabId: 1,
      startedAt: Date.now() - 90000,
      endedAt: Date.now(),
      laughEvents: [],
      peakCrowd: 0,
      crowdViewers: 0,
      topWords: [],
      source: 'fake',
    };
    const recaps = [
      createRecap(
        MySessionSchema.parse({
          ...base,
          id: 'saved-one',
          channel: 'first_stream',
          laughCount: 17,
        }),
        Date.now(),
      ),
      createRecap(
        MySessionSchema.parse({
          ...base,
          id: 'saved-two',
          channel: 'second_stream',
          laughCount: 4,
        }),
        Date.now() - 1000,
      ),
    ];
    const recap = await context.newPage();
    await recap.emulateMedia({ reducedMotion: 'reduce' });
    await recap.goto(`chrome-extension://${id}/recap.html`);
    await expect(
      recap.getByText('your next laugh starts a story.'),
    ).toBeVisible();
    await worker.evaluate(
      async (values) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('laughline');
          open.onblocked = () => reject(new Error('fixture database blocked'));
          open.onsuccess = () => {
            try {
              const database = open.result,
                tx = database.transaction('recaps', 'readwrite');
              for (const value of values) tx.objectStore('recaps').put(value);
              tx.oncomplete = () => {
                database.close();
                resolve();
              };
              tx.onerror = () => reject(new Error('fixture write failed'));
            } catch (error) {
              reject(error);
            }
          };
          open.onerror = () =>
            reject(new Error('fixture database unavailable'));
        }),
      recaps,
    );
    await recap.reload();
    // biome-ignore lint/performance/useDomNodeTextContent: check visible copy, excluding scripts with compatibility IDs.
    expect(await recap.locator('body').innerText()).not.toMatch(/laughline/i);
    await expect(
      recap.locator('[data-session-id="saved-one"] small'),
    ).toHaveText('17');
    await expect(
      recap.locator('[data-session-id="saved-two"] small'),
    ).toHaveText('4');
    await recap.locator('[data-session-id="saved-two"]').focus();
    await recap.keyboard.press('Enter');
    await expect(recap.locator('.x-giant')).toHaveText('4');
    await expect(
      recap.getByText('times with second_stream', { exact: true }),
    ).toBeVisible();
    await expect(
      recap.locator('[data-session-id="saved-two"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(recap.locator('.x-st')).toHaveCSS('animation-name', 'none');
    await recap.locator('[data-session-id="saved-one"]').click();
    await expect(recap.locator('.x-giant')).toHaveText('17');
    await recap.screenshot({
      path: path.join(shots, 'recap-saved-streams.png'),
    });
    for (let story = 0; story < 4; story++)
      await recap.getByRole('button', { name: 'next', exact: true }).click();
    await expect(recap.locator('.x-wm')).toHaveText(PRODUCT.wordmark);
    // biome-ignore lint/performance/useDomNodeTextContent: check visible share-card copy only.
    expect(await recap.locator('body').innerText()).not.toMatch(/laughline/i);
    await recap.screenshot({ path: path.join(shots, 'recap-share.png') });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const snapshot = initialSnapshot();
    snapshot.session = MySessionSchema.parse({
      ...base,
      id: 'ui-states',
      channel: 'a_long_channel_name_12345',
      laughCount: 0,
      source: 'local',
    });
    snapshot.status = 'recording';
    snapshot.capture.phase = 'active';
    snapshot.crowd = {
      channel: snapshot.session!.channel,
      source: 'live',
      state: 'few',
      laughingNow: 0,
      laughlineViewers: 0,
      topWords: [],
      updatedAt: Date.now(),
    };
    for (const state of ['warming', 'lowPower', 'micLost'] as const) {
      snapshot.revision += 1000;
      snapshot.inference.phase = state === 'warming' ? 'warming' : 'ready';
      snapshot.inference.lowPower = state === 'lowPower';
      snapshot.capture.micLost = state === 'micLost';
      await worker.evaluate(async (state) => {
        await chrome.storage.local.set({ 'laughline:state': state });
      }, snapshot);
      const notice = popup.locator('.audio-notice');
      await expect(notice).toBeVisible();
      await expect(
        popup.getByText('a few here', { exact: true }),
      ).toBeVisible();
      expect(
        await popup.locator('.screen').evaluate((el) =>
          [...el.querySelectorAll('button, .audio-notice')].every((child) => {
            const r = child.getBoundingClientRect();
            return r.bottom <= 600 && r.right <= 380;
          }),
        ),
      ).toBe(true);
      await popup
        .locator('.popup')
        .screenshot({ path: path.join(shots, `popup-${state}.png`) });
    }
  } finally {
    await context.close();
  }
});
