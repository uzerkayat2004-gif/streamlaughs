import type { PersonalEvent } from '@laughline/shared';
import { AUDIO_DEBUG } from '../src/audio/config';
import { INFERENCE_CONFIG } from '../src/inference/config';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels } from '../src/inference/models';
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
  const report = () => {
    if (!pipeline || !models) return;
    self.postMessage({
      type: 'status',
      health: { ...pipeline.health, backend: models.backend },
      events,
      debug: AUDIO_DEBUG
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
  const schedule = () => {
    if (scheduled || running || stopped || !pipeline?.pendingWork) return;
    scheduled = true;
    setTimeout(async () => {
      scheduled = false;
      running = true;
      try {
        await pipeline!.step();
        if (performance.now() - lastReport >= 250) report();
      } catch {
        self.postMessage({ type: 'error' });
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
        await models.load(
          data.base,
          data.backend ?? INFERENCE_CONFIG.preferredBackend,
        );
        if (stopped) return;
        pipeline = new InferencePipeline(
          models,
          (event) => {
            if (events.length < 32) events.push(event);
            else pipeline?.addDrops(1);
          },
          AUDIO_DEBUG,
        );
        report();
      } catch {
        self.postMessage({ type: 'error' });
      }
    } else if (data.type === 'frame' && pipeline && !stopped) {
      pipeline.ingest(data.source, data.frame, data.ts);
      data.frame.fill(0);
      if (data.drops) pipeline.addDrops(data.drops);
      self.postMessage({ type: 'ack' });
      schedule();
    } else if (data.type === 'close') {
      stopped = true;
      pipeline?.clear();
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
