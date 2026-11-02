// Focused production-ZIP microphone regression; no model/frame injection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = path.resolve(
  process.env.AUDIO_PROBE_BUILD ||
    path.join(root, 'apps/extension/.output/chrome-mv3'),
);
const origin = 'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg';
const reportPath =
  process.env.MIC_SESSION_REPORT ||
  path.join(root, '.test-runtime/mic-session-report.json');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  viewport: { width: 1150, height: 800 },
  args: [
    `--disable-extensions-except=${build}`,
    `--load-extension=${build}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${path.join(root, 'tests/fixtures/audio/laugh-lets-go.wav')}`,
  ],
});
try {
  await context.route('https://www.twitch.tv/**', (route) => {
    if (new URL(route.request().url()).pathname === '/mic-fixture.mp4')
      return route.fulfill({
        path: path.join(root, 'tests/fixtures/audio/stream.mp4'),
        contentType: 'video/mp4',
      });
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>StreamLaughs local mic fixture</title><style>body{background:#14141a;color:white;font:18px Arial}.video-player{width:1000px}video{width:100%}</style><h1>local test · no real viewers</h1><div class="video-player" data-a-target="video-player"><video src="/mic-fixture.mp4" loop controls></video></div><h2 data-a-target="channel-header-display-name">mic_fixture</h2>',
    });
  });
  await context.route(
    'https://streamlaughs-crowd.streamlaughs.workers.dev/**',
    (route) => route.abort(),
  );
  await context.routeWebSocket(
    'wss://streamlaughs-crowd.streamlaughs.workers.dev/**',
    (socket) => socket.close(),
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  const stream = await context.newPage();
  await stream.goto('https://www.twitch.tv/mic_fixture');
  await stream.locator('video').click();
  await stream.locator('video').evaluate((v) => v.play());
  const tabId = await worker.evaluate(
    async () =>
      (await chrome.tabs.query({ url: 'https://www.twitch.tv/mic_fixture' }))[0]
        .id,
  );
  const popup = await context.newPage();
  await popup.addInitScript((tabId) => {
    chrome.tabs.query = async () => [await chrome.tabs.get(tabId)];
  }, tabId);
  await popup.goto(origin + '/popup.html');
  await popup.evaluate(async () => {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    mic.getTracks().forEach((t) => t.stop());
    await chrome.storage.local.set({ 'streamlaughs:mic-consent': true });
    await chrome.runtime.sendMessage({
      type: 'SETTINGS',
      settings: { listen: true, share: false },
    });
  });
  await popup.getByRole('button', { name: 'start', exact: true }).click();
  await stream.bringToFront();
  // No tab capture or lab switches: exercise the first, unmodified Start path.
  const started = Date.now();
  let diagnostic;
  for (let n = 0; n < 90; n++) {
    diagnostic = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
    );
    if (diagnostic.sessionLaughs > 0 && diagnostic.sessionWords > 0) break;
    if (n === 10 && !(diagnostic.audio?.metrics.micFrames > 0)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const dot = stream.getByRole('button', {
    name: /StreamLaughs, .*drag to move/i,
  });
  await dot.click();
  const panel = stream.getByRole('dialog', { name: 'fans box', exact: true });
  const reactions = panel.getByRole('region', { name: 'your reactions' });
  await reactions.waitFor({ state: 'visible', timeout: 5000 });
  const shownLaughs = Number(await reactions.locator('strong').innerText());
  const wordVisible = await reactions.getByText('your word:').isVisible();
  await stream.keyboard.press('Alt+Shift+D');
  const debug = stream.getByRole('dialog', {
    name: 'local detection debug',
    exact: true,
  });
  const deliveredText = await debug
    .getByText(/^panel updates delivered:/)
    .innerText();
  const panelUpdates = Number(
    /panel updates delivered: (\d+)/.exec(deliveredText)?.[1] ?? 0,
  );
  const ai = diagnostic.inference;
  const report = {
    version: diagnostic.version,
    elapsedSeconds: (Date.now() - started) / 1000,
    context: diagnostic.audio?.context,
    mic: diagnostic.audio?.mic,
    audioMetrics: diagnostic.audio?.metrics,
    lab: diagnostic.lab,
    models: ai?.models,
    stages: ai?.stages,
    guard: ai?.guard,
    inferenceMicFrames: ai?.micFrames,
    vadProbability: ai?.health.vadProbability,
    sessionLaughs: diagnostic.sessionLaughs,
    sessionWords: diagnostic.sessionWords,
    panelLaughs: shownLaughs,
    panelWordVisible: wordVisible,
    panelUpdatesDelivered: panelUpdates,
    speechOverruns: ai?.speechOverruns,
    speechCooldownMs: ai?.speechCooldownMs,
    nativePlayback:
      diagnostic.audio?.playbackContext === 'closed' &&
      !diagnostic.lab?.tabCapture,
    error: diagnostic.error || diagnostic.audio?.error || ai?.error || '',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.nativePlayback) throw new Error('Twitch playback was rerouted');
  if (!(report.audioMetrics?.micFrames > 0) || !(report.inferenceMicFrames > 0))
    throw new Error('fresh native session produced zero mic frames');
  if (!(report.sessionLaughs > 0) || !(report.sessionWords > 0))
    throw new Error('fresh native session detected zero laughs or words');
  if (!(shownLaughs > 0) || !wordVisible || !panelUpdates)
    throw new Error('counts did not reach the visible Twitch panel');
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP' }));
} finally {
  await context.close();
}
