import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(
  new URL('../workers/api/package.json', import.meta.url),
);
const packagePath = require.resolve('wrangler/package.json');
const cli = path.resolve(
  path.dirname(packagePath),
  JSON.parse(readFileSync(packagePath, 'utf8')).bin.wrangler,
);
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
