import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const debugExtension = path.resolve(
  'apps/extension/.output/chrome-mv3-audio-debug',
);
const productionExtension = path.resolve('apps/extension/.output/chrome-mv3');
const mediaFlags = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
];

test('real mic permission, worklet frames, numeric status, pause, worker restart and teardown with Chromium fake devices', async () => {
  test.setTimeout(120000);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${debugExtension}`,
      `--load-extension=${debugExtension}`,
      ...mediaFlags,
    ],
  });
  const errors: string[] = [];
  context.on('page', (page) =>
    page.on('pageerror', (error) => errors.push(error.message)),
  );
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const welcome = await context.newPage();
    await welcome.addInitScript(() => {
      const actual = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      const tracks: MediaStreamTrack[] = [];
      Object.defineProperty(window, '__permissionTracks', { value: tracks });
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await actual(constraints);
        tracks.push(...stream.getTracks());
        return stream;
      };
    });
    await welcome.goto(`chrome-extension://${id}/welcome.html?step=mic`);
    await expect(welcome.getByText('we listen for laughs.')).toBeVisible();
    await welcome
      .getByRole('button', { name: 'allow mic', exact: true })
      .click();
    await expect(
      welcome.getByText('share with the crowd?', { exact: true }),
    ).toBeVisible();
    expect(
      await welcome.evaluate(() =>
        Reflect.get(window, '__permissionTracks').every(
          (track: MediaStreamTrack) => track.readyState === 'ended',
        ),
      ),
    ).toBe(true);
    expect(
      await welcome.evaluate(
        async () =>
          (
            await navigator.permissions.query({
              name: 'microphone' as PermissionName,
            })
          ).state,
      ),
    ).toBe('granted');

    const debug = await context.newPage();
    await debug.goto(`chrome-extension://${id}/debug.html`);
    await debug
      .getByRole('button', { name: 'test microphone', exact: true })
      .click();
    await expect(debug.getByTestId('capture-phase')).toHaveText('active', {
      timeout: 20000,
    });
    await expect
      .poll(
        async () => Number(await debug.getByTestId('mic-frames').textContent()),
        { timeout: 15000 },
      )
      .toBeGreaterThan(40);
    await expect
      .poll(
        async () =>
          Number(await debug.getByTestId('mic-buffered-samples').textContent()),
        { timeout: 20000 },
      )
      .toBeGreaterThan(10000);
    await expect
      .poll(async () =>
        Number(
          await debug
            .getByRole('meter', { name: 'mic level', exact: true })
            .getAttribute('value'),
        ),
      )
      .toBeGreaterThan(0);
    const snapshot = await debug.evaluate(
      async () =>
        (await chrome.storage.local.get('laughline:state'))['laughline:state'],
    );
    expect(snapshot.session).toBeNull(); // Diagnostic never writes a pretend watched session.
    expect(
      Object.values(snapshot.capture.metrics).every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ),
    ).toBe(true);
    expect(
      await worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    ).toBe(1);

    // Pause the actual offscreen worklet through the existing command path.
    await debug.evaluate(() => chrome.runtime.sendMessage({ type: 'PAUSE' }));
    await expect(debug.getByTestId('capture-phase')).toHaveText('paused');
    await expect
      .poll(async () =>
        Number(
          await debug
            .getByRole('meter', { name: 'mic level', exact: true })
            .getAttribute('value'),
        ),
      )
      .toBe(0);
    await debug.evaluate(() => chrome.runtime.sendMessage({ type: 'PAUSE' }));
    await expect(debug.getByTestId('capture-phase')).toHaveText('active');

    // Terminate only the worker; the offscreen owner and its sample counter must survive.
    const cdp = await context.newCDPSession(debug);
    let versionId: string | undefined;
    const workerStates: string[] = [];
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      versionId =
        versions.find(
          (version) =>
            version.scriptURL === worker.url() &&
            version.runningStatus === 'running',
        )?.versionId ?? versionId;
      for (const version of versions)
        if (version.scriptURL === worker.url())
          workerStates.push(version.runningStatus);
    });
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => versionId).toBeTruthy();
    const before = Number(await debug.getByTestId('mic-frames').textContent());
    await cdp.send('ServiceWorker.stopWorker', { versionId: versionId! });
    // A restarted version can retain its Playwright Worker wrapper; observe the browser's lifecycle instead.
    await expect
      .poll(() => workerStates.includes('stopped'), { timeout: 10000 })
      .toBe(true);
    await expect
      .poll(() => workerStates.at(-1), { timeout: 10000 })
      .toBe('running');
    await expect(debug.getByTestId('capture-phase')).toHaveText('active');
    await expect
      .poll(async () =>
        Number(await debug.getByTestId('mic-frames').textContent()),
      )
      .toBeGreaterThan(before + 25);
    await debug.screenshot({
      path: 'docs/screenshots/audio-debug.png',
      fullPage: true,
      style: 'textarea { visibility: hidden; }',
    });
    await debug
      .getByRole('button', { name: 'stop audio', exact: true })
      .click();
    await expect(debug.getByTestId('capture-phase')).toHaveText('idle');
    await expect(debug.getByTestId('mic-buffered-samples')).toHaveText('0');
    expect(
      await debug.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('production excludes developer debug and missing microphone permission opens Welcome at the mic step', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${productionExtension}`,
      `--load-extension=${productionExtension}`,
      ...mediaFlags,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    expect(existsSync(path.join(productionExtension, 'debug.html'))).toBe(
      false,
    );
    const debug = await context.newPage();
    await debug.goto(`chrome-extension://${id}/popup.html`);
    expect(
      (
        await debug.evaluate(() =>
          chrome.runtime.sendMessage({ type: 'DEBUG_MIC_START' }),
        )
      ).ok,
    ).toBe(false);
    const cdp = await context.newCDPSession(debug);
    await cdp.send('Browser.setPermission', {
      permission: { name: 'microphone' },
      setting: 'denied',
      origin: `chrome-extension://${id}`,
    });
    const stream = await context.newPage();
    await stream.route('https://www.twitch.tv/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div data-a-target="video-player" style="width:800px;height:450px"></div></body></html>',
      }),
    );
    await stream.goto('https://www.twitch.tv/nightowl_tv');
    const popup = await context.newPage();
    await stream.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const opened = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'start', exact: true }).click();
    const welcome = await opened;
    await welcome.waitForLoadState();
    expect(welcome.url()).toContain('step=mic');
    await expect(
      welcome.getByRole('button', { name: 'allow mic', exact: true }),
    ).toBeVisible();
    expect(
      await popup.evaluate(
        async () =>
          (await chrome.storage.local.get('laughline:state'))['laughline:state']
            .capture.phase,
      ),
    ).toBe('permissionRequired');
    expect(
      await popup.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    ).toBe(0);
  } finally {
    await context.close();
  }
});
