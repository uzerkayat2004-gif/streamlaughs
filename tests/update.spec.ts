import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { PRODUCT, STATE_KEY } from '../packages/shared/src/index';

const id = 'fkocldgggcmhihelohiicoakcfomhepg';
const origin = `chrome-extension://${id}`;
const site = process.env.WEB_TEST_URL ?? 'http://127.0.0.1:3000';

test('Edge store runtime ID keeps both normal idle buttons and never offers a ZIP update', async () => {
  await mkdir('.test-runtime', { recursive: true });
  const build = await mkdtemp(path.resolve('.test-runtime/store-id-fixture-'));
  await cp(path.resolve('apps/extension/.output/chrome-mv3-site-test'), build, {
    recursive: true,
  });
  // A classic script provides a lexical chrome binding before app modules.
  // Mutating the native runtime.id property does not change Chrome's ID getter.
  await writeFile(
    path.join(build, 'store-id-fixture.js'),
    `const chrome = { ...globalThis.chrome, runtime: { ...globalThis.chrome.runtime, id: ${JSON.stringify(PRODUCT.edgeStoreExtensionId)} } };`,
  );
  for (const name of ['popup.html', 'update.html']) {
    const file = path.join(build, name);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        '<head>',
        '<head><script src="/store-id-fixture.js"></script>',
      ),
    );
  }
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`],
  });
  try {
    // The store is not public yet. This temporary fixture changes only the
    // page-visible runtime ID; message APIs and the background stay native.
    await context.route('https://www.twitch.tv/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Twitch fixture</title><main>controlled stream</main>',
      }),
    );
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const popup = await context.newPage();
    await popup.goto(`${origin}/popup.html`);
    expect(await popup.evaluate(() => chrome.runtime.id)).toBe(
      PRODUCT.edgeStoreExtensionId,
    );
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        'laughline:update': {
          checkedAt: Date.now(),
          latest: '99.0.0',
          available: true,
        },
      });
    });
    await expect(
      popup.getByRole('link', { name: 'open Twitch', exact: true }),
    ).toBeVisible();
    await expect(
      popup.getByRole('button', { name: /^update to v/ }),
    ).toHaveCount(0);
    const stream = await context.newPage();
    await stream.goto('https://www.twitch.tv/store_fixture');
    await stream.bringToFront();
    await popup.reload();
    await expect(
      popup.getByRole('button', { name: 'start', exact: true }),
    ).toBeEnabled();
    await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'SETTINGS',
        settings: { listen: false, share: false },
      }),
    );
    await popup.getByRole('button', { name: 'start', exact: true }).click();
    await expect(
      popup.getByRole('button', { name: 'stop', exact: true }),
    ).toBeVisible();
    await expect(popup.locator('.gear-update-dot')).toHaveCount(0);
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    await expect(
      popup.getByRole('button', { name: /^update to v/ }),
    ).toHaveCount(0);
    const update = await context.newPage();
    await update.goto(`${origin}/update.html?download=1`);
    await expect(
      update.getByRole('heading', { name: 'your browser handles updates.' }),
    ).toBeVisible();
    await expect(
      update.getByRole('button', { name: 'finish update' }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('ZIP update: both idle CTAs, later, verified download, safe stop, wrong folder, real file replacement/reload preserves recaps and settings', async ({
  request,
}) => {
  test.setTimeout(180000);
  await mkdir('.test-runtime', { recursive: true });
  const folder = await mkdtemp(path.resolve('.test-runtime/popup-update-'));
  const downloadFolder = await mkdtemp(
    path.resolve('.test-runtime/update-download-'),
  );
  const profile = await mkdtemp(path.resolve('.test-runtime/update-profile-'));
  await mkdir(path.join(profile, 'Default'));
  await writeFile(
    path.join(profile, 'Default', 'Preferences'),
    JSON.stringify({
      download: {
        default_directory: downloadFolder,
        prompt_for_download: false,
      },
    }),
  );
  await cp(
    path.resolve('apps/extension/.output/chrome-mv3-site-test'),
    folder,
    { recursive: true },
  );
  const manifestPath = path.join(folder, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = '0.0.0.1';
  await writeFile(manifestPath, JSON.stringify(manifest));
  const headers = { Origin: origin };
  const metadataResponse = await request.get(`${site}/version.json`, {
    headers,
  });
  const metadata = await metadataResponse.json();
  expect(metadata.version).toBe(PRODUCT.version);
  const allowed = await request.get(`${site}/download`, { headers });
  expect(allowed.headers()['access-control-allow-origin']).toBe(origin);
  const blocked = await request.get(`${site}/download`, {
    headers: { Origin: 'https://random.example' },
  });
  expect(blocked.headers()['access-control-allow-origin']).toBeUndefined();
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    acceptDownloads: true,
    downloadsPath: downloadFolder,
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1160, height: 900 },
    args: ['--enable-unsafe-extension-debugging'],
  });
  try {
    await context.route('https://www.twitch.tv/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Twitch fixture</title><main>controlled stream</main>',
      }),
    );
    // A deterministic newer public response; no account IDs or tokens in either request.
    await context.route(`${site}/version.json`, (route) =>
      route.fulfill({
        json: metadata,
        headers: { 'Access-Control-Allow-Origin': origin },
      }),
    );
    // Install like Load unpacked. Command-line installs and Developer mode off
    // are disabled on runtime.reload in Chromium 156, unlike a real ZIP install.
    const settings = await context.newPage();
    await settings.goto('chrome://extensions');
    await settings.evaluate(() =>
      Reflect.get(chrome, 'developerPrivate').updateProfileConfiguration({
        inDeveloperMode: true,
      }),
    );
    await settings.close();
    const installer = await context.browser()!.newBrowserCDPSession();
    expect(
      await installer.send('Extensions.loadUnpacked', { path: folder }),
    ).toEqual({ id });
    const popup = await context.newPage();
    const browserSession = await context.newCDPSession(popup);
    // Use Chrome's native target selection. CDP's allow/allowAndName overrides
    // chrome.downloads filename selection with a blob URL UUID.
    await browserSession.send('Browser.setDownloadBehavior', {
      behavior: 'default',
    });
    await popup.goto(`${origin}/popup.html`);
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    expect(new URL(worker.url()).host).toBe(id);
    await expect(
      popup.getByRole('button', { name: `update to v${PRODUCT.version}` }),
    ).toBeEnabled();
    await expect(popup.getByText('new version ready')).toBeVisible();
    await popup.getByRole('button', { name: 'later', exact: true }).click();
    await expect(
      popup.getByRole('link', { name: 'open Twitch', exact: true }),
    ).toBeVisible();
    await popup.reload();
    await expect(
      popup.getByRole('link', { name: 'open Twitch', exact: true }),
    ).toBeVisible();
    await popup.evaluate(() =>
      chrome.storage.session.remove('laughline:update-later'),
    );
    const stream = await context.newPage();
    await stream.goto('https://www.twitch.tv/update_fixture');
    const tabId = await worker.evaluate(
      async () =>
        (
          await chrome.tabs.query({
            url: 'https://www.twitch.tv/update_fixture',
          })
        )[0].id!,
    );
    await stream.bringToFront();
    await popup.reload();
    await expect(
      popup.getByRole('button', { name: `update to v${PRODUCT.version}` }),
    ).toBeEnabled();
    await popup.getByRole('button', { name: 'later', exact: true }).click();
    await expect(
      popup.getByRole('button', { name: 'start', exact: true }),
    ).toBeEnabled();
    await popup.evaluate(async (tabId) => {
      await chrome.runtime.sendMessage({
        type: 'SETTINGS',
        settings: { listen: false, share: false },
      });
      await chrome.runtime.sendMessage({ type: 'START', tabId });
    }, tabId);
    await expect(
      popup.getByRole('button', { name: 'stop', exact: true }),
    ).toBeVisible();
    await expect(popup.locator('.gear-update-dot')).toBeVisible();
    await expect(popup.getByText('new version ready')).toHaveCount(0);
    await expect(
      popup.getByRole('button', { name: `update to v${PRODUCT.version}` }),
    ).toHaveCount(0);
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    const opened = context.waitForEvent('page');
    await popup
      .getByRole('button', { name: `update to v${PRODUCT.version}` })
      .click();
    let update = await opened;
    await update.waitForLoadState();
    await expect(update.getByRole('status')).toHaveText(
      'your download is ready · checksum checked',
      { timeout: 60000 },
    );
    const item = await update.evaluate(
      async () =>
        (
          await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 })
        )[0],
    );
    expect(item.filename.replaceAll('\\', '/')).toMatch(
      new RegExp(
        `/streamlaughs-v${PRODUCT.version.replaceAll('.', '\\.')}.*\\.zip$`,
      ),
    );
    expect(item.state).toBe('complete');
    const bytes = await readFile(item.filename);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      metadata.sha256,
    );
    expect(bytes.length).toBe(metadata.bytes);
    // Downloading never stops an active session.
    expect(
      await update.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key].status,
        STATE_KEY,
      ),
    ).toBe('recording');
    await expect(update.locator('.update-steps article')).toHaveCount(3);
    await update.emulateMedia({ reducedMotion: 'reduce' });
    await update.setViewportSize({ width: 390, height: 844 });
    expect(
      await update.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await update.setViewportSize({ width: 1160, height: 900 });
    // No replacement yet: runtime.reload must explain the mistake, after saving the session.
    async function finishUpdate(expected: string) {
      await update
        .getByRole('button', { name: 'finish update', exact: true })
        .click()
        .catch((error) => {
          if (!update.isClosed()) throw error;
        });
      // runtime.reload closes extension tabs on Chromium. Follow the fresh
      // result document restored by onInstalled, also allowing in-place reload.
      await expect
        .poll(
          async () => {
            for (const candidate of context.pages()) {
              if (!candidate.url().startsWith(`${origin}/update.html`))
                continue;
              const status = await candidate
                .getByRole('status')
                .textContent({ timeout: 500 })
                .catch(() => null);
              if (status === expected) {
                update = candidate;
                return true;
              }
            }
            return false;
          },
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await finishUpdate('files not replaced yet');
    await expect(update.locator('.update-help')).toContainText('nested folder');
    const before = await update.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      STATE_KEY,
    );
    expect(before.status).toBe('idle');
    expect(before.session).toBeNull();
    expect(before.lastRecapId).toBeTruthy();
    const savedRecaps = () =>
      update.evaluate(
        () =>
          new Promise<unknown[]>((resolve, reject) => {
            const open = indexedDB.open('laughline');
            open.onerror = () => reject(new Error('database unavailable'));
            open.onsuccess = () => {
              const db = open.result;
              const query = db
                .transaction('recaps')
                .objectStore('recaps')
                .getAll();
              query.onsuccess = () => {
                db.close();
                resolve(query.result);
              };
              query.onerror = () => {
                db.close();
                reject(new Error('recaps unavailable'));
              };
            };
          }),
      );
    const recapsBefore = await savedRecaps();
    expect(recapsBefore).toHaveLength(1);
    // Replace ALL files from the actual verified production ZIP, in the same loaded folder.
    execFileSync(
      process.env.PYTHON ||
        (process.platform === 'win32' ? 'python' : 'python3'),
      ['-m', 'zipfile', '-e', item.filename, folder],
      { windowsHide: true },
    );
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).version).toBe(
      PRODUCT.version,
    );
    await finishUpdate(`you're on v${PRODUCT.version}`);
    expect(await update.evaluate(() => chrome.runtime.id)).toBe(id);
    expect(
      await update.evaluate(() => chrome.runtime.getManifest().version),
    ).toBe(PRODUCT.version);
    const after = await update.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key],
      STATE_KEY,
    );
    expect(after.settings).toEqual(before.settings);
    expect(after.lastRecapId).toBe(before.lastRecapId);
    expect(await savedRecaps()).toEqual(recapsBefore);
    const freshPopup = await context.newPage();
    await freshPopup.goto(`${origin}/popup.html`);
    await expect(freshPopup.getByRole('status')).toContainText(
      `you're on v${PRODUCT.version}`,
    );
  } finally {
    await context.close();
  }
});
