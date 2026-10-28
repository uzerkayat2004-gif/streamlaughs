import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
