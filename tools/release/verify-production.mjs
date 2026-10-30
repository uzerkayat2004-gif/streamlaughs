import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkManifest } from '../check-extension-identity.mjs';
import { assertPublicBrand } from './branding.mjs';
import { readProduct, root } from './config.mjs';

const identity = JSON.parse(
  readFileSync(
    path.join(root, 'apps/extension/extension-identity.json'),
    'utf8',
  ),
);
export function verifyProduction(directory, product = readProduct(), origins) {
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'manifest.json'), 'utf8'),
  );
  checkManifest(manifest, identity);
  assertPublicBrand(JSON.stringify(manifest), 'built manifest', false);
  assert.equal(manifest.version, product.version, 'Stale built version');
  assert.equal(manifest.name, product.name, 'Stale built product name');
  assert.equal(
    manifest.action?.default_title,
    product.name,
    'Stale toolbar title',
  );
  assert(manifest.description?.includes(product.pitch), 'Stale manifest pitch');
  assert.deepEqual(manifest.permissions, [
    'storage',
    'tabs',
    'tabCapture',
    'offscreen',
    'downloads',
    'scripting',
  ]);
  assert.deepEqual(manifest.host_permissions, ['https://www.twitch.tv/*']);
  const contentScripts = (manifest.content_scripts ?? []).flatMap(
    (entry) => entry.js ?? [],
  );
  const content = contentScripts
    .map((file) => readFileSync(path.join(directory, file), 'utf8'))
    .join('\n');
  assert(
    content.includes('glass-v080') && content.includes('glass-launcher'),
    'Stale Twitch UI bundle; rebuild the content script',
  );
  const connections = manifest.content_security_policy.extension_pages
    .match(/connect-src ([^;]+);/)[1]
    .split(/\s+/);
  if (origins)
    assert.deepEqual(
      new Set(connections),
      new Set([
        "'self'",
        ...[origins.site, origins.api, origins.api?.replace(/^http/, 'ws')]
          .filter(Boolean)
          .map((value) => new URL(value).origin),
      ]),
      'Built public origins differ from release configuration',
    );
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'No symlinks in a release');
      assert(
        !/^\.|debug|switcher|simulation|\.(pem|key|p12|pfx|map|log)$/i.test(
          entry.name,
        ),
        `Development/private artifact: ${entry.name}`,
      );
      const file = path.join(folder, entry.name);
      assert(
        entry.name.toLowerCase() !== 'manifest.json' ||
          file === path.join(directory, 'manifest.json'),
        'Only the root manifest.json may be packaged',
      );
      if (entry.isDirectory()) walk(file);
      else if (/\.(html|js|mjs|json)$/.test(entry.name)) {
        const text = readFileSync(file, 'utf8');
        assertPublicBrand(text, file);
        if (entry.name === 'background.js')
          assert(
            !text.includes('ui-test'),
            'Test-only crowd factory in production',
          );
        assert(
          !text.includes('-----BEGIN PRIVATE KEY-----') &&
            !text.includes('-----BEGIN RSA PRIVATE KEY-----'),
          'Private key content in release',
        );
        assert(
          !/data-screen=|className:["'](?:switcher|sim)["']|aria-label=["']simulate["']|test microphone|audio debug is disabled/i.test(
            text,
          ),
          `Reference/debug controls: ${entry.name}`,
        );
      }
    }
  };
  walk(directory);
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const target of process.argv.slice(2)) {
    verifyProduction(path.resolve(target));
    console.log(
      `Production controls, version and fixed ID verified: ${target}`,
    );
  }
}
