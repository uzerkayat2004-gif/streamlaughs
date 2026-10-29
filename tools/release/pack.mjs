import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertPublicBrand } from './branding.mjs';
import { notes, readProduct, releaseConfig, root } from './config.mjs';
import { dependencyNotices } from './dependency-notices.mjs';
import { verifyProduction } from './verify-production.mjs';

const offline = process.argv.includes('--offline-preview');
const edgeStore = process.argv.includes('--edge-store');
assert(
  !(offline && edgeStore),
  'Store submissions require production configuration',
);
const environment =
  edgeStore && process.env.GITHUB_REF_TYPE !== 'tag'
    ? { ...process.env, GITHUB_REF_NAME: '' }
    : process.env;
const config = releaseConfig(readProduct(), environment, offline);
if (process.argv.includes('--check')) {
  console.log(
    `Release configuration matches v${config.version}; no publication performed.`,
  );
  process.exit();
}
const output = path.join(
  root,
  'releases',
  edgeStore ? 'edge-store' : offline ? 'offline-preview' : 'production',
);
mkdirSync(output, { recursive: true });
const pnpm = process.env.npm_execpath;
assert(
  pnpm,
  'Run this command through pnpm release:zip or pnpm release:preview',
);
const notices = dependencyNotices(
  [
    'apps/extension',
    'apps/web',
    'packages/shared',
    'workers/api',
    'tools/crowd-sim',
  ].map((folder) => path.join(root, folder)),
);
const noticePath = path.join(output, 'dependency-notices.txt'),
  notesPath = path.join(output, 'release-notes.md');
writeFileSync(noticePath, notices);
writeFileSync(notesPath, notes(config, offline));
const extras = {
  LICENSE: path.join(root, 'LICENSE'),
  'THIRD_PARTY_NOTICES.md': path.join(root, 'THIRD_PARTY_NOTICES.md'),
  'dependency-notices.txt': noticePath,
  'INSTALL.md': notesPath,
};
const extrasPath = path.join(output, 'pack-inputs.json');
writeFileSync(extrasPath, JSON.stringify(extras));
const sums = [];
for (const browser of edgeStore ? ['edge'] : ['chrome', 'edge']) {
  const source = path.join(root, `apps/extension/.output/${browser}-mv3`);
  verifyProduction(source, config, config);
  const filename = `${config.slug}-${browser}${edgeStore ? '-store' : ''}-v${config.version}.zip`;
  assertPublicBrand(filename, 'release asset name', false);
  const digest = execFileSync(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    [
      path.join(root, 'tools/release/pack.py'),
      source,
      path.join(output, filename),
      extrasPath,
      ...(edgeStore ? ['--edge-store'] : []),
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
  assert(/^[a-f0-9]{64}$/.test(digest));
  sums.push(`${digest}  ${filename}`);
  console.log(`Verified flat ${browser} ZIP: ${filename}`);
}
if (edgeStore) {
  writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  console.log(
    'Prepared Edge store CI artifact in releases/edge-store; no publication performed.',
  );
  process.exit();
}
assert.equal(
  sums[0].split(' ')[0],
  sums[1].split(' ')[0],
  'Browser packages differ; cannot merge',
);
for (const filename of [
  `${config.slug}.zip`,
  `${config.slug}-v${config.version}.zip`,
]) {
  copyFileSync(
    path.join(output, `${config.slug}-chrome-v${config.version}.zip`),
    path.join(output, filename),
  );
  sums.push(`${sums[0].split(' ')[0]}  ${filename}`);
}
writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(
  `Prepared ${offline ? 'OFFLINE PREVIEW' : 'production-configured'} assets in releases/${offline ? 'offline-preview' : 'production'}; no tag, release or deployment created.`,
);
