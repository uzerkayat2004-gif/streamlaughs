export type Sensitivity = 'strict' | 'normal' | 'sensitive';
export const ACCURACY = {
  strict: {
    aboveFloorDb: 14,
    laugh: 0.24,
    speechMargin: 0.15,
    minimumRms: 0.006,
  },
  normal: {
    aboveFloorDb: 10,
    laugh: 0.19,
    speechMargin: 0.1,
    minimumRms: 0.004,
  },
  sensitive: {
    aboveFloorDb: 8,
    laugh: 0.18,
    speechMargin: 0.1,
    minimumRms: 0.002,
  },
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
const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor(xs.length * q))
  ] ?? 0;
/** Raw microphone levels, BEFORE AGC. No audio leaves this bounded RAM owner. */
export class AcousticFloor {
  sensitivity: Sensitivity = 'normal';
  floor = 0.0001;
  bleed = false;
  private began: number | null = null;
  private calibratedFloor = 0.00003;
  private levels: number[] = [];
  private calibrationHf = 0;
  private hfs: number[] = [];
  private records: (AcousticEvidence & { ts: number })[] = [];
  private elapsed = 0;
  private retryQuiet = false;
  private quietRetry: { rms: number; hf: number }[] = [];
  private openingVoice = 0;
  ingest(frame: Float32Array, ts: number, speech = false) {
    this.began ??= ts;
    this.elapsed = Math.max(0, ts - this.began);
    let square = 0,
      difference = 0;
    for (let i = 0; i < frame.length; i++) {
      square += frame[i]! ** 2;
      if (i) difference += (frame[i]! - frame[i - 1]!) ** 2;
    }
    const rms = Math.sqrt(square / Math.max(1, frame.length)),
      hf = difference / Math.max(1e-12, 4 * square);
    if (this.elapsed < 3000) {
      if (speech) this.openingVoice++;
      this.levels.push(rms);
      this.hfs.push(hf);
      this.floor = Math.max(0.00003, quantile(this.levels, 0.8));
      this.calibrationHf = quantile(this.hfs, 0.5);
    } else if (this.levels.length) {
      // A foreground voice can start before the quiet countdown finishes.
      // When the opening window includes >30 dB bursts above real quiet gaps,
      // use those gaps, not the voice, as the room reference. Ordinary speaker
      // bleed retains the conservative upper quantile (19 dB in the fixture).
      const quiet = Math.max(0.00003, quantile(this.levels, 0.2));
      if (20 * Math.log10(this.floor / quiet) >= 30) this.floor = quiet;
      this.calibratedFloor = this.floor;
      // Continuous foreground speech has no quiet quantile to use. Keep the
      // countdown visible until one real quiet second replaces that invalid
      // startup reference. Ordinary room/speaker floors are never reset.
      this.retryQuiet =
        this.floor >= 0.02 || this.openingVoice > this.levels.length / 2;
      // Speaker-fixture calibration is ~0.0055 RMS; 0.006 missed it.
      this.bleed = this.floor >= 0.004;
      this.levels = [];
      this.hfs = [];
    }
    if (this.retryQuiet) {
      // VAD-confirmed quiet is the room reference. Requiring an arbitrary
      // 20 dB drop from the opening voice stranded ordinary noisy laptop mics.
      if (!speech) this.quietRetry.push({ rms, hf });
      else this.quietRetry = [];
      if (this.quietRetry.length >= 50) {
        this.floor = this.calibratedFloor = Math.max(
          0.00003,
          quantile(
            this.quietRetry.map((r) => r.rms),
            0.8,
          ),
        );
        this.calibrationHf = quantile(
          this.quietRetry.map((r) => r.hf),
          0.5,
        );
        this.bleed = this.floor >= 0.004;
        this.retryQuiet = false;
        this.quietRetry = [];
      }
    }
    if (this.elapsed >= 3000 && !speech && rms < this.floor * 1.8)
      // Quiet speech gaps must not erase the room/speaker reference mid-session.
      this.floor = Math.max(
        0.00003,
        this.calibratedFloor * 0.8,
        this.floor * 0.9999 + rms * 0.0001,
      );
    const profile = ACCURACY[this.bleed ? 'strict' : this.sensitivity];
    const db = 20 * Math.log10(Math.max(1e-8, rms) / this.floor);
    // A large level step can be a vowel with little HF energy. Never claim
    // this single-mic proxy measures physical distance or speaker identity.
    const near =
      db >= profile.aboveFloorDb &&
      rms >= profile.minimumRms &&
      (!this.bleed || hf >= this.calibrationHf * 0.7 || db >= 20);
    const result = {
      rms,
      floor: this.floor,
      aboveFloorDb: db,
      highFrequencyRatio: hf,
      near,
      calibrated: this.elapsed >= 3000 && !this.retryQuiet,
      bleed: this.bleed,
    };
    this.records.push({ ...result, ts });
    while (this.records.length > 600) this.records.shift();
    return result;
  }
  window(start: number, end: number, modelRms?: number): AcousticEvidence {
    const rows = this.records.filter((r) => r.ts >= start && r.ts <= end);
    const rms = Math.sqrt(
      rows.reduce((n, r) => n + r.rms * r.rms, 0) / Math.max(1, rows.length),
    );
    const floor = this.floor,
      db = 20 * Math.log10(Math.max(1e-8, rms) / floor);
    const hf =
      rows.reduce((n, r) => n + r.highFrequencyRatio, 0) /
      Math.max(1, rows.length);
    const profile = ACCURACY[this.bleed ? 'strict' : this.sensitivity];
    return {
      rms,
      floor,
      aboveFloorDb: db,
      highFrequencyRatio: hf,
      near:
        db >= profile.aboveFloorDb &&
        // Absolute audibility belongs to the conditioned signal fed to the
        // models. SNR/HF evidence must stay raw: gain must never promote noise.
        (modelRms ?? rms) >= profile.minimumRms &&
        (!this.bleed || hf >= this.calibrationHf * 0.7 || db >= 20),
      calibrated: this.elapsed >= 3000 && !this.retryQuiet,
      bleed: this.bleed,
    };
  }
  remainingMs() {
    if (this.retryQuiet)
      return Math.max(20, 1000 - this.quietRetry.length * 20);
    return Math.max(0, 3000 - this.elapsed);
  }
}
export class LaughEpisodes {
  private lastEvidence = -Infinity;
  private lastCount = -Infinity;
  consider(qualified: boolean, ts: number) {
    if (!qualified) return false;
    const separate = ts - this.lastEvidence > 2500;
    this.lastEvidence = ts;
    if (!separate || ts - this.lastCount < 3000) return false;
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
