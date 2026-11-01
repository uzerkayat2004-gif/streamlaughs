// Targeted local-model regression, not a website e2e test. No audio or transcripts are logged.
import fs from 'node:fs';
import { decodeWav } from './wav.mjs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = fileURLToPath(new URL('../../', import.meta.url))
  .replace(/\\/g, '/')
  .replace(/\/$/, '');
const build =
  process.env.AUDIO_PROBE_BUILD || root + '/apps/extension/.output/chrome-mv3';
(async () => {
  const pcm = Array.from(
    decodeWav(
      fs.readFileSync(root + '/tests/fixtures/audio/laugh-lets-go.wav'),
    ),
  );
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${build}`,
      `--load-extension=${build}`,
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  try {
    const page = await ctx.newPage();
    await page.goto(
      'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg/mic-test.html',
    );
    const result = await page.evaluate(async (pcm) => {
      const rt = new Worker(chrome.runtime.getURL('/inference-worker.js')),
        speech = new Worker(chrome.runtime.getURL('/speech-worker.js')),
        sound = new Worker(chrome.runtime.getURL('/sound-worker.js'));
      const base = chrome.runtime.getURL('').replace(/\/$/, '');
      let soundReady = false,
        speechReady = false,
        vadReady = false,
        lastStatus = null,
        frames = 0;
      const events = [],
        speechTimes = [],
        errors = [];
      rt.onmessage = ({ data: d }) => {
        if (d.type === 'speech_request')
          speech.postMessage({ type: 'speech', id: d.id, samples: d.samples }, [
            d.samples.buffer,
          ]);
        if (d.type === 'sound_request')
          sound.postMessage({ ...d, type: 'sound' }, [
            d.samples.buffer,
            ...(d.reference ? [d.reference.buffer] : []),
          ]);
        if (d.type === 'status') {
          lastStatus = d;
          vadReady = d.diagnostics?.models?.vad?.phase === 'ready';
          for (const e of d.events || [])
            events.push({
              kind: e.kind,
              ts: e.ts,
              delivery: Date.now() - e.ts,
              count:
                e.kind === 'words'
                  ? e.phrases.reduce((n, p) => n + p.count, 0)
                  : 1,
            });
        }
      };
      speech.onmessage = ({ data: d }) => {
        if (d.type === 'speech_status') {
          speechReady = d.model.phase === 'ready';
          if (d.model.error) errors.push(d.model.error);
          rt.postMessage(d);
        }
        if (d.type === 'speech_result') {
          speechTimes.push(d.computeMs || 0);
          if (d.error) errors.push(d.error);
          rt.postMessage({
            type: 'speech_result',
            id: d.id,
            ...(d.result ? { result: d.result } : { error: d.error }),
          });
        }
      };
      sound.onmessage = ({ data: d }) => {
        if (d.type === 'sound_status') {
          soundReady = d.model.phase === 'ready';
          if (d.model.error) errors.push(d.model.error);
          rt.postMessage(d);
        }
        if (d.type === 'sound_result') rt.postMessage(d);
      };
      rt.postMessage({ type: 'init', externalSound: true, base });
      speech.postMessage({ type: 'init', base });
      sound.postMessage({ type: 'init', base });
      const until = Date.now() + 90000;
      while (!(soundReady && speechReady && vadReady) && Date.now() < until)
        await new Promise((r) => setTimeout(r, 50));
      if (!(soundReady && speechReady && vadReady))
        throw new Error('models not ready');
      const start = Date.now();
      for (let offset = 0; offset + 320 <= pcm.length; offset += 320) {
        await new Promise((r) =>
          setTimeout(r, Math.max(0, start + (offset + 320) / 16 - Date.now())),
        );
        const frame = Float32Array.from(pcm.slice(offset, offset + 320));
        rt.postMessage(
          {
            type: 'frame',
            source: 'mic',
            frame,
            ts: start + (offset + 320) / 16,
          },
          [frame.buffer],
        );
        frames++;
      }
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const frame = new Float32Array(320);
        rt.postMessage(
          { type: 'frame', source: 'mic', frame, ts: Date.now() },
          [frame.buffer],
        );
      }
      await new Promise((r) => setTimeout(r, 4000));
      const result = {
        version: chrome.runtime.getManifest().version,
        frames,
        laughs: events.filter((e) => e.kind === 'laugh').length,
        words: events
          .filter((e) => e.kind === 'words')
          .reduce((n, e) => n + e.count, 0),
        laughDeliveryMs: events
          .filter((e) => e.kind === 'laugh')
          .map((e) => e.delivery),
        wordDeliveryMs: events
          .filter((e) => e.kind === 'words')
          .map((e) => e.delivery),
        speechComputeMs: speechTimes,
        stages: lastStatus?.diagnostics?.stages,
        errors: [...new Set(errors)].slice(-5),
      };
      rt.terminate();
      speech.terminate();
      sound.terminate();
      return result;
    }, pcm);
    console.log(
      JSON.stringify({
        ...result,
        latencyDefinition:
          'recognized audio frame / completed speech segment to local worker receipt; excludes the detector evidence window and speech duration',
      }),
    );
    if (!result.laughs || !result.words)
      throw new Error(
        'recorded speech + laugh fixture must yield both reactions',
      );
    if (result.laughDeliveryMs.some((ms) => ms >= 500))
      throw new Error('recognized-frame laugh delivery exceeded 500 ms');
    if (result.wordDeliveryMs.some((ms) => ms >= 3000))
      throw new Error('speech-segment delivery exceeded 3 seconds');
  } finally {
    await ctx.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
