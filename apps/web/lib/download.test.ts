import { PRODUCT } from '@laughline/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Install from '../app/install/page';
import { GET } from '../app/version.json/route';

afterEach(() => vi.unstubAllEnvs());

it('offers a direct download on plain setup without a GitHub page or a new tab', async () => {
  const html = renderToStaticMarkup(
    await Install({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain(`Download ${PRODUCT.name}`);
  expect(html).toContain('href="/download"');
  expect(html).not.toMatch(/github\.com|GitHub Releases|target="_blank"/);
});

it('shows download confirmation and a direct retry for the automatic setup entry', async () => {
  const html = renderToStaticMarkup(
    await Install({ searchParams: Promise.resolve({ downloaded: '1' }) }),
  );
  expect(html).toContain('your download started');
  expect(html).toContain('didn’t start? download again');
  expect(html).toContain('href="/download"');
  expect(html).toContain('manifest.json');
  expect(html).not.toContain(`Download ${PRODUCT.name}`);
});

it('reports the built artifact checksum, size and same-site download URL with extension CORS', async () => {
  vi.stubEnv('SITE_URL', 'https://renamed.vercel.app');
  vi.stubEnv('EXTENSION_DOWNLOAD_VERSION', PRODUCT.version);
  vi.stubEnv('EXTENSION_DOWNLOAD_SHA256', 'a'.repeat(64));
  vi.stubEnv('EXTENSION_DOWNLOAD_BYTES', '40029312');
  const response = await GET(
    new Request('https://renamed.vercel.app/version.json', {
      headers: {
        Origin: 'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg',
      },
    }),
  );
  expect(await response.json()).toEqual({
    version: PRODUCT.version,
    installUrl: 'https://renamed.vercel.app/install',
    downloadUrl: 'https://renamed.vercel.app/download',
    sha256: 'a'.repeat(64),
    bytes: 40029312,
  });
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
    'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg',
  );
  expect(response.headers.get('Cache-Control')).toContain('must-revalidate');
});

it('does not advertise a stale checksum from a different build version', async () => {
  vi.stubEnv('EXTENSION_DOWNLOAD_VERSION', '0.0.0');
  vi.stubEnv('EXTENSION_DOWNLOAD_SHA256', 'a'.repeat(64));
  vi.stubEnv('EXTENSION_DOWNLOAD_BYTES', '40029312');
  const response = await GET(new Request('https://example.test/version.json'));
  expect(await response.json()).toMatchObject({ sha256: null, bytes: null });
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
});
