import { normalizeReaction } from '@laughline/shared';
import { AUDIO_DEBUG } from '../src/audio/config';
import { logAudioError, safeError } from '../src/diagnostics';
import { INFERENCE_CONFIG } from '../src/inference/config';
import { SPOT_FORMS } from '../src/inference/keyword-spot';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels } from '../src/inference/models';
import {
  extractWords,
  hallucinationReason,
  redactDebugTranscript,
} from '../src/inference/rules';
import { SpeechBudget } from '../src/inference/speech-budget';
import {
  addTemplate,
  dtwDistance,
  loadTemplates,
  MATCH_MAX,
  MAX_CLIP_SECONDS,
  matchVoice,
  OTHER,
  usableTemplates,
  type VoiceTemplate,
  features as voiceFeatures,
} from '../src/inference/voice-match';
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
    // The worker's own long WASM kernel shows up as a "stall" here; it is not
    // a Twitch audio stall, so it must never pause transcription (it did, for minutes).
    if (snapshot.count > observedStalls) observedStalls = snapshot.count;
    status();
  }, 250);
  // Laughing out loud often reaches the word model as "ha ha ha", "hehe" or a
  // [laughs] tag while the sound model calls the same audio speech.
  function laughInTranscript(text: string) {
    const t = text.toLowerCase();
    return (
      /\b(?:a?ha|he|hah|heh)(?:[\s,.!?'-]*(?:ha|he|hah|heh))+\b/.test(t) ||
      /\b(?:ha){2,}h?\b|\b(?:he){2,}\b|\blo+l\b|\blmf?ao+\b|[[(*](?:laugh|chuckl|giggl)/.test(
        t,
      )
    );
  }
  // In a short clip, a transcript made only of "pro" is a misheard "bro".
  function broSound(text: string) {
    const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
    return tokens.length &&
      tokens.length <= 3 &&
      tokens.every((t) => t === 'pro' || t === 'pros')
      ? tokens.map(() => 'Bro').join(' ')
      : text;
  }
  // Personal voice examples (taught on the mic page, or learned when a model
  // heard a word clearly). Reloaded every 15 s so teaching applies mid-session.
  let voice: { all: VoiceTemplate[]; usable: VoiceTemplate[]; at: number } = {
    all: [],
    usable: [],
    at: 0,
  };
  async function voiceTemplates() {
    if (Date.now() - voice.at > 15000) {
      const all = await loadTemplates().catch(() => voice.all);
      voice = { all, usable: usableTemplates(all), at: Date.now() };
    }
    return voice;
  }
  function learnVoice(t: VoiceTemplate) {
    voice.at = 0;
    void addTemplate(t).catch(() => {});
  }
  function padClip(samples: Float32Array, pad: number) {
    const out = new Float32Array(samples.length + pad * 2);
    out.set(samples, pad);
    return out;
  }
  self.onmessage = async ({ data }) => {
    if (data.type === 'backoff') budget.backoff();
    else if (data.type === 'preview') {
      previewUntil = Math.min(Date.now() + 1200, Number(data.until) || 0);
    } else if (data.type === 'init') {
      try {
        await models.loadSpeech(data.base, INFERENCE_CONFIG.preferredBackend);
        ready = true;
        // Not awaited: words work with Moonshine alone while it loads.
        void models.loadChecker(data.base).then(status);
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
        budget.beginJob();
        // Moonshine drops many sub-second clips to "" when the word starts
        // right at the cut; 150 ms of silence each side fixes most.
        const shortClip = samples.length <= 16000 * 1.5;
        text = await models.words(
          shortClip ? padClip(samples, 2400) : samples,
          false,
          budget,
        );
        const isShort = samples.length <= 16000 * 2.2;
        let spotted: Awaited<ReturnType<typeof models.spot>> = null;
        let checked: string | null = null;
        const hasReaction = (t: string) =>
          !!extractWords(broSound(t), { short: true }).phrases.length;
        const fromModel = text;
        const voiceClip = samples.length <= 16000 * MAX_CLIP_SECONDS;
        const feats = voiceClip ? voiceFeatures(samples) : [];
        let voiced: ReturnType<typeof matchVoice> = null;
        if (feats.length && !hasReaction(text)) {
          // Generic models mishear how many people shout a reaction ("bro"
          // came out as "No", "Oh", "The"); compare with this user's own voice.
          voiced = matchVoice(feats, (await voiceTemplates()).usable);
          if (voiced?.accepted)
            text = SPOT_FORMS[voiced.word]?.[0] ?? voiced.word;
        }
        if (isShort && !hasReaction(text)) {
          // Moonshine Tiny mishears lone short reactions; Whisper gets most.
          checked = await models
            .check(padClip(samples, 2400))
            .catch(() => null);
          if (checked && hasReaction(checked)) text = checked;
        }
        if (isShort && !hasReaction(text)) {
          // Still nothing: ask "was it one of the reactions?"
          spotted = await models.spot(padClip(samples, 2400)).catch(() => null);
          if (spotted?.accepted) text = spotted.text;
        }
        if (isShort) text = broSound(text);
        if (feats.length && !voiced?.accepted && !spotted?.accepted) {
          // Learn this user's voice from clips a model heard plainly.
          const heardText = hasReaction(fromModel)
            ? fromModel
            : checked && hasReaction(checked)
              ? checked
              : '';
          const plain = (heardText.match(/[a-z']+/gi) ?? []).length;
          const words = heardText
            ? extractWords(heardText, { short: true }).phrases
            : [];
          const known = (await voiceTemplates()).all;
          const nearReaction = known.some(
            (t) =>
              t.word !== OTHER && dtwDistance(feats, t.feats) < MATCH_MAX + 0.1,
          );
          if (
            words.length === 1 &&
            plain <= 3 &&
            !/\bpro\b/i.test(heardText) &&
            SPOT_FORMS[words[0]!.text]
          )
            learnVoice({
              word: words[0]!.text,
              source: 'auto',
              feats,
              at: Date.now(),
            });
          else if (
            !heardText &&
            !nearReaction &&
            /[a-z]{2,}/i.test(fromModel) &&
            !laughInTranscript(fromModel)
          )
            learnVoice({ word: OTHER, source: 'auto', feats, at: Date.now() });
        }

        const confidence = models.lastSpeechConfidence;
        const rejection = text.trim()
          ? hallucinationReason(text)
          : 'empty transcript';
        const extracted = extractWords(text, {
          short: samples.length <= 16000 * 2.2,
        });
        const result = {
          ...(rejection
            ? { phrases: [], hype: false, matched: 0, rejected: 1 }
            : extracted),
          ...confidence,
          rejection:
            rejection ||
            (extracted.phrases.length ? '' : 'no standalone approved reaction'),
          // Local-only: shown in this device's diagnostics, never saved or sent.
          heard: (
            (checked !== null
              ? `check "${redactDebugTranscript(checked).slice(0, 40)}" · `
              : '') +
            (voiced
              ? `voice ${voiced.word} ${voiced.distance.toFixed(2)}/${Number.isFinite(voiced.margin) ? voiced.margin.toFixed(2) : '-'}${voiced.accepted ? ' ✓' : ''} · `
              : '') +
            (spotted
              ? `spot ${spotted.word || '-'} ${spotted.logp.toFixed(1)}/${spotted.margin.toFixed(1)}${spotted.accepted ? ' ✓' : ''} · `
              : '') +
            redactDebugTranscript(text)
          ).slice(0, 160),
          laughed: laughInTranscript(text),
          noWords: !/[a-z]/i.test(text),
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
