import {
  ChannelLoginSchema,
  CROWD_LIMITS,
  SessionRequestSchema,
  TimelineRangeSchema,
  verifyOwnerToken,
  RatingRequestSchema,
} from '@laughline/shared';
import { Hono } from 'hono';
import { issueToken } from './auth';
import { allowedOrigin, type Env, enabled } from './env';
import { ratingHash, RatingRateLimit } from './ratings';

export { ChannelCrowd } from './room';
export { ChannelRatings } from './ratings';

const app = new Hono<{ Bindings: Env }>();
const ratingRate = new RatingRateLimit();
app.onError(() => Response.json({ error: 'unavailable' }, { status: 503 }));
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') ?? null;
  c.header('Cache-Control', 'no-store');
  if (c.req.path === '/health') return next();
  if (
    !origin &&
    c.req.method === 'GET' &&
    /^\/v1\/channels\/[a-z0-9_]{1,25}\/(timeline|ratings)$/.test(c.req.path)
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
app.post('/v1/ratings', async (c) => {
  if (
    !c.env.EXTENSION_ORIGINS.split(',')
      .map((s) => s.trim())
      .includes(c.req.header('Origin') ?? '')
  )
    return c.json({ error: 'origin denied' }, 403);
  const token = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(
    c.req.header('Authorization') ?? '',
  )?.[1];
  if (!token) return c.json({ error: 'anonymous install token required' }, 401);
  const install = await ratingHash(c.env.HMAC_KEY, token, 'rate-install');
  const ip = await ratingHash(
    c.env.HMAC_KEY,
    c.req.header('CF-Connecting-IP') ?? 'unknown',
    'rate-ip',
  );
  if (!ratingRate.allow(install, 12) || !ratingRate.allow(ip, 60))
    return c.json({ error: 'try again in a minute' }, 429);
  const reader = c.req.raw.body?.getReader();
  let text = '',
    bytes = 0;
  if (reader)
    try {
      const decoder = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      });
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          return c.json({ error: 'invalid rating' }, 413);
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } catch {
      return c.json({ error: 'invalid rating' }, 400);
    } finally {
      reader.releaseLock();
    }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return c.json({ error: 'invalid rating' }, 400);
  }
  const parsed = RatingRequestSchema.safeParse(value);
  if (!parsed.success) return c.json({ error: 'invalid rating' }, 400);
  const r = parsed.data;
  const response = await c.env.RATINGS.get(
    c.env.RATINGS.idFromName(r.channel),
  ).fetch(
    new Request('https://ratings.internal/write', {
      method: 'POST',
      headers: {
        'X-Ratings-Write': 'authorized',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rating: r,
        hash: await ratingHash(c.env.HMAC_KEY, token, r.streamKey),
      }),
    }),
  );
  return c.body(
    null,
    response.status === 204 ? 204 : response.status === 409 ? 409 : 400,
  );
});
app.get('/v1/channels/:login/ratings', async (c) => {
  const channel = ChannelLoginSchema.safeParse(c.req.param('login'));
  const auth = c.req.header('Authorization');
  if (
    !channel.success ||
    !auth?.startsWith('Bearer ') ||
    !(await verifyOwnerToken(
      c.env.WORKER_OWNER_KEY,
      auth.slice(7),
      channel.data,
    ))
  )
    return c.json({ error: 'owner authorization required' }, 403);
  const response = await c.env.RATINGS.get(
    c.env.RATINGS.idFromName(channel.data),
  ).fetch(
    new Request('https://ratings.internal/read', {
      headers: { 'X-Ratings-Owner': 'authorized' },
    }),
  );
  const data = await response.json<{ streams: unknown[]; trend: unknown[] }>();
  return c.json({ channel: channel.data, ...data });
});
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
