import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import {
  createRecap,
  applyPersonalEvent,
  MySessionSchema,
} from '@laughline/shared';
import { expect, it, vi } from 'vitest';
import { decodeWav } from '../../../../tools/eval/wav.mjs';
import { InferencePipeline } from './pipeline';
import { createDatabase } from '../db';
it.each(['independent', 'tab playback'] as const)(
  'quiet recording with models unavailable: %s',
  async (mode) => {
    const wav = decodeWav(
      readFileSync('../../tests/fixtures/audio/laugh-lets-go.wav'),
    );
    const input = wav; // actual fixture decoded to Float32 PCM in RAM only
    let session = MySessionSchema.parse({
      id: 'quiet',
      channel: 'grimm',
      tabId: 1,
      startedAt: 10000,
      endedAt: null,
      laughCount: 0,
      laughEvents: [],
      peakCrowd: 0,
      crowdViewers: 0,
      topWords: [],
      source: 'local',
    });
    const words = vi.fn(async () => {
      throw new Error('Whisper unavailable');
    });
    const pipeline = new InferencePipeline(
      {
        vad: async (samples) =>
          Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length) >
          0.006
            ? 0.9
            : 0,
        sound: () => {
          throw new Error('YAMNet unavailable');
        },
        words,
      },
      (e) => {
        session = applyPersonalEvent(session, e, 0);
      },
    );
    let seed = 1;
    for (let offset = 0; offset + 320 <= input.length; offset += 320) {
      const mic = new Float32Array(320),
        tab = new Float32Array(320);
      for (let n = 0; n < 320; n++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 4294967296 - 0.5) * 0.00018;
        tab[n] = Math.sin(((offset + n) * 2 * Math.PI * 317) / 16000) * 0.02;
        mic[n] = input[offset + n]! * 0.015 + noise + tab[n]! * 0.025;
        if (mode === 'tab playback') {
          tab[n] = input[offset + n]! * 0.3;
          mic[n] = tab[n]! * 0.05 + noise * 0.1;
        }
      }
      const ts = 10000 + offset / 16;
      pipeline.ingest('tab', tab, ts);
      pipeline.ingest('mic', mic, ts);
      while (pipeline.pendingWork) await pipeline.step();
    }
    await pipeline.finishSpeech();
    session.endedAt = 40000;
    const database = createDatabase(`quiet-${crypto.randomUUID()}`);
    try {
      await database.sessions.put(session);
      await database.recaps.put(createRecap(session, 40000));
      const laughs = (await database.recaps.get('quiet'))?.totalLaughs ?? 0;
      if (mode === 'independent') expect(laughs).toBeGreaterThanOrEqual(1);
      else expect(laughs).toBe(0);
      console.info(
        JSON.stringify({
          fixture: mode,
          laughs,
          dspHits: pipeline.diagnostics().stages.dspHits,
          whisperRequests: words.mock.calls.length,
        }),
      );
      expect(pipeline.diagnostics().stages.dspHits).toBeGreaterThanOrEqual(1);
      expect(words).toHaveBeenCalled();
    } finally {
      pipeline.clear();
      database.close();
      await database.delete();
    }
  },
);
