import { emptyInferenceHealth, type PersonalEvent } from '@laughline/shared';
import { MicNormalizer } from '../audio/mic-normalizer';
import { frameLevels } from '../audio/resampler';
import { AudioRingBuffer, type AudioSource } from '../audio/ring-buffer';
import {
  type AccuracyRecord,
  emptyStages,
  emptyWorkerDiagnostics,
  safeError,
  logAudioError,
} from '../diagnostics';
import {
  type AcousticEvidence,
  AcousticFloor,
  LaughEpisodes,
  type Sensitivity,
} from './accuracy';
import { INFERENCE_CONFIG as C, type ClassScores, zeroScores } from './config';
import { DspLaughDetector } from './dsp-laugh';
import type { ModelRunner } from './models';
import {
  BoundedQueue,
  EventGate,
  extractWords,
  LowPowerPolicy,
  redactDebugTranscript,
  VadSegmenter,
  waveformMatch,
} from './rules';

type VadJob = { samples: Float32Array; start: number; end: number };
type SoundJob = {
  samples: Float32Array;
  ts: number;
  rms: number;
  acoustic: AcousticEvidence;
  dsp: { at: number; durationMs: number; score: number };
};
type SpeechJob = {
  start: number;
  samples: Float32Array;
  ts: number;
  duration: number;
  rms: number;
  acoustic: AcousticEvidence;
};
const wipe = (job: { samples: Float32Array }) => job.samples.fill(0);
export class InferencePipeline {
  private episodes = new LaughEpisodes();
  private laughHops: number[] = [];
  private lastConfidence = 0;
  private soundEvidence: { ts: number; speech: number; laugh: number }[] = [];
  private activeSpeechEvidence: {
    start: number;
    end: number;
    speech: number;
    laugh: number;
  } | null = null;
  private audit: AccuracyRecord[] = [];
  private detectors = { dsp: 0, yamnet: 0, both: 0 };
  setSensitivity(value: Sensitivity) {
    this.acoustics.sensitivity = value;
  }
  private log(record: AccuracyRecord) {
    this.audit.push(record);
    if (this.audit.length > 20) this.audit.shift();
  }
  private modes = { laugh: true, speech: true };
  setModes(modes: { laugh: boolean; speech: boolean }) {
    this.modes = { ...modes };
    if (!modes.laugh) {
      for (const job of Object.values(this.sound)) if (job) wipe(job);
      this.sound = {};
      this.soundGeneration++;
      this.soundBusy = false;
    }
    if (!modes.speech) {
      this.speechGeneration++;
      this.speechQueue.clear();
      this.segmenter.reset();
      this.speechBusy = false;
      this.speechTask = null;
    }
    if (!modes.laugh && !modes.speech) this.vadQueue.clear();
  }
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
  private dsp = new DspLaughDetector();
  private lastLaugh = -Infinity;
  private envelopes: Record<AudioSource, { ts: number; rms: number }[]> = {
    mic: [],
    tab: [],
  };
  private sound: Partial<Record<AudioSource, SoundJob>> = {};
  private vadQueue = new BoundedQueue<VadJob>(C.maxVadJobs, wipe);
  private speechQueue = new BoundedQueue<SpeechJob>(C.maxSpeechJobs, (job) => {
    this.log({
      kind: 'words',
      ts: job.ts,
      accepted: false,
      detector: 'whisper',
      reason: 'queue full or stopped · newest 3 segments kept',
      laughter: 0,
      speech: 0,
      dsp: 0,
      durationMs: job.duration,
      aboveFloorDb: job.acoustic.aboveFloorDb,
      rms: job.rms,
      highFrequencyRatio: job.acoustic.highFrequencyRatio,
      avgLogprob: null,
      noSpeechProbability: null,
    });
    this.stages.wordsRejected++;
    wipe(job);
  });
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
    if (event.kind === 'words' ? !this.modes.speech : !this.modes.laugh)
      return false;
    if (event.kind === 'laugh') {
      if (event.ts - this.lastLaugh < 2000) return false;
      this.lastLaugh = event.ts;
    }
    if (event.kind !== 'words') this.health.accepted++;
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
    return true;
  }
  diagnostics() {
    const cutoff = performance.now() - 1000;
    return {
      ...emptyWorkerDiagnostics(),
      accuracyLog: [...this.audit],
      laughDetectors: { ...this.detectors },
      health: { ...this.health },
      micFrames: this.frameCounts.mic,
      tabFrames: this.frameCounts.tab,
      micFps: this.frameTimes.mic.filter((time) => time >= cutoff).length,
      tabFps: this.frameTimes.tab.filter((time) => time >= cutoff).length,
      guard: { ...this.guardDecision },
      events: [...this.recentEvents],
      gain: this.normalizer.gain,
      noiseFloor: this.acoustics.floor,
      topClass: this.topMicClass,
      stages: { ...this.stages, dspHits: this.dsp.hits },
      laughScore: this.scores.mic.laugh,
      laughConfidence: this.lastConfidence,
      basicMode: !!this.soundError || this.models.soundStatus === 'error',
      echo: this.models.echo ?? { removed: false, inputRms: 0, outputRms: 0 },
      error: this.vadError || this.soundError || this.speechError,
      vadError: this.vadError,
      soundError: this.soundError,
      speechError: this.speechError,
      inputGaps: this.inputGaps,
    };
  }
  constructor(
    private models: ModelRunner,
    private emit: (event: PersonalEvent) => void,
    private debug = false,
    private onSpeech?: (segment: { start: number; end: number }) => void,
    private wake: () => void = () => {},
    private acoustics = new AcousticFloor(),
  ) {
    this.health.phase = 'ready';
  }
  private stages = emptyStages();
  private soundBusy = false;
  private soundGeneration = 0;
  private nextSound: AudioSource = 'tab';
  private soundError = '';
  private vadError = '';
  private speechError = '';
  private inputGaps = 0;
  private processingError(kind: 'vad' | 'sound' | 'speech', error: unknown) {
    const key = `${kind}Error` as 'vadError' | 'soundError' | 'speechError';
    const message = safeError(error);
    if (message !== this[key]) logAudioError(`${kind} inference`, error);
    this[key] = message;
  }
  ingest(source: AudioSource, frame: Float32Array, ts: number) {
    if (!this.modes.laugh && !this.modes.speech) return;
    const ingestStart = performance.now();
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
        this.inputGaps++;
        this.rawMic.clear();
        this.normalizer.reset();
        this.dsp.reset();
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
    let rms = Math.sqrt(square / frame.length);
    if (source === 'mic' && rms > 0) this.stages.nonzeroFrames++;
    if (source === 'mic') {
      this.rawMic.write(frame);
      frame = this.normalizer.process(frame, this.health.vadProbability >= 0.5);
      this.acoustics.ingest(frame, ts, this.health.vadProbability >= 0.5);
      this.health.calibrationRemainingMs = 0;
      this.health.bleedLikely = false;
      if (this.modes.laugh) this.dsp.process(frame, ts);
    }
    rms = frameLevels(frame).rms;
    this.buffers[source].write(frame);
    const envelope = this.envelopes[source];
    envelope.push({ ts, rms });
    while (envelope.length > 96 || envelope[0]!.ts < ts - 1900)
      envelope.shift();
    if (
      this.modes.laugh &&
      this.buffers[source].length >= C.soundWindow &&
      ts - this.lastHop[source] >= C.soundHopMs
    ) {
      if (this.sound[source]) {
        wipe(this.sound[source]!);
        // Coalescing an analysis window does not lose its underlying PCM/VAD.
        this.stages.soundJobsSkipped++;
      }
      const samples = this.buffers[source].read(C.soundWindow);
      this.sound[source] = {
        samples,
        ts,
        rms,
        acoustic: this.acoustics.window(
          ts - 975,
          ts,
          source === 'mic' ? frameLevels(samples).rms : undefined,
        ),
        dsp: { ...this.dsp.evidence },
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
    this.busyMs += performance.now() - ingestStart;
  }

  get pendingWork() {
    return (
      this.vadQueue.length +
      (this.speechBusy ? 0 : this.speechQueue.length) +
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
      this.event(result.event);
    } else if (score >= C.thresholds[kind]) this.health.rejected++;
    if (this.debug) {
      this.reasons.push({ kind, ts, reason: result.reason });
      if (this.reasons.length > C.maxDebugEvents) this.reasons.shift();
    }
  }
  private playback(kind: keyof ClassScores, ts: number) {
    // No tab stream means no reference guard at all. Native Twitch playback stays native.
    if (!this.lastFrame.tab || ts - this.lastFrame.tab > 1000) {
      this.guardDecision = {
        kept: true,
        reason: 'native playback · tab guard off',
        correlation: 0,
      };
      return false;
    }
    const envelopeMatched =
      this.scores.tab[kind] >= 0.3 && Math.abs(ts - this.scoreTs.tab) <= 500;
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
      this.soundEvidence.push({
        ts: job.ts,
        speech: scores.speech,
        laugh: scores.laugh,
      });
      this.soundEvidence = this.soundEvidence.slice(-40);
      const active = this.activeSpeechEvidence;
      if (active && job.ts >= active.start && job.ts <= active.end + 975) {
        active.speech = Math.max(active.speech, scores.speech);
        active.laugh = Math.max(active.laugh, scores.laugh);
      }
      this.stages.soundCalls++;
      if (this.models.topClass) this.topMicClass = { ...this.models.topClass };
    }
    this.scoreTs[source] = job.ts;
    if (source === 'tab') {
      if (scores.laugh >= C.thresholds.laugh) this.health.tabLaughTs = job.ts;
    } else
      for (const kind of ['laugh', 'scream', 'gasp'] as const)
        if (kind === 'laugh') {
          this.evaluateLaugh(job, scores);
        } else
          this.decision(
            kind,
            scores[kind],
            job.rms,
            job.ts,
            scores[kind] >= C.thresholds[kind] && this.playback(kind, job.ts),
          );
  }
  private evaluateLaugh(job: SoundJob, scores: ClassScores, basic = false) {
    const rhythm = job.ts - job.dsp.at <= 700 && job.dsp.durationMs >= 600;
    this.laughHops.push(scores.laugh);
    this.laughHops = this.laughHops.slice(-3);
    const smooth =
      (Math.max(...this.laughHops) +
        this.laughHops.reduce((a, b) => a + b, 0) / this.laughHops.length) /
      2;
    const conf = Math.max(
      0,
      Math.min(
        1,
        basic
          ? rhythm
            ? Math.min(1, job.dsp.score)
            : 0
          : smooth +
              (rhythm ? 0.15 : 0) -
              0.5 * Math.max(0, scores.speech - scores.laugh) +
              (job.acoustic.aboveFloorDb > 6 ? 0.03 : 0),
      ),
    );
    this.lastConfidence = conf;
    const playback = this.playback('laugh', job.ts);
    const accepted = this.episodes.consider(
      playback ? 0 : conf,
      job.ts,
      this.acoustics.sensitivity,
    );
    const reason = playback
      ? 'matching tab playback · laughter and waveform'
      : accepted
        ? 'counted'
        : conf < 0.15
          ? 'speech / low laugh confidence'
          : 'same episode or waiting for second hop';
    if (accepted) {
      if (basic) this.detectors.dsp++;
      else if (rhythm) this.detectors.both++;
      else this.detectors.yamnet++;
      this.event({
        kind: 'laugh',
        ts: job.ts,
        confidence: conf,
        intensity: conf >= 0.8 ? 3 : 1,
      });
    }
    this.log({
      kind: 'laugh',
      ts: job.ts,
      accepted,
      detector: basic ? 'dsp' : rhythm ? 'both' : 'yamnet',
      reason,
      laughter: conf,
      speech: scores.speech,
      dsp: rhythm ? job.dsp.score : 0,
      durationMs: job.dsp.durationMs,
      aboveFloorDb: job.acoustic.aboveFloorDb,
      rms: job.acoustic.rms,
      highFrequencyRatio: job.acoustic.highFrequencyRatio,
      avgLogprob: null,
      noSpeechProbability: null,
    });
  }
  private startSound(source: AudioSource, job: SoundJob) {
    const generation = this.soundGeneration;
    // Classification never subtracts a speculative reference from the user's voice.
    // Confirmed tab playback is rejected separately, only while opt-in capture is on.
    if (this.models.soundStatus === 'error') {
      this.soundError = 'YAMNet unavailable · basic mode';
      if (source === 'mic') this.evaluateLaugh(job, zeroScores(), true);
      wipe(job);
      return;
    }
    const end = () => {
      wipe(job);
    };
    try {
      const result = this.models.sound(job.samples);
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
            if (generation === this.soundGeneration) {
              this.processingError('sound', error);
              if (source === 'mic') this.evaluateLaugh(job, zeroScores(), true);
            }
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
    } catch (error) {
      end();
      this.processingError('sound', error);
      if (source === 'mic') this.evaluateLaugh(job, zeroScores(), true);
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
      let probability: number;
      try {
        probability = await this.models.vad(vad.samples);
        this.vadError = '';
      } catch (error) {
        this.processingError('vad', error);
        probability =
          Math.sqrt(
            vad.samples.reduce((n, v) => n + v * v, 0) / vad.samples.length,
          ) >
          Math.max(0.004, this.normalizer.noiseFloor * this.normalizer.gain * 3)
            ? 0.8
            : 0;
      }
      this.stages.vadCalls++;
      if (probability >= C.vadThreshold) this.stages.voicedChunks++;
      const current = generation === this.vadGeneration;
      if (!current) this.models.resetVad?.();
      this.health.vadProbability = current ? probability : 0;
      wipe(vad);
      for (const segment of current
        ? this.segmenter.update(this.health.vadProbability, vad.start, vad.end)
        : []) {
        this.enqueueSegment(segment);
      }
    }
    if (!this.speechBusy) {
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
    }
  }
  private enqueueSegment(segment: { start: number; end: number }) {
    if (!this.modes.speech) return;
    this.stages.segments++;
    this.onSpeech?.(segment);
    const ageSamples = Math.max(
      0,
      Math.round(
        (this.lastFrame.mic - Math.min(this.lastFrame.mic, segment.end + 150)) *
          16,
      ),
    );
    // VAD locates voiced vowels, not necessarily the initial/final consonants.
    // Preserve local pre/post roll so short reactions such as "bro" stay whole.
    const length = Math.round(
      (Math.min(this.lastFrame.mic, segment.end + 150) - segment.start + 150) *
        16,
    );
    const all = this.buffers.mic.read(length + ageSamples);
    const samples = all.slice(0, Math.max(0, all.length - ageSamples));
    all.fill(0);
    const rms = frameLevels(samples).rms;
    const acoustic = this.acoustics.window(segment.start, segment.end, rms);
    if (samples.length < 4000) {
      samples.fill(0);
      return;
    }
    const duration = samples.length / 16;
    if (rms >= C.loudSpeechRms && duration <= C.loudSpeechMaximumMs)
      this.decision('hype', 0.7, rms, segment.end, false);
    this.speechQueue.push({
      start: segment.start,
      samples,
      ts: segment.end,
      rms,
      duration,
      acoustic,
    });
  }
  private startSpeech(speech: SpeechJob) {
    const generation = this.speechGeneration;
    const matching = this.soundEvidence.filter(
      (s) => s.ts >= speech.start && s.ts <= speech.ts + 975,
    );
    // Retain numeric evidence per job so valid slow results survive history rollover.
    const classification = {
      start: speech.start,
      end: speech.ts,
      speech: Math.max(0, ...matching.map((s) => s.speech)),
      laugh: Math.max(0, ...matching.map((s) => s.laugh)),
    };
    this.activeSpeechEvidence = classification;
    this.speechBusy = true;
    this.speechTask = (async () => {
      let text = '';
      try {
        this.stages.speechRequests++;
        const value = await this.models.words(speech.samples);
        this.speechError = '';
        this.stages.speechResults++;
        if (generation !== this.speechGeneration) return;
        const result = typeof value === 'string' ? extractWords(value) : value;
        const confidence =
          typeof value === 'string' ? this.models.lastSpeechConfidence : value;
        const speechScore = classification.speech,
          laughScore = classification.laugh;
        this.log({
          kind: 'words',
          canonical: result.phrases.map((p) => p.text).join(' · '),
          ts: speech.ts,
          accepted: result.phrases.length > 0,
          detector: 'whisper',
          reason:
            ('rejection' in result ? result.rejection : '') ||
            (result.phrases.length ? 'accepted' : 'no approved reaction'),
          laughter: laughScore,
          speech: speechScore,
          dsp: 0,
          durationMs: speech.duration,
          aboveFloorDb: speech.acoustic.aboveFloorDb,
          rms: speech.acoustic.rms,
          highFrequencyRatio: speech.acoustic.highFrequencyRatio,
          avgLogprob: confidence?.avgLogprob ?? null,
          noSpeechProbability: confidence?.noSpeechProbability ?? null,
        });
        if (typeof value === 'string') text = value;
        this.stages.wordsMatched +=
          result.matched ??
          result.phrases
            .filter((p) => p.class === 'ok')
            .reduce((n, p) => n + p.count, 0);
        this.stages.wordsRejected += result.rejected ?? 0;
        if (this.debug) this.lastTranscript = redactDebugTranscript(text);
        if (result.phrases.length)
          this.event({ kind: 'words', ts: speech.ts, phrases: result.phrases });
        if (result.hype)
          this.decision('hype', 0.9, speech.rms, speech.ts, false);
      } catch (error) {
        // A slow/unavailable transcription cannot stop the reaction scheduler.
        this.processingError('speech', error);
        this.stages.wordsRejected++;
      } finally {
        text = '';
        if (this.activeSpeechEvidence === classification)
          this.activeSpeechEvidence = null;
        wipe(speech);
        if (generation === this.speechGeneration) {
          this.speechBusy = false;
          this.wake();
        }
      }
    })();
  }
  async finish() {
    while (this.pendingWork) await this.step();
    const trailing = this.segmenter.flush();
    if (trailing) this.enqueueSegment(trailing);
    if (!this.speechBusy) {
      const speech = this.speechQueue.shift();
      if (speech) this.startSpeech(speech);
    }
    await this.finishSpeech();
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
    this.dsp.reset();
    this.vadQueue.clear();
    this.speechQueue.clear();
    for (const buffer of Object.values(this.buffers)) buffer.clear();
    for (const job of Object.values(this.sound)) if (job) wipe(job);
    this.sound = {};
    this.pending.fill(0);
    this.lastTranscript = '';
    this.laughHops = [];
    this.soundEvidence = [];
    this.activeSpeechEvidence = null;
    this.envelopes = { mic: [], tab: [] };
    this.reasons.length = 0;
  }
}
