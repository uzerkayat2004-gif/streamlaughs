import {
  type AudioReport,
  AudioReportSchema,
  applyPersonalEvent,
  type Command,
  CommandSchema,
  type CrowdState,
  createRecap,
  emptyInferenceHealth,
  InferenceReportSchema,
  initialCaptureState,
  initialSnapshot,
  MySessionSchema,
  PersonalBatchSchema,
  PRODUCT,
  parseChannel,
  type Snapshot,
  SnapshotSchema,
  STATE_KEY,
  visibleWords,
} from '@laughline/shared';
import { AUDIO_DEBUG } from '../src/audio/config';
import {
  audioOwnerError,
  closeAudioOwner,
  ensureAudioOwner,
  hasAudioOwner,
  ownerCommand,
} from '../src/audio/offscreen-client';
import { TabEndedSchema } from '../src/audio/protocol';
import { captureTransition } from '../src/audio/state-machine';
import { type CrowdSource, makeCrowdSource } from '../src/crowd-source';
import { db } from '../src/db';
import { SITE_URL, UPDATE_KEY } from '../src/site';
import {
  isZipInstall,
  prepareUpdateReload,
  UPDATE_ATTEMPT_KEY,
  UpdateAttemptSchema,
} from '../src/update-flow';
import { checkVersion } from '../src/version-check';

