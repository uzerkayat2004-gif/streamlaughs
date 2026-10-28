import { DurableObject } from 'cloudflare:workers';
import {
  type AnonymousClaims,
  AnonymousClaimsSchema,
  ChannelLoginSchema,
  CrowdContributionSchema,
  CrowdMinuteSchema,
  CROWD_LIMITS as L,
  TimelineRangeSchema,
} from '@laughline/shared';
import { ChannelAggregation, MemoryRateLimit } from './aggregation';
import { socketToken, verifyToken } from './auth';
import { type Env, enabled } from './env';

type Attachment = AnonymousClaims & { mode: 'watch' | 'share' };
export class ChannelCrowd extends DurableObject<Env> {
  private engine = new ChannelAggregation();
  private rate = new MemoryRateLimit();
  private connects = new MemoryRateLimit();
  private sockets = new Map<string, WebSocket>();
  private connectionRates = new WeakMap<WebSocket, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS minutes (minute INTEGER PRIMARY KEY, data TEXT NOT NULL)',
    );
    for (const ws of ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = this.attachment(ws);
      if (a) this.sockets.set(a.id, ws);
      else ws.close(1008, 'invalid connection');
    }
  }
  private attachment(ws: WebSocket): Attachment | null {
    const raw = ws.deserializeAttachment();
    if (!raw || !['watch', 'share'].includes(raw.mode)) return null;
    const parsed = AnonymousClaimsSchema.safeParse({
      v: raw.v,
      id: raw.id,
      channel: raw.channel,
      expiresAt: raw.expiresAt,
      testTraffic: raw.testTraffic,
    });
    return parsed.success ? { ...parsed.data, mode: raw.mode } : null;
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/timeline')) {
      if (request.headers.get('X-Laughline-Timeline') !== 'authorized')
        return new Response(null, { status: 403 });
      const range = TimelineRangeSchema.safeParse(
        Object.fromEntries(url.searchParams),
      );
      if (!range.success) return new Response(null, { status: 400 });
      const from = Math.max(range.data.from, Date.now() - L.retentionMs);
      const minutes = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM minutes WHERE minute >= ? AND minute < ? ORDER BY minute LIMIT 1440',
          from,
          range.data.to,
        )
        .toArray()
        .map((row) => CrowdMinuteSchema.parse(JSON.parse(row.data)));
      return Response.json({ minutes });
    }
    if (!enabled(this.env)) return new Response(null, { status: 503 });
    const channel = ChannelLoginSchema.safeParse(url.pathname.split('/')[3]);
    const token = socketToken(request),
      mode = url.searchParams.get('mode');
    if (!channel.success || !token || !['watch', 'share'].includes(mode ?? ''))
      return new Response(null, { status: 400 });
    const claims = await verifyToken(this.env.HMAC_KEY, token, channel.data);
    if (
      !claims ||
      (claims.testTraffic && this.env.ALLOW_TEST_TRAFFIC !== 'true')
    )
      return new Response(null, { status: 401 });
    const now = Date.now();
    if (
      !this.connects.allow(claims.id, now) ||
      this.ctx.getWebSockets().length >= L.sockets
    )
      return new Response(null, { status: 429 });
    const old = this.sockets.get(claims.id);
    if (old) {
      this.engine.remove(claims.id);
      old.close(1012, 'connection replaced');
    }
    const pair = new WebSocketPair(),
      client = pair[0],
      server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...claims, mode });
    this.sockets.set(claims.id, server);
    this.pruneExpired();
    this.send(server, this.engine.snapshot(now));
    await this.scheduleAlarm();
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': 'laughline.v1' },
    });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = this.attachment(ws),
      now = Date.now();
    if (!a || this.sockets.get(a.id) !== ws) return;
    if (!enabled(this.env) || a.expiresAt <= now) {
      ws.close(1008, 'session expired or disabled');
      return;
    }
    if (a.mode !== 'share') {
      ws.close(1008, 'receive only');
      return;
    }
    if (
      typeof message !== 'string' ||
      new TextEncoder().encode(message).length > L.payloadBytes
    ) {
      ws.close(1009, 'invalid message');
      return;
    }
    const previous = this.connectionRates.get(ws);
    if (
      (previous !== undefined && now - previous < L.rateMs) ||
      !this.rate.allow(a.id, now)
    ) {
      ws.close(1008, 'rate limited');
      return;
    }
    this.connectionRates.set(ws, now);
    try {
      const parsed = CrowdContributionSchema.safeParse(JSON.parse(message));
      if (!parsed.success) {
        ws.close(1008, 'invalid message');
        return;
      }
      if (!this.engine.accept(a.id, parsed.data, now, a.testTraffic)) {
        ws.close(1013, 'capacity');
        return;
      }
      if (!this.timer) this.tick();
    } catch {
      ws.close(1008, 'invalid message');
    }
  }
  webSocketClose(ws: WebSocket) {
    this.remove(ws);
  }
  webSocketError(ws: WebSocket) {
    this.remove(ws);
  }
  private remove(ws: WebSocket) {
    const a = this.attachment(ws);
    if (!a || this.sockets.get(a.id) !== ws) return;
    this.sockets.delete(a.id);
    this.engine.remove(a.id);
    this.broadcast();
    this.persistMinutes();
    void this.scheduleAlarm();
  }
  private send(ws: WebSocket, packet: unknown) {
    try {
      ws.send(JSON.stringify(packet));
      return true;
    } catch {
      const a = this.attachment(ws);
      if (a && this.sockets.get(a.id) === ws) {
        this.sockets.delete(a.id);
        this.engine.remove(a.id);
      }
      return false;
    }
  }
  private pruneExpired() {
    for (const [id, ws] of this.sockets) {
      const a = this.attachment(ws);
      if (!enabled(this.env) || !a || a.expiresAt <= Date.now()) {
        this.sockets.delete(id);
        this.engine.remove(id);
        ws.close(1008, 'session expired or disabled');
      }
    }
  }
  private broadcast() {
    this.pruneExpired();
    let packet = this.engine.tick(Date.now());
    for (const ws of this.sockets.values())
      if (!this.send(ws, packet)) packet = this.engine.snapshot(Date.now());
  }
  private tick() {
    this.timer = undefined;
    this.broadcast();
    const wrote = this.persistMinutes();
    if (enabled(this.env) && this.engine.needsTick(Date.now()))
      this.timer = setTimeout(() => this.tick(), 1000);
    if (!this.timer || wrote) void this.scheduleAlarm();
  }
  private persistMinutes() {
    const rows = this.engine.takeMinutes();
    for (const row of rows)
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO minutes (minute, data) VALUES (?, ?)',
        row.minute,
        JSON.stringify(row),
      );
    return rows.length > 0;
  }
  private async scheduleAlarm() {
    const first = this.ctx.storage.sql
      .exec<{ minute: number }>(
        'SELECT minute FROM minutes ORDER BY minute LIMIT 1',
      )
      .toArray()[0];
    // Use indexed minimum; no per-viewer state is written to SQL or alarm storage.
    const earliest = first?.minute;
    const expiry =
      earliest === undefined ? Infinity : earliest + L.retentionMs + 1;
    const heartbeat =
      this.sockets.size && !this.timer
        ? Date.now() + L.fewKeepaliveMs
        : Infinity;
    const next = Math.min(expiry, heartbeat);
    if (Number.isFinite(next)) {
      const old = await this.ctx.storage.getAlarm();
      if (old === null || old < Date.now() || Math.abs(old - next) > 1000)
        await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    } else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    this.ctx.storage.sql.exec(
      'DELETE FROM minutes WHERE minute < ?',
      Date.now() - L.retentionMs,
    );
    this.broadcast();
    this.persistMinutes();
    await this.scheduleAlarm();
  }
}
