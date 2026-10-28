import {
  ChannelLoginSchema,
  CROWD_LIMITS,
  SessionRequestSchema,
  TimelineRangeSchema,
  verifyOwnerToken,
} from '@laughline/shared';
import { Hono } from 'hono';
import { issueToken } from './auth';
import { allowedOrigin, type Env, enabled } from './env';

export { ChannelCrowd } from './room';

const app = new Hono<{ Bindings: Env }>();
app.onError(() => Response.json({ error: 'unavailable' }, { status: 503 }));
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') ?? null;
  c.header('Cache-Control', 'no-store');
  if (c.req.path === '/health') return next();
  if (
    !origin &&
    c.req.method === 'GET' &&
    /^\/v1\/channels\/[a-z0-9_]{1,25}\/timeline$/.test(c.req.path)
  ) {
    if (!enabled(c.env)) return c.json({ error: 'unavailable' }, 503);
    return next();
  }
  if (!allowedOrigin(c.env, origin))
    return c.json({ error: 'origin denied' }, 403);
  c.header('Access-Control-Allow-Origin', origin!);
  c.header('Vary', 'Origin');
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return c.body(null, 204);
  }
  if (!enabled(c.env)) return c.json({ error: 'unavailable' }, 503);
  await next();
});
app.get('/health', (c) => c.json({ ok: true, crowdEnabled: enabled(c.env) }));
app.post('/v1/session', async (c) => {
  const declared = Number(c.req.header('Content-Length') ?? '0');
  if (declared > CROWD_LIMITS.payloadBytes)
    return c.json({ error: 'invalid body' }, 413);
  const reader = c.req.raw.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > CROWD_LIMITS.payloadBytes) {
          await reader.cancel();
          return c.json({ error: 'invalid body' }, 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: string;
  try {
    body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }
  const parsed = SessionRequestSchema.safeParse(json);
  if (
    !parsed.success ||
    (parsed.data.testTraffic && c.env.ALLOW_TEST_TRAFFIC !== 'true')
  )
    return c.json({ error: 'invalid body' }, 400);
  return c.json(
    await issueToken(
      c.env.HMAC_KEY,
      parsed.data.channel,
      parsed.data.testTraffic,
    ),
  );
});
app.get('/v1/channels/:login/live', async (c) => {
  const parsed = ChannelLoginSchema.safeParse(c.req.param('login'));
  if (!parsed.success || c.req.header('Upgrade')?.toLowerCase() !== 'websocket')
    return c.json({ error: 'invalid upgrade' }, 400);
  return c.env.CHANNELS.get(c.env.CHANNELS.idFromName(parsed.data)).fetch(
    c.req.raw,
  );
});
app.get('/v1/channels/:login/timeline', async (c) => {
  const channel = ChannelLoginSchema.safeParse(c.req.param('login')),
    range = TimelineRangeSchema.safeParse(c.req.query());
  if (!channel.success || !range.success)
    return c.json({ error: 'invalid range' }, 400);
  const auth = c.req.header('Authorization');
  if (
    !auth?.startsWith('Bearer ') ||
    !(await verifyOwnerToken(
      c.env.WORKER_OWNER_KEY,
      auth.slice(7),
      channel.data,
    ))
  )
    return c.json({ error: 'owner authorization required' }, 403);
  const headers = new Headers({ 'X-Laughline-Timeline': 'authorized' });
  const response = await c.env.CHANNELS.get(
    c.env.CHANNELS.idFromName(channel.data),
  ).fetch(new Request(c.req.url, { headers }));
  const result = await response.json<{ minutes: unknown[] }>();
  return c.json({ channel: channel.data, minutes: result.minutes });
});
export default app;
