import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AudioReportSchema, emptyAudioMetrics } from '@laughline/shared';
import { expect, it } from 'vitest';

it('rejects audio samples and extra fields at the numeric-only runtime boundary', () => {
  const report = {
    type: 'AUDIO_REPORT',
    ownerId: 'owner-token',
    sessionId: 'one',
    phase: 'active',
    micLost: false,
    hasMic: true,
    hasTab: true,
    metrics: emptyAudioMetrics(),
  };
  expect(AudioReportSchema.safeParse(report).success).toBe(true);
  for (const audio of [
    new Float32Array(320),
    [0, 0.5],
    new ArrayBuffer(1280),
  ]) {
    expect(
      AudioReportSchema.safeParse({ ...report, frame: audio }).success,
    ).toBe(false);
    expect(
      AudioReportSchema.safeParse({
        ...report,
        metrics: { ...report.metrics, samples: audio },
      }).success,
    ).toBe(false);
  }
  expect(
    AudioReportSchema.safeParse({
      ...report,
      metrics: { ...report.metrics, micLevel: Number.NaN },
    }).success,
  ).toBe(false);
});
it('guards audio-owning modules against persistent, network and logging sinks', () => {
  for (const file of [
    'src/audio/engine.ts',
    'src/audio/ring-buffer.ts',
    'src/audio/resampler.ts',
    'src/audio/mic-normalizer.ts',
    'src/audio/mic-check.ts',
    'entrypoints/audio-worklet.ts',
    'src/inference/pipeline.ts',
    'src/inference/rules.ts',
    'src/inference/models.ts',
    'entrypoints/inference-worker.ts',
    'entrypoints/speech-worker.ts',
  ]) {
    const source = readFileSync(resolve(file), 'utf8');
    expect(source, file).not.toMatch(
      /(?:chrome\.storage|indexedDB|localStorage|sessionStorage|\bDexie\b|\bMediaRecorder\b|\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bconsole\.(?:log|debug|info|warn|error)\s*\(|sendBeacon|FileSystemWritableFileStream)/,
    );
  }
});