export default defineBackground(() => {
  let state: Snapshot = initialSnapshot();
  let activeOwnerId: string | null = null;
  const source: CrowdSource = makeCrowdSource();
  let sourceSessionId: string | null = null;
  let saveTimer: ReturnType<typeof setInterval> | undefined;
  let queue = Promise.resolve();
  let updateCheck: Promise<void> | null = null;
  const checkUpdate = () => {
    if (!isZipInstall(chrome.runtime.id) || !SITE_URL || updateCheck)
      return updateCheck;
    updateCheck = checkVersion(
      SITE_URL,
      chrome.runtime.getManifest().version,
      async () => (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY],
      async (value) => {
        await chrome.storage.local.set({ [UPDATE_KEY]: value });
      },
    )
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        updateCheck = null;
      });
    return updateCheck;
  };
  checkUpdate();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const pending = queue.then(task);
    queue = pending.then(
      () => undefined,
      () => {
        console.error(`${PRODUCT.name}: session command failed`);
      },
    );
    return pending;
  };
  async function publish() {
    state = { ...state, revision: Math.max(Date.now(), state.revision + 1) };
    await chrome.storage.local.set({ [STATE_KEY]: state });
    void chrome.runtime.sendMessage({ type: 'STATE', state }).catch(() => {});
  }
  async function onCrowd(crowd: CrowdState) {
    if (!state.session || crowd.channel !== state.session.channel) return;
    const session = {
      ...state.session,
      peakCrowd: Math.max(state.session.peakCrowd, crowd.laughingNow),
      crowdViewers: Math.max(
        state.session.crowdViewers,
        crowd.laughlineViewers,
      ),
    };
    const words = new Map(
      session.crowdTopWords.map((word) => [word.word, word]),
    );
    for (const word of visibleWords(crowd))
      if (word.word !== '—' && word.count > (words.get(word.word)?.count ?? 0))
        words.set(word.word, word);
    session.crowdTopWords = [...words.values()].slice(0, 256);
    if (
      state.status === 'recording' &&
      crowd.laughlineViewers >= 3 &&
      (crowd.source === 'fake' ||
        (crowd.source === 'live' && crowd.state === 'live'))
    ) {
      const old = session.crowdSummary;
      session.crowdSummary = {
        source: crowd.source,
        peakSharing: Math.max(old?.peakSharing ?? 0, crowd.laughlineViewers),
        peakLaughingNow: Math.max(old?.peakLaughingNow ?? 0, crowd.laughingNow),
        peakLaughPercent: Math.max(
          old?.peakLaughPercent ?? 0,
          crowd.laughPercent ??
            Math.round((crowd.laughingNow / crowd.laughlineViewers) * 100),
        ),
        samples: (old?.samples ?? 0) + 1,
        testTraffic: !!old?.testTraffic || !!crowd.testTraffic,
      };
    }
    state = { ...state, crowd, session };
    await publish();
  }
  function runSource() {
    clearInterval(saveTimer);
    source.setSharing?.(state.settings.share && state.status === 'recording');
    if (state.session && sourceSessionId !== state.session.id) {
      source.stop();
      sourceSessionId = state.session.id;
      const sessionId = state.session.id;
      source.start(state.session.channel, (crowd) => {
        void serialize(async () => {
          if (state.session?.id === sessionId) await onCrowd(crowd);
        });
      });
    }
    if (state.session)
      saveTimer = setInterval(() => {
        void serialize(async () => {
          if (state.session) await db.sessions.put(state.session);
          if (
            state.session &&
            state.settings.listen &&
            state.capture.phase !== 'crowdOnly' &&
            !(await hasAudioOwner())
          ) {
            activeOwnerId = null;
            state.capture = captureTransition(state.capture, {
              type: 'workerRestart',
              owner: null,
            });
            await publish();
          }
        });
      }, 5000);
  }
  async function stop() {
    source.stop();
    sourceSessionId = null;
    clearInterval(saveTimer);
    await closeAudioOwner();
    activeOwnerId = null;
    if (state.session) {
      const session = { ...state.session, endedAt: Date.now() };
      const recap = createRecap(session, session.endedAt);
      await db.transaction('rw', db.sessions, db.recaps, async () => {
        await db.sessions.put(session);
        await db.recaps.put(recap);
      });
      state = { ...state, lastRecapId: recap.id };
    }
    state = {
      ...state,
      status: 'idle',
      session: null,
      crowd: null,
      capture: captureTransition(state.capture, { type: 'stop' }),
      inference: emptyInferenceHealth(),
    };
    await publish();
  }
  async function welcome(tabId?: number, retryExistingMic = false) {
    const params = new URLSearchParams({ step: 'mic' });
    if (tabId !== undefined) params.set('returnTab', String(tabId));
    if (retryExistingMic && state.session)
      params.set('retry', state.session.id);
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`/welcome.html?${params}`),
    });
  }
  const ready = (async () => {
    const stored = await chrome.storage.local.get(STATE_KEY);
    const parsed = SnapshotSchema.safeParse(stored[STATE_KEY]);
    if (parsed.success) state = parsed.data;
    if (state.session?.source === 'fake')
      state.session = MySessionSchema.parse({
        ...state.session,
        crowdTopWords: state.session.topWords,
        topWords: [],
        laughCount: 0,
        laughEvents: [],
        source: 'local',
      });
    const exists = await hasAudioOwner();
    const owner = exists
      ? await ownerCommand({ target: 'offscreen', type: 'AUDIO_STATUS' }).catch(
          () => null,
        )
      : null;
    activeOwnerId = owner?.ownerId ?? null;
    if (state.session) {
      const tab = await chrome.tabs.get(state.session.tabId).catch(() => null);
      if (!tab || parseChannel(tab.url ?? '') !== state.session.channel) {
        await stop();
        return;
      }
      if (!state.settings.listen) {
        if (exists) await closeAudioOwner();
        activeOwnerId = null;
        state.capture = captureTransition(state.capture, {
          type: 'start',
          sessionId: state.session.id,
          listen: false,
        });
      } else {
        if (exists && owner?.sessionId !== state.session.id)
          await closeAudioOwner();
        state.capture = captureTransition(
          { ...state.capture, sessionId: state.session.id },
          { type: 'workerRestart', owner },
        );
        if (owner?.sessionId === state.session.id)
          state.status = owner.phase === 'paused' ? 'paused' : 'recording';
      }
      await publish();
      runSource();
    } else if (
      AUDIO_DEBUG &&
      owner?.sessionId === state.capture.sessionId &&
      owner?.sessionId.startsWith('debug-')
    ) {
      state.capture = captureTransition(state.capture, {
        type: 'workerRestart',
        owner,
      });
      await publish();
    } else if (exists) {
      await closeAudioOwner();
      state.capture = initialCaptureState();
      await publish();
    }
  })();
  async function acceptOwner(owner: AudioReport) {
    if (owner.sessionId !== state.capture.sessionId) return;
    // A queued report from the graph deliberately closed by the listening toggle is stale.
    if (state.session && state.capture.phase === 'crowdOnly') return;
    if (owner.phase === 'idle') {
      await stop();
      return;
    }
    const phase = state.session
      ? state.status === 'paused'
        ? 'paused'
        : owner.micLost
          ? 'micLost'
          : owner.phase === 'starting'
            ? 'starting'
            : 'active'
      : owner.phase;
    state = {
      ...state,
      capture: {
        ...state.capture,
        phase,
        micLost: owner.micLost,
        error: owner.micLost
          ? state.capture.error === 'permission'
            ? 'permission'
            : 'device'
          : 'none',
        metrics: owner.metrics,
      },
    };
    await publish();
  }
  async function start(tabId?: number) {
    const tab =
      tabId === undefined
        ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
        : await chrome.tabs.get(tabId);
    const channel = parseChannel(tab?.url ?? '');
    if (!channel || tab?.id === undefined)
      throw new Error('open any Twitch stream');
    if (state.session && state.session.tabId !== tab.id) await stop();
    if (!state.session && state.capture.sessionId) await stop();
    if (
      state.session &&
      ['active', 'paused'].includes(state.capture.phase) &&
      !state.capture.micLost
    )
      return;
    if (state.settings.listen) {
      await ensureAudioOwner();
      if (
        (await ownerCommand<PermissionState>({
          target: 'offscreen',
          type: 'AUDIO_PERMISSION',
        })) !== 'granted'
      ) {
        state.capture = state.session
          ? {
              ...captureTransition(state.capture, {
                type: 'start',
                sessionId: state.session.id,
                listen: false,
              }),
              error: 'restartRequired',
            }
          : captureTransition(state.capture, { type: 'permissionRequired' });
        await closeAudioOwner();
        activeOwnerId = null;
        await publish();
        await welcome(tab.id);
        return;
      }
    }
    const now = Date.now();
    if (!state.session)
      state = {
        ...state,
        status: 'recording',
        crowd: null,
        session: MySessionSchema.parse({
          id: crypto.randomUUID(),
          channel,
          tabId: tab.id,
          startedAt: now,
          endedAt: null,
          laughCount: 0,
          laughEvents: [],
          peakCrowd: 0,
          crowdViewers: 0,
          topWords: [],
          source: 'local',
        }),
      };
    state.capture = captureTransition(state.capture, {
      type: 'start',
      sessionId: state.session!.id,
      listen: state.settings.listen,
    });
    await db.sessions.put(state.session!);
    await publish();
    if (state.settings.listen) {
      try {
        // Ephemeral ID: obtained only from toolbar/command start, never stored or reported.
        const streamId = await chrome.tabCapture.getMediaStreamId({
          targetTabId: tab.id,
        });
        const owner = await ownerCommand({
          target: 'offscreen',
          type: 'AUDIO_START',
          sessionId: state.session!.id,
          streamId,
          paused: state.status === 'paused',
        });
        if (!owner) throw new Error('capture');
        activeOwnerId = owner.ownerId;
        state.capture = captureTransition(state.capture, {
          type: 'workerRestart',
          owner,
        });
      } catch {
        await stop();
        state.capture = captureTransition(state.capture, {
          type: 'failed',
          error: 'capture',
        });
        await publish();
        throw new Error(
          'Audio capture could not start. Return to Twitch and use the toolbar start button or Alt+Shift+L.',
        );
      }
    }
    await publish();
    runSource();
  }
  async function handle(message: Command) {
    switch (message.type) {
      case 'GET_STATE':
        break;
      case 'START':
        await start(message.tabId);
        break;
      case 'STOP':
        await stop();
        break;
      case 'PAUSE':
        if (
          state.session ||
          (AUDIO_DEBUG && state.capture.sessionId?.startsWith('debug-'))
        ) {
          const paused = state.status !== 'paused';
          if (await hasAudioOwner())
            await ownerCommand({
              target: 'offscreen',
              type: 'AUDIO_PAUSE',
              paused,
            });
          state = {
            ...state,
            status: paused ? 'paused' : 'recording',
            capture: captureTransition(state.capture, {
              type: paused ? 'pause' : 'resume',
            }),
          };
          state.inference = emptyInferenceHealth();
          await publish();
          runSource();
        }
        break;
      case 'RETRY_MIC':
        if (state.session && state.settings.listen) {
          if (!(await hasAudioOwner())) {
            activeOwnerId = null;
            state.capture = captureTransition(state.capture, {
              type: 'workerRestart',
              owner: null,
            });
            await publish();
            await welcome(state.session.tabId);
            break;
          }
          if (
            (await ownerCommand<PermissionState>({
              target: 'offscreen',
              type: 'AUDIO_PERMISSION',
            })) !== 'granted'
          ) {
            state.capture = captureTransition(state.capture, {
              type: 'permissionRequired',
            });
            await publish();
            await welcome(state.session.tabId, true);
            break;
          }
          const owner = await ownerCommand({
            target: 'offscreen',
            type: 'AUDIO_RETRY',
          });
          if (owner) {
            state.capture = captureTransition(state.capture, {
              type: 'workerRestart',
              owner,
            });
            await publish();
          }
        }
        break;
      case 'SETTINGS': {
        const wasListening = state.settings.listen;
        state.settings = { ...state.settings, ...message.settings };
        source.setSharing?.(
          state.settings.share && state.status === 'recording',
        );
        if (state.session && wasListening !== state.settings.listen) {
          await closeAudioOwner();
          activeOwnerId = null;
          state.inference = emptyInferenceHealth();
          state.capture = {
            ...captureTransition(state.capture, {
              type: 'start',
              sessionId: state.session.id,
              listen: false,
            }),
            error: state.settings.listen ? 'restartRequired' : 'none',
          };
        }
        await publish();
        break;
      }
      case 'DELETE_DATA': {
        await stop();
        await db.transaction('rw', db.sessions, db.recaps, async () => {
          await db.sessions.clear();
          await db.recaps.clear();
        });
        const revision = state.revision;
        await chrome.storage.local.clear();
        state = { ...initialSnapshot(), revision };
        await publish();
        break;
      }
      case 'OPEN_RECAP': {
        const id = message.id ?? state.lastRecapId;
        await chrome.tabs.create({
          url: chrome.runtime.getURL(
            `/recap.html${id ? `?session=${encodeURIComponent(id)}` : ''}`,
          ),
        });
        break;
      }
      case 'DEBUG_MIC_START': {
        if (!AUDIO_DEBUG || state.session)
          throw new Error(
            'Stop the live session before running a microphone diagnostic.',
          );
        await stop();
        await ensureAudioOwner();
        if (
          (await ownerCommand<PermissionState>({
            target: 'offscreen',
            type: 'AUDIO_PERMISSION',
          })) !== 'granted'
        ) {
          await closeAudioOwner();
          await welcome();
          break;
        }
        state.capture = captureTransition(state.capture, {
          type: 'start',
          sessionId: `debug-${crypto.randomUUID()}`,
          listen: true,
        });
        if (message.tabId !== undefined) {
          const tab = await chrome.tabs.get(message.tabId),
            channel = parseChannel(tab.url ?? '');
          if (!channel) throw new Error('Open the local Twitch fixture first.');
          state.session = MySessionSchema.parse({
            id: state.capture.sessionId,
            channel,
            tabId: message.tabId,
            startedAt: Date.now(),
            endedAt: null,
            laughCount: 0,
            laughEvents: [],
            peakCrowd: 0,
            crowdViewers: 0,
            topWords: [],
            source: 'local',
          });
          state.status = 'recording';
          state.settings.listen = true;
          runSource();
        }
        await publish();
        try {
          const owner = await ownerCommand({
            target: 'offscreen',
            type: 'AUDIO_START',
            sessionId: state.capture.sessionId!,
            micOnly: true,
          });
          activeOwnerId = owner?.ownerId ?? null;
          state.capture = captureTransition(state.capture, {
            type: 'workerRestart',
            owner,
          });
          await publish();
        } catch {
          await stop();
          throw new Error('Microphone diagnostic could not start.');
        }
      }
    }
    return state;
  }
  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    const updateType = (message as { type?: string } | null)?.type;
    if (
      ['UPDATE_CHECK', 'OPEN_UPDATE', 'FINISH_UPDATE'].includes(
        updateType ?? '',
      )
    ) {
      const fromPopup = sender.url === chrome.runtime.getURL('/popup.html');
      const fromUpdate =
        sender.url?.split('?')[0] === chrome.runtime.getURL('/update.html');
      if (
        (!fromPopup && !fromUpdate) ||
        (updateType === 'FINISH_UPDATE' && !fromUpdate)
      ) {
        reply({
          ok: false,
          error: 'open the update page from the toolbar icon',
        });
        return;
      }
      if (!isZipInstall(chrome.runtime.id) && updateType !== 'UPDATE_CHECK') {
        reply({ ok: false, error: 'updates come from your browser’s store' });
        return;
      }
      // Public metadata latency must never queue ahead of pause/stop commands.
      if (updateType === 'UPDATE_CHECK') {
        void Promise.resolve(checkUpdate()).then(() => reply({ ok: true }));
        return true;
      }
      void serialize(async () => {
        await ready;
        if (updateType === 'OPEN_UPDATE') {
          await chrome.tabs.create({
            url: chrome.runtime.getURL('/update.html?download=1'),
          });
        } else {
          const attempt = UpdateAttemptSchema.parse(
            (await chrome.storage.local.get(UPDATE_ATTEMPT_KEY))[
              UPDATE_ATTEMPT_KEY
            ],
          );
          await prepareUpdateReload(
            stop,
            async () => {
              await chrome.storage.local.set({
                [UPDATE_ATTEMPT_KEY]: {
                  ...attempt,
                  phase: 'reloading',
                  tabId: sender.tab?.id,
                },
              });
            },
            () => chrome.runtime.reload(),
          );
        }
      }).then(
        () => reply({ ok: true }),
        () =>
          reply({ ok: false, error: 'update could not finish · try again' }),
      );
      return true;
    }
    if (
      sender.url === chrome.runtime.getURL('/diagnostics.html') &&
      (message as { type?: string })?.type === 'GET_DIAGNOSTICS'
    ) {
      void (async () => {
        await ready;
        const owner = (await hasAudioOwner())
          ? await ownerCommand<{ audio: unknown; inference: unknown }>({
              target: 'offscreen',
              type: 'AUDIO_DIAGNOSTICS',
            }).catch(() => null)
          : null;
        return {
          version: chrome.runtime.getManifest().version,
          listening: state.settings.listen,
          captureState: state.capture.phase,
          audio: owner?.audio ?? null,
          inference: owner?.inference ?? null,
          error:
            audioOwnerError() ||
            (state.capture.error === 'none' ? '' : state.capture.error),
        };
      })().then(reply);
      return true;
    }
    if (
      AUDIO_DEBUG &&
      sender.url === chrome.runtime.getURL('/debug.html') &&
      (message as { type?: string })?.type === 'AI_DEBUG'
    ) {
      void chrome.runtime
        .sendMessage({ type: 'AI_DEBUG_OWNER', target: 'offscreen' })
        .then(reply, () => reply(null));
      return true;
    }
    if (sender.url === chrome.runtime.getURL('/offscreen.html')) {
      const report = AudioReportSchema.safeParse(message),
        ended = TabEndedSchema.safeParse(message),
        personal = PersonalBatchSchema.safeParse(message),
        inference = InferenceReportSchema.safeParse(message);
      if (
        !report.success &&
        !ended.success &&
        !personal.success &&
        !inference.success
      )
        return;
      void serialize(async () => {
        await ready;
        // Offscreen runtime senders may omit documentId. Use the owner nonce obtained by our start/status handshake.
        const reportOwner = report.success
          ? report.data.ownerId
          : ended.success
            ? ended.data.ownerId
            : personal.success
              ? personal.data.ownerId
              : inference.success
                ? inference.data.ownerId
                : null;
        if (!activeOwnerId || activeOwnerId !== reportOwner) return;
        if (report.success) await acceptOwner(report.data);
        else if (
          inference.success &&
          inference.data.sessionId === state.capture.sessionId
        ) {
          state.inference = inference.data.health;
          await publish();
        } else if (
          personal.success &&
          state.session &&
          personal.data.sessionId === state.session.id &&
          state.status === 'recording' &&
          state.settings.listen &&
          state.capture.phase === 'active'
        ) {
          for (const event of personal.data.events) {
            if (
              event.ts < state.session.startedAt ||
              event.ts > Date.now() + 1000
            )
              continue;
            state.session = applyPersonalEvent(
              state.session,
              event,
              state.crowd?.laughingNow ?? 0,
              personal.data.tabLaughTs,
            );
            source.addEvents?.([event]);
          }
          await publish();
        } else if (
          ended.success &&
          ended.data.sessionId === state.capture.sessionId
        )
          await stop();
      }).then(
        () => reply({ ok: true }),
        () => reply({ ok: false }),
      );
      return true;
    }
    const parsed = CommandSchema.safeParse(message);
    if (!parsed.success) return;
    const extensionPage = sender.url?.startsWith(chrome.runtime.getURL('/'));
    const popup = sender.url === chrome.runtime.getURL('/popup.html');
    if (
      (parsed.data.type === 'START' && !popup) ||
      (['SETTINGS', 'DELETE_DATA'].includes(parsed.data.type) &&
        !extensionPage) ||
      (parsed.data.type === 'DEBUG_MIC_START' &&
        (!AUDIO_DEBUG || sender.url !== chrome.runtime.getURL('/debug.html')))
    ) {
      reply({ ok: false, error: `Use the ${PRODUCT.name} toolbar icon.` });
      return;
    }
    void serialize(async () => {
      await ready;
      checkUpdate();
      return handle(parsed.data);
    }).then(
      (snapshot) => reply({ ok: true, state: snapshot }),
      (error: unknown) =>
        reply({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Something went wrong',
        }),
    );
    return true;
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void serialize(async () => {
      await ready;
      if (state.session?.tabId === tabId) await stop();
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url)
      void serialize(async () => {
        await ready;
        if (
          state.session?.tabId === tabId &&
          parseChannel(change.url!) !== state.session.channel
        )
          await stop();
      });
  });
  chrome.commands.onCommand.addListener((name) => {
    if (name === 'toggle-recording')
      void serialize(async () => {
        await ready;
        const tab = (
          await chrome.tabs.query({ active: true, currentWindow: true })
        )[0];
        if (
          state.session &&
          (state.session.tabId === tab?.id || !parseChannel(tab?.url ?? ''))
        )
          await stop();
        else await start(tab?.id);
      });
  });
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install')
      void chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
    if (reason === 'update' && isZipInstall(chrome.runtime.id))
      void (async () => {
        const attempt = UpdateAttemptSchema.safeParse(
          (await chrome.storage.local.get(UPDATE_ATTEMPT_KEY))[
            UPDATE_ATTEMPT_KEY
          ],
        );
        if (!attempt.success || attempt.data.phase !== 'reloading') return;
        await chrome.storage.local.set({
          [UPDATE_ATTEMPT_KEY]: { ...attempt.data, phase: 'result' },
        });
        const url = chrome.runtime.getURL('/update.html?result=1');
        const tab =
          attempt.data.tabId === undefined
            ? null
            : await chrome.tabs.get(attempt.data.tabId).catch(() => null);
        if (
          tab?.id !== undefined &&
          tab.url?.startsWith(chrome.runtime.getURL('/update.html'))
        )
          await chrome.tabs.update(tab.id, { url, active: true });
        else await chrome.tabs.create({ url });
      })();
  });
});
