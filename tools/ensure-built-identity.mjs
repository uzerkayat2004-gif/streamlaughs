import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (
  !existsSync(
    new URL(
      '../apps/extension/.output/chrome-mv3/manifest.json',
      import.meta.url,
    ),
  )
) {
  if (!process.env.npm_execpath)
    throw new Error(
      'Run pnpm --filter extension build before testing the built identity.',
    );
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, '--filter', 'extension', 'build'],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
