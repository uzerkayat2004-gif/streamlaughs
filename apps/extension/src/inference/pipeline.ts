import { emptyInferenceHealth, type PersonalEvent } from '@laughline/shared';
import { AudioRingBuffer, type AudioSource } from '../audio/ring-buffer';
import { INFERENCE_CONFIG as C, type ClassScores, zeroScores } from './config';
import type { ModelRunner } from './models';
import {
  BoundedQueue,
  crossCorrelation,
  EventGate,
  extractWords,
  isPlayback,
  LowPowerPolicy,
  redactDebugTranscript,
  VadSegmenter,
} from './rules';

type VadJob = { samples: Float32Array; start: number; end: number };
type SoundJob = { samples: Float32Array; ts: number; rms: number };
type SpeechJob = {
  samples: Float32Array;
  ts: number;
  duration: number;
  rms: number;
};
const wipe = (job: { samples: Float32Array }) => job.samples.fill(0);
export class InferencePipeline {
  readonly health = emptyInferenceHealth();
  readonly scores = { mic: zeroScores(), tab: zeroScores() };
  readonly reasons: { kind: string; ts: number; reason: string }[] = [];
  headphonesLikely: boolean | null = null;
  correlation = 0;
  lastTranscript = '';
  private buffers = {
    mic: new AudioRingBuffer(16000 * 10),
    tab: new AudioRingBuffer(16000 * 2),
  };
  private envelopes: Record<AudioSource, { ts: number; rms: number }[]> = {
    mic: [],
    tab: [],
  };
  private sound: Partial<Record<AudioSource, SoundJob>> = {};
  private vadQueue = new BoundedQueue<VadJob>(C.maxVadJobs, wipe);
  private speechQueue = new BoundedQueue<SpeechJob>(C.maxSpeechJobs, wipe);
  private segmenter = new VadSegmenter();
  private gate = new EventGate();
  private power = new LowPowerPolicy();
  private pending = new Float32Array(512);
  private pendingLength = 0;
  private lastHop = { mic: 0, tab: 0 };
  private scoreTs = { mic: 0, tab: 0 };
  private lastFrame = { mic: 0, tab: 0 };
  private epoch = 0;
  private busyMs = 0;
  private period = 0;
  private transportDrops = 0;
  private processedMs = 0;
  private lowCorrelation = 0;
  private comparedAt = -1;
  private vadGeneration = 0;
  constructor(
    private models: ModelRunner,
    private emit: (event: PersonalEvent) => void,
    private debug = false,
    private onSpeech?: (segment: { start: number; end: number }) => void,
  ) {
    this.health.phase = 'ready';
  }
  ingest(source: AudioSource, frame: Float32Array, ts: number) {
    if (!this.epoch) {
      this.epoch = ts;
      this.period = performance.now();
    }
    // Never join audio across a dropped transport packet into one VAD chunk/segment.
    if (this.lastFrame[source] && ts - this.lastFrame[source] > 45) {
      this.buffers[source].clear();
      this.envelopes[source] = [];
      if (this.sound[source]) {
        wipe(this.sound[source]!);
        delete this.sound[source];
      }
      if (source === 'mic') {
        this.vadGeneration++;
        this.pendingLength = 0;
        this.segmenter.reset();
        this.vadQueue.clear();
        this.models.resetVad?.();
      }
    }
    this.lastFrame[source] = ts;
    this.buffers[source].write(frame);
    let square = 0;
    for (const value of frame) square += value * value;
    const rms = Math.sqrt(square / frame.length);
    const envelope = this.envelopes[source];
    envelope.push({ ts, rms });
    while (envelope.length > 96 || envelope[0]!.ts < ts - 1900)
      envelope.shift();
    if (
      this.buffers[source].length >= C.soundWindow &&
      ts - this.lastHop[source] >= C.soundHopMs
    ) {
      if (this.sound[source]) {
        wipe(this.sound[source]!);
        this.transportDrops++;
      }
      this.sound[source] = {
        samples: this.buffers[source].read(C.soundWindow),
        ts,
        rms,
      };
      this.lastHop[source] = ts;
    }
    if (source === 'mic') {
      let offset = 0;
      while (offset < frame.length) {
        const n = Math.min(512 - this.pendingLength, frame.length - offset);
        this.pending.set(
          frame.subarray(offset, offset + n),
          this.pendingLength,
        );
        offset += n;
        this.pendingLength += n;
        if (this.pendingLength === 512) {
          const end = ts - (frame.length - offset) / 16;
          this.vadQueue.push({
            samples: this.pending.slice(),
            start: end - 32,
            end,
          });
          this.pendingLength = 0;
        }
      }
    }
  }
  get pendingWork() {
    return (
      this.vadQueue.length +
      this.speechQueue.length +
      Number(!!this.sound.mic) +
      Number(!!this.sound.tab)
    );
  }
  private decision(
    kind: 'laugh' | 'scream' | 'gasp' | 'hype',
    score: number,
    rms: number,
    ts: number,
    contaminated: boolean,
  ) {
    const result = this.gate.consider(kind, score, rms, ts, contaminated);
    if (result.event) {
      this.health.accepted++;
      this.emit(result.event);
    } else if (score >= C.thresholds[kind]) this.health.rejected++;
    if (this.debug) {
      this.reasons.push({ kind, ts, reason: result.reason });
      if (this.reasons.length > C.maxDebugEvents) this.reasons.shift();
    }
  }
  private compare(ts: number) {
    if (this.comparedAt === ts) return this.correlation;
    this.comparedAt = ts;
    // Align envelopes by timestamps, including when one worklet is delivered slightly ahead of the other.
    const end = Math.min(ts, this.lastFrame.mic, this.lastFrame.tab);
    const mic = this.envelopes.mic.filter(
      (x) => x.ts >= end - 1500 && x.ts <= end,
    );
    const tab = this.envelopes.tab;
    const a: number[] = [],
      b: number[] = [];
    for (const x of mic) {
      const y = tab.find((y) => Math.abs(y.ts - x.ts) <= 12);
      if (y) {
        a.push(x.rms);
        b.push(y.rms);
      }
    }
    const result = crossCorrelation(a, b);
    this.correlation = result.correlation;
    if (result.valid) {
      this.lowCorrelation =
        result.correlation < 0.35 ? Math.min(20, this.lowCorrelation + 1) : 0;
      this.headphonesLikely =
        this.lowCorrelation >= 8
          ? true
          : result.correlation >= C.correlationThreshold
            ? false
            : null;
    } else this.headphonesLikely = null;
    return result.correlation;
  }
  private playback(kind: keyof ClassScores, ts: number) {
    return isPlayback(
      this.compare(ts),
      this.scores.mic[kind],
      this.scores.tab[kind],
      Math.abs(ts - this.scoreTs.tab),
    );
  }
  async step() {
    const start = performance.now();
    // Fair scheduling: sound work first, then one VAD chunk, then at most one speech job.
    for (const source of ['tab', 'mic'] as const) {
      const job = this.sound[source];
      if (!job) continue;
      delete this.sound[source];
      this.scores[source] = this.models.sound(job.samples);
      this.scoreTs[source] = job.ts;
      wipe(job);
      if (source === 'tab') {
        if (this.scores.tab.laugh >= C.thresholds.laugh)
          this.health.tabLaughTs = job.ts;
      } else
        for (const kind of ['laugh', 'scream', 'gasp'] as const)
          this.decision(
            kind,
            this.scores.mic[kind],
            job.rms,
            job.ts,
            this.playback(kind, job.ts),
          );
    }
    const vad = this.vadQueue.shift();
    if (vad) {
      const generation = this.vadGeneration;
      this.processedMs += 32;
      const probability = await this.models.vad(vad.samples);
      const current = generation === this.vadGeneration;
      if (!current) this.models.resetVad?.();
      this.health.vadProbability = current ? probability : 0;
      wipe(vad);
      for (const segment of current
        ? this.segmenter.update(this.health.vadProbability, vad.start, vad.end)
        : []) {
        this.onSpeech?.(segment);
        const ageSamples = Math.max(
          0,
          Math.round((this.lastFrame.mic - segment.end) * 16),
        );
        const length = Math.round((segment.end - segment.start) * 16);
        const all = this.buffers.mic.read(length + ageSamples);
        const samples = all.slice(0, Math.max(0, all.length - ageSamples));
        all.fill(0);
        if (samples.length < 4000 || this.playback('speech', segment.end)) {
          samples.fill(0);
          continue;
        }
        let square = 0;
        for (const value of samples) square += value * value;
        const rms = Math.sqrt(square / samples.length),
          duration = samples.length / 16;
        if (rms >= C.loudSpeechRms && duration <= C.loudSpeechMaximumMs)
          this.decision('hype', 0.7, rms, segment.end, false);
        if (!this.health.lowPower)
          this.speechQueue.push({ samples, ts: segment.end, rms, duration });
        else samples.fill(0);
      }
    } else if (!this.health.lowPower) {
      const speech = this.speechQueue.shift();
      if (speech) {
        let text = '';
        try {
          text = await this.models.words(speech.samples);
          const result = extractWords(text);
          if (this.debug) this.lastTranscript = redactDebugTranscript(text);
          if (result.phrases.length)
            this.emit({
              kind: 'words',
              ts: speech.ts,
              phrases: result.phrases,
            });
          if (result.hype)
            this.decision('hype', 0.9, speech.rms, speech.ts, false);
        } catch {
          this.health.lowPower = this.power.update(
            2,
            this.health.drops,
            performance.now(),
          );
          this.speechQueue.clear();
          if (this.debug) {
            this.reasons.push({
              kind: 'words',
              ts: speech.ts,
              reason: 'local transcription unavailable; words paused',
            });
            if (this.reasons.length > C.maxDebugEvents) this.reasons.shift();
          }
        } finally {
          text = '';
          wipe(speech);
        }
      }
    }
    this.busyMs += performance.now() - start;
    this.health.inferenceMs = this.busyMs;
    this.health.frameQueue = this.vadQueue.length;
    this.health.speechQueue = this.speechQueue.length;
    this.health.drops =
      this.transportDrops + this.vadQueue.drops + this.speechQueue.drops;
    const now = performance.now(),
      elapsed = now - this.period;
    this.health.lowPower = this.power.update(
      this.health.realTimeFactor,
      this.health.drops,
      now,
    );
    if (this.health.lowPower) this.speechQueue.clear();
    if (elapsed >= 1000) {
      this.health.realTimeFactor = this.busyMs / Math.max(32, this.processedMs);
      this.health.lowPower = this.power.update(
        this.health.realTimeFactor,
        this.health.drops,
        now,
      );
      this.busyMs = 0;
      this.processedMs = 0;
      this.period = now;
      if (this.health.lowPower) this.speechQueue.clear();
    }
  }
  addDrops(count: number) {
    this.transportDrops += count;
    this.health.lowPower = this.power.update(
      this.health.realTimeFactor,
      this.transportDrops + this.vadQueue.drops + this.speechQueue.drops,
      performance.now(),
    );
  }
  debugState() {
    return {
      health: { ...this.health },
      scores: this.scores,
      correlation: this.correlation,
      headphonesLikely: this.headphonesLikely,
      reasons: [...this.reasons],
      lastTranscript: this.debug ? this.lastTranscript : '',
    };
  }
  clear() {
    this.vadQueue.clear();
    this.speechQueue.clear();
    for (const buffer of Object.values(this.buffers)) buffer.clear();
    for (const job of Object.values(this.sound)) if (job) wipe(job);
    this.sound = {};
    this.pending.fill(0);
    this.lastTranscript = '';
    this.envelopes = { mic: [], tab: [] };
    this.reasons.length = 0;
  }
}
