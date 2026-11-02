import { z } from 'zod';
const n = z.number().finite().nonnegative();
export const LabSwitchesSchema = z
  .object({
    tabCapture: z.boolean().default(false),
    micCapture: z.boolean().default(true),
    laughModel: z.boolean().default(true),
    speechModel: z.boolean().default(true),
    overlay: z.boolean().default(true),
  })
  .strict();
export type LabSwitches = z.infer<typeof LabSwitchesSchema>;
export const defaultLab = (): LabSwitches => LabSwitchesSchema.parse({});
export const TaskStatsSchema = z
  .object({
    supported: z.boolean(),
    count: n,
    worstMs: n,
    stalls: n,
    worstStallMs: n,
  })
  .strict();
export const emptyTasks = () => ({
  supported: false,
  count: 0,
  worstMs: 0,
  stalls: 0,
  worstStallMs: 0,
});
/** Numeric RAM-only probes. Worker timer stalls are not labelled Long Tasks. */
export class TaskProbe {
  private stats = emptyTasks();
  private observer?: PerformanceObserver;
  private last = performance.now();
  constructor() {
    this.stats.supported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes.includes('longtask');
    if (this.stats.supported) {
      this.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          this.stats.count++;
          this.stats.worstMs = Math.max(this.stats.worstMs, e.duration);
        }
      });
      this.observer.observe({ type: 'longtask' });
    }
  }
  tick() {
    const now = performance.now(),
      lag = now - this.last - 250;
    if (lag > 50) {
      this.stats.stalls++;
      this.stats.worstStallMs = Math.max(this.stats.worstStallMs, lag);
    }
    this.last = now;
  }
  snapshot() {
    return { ...this.stats };
  }
  reset() {
    this.observer?.takeRecords();
    this.stats = { ...emptyTasks(), supported: this.stats.supported };
    this.last = performance.now();
  }
  close() {
    this.observer?.disconnect();
  }
}
export const PlaybackStatsSchema = z
  .object({
    state: z.string().max(32),
    sampleRate: n,
    baseLatency: n,
    outputLatency: n,
    underruns: n.nullable(),
    underrunsPerMinute: n.nullable(),
    underrunDuration: n.nullable(),
    watchdogGaps: n,
    worstGapMs: n,
    speechPaused: z.boolean(),
  })
  .strict();
type PlaybackContext = Pick<
  AudioContext,
  | 'state'
  | 'sampleRate'
  | 'baseLatency'
  | 'outputLatency'
  | 'getOutputTimestamp'
> & {
  playbackStats?: { underrunEvents: number; underrunDuration: number };
};
export class PlaybackWatchdog {
  private previous: AudioTimestamp | null = null;
  private started = performance.now();
  private gaps = 0;
  private worst = 0;
  private previousUnderruns = 0;
  private hits: number[] = [];
  private lastHit = -Infinity;
  speechPaused = false;
  sample(context: PlaybackContext | null, now = performance.now()) {
    const stats = context?.playbackStats;
    if (context?.state === 'running') {
      const ts = context.getOutputTimestamp?.();
      // Compare output timestamps, never the delay between our JS polling callbacks.
      if (
        ts?.contextTime &&
        ts.performanceTime &&
        this.previous?.contextTime &&
        this.previous.performanceTime
      ) {
        const wall = ts.performanceTime - this.previous.performanceTime;
        const gap = wall - (ts.contextTime - this.previous.contextTime) * 1000;
        if (wall > 100 && gap > 80) {
          this.gaps++;
          this.worst = Math.max(this.worst, gap);
          this.hit(now);
        }
      }
      if (ts?.contextTime) this.previous = ts;
      if (stats && stats.underrunEvents > this.previousUnderruns) {
        for (
          let i = 0;
          i < Math.min(10, stats.underrunEvents - this.previousUnderruns);
          i++
        )
          this.hit(now);
        this.previousUnderruns = stats.underrunEvents;
      }
    } else this.previous = null;
    if (this.speechPaused && now - this.lastHit >= 30000)
      this.speechPaused = false;
    return {
      state: context?.state ?? 'native',
      sampleRate: context?.sampleRate ?? 0,
      baseLatency: context?.baseLatency ?? 0,
      outputLatency: context?.outputLatency ?? 0,
      underruns: stats?.underrunEvents ?? null,
      underrunsPerMinute: stats
        ? (stats.underrunEvents * 60000) / Math.max(1000, now - this.started)
        : null,
      underrunDuration: stats?.underrunDuration ?? null,
      watchdogGaps: this.gaps,
      worstGapMs: this.worst,
      speechPaused: this.speechPaused,
    };
  }
  private hit(now: number) {
    this.lastHit = now;
    this.hits = this.hits.filter((t) => now - t <= 10000);
    this.hits.push(now);
    if (this.hits.length >= 3) this.speechPaused = true;
  }
}
export const bluetoothHint = (label: string) =>
  /bluetooth|airpods|hands.?free|\bhfp\b|\ba2dp\b|\bbth|earbuds|galaxy buds|wh-1000|wf-1000/i.test(
    label,
  );
export const AUDIO_TIP_KEY = 'streamlaughs:audio-tip-dismissed';
export const AUDIO_TIP =
  'Bluetooth headsets drop audio quality while a mic is on. Use your laptop mic or wired earphones for smooth sound.';
