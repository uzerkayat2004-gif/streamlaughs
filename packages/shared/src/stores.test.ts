import { expect, it } from 'vitest';
import { PRODUCT } from './product';
import { storeBehind, storeBrowser, storeChoice } from './stores';

it.each([
  'Chrome/130',
  'Brave/130',
  'OPR/100 Chrome/130',
  'Arc/1 Chrome/130',
  'Comet/1 Chrome/130',
  'Chromium/130',
])('sends desktop Chromium %s to Chrome', (userAgent) => {
  expect(storeBrowser({ userAgent })).toBe('chrome');
  expect(storeChoice('chrome').url).toBe(PRODUCT.chromeStoreUrl);
});
it('prefers feature brands and handles Edge before Chrome', () => {
  expect(
    storeBrowser({
      userAgent: 'Chrome/130',
      userAgentData: {
        brands: [
          { brand: 'Microsoft Edge', version: '130' },
          { brand: 'Chromium', version: '130' },
        ],
      },
    }),
  ).toBe('edge');
  expect(storeBrowser({ userAgent: 'Chrome/130 Edg/130' })).toBe('edge');
  expect(storeChoice('edge').url).toBe(PRODUCT.edgeStoreUrl);
});
it.each([
  { userAgent: 'Firefox/140' },
  { userAgent: 'Version/18 Safari/605' },
  { userAgent: 'Android Chrome/130' },
  { userAgent: 'iPad Safari/605' },
  { userAgent: 'Macintosh Safari/605', maxTouchPoints: 5 },
  { userAgent: 'Chrome/130', userAgentData: { mobile: true } },
])('offers desktop guidance for unsupported/mobile hints', (hints) =>
  expect(storeBrowser(hints)).toBe('unsupported'),
);
it('does not block unknown browsers, and ignores greased UA brands', () => {
  expect(storeBrowser({})).toBe('unknown');
  expect(
    storeBrowser({
      userAgentData: { brands: [{ brand: 'Not A Brand', version: '99' }] },
    }),
  ).toBe('unknown');
});
it('compares store approval numerically and removes the note once approved', () => {
  expect(storeBehind('0.8.6', '0.6.4')).toBe(true);
  expect(storeBehind('0.10.0', '0.9.9')).toBe(true);
  expect(storeBehind('0.8.6', '0.8.6')).toBe(false);
  expect(storeBehind('0.8.6', '0.9.0')).toBe(false);
  expect(storeBehind('bad', '0.6.4')).toBe(false);
});
