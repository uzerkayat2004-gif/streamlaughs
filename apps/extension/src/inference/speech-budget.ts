/** Conservative elapsed-work budget, excluding explicit sleeps; not an OS CPU counter.
 * Reserve 1 s/10 s for realtime/classifier work and allow speech at most 1.6 s per rolling 10 s.
 * A single synchronous WASM kernel cannot be preempted by JavaScript.
 */
export function yieldModelTask() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
const MAX_JOB_WAIT_MS = 1200;
export class SpeechBudget {
  private history: { at: number; ms: number }[] = [];
  private pauseUntil = 0;
  private longest = new Map<string, number>();
  workMs = 0;
  waitedMs = 0;
  /** Pacing wait spent on the current transcription; capped so a phrase always finishes. */
  jobWaitedMs = 0;
  beginJob() {
    this.jobWaitedMs = 0;
  }
  constructor(
    private now = () => performance.now(),
    private sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    private yieldTask = yieldModelTask,
  ) {}
  recent() {
    this.history = this.history.filter((r) => this.now() - r.at < 10_000);
    return this.history.reduce((n, r) => n + r.ms, 0);
  }
  backoff(ms = 1000) {
    this.pauseUntil = Math.max(
      this.pauseUntil,
      this.now() + Math.min(500, Math.max(0, ms)),
    );
  }
  private async wait(ms: number) {
    if (ms <= 0) return;
    const at = this.now();
    await this.sleep(ms);
    const waited = Math.max(0, this.now() - at);
    this.waitedMs += waited;
    this.jobWaitedMs += waited;
  }
  async run<T>(task: () => Promise<T>, key = 'model'): Promise<T> {
    // Speech runs in its own worker thread, so it may use up to half of one
    // core. A phrase is never paced for more than MAX_JOB_WAIT in total: on
    // slow laptops the old 1.6 s/10 s cap starved Moonshine for minutes.
    while (
      this.jobWaitedMs < MAX_JOB_WAIT_MS &&
      this.recent() + Math.min(1400, this.longest.get(key) ?? 100) > 5000 &&
      this.history.length
    )
      await this.wait(
        Math.min(
          MAX_JOB_WAIT_MS - this.jobWaitedMs,
          Math.max(1, this.history[0]!.at + 10_000 - this.now()),
        ),
      );
    if (this.jobWaitedMs < MAX_JOB_WAIT_MS)
      await this.wait(
        Math.min(MAX_JOB_WAIT_MS - this.jobWaitedMs, this.pauseUntil - this.now()),
      );
    const at = this.now();
    try {
      return await task();
    } finally {
      const ms = Math.max(0, this.now() - at);
      this.workMs += ms;
      this.longest.set(key, Math.max(this.longest.get(key) ?? 0, ms));
      this.history.push({ at: this.now(), ms });
      // Explicit macrotask yields between encoder/decoder calls; never kill a valid job.
      const yielded = this.now();
      await this.yieldTask();
      this.waitedMs += Math.max(0, this.now() - yielded);
    }
  }
  diagnostics() {
    return {
      work10sMs: this.recent(),
      work1sMs: this.history
        .filter((r) => this.now() - r.at < 1000)
        .reduce((n, r) => n + r.ms, 0),
      backoffMs: Math.max(0, this.pauseUntil - this.now()),
      waitedMs: this.waitedMs,
    };
  }
}
