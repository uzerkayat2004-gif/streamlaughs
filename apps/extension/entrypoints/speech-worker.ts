import { normalizeReaction } from '@laughline/shared';
import { AUDIO_DEBUG } from '../src/audio/config';
import { safeError, logAudioError } from '../src/diagnostics';
import { INFERENCE_CONFIG } from '../src/inference/config';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels } from '../src/inference/models';
import {
  extractWords,
  hallucinationReason,
  redactDebugTranscript,
} from '../src/inference/rules';
import { SpeechBudget } from '../src/inference/speech-budget';
import { TaskProbe } from '../src/stutter';

// Slow transcription has its own event loop; it cannot hold microphone frame ACKs.
export default defineUnlistedScript(() => {
  const tasks = new TaskProbe();
  const budget = new SpeechBudget();
  let observedStalls = 0;
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
      budget: budget.diagnostics(),
      totalWorkMs: budget.workMs,
      resources: AUDIO_DEBUG ? [...resources] : undefined,
    });
  const timer = setInterval(() => {
    tasks.tick();
    const snapshot = tasks.snapshot();
    if (snapshot.count > observedStalls) {
      observedStalls = snapshot.count;
      budget.backoff();
    }
    status();
  }, 250);
  self.onmessage = async ({ data }) => {
    if (data.type === 'backoff') budget.backoff();
    else if (data.type === 'preview') {
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
        text = await models.words(samples, false, budget);

        const confidence = models.lastSpeechConfidence;
        const rejection = text.trim()
          ? hallucinationReason(text)
          : 'empty transcript';
        const extracted = extractWords(text);
        const result = {
          ...(rejection
            ? { phrases: [], hype: false, matched: 0, rejected: 1 }
            : extracted),
          ...confidence,
          rejection:
            rejection ||
            (extracted.phrases.length ? '' : 'no standalone approved reaction'),
        };
        const rms = Math.sqrt(
          samples.reduce((n, x) => n + x * x, 0) / Math.max(1, samples.length),
        );
        const keptTokens = new Set(
          result.phrases.flatMap((p) => p.text.split(' ')),
        );
        const rejectedWords = includePreview
          ? (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [])
              .filter((w) => !keptTokens.has(normalizeReaction(w)))
              .map(
                (w) =>
                  `${w}: ${result.rejection || (normalizeReaction(w) === 'what' ? 'not standalone' : 'not reaction list')}`,
              )
              .join('; ')
              .slice(0, 300)
          : '';
        if (!stopped)
          self.postMessage({
            type: 'speech_result',
            computeMs: models.lastWordWorkMs,
            id: data.id,
            result,
            ...(includePreview
              ? {
                  previewText: `${new Date().toLocaleTimeString()} · ${result.phrases.map((p) => p.text).join(', ') || 'no canonical reaction'} · ${result.phrases.length ? 'counted' : 'rejected'} · ${result.rejection || 'approved reaction'} · logp ${confidence.avgLogprob?.toFixed(3) ?? 'unavailable'} · no-speech ${confidence.noSpeechProbability?.toFixed(3) ?? 'unavailable'} · segment RMS ${rms.toFixed(4)} · ${redactDebugTranscript(text).slice(0, 400)} · rejected words: ${redactDebugTranscript(rejectedWords)}`,
                }
              : {}),
            ...(AUDIO_DEBUG
              ? { debugTranscript: redactDebugTranscript(text) }
              : {}),
          });
      } catch (error) {
        models.status.whisper.error = safeError(error);
        logAudioError('word model could not run', error);
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
