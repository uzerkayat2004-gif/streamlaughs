import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
  SELF,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import {
  CROWD_LIMITS,
  CrowdMinuteSchema,
  CrowdPacketSchema,
  issueOwnerToken,
  SessionResponseSchema,
} from '@laughline/shared';
import { afterEach, expect, it } from 'vitest';
import app from '../src/index';

const origin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const opened: WebSocket[] = [];
afterEach(async () => {
  for (const ws of opened.splice(0)) ws.close();
  await reset();
});
async function session(channel: string) {
  const response = await SELF.fetch('https://api.test/v1/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  expect(response.status).toBe(200);
  return SessionResponseSchema.parse(await response.json());
}
async function socket(channel: string, mode = 'watch', token?: string) {
  const auth = token ?? (await session(channel)).token;
  const response = await SELF.fetch(
    `https://api.test/v1/channels/${channel}/live?mode=${mode}`,
    {
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `laughline.v1, auth.${auth}`,
      },
    },
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const packets: unknown[] = [];
  ws.addEventListener('message', (e) => {
    packets.push(CrowdPacketSchema.parse(JSON.parse(String(e.data))));
  });
  ws.accept();
  opened.push(ws);
  return { ws, packets, token: auth };
}
const counts = JSON.stringify({
  laughing: 1,
  intensity: 2,
  scream: 0,
  gasp: 0,
  hype: 0,
  swears: 0,
  phrases: ['bro'],
});
it('admits ZIP and Edge store origins for sessions and sockets; rejects random origins', async () => {
  for (const extensionId of [
    'fkocldgggcmhihelohiicoakcfomhepg',
    'fkdfjgnhifofdjpbenlkhpfhmmhglmkb',
  ]) {
    const allowed = `chrome-extension://${extensionId}`;
    const response = await SELF.fetch('https://api.test/v1/session', {
      method: 'POST',
      headers: { Origin: allowed, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'store_origin' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowed);
    const { token } = SessionResponseSchema.parse(await response.json());
    const upgrade = await SELF.fetch(
      'https://api.test/v1/channels/store_origin/live?mode=watch',
      {
        headers: {
          Origin: allowed,
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': `laughline.v1, auth.${token}`,
        },
      },
    );
    expect(upgrade.status).toBe(101);
    upgrade.webSocket!.accept();
    opened.push(upgrade.webSocket!);
    const denied = await SELF.fetch(
      'https://api.test/v1/channels/store_origin/live?mode=watch',
      {
        headers: {
          Origin: 'https://random.example',
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': `laughline.v1, auth.${token}`,
        },
      },
    );
    expect(denied.status).toBe(403);
  }
  expect(
    (
      await SELF.fetch('https://api.test/v1/session', {
        method: 'POST',
        headers: {
          Origin: 'https://random.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: 'store_origin' }),
      })
    ).status,
  ).toBe(403);
});
it('caps actual channel connections at 200 without treating watchers as contributors', async () => {
  for (let i = 0; i < CROWD_LIMITS.sockets; i++) await socket('capacity');
  const auth = await session('capacity');
  const denied = await SELF.fetch(
    'https://api.test/v1/channels/capacity/live?mode=watch',
    {
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `laughline.v1, auth.${auth.token}`,
      },
    },
  );
  expect(denied.status).toBe(429);
  const stub = env.CHANNELS.get(env.CHANNELS.idFromName('capacity'));
  expect(
    await runInDurableObject(
      stub,
      (_room, state) => state.getWebSockets().length,
    ),
  ).toBe(200);
}, 30000);
it('runs Hono and SQLite Durable Object sockets with a server-enforced few → live transition', async () => {
  const watch = await socket('integration');
  const a = await socket('integration', 'share'),
    b = await socket('integration', 'share');
  a.ws.send(counts);
  b.ws.send(counts);
  await expect.poll(() => watch.packets.at(-1)).toEqual({ state: 'few' });
  const c = await socket('integration', 'share');
  c.ws.send(counts);
  await expect
    .poll(() => watch.packets.at(-1), { timeout: 5000 })
    .toMatchObject({
      state: 'live',
      sharing: 3,
      laughingNow: 3,
      bubbles: [{ text: 'bro', count: 3 }],
    });
  c.ws.close();
  await expect.poll(() => watch.packets.at(-1)).toEqual({ state: 'few' });
});
it('replaces a reconnecting identity without double counting and removes old live contributions', async () => {
  const a = await socket('reconnect', 'share');
  const b = await socket('reconnect', 'share');
  const c = await socket('reconnect', 'share');
  for (const s of [a, b, c]) s.ws.send(counts);
  // A broadcast runs once a second; allow a complete tick on a busy test host.
  await expect
    .poll(() => b.packets.at(-1), { timeout: 5000 })
    .toMatchObject({ sharing: 3 });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const replacement = await socket('reconnect', 'share', a.token);
  replacement.ws.send(counts);
  await expect
    .poll(() => replacement.packets.at(-1), { timeout: 5000 })
    .toMatchObject({
      sharing: 3,
      laughingNow: 3,
      bubbles: [{ text: 'bro', count: 3 }],
    });
  const stub = env.CHANNELS.get(env.CHANNELS.idFromName('reconnect'));
  expect(
    await runInDurableObject(
      stub,
      (_room, state) =>
        state
          .getWebSockets()
          .filter((ws) => !ws.readyState || ws.readyState === 1).length,
    ),
  ).toBeLessThanOrEqual(3);
});
it('rejects watch sends, rapid sends, binary, oversized and extra-field messages before aggregation', async () => {
  for (const [index, mode, payload] of [
    [0, 'watch', counts],
    [1, 'share', new ArrayBuffer(10)],
    [2, 'share', 'x'.repeat(513)],
    [
      3,
      'share',
      JSON.stringify({ ...JSON.parse(counts), transcript: 'private' }),
    ],
  ] as const) {
    const s = await socket(`invalid${index}`, mode);
    let closed = false;
    s.ws.addEventListener('close', () => {
      closed = true;
    });
    s.ws.send(payload);
    await expect.poll(() => closed).toBe(true);
    expect(
      s.packets.every((p) => JSON.stringify(p) === '{"state":"few"}'),
    ).toBe(true);
  }
  const rapid = await socket('rate', 'share');
  let code = 0;
  rapid.ws.addEventListener('close', (e) => {
    code = e.code;
  });
  rapid.ws.send(counts);
  rapid.ws.send(counts);
  await expect.poll(() => code).toBe(1008);
});
it('cleans expired SQLite minute rows by alarm, preserves recent aggregates, and authorizes bounded reads', async () => {
  const stub = env.CHANNELS.get(env.CHANNELS.idFromName('retention'));
  const recent = Math.floor(Date.now() / 60000) * 60000 - 60000;
  const expired =
    Math.floor((Date.now() - CROWD_LIMITS.retentionMs - 60000) / 60000) * 60000;
  const row = CrowdMinuteSchema.parse({
    minute: recent,
    contributors: 3,
    peakLaughingNow: 2,
    averageLaughPercent: 67,
    phrases: [{ text: 'bro', count: 3 }],
    hype: 1,
    testTraffic: false,
    moments: [],
  });
  await runInDurableObject(stub, async (_room, state) => {
    for (const minute of [recent, expired])
      state.storage.sql.exec(
        'INSERT INTO minutes (minute,data) VALUES (?,?)',
        minute,
        JSON.stringify({ ...row, minute }),
      );
    await state.storage.setAlarm(Date.now() + 1000);
  });
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(
    await runInDurableObject(stub, (_room, state) =>
      state.storage.sql.exec('SELECT minute FROM minutes').toArray(),
    ),
  ).toEqual([{ minute: recent }]);
  const headers = {
    Origin: origin,
    Authorization: `Bearer ${await issueOwnerToken(env.WORKER_OWNER_KEY!, 'retention', '123')}`,
  };
  const response = await SELF.fetch(
    `https://api.test/v1/channels/retention/timeline?from=${recent}&to=${recent + 60000}`,
    { headers },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    channel: 'retention',
    minutes: [row],
  });
  expect(
    (
      await SELF.fetch(
        'https://api.test/v1/channels/retention/timeline?from=0&to=999999999',
        { headers },
      )
    ).status,
  ).toBe(400);
});
it('fails closed on kill switch and rejects oversize streamed session bodies', async () => {
  expect(
    (
      await app.fetch(
        new Request('https://api.test/v1/session', {
          method: 'POST',
          headers: { Origin: origin },
          body: '{"channel":"demo"}',
        }),
        { ...env, CROWD_ENABLED: 'false' },
      )
    ).status,
  ).toBe(503);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(513)));
      controller.close();
    },
  });
  expect(
    (
      await SELF.fetch('https://api.test/v1/session', {
        method: 'POST',
        headers: { Origin: origin },
        body,
      })
    ).status,
  ).toBe(413);
});
it('accepts channel-bound server owner tokens without CORS spoofing and denies viewer/legacy/cross-channel tokens', async () => {
  const url = 'https://api.test/v1/channels/owner/timeline?from=0&to=1000';
  const valid = await issueOwnerToken(env.WORKER_OWNER_KEY!, 'owner', '123');
  expect(
    (await SELF.fetch(url, { headers: { Authorization: `Bearer ${valid}` } }))
      .status,
  ).toBe(200);
  for (const token of [
    (await session('owner')).token,
    'local-development-only-timeline-key-000000000000000000',
    await issueOwnerToken(env.WORKER_OWNER_KEY!, 'other', '123'),
  ])
    expect(
      (await SELF.fetch(url, { headers: { Authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(403);
});
it('keeps a receive-only WebSocket alive across actual hibernation eviction and an alarm wake', async () => {
  const watch = await socket('hibernate');
  const stub = env.CHANNELS.get(env.CHANNELS.idFromName('hibernate'));
  await evictDurableObject(stub);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await expect.poll(() => watch.packets.length).toBeGreaterThan(1);
  expect(watch.packets.at(-1)).toEqual({ state: 'few' });
  const metadata = await runInDurableObject(stub, (_room, state) =>
    state.getWebSockets()[0]!.deserializeAttachment(),
  );
  expect(metadata.mode).toBe('watch');
  expect(metadata.token).toBeUndefined();
});
it('denies timeline access to anonymous viewers and enforces origin/body boundaries', async () => {
  expect(
    (
      await SELF.fetch('https://api.test/v1/session', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await SELF.fetch('https://api.test/v1/session', {
        method: 'POST',
        headers: { Origin: origin },
        body: JSON.stringify({ channel: 'test', transcript: 'private' }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await SELF.fetch(
        'https://api.test/v1/channels/test/timeline?from=0&to=1000',
        { headers: { Origin: origin } },
      )
    ).status,
  ).toBe(403);
});
