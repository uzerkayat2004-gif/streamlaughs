import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readProduct, releaseConfig, root } from './release/config.mjs';
import { publishDownload } from './release/web-download.mjs';

const product = readProduct();
const publicEnv = {
  ...process.env,
  SITE_URL: process.env.SITE_URL || product.siteUrl,
  VITE_CROWD_API_URL:
    process.env.VITE_CROWD_API_URL || process.env.WORKER_API_URL || '',
  NEXT_TELEMETRY_DISABLED: '1',
};
releaseConfig(product, publicEnv);
// The extension build needs only public configuration, never server credentials.
for (const key of [
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'SESSION_SECRET',
  'HMAC_KEY',
  'WORKER_OWNER_KEY',
  'EXTENSION_KEY_PATH',
])
  delete publicEnv[key];
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run through pnpm --filter web build');
const run = (args, cwd = root, env = publicEnv) =>
  execFileSync(process.execPath, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
for (const task of ['build', 'build:edge'])
  run([pnpm, '--filter', 'extension', task]);
run([pnpm, 'release:zip']);
const assets = path.join(root, 'releases/production');
const config = releaseConfig(product, publicEnv);
const metadata = publishDownload({
  chrome: path.join(assets, `${config.slug}-chrome-v${product.version}.zip`),
  edge: path.join(assets, `${config.slug}-edge-v${product.version}.zip`),
  directory: path.join(root, 'apps/web/public/downloads'),
  product,
});
console.log(
  `Universal download: ${metadata.bytes} bytes; SHA-256 ${metadata.sha256}`,
);
run(
  [path.join(root, 'tools/next-local.mjs'), 'build', '--webpack'],
  path.join(root, 'apps/web'),
  process.env,
);
run([path.join(root, 'tools/release/branding.mjs'), '--website']);
