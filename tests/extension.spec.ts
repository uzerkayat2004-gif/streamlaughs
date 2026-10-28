import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, type Page, test } from '@playwright/test';
import { PRODUCT } from '../packages/shared/src/product';

const LOCAL_FIXTURE = process.env.FAKE_TWITCH_URL ?? 'http://127.0.0.1:4179';
const STREAM_URL = 'https://www.twitch.tv/nightowl_tv';
const extensionPath = path.resolve('apps/extension/.output/chrome-mv3-ui-test');
const shots = path.resolve('docs/screenshots');

test('built MV3 extension: dot, popup, sync, drag, privacy, persistence, recap and welcome', async () => {
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
  const errors: string[] = [];
  const observe = (page: Page) =>
    page.on('pageerror', (error) => errors.push(error.message));
  context.on('page', observe);
  await mkdir(shots, { recursive: true });
  try {
    await context.route('https://www.twitch.tv/**', async (route) => {
      const url = new URL(route.request().url());
      const local = await context.request.get(
        `${LOCAL_FIXTURE}${url.pathname}`,
      );
      await route.fulfill({ response: local });
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const stream = await context.newPage();
    observe(stream);
    await stream.goto(STREAM_URL);
    const dot = stream.getByRole('button', { name: `${PRODUCT.name}, idle` });
    await expect(dot).toBeVisible();
    await dot.click();
    await expect(
      stream.getByText(`click the ${PRODUCT.name} icon to start`),
    ).toBeVisible();
    const popup = await context.newPage();
    observe(popup);
    await stream.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(
      popup.getByRole('button', { name: 'start', exact: true }),
    ).toBeEnabled();
    // Keep the original UI/lifecycle smoke independent of non-automatable tabCapture grants.
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    await popup.getByRole('button', { name: 'listen for my laughs' }).click();
    await popup.getByRole('button', { name: 'close', exact: true }).click();
    await popup.getByRole('button', { name: 'start', exact: true }).click();
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
    await expect(
      popup.getByText('laughing right now', { exact: true }),
    ).toBeVisible();
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, recording` }),
    ).toBeVisible();
    await popup
      .locator('.popup')
      .screenshot({ path: path.join(shots, 'live.png') });
    await stream.bringToFront();
    const activeDot = stream.getByRole('button', {
      name: `${PRODUCT.name}, recording`,
    });
    await activeDot.click();
    const box = stream.getByRole('dialog', { name: 'crowd box' });
    await expect(box).toBeVisible();
    await expect(box.getByText('simulated crowd · 3+ people')).toBeVisible();
    await stream.screenshot({ path: path.join(shots, 'on-twitch.png') });

    await box.getByRole('button', { name: 'pause', exact: true }).click();
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, paused` }),
    ).toBeVisible();
    await expect(popup.getByRole('button', { name: 'resume' })).toBeVisible();
    const pausedLaughs = await popup.locator('.you').textContent();
    await expect(popup.locator('.you')).toHaveText(pausedLaughs ?? '');
    await box.getByRole('button', { name: 'resume', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'pause' })).toBeVisible();

    // Hover waits for the animated dot to be stable and receive pointer input.
    await activeDot.hover();
    await stream.mouse.down();
    await stream.mouse.move(28, 270, { steps: 12 });
    await expect(activeDot).toHaveClass(/is-drag/);
    await stream.mouse.up();
    await expect(box).toBeVisible(); // Drag must not act like a click.
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await chrome.storage.local.get('laughline:dock'))['laughline:dock']
              ?.edge,
        ),
      )
      .toBe('left');
    await stream.reload();
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, recording` }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await stream
              .getByRole('button', { name: `${PRODUCT.name}, recording` })
              .boundingBox()
          )?.x,
      )
      .toBeLessThan(50);

    // A genuine second tab changes focus without ending the watched session.
    const other = await context.newPage();
    await other.goto('about:blank');
    await expect(
      popup.getByRole('button', { name: 'stop', exact: true }),
    ).toBeVisible();
    await other.close();
    await stream.getByRole('button', { name: 'theatre mode' }).click();
    await stream
      .getByRole('button', { name: 'fullscreen', exact: true })
      .click();
    await expect
      .poll(() => stream.evaluate(() => !!document.fullscreenElement))
      .toBe(true);
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, recording` }),
    ).toBeVisible();
    await stream.evaluate(() => document.exitFullscreen());
    await stream
      .getByRole('button', { name: `${PRODUCT.name}, recording` })
      .click();
    await expect(
      stream.getByRole('dialog', { name: 'crowd box' }),
    ).toBeVisible();
    await expect
      .poll(() => popup.locator('.you').textContent(), { timeout: 12000 })
      .toBe('you · 0 laughs');

    // Wait for a calm burst and assert the real simulator's privacy floor.
    await expect(stream.getByLabel('crowd words')).toHaveText('—0 people', {
      timeout: 45000,
    });
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          return await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('laughline');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const get = db
                .transaction('sessions')
                .objectStore('sessions')
                .getAll();
              get.onsuccess = () => {
                resolve(get.result.length);
                db.close();
              };
            };
          });
        }),
      )
      .toBe(1);
    await popup.getByRole('button', { name: 'stop', exact: true }).click();
    await expect(
      popup.getByRole('dialog', { name: 'nice session' }),
    ).toBeVisible();
    const endedCount = (
      (await popup.locator('.sheet .big').textContent()) ?? ''
    ).split(' ')[0]!;
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, idle` }),
    ).toBeVisible();
    const recapPagePromise = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'see recap', exact: true }).click();
    const recap = await recapPagePromise;
    await recap.waitForLoadState();
    await expect(recap.getByText('you laughed', { exact: true })).toBeVisible();
    await expect(recap.locator('.x-giant')).toHaveText(endedCount);
    await recap.screenshot({
      path: path.join(shots, 'recap.png'),
      animations: 'disabled',
    });
    // The first story advances automatically after five seconds.
    await expect(
      recap.getByText("you weren't alone", { exact: true }),
    ).toBeVisible({ timeout: 7000 });
    for (let i = 0; i < 4; i++) await recap.keyboard.press('ArrowRight');
    await expect(
      recap.getByRole('button', { name: 'share', exact: true }),
    ).toBeVisible();
    await recap.getByRole('button', { name: 'replay', exact: true }).click();
    await expect(recap.getByText('you laughed', { exact: true })).toBeVisible();
    await expect(recap.locator('.x-pb')).toHaveCount(1);
    await recap.emulateMedia({ reducedMotion: 'reduce' });
    await expect(recap.locator('.x-st')).toHaveCSS('animation-name', 'none');
    await recap.screenshot({ path: path.join(shots, 'recap.png') });

    // SPA route changes hide the content UI without a page reload.
    await stream
      .getByRole('button', { name: 'directory', exact: true })
      .click();
    await expect(stream.locator('.x-dot')).toHaveCount(0);
    await stream.getByRole('button', { name: 'channel', exact: true }).click();
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, idle` }),
    ).toBeVisible();
    // Start another session through the toolbar page; closing the watched tab saves it.
    await stream.bringToFront();
    await popup.reload();
    await popup.getByRole('button', { name: 'start', exact: true }).click();
    await expect(
      stream.getByRole('button', { name: `${PRODUCT.name}, recording` }),
    ).toBeVisible();
    await stream.close();
    await expect(
      popup.getByRole('button', { name: 'stop', exact: true }),
    ).toHaveCount(0);
    await expect(recap.locator('.x-pb')).toHaveCount(2);

    const welcome = await context.newPage();
    await welcome.goto(`chrome-extension://${id}/welcome.html`);
    await expect(welcome.getByText(`${PRODUCT.pitch}.`)).toBeVisible();
    await welcome
      .locator('.popup')
      .screenshot({ path: path.join(shots, 'welcome.png') });
    await welcome.getByRole('button', { name: 'let’s go' }).click();
    await expect(welcome.getByText('we listen for laughs.')).toBeVisible();
    await welcome.getByRole('button', { name: 'allow mic' }).click();
    await expect(
      welcome.getByText('share with the crowd?', { exact: true }),
    ).toBeVisible();
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    await popup.getByRole('button', { name: 'listen for my laughs' }).click();
    await popup.getByRole('button', { name: 'listen for my laughs' }).click();
    await expect(
      popup.getByRole('button', { name: 'listen for my laughs' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await popup
      .getByRole('button', { name: 'delete my data', exact: true })
      .click();
    await expect(
      popup.getByRole('dialog', { name: 'delete your data?' }),
    ).toBeVisible();
    await popup.getByRole('button', { name: 'keep my data' }).click();
    await expect(recap.locator('.x-pb')).toHaveCount(2);
    await popup
      .getByRole('button', { name: 'delete my data', exact: true })
      .click();
    await popup
      .getByRole('button', { name: 'delete my data', exact: true })
      .click();
    await expect(
      recap.getByText('your next laugh starts a story.'),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
