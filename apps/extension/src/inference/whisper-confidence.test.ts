import { expect, it } from 'vitest';
import { Tensor } from '@huggingface/transformers';
import { WhisperConfidence } from './whisper-confidence';
import { speechConfidenceReason } from './accuracy';
it('measures raw first-step no-speech and selected text-token log probability before suppression', () => {
  const raw = new Float32Array(51864).fill(-20);
  raw[50361] = 4;
  raw[100] = 3;
  const p = new WhisperConfidence();
  p.capture(new Tensor('float32', raw, [1, 1, raw.length]));
  const forced = new Float32Array(raw.length).fill(-Infinity);
  forced[100] = 0;
  p._call([[50257n, 50362n]], new Tensor('float32', forced, [1, raw.length]));
  const logZ = Math.log(
    Math.exp(4) + Math.exp(3) + (raw.length - 2) * Math.exp(-20),
  );
  expect(p.result().avgLogprob).toBeCloseTo(3 - logZ, 5);
  expect(p.result().noSpeechProbability).toBeCloseTo(Math.exp(4 - logZ), 5);
  const end = new Float32Array(raw.length).fill(-20);
  end[50256] = 8;
  p.capture(new Tensor('float32', end, [1, 1, end.length]));
  p._call(
    [[50257n, 50362n, 100n]],
    new Tensor('float32', end, [1, end.length]),
  );
  const endLogZ = Math.log(Math.exp(8) + (end.length - 1) * Math.exp(-20));
  expect(p.result().avgLogprob).toBeCloseTo((3 - logZ + (8 - endLogZ)) / 2, 5);
  expect(speechConfidenceReason(p.result())).not.toBe('');
  p.clear();
});
it('fails closed when confidence is absent', () => {
  expect(
    speechConfidenceReason({ avgLogprob: null, noSpeechProbability: null }),
  ).toBe('confidence unavailable');
  expect(
    speechConfidenceReason({ avgLogprob: -0.2, noSpeechProbability: 0.9 }),
  ).toBe('model predicts non-speech');
  expect(
    speechConfidenceReason({ avgLogprob: -0.2, noSpeechProbability: 0.01 }),
  ).toBe('');
});

it('retains the measured near-voice bro boundary and rejects weaker short-context or non-speech results', () => {
  expect(
    speechConfidenceReason({
      avgLogprob: -0.825812434,
      noSpeechProbability: 0.000178235,
    }),
  ).toBe('');
  expect(
    speechConfidenceReason({ avgLogprob: -1.16, noSpeechProbability: 0.00005 }),
  ).toBe('low token confidence');
  expect(
    speechConfidenceReason({
      avgLogprob: -0.825812434,
      noSpeechProbability: 0.8,
    }),
  ).toBe('model predicts non-speech');
});
