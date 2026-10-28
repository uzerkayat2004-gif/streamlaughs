import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import identity from '../../apps/extension/extension-identity.json' with {
  type: 'json',
};
import { simulate } from './cli.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)),
  api = 'http://127.0.0.1:8788',
  channel = 'demo_channel';
const ownerKey = 'local-development-only-owner-key-00000000000000000000';
const wrangler = spawn(
  process.execPath,
  [
    path.join(root, 'tools/wrangler-local.mjs'),
    'dev',
    '--env',
    'dev',
    '--port',
    '8788',
    '--ip',
    '127.0.0.1',
    '--log-level',
    'error',
    '--var',
    `WORKER_OWNER_KEY:${ownerKey}`,
    '--var',
    'HMAC_KEY:local-development-only-demo-key-00000000000000000000000',
    '--persist-to',
    path.join(root, '.test-runtime/demo'),
  ],
  {
    cwd: path.join(root, 'workers/api'),
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  },
);
let watch;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await (await fetch(`${api}/health`)).json()).crowdEnabled;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready)
    throw new Error('Local Wrangler did not start. Leave port 8788 free.');
  const origin = `chrome-extension://${identity.id}`;
  const auth = await (
    await fetch(`${api}/v1/session`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
  ).json();
  watch = new WebSocket(
    `${api.replace('http', 'ws')}/v1/channels/${channel}/live?mode=watch`,
    ['laughline.v1', `auth.${auth.token}`],
    { origin },
  );
  let live = null;
  watch.on('message', (message) => {
    const packet = JSON.parse(String(message));
    if (packet.state === 'live') live = packet;
  });
  watch.on('error', () => {});
  console.log(
    'Recording aggregate demo through local Wrangler and 25 real API simulator clients (four minutes; no audio).',
  );
  const start = Date.now();
  await simulate({ api, origin, channel, viewers: 25, duration: 245 });
  const now = Date.now(),
    body = Buffer.from(
      JSON.stringify({
        v: 1,
        iss: 'laughline-web',
        aud: 'crowd-timeline',
        channel,
        sub: '1',
        issuedAt: now,
        expiresAt: now + 60000,
      }),
    ).toString('base64url');
  const signed = `${body}.${createHmac('sha256', ownerKey).update(body).digest('base64url')}`;
  const response = await fetch(
    `${api}/v1/channels/${channel}/timeline?from=${start - 60000}&to=${now}`,
    { headers: { Authorization: `Bearer ${signed}` } },
  );
  if (!response.ok)
    throw new Error(`Aggregate read failed (${response.status}).`);
  const { minutes } = await response.json();
  if (!minutes.length || !live)
    throw new Error('No eligible demo aggregates captured.');
  const target = path.join(root, 'apps/web/data/crowd-sim.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify(
      {
        generatedBy: 'local Wrangler + crowd-sim',
        capturedAt: new Date().toISOString(),
        channel,
        viewers: 25,
        script: 'funny',
        minutes,
        live,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Captured ${minutes.length} floored test minutes; no viewer IDs or bearer tokens saved.`,
  );
} finally {
  watch?.close();
  if (wrangler.pid && wrangler.exitCode === null) {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(wrangler.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {}
    } else wrangler.kill('SIGTERM');
  }
}
