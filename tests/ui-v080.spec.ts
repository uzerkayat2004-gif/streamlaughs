import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import {
  createRecap,
  initialSnapshot,
  MySessionSchema,
} from '../packages/shared/src/index';

const id = 'fkocldgggcmhihelohiicoakcfomhepg';
const shots = path.resolve('.test-runtime/v080-shots');
const launchFlags = [
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
];
const saved = (
  key: string,
  channel: string,
  displayName: string,
  at: number,
  laughs: number,
) => {
  const value = MySessionSchema.parse({
    id: key,
    channel,
    channelUrl: `https://www.twitch.tv/${channel}`,
    displayName,
    tabId: 1,
    startedAt: at,
    endedAt: at + 4320000,
    laughCount: laughs,
    laughEvents: laughs
      ? [
          0, 120, 400, 800, 1200, 1800, 2400, 2530, 2536, 2542, 2554, 2560,
          2588, 2700, 2900, 3100, 3300, 3500, 3700, 3900, 4000, 4100, 4200,
        ]
          .slice(0, laughs)
          .map((seconds) => ({ at: at + seconds * 1000, crowd: 0 }))
      : [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: laughs
      ? [
          { word: 'lets go', count: 9 },
          { word: 'bro', count: 6 },
          { word: 'wow', count: 2 },
        ]
      : [],
    source: 'fake',
  });
  value.personal.hype = laughs ? 4 : 0;
  value.personal.gasps = laughs ? 1 : 0;
  value.personal.screams = laughs ? 2 : 0;
  value.personal.hardest = laughs
    ? { ts: at + 2838000, intensity: 0.8, confidence: 0.9, crowd: 0 }
    : null;
  return value;
};

test('v0.8 production website ZIP: glass fade/drag, grouped history, keyboard stories and real canvas PNG', async () => {
  await mkdir(shots, { recursive: true });
  const extension = await mkdtemp(path.resolve('.test-runtime/v080-unpacked-'));
  execFileSync(
    process.platform === 'win32' ? 'python' : 'python3',
    [
      '-m',
      'zipfile',
      '-e',
      path.resolve('apps/web/public/downloads/streamlaughs.zip'),
      extension,
    ],
    { windowsHide: true },
  );
  const manifest = JSON.parse(
    await readFile(path.join(extension, 'manifest.json'), 'utf8'),
  );
  expect(manifest.version).toBe('0.8.0');
  expect(manifest.key).toBeTruthy();
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      ...launchFlags,
    ],
  });
  try {
    await context.route('https://www.twitch.tv/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/frame.png') {
        await route.fulfill({
          response: await context.request.get(
            'http://127.0.0.1:4179/frame.png',
          ),
        });
      } else {
        const html = await (
          await context.request.get('http://127.0.0.1:4179/nightowl_tv')
        ).text();
        await route.fulfill({
          contentType: 'text/html',
          body: html
            .replace(
              'Local test fixture · all requests stay local',
              'UI test · simulated counts',
            )
            .replace(
              '</div><h3>',
              '<div style="position:absolute;bottom:0;height:54px;left:0;right:0;background:#0009;padding:18px">▶ ━━━━━━━━━━━━━　⚙　⛶</div></div><h3>',
            ),
        });
      }
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    expect(new URL(worker.url()).host).toBe(id);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('.smile-trigger')).toBeVisible();
    await popup
      .locator('.popup')
      .screenshot({ path: path.join(shots, 'popup-idle.png') });
    const stream = await context.newPage();
    await stream.goto('https://www.twitch.tv/grimm');
    await stream.bringToFront();
    const launcher = stream.locator('.glass-launcher');
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveCSS('width', '40px');
    const player = await stream.locator('.video-player').boundingBox();
    const launcherBox = await launcher.boundingBox();
    expect(launcherBox!.y + launcherBox!.height).toBeLessThanOrEqual(
      player!.y + player!.height - 64,
    );
    // A real crowd-only start/stop exercises saving, the toolbar badge and confirmed discard.
    const tabId = await stream
      .evaluate(() => 0)
      .then(() =>
        worker.evaluate(
          async () =>
            (
              await chrome.tabs.query({ url: 'https://www.twitch.tv/grimm' })
            )[0]!.id!,
        ),
      );
    await popup.evaluate(async (tabId) => {
      await chrome.runtime.sendMessage({
        type: 'SETTINGS',
        settings: { listen: false },
      });
      await chrome.runtime.sendMessage({ type: 'START', tabId });
    }, tabId);
    await expect(stream.locator('.recording-dot')).toBeVisible();
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP' }));
    const realToast = stream.locator('.recap-toast');
    await expect(realToast).toContainText('stream saved');
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getBadgeText({})))
      .toBe('•');
    await realToast
      .getByRole('button', { name: 'discard', exact: true })
      .click();
    await realToast
      .getByRole('button', { name: 'keep it', exact: true })
      .click();
    await realToast
      .getByRole('button', { name: 'discard', exact: true })
      .click();
    await realToast
      .getByRole('button', { name: 'discard', exact: true })
      .click();
    await expect(realToast).toHaveCount(0);
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getBadgeText({})))
      .toBe('');
    const snapshot = initialSnapshot();
    snapshot.revision = Date.now() + 1000;
    snapshot.session = {
      ...saved('four', 'grimm', 'Grimm', Date.now() - 720000, 23),
      endedAt: null,
    };
    snapshot.status = 'recording';
    snapshot.settings.listen = false; // This controlled UI fixture never captures audio or starts inference.
    snapshot.crowd = {
      channel: 'grimm',
      source: 'fake',
      state: 'live',
      laughingNow: 12,
      laughlineViewers: 18,
      topWords: [{ word: 'lmao', count: 6 }],
      updatedAt: Date.now(),
    };
    await worker.evaluate(
      (state) => chrome.storage.local.set({ 'laughline:state': state }),
      snapshot,
    );
    await stream.screenshot({ path: path.join(shots, 'launcher.png') });
    await launcher.click();
    const panel = stream.getByRole('dialog', { name: 'fans box' });
    await expect(panel.getByText('23 laughs', { exact: true })).toBeVisible();
    await expect(panel).toHaveCSS('background-color', 'rgba(15, 15, 20, 0.35)');
    expect(
      await panel.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    const stop = await panel
      .getByRole('button', { name: 'stop session' })
      .boundingBox();
    const bounds = await panel.boundingBox();
    expect(stop!.y + stop!.height).toBeLessThanOrEqual(
      bounds!.y + bounds!.height,
    );
    await stream.mouse.move(20, 20);
    await expect(panel).toHaveCSS('opacity', '0.25', { timeout: 6500 });
    await panel.hover();
    await expect(panel).toHaveCSS('opacity', '1');
    await stream.mouse.move(20, 20);
    snapshot.session!.laughCount++;
    snapshot.revision++;
    await worker.evaluate(
      (state) => chrome.storage.local.set({ 'laughline:state': state }),
      snapshot,
    );
    await expect(panel).toHaveCSS('opacity', '1');
    await expect(panel.getByText('24 laughs', { exact: true })).toBeVisible();
    await panel.hover();
    await stream.screenshot({ path: path.join(shots, 'overlay.png') });
    const handle = panel.getByRole('button', {
      name: 'move reaction panel with arrow keys or drag',
    });
    const h = await handle.boundingBox(),
      before = await panel.boundingBox();
    await stream.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
    await stream.mouse.down();
    await stream.mouse.move(
      h!.x + h!.width / 2 - 120,
      h!.y + h!.height / 2 - 45,
      { steps: 12 },
    );
    await stream.mouse.up();
    await expect
      .poll(async () => (await panel.boundingBox())!.x)
      .toBeLessThan(before!.x - 80);
    const moved = await panel.boundingBox();
    await stream.reload();
    await stream.locator('.glass-launcher').click();
    await expect
      .poll(async () => Math.abs((await panel.boundingBox())!.x - moved!.x))
      .toBeLessThan(2);
    await panel
      .getByRole('button', { name: 'collapse reaction panel' })
      .click();
    await expect(panel).toHaveCount(0);
    await popup.bringToFront();
    await expect(
      popup.getByText('laughs so far', { exact: true }),
    ).toBeVisible();
    await popup
      .locator('.popup')
      .screenshot({ path: path.join(shots, 'popup-active.png') });

    const at = Date.UTC(2026, 9, 30, 18);
    const sessions = [
      saved('four', 'grimm', 'Grimm', at, 23),
      saved('three', 'grimm', 'Grimm', at - 86400000, 8),
      saved('two', 'grimm', 'Grimm', at - 172800000, 18),
      saved('one', 'grimm', 'Grimm', at - 259200000, 12),
      saved('empty', 'pixelcamp', 'pixelcamp', at - 345600000, 0),
    ];
    const recaps = sessions.map((s) => ({
      ...createRecap(s, s.endedAt!),
      seenAt: s.id === 'four' ? null : s.endedAt,
    }));
    const recap = await context.newPage();
    await recap.emulateMedia({ reducedMotion: 'reduce' });
    await recap.goto(`chrome-extension://${id}/recap.html`);
    await expect(
      recap.getByText('your next laugh starts a story.'),
    ).toBeVisible();
    await worker.evaluate(
      async ({ sessions, recaps }) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('laughline');
          request.onsuccess = () => {
            const database = request.result,
              tx = database.transaction(
                ['sessions', 'recaps', 'streamerProfiles'],
                'readwrite',
              );
            for (const session of sessions)
              tx.objectStore('sessions').put(session);
            for (const recap of recaps) tx.objectStore('recaps').put(recap);
            for (const session of sessions)
              tx.objectStore('streamerProfiles').put({
                login: session.channel,
                displayName: session.displayName,
              });
            tx.oncomplete = () => {
              database.close();
              resolve();
            };
            tx.onerror = () => reject(new Error('fixture write failed'));
          };
          request.onerror = () =>
            reject(new Error('fixture database unavailable'));
        }),
      { sessions, recaps },
    );
    // Drive the actual content-script snapshot transition; fixture numbers are clearly labelled.
    snapshot.lastRecapId = 'four';
    snapshot.lastSaved = { id: 'four', durationSeconds: 4320, laughs: 23 };
    snapshot.session = null;
    snapshot.status = 'idle';
    snapshot.revision++;
    await stream.bringToFront();
    await worker.evaluate(
      (state) => chrome.storage.local.set({ 'laughline:state': state }),
      snapshot,
    );
    const toast = stream.locator('.recap-toast');
    await expect(toast).toContainText('stream saved · 1h 12m · 23 laughs');
    await expect(
      toast.getByRole('button', { name: 'see recap', exact: true }),
    ).toBeVisible();
    await toast.getByRole('button', { name: 'discard', exact: true }).click();
    await expect(toast).toContainText('discard this saved stream?');
    await toast.getByRole('button', { name: 'keep it', exact: true }).click();
    await stream.screenshot({ path: path.join(shots, 'stop-flow.png') });
    await toast.getByRole('button', { name: 'later', exact: true }).click();
    await expect(toast).toHaveCount(0);
    await recap.bringToFront();
    await recap.goto(`chrome-extension://${id}/recap.html?view=streamers`);
    await expect(recap.locator('.streamer-card')).toHaveCount(2);
    await expect(recap.locator('.streamer-card').first()).toContainText(
      '4 streams watched · 61 laughs',
    );
    await expect(recap.locator('.streamer-card').first()).toContainText(
      'new recap',
    );
    await recap.screenshot({ path: path.join(shots, 'my-streamers.png') });
    await recap.locator('.streamer-card').first().click();
    await expect(recap.locator('.saved-stream-row')).toHaveCount(4);
    await expect(recap.locator('.laugh-sparkline')).toHaveCount(4);
    await recap.screenshot({ path: path.join(shots, 'streamer-timeline.png') });
    await recap.locator('.stream-open').first().click();
    await expect(recap.locator('[data-slide="intro"]')).toContainText('1h 12m');
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getBadgeText({})))
      .toBe('');
    await recap.screenshot({ path: path.join(shots, 'recap-1-intro.png') });
    await recap.keyboard.press('ArrowRight');
    await expect(
      recap.locator('[data-slide="laughs"] .story-number'),
    ).toHaveText('23');
    await expect(recap.locator('[data-slide="laughs"]')).toContainText(
      'about 19 an hour',
    );
    await recap.screenshot({ path: path.join(shots, 'recap-2-laughs.png') });
    await recap.keyboard.press('ArrowRight');
    await expect(recap.locator('[data-slide="moment"]')).toContainText('42:10');
    await expect(recap.locator('[data-slide="moment"]')).toContainText(
      '6 times in a minute',
    );
    await recap.screenshot({ path: path.join(shots, 'recap-3-moment.png') });
    await recap.keyboard.press('ArrowRight');
    await expect(recap.locator('.story-words li')).toHaveCount(3);
    await expect(recap.locator('.story-chips')).not.toContainText('0 masked');
    await recap.keyboard.press('ArrowRight');
    await expect(recap.locator('[data-slide="history"]')).toContainText(
      '4th stream',
    );
    await expect(recap.locator('[data-slide="history"]')).toContainText('61');
    await recap.getByRole('button', { name: 'share recap' }).click();
    const preview = recap.getByAltText('your share card preview');
    await expect(preview).toBeVisible();
    expect(
      await preview.evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
      ]),
    ).toEqual([1080, 1920]);
    const png = recap.waitForEvent('download');
    await recap
      .getByRole('link', { name: 'download image', exact: true })
      .click();
    await (await png).saveAs(path.join(shots, 'share-card-1080x1920.png'));
    await expect(
      recap.getByRole('button', { name: 'copy image', exact: true }),
    ).toBeEnabled(); // OS clipboard approval is a manual acceptance check.
    await recap.getByRole('button', { name: 'close', exact: true }).click();
    await recap.getByRole('button', { name: 'my streamers' }).click();
    await recap
      .locator('.streamer-card')
      .filter({ hasText: 'pixelcamp' })
      .click();
    await recap.locator('.stream-open').click();
    await expect(recap.locator('[data-slide="empty"]')).toContainText(
      'we didn’t hear anything this time',
    );
    await expect(
      recap.getByRole('link', { name: 'test my mic' }),
    ).toBeVisible();
    await expect(
      recap.getByRole('button', { name: 'share recap' }),
    ).toHaveCount(0);
    await expect(recap.locator('.story-navigation')).toContainText('1 / 1');
    // Exercise confirmed discard through the real background handler, preserving other recaps/settings.
    await stream.bringToFront();
    snapshot.session = { ...sessions[4]!, channel: 'grimm', endedAt: null };
    snapshot.status = 'recording';
    snapshot.revision++;
    await worker.evaluate(
      (state) => chrome.storage.local.set({ 'laughline:state': state }),
      snapshot,
    );
    await expect(stream.locator('.recording-dot')).toBeVisible();
    snapshot.session = null;
    snapshot.status = 'idle';
    snapshot.lastRecapId = 'empty';
    snapshot.lastSaved = { id: 'empty', durationSeconds: 4320, laughs: 0 };
    snapshot.revision++;
    await worker.evaluate(
      (state) => chrome.storage.local.set({ 'laughline:state': state }),
      snapshot,
    );
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'discard', exact: true }).click();
    await toast.getByRole('button', { name: 'discard', exact: true }).click();
    await expect(toast).toHaveCount(0);
    await recap.reload();
    await expect(recap.locator('[data-slide="empty"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('popup fits the 380px surface at 125% browser device scaling', async () => {
  await mkdir(shots, { recursive: true });
  const build = path.resolve('apps/extension/.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: { width: 380, height: 600 },
    deviceScaleFactor: 1.25,
    args: [
      `--disable-extensions-except=${build}`,
      `--load-extension=${build}`,
      ...launchFlags,
    ],
  });
  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.locator('.smile-trigger')).toBeVisible();
    expect(
      await page
        .locator('.popup')
        .evaluate((el) => ({ width: el.scrollWidth, height: el.scrollHeight })),
    ).toEqual({ width: 380, height: 600 });
    await page.screenshot({ path: path.join(shots, 'popup-125-percent.png') });
  } finally {
    await context.close();
  }
});
