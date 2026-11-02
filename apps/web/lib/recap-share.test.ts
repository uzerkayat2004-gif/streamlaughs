import {
  PRODUCT,
  parseRecapShare,
  recapShareParams,
  recapShareUrl,
} from '@laughline/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../app/r/image/route';
import Page from '../app/r/page';
import config from '../next.config';
import { recapMetadata } from './recap-share';

const valid =
  'streamer=vernofps&date=2026-11-01&laughs=16&minutes=47&word=bro&funniest=no+way&moment=760&hype=4&stream=1';
afterEach(() => vi.unstubAllEnvs());
it('labels a replay and permits its media position to exceed elapsed watch duration', async () => {
  const params = new URLSearchParams(valid);
  params.set('replay', '1');
  params.set('minutes', '2');
  params.set('moment', '600');
  const data = parseRecapShare(params);
  expect(data?.replay).toBe('1');
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve(Object.fromEntries(params)) }),
  );
  expect(html).toContain('watched a replay');
  expect(JSON.stringify(recapMetadata(data))).toContain('watched a replay');
  params.set('replay', 'evil');
  expect(parseRecapShare(params)).toBeNull();
});
it('round-trips only public bounded stats', () => {
  const data = parseRecapShare(new URLSearchParams(valid))!;
  expect(data).toEqual({
    streamer: 'vernofps',
    date: '2026-11-01',
    laughs: 16,
    minutes: 47,
    word: 'bro',
    funniest: 'no way',
    moment: 760,
    hype: 4,
    stream: 1,
  });
  expect(parseRecapShare(recapShareParams(data))).toEqual(data);
  expect(
    parseRecapShare({
      ...Object.fromEntries(new URLSearchParams(valid)),
      word: ['bro', 'wow'],
    }),
  ).toBeNull();
});
it.each([
  'laughs=-1',
  'laughs=1e3',
  'laughs=NaN',
  'laughs=1.2',
  'laughs=1000001',
  'minutes=10081',
  'word=<script>',
  'word=alice',
  'streamer=<b>',
  'date=2026-02-30',
  'date=2026-13-01',
  'stream=0',
  'moment=999999',
  'hype=0',
])('rejects invalid value %s', (entry) => {
  const p = new URLSearchParams(valid);
  const [key, value] = entry.split('=');
  p.set(key!, value!);
  expect(parseRecapShare(p)).toBeNull();
});
it.each([
  'token=secret',
  'origin=https://evil.example',
  'avatar=https://evil.example',
  '__proto__=evil',
  'word=wow',
  'extra=x'.repeat(300),
])('rejects unknown, duplicated and oversized fields: %s', (extra) => {
  expect(parseRecapShare(new URLSearchParams(`${valid}&${extra}`))).toBeNull();
});
it('uses configured SITE_URL for canonical/OG links; public stats never authorize private data or credentialed CORS', async () => {
  vi.stubEnv('SITE_URL', 'https://configured.example');
  const data = parseRecapShare(new URLSearchParams(valid))!;
  const m = recapMetadata(data);
  expect(m.alternates?.canonical).toBe(
    `https://configured.example/r?${recapShareParams(data)}`,
  );
  expect(JSON.stringify(m)).toContain('https://configured.example/r/image?');
  expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
  expect(() => recapShareUrl('https://user:pass@evil.example', data)).toThrow();
  expect(() => recapShareUrl('javascript:alert(1)', data)).toThrow();
  const response = await GET(
    new Request(
      `https://untrusted-host.example/r/image?${valid}&origin=https://evil.example`,
      { headers: { Origin: 'https://evil.example' } },
    ),
  );
  expect(response.status).toBe(400);
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  expect(response.headers.has('Set-Cookie')).toBe(false);
  const rules = await config.headers!();
  const recapRule = rules.find((r) => r.source === '/r/:path*')!;
  expect(recapRule.headers).toContainEqual({
    key: 'Referrer-Policy',
    value: 'no-referrer',
  });
  expect(recapRule.headers).toContainEqual({
    key: 'Cache-Control',
    value: 'private, no-store, max-age=0',
  });
  expect(
    recapRule.headers.some((h) => h.key.startsWith('Access-Control')),
  ).toBe(false);
});
it('renders /r from stats only and offers the browser store for new installs', async () => {
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve(
        Object.fromEntries(new URLSearchParams(valid)),
      ),
    }),
  );
  expect(html).toContain('16');
  expect(html).toContain('vernofps');
  expect(html).toContain('no way');
  expect(html).toContain(PRODUCT.chromeStoreUrl);
  expect(html).toContain(PRODUCT.edgeStoreUrl);
  expect(html).not.toMatch(/<script|github\.com|iframe/i);
});
it('renders a real 1200x630 PNG without a cookie, account lookup or external avatar', async () => {
  const response = await GET(
    new Request(`https://streamlaughs.vercel.app/r/image?${valid}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('image/png');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const png = Buffer.from(await response.arrayBuffer());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  expect(response.headers.has('Set-Cookie')).toBe(false);
}, 15000);
