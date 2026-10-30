import { emptyInferenceHealth, type PersonalEvent } from '@laughline/shared';
import { MicNormalizer } from '../audio/mic-normalizer';
import { AudioRingBuffer, type AudioSource } from '../audio/ring-buffer';
import { emptyStages, emptyWorkerDiagnostics } from '../diagnostics';
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
  waveformMatch,
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
  private rawMic = new AudioRingBuffer(32000);
  private normalizer = new MicNormalizer();
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
  private speechBusy = false;
  private speechGeneration = 0;
  private speechTask: Promise<void> | null = null;
  private frameCounts = { mic: 0, tab: 0 };
  private frameTimes = { mic: [] as number[], tab: [] as number[] };
  private guardDecision = {
    kept: true,
    reason: 'mic kept: waiting for a candidate segment',
    correlation: 0,
  };
  private recentEvents: ReturnType<typeof emptyWorkerDiagnostics>['events'] =
    [];
  private topMicClass = { label: 'waiting', score: 0 };
  private event(event: PersonalEvent) {
    this.stages.acceptedEvents++;
    if (event.kind === 'words') this.stages.wordEvents++;
    this.recentEvents.push({
      kind: event.kind,
      ts: event.ts,
      confidence: event.kind === 'words' ? 1 : event.confidence,
      count:
        event.kind === 'words'
          ? event.phrases.reduce((n, p) => n + p.count, 0)
          : 1,
    });
    if (this.recentEvents.length > 20) this.recentEvents.shift();
    this.emit(event);
  }
  diagnostics() {
    const cutoff = performance.now() - 1000;
    return {
      ...emptyWorkerDiagnostics(),
      health: { ...this.health },
      micFrames: this.frameCounts.mic,
      tabFrames: this.frameCounts.tab,
      micFps: this.frameTimes.mic.filter((time) => time >= cutoff).length,
      tabFps: this.frameTimes.tab.filter((time) => time >= cutoff).length,
      guard: { ...this.guardDecision },
      events: [...this.recentEvents],
      gain: this.normalizer.gain,
      noiseFloor: this.normalizer.noiseFloor,
      topClass: this.topMicClass,
      stages: { ...this.stages },
      laughScore: this.scores.mic.laugh,
      echo: this.models.echo ?? { removed: false, inputRms: 0, outputRms: 0 },
      error: this.soundError,
    };
  }
  constructor(
    private models: ModelRunner,
    private emit: (event: PersonalEvent) => void,
    private debug = false,
    private onSpeech?: (segment: { start: number; end: number }) => void,
    private wake: () => void = () => {},
  ) {
    this.health.phase = 'ready';
  }
  private stages = emptyStages();
  private soundBusy = false;
  private soundGeneration = 0;
  private nextSound: AudioSource = 'tab';
  private soundError = '';
  ingest(source: AudioSource, frame: Float32Array, ts: number) {
    this.frameCounts[source]++;
    const received = performance.now();
    this.frameTimes[source].push(received);
    while (
      this.frameTimes[source].length > 256 ||
      this.frameTimes[source][0]! < received - 1000
    )
      this.frameTimes[source].shift();
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
        this.rawMic.clear();
        this.normalizer.reset();
        this.vadGeneration++;
        this.pendingLength = 0;
        this.segmenter.reset();
        this.vadQueue.clear();
        this.models.resetVad?.();
      }
    }
    this.lastFrame[source] = ts;
    let square = 0;
    for (const value of frame) square += value * value;
    const rms = Math.sqrt(square / frame.length);
    if (source === 'mic' && rms > 0) this.stages.nonzeroFrames++;
    if (source === 'mic') {
      this.rawMic.write(frame);
      frame = this.normalizer.process(frame, this.health.vadProbability >= 0.5);
    }
    this.buffers[source].write(frame);
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
        // Coalescing an analysis window does not lose its underlying PCM/VAD.
        this.stages.soundJobsSkipped++;
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
    if (source === 'mic') frame.fill(0);
  }

  get pendingWork() {
    return (
      this.vadQueue.length +
      (this.speechBusy || this.health.lowPower ? 0 : this.speechQueue.length) +
      (this.soundBusy ? 0 : Number(!!this.sound.mic) + Number(!!this.sound.tab))
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
      this.event(result.event);
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
    const envelopeMatched = isPlayback(
      this.compare(ts),
      this.scores.mic[kind],
      this.scores.tab[kind],
      Math.abs(ts - this.scoreTs.tab),
    );
    let match = { valid: false, correlation: 0, lagMs: 0 };
    if (envelopeMatched) {
      const end = Math.min(ts, this.lastFrame.mic, this.lastFrame.tab);
      const micSkip = Math.max(0, Math.round((this.lastFrame.mic - end) * 16));
      const tabSkip = Math.max(0, Math.round((this.lastFrame.tab - end) * 16));
      const mic = this.rawMic.read(2048 + micSkip);
      const tab = this.buffers.tab.read(2048 + C.maximumLagMs * 16 + tabSkip);
      match = waveformMatch(
        mic.subarray(0, Math.max(0, mic.length - micSkip)),
        tab.subarray(0, Math.max(0, tab.length - tabSkip)),
      );
      mic.fill(0);
      tab.fill(0);
    }
    const rejected = envelopeMatched && match.valid && match.correlation >= 0.9;
    this.guardDecision = {
      kept: !rejected,
      reason: rejected
        ? 'matching raw waveform, timing and tab class'
        : envelopeMatched
          ? 'mic kept: rhythm matches but waveform differs'
          : 'mic kept: no matching playback',
      correlation: match.correlation,
    };
    return rejected;
  }

  private consumeSound(
    source: AudioSource,
    job: SoundJob,
    scores: ClassScores,
  ) {
    this.scores[source] = scores;
    if (source === 'mic') {
      this.stages.soundCalls++;
      if (this.models.topClass) this.topMicClass = { ...this.models.topClass };
    }
    this.scoreTs[source] = job.ts;
    if (source === 'tab') {
      if (scores.laugh >= C.thresholds.laugh) this.health.tabLaughTs = job.ts;
    } else
      for (const kind of ['laugh', 'scream', 'gasp'] as const)
        this.decision(
          kind,
          scores[kind],
          job.rms,
          job.ts,
          scores[kind] >= C.thresholds[kind] && this.playback(kind, job.ts),
        );
  }
  private startSound(source: AudioSource, job: SoundJob) {
    const generation = this.soundGeneration;
    const skip = Math.max(0, Math.round((this.lastFrame.tab - job.ts) * 16));
    const tab =
      source === 'mic'
        ? this.buffers.tab.read(job.samples.length + C.maximumLagMs * 16 + skip)
        : undefined;
    const reference = tab?.subarray(0, Math.max(0, tab.length - skip));
    const end = () => {
      wipe(job);
      tab?.fill(0);
    };
    try {
      const result = this.models.sound(job.samples, reference);
      if (result instanceof Promise) {
        this.soundBusy = true;
        void result
          .then((scores) => {
            if (generation === this.soundGeneration) {
              this.soundError = '';
              this.consumeSound(source, job, scores);
            }
          })
          .catch((error) => {
            if (generation === this.soundGeneration)
              this.soundError = String(
                error instanceof Error
                  ? error.message
                  : 'sound inference failed',
              ).slice(0, 400);
          })
          .finally(() => {
            end();
            if (generation === this.soundGeneration) {
              this.soundBusy = false;
              this.wake();
            }
          });
      } else {
        this.consumeSound(source, job, result);
        end();
      }
    } catch {
      end();
      this.soundError = 'sound model could not run';
    }
  }
  async step() {
    const start = performance.now();
    // Sound inference has its own event loop. Its pending result never holds
    // frame ACKs, VAD, or dispatch to the isolated speech worker.
    if (!this.soundBusy && this.vadQueue.length <= 3) {
      const source = this.sound[this.nextSound]
        ? this.nextSound
        : this.nextSound === 'mic'
          ? 'tab'
          : 'mic';
      const job = this.sound[source];
      if (job) {
        delete this.sound[source];
        this.nextSound = source === 'mic' ? 'tab' : 'mic';
        this.startSound(source, job);
      }
    }
    const vad = this.vadQueue.shift();
    if (vad) {
      const generation = this.vadGeneration;
      this.processedMs += 32;
      const probability = await this.models.vad(vad.samples);
      this.stages.vadCalls++;
      if (probability >= C.vadThreshold) this.stages.voicedChunks++;
      const current = generation === this.vadGeneration;
      if (!current) this.models.resetVad?.();
      this.health.vadProbability = current ? probability : 0;
      wipe(vad);
      for (const segment of current
        ? this.segmenter.update(this.health.vadProbability, vad.start, vad.end)
        : []) {
        this.stages.segments++;
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
    }
    if (!this.health.lowPower && !this.speechBusy) {
      const speech = this.speechQueue.shift();
      if (speech) this.startSpeech(speech);
    }
    this.busyMs += performance.now() - start;
    this.health.inferenceMs = this.busyMs;
    this.health.frameQueue = this.vadQueue.length;
    this.health.speechQueue = this.speechQueue.length;
    this.health.drops =
      this.transportDrops +
      this.vadQueue.drops +
      this.speechQueue.drops +
      this.stages.soundJobsSkipped;
    const now = performance.now(),
      elapsed = now - this.period;
    this.health.lowPower = this.power.update(
      this.health.realTimeFactor,
      this.transportDrops + this.vadQueue.drops,
      now,
    );
    if (this.health.lowPower) this.speechQueue.clear();
    if (elapsed >= 1000) {
      // Classifier time covers the whole live audio interval, not only the last
      // 32 ms VAD chunk. That old denominator falsely reported 10–20× overload.
      this.health.realTimeFactor = this.busyMs / Math.max(32, elapsed);
      this.health.lowPower = this.power.update(
        this.health.realTimeFactor,
        this.transportDrops + this.vadQueue.drops,
        now,
      );
      this.busyMs = 0;
      this.processedMs = 0;
      this.period = now;
      if (this.health.lowPower) this.speechQueue.clear();
    }
  }
  private startSpeech(speech: SpeechJob) {
    const generation = this.speechGeneration;
    this.speechBusy = true;
    this.speechTask = (async () => {
      let text = '';
      try {
        this.stages.speechRequests++;
        const value = await this.models.words(speech.samples);
        this.stages.speechResults++;
        if (generation !== this.speechGeneration) return;
        const result = typeof value === 'string' ? extractWords(value) : value;
        if (typeof value === 'string') text = value;
        if (this.debug) this.lastTranscript = redactDebugTranscript(text);
        if (result.phrases.length)
          this.event({ kind: 'words', ts: speech.ts, phrases: result.phrases });
        if (result.hype)
          this.decision('hype', 0.9, speech.rms, speech.ts, false);
      } catch {
        // A slow/unavailable transcription cannot stop the reaction scheduler.
        this.speechQueue.clear();
      } finally {
        text = '';
        wipe(speech);
        if (generation === this.speechGeneration) {
          this.speechBusy = false;
          this.wake();
        }
      }
    })();
  }
  async finishSpeech() {
    while (this.speechTask) {
      const task = this.speechTask;
      await task;
      if (task === this.speechTask) this.speechTask = null;
      while (this.pendingWork) await this.step();
    }
  }
  addDrops(count: number) {
    this.transportDrops += count;
    this.health.lowPower = this.power.update(
      this.health.realTimeFactor,
      this.transportDrops + this.vadQueue.drops,
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
    this.speechGeneration++;
    this.soundGeneration++;
    this.soundBusy = false;
    this.speechBusy = false;
    this.rawMic.clear();
    this.normalizer.reset();
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
