import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { DiagnosticsSchema } from '../apps/extension/src/diagnostics';
import { decodeWav, encodeWav } from '../tools/eval/wav.mjs';

const id = 'fkocldgggcmhihelohiicoakcfomhepg';
const origin = `chrome-extension://${id}`;
const wav = path.resolve('tests/fixtures/audio/laugh-speech.wav');
const streamUrl = 'https://www.twitch.tv/nightowl_tv';

async function extractedProduction() {
  await mkdir('.test-runtime', { recursive: true });
  const folder = await mkdtemp(path.resolve('.test-runtime/production-audio-'));
  const archive = path.resolve(
    process.env.PRODUCTION_TEST_ZIP ?? 'releases/production/streamlaughs.zip',
  );
  expect(
    existsSync(archive),
    'Build production packages with pnpm build first',
  ).toBe(true);
  execFileSync(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['-m', 'zipfile', '-e', archive, folder],
    { windowsHide: true },
  );
  const manifest = JSON.parse(
    readFileSync(path.join(folder, 'manifest.json'), 'utf8'),
  );
  expect(manifest.content_security_policy.extension_pages).toContain(
    "'wasm-unsafe-eval'",
  );
  for (const file of [
    'offscreen.html',
    'audio-worklet.js',
    'inference-worker.js',
    'speech-worker.js',
    'models/silero-v5.onnx',
    'models/yamnet.tflite',
    'models/whisper-tiny.en/onnx/encoder_model_quantized.onnx',
    'runtime/onnx/ort-wasm-simd-threaded.jsep.wasm',
  ])
    expect(existsSync(path.join(folder, file)), file).toBe(true);
  expect(existsSync(path.join(folder, 'debug.html'))).toBe(false);
  return folder;
}

test('production Welcome checks a real fake-device mic, releases it, and hides diagnostics behind Shift-version', async () => {
  test.setTimeout(60000);
  const folder = await extractedProduction();
  console.info('production mic: extracted');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--load-extension=${folder}`,
      `--disable-extensions-except=${folder}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  try {
    context.setDefaultTimeout(15000);
    console.info('production mic: launched');
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    console.info('production mic: worker loaded');
    expect(new URL(worker.url()).host).toBe(id);
    const welcome = await context.newPage();
    await welcome.goto(`${origin}/welcome.html?step=mic`);
    await welcome.evaluate(() => {
      const get = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      const tracks: MediaStreamTrack[] = [];
      Object.assign(window, { permissionTracks: tracks });
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await get(constraints);
        tracks.push(...stream.getTracks());
        return stream;
      };
    });
    await welcome
      .getByRole('button', { name: 'allow mic', exact: true })
      .click();
    console.info('production mic: checking input');
    await expect(welcome.getByLabel('welcome mic input')).toBeVisible();
    await expect(
      welcome.getByText('mic looks good ✓', { exact: true }),
    ).toBeVisible();
    console.info('production mic: input checked');
    expect(
      await welcome.evaluate(() =>
        Reflect.get(window, 'permissionTracks').every(
          (track: MediaStreamTrack) => track.readyState === 'ended',
        ),
      ),
    ).toBe(true);
    const popup = await context.newPage();
    await popup.goto(`${origin}/popup.html`);
    await popup.getByRole('button', { name: 'settings', exact: true }).click();
    const before = context.pages().length;
    await popup.getByRole('button', { name: /^version / }).click();
    expect(context.pages()).toHaveLength(before);
    const opened = context.waitForEvent('page');
    await popup
      .getByRole('button', { name: /^version / })
      .click({ modifiers: ['Shift'] });
    console.info('production mic: diagnostics opened');
    const diagnostics = await opened;
    await expect(diagnostics.getByTestId('diagnostics-capture')).toContainText(
      'idle',
    );
    const report = await diagnostics.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
    );
    expect(DiagnosticsSchema.safeParse(report).success).toBe(true);
  } finally {
    await context.close();
  }
});

