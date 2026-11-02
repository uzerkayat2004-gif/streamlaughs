import { AUDIO_DEBUG } from '../src/audio/config';
import { safeError } from '../src/diagnostics';
import { INFERENCE_CONFIG } from '../src/inference/config';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels } from '../src/inference/models';
import { extractWords, redactDebugTranscript } from '../src/inference/rules';
import { TaskProbe } from '../src/stutter';

// Slow transcription has its own event loop; it cannot hold microphone frame ACKs.
export default defineUnlistedScript(() => {
  const tasks = new TaskProbe();
  const resources = installLocalAssetPolicy(self.location.origin);
  const models = new LocalModels();
  let ready = false,
    busy = false,
    stopped = false;
  let previewUntil = 0;
  const status = () =>
    self.postMessage({
      type: 'speech_status',
      tasks: tasks.snapshot(),
      model: models.status.whisper,
      backend: models.backend,
      resources: AUDIO_DEBUG ? [...resources] : undefined,
    });
  const timer = setInterval(() => {
    tasks.tick();
    status();
  }, 250);
  self.onmessage = async ({ data }) => {
    if (data.type === 'preview') {
      previewUntil = Math.min(Date.now() + 1200, Number(data.until) || 0);
    } else if (data.type === 'init') {
      try {
        await models.loadSpeech(data.base, INFERENCE_CONFIG.preferredBackend);
        ready = true;
      } catch (error) {
        models.loadFailed(error);
      }
      status();
    } else if (data.type === 'speech' && !stopped) {
      const samples: Float32Array = data.samples;
      let text = '';
      try {
        if (
          !ready ||
          busy ||
          !(samples instanceof Float32Array) ||
          samples.length > 128000
        )
          throw new Error('local speech model unavailable');
        busy = true;
        const includePreview = previewUntil > Date.now();
        const start = performance.now();
        text = await models.words(samples);
        models.status.whisper.error = '';
        const result = extractWords(text);
        if (!stopped)
          self.postMessage({
            type: 'speech_result',
            computeMs: performance.now() - start,
            id: data.id,
            result,
            ...(includePreview ? { previewText: text.slice(0, 1000) } : {}),
            ...(AUDIO_DEBUG
              ? { debugTranscript: redactDebugTranscript(text) }
              : {}),
          });
      } catch (error) {
        models.status.whisper.error = safeError(error);
        if (!stopped)
          self.postMessage({
            type: 'speech_result',
            id: data.id,
            error: safeError(error),
          });
      } finally {
        text = '';
        samples?.fill(0);
        busy = false;
      }
    } else if (data.type === 'close') {
      stopped = true;
      clearInterval(timer);
      await models.close();
      self.close();
    }
  };
});
