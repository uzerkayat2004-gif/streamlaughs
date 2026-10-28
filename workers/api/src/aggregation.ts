import {
  type CrowdContribution,
  type CrowdMinute,
  CrowdMinuteSchema,
  type CrowdPacket,
  CROWD_LIMITS as L,
} from '@laughline/shared';

type Contributor = {
  seen: number;
  laughed: number;
  phrases: Map<string, number>;
  hype: { ts: number; count: number }[];
  test: boolean;
};
type Minute = {
  minute: number;
  ids: Set<string>;
  peak: number;
  peakAt: number;
  peakWords: { text: string; count: number }[];
  percentages: number;
  samples: number;
  lastSecond: number;
  words: Map<string, Set<string>>;
  hype: number;
  test: boolean;
  spikes: CrowdMinute['moments'];
};
const sorted = (words: Map<string, Set<string>>, limit: number) =>
  [...words]
    .map(([text, ids]) => ({ text, count: ids.size }))
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);

export class ChannelAggregation {
  private contributors = new Map<string, Contributor>();
  private minute: Minute | null = null;
  private completed: CrowdMinute[] = [];
  private lastLaughing = 0;
  accept(id: string, data: CrowdContribution, now: number, test = false) {
    this.advance(now);
    let c = this.contributors.get(id);
    if (!c && this.contributors.size >= L.sockets) return false;
    if (!c) {
      c = { seen: now, laughed: -Infinity, phrases: new Map(), hype: [], test };
      this.contributors.set(id, c);
    }
    c.seen = now;
    if (data.laughing) c.laughed = now;
    for (const phrase of data.phrases) c.phrases.set(phrase, now);
    if (data.hype) c.hype.push({ ts: now, count: data.hype });
    c.hype = c.hype.filter((event) => event.ts > now - L.laughMs).slice(-5);
    const packet = this.snapshot(now);
    if (packet.state === 'live' && this.minute) this.minute.hype += data.hype;
    return true;
  }
  remove(id: string) {
    this.contributors.delete(id);
  }
  private advance(now: number) {
    const minute = Math.floor(now / 60000) * 60000;
    if (this.minute && this.minute.minute !== minute) {
      const m = this.minute;
      if (m.ids.size >= 3 && m.samples) {
        const row = CrowdMinuteSchema.parse({
          minute: m.minute,
          contributors: m.ids.size,
          peakLaughingNow: m.peak,
          averageLaughPercent:
            Math.round((m.percentages / m.samples) * 100) / 100,
          phrases: sorted(m.words, 5),
          hype: m.hype,
          testTraffic: m.test,
          moments: [
            ...(m.peak
              ? [
                  {
                    ts: m.peakAt,
                    kind: 'peak' as const,
                    laughingNow: m.peak,
                    phrases: m.peakWords,
                  },
                ]
              : []),
            ...m.spikes,
          ].slice(0, 4),
        });
        this.completed.push(row);
        if (this.completed.length > 2) this.completed.shift();
      }
      this.minute = null;
    }
    this.minute ??= {
      minute,
      ids: new Set(),
      peak: 0,
      peakAt: minute,
      peakWords: [],
      percentages: 0,
      samples: 0,
      lastSecond: -1,
      words: new Map(),
      hype: 0,
      test: false,
      spikes: [],
    };
    for (const [id, c] of this.contributors) {
      if (c.seen <= now - L.phraseMs) {
        this.contributors.delete(id);
        continue;
      }
      for (const [phrase, ts] of c.phrases)
        if (ts <= now - L.phraseMs) c.phrases.delete(phrase);
      c.hype = c.hype.filter((e) => e.ts > now - L.laughMs);
    }
  }
  snapshot(now: number): CrowdPacket {
    this.advance(now);
    const sharing = [...this.contributors.values()].filter(
      (c) => c.seen > now - L.presenceMs,
    ).length;
    if (sharing < 3) return { state: 'few' };
    const words = new Map<string, Set<string>>();
    let laughingNow = 0,
      hype = 0,
      testTraffic = false;
    for (const [id, c] of this.contributors) {
      if (c.laughed > now - L.laughMs) laughingNow++;
      hype += c.hype.reduce((n, e) => n + e.count, 0);
      testTraffic ||= c.test;
      for (const phrase of c.phrases.keys()) {
        const ids = words.get(phrase) ?? new Set<string>();
        ids.add(id);
        words.set(phrase, ids);
      }
    }
    const bubbles = sorted(words, 3);
    return {
      state: 'live',
      sharing,
      laughingNow,
      laughPercent: Math.round((laughingNow / sharing) * 100),
      topWord: bubbles[0]?.text ?? null,
      bubbles,
      hype,
      testTraffic,
    };
  }
  tick(now: number) {
    const packet = this.snapshot(now),
      m = this.minute!;
    const second = Math.floor(now / 1000);
    if (packet.state === 'live') {
      for (const [id, c] of this.contributors) {
        if (m.ids.size < L.identities && c.seen > now - L.presenceMs)
          m.ids.add(id);
        for (const [phrase, ts] of c.phrases)
          if (ts >= m.minute) {
            const ids = m.words.get(phrase) ?? new Set<string>();
            if (ids.size < L.identities) ids.add(id);
            m.words.set(phrase, ids);
          }
      }
      if (second !== m.lastSecond) {
        m.samples++;
        m.percentages += packet.laughPercent;
        m.lastSecond = second;
      }
      m.test ||= packet.testTraffic;
      if (packet.laughingNow > m.peak) {
        m.peak = packet.laughingNow;
        m.peakAt = Math.floor(now);
        m.peakWords = packet.bubbles;
      }
      if (
        packet.laughingNow - this.lastLaughing >=
          Math.max(3, Math.ceil(packet.sharing * 0.25)) &&
        m.spikes.length < 3 &&
        now - (m.spikes.at(-1)?.ts ?? -Infinity) >= 10000
      )
        m.spikes.push({
          ts: Math.floor(now),
          kind: 'spike',
          laughingNow: packet.laughingNow,
          phrases: packet.bubbles,
        });
    }
    this.lastLaughing = packet.state === 'live' ? packet.laughingNow : 0;
    return packet;
  }
  takeMinutes() {
    const rows = this.completed;
    this.completed = [];
    return rows;
  }
  needsTick(now: number) {
    this.advance(now);
    return this.contributors.size > 0 || (this.minute?.ids.size ?? 0) >= 3;
  }
}
export class MemoryRateLimit {
  private entries = new Map<string, number>();
  allow(key: string, now: number) {
    for (const [id, ts] of this.entries)
      if (ts <= now - 60000) this.entries.delete(id);
    const previous = this.entries.get(key);
    if (
      (previous !== undefined && now - previous < L.rateMs) ||
      (previous === undefined && this.entries.size >= L.identities)
    )
      return false;
    this.entries.set(key, now);
    return true;
  }
  get size() {
    return this.entries.size;
  }
}
