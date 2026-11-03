export type Sensitivity = 'strict' | 'normal' | 'sensitive';
/** All laugh presets live here. Floor and rhythm are bonuses, never admission gates. */
export const REACTION_ENGINE = {
  strict: { start: 0.38, instant: 0.65, end: 0.15, refractoryMs: 1500, sustainMs: 3500 },
  normal: { start: 0.3, instant: 0.55, end: 0.15, refractoryMs: 1500, sustainMs: 3500 },
  sensitive: { start: 0.25, instant: 0.5, end: 0.12, refractoryMs: 1500, sustainMs: 3500 },
} as const;
export type AcousticEvidence = {
  rms: number;
  floor: number;
  aboveFloorDb: number;
  highFrequencyRatio: number;
  near: boolean;
  calibrated: boolean;
  bleed: boolean;
};
/** Conditioned signal only. Rolling minimum statistics of non-voice frames (~10s). */
export class AcousticFloor {
  sensitivity: Sensitivity = 'normal';
  floor = 0.0001;
  readonly bleed = false;
  private buckets: { at: number; minimum: number }[] = [];
  private records: (AcousticEvidence & { ts: number })[] = [];
  ingest(frame: Float32Array, ts: number, speech = false) {
    let square = 0,
      difference = 0;
    for (let i = 0; i < frame.length; i++) {
      square += frame[i]! ** 2;
      if (i) difference += (frame[i]! - frame[i - 1]!) ** 2;
    }
    const rms = Math.sqrt(square / Math.max(1, frame.length));
    this.buckets = this.buckets.filter((b) => ts - b.at < 10000);
    if (!speech && rms > 0) {
      let bucket = this.buckets.at(-1);
      if (!bucket || ts - bucket.at >= 500) {
        bucket = { at: ts, minimum: rms };
        this.buckets.push(bucket);
      } else bucket.minimum = Math.min(bucket.minimum, rms);
      this.floor = Math.max(
        0.00003,
        Math.min(...this.buckets.map((b) => b.minimum)),
      );
    }
    const result = {
      rms,
      floor: this.floor,
      aboveFloorDb: 20 * Math.log10(Math.max(1e-8, rms) / this.floor),
      highFrequencyRatio: difference / Math.max(1e-12, 4 * square),
      near: true,
      calibrated: true,
      bleed: false,
    };
    this.records.push({ ...result, ts });
    this.records = this.records.slice(-550);
    return result;
  }
  window(start: number, end: number, modelRms?: number): AcousticEvidence {
    const rows = this.records.filter((r) => r.ts >= start && r.ts <= end);
    const rms =
      modelRms ??
      Math.sqrt(
        rows.reduce((n, r) => n + r.rms * r.rms, 0) / Math.max(1, rows.length),
      );
    return {
      rms,
      floor: this.floor,
      aboveFloorDb: 20 * Math.log10(Math.max(1e-8, rms) / this.floor),
      highFrequencyRatio:
        rows.reduce((n, r) => n + r.highFrequencyRatio, 0) /
        Math.max(1, rows.length),
      near: true,
      calibrated: true,
      bleed: false,
    };
  }
  remainingMs() {
    return 0;
  }
}
export class LaughEpisodes {
  private active = false;
  private consecutive = 0;
  private lastCount = -Infinity;
  private lastHop = -Infinity;
  private peak = 0;
  consider(
    confidence: number | boolean,
    ts: number,
    sensitivity: Sensitivity = 'normal',
  ) {
    const c = typeof confidence === 'boolean' ? Number(confidence) : confidence,
      p = REACTION_ENGINE[sensitivity];
    if (ts - this.lastHop > 1000) {
      this.active = false;
      this.consecutive = 0;
    }
    this.lastHop = ts;
    // An episode ends on a real dip: below the floor, or to under half its own
    // peak, so back-to-back laughs with a short breath between count separately.
    if (c < p.end || (this.active && c < this.peak * 0.45)) {
      this.active = false;
      this.consecutive = 0;
      this.peak = 0;
      return false;
    }
    this.consecutive = c >= p.start ? this.consecutive + 1 : 0;
    if (this.active) {
      this.peak = Math.max(this.peak, c);
      // Sustained laughing keeps counting, one per few seconds.
      if (c >= p.start && ts - this.lastCount >= p.sustainMs) {
        this.lastCount = ts;
        return true;
      }
      return false;
    }
    if (c < p.instant && this.consecutive < 2) return false;
    if (ts - this.lastCount < p.refractoryMs) return false;
    this.active = true;
    this.peak = c;
    this.lastCount = ts;
    return true;
  }
}
export type SpeechConfidence = {
  avgLogprob: number | null;
  noSpeechProbability: number | null;
};
export const speechConfidenceReason = (c: SpeechConfidence) =>
  c.avgLogprob === null || c.noSpeechProbability === null
    ? 'confidence unavailable'
    : c.avgLogprob < -0.9
      ? 'low token confidence'
      : c.noSpeechProbability > 0.5
        ? 'model predicts non-speech'
        : '';
