// Isolated production-extension/audio fixture, not the website e2e runner.
// No audio/transcripts are collected. The existing WAV is Chrome's fake input.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const build = path.resolve(
  process.env.AUDIO_PROBE_BUILD ||
    path.join(root, 'apps/extension/.output/chrome-mv3'),
);
const seconds = Number(process.env.STUTTER_SECONDS || 300);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 1800)
  throw new Error(
    'STUTTER_SECONDS must be 10..1800; acceptance requires 300 (five minutes)',
  );
const reportPath =
  process.env.STUTTER_REPORT ||
  path.join(root, '.test-runtime/stutter-report.json');
const id = 'fkocldgggcmhihelohiicoakcfomhepg',
  origin = `chrome-extension://${id}`;
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  viewport: { width: 1150, height: 800 },
  args: [
    `--disable-extensions-except=${build}`,
    `--load-extension=${build}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${path.join(root, 'tests/fixtures/audio/accuracy/existing-laugh-word.wav')}`,
  ],
});
try {
  await context.route('https://www.twitch.tv/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/stutter-fixture.mp4')
      return route.fulfill({
        path: path.join(root, 'tests/fixtures/audio/stream.mp4'),
        contentType: 'video/mp4',
      });
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>StreamLaughs stutter fixture</title><style>body{background:#14141a;color:white;font:18px Arial}.video-player{width:1000px}video{width:100%}</style><h1>local audio fixture · no real viewers</h1><div class="video-player" data-a-target="video-player"><video src="/stutter-fixture.mp4" autoplay loop controls></video></div><h2 data-a-target="channel-header-display-name">stutter_fixture</h2>',
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
  await stream.goto('https://www.twitch.tv/stutter_fixture');
  await stream.locator('video').click();
  await stream.locator('video').evaluate((v) => v.play());
  const tabId = await worker.evaluate(
    async () =>
      (
        await chrome.tabs.query({
          url: 'https://www.twitch.tv/stutter_fixture',
        })
      )[0].id,
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
  let diagnose = () =>
    popup.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
    );
  const until = Date.now() + 90000;
  let initial;
  while (Date.now() < until) {
    initial = await diagnose();
    if (
      initial.inference &&
      ['vad', 'yamnet', 'whisper'].every(
        (n) => initial.inference.models[n].phase === 'ready',
      )
    )
      break;
    await popup.waitForTimeout(500);
  }
  if (
    !initial?.inference ||
    !['vad', 'yamnet', 'whisper'].every(
      (n) => initial.inference.models[n].phase === 'ready',
    )
  )
    throw new Error(
      'production capture/models did not start: ' + JSON.stringify(initial),
    );
  if (
    initial.audio.lab.tabCapture ||
    initial.audio.playbackContext !== 'closed'
  )
    throw new Error('default session reroutes Twitch audio');
  const defaults = {
    tabCapture: false,
    micCapture: true,
    laughModel: true,
    speechModel: true,
    overlay: true,
  };
  let capturedTabProbe = null;
  const switchComparisons = [];
  // Isolate normal Start from optional live reconfiguration stress. Report which
  // path was measured; a fresh default session must not imply switch coverage.
  const changes = [
    ...(process.env.STUTTER_TAB_PROBE === '1' ? [{ tabCapture: true }] : []),
    { speechModel: false },
    { micCapture: false },
    { micCapture: true, laughModel: false, speechModel: true },
    { overlay: false },
    {},
  ];
  for (const change of process.env.STUTTER_DEFAULT_SESSION === '1' ? [] : changes) {
    const result = await popup.evaluate(
      (switches) =>
        chrome.runtime.sendMessage({ type: 'STUTTER_LAB', switches }),
      { ...defaults, ...change },
    );
    if (!result.ok)
      throw new Error('live stutter switch failed: ' + result.error);
    if ('tabCapture' in change && change.tabCapture) {
      await popup.waitForTimeout(10000);
      capturedTabProbe = (await diagnose()).audio.playback;
      if (capturedTabProbe.state !== 'running')
        throw new Error('opt-in passthrough did not run');
      console.log(JSON.stringify({ capturedTabProbe }));
    }
    const values = [];
    for (let n = 0; n < 10; n++) {
      await popup.waitForTimeout(1000);
      const d = await diagnose();
      values.push({
        vad: d.inference?.vadCpuMsPerSecond ?? 0,
        sound: d.inference?.soundCpuMsPerSecond ?? 0,
        speech: d.inference?.speechCpuMsPerSecond ?? 0,
        offscreenLongTasks: d.offscreenTasks,
        hasTab: d.audio?.tab.state,
        context: d.audio?.playbackContext,
      });
    }
    const row = { switches: { ...defaults, ...change }, samples: values };
    switchComparisons.push(row);
    console.log(
      JSON.stringify({
        switchPhase: change,
        meanElapsedWorkMsPerSecond:
          values.reduce((n, v) => n + v.vad + v.sound + v.speech, 0) /
          values.length,
        offscreenTasks: values.at(-1)?.offscreenLongTasks,
      }),
    );
  }
  // Re-enabling the mic/models is asynchronous. Do not include a cold reload in the steady-state denominator.
  for (let n = 0; n < 180; n++) {
    const d = await diagnose();
    if (
      ['vad', 'yamnet', 'whisper'].every(
        (k) => d.inference?.models[k]?.phase === 'ready',
      )
    )
      break;
    await popup.waitForTimeout(500);
  }
  await popup.waitForTimeout(12000);
  // A real action popup closes when the viewer returns to Twitch. Do not leave
  // a second React UI painting in the offscreen renderer for the whole soak.
  if (process.env.STUTTER_KEEP_POPUP !== '1') {
    for (const page of context.pages())
      if (page.url().startsWith(origin)) await page.close();
    await stream.bringToFront();
    diagnose = () =>
      worker.evaluate(async () => {
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'AUDIO_DIAGNOSTICS',
        });
        if (!result?.ok) throw new Error('offscreen diagnostics unavailable');
        const values = await chrome.storage.local.get('laughline:state'),
          s = values['laughline:state'];
        return {
          ...result.value,
          version: chrome.runtime.getManifest().version,
          sessionLaughs: s?.session?.laughCount ?? 0,
          sessionWords:
            s?.session?.topWords?.reduce((n, w) => n + w.count, 0) ?? 0,
        };
      });
  }
  await stream.evaluate(() => {
    const stats = { count: 0, worstMs: 0 };
    window.streamlaughsSoakTasks = stats;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        stats.count++;
        stats.worstMs = Math.max(stats.worstMs, entry.duration);
      }
    });
    observer.observe({ type: 'longtask' });
  });
  const before = await diagnose(),
    qualityBefore = await stream
      .locator('video')
      .evaluate((v) => v.getVideoPlaybackQuality().droppedVideoFrames);
  console.log(
    JSON.stringify({
      measurementStart: {
        offscreenTasks: before.offscreenTasks,
        version: before.version,
      },
    }),
  );
  let worstOffscreen = 0,
    peakCpu = 0,
    totalCpu = 0,
    samples = 0,
    maxGaps = 0,
    errors = 0,
    peakWork10sMs = 0;
  const started = Date.now();
  for (let elapsed = 0; elapsed < seconds; elapsed++) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, started + (elapsed + 1) * 1000 - Date.now()),
      ),
    );
    const d = await diagnose();
    if (!d.audio || d.audio.mic.state !== 'live')
      throw new Error('mic lost during simulated session');
    if (
      d.audio.playbackContext !== 'closed' ||
      d.audio.lab.tabCapture ||
      d.audio.speakerConnections ||
      d.audio.tabCaptureTracks
    )
      throw new Error('native playback unexpectedly captured');
    if ((d.offscreenTasks?.count ?? 0) > (before.offscreenTasks?.count ?? 0))
      worstOffscreen = Math.max(worstOffscreen, d.offscreenTasks?.worstMs ?? 0);
    const cpu =
      (d.inference?.vadCpuMsPerSecond ?? 0) +
      (d.inference?.soundCpuMsPerSecond ?? 0) +
      (d.inference?.speechCpuMsPerSecond ?? 0);
    peakWork10sMs = Math.max(peakWork10sMs, d.inference?.modelWork10sMs ?? 0);
    totalCpu += cpu;
    samples++;
    peakCpu = Math.max(peakCpu, cpu);
    maxGaps = Math.max(maxGaps, d.audio.playback?.watchdogGaps ?? 0);
    if (Object.values(d.inference?.models ?? {}).some((m) => m.error)) errors++;
    if ((elapsed + 1) % 60 === 0)
      console.log(
        JSON.stringify({
          elapsedSeconds: elapsed + 1,
          worstOffscreenLongTaskMs: worstOffscreen,
          outputGaps: maxGaps,
          modelWorkMeanMsPerSecond: totalCpu / samples,
        }),
      );
  }
  const after = await diagnose(),
    quality = await stream.locator('video').evaluate((v) => {
      const q = v.getVideoPlaybackQuality();
      return {
        droppedVideoFrames: q.droppedVideoFrames,
        totalVideoFrames: q.totalVideoFrames,
      };
    });
  const contentTasks = await stream.evaluate(
    () => window.streamlaughsSoakTasks,
  );
  const report = {
    version: after.version,
    durationSeconds: (Date.now() - started) / 1000,
    acceptanceDuration: seconds >= 300,
    nativeTwitchPlayback: true,
    extensionPassthroughContexts: 0,
    nativeAudioUnderruns: null,
    nativeAudioUnderrunsNote:
      'HTML video exposes no audio underrun counter; no extension passthrough exists',
    outputClockGaps: maxGaps,
    setupOffscreenLongTasks: before.offscreenTasks,
    offscreenLongTasks: after.offscreenTasks,
    newOffscreenLongTasks:
      (after.offscreenTasks?.count ?? 0) - (before.offscreenTasks?.count ?? 0),
    worstOffscreenLongTaskMs: worstOffscreen,
    workerTasks: after.inference?.workerTasks,
    contentLongTasks: contentTasks,
    speakerConnections: after.audio.speakerConnections,
    tabCaptureTracks: after.audio.tabCaptureTracks,
    modelWorkMsPerSecond: {
      mean: totalCpu / samples,
      peak: peakCpu,
      definition: 'elapsed inference work, not OS CPU utilization',
    },
    droppedVideoFrames: quality.droppedVideoFrames - qualityBefore,
    totalVideoFrames: quality.totalVideoFrames,
    mic: after.audio.mic,
    laughs: after.sessionLaughs - before.sessionLaughs,
    words: after.sessionWords - before.sessionWords,
    modelErrors: errors,
    speechBudgetOverruns: after.inference?.speechOverruns ?? 0,
    speechCooldownMs: after.inference?.speechCooldownMs ?? 0,
    modelWork10sMs: {
      peak: peakWork10sMs,
      limit: 2500,
      definition:
        'conservative elapsed model work, sleeps excluded; not an OS CPU measurement',
    },
    switchComparisons,
    liveSwitchesPassed: switchComparisons.length > 0,
    defaultSession: process.env.STUTTER_DEFAULT_SESSION === '1',
    capturedTabProbe,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  const stop = popup.isClosed() ? await context.newPage() : popup;
  if (stop !== popup) await stop.goto(origin + '/popup.html');
  await stop.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP' }));
  if (!report.laughs || !report.words)
    throw new Error('real production fixture did not retain laughs and words');
  if (
    worstOffscreen > 50 ||
    (contentTasks?.worstMs ?? 0) > 50 ||
    maxGaps ||
    errors ||
    peakWork10sMs > 2500
  )
    throw new Error(
      'audio-path stability target failed; inspect numeric report',
    );
} finally {
  await context.close();
}
