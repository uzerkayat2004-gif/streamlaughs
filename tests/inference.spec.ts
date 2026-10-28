import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('real bundled YAMNet laugh updates the dot box, popup, checkpoint and recap', async () => {
  test.setTimeout(180000);
  const wav = path.resolve(
    process.env.LAUGHLINE_TEST_WAV ?? 'eval/local/laugh.wav',
  );
  test.skip(
    !existsSync(wav),
    'Provide a local laugh WAV: LAUGHLINE_TEST_WAV or eval/local/laugh.wav. Audio is never bundled in this test.',
  );
  const extension = path.resolve(
    'apps/extension/.output/chrome-mv3-audio-debug',
  );
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  const errors: string[] = [];
  context.on('page', (page) =>
    page.on('pageerror', (e) => errors.push(e.message)),
  );
  try {
    const sw =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker')),
      id = new URL(sw.url()).host;
    const welcome = await context.newPage();
    await welcome.goto(`chrome-extension://${id}/welcome.html?step=mic`);
    await welcome
      .getByRole('button', { name: 'allow mic', exact: true })
      .click();
    const stream = await context.newPage();
    await stream.route('https://www.twitch.tv/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div data-a-target="video-player" style="width:1000px;height:650px;background:#12171b"></div></body></html>',
      }),
    );
    await stream.goto('https://www.twitch.tv/nightowl_tv');
    const debug = await context.newPage();
    await debug.goto(`chrome-extension://${id}/debug.html`);
    const tabId = await sw.evaluate(
      async () =>
        (
          await chrome.tabs.query({ url: 'https://www.twitch.tv/nightowl_tv' })
        )[0]!.id!,
    );
    expect(
      (
        await debug.evaluate(
          (tabId) =>
            chrome.runtime.sendMessage({ type: 'DEBUG_MIC_START', tabId }),
          tabId,
        )
      ).ok,
    ).toBe(true);
    // This dev-only mic start bypasses tabCapture's toolbar gesture, never the model or event rules.
    await expect(debug.getByTestId('inference-phase')).toContainText('ready', {
      timeout: 60000,
    });
    await expect
      .poll(
        async () =>
          debug.evaluate(
            async () =>
              (await chrome.storage.local.get('laughline:state'))[
                'laughline:state'
              ].session?.laughCount ?? 0,
          ),
        { timeout: 100000 },
      )
      .toBeGreaterThan(0);
    await stream.locator('.x-dot').click();
    await expect(stream.locator('.x-cbox .you')).toContainText(/[1-9]\d*/);
    const popup = await context.newPage();
    await stream.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('.you')).toContainText(/[1-9]\d*/);
    const snapshot = await popup.evaluate(
      async () =>
        (await chrome.storage.local.get('laughline:state'))['laughline:state'],
    );
    expect(snapshot.session.source).toBe('local');
    expect(snapshot.session.personal.hardest).not.toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(
      /lastTranscript|transcript|Float32Array|samples":\[/,
    );
    // Offscreen documents are not Playwright pages; read the actual worker's bounded fetch audit.
    const modelRequests: string[] = (
      await debug.evaluate(() =>
        chrome.runtime.sendMessage({ type: 'AI_DEBUG' }),
      )
    ).resources;
    expect(modelRequests.length).toBeGreaterThan(5);
    expect(
      modelRequests.every((url) => url.startsWith(`chrome-extension://${id}/`)),
    ).toBe(true);
    await popup.getByRole('button', { name: 'stop', exact: true }).click();
    const recap = await context.newPage();
    await recap.goto(`chrome-extension://${id}/recap.html`);
    await expect(
      recap.getByText(
        'real personal reactions · no crowd data · stored on this browser',
      ),
    ).toBeVisible();
    await recap.emulateMedia({ reducedMotion: 'reduce' });
    await recap.getByRole('button', { name: 'next', exact: true }).click();
    await expect(
      recap.getByText('your word of the night', { exact: true }),
    ).toBeVisible();
    await expect(recap.getByText('you vs crowd', { exact: true })).toHaveCount(
      0,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
