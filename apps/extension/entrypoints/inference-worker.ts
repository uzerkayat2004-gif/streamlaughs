import type { PersonalEvent } from '@laughline/shared';
import { AUDIO_DEBUG } from '../src/audio/config';
import {
  ClassScoresSchema,
  EchoStateSchema,
  emptyWorkerDiagnostics,
  SpeechResultSchema,
  safeError,
} from '../src/diagnostics';
import { INFERENCE_CONFIG } from '../src/inference/config';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels, type SpeechResult } from '../src/inference/models';
import { InferencePipeline } from '../src/inference/pipeline';

// Classic worker is intentional: MediaPipe's local WASM loader uses importScripts.
export default defineUnlistedScript(() => {
  const resources = installLocalAssetPolicy(self.location.origin);
  let models: LocalModels | null = null,
    pipeline: InferencePipeline | null = null;
  let scheduled = false,
    running = false,
    stopped = false;
  let events: PersonalEvent[] = [];
  let lastReport = 0;
  let failure = '';
  let speechId = 0;
  const speechRequests = new Map<
    number,
    { resolve(value: SpeechResult): void; reject(error: Error): void }
  >();
  let soundId = 0;
  const soundRequests = new Map<
    number,
    {
      resolve(value: import('../src/inference/config').ClassScores): void;
      reject(error: Error): void;
    }
  >();
  const requestSound = (samples: Float32Array, reference?: Float32Array) =>
    new Promise<import('../src/inference/config').ClassScores>(
      (resolve, reject) => {
        const id = ++soundId,
          copy = samples.slice(),
          ref = reference?.slice();
        soundRequests.set(id, { resolve, reject });
        self.postMessage(
          { type: 'sound_request', id, samples: copy, reference: ref },
          { transfer: [copy.buffer, ...(ref ? [ref.buffer] : [])] },
        );
      },
    );
  const requestSpeech = (samples: Float32Array) =>
    new Promise<SpeechResult>((resolve, reject) => {
      const id = ++speechId;
      const copy = samples.slice();
      speechRequests.set(id, { resolve, reject });
      self.postMessage(
        { type: 'speech_request', id, samples: copy },
        { transfer: [copy.buffer] },
      );
    });
  const report = () => {
    if (!models) return;
    const base = pipeline?.diagnostics() ?? emptyWorkerDiagnostics();
    const diagnostics = {
      ...base,
      models: models.status,
      error: failure || base.error,
    };
    const health = pipeline
      ? { ...pipeline.health, backend: models.backend }
      : {
          ...diagnostics.health,
          phase: failure ? ('error' as const) : ('warming' as const),
        };
    diagnostics.health = health;
    self.postMessage({
      type: 'status',
      health,
      diagnostics,
      events,
      debug:
        AUDIO_DEBUG && pipeline
          ? {
              ...pipeline.debugState(),
              loadMs: models.loadMs,
              times: models.times,
              calls: models.calls,
              resources: [...resources],
            }
          : undefined,
    });
    events = [];
    lastReport = performance.now();
  };
  const statusTimer = setInterval(report, 250);
  const schedule = () => {
    if (scheduled || running || stopped || !pipeline?.pendingWork) return;
    scheduled = true;
    setTimeout(async () => {
      scheduled = false;
      running = true;
      try {
        await pipeline!.step();
        if (performance.now() - lastReport >= 250) report();
      } catch (error) {
        failure = safeError(error);
        report();
        self.postMessage({ type: 'error', error: failure });
        stopped = true;
      } finally {
        running = false;
        schedule();
      }
    }, 0);
  };
  self.onmessage = async ({ data }) => {
    if (data.type === 'init') {
      if (models) return;
      models = new LocalModels();
      try {
        const evaluation = AUDIO_DEBUG && data.evaluation === true;
        if (evaluation)
          await models.load(
            data.base,
            data.backend ?? INFERENCE_CONFIG.preferredBackend,
          );
        else if (data.externalSound) await models.loadVad(data.base);
        else await models.loadRealtime(data.base);
        if (stopped) return;
        pipeline = new InferencePipeline(
          evaluation
            ? models
            : {
                vad: (samples) => models!.vad(samples),
                sound: data.externalSound
                  ? requestSound
                  : (samples, reference) => models!.sound(samples, reference),
                resetVad: () => models!.resetVad(),
                get topClass() {
                  return models!.topClass;
                },
                get echo() {
                  return models!.echo;
                },
                words: requestSpeech,
              },
          (event) => {
            if (events.length < 32) events.push(event);
            else pipeline?.addDrops(1);
          },
          AUDIO_DEBUG,
          undefined,
          schedule,
        );
        report();
      } catch (error) {
        failure = safeError(error);
        models.loadFailed(error);
        report();
        self.postMessage({ type: 'error', error: failure });
      }
    } else if (data.type === 'sound_result') {
      const pending = soundRequests.get(data.id);
      if (!pending) return;
      soundRequests.delete(data.id);
      const scores = ClassScoresSchema.safeParse(data.scores);
      const echo = EchoStateSchema.safeParse(data.echo);
      if (models && echo.success) models.echo = echo.data;
      if (
        models &&
        data.topClass &&
        typeof data.topClass.label === 'string' &&
        Number.isFinite(data.topClass.score)
      )
        models.topClass = {
          label: data.topClass.label.slice(0, 120),
          score: Math.max(0, Math.min(1, data.topClass.score)),
        };
      if (scores.success) pending.resolve(scores.data);
      else
        pending.reject(
          new Error(
            typeof data.error === 'string'
              ? data.error.slice(0, 400)
              : 'invalid local sound result',
          ),
        );
    } else if (data.type === 'sound_status' && models) {
      models.status.yamnet = data.model;
    } else if (data.type === 'speech_result') {
      const pending = speechRequests.get(data.id);
      if (!pending) return;
      speechRequests.delete(data.id);
      const result = SpeechResultSchema.safeParse(data.result);
      if (result.success) pending.resolve(result.data);
      else
        pending.reject(
          new Error(
            typeof data.error === 'string'
              ? data.error
              : 'invalid local speech result',
          ),
        );
    } else if (data.type === 'speech_status' && models) {
      models.status.whisper = data.model;
    } else if (data.type === 'frame' && pipeline && !stopped) {
      pipeline.ingest(data.source, data.frame, data.ts);
      data.frame.fill(0);
      if (data.drops) pipeline.addDrops(data.drops);
      self.postMessage({ type: 'ack' });
      schedule();
    } else if (data.type === 'close') {
      clearInterval(statusTimer);
      stopped = true;
      pipeline?.clear();
      for (const pending of speechRequests.values())
        pending.reject(new Error('stopped'));
      speechRequests.clear();
      for (const pending of soundRequests.values())
        pending.reject(new Error('stopped'));
      soundRequests.clear();
      if (!running) await models?.close();
      self.close();
    } else if (data.type === 'evaluate' && AUDIO_DEBUG && models && !running) {
      models.resetVad();
      // Developer harness only; samples and optional transcript stay in this worker/page RAM.
      const captured: PersonalEvent[] = [];
      const segments: { start: number; end: number }[] = [];
      const p = new InferencePipeline(
        models,
        (event) => captured.push(event),
        false,
        (segment) => segments.push(segment),
      );
      const mic: Float32Array = data.mic,
        tab: Float32Array | undefined = data.tab;
      for (let i = 0; i + 320 <= mic.length; i += 320) {
        const ts = 100000 + (i + 320) / 16;
        if (tab && i + 320 <= tab.length)
          p.ingest('tab', tab.subarray(i, i + 320), ts);
        p.ingest('mic', mic.subarray(i, i + 320), ts);
        while (p.pendingWork) await p.step();
      }
      // Finish the trailing VAD segment with local silence, just as the live worklet would.
      for (let i = 0; i < 25; i++) {
        p.ingest(
          'mic',
          new Float32Array(320),
          100000 + mic.length / 16 + (i + 1) * 20,
        );
        while (p.pendingWork) await p.step();
      }
      await p.finishSpeech();
      report();
      p.health.backend = models.backend;
      self.postMessage({
        type: 'evaluated',
        events: captured,
        segments,
        metrics: {
          health: p.health,
          times: models.times,
          calls: models.calls,
          loadMs: models.loadMs,
          backend: models.backend,
        },
      });
      p.clear();
      mic.fill(0);
      tab?.fill(0);
    } else if (data.type === 'benchmark' && AUDIO_DEBUG && models && !running) {
      const vad0 = models.times.vad,
        sound0 = models.times.yamnet,
        words0 = models.times.whisper;
      for (let i = 0; i < 50; i++) await models.vad(new Float32Array(512));
      for (let i = 0; i < 10; i++) models.sound(new Float32Array(15600));
      await models.words(new Float32Array(16000), false);
      const firstWhisperMs = models.times.whisper - words0,
        secondStart = models.times.whisper;
      await models.words(new Float32Array(16000), false);
      self.postMessage({
        type: 'benchmarked',
        backend: models.backend,
        loadMs: models.loadMs,
        ms: {
          vad: (models.times.vad - vad0) / 50,
          yamnet: (models.times.yamnet - sound0) / 10,
          whisper: models.times.whisper - secondStart,
          whisperFirst: firstWhisperMs,
        },
        calls: models.calls,
      });
    }
  };
});
