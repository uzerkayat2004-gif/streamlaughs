import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';

export function options(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      api: { type: 'string', default: 'http://127.0.0.1:8787' },
      origin: {
        type: 'string',
        default: process.env.CROWD_EXTENSION_ORIGIN ?? '',
      },
      channel: { type: 'string' },
      viewers: { type: 'string', default: '25' },
      script: { type: 'string', default: 'funny' },
      duration: { type: 'string', default: '120' },
      'allow-prod': { type: 'boolean', default: false },
    },
  });
  const api = new URL(values.api);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  const dev = process.env.CROWD_SIM_DEV_ORIGIN === api.origin;
  if (
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash ||
    !['http:', 'https:'].includes(api.protocol)
  )
    throw new Error('API must be an HTTP(S) origin.');
  if (!local && !dev && !values['allow-prod'])
    throw new Error(
      'Remote traffic requires CROWD_SIM_DEV_ORIGIN or --allow-prod.',
    );
  if (!local && api.protocol !== 'https:')
    throw new Error('Remote API requires HTTPS.');
  if (!/^[a-z0-9_]{1,25}$/.test(values.channel ?? ''))
    throw new Error('Use a lowercase Twitch channel login.');
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(values.origin))
    throw new Error(
      'Set --origin to the allowed chrome-extension:// ID (Edge uses this scheme too).',
    );
  const viewers = Number(values.viewers),
    duration = Number(values.duration);
  if (
    !Number.isInteger(viewers) ||
    viewers < 1 ||
    viewers > 200 ||
    !Number.isInteger(duration) ||
    duration < 2 ||
    duration > 7200 ||
    values.script !== 'funny'
  )
    throw new Error('Use 1–200 viewers, 2–7200 seconds and --script funny.');
  return {
    api: api.origin,
    origin: values.origin,
    channel: values.channel,
    viewers,
    duration,
  };
}
export function wave(tick, index, viewers = 25) {
  const engagement = [0.35, 0.65, 1, 0.55][Math.floor(tick / 30) % 4];
  const laughing =
    index < Math.ceil(viewers * engagement) &&
    tick % 8 < 5 &&
    (index + tick) % 5 !== 4
      ? 1
      : 0;
  return {
    laughing,
    intensity: laughing ? 2 : 0,
    scream: 0,
    gasp: 0,
    hype: tick % 8 === 0 ? 1 : 0,
    swears: 0,
    phrases: [tick % 16 < 8 ? 'bro' : 'no way'],
  };
}
export async function simulate(config) {
  const sockets = [],
    timers = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const t of timers) clearInterval(t);
    for (const ws of sockets) ws.close();
  };
  try {
    for (let i = 0; i < config.viewers && !stopped; i++) {
      const response = await fetch(`${config.api}/v1/session`, {
        method: 'POST',
        headers: { Origin: config.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: config.channel, testTraffic: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          `Session refused (${response.status}); enable ALLOW_TEST_TRAFFIC in your local/dev environment.`,
        );
      const { token } = await response.json();
      const ws = new WebSocket(
        `${config.api.replace(/^http/, 'ws')}/v1/channels/${config.channel}/live?mode=share`,
        ['laughline.v1', `auth.${token}`],
        { origin: config.origin },
      );
      sockets.push(ws);
      ws.on('error', () => {});
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', () =>
          reject(new Error('Simulator connection refused.')),
        );
      });
      let tick = 0;
      const send = () => {
        if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 512)
          ws.send(JSON.stringify(wave(tick++, i, config.viewers)));
      };
      send();
      timers.push(setInterval(send, 2000));
    }
    // No bearer tokens, protocol headers or contribution payloads in logs.
    console.log(
      `TEST TRAFFIC: ${config.viewers} simulated contributors on ${config.channel} via the real API.`,
    );
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        process.off('SIGINT', done);
        process.off('SIGTERM', done);
        resolve();
      };
      const timer = setTimeout(done, config.duration * 1000);
      process.once('SIGINT', done);
      process.once('SIGTERM', done);
    });
  } finally {
    stop();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await simulate(options());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Simulator failed.');
    process.exitCode = 1;
  }
}
