import { DurableObject } from 'cloudflare:workers';
import {
  RATING_DAY,
  RatingRequestSchema,
  ratingSummary,
  type RatingReason,
  type RatingResult,
} from '@laughline/shared';
import type { Env } from './env';

export async function ratingHash(
  secret: string,
  install: string,
  stream: string,
) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const value = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${install}\0${stream}`),
  );
  return [...new Uint8Array(value)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export class RatingRateLimit {
  private entries = new Map<string, { at: number; count: number }>();
  allow(key: string, limit: number, now = Date.now()) {
    for (const [id, row] of this.entries)
      if (now - row.at >= 60_000) this.entries.delete(id);
    const row = this.entries.get(key) ?? { at: now, count: 0 };
    if (this.entries.size >= 10000 && !this.entries.has(key)) return false;
    if (++row.count > limit) return false;
    this.entries.set(key, row);
    return true;
  }
}
type Aggregate = {
  stream: string;
  created: number;
  updated: number;
  count: number;
  sum: number;
  histogram: number[];
  reasons: Partial<Record<RatingReason, number>>;
};
type Dedupe = {
  hash: string;
  stream: string;
  score: number;
  reasons: RatingReason[];
  first: number;
  expires: number;
};
export function ratingResult(a: Aggregate): RatingResult {
  if (a.count < 5) return { locked: true, needed: 5 - a.count };
  return {
    locked: false,
    count: a.count,
    average: Math.round((a.sum / a.count) * 10) / 10,
    histogram: a.histogram,
    topReasons: Object.entries(a.reasons)
      .filter(([, n]) => n! > 0)
      .sort(([a, x], [b, y]) => y! - x! || a.localeCompare(b))
      .map(([id, n]) => ({
        id: id as RatingReason,
        count: n!,
        percent: Math.round((n! / a.count) * 100),
      })),
    summary: ratingSummary(a.count, a.reasons),
  };
}
export class ChannelRatings extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rating_streams (stream TEXT PRIMARY KEY, started INTEGER NOT NULL, data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rating_dedupe (hash TEXT PRIMARY KEY, stream TEXT NOT NULL, expires INTEGER NOT NULL, data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE INDEX IF NOT EXISTS rating_expiry ON rating_dedupe(expires)',
    );
  }
  private clean(now: number) {
    this.ctx.storage.sql.exec(
      'DELETE FROM rating_dedupe WHERE expires <= ?',
      now,
    );
  }
  async alarm() {
    this.clean(Date.now());
    await this.schedule();
  }
  private async schedule() {
    const next = this.ctx.storage.sql
      .exec<{ expires: number }>(
        'SELECT expires FROM rating_dedupe ORDER BY expires LIMIT 1',
      )
      .toArray()[0];
    if (next) await this.ctx.storage.setAlarm(next.expires);
    else await this.ctx.storage.deleteAlarm();
  }
  async fetch(request: Request) {
    const now = Date.now();
    this.clean(now);
    if (request.method === 'GET') {
      if (request.headers.get('X-Ratings-Owner') !== 'authorized')
        return new Response(null, { status: 403 });
      const streams = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM rating_streams ORDER BY started DESC, stream DESC LIMIT 30',
        )
        .toArray()
        .map(({ data }) => {
          const a: Aggregate = JSON.parse(data);
          return { streamKey: a.stream, rating: ratingResult(a) };
        });
      return Response.json({ streams, trend: streams.slice(0, 10).reverse() });
    }
    if (request.headers.get('X-Ratings-Write') !== 'authorized')
      return new Response(null, { status: 403 });
    const body = await request.json<{ rating: unknown; hash: string }>();
    const parsed = RatingRequestSchema.safeParse(body.rating);
    if (!parsed.success || !/^[a-f0-9]{64}$/.test(body.hash))
      return new Response(null, { status: 400 });
    const r = parsed.data;
    const status = this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM rating_dedupe WHERE hash = ?',
          body.hash,
        )
        .toArray()[0];
      const previous: Dedupe | undefined = existing
        ? JSON.parse(existing.data)
        : undefined;
      if (previous && now >= previous.first + RATING_DAY) return 409;
      const row = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM rating_streams WHERE stream = ?',
          r.streamKey,
        )
        .toArray()[0];
      const a: Aggregate = row
        ? JSON.parse(row.data)
        : {
            stream: r.streamKey,
            created: now,
            updated: now,
            count: 0,
            sum: 0,
            histogram: Array(10).fill(0),
            reasons: {},
          };
      // Close new submissions after 24 h. Together with 24 h edits this prevents
      // a deleted 48 h dedupe record being reused to count the same install again.
      if (!previous && now >= a.created + RATING_DAY) return 409;
      if (previous) {
        a.sum -= previous.score;
        a.histogram[previous.score - 1]!--;
        for (const id of previous.reasons)
          a.reasons[id] = Math.max(0, (a.reasons[id] ?? 0) - 1);
      } else a.count++;
      a.sum += r.score;
      a.histogram[r.score - 1]!++;
      a.updated = now;
      for (const id of r.reasons) a.reasons[id] = (a.reasons[id] ?? 0) + 1;
      const entry: Dedupe = {
        hash: body.hash,
        stream: r.streamKey,
        score: r.score,
        reasons: r.reasons,
        first: previous?.first ?? now,
        expires: previous?.expires ?? now + 2 * RATING_DAY,
      };
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO rating_streams VALUES (?, ?, ?)',
        r.streamKey,
        Date.parse(
          /^\d/.test(r.streamKey)
            ? r.streamKey
            : `${r.streamKey.slice(r.streamKey.indexOf(':') + 1)}T00:00:00Z`,
        ),
        JSON.stringify(a),
      );
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO rating_dedupe VALUES (?, ?, ?, ?)',
        body.hash,
        r.streamKey,
        entry.expires,
        JSON.stringify(entry),
      );
      const extra = this.ctx.storage.sql
        .exec<{ stream: string }>(
          'SELECT stream FROM rating_streams ORDER BY started DESC, stream DESC LIMIT -1 OFFSET 30',
        )
        .toArray();
      for (const { stream } of extra) {
        this.ctx.storage.sql.exec(
          'DELETE FROM rating_streams WHERE stream = ?',
          stream,
        );
        this.ctx.storage.sql.exec(
          'DELETE FROM rating_dedupe WHERE stream = ?',
          stream,
        );
      }
      return 204;
    });
    await this.schedule();
    return new Response(null, { status });
  }
}
