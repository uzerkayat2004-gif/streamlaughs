import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root } from './config.mjs';

assert(process.env.npm_execpath, 'Run pnpm release:preview');
const env = { ...process.env, OFFLINE_PREVIEW: 'true' };
for (const script of ['build', 'build:edge']) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, '--filter', 'extension', script],
    { cwd: root, env, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const result = spawnSync(
  process.execPath,
  [path.join(root, 'tools/release/pack.mjs'), '--offline-preview'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true },
);
process.exit(result.status ?? 1);
