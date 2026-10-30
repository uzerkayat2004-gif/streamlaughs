import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { decodeWav } from '../tools/eval/wav.mjs';

test('packaged YAMNet preserves recorded laughter under a known additive tab reference', async () => {
  test.setTimeout(120000);
  const folder = path.resolve('apps/extension/.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--load-extension=${folder}`,
      `--disable-extensions-except=${folder}`,
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  try {
    const page = await context.newPage();
    await page.goto(
      'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg/diagnostics.html',
    );
    const samples = decodeWav(
      readFileSync('tests/fixtures/audio/laugh-lets-go.wav'),
    );
    const result = await page.evaluate(
      async (values) => {
        const source = Float32Array.from(values),
          worker = new Worker(chrome.runtime.getURL('/sound-worker.js'));
        const pending = new Map<
          number,
          (v: {
            scores: { laugh: number };
            echo: { removed: boolean; inputRms: number; outputRms: number };
          }) => void
        >();
        let next = 0;
        await new Promise<void>((resolve, reject) => {
          worker.onmessage = ({ data }) => {
            if (data.type === 'sound_status' && data.model.phase === 'ready')
              resolve();
            if (data.type === 'sound_status' && data.model.phase === 'error')
              reject(new Error(data.model.error));
            if (data.type === 'sound_result') {
              pending.get(data.id)?.(data);
              pending.delete(data.id);
            }
          };
          worker.postMessage({
            type: 'init',
            base: chrome.runtime.getURL('').replace(/\/$/, ''),
          });
        });
        const maxima = { human: 0, mixed: 0, cleaned: 0, removed: 0 };
        try {
          for (
            let offset = 8 * 16000;
            offset + 15600 < source.length;
            offset += 4000
          ) {
            const human = source.slice(offset, offset + 15600),
              reference = Float32Array.from(
                { length: 22000 },
                (_, i) =>
                  0.1 *
                  Math.sin(((offset - 6400 + i) * 2 * Math.PI * 317) / 16000),
              );
            const mixed = human.map((v, i) => v + 0.4 * reference[6400 + i]!);
            for (const kind of ['human', 'mixed', 'cleaned'] as const) {
              const data = await new Promise<{
                scores: { laugh: number };
                echo: { removed: boolean; inputRms: number; outputRms: number };
              }>((resolve) => {
                const id = ++next;
                pending.set(id, resolve);
                worker.postMessage({
                  type: 'sound',
                  id,
                  samples: kind === 'human' ? human : mixed,
                  reference: kind === 'cleaned' ? reference : undefined,
                });
              });
              maxima[kind] = Math.max(maxima[kind], data.scores.laugh);
              if (kind === 'cleaned' && data.echo.removed) maxima.removed++;
            }
          }
        } finally {
          source.fill(0);
          worker.terminate();
        }
        return maxima;
      },
      [...samples],
    );
    samples.fill(0);
    console.info('packaged reference probe:', JSON.stringify(result));
    expect(result.human).toBeGreaterThanOrEqual(0.5);
    expect(result.cleaned).toBeGreaterThanOrEqual(0.5);
  } finally {
    await context.close();
  }
});
