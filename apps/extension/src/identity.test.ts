import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRODUCT } from '@laughline/shared';
import { expect, it } from 'vitest';
import {
  checkManifest,
  extensionId,
} from '../../../tools/check-extension-identity.mjs';
import { verifyProduction } from '../../../tools/release/verify-production.mjs';
import identity from '../extension-identity.json';

it('keeps the public-key identity fixed and rejects missing or swapped built keys', () => {
  expect(extensionId(identity.publicKey)).toBe(
    'fkocldgggcmhihelohiicoakcfomhepg',
  );
  expect(() =>
    checkManifest({ key: identity.publicKey }, identity),
  ).not.toThrow();
  expect(() => checkManifest({}, identity)).toThrow('fixed public key');
  expect(identity).not.toHaveProperty('privateKey');
});
it('the built Chrome manifest has the fixed key and expected ID', () => {
  const manifest = JSON.parse(
    readFileSync('.output/chrome-mv3/manifest.json', 'utf8'),
  );
  expect(() => checkManifest(manifest, identity)).not.toThrow();
  expect(manifest.name).toBe(PRODUCT.name);
  expect(manifest.action.default_title).toBe(PRODUCT.name);
  expect(manifest.description).toContain(PRODUCT.name);
  expect(manifest.description).toContain(PRODUCT.pitch);
  expect(JSON.stringify(manifest)).not.toMatch(/laughline|__PRODUCT_NAME__/i);
});
it('the actual production build has no debug page, simulator or reference controls', () => {
  expect(() => verifyProduction('.output/chrome-mv3')).not.toThrow();
}, 30000);
it('rejects a stale content script even when the manifest version and key are current', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'streamlaughs-stale-ui-'));
  const manifest = JSON.parse(
    readFileSync('.output/chrome-mv3/manifest.json', 'utf8'),
  );
  manifest.content_scripts = [
    { matches: ['https://www.twitch.tv/*'], js: ['old.js'] },
  ];
  writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest),
  );
  writeFileSync(
    path.join(directory, 'old.js'),
    'const oldUi="green blob, red stop button";',
  );
  expect(() => verifyProduction(directory)).toThrow('Stale Twitch UI bundle');
});
