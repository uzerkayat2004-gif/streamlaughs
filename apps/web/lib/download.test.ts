import { PRODUCT } from '@laughline/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Download from '../app/download/page';
import Install from '../app/install/page';
import { GET } from '../app/version.json/route';

afterEach(() => vi.unstubAllEnvs());
it('offers store buttons first with a collapsed advanced ZIP backup, without automatic downloads', () => {
  for (const page of [Install(), Download()]) {
    const html = renderToStaticMarkup(page);
    expect(html).toContain(PRODUCT.chromeStoreUrl);
    expect(html).toContain(PRODUCT.edgeStoreUrl);
    expect(html).toContain('Advanced: manual install (for testers)');
    expect(html).toContain('href="/download/zip"');
    expect(html.indexOf(PRODUCT.chromeStoreUrl)).toBeLessThan(
      html.indexOf('Advanced:'),
    );
    expect(html).not.toContain('your download started');
    expect(html).not.toMatch(/<details[^>]* open/);
  }
});
it.each([
  PRODUCT.edgeStoreExtensionId,
  PRODUCT.chromeStoreExtensionId,
  'fkocldgggcmhihelohiicoakcfomhepg',
])('allows public metadata for known origin %s', async (id) => {
  const origin = `chrome-extension://${id}`;
  const response = await GET(
    new Request('https://streamlaughs.vercel.app/version.json', {
      headers: { Origin: origin },
    }),
  );
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
});
it('reports the exact ZIP plus both approved store versions', async () => {
  vi.stubEnv('SITE_URL', 'https://renamed.vercel.app');
  vi.stubEnv('EXTENSION_DOWNLOAD_VERSION', PRODUCT.version);
  vi.stubEnv('EXTENSION_DOWNLOAD_SHA256', 'a'.repeat(64));
  vi.stubEnv('EXTENSION_DOWNLOAD_BYTES', '40029312');
  const response = await GET(
    new Request('https://renamed.vercel.app/version.json'),
  );
  expect(await response.json()).toEqual({
    version: PRODUCT.version,
    installUrl: 'https://renamed.vercel.app/install',
    downloadUrl: 'https://renamed.vercel.app/download/zip',
    chromeStoreVersion: PRODUCT.chromeStoreVersion,
    edgeStoreVersion: PRODUCT.edgeStoreVersion,
    sha256: 'a'.repeat(64),
    bytes: 40029312,
  });
  expect(response.headers.get('Cache-Control')).toContain('must-revalidate');
});
it('never publishes a stale checksum or grants a random origin', async () => {
  vi.stubEnv('EXTENSION_DOWNLOAD_VERSION', '0.0.0');
  vi.stubEnv('EXTENSION_DOWNLOAD_SHA256', 'a'.repeat(64));
  const response = await GET(
    new Request('https://example.test/version.json', {
      headers: { Origin: `chrome-extension://${'a'.repeat(32)}` },
    }),
  );
  expect(await response.json()).toMatchObject({ sha256: null, bytes: null });
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
});
