/** Bounded, local-only laughter rhythm heuristic. No models, transcripts or I/O. */
export class DspLaughDetector {
  hits = 0;
  lastPitch = 0;
  evidence = { at: -Infinity, durationMs: 0, score: 0 };
  private previous = new Float32Array(320);
  private levels: number[] = [];
  private pulses: number[] = [];
  private active = false;
  private peak = 0;
  private lastHit = -Infinity;
  private lastPulse = -Infinity;
  process(frame: Float32Array, ts: number) {
    const samples = new Float32Array(640);
    samples.set(this.previous);
    samples.set(frame, 320);
    this.previous.set(frame);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const rms = Math.sqrt(sum / samples.length);
    this.levels.push(rms);
    if (this.levels.length > 100) this.levels.shift();
    const sorted = [...this.levels].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
    this.peak = Math.max(rms, this.peak * 0.985);
    const high = Math.max(0.002, floor * 2.8, this.peak * 0.26);
    if (rms < high * 0.65) this.active = false;
    let voiced = 0,
      pitch = 0;
    if (rms >= high) {
      for (let lag = 36; lag <= 200; lag += 2) {
        let dot = 0,
          a = 0,
          b = 0;
        for (let n = 200; n < 640; n += 2) {
          const x = samples[n]!,
            y = samples[n - lag]!;
          dot += x * y;
          a += x * x;
          b += y * y;
        }
        const c = dot / Math.sqrt(Math.max(1e-16, a * b));
        if (c > voiced) {
          voiced = c;
          pitch = 16000 / lag;
        }
      }
    }
    this.lastPitch = voiced >= 0.4 ? pitch : 0;
    // Soft, breathy chuckles are only weakly periodic; 0.3 lets them pulse.
    samples.fill(0);
    if (
      rms >= high &&
      voiced >= 0.3 &&
      !this.active &&
      ts - this.lastPulse >= 110
    ) {
      this.pulses.push(ts);
      this.lastPulse = ts;
      this.active = true;
    }
    this.pulses = this.pulses.filter((p) => ts - p <= 3000);
    const recent = this.pulses.filter((p) => ts - p <= 1400).slice(-8);
    if (recent.length < 4 || ts - this.lastPulse > 400) return false;
    const intervals = recent.slice(1).map((p, i) => p - recent[i]!);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variation =
      Math.sqrt(
        intervals.reduce((n, x) => n + (x - mean) ** 2, 0) / intervals.length,
      ) / mean;
    if (
      recent.at(-1)! - recent[0]! >= 600 &&
      mean >= 1000 / 8 &&
      mean <= 1000 / 3 &&
      intervals.every((i) => i >= 110 && i <= 440) &&
      variation < 0.4
    ) {
      this.evidence = {
        at: ts,
        durationMs: recent.at(-1)! - recent[0]!,
        score: Math.max(0, 1 - variation),
      };
      if (ts - this.lastHit < 2000) return false;
      this.hits++;
      this.lastHit = ts;
      return true;
    }
    return false;
  }
  reset() {
    this.previous.fill(0);
    this.levels = [];
    this.pulses = [];
    this.active = false;
    this.peak = 0;
    this.lastHit = -Infinity;
    this.lastPulse = -Infinity;
    this.lastPitch = 0;
    this.evidence = { at: -Infinity, durationMs: 0, score: 0 };
  }
}
