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
const duration = process.env.MIC_DURATION_SECONDS
  ? Number(process.env.MIC_DURATION_SECONDS)
  : null;
const expectedLaughs =
  process.env.MIC_EXPECT_LAUGHS === undefined
    ? null
    : Number(process.env.MIC_EXPECT_LAUGHS);
const expectedWords = process.env.MIC_EXPECT_WORDS
  ? JSON.parse(process.env.MIC_EXPECT_WORDS)
  : null;
const fixture =
  process.env.MIC_FIXTURE ||
  path.join(root, 'tests/fixtures/audio/laugh-lets-go.wav');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  viewport: { width: 1150, height: 800 },
  args: [
    `--disable-extensions-except=${build}`,
    `--load-extension=${build}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${fixture}`,
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
  let sawCalibration = false;
  const decisions = new Map();
  const deliveries = new Map();
  for (let n = 0; n < (duration ?? 90); n++) {
    diagnostic = await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
    );
    for (const row of diagnostic.inference?.accuracyLog ?? [])
      decisions.set(`${row.kind}-${row.ts}`, row);
    for (const event of diagnostic.inference?.events ?? []) {
      const key = `${event.kind}-${event.ts}`;
      if (!deliveries.has(key))
        deliveries.set(key, {
          kind: event.kind,
          observedMs: Date.now() - started,
          eventMs: event.ts - started,
          deliveryDelayMs: Math.max(0, Date.now() - event.ts),
        });
    }
    if (diagnostic.inference?.health.calibrationRemainingMs > 0)
      sawCalibration = true;
    if (
      !duration &&
      diagnostic.sessionLaughs > 0 &&
      diagnostic.sessionWords > 0
    )
      break;
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
  const shownWord = wordVisible
    ? (await reactions.getByText('your word:').innerText())
        .split(':')
        .slice(1)
        .join(':')
        .trim()
    : '';
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
  const counts = await popup.evaluate(async () => {
    const s = (await chrome.storage.local.get('laughline:state'))[
      'laughline:state'
    ];
    return {
      words: s?.session?.topWords ?? [],
      wordEvents: s?.session?.wordEvents ?? [],
    };
  });
  const report = {
    version: diagnostic.version,
    elapsedSeconds: (Date.now() - started) / 1000,
    context: diagnostic.audio?.context,
    mic: diagnostic.audio?.mic,
    audioMetrics: diagnostic.audio?.metrics,
    lab: diagnostic.lab,
    models: ai?.models,
    stages: ai?.stages,
    accuracyLog: ai?.accuracyLog,
    accuracyDecisions: [...decisions.values()],
    deliveries: [...deliveries.values()],
    laughDetectors: ai?.laughDetectors,
    words: counts.words,
    guard: ai?.guard,
    inferenceMicFrames: ai?.micFrames,
    vadProbability: ai?.health.vadProbability,
    sessionLaughs: diagnostic.sessionLaughs,
    sessionWords: diagnostic.sessionWords,
    panelLaughs: shownLaughs,
    panelWordVisible: wordVisible,
    panelWord: shownWord,
    sawCalibration,
    panelUpdatesDelivered: panelUpdates,
    speechBudget: {
      work10sMs: ai?.speechWork10sMs,
      backoffMs: ai?.speechBackoffMs,
      waitedMs: ai?.speechWaitedMs,
      allWork10sMs: ai?.modelWork10sMs,
    },
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
  if (expectedLaughs !== null && report.sessionLaughs !== expectedLaughs)
    throw new Error(
      `expected exactly ${expectedLaughs} laughs, got ${report.sessionLaughs}`,
    );
  if (
    expectedWords &&
    JSON.stringify(
      Object.fromEntries(report.words.map((w) => [w.word, w.count]).sort()),
    ) !==
      JSON.stringify(Object.fromEntries(Object.entries(expectedWords).sort()))
  )
    throw new Error('reaction word counts differ from fixture labels');
  if (expectedWords?.bro === 2 && shownWord !== 'bro')
    throw new Error('most-used reaction is not bro');
  if (
    expectedLaughs === null &&
    !expectedWords &&
    (!(report.sessionLaughs > 0) || !(report.sessionWords > 0))
  )
    throw new Error('fresh native session detected zero laughs or words');
  if (
    (expectedLaughs === null
      ? shownLaughs < report.sessionLaughs
      : shownLaughs !== report.sessionLaughs) ||
    (report.sessionWords > 0 && !wordVisible) ||
    !panelUpdates
  )
    throw new Error('counts did not reach the visible Twitch panel');
  if (process.env.MIC_TEST_UNDO === '1') {
    await stream
      .getByRole('button', { name: 'close detection debug', exact: true })
      .click();
    const read = () =>
      popup.evaluate(
        async () =>
          (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state
            .session.laughCount,
      );
    await stream
      .getByRole('button', { name: 'not me · undo last laugh', exact: true })
      .click();
    if ((await read()) !== report.sessionLaughs - 1)
      throw new Error('not me did not remove the laugh');
    await stream.getByRole('button', { name: 'undo', exact: true }).click();
    if ((await read()) !== report.sessionLaughs)
      throw new Error('undo toast did not restore the laugh');
    await stream
      .getByRole('button', { name: 'not me · undo last laugh', exact: true })
      .click();
    await new Promise((resolve) => setTimeout(resolve, 5200));
    await popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'RESTORE_LAUGH' }),
    );
    if ((await read()) !== report.sessionLaughs - 1)
      throw new Error('expired undo restored a laugh');
  }
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP' }));
  if (process.env.MIC_TEST_UNDO === '1') {
    const recapLaughs = await popup.evaluate(async () => {
      const state = (await chrome.storage.local.get('laughline:state'))[
        'laughline:state'
      ];
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('laughline');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('recaps', 'readonly'),
            r = tx.objectStore('recaps').get(state.lastRecapId);
          r.onsuccess = () => resolve(r.result?.totalLaughs);
          r.onerror = () => reject(r.error);
          tx.oncomplete = () => db.close();
        };
      });
    });
    if (recapLaughs !== report.sessionLaughs - 1)
      throw new Error('saved recap did not retain not-me correction');
    report.undo = {
      restoredWithinFiveSeconds: true,
      expiredAfterFiveSeconds: true,
      savedRecapLaughs: recapLaughs,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ undo: report.undo }));
  }
} finally {
  await context.close();
}
