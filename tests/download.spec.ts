import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const product = JSON.parse(
  readFileSync(new URL('../product.config.json', import.meta.url), 'utf8'),
);
const identity = JSON.parse(
  readFileSync(
    new URL('../apps/extension/extension-identity.json', import.meta.url),
    'utf8',
  ),
);
const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

test('home opens setup, starts one matching ZIP download and preserves the fixed ID', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const metadataResponse = await request.get('/version.json');
  expect(metadataResponse.ok()).toBe(true);
  const metadata = await metadataResponse.json();
  expect(metadata.version).toBe(product.version);
  expect(metadata.downloadUrl).toBe(`${baseURL}/download`);
  expect(metadata.installUrl).toBe(`${baseURL}/install`);
  expect(metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(metadata.bytes).toBeGreaterThan(0);
  const head = await request.head('/download');
  expect(head.status()).toBe(200);
  expect(head.headers()['content-disposition']).toContain('attachment');
  expect(head.headers()['content-type']).toContain('application/zip');
  expect(Number(head.headers()['content-length'])).toBe(metadata.bytes);
  let downloadCount = 0;
  page.on('download', () => downloadCount++);
  await page.goto('/');
  const heroDownload = page
    .locator('.hero-actions')
    .getByRole('link', { name: `Download ${product.name}`, exact: true });
  await expect(heroDownload).toHaveAttribute('href', '/install?downloaded=1');
  expect(downloadCount).toBe(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    heroDownload.click(),
  ]);
  await expect(page).toHaveURL(`${baseURL}/install?downloaded=1`);
  await expect(page.getByRole('status')).toHaveText('your download started');
  await expect(
    page.getByRole('heading', { name: 'unzip the download.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /didn’t start\? download again/ }),
  ).toHaveAttribute('href', '/download');
  await expect(page.locator('main a[href*="github.com"]')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'source code ↗' }),
  ).toHaveAttribute('href', /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
  await page.getByRole('tab', { name: 'Brave', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /brave:\/\/extensions/ }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Edge', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /edge:\/\/extensions/ }),
  ).toBeVisible();
  expect(downloadCount).toBe(1);
  expect(download.url()).toBe(`${baseURL}/download`);
  expect(download.suggestedFilename()).toBe(`${slug}.zip`);
  const archive = testInfo.outputPath(`${slug}.zip`);
  await download.saveAs(archive);
  const bytes = readFileSync(archive);
  expect(bytes.length).toBe(metadata.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    metadata.sha256,
  );
  expect(
    (
      await (
        await request.get(`/downloads/${slug}-v${product.version}.zip.sha256`)
      ).text()
    ).split(' ')[0],
  ).toBe(metadata.sha256);
  const folder = await mkdtemp(
    path.join(tmpdir(), 'streamlaughs-site-install-'),
  );
  execFileSync(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    [
      '-c',
      'import sys,zipfile; from pathlib import Path; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert all(not n.startswith("/") and ".." not in Path(n).parts for n in z.namelist()); z.extractall(sys.argv[2])',
      archive,
      folder,
    ],
    { windowsHide: true },
  );
  const manifest = JSON.parse(
    readFileSync(path.join(folder, 'manifest.json'), 'utf8'),
  );
  expect(manifest.version).toBe(metadata.version);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${folder}`,
      `--load-extension=${folder}`,
    ],
  });
  try {
    const worker =
      context
        .serviceWorkers()
        .find((worker) => new URL(worker.url()).host === identity.id) ??
      (await context.waitForEvent('serviceworker', {
        predicate: (worker) => new URL(worker.url()).host === identity.id,
      }));
    expect(new URL(worker.url()).host).toBe(identity.id);
    expect(
      await worker.evaluate(() => chrome.runtime.getManifest().version),
    ).toBe(metadata.version);
  } finally {
    await context.close();
  }
});

test('plain setup waits for a click; automatic setup offers a working retry', async ({
  page,
  baseURL,
}, testInfo) => {
  let downloadCount = 0;
  page.on('download', () => downloadCount++);
  // The first test verifies all artifact bytes; cancel UI-only downloads here.
  for (const suffix of ['', '?downloaded=0']) {
    await page.goto(`/install${suffix}`);
    await expect(
      page.getByRole('link', { name: `Download ${product.name}`, exact: true }),
    ).toHaveAttribute('href', '/download');
    await expect(
      page.getByText('your download started', { exact: true }),
    ).toHaveCount(0);
  }
  expect(downloadCount).toBe(0);
  const [direct] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('link', { name: `Download ${product.name}`, exact: true })
      .click(),
  ]);
  await direct.cancel();
  await expect(page).toHaveURL(`${baseURL}/install?downloaded=0`);
  expect(downloadCount).toBe(1);
  const [automatic] = await Promise.all([
    page.waitForEvent('download'),
    page.goto('/install?downloaded=1'),
  ]);
  await automatic.cancel();
  await expect(page.getByRole('status')).toHaveText('your download started');
  const [retry] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /didn’t start\? download again/ }).click(),
  ]);
  await retry.cancel();
  await expect(page).toHaveURL(`${baseURL}/install?downloaded=1`);
  expect(downloadCount).toBe(3);
  await expect(page.locator('.install-step')).toHaveCount(6);
  await expect(
    page.getByRole('heading', { name: 'stuck?', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('setup-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('setup-mobile.png'),
    fullPage: true,
  });
});

test('nav, final CTA and demo downloads all open setup and start the attachment', async ({
  page,
  baseURL,
}) => {
  for (const entry of [
    { path: '/', selector: '.site-header .nav-cta' },
    { path: '/', selector: 'main > .download-invite a' },
    { path: '/demo', selector: '.dashboard-page .download-invite a' },
  ]) {
    await page.goto(entry.path);
    const link = page.locator(entry.selector);
    await expect(link).toHaveAttribute('href', '/install?downloaded=1');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      link.click(),
    ]);
    await download.cancel();
    await expect(page).toHaveURL(`${baseURL}/install?downloaded=1`);
    await expect(page.getByRole('status')).toHaveText('your download started');
  }
});
