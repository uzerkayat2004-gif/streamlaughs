// Targeted UI screenshots/assertions; does not run the e2e suite or use a personal profile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../../', import.meta.url));
const product = JSON.parse(
  fs.readFileSync(path.join(root, 'product.config.json'), 'utf8'),
);
const site = process.env.SITE_PROBE_URL || 'http://127.0.0.1:3106';
const folder = path.join(root, 'docs/screenshots/store-installs-v086');
const build = path.resolve(
  process.env.AUDIO_PROBE_BUILD ||
    path.join(root, 'apps/extension/.output/chrome-mv3'),
);
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
try {
  for (const kind of ['chrome', 'edge', 'firefox']) {
    const userAgent =
      kind === 'firefox'
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
        : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36${kind === 'edge' ? ' Edg/140.0.0.0' : ''}`;
    const context = await browser.newContext({
      userAgent,
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript((kind) => {
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        value:
          kind === 'firefox'
            ? undefined
            : {
                mobile: false,
                brands: [
                  {
                    brand: kind === 'edge' ? 'Microsoft Edge' : 'Google Chrome',
                    version: '140',
                  },
                  { brand: 'Chromium', version: '140' },
                ],
              },
      });
    }, kind);
    const page = await context.newPage();
    await page.goto(site + '/install');
    await page.evaluate(() => document.fonts.ready);
    const main = page.locator('main');
    if (kind === 'firefox') {
      await expect(
        main.getByText('StreamLaughs works on desktop Chrome and Edge'),
      ).toBeVisible();
      await expect(
        main.getByRole('button', { name: 'copy link' }),
      ).toBeVisible();
      await expect(main.locator('a[download]')).toHaveCount(0);
    } else {
      await expect(
        main
          .getByRole('link', {
            name: kind === 'edge' ? 'Get it for Edge' : 'Add to Chrome',
            exact: false,
          })
          .first(),
      ).toHaveAttribute(
        'href',
        kind === 'edge' ? product.edgeStoreUrl : product.chromeStoreUrl,
      );
      await expect(
        main.getByText(
          `The store update to v${product.version} is in review.`,
          { exact: false },
        ),
      ).toBeVisible();
    }
    await page.screenshot({
      path: path.join(folder, `install-${kind}.png`),
      fullPage: true,
    });
    results.push({ page: '/install', browserHints: kind, passed: true });
    if (kind === 'chrome') {
      await main.locator('#manual > summary').click();
      await expect(main.locator('#manual')).toHaveAttribute('open', '');
      await page.screenshot({
        path: path.join(folder, 'install-advanced.png'),
        fullPage: true,
      });
      await page.goto(site + '/download');
      await expect(
        page
          .locator('main')
          .getByRole('link', { name: 'Add to Chrome', exact: false }),
      ).toHaveAttribute('href', product.chromeStoreUrl);
      await page.screenshot({
        path: path.join(folder, 'download.png'),
        fullPage: true,
      });
      const metadata = await (
        await context.request.get(site + '/version.json')
      ).json();
      if (
        metadata.chromeStoreVersion !== product.chromeStoreVersion ||
        metadata.edgeStoreVersion !== product.edgeStoreVersion ||
        !metadata.downloadUrl.endsWith('/download/zip')
      )
        throw new Error('version metadata mismatch');
      results.push(
        { page: '/download', passed: true },
        { page: '/version.json', passed: true },
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  viewport: { width: 380, height: 900 },
  args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`],
});
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  const origin = worker.url().replace(/\/background\.js.*$/, '');
  for (const kind of ['development', 'normal']) {
    const page = await context.newPage();
    // UI-only store mock: an unpacked package cannot become a real store installation.
    if (kind === 'normal')
      await page.addInitScript(() => {
        chrome.management.getSelf = async () => ({ installType: 'normal' });
      });
    await page.goto(origin + '/popup.html');
    if (kind === 'development')
      await expect(
        page.getByRole('button', { name: 'Switch ↗', exact: true }),
      ).toBeVisible();
    else {
      await expect(page.locator('.store-switch')).toHaveCount(0);
      await expect(page.getByText(/update to v/)).toHaveCount(0);
    }
    await page.screenshot({
      path: path.join(folder, `popup-${kind}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'settings', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'load history', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'save my history', exact: true }),
    ).toHaveCount(kind === 'development' ? 1 : 0);
    results.push({
      extension: kind,
      storeInstallTypeMocked: kind === 'normal',
      passed: true,
    });
    await page.close();
  }
} finally {
  await context.close();
}
fs.writeFileSync(
  path.join(folder, 'proof.json'),
  JSON.stringify(
    {
      version: product.version,
      results,
      note: 'Browser UA/brand fixtures and normal-install UI mock; not a store submission or real store update test.',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ screenshots: folder, results }));