for (const [label, volume] of [
  ['normal', 0.25],
  ['loud', 1],
  ['speech only', 0.25],
] as const) {
  test(`production ZIP detects real recorded laughs and speech with ${label} tab playback`, async () => {
    test.setTimeout(150000);
    const folder = await extractedProduction();
    let microphone = wav;
    if (label === 'loud' && process.env.AUDIO_SYNTHETIC_TONE === '1') {
      // Optional noise stress probe, separate from the unchanged recorded-mic regression.
      const samples = decodeWav(readFileSync(wav));
      for (let i = 0; i < samples.length; i++)
        samples[i] += 0.04 * Math.sin((i * Math.PI * 2 * 317) / 16000);
      microphone = path.join(
        folder,
        '..',
        `speaker-mic-${path.basename(folder)}.wav`,
      );
      await writeFile(microphone, encodeWav(samples));
      samples.fill(0);
    } else if (label === 'speech only') {
      const source = decodeWav(readFileSync(wav));
      const samples = new Float32Array(76032 + 128000);
      samples.set(source.subarray(0, 76032));
      source.fill(0);
      microphone = path.join(
        folder,
        '..',
        `speech-mic-${path.basename(folder)}.wav`,
      );
      await writeFile(microphone, encodeWav(samples));
      samples.fill(0);
    }
    // fake-ui overrides tab capture with a default device (Chromium content_switches.cc).
    // auto-accept only handles microphone consent; tabCapture/getUserMedia remain real.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      permissions: ['microphone'],
      args: [
        `--load-extension=${folder}`,
        `--disable-extensions-except=${folder}`,
        `--allowlisted-extension-id=${id}`,
        '--auto-accept-camera-and-microphone-capture',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${microphone}`,
      ],
    });
    const pageErrors: { page: string; error: string; stack: string }[] = [];
    context.on('page', (page) =>
      page.on('pageerror', (error) =>
        pageErrors.push({
          page: page.url().split('?')[0]!,
          error: error.message,
          stack: error.stack?.slice(0, 1200) ?? '',
        }),
      ),
    );
    try {
      context.setDefaultTimeout(20000);
      await context.route('https://www.twitch.tv/**', (route) =>
        route.request().url().endsWith('/stream.mp4')
          ? route.fulfill({
              contentType: 'video/mp4',
              path: path.resolve('tests/fixtures/audio/stream.mp4'),
            })
          : route.fulfill({
              contentType: 'text/html',
              body: `<!doctype html><html><body><div data-a-target="video-player"><video width="960" height="540" loop src="/stream.mp4"></video></div><button id="play">play stream</button><script>document.getElementById('play').onclick=async()=>{const v=document.querySelector('video');v.volume=${volume};await v.play();}</script></body></html>`,
            }),
      );
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      expect(new URL(worker.url()).host).toBe(id);
      const welcome = await context.newPage();
      await welcome.goto(`${origin}/welcome.html?step=mic`);
      await welcome
        .getByRole('button', { name: 'allow mic', exact: true })
        .click();
      await expect(
        welcome.getByText('mic looks good ✓', { exact: true }),
      ).toBeVisible();
      // The final navigation is covered by polish.spec.ts. Extension-created
      // tabs can start their first navigation before Playwright attaches routing;
      // keep unrelated live directory scripts/iframes out of this audio fixture.
      await welcome.close();
      const stream = await context.newPage();
      await stream.goto(streamUrl);
      await stream
        .getByRole('button', { name: 'play stream', exact: true })
        .click();
      await expect
        .poll(() =>
          worker.evaluate(
            async () =>
              (
                await chrome.tabs.query({
                  url: 'https://www.twitch.tv/nightowl_tv',
                })
              )[0]?.audible,
          ),
        )
        .toBe(true);
      const opened = context.waitForEvent('page', {
        predicate: (page) => page.url().endsWith('/popup.html'),
      });
      await worker.evaluate(() =>
        chrome.tabs.create({
          url: chrome.runtime.getURL('/popup.html'),
          active: false,
        }),
      );
      const popup = await opened;
      await popup.getByRole('button', { name: 'start', exact: true }).click();
      console.info(`production audio: ${label} capture requested`);
      const diagnostics = await context.newPage();
      await diagnostics.goto(`${origin}/diagnostics.html`);
      const report = async () =>
        DiagnosticsSchema.parse(
          await diagnostics.evaluate(() =>
            chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
          ),
        );
      await expect(
        diagnostics.getByTestId('diagnostics-capture'),
      ).toContainText('active');
      for (const model of ['vad', 'yamnet', 'whisper'])
        await expect(
          diagnostics.getByTestId(`${model}-model-state`),
        ).toHaveText('ready', { timeout: 60000 });
      console.info(`production audio: ${label} local models ready`);
      await expect
        .poll(async () => (await report()).inference?.micFps ?? 0)
        .toBeGreaterThan(35);
      await expect
        .poll(async () => (await report()).inference?.tabFps ?? 0)
        .toBeGreaterThan(35);
      const counts = () =>
        worker.evaluate(async () => {
          const s = (await chrome.storage.local.get('laughline:state'))[
            'laughline:state'
          ];
          return {
            laughs: s.session?.laughCount ?? 0,
            words:
              s.session?.topWords?.reduce(
                (n: number, w: { count: number }) => n + w.count,
                0,
              ) ?? 0,
          };
        });
      const peakClasses: Record<string, number> = {};
      try {
        if (label === 'speech only') {
          await diagnostics.waitForTimeout(20000);
          expect((await counts()).laughs).toBe(0);
        } else {
          await expect
            .poll(
              async () => {
                const top = (await report()).inference?.topClass;
                if (top)
                  peakClasses[top.label] = Math.max(
                    peakClasses[top.label] ?? 0,
                    top.score,
                  );
                return (await counts()).laughs;
              },
              {
                timeout: Number(
                  process.env.AUDIO_REGRESSION_TIMEOUT_MS ?? 90000,
                ),
                intervals: [200],
              },
            )
            .toBeGreaterThan(0);
        }
        await expect
          .poll(async () => (await counts()).words, { timeout: 30000 })
          .toBeGreaterThan(0);
      } catch (error) {
        console.info(
          JSON.stringify({
            case: label,
            counts: await counts(),
            diagnostics: (await report()).inference,
            peakClasses,
          }),
        );
        throw error;
      }
      const value = await report();
      console.info(
        JSON.stringify({
          case: label,
          counts: await counts(),
          micFrames: value.inference?.micFrames,
          tabFrames: value.inference?.tabFrames,
          micFps: value.inference?.micFps,
          drops: value.inference?.health.drops,
          lowPower: value.inference?.health.lowPower,
          models: value.inference?.models,
          peakClasses,
        }),
      );
      expect(value.audio?.mic).toMatchObject({ state: 'live', muted: false });
      expect(value.audio?.metrics.tabFrames).toBeGreaterThan(200);
      expect(value.audio?.metrics.micFrames).toBeGreaterThan(200);
      expect(value.inference).toMatchObject({
        sampleRate: 16000,
        frameSamples: 320,
      });
      expect(value.inference?.guard.kept).toBe(true);
      await diagnostics.evaluate(() => {
        Object.assign(window, { copiedReport: '' });
        navigator.clipboard.writeText = async (value) => {
          Reflect.set(window, 'copiedReport', value);
        };
      });
      await diagnostics
        .getByRole('button', { name: 'copy report', exact: true })
        .click();
      const copied = await diagnostics.evaluate(() =>
        Reflect.get(window, 'copiedReport'),
      );
      expect(DiagnosticsSchema.safeParse(JSON.parse(copied)).success).toBe(
        true,
      );
      expect(copied).not.toMatch(
        /"(?:transcript|lastTranscript|phrases|text)"\s*:|"samples"\s*:\s*\[/i,
      );
      await popup.getByRole('button', { name: 'stop', exact: true }).click();
      await expect
        .poll(() =>
          worker.evaluate(() =>
            chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            }),
          ),
        )
        .toHaveLength(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
