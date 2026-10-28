import {
  type CrowdContribution,
  CrowdContributionSchema,
  CrowdPacketSchema,
  type CrowdState,
  isCrowdPhrase,
  type PersonalEvent,
  SessionResponseSchema,
} from '@laughline/shared';
import type { CrowdSource } from './crowd-interface';
export class CrowdAccumulator {
  private laughingUntil = 0;
  private intensity = 0;
  private counts = { scream: 0, gasp: 0, hype: 0, swears: 0 };
  private phrases = new Map<string, number>();
  add(events: PersonalEvent[], now = Date.now()) {
    for (const event of events) {
      if (event.kind === 'laugh') {
        this.laughingUntil = now + 2000;
        this.intensity = Math.max(this.intensity, event.intensity);
      } else if (event.kind === 'words')
        for (const p of event.phrases) {
          if (p.class === 'swear')
            this.counts.swears = Math.min(3, this.counts.swears + p.count);
          else if (isCrowdPhrase(p.text))
            this.phrases.set(
              p.text,
              Math.min(3, (this.phrases.get(p.text) ?? 0) + p.count),
            );
        }
      else this.counts[event.kind] = Math.min(3, this.counts[event.kind] + 1);
    }
  }
  take(now = Date.now()): CrowdContribution {
    const laughing = this.laughingUntil > now ? 1 : 0;
    const result = CrowdContributionSchema.parse({
      laughing,
      intensity: laughing ? this.intensity : 0,
      ...this.counts,
      phrases: [...this.phrases]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([text]) => text),
    });
    this.counts = { scream: 0, gasp: 0, hype: 0, swears: 0 };
    this.phrases.clear();
    if (!laughing) this.intensity = 0;
    return result;
  }
  clear() {
    this.laughingUntil = 0;
    this.intensity = 0;
    this.counts = { scream: 0, gasp: 0, hype: 0, swears: 0 };
    this.phrases.clear();
  }
}
export class RealCrowdSource implements CrowdSource {
  private channel = '';
  private emit: ((state: CrowdState) => void) | null = null;
  private ws: WebSocket | null = null;
  private generation = 0;
  private sharing = false;
  private token: { token: string; expiresAt: number } | null = null;
  private abort: AbortController | null = null;
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private sender: ReturnType<typeof setInterval> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private accumulator = new CrowdAccumulator();
  private pending: { value: CrowdContribution; at: number } | null = null;
  private blockedSince: number | null = null;
  constructor(private api: string) {
    if (api) this.api = new URL(api).origin;
  }
  start(channel: string, emit: (state: CrowdState) => void) {
    this.stop();
    this.channel = channel;
    this.emit = emit;
    this.offline();
    if (this.api) void this.connect();
  }
  setSharing(enabled: boolean) {
    if (this.sharing === enabled) return;
    this.sharing = enabled;
    this.accumulator.clear();
    this.pending = null;
    this.blockedSince = null;
    clearInterval(this.sender);
    clearTimeout(this.reconnect);
    clearTimeout(this.deadline);
    this.generation++;
    this.abort?.abort();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.emit && this.api) {
      this.offline();
      this.reconnect = setTimeout(() => void this.connect(), 1050);
    }
  }
  addEvents(events: PersonalEvent[]) {
    if (this.sharing && this.emit && this.ws?.readyState === WebSocket.OPEN)
      this.accumulator.add(events);
  }
  private offline() {
    this.emit?.({
      channel: this.channel,
      laughingNow: 0,
      laughlineViewers: 0,
      topWords: [],
      updatedAt: Date.now(),
      source: 'offline',
      state: 'offline',
      testTraffic: false,
      laughPercent: 0,
    });
  }
  private async connect() {
    if (!this.emit) return;
    const generation = ++this.generation;
    try {
      this.abort = new AbortController();
      this.deadline = setTimeout(() => this.abort?.abort(), 10000);
      if (!this.token || this.token.expiresAt <= Date.now() + 30000) {
        const response = await fetch(`${this.api}/v1/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: this.channel }),
          credentials: 'omit',
          cache: 'no-store',
          signal: this.abort.signal,
        });
        if (!response.ok) throw new Error('crowd unavailable');
        const token = SessionResponseSchema.parse(await response.json());
        if (generation !== this.generation) return;
        this.token = token;
      }
      if (generation !== this.generation || !this.emit) return;
      clearTimeout(this.deadline);
      const mode = this.sharing ? 'share' : 'watch';
      const ws = new WebSocket(
        `${this.api.replace(/^http/, 'ws')}/v1/channels/${this.channel}/live?mode=${mode}`,
        ['laughline.v1', `auth.${this.token.token}`],
      );
      this.ws = ws;
      this.deadline = setTimeout(() => this.disconnected(ws), 10000);
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.attempt = 0;
        this.accumulator.clear();
        this.pending = null;
        clearTimeout(this.deadline);
        this.deadline = setTimeout(() => this.disconnected(ws), 35000);
        if (this.sharing) {
          this.send();
          this.sender = setInterval(() => this.send(), 2000);
        }
      };
      ws.onmessage = ({ data }) => {
        if (this.ws !== ws || typeof data !== 'string' || data.length > 4096)
          return;
        let value: unknown;
        try {
          value = JSON.parse(data);
        } catch {
          return;
        }
        const parsed = CrowdPacketSchema.safeParse(value);
        if (!parsed.success) return;
        clearTimeout(this.deadline);
        this.deadline = setTimeout(() => this.disconnected(ws), 35000);
        const p = parsed.data;
        this.emit?.({
          channel: this.channel,
          laughingNow: p.state === 'live' ? p.laughingNow : 0,
          laughlineViewers: p.state === 'live' ? p.sharing : 0,
          topWords:
            p.state === 'live'
              ? p.bubbles.map((b) => ({ word: b.text, count: b.count }))
              : [],
          updatedAt: Date.now(),
          source: 'live',
          state: p.state,
          testTraffic: p.state === 'live' && p.testTraffic,
          laughPercent: p.state === 'live' ? p.laughPercent : 0,
        });
      };
      ws.onerror = () => {
        this.disconnected(ws);
      };
      ws.onclose = () => {
        this.disconnected(ws);
      };
    } catch {
      if (generation === this.generation) {
        clearTimeout(this.deadline);
        this.offline();
        this.retry();
      }
    }
  }
  private disconnected(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    clearInterval(this.sender);
    clearTimeout(this.deadline);
    this.accumulator.clear();
    this.pending = null;
    this.blockedSince = null;
    ws.close();
    this.offline();
    this.retry();
  }
  private send() {
    if (!this.sharing || !this.ws || !this.emit) return;
    if (this.token && this.token.expiresAt <= Date.now() + 5000) {
      this.token = null;
      this.disconnected(this.ws);
      return;
    }
    this.pending = { value: this.accumulator.take(), at: Date.now() };
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.ws.bufferedAmount > 0) {
      this.blockedSince ??= Date.now();
      if (Date.now() - this.blockedSince >= 10000) this.disconnected(this.ws);
      return;
    }
    this.blockedSince = null;
    const frame = this.pending;
    this.pending = null;
    if (Date.now() - frame.at <= 10000 && this.sharing)
      this.ws.send(JSON.stringify(frame.value));
  }
  private retry() {
    if (!this.emit) return;
    clearTimeout(this.reconnect);
    const delay = Math.min(30000, 1000 * 2 ** Math.min(5, this.attempt++));
    this.reconnect = setTimeout(
      () => void this.connect(),
      delay * (0.8 + Math.random() * 0.4),
    );
  }
  stop() {
    this.generation++;
    this.emit = null;
    clearTimeout(this.reconnect);
    clearTimeout(this.deadline);
    clearInterval(this.sender);
    this.abort?.abort();
    this.abort = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.token = null;
    this.pending = null;
    this.accumulator.clear();
    this.blockedSince = null;
    this.attempt = 0;
  }
}
