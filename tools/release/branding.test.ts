import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  assertPublicBrand,
  checkBrandSources,
  checkWebsiteBrand,
} from './branding.mjs';

it('rejects old public names and asset names, while allowing only documented internal tokens', () => {
  for (const value of [
    'welcome to LaughLine',
    'laughline-chrome-v0.6.0.zip',
    '<title>laughline</title>',
  ])
    expect(() => assertPublicBrand(value, 'public title', false)).toThrow(
      'Old public branding',
    );
  expect(() =>
    assertPublicBrand('laughline.v1 laughline:state laughline-web', 'protocol'),
  ).not.toThrow();
  expect(() =>
    assertPublicBrand('say hello to laughline', 'component.tsx'),
  ).toThrow();
  expect(() =>
    assertPublicBrand("new Dexie('laughline')", 'apps/extension/src/db.ts'),
  ).not.toThrow();
  expect(() =>
    assertPublicBrand("new Dexie('laughline')", 'component.tsx'),
  ).toThrow();
});
it('every current application and documentation source is free of the previous public branding', () => {
  expect(() => checkBrandSources()).not.toThrow();
  const build = mkdtempSync(path.join(os.tmpdir(), 'website-brand-'));
  mkdirSync(path.join(build, 'server/app'), { recursive: true });
  const html = path.join(build, 'server/app/index.html');
  writeFileSync(html, '<h1>streamlaughs</h1>');
  expect(() => checkWebsiteBrand(build)).not.toThrow();
  writeFileSync(html, '<h1>LaughLine</h1>');
  expect(() => checkWebsiteBrand(build)).toThrow('Old public branding');
});
it('checks adapter output after Vercel relocates prerendered HTML', () => {
  const build = mkdtempSync(path.join(os.tmpdir(), 'website-adapter-brand-'));
  const output = path.join(build, '.vercel/output');
  mkdirSync(path.join(output, 'static'), { recursive: true });
  writeFileSync(path.join(output, 'config.json'), '{"version":3}');
  const html = path.join(output, 'static/index.html');
  writeFileSync(html, '<h1>streamlaughs</h1>');
  expect(() => checkWebsiteBrand(path.join(build, '.next'))).not.toThrow();
  writeFileSync(html, '<h1>LaughLine</h1>');
  expect(() => checkWebsiteBrand(path.join(build, '.next'))).toThrow(
    'Old public branding',
  );
});
