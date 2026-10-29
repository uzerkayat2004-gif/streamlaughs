import { expect, it } from 'vitest';
import {
  copyableReport,
  DiagnosticsSchema,
  emptyWorkerDiagnostics,
  SpeechResultSchema,
} from './diagnostics';

const report = () => ({
  version: '0.6.0',
  listening: true,
  captureState: 'active',
  audio: null,
  inference: emptyWorkerDiagnostics(),
  error: '',
});
it('copies bounded numeric diagnostics and event kinds without audio, words or transcripts', () => {
  const value = report();
  value.inference.events.push({
    kind: 'words',
    ts: 1234,
    confidence: 1,
    count: 2,
  });
  expect(DiagnosticsSchema.safeParse(value).success).toBe(true);
  expect(copyableReport(value)).not.toMatch(
    /transcript|phrases|Float32Array|samples":\s*\[/i,
  );
  for (const extra of [
    { transcript: 'private speech' },
    { samples: new Float32Array(320) },
    { phrases: ['what'] },
  ]) {
    expect(() => copyableReport({ ...value, ...extra })).toThrow();
    expect(() =>
      copyableReport({ ...value, inference: { ...value.inference, ...extra } }),
    ).toThrow();
    expect(() =>
      copyableReport({
        ...value,
        inference: {
          ...value.inference,
          events: [{ kind: 'words', ts: 1, confidence: 1, count: 1, ...extra }],
        },
      }),
    ).toThrow();
  }
});
it('rejects private speech text across the speech worker boundary', () => {
  expect(
    SpeechResultSchema.safeParse({ phrases: [], hype: false }).success,
  ).toBe(true);
  expect(
    SpeechResultSchema.safeParse({
      phrases: [],
      hype: false,
      text: 'a private transcript',
    }).success,
  ).toBe(false);
});
