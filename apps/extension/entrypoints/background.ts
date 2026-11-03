import { ratingStreamKey } from '@laughline/shared';
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
  type MySession,
  MySessionSchema,
  PersonalBatchSchema,
  type PersonalEvent,
  PRODUCT,
  parseChannel,
  type Replay,
  ReplaySchema,
  replayPage,
  type Snapshot,
  SnapshotSchema,
  STATE_KEY,
  visibleWords,
  withLaughs,
} from '@laughline/shared';
import { AUDIO_DEBUG, MIC_CONSENT_KEY } from '../src/audio/config';
import { selectedMicrophone } from '../src/audio/microphone';
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
import { db, deleteSavedStreams } from '../src/db';
import { safeError } from '../src/diagnostics';
import { getInstallKind } from '../src/install-type';
import { LabSwitchesSchema } from '../src/stutter';
import { clearToolbar } from '../src/toolbar';
import { notifyUpdatedTabs } from '../src/updated-note';
import { resolveWatchContext, twitchPage } from '../src/watch-context';

export default defineBackground(() => {
  let undoLaugh: {
    sessionId: string;
    event: import('@laughline/shared').MySession['laughEvents'][number];
    until: number;
  } | null = null;
  let state: Snapshot = initialSnapshot();
  void clearToolbar();
  chrome.runtime.onStartup?.addListener(() => void clearToolbar());
  let endingSession: Snapshot['session'] = null;
  let endingDeadline = 0;
  let laughPanelLatencyMs = 0;
  let replayAnchors: Replay[] = [];
  function applySessionEvent(
    session: MySession,
    event: PersonalEvent,
    crowd: number,
    tabLaughTs = 0,
  ) {
    const anchor = session.replay
      ? (replayAnchors.findLast(
          (r) => r.url === session.replay!.url && r.at <= event.ts,
        ) ?? session.replay)
      : undefined;
    return {
      ...applyPersonalEvent(
        { ...session, replay: anchor },
        event,
        crowd,
        tabLaughTs,
      ),
      replay: session.replay,
    };
  }
  let activeOwnerId: string | null = null;
  const delivery = { received: 0, applied: 0, error: '' };
  function deliveryFailed(message: string) {
    if (message !== delivery.error)
      console.error('StreamLaughs: count delivery', message);
    delivery.error = message.slice(0, 400);
  }
  const source: CrowdSource = makeCrowdSource();
  let sourceSessionId: string | null = null;
  let saveTimer: ReturnType<typeof setInterval> | undefined;
  let queue = Promise.resolve();
  const install = getInstallKind;
  async function captureAllowed(tabId?: number) {
    const kind = await install();
    const tabs = await chrome.tabs.query({
      url: ['https://*.twitch.tv/*', 'https://twitch.tv/*'],
    });
    const checks = await Promise.all(
      tabs
        .filter((t) => t.id !== undefined)
        .map(async (t) => {
          try {
            return await chrome.tabs.sendMessage(
              t.id!,
              { type: 'INSTALL_GUARD', claim: t.id === tabId },
              { frameId: 0 },
            );
          } catch {
            return null;
          }
        }),
    );
    if (
      checks.some(
        (c) =>
          c?.allowed === false || (kind === 'development' && c?.storePresent),
      )
    ) {
      await stop();
      throw new Error('use the store version · stop this manual copy');
    }
  }
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
    if (state.session?.replay) {
      source.stop();
      sourceSessionId = null;
    } else {
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
    endingSession = state.session
      ? { ...state.session, endedAt: Date.now() }
      : null;
    endingDeadline = endingSession ? Date.now() + 1500 : 0;
    const initial = endingSession
      ? createRecap(endingSession, endingSession.endedAt!)
      : null;
    state = {
      ...state,
      status: 'idle',
      session: null,
      crowd: null,
      capture: captureTransition(state.capture, { type: 'stop' }),
      inference: emptyInferenceHealth(),
      ...(initial
        ? {
            lastRecapId: initial.id,
            lastSaved: {
              id: initial.id,
              durationSeconds: initial.durationSeconds ?? 0,
              laughs: initial.totalLaughs,
              saving: true,
            },
          }
        : {}),
    };
    // Publish immediately, before storage finalization or audio teardown.
    await publish();
    try {
      if (endingSession && initial) {
        await db.transaction('rw', db.sessions, db.recaps, async () => {
          await db.sessions.put(endingSession!);
          await db.recaps.put({ ...initial, saving: true });
        });
        const remaining = Math.max(0, endingDeadline - Date.now());
        if (activeOwnerId && remaining > 0) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              ownerCommand({ target: 'offscreen', type: 'AUDIO_DRAIN' }).catch(
                () => null,
              ),
              new Promise<void>((resolve) => {
                timer = setTimeout(resolve, remaining);
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
        endingDeadline = 0; // Ignore all late events, even while the final DB transaction runs.
        const session = endingSession;
        const recap = {
          ...createRecap(session, session.endedAt!),
          saving: false,
        };
        await db.transaction('rw', db.sessions, db.recaps, async () => {
          const existing = await db.recaps.get(recap.id);
          await db.sessions.put(session);
          await db.recaps.put({ ...recap, seenAt: existing?.seenAt ?? null });
        });
        state.lastSaved = {
          id: recap.id,
          durationSeconds: recap.durationSeconds ?? 0,
          laughs: recap.totalLaughs,
          saving: false,
        };
        await publish();
      }
    } finally {
      endingDeadline = 0;
      endingSession = null;
      // Keep replay and tracks alive until the saved recap is committed.
      await closeAudioOwner();
      activeOwnerId = null;
    }
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
    // A worker can disappear during the bounded drain. The provisional recap is
    // already durable: keep its saved counts and make sharing available again.
    if (state.lastSaved?.saving) {
      const saved = await db.recaps.get(state.lastSaved.id);
      if (saved) await db.recaps.put({ ...saved, saving: false });
      state.lastSaved = { ...state.lastSaved, saving: false };
      await publish();
    }
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
      if (
        !tab ||
        (await resolveWatchContext(tab)).channel !== state.session.channel
      ) {
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
        if (!exists) await ensureAudioOwner();
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
      owner?.sessionId === state.capture.sessionId &&
      (owner?.sessionId.startsWith('mic-test-') ||
        (AUDIO_DEBUG && owner?.sessionId.startsWith('debug-')))
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
  async function start(tabId?: number, manualChannel?: string) {
    const tab =
      tabId === undefined
        ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
        : await chrome.tabs.get(tabId);
    const context = await resolveWatchContext(tab ?? {});
    const replay = replayPage(tab?.url ?? '');
    const channel = context.channel || (replay ? manualChannel : undefined);
    if (!channel || tab?.id === undefined)
      throw new Error('open any Twitch stream');
    await captureAllowed(tab.id);
    if (
      state.session &&
      (state.session.tabId !== tab.id ||
        state.session.replay?.url !== replay?.url)
    )
      await stop();
    if (!state.session && state.capture.sessionId) await stop();
    if (
      state.session &&
      ['active', 'paused'].includes(state.capture.phase) &&
      !state.capture.micLost &&
      (await hasAudioOwner())
    )
      return;
    if (state.settings.listen) {
      await ensureAudioOwner();
      const permission = await ownerCommand<PermissionState>({
        target: 'offscreen',
        type: 'AUDIO_PERMISSION',
      });
      const consent =
        (await chrome.storage.local.get(MIC_CONSENT_KEY))[MIC_CONSENT_KEY] ===
        true;
      // A successful Welcome grant can coexist with Permissions API "prompt" on extension pages.
      // Let getUserMedia be authoritative after explicit consent. Browser-denied capture still fails normally.
      if (permission !== 'granted' && !consent) {
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
    Object.assign(delivery, { received: 0, applied: 0, error: '' });
    if (!state.session)
      state = {
        ...state,
        status: 'recording',
        crowd: null,
        session: MySessionSchema.parse({
          id: crypto.randomUUID(),
          channel,
          channelUrl: `https://www.twitch.tv/${channel}`,
          displayName: channel,
          tabId: tab.id,
          ...(replay
            ? {
                replay: {
                  ...replay,
                  seconds: context.seconds ?? 0,
                  at: now,
                  rate: context.rate ?? 1,
                  paused: context.paused ?? false,
                },
              }
            : {}),
          live: context.isLive && !replay,
          streamKey: replay
            ? undefined
            : ratingStreamKey(channel, context.streamStartedAt, now),
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
    replayAnchors = state.session?.replay ? [state.session.replay] : [];
    state.capture = captureTransition(state.capture, {
      type: 'start',
      sessionId: state.session!.id,
      listen: state.settings.listen,
    });
    await db.sessions.put(state.session!);
    await publish();
    if (state.settings.listen) {
      try {
        // Leave Twitch playback native. Tab capture is an explicit live lab opt-in.
        const owner = await ownerCommand({
          target: 'offscreen',
          type: 'AUDIO_START',
          micDeviceId: await selectedMicrophone(),
          sessionId: state.session!.id,
          nativePlayback: true,
          sensitivity: state.settings.sensitivity ?? 'normal',
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
    const sessionId = state.session?.id;
    void chrome.tabs
      .sendMessage(tab.id, { type: 'STREAMER_CONTEXT' })
      .then((info) =>
        serialize(async () => {
          if (
            state.session?.id !== sessionId ||
            !state.session ||
            info?.channel !== channel ||
            typeof info.displayName !== 'string'
          )
            return;
          const displayName = info.displayName.trim().slice(0, 100) || channel;
          state.session = { ...state.session, displayName };
          await db.sessions.put(state.session);
          const profile = await db.streamerProfiles.get(channel);
          await db.streamerProfiles.put({
            ...profile,
            login: channel,
            displayName,
          });
          await publish();
        }),
      )
      .catch(() => {});
  }
  async function handle(message: Command) {
    switch (message.type) {
      case 'GET_STATE':
        break;
      case 'OPEN_MIC_TEST':
        await chrome.tabs.create({
          url: chrome.runtime.getURL('/mic-test.html'),
        });
        break;
      case 'START':
        await start(message.tabId, message.channel);
        break;
      case 'STOP':
        await stop();
        break;
      case 'UNDO_LAUGH': {
        const s = state.session,
          event = s?.laughEvents.at(-1);
        if (!s || !event) break;
        undoLaugh = { sessionId: s.id, event, until: Date.now() + 5000 };
        state.session = withLaughs(s, s.laughEvents.slice(0, -1));
        await db.sessions.put(state.session);
        await publish();
        break;
      }
      case 'RESTORE_LAUGH': {
        const u = undoLaugh;
        undoLaugh = null;
        if (
          !u ||
          !state.session ||
          u.sessionId !== state.session.id ||
          Date.now() > u.until
        )
          break;
        state.session = withLaughs(
          state.session,
          [...state.session.laughEvents, u.event].sort((a, b) => a.at - b.at),
        );
        await db.sessions.put(state.session);
        await publish();
        break;
      }
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
        await captureAllowed(state.session?.tabId);
        if (state.session && state.settings.listen) {
          // One explicit restart boundary, including a dead owner, failed model
          // worker or disabled lab switch. Keep the saved session/settings and
          // discard old-owner messages by acquiring a fresh owner nonce.
          const tabId = state.session.tabId;
          await closeAudioOwner();
          activeOwnerId = null;
          state.inference = emptyInferenceHealth();
          state.capture = captureTransition(state.capture, {
            type: 'start',
            sessionId: state.session.id,
            listen: true,
          });
          await start(tabId);
        }
        break;
      case 'SETTINGS': {
        const wasListening = state.settings.listen;
        state.settings = { ...state.settings, ...message.settings };
        if (message.settings.sensitivity && (await hasAudioOwner()))
          await ownerCommand({
            target: 'offscreen',
            type: 'AUDIO_SENSITIVITY',
            value: message.settings.sensitivity,
          });
        if (!state.session?.replay)
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
        await db.transaction(
          'rw',
          db.sessions,
          db.recaps,
          db.streamerProfiles,
          db.ratings,
          async () => {
            await db.ratings.clear();
            await db.sessions.clear();
            await db.recaps.clear();
            await db.streamerProfiles.clear();
          },
        );
        const revision = state.revision;
        await chrome.storage.local.clear();
        state = { ...initialSnapshot(), revision };
        await publish();
        break;
      }
      case 'DISCARD_RECAP': {
        await deleteSavedStreams([message.id]);
        if (state.lastRecapId === message.id) state.lastRecapId = null;
        if (state.lastSaved?.id === message.id) state.lastSaved = null;
        await publish();
        break;
      }
      case 'OPEN_RECAP': {
        const id = message.id ?? state.lastRecapId;
        await chrome.tabs.create({
          url: chrome.runtime.getURL(
            `/recap.html${message.view === 'streamers' ? '?view=streamers' : id ? `?session=${encodeURIComponent(id)}${message.rating ? '&slide=rating' : ''}` : ''}`,
          ),
        });
        break;
      }
      case 'MIC_TEST_STOP': {
        if (!state.session && state.capture.sessionId?.startsWith('mic-test-'))
          await stop();
        break;
      }
      case 'MIC_TEST_START': {
        await captureAllowed();
        if (state.session) break;
        if (!(await chrome.storage.local.get(MIC_CONSENT_KEY))[MIC_CONSENT_KEY])
          throw new Error('allow the microphone first');
        await stop();
        await ensureAudioOwner();
        state.capture = captureTransition(state.capture, {
          type: 'start',
          sessionId: `mic-test-${crypto.randomUUID()}`,
          listen: true,
        });
        await publish();
        try {
          const owner = await ownerCommand({
            target: 'offscreen',
            type: 'AUDIO_START',
            micDeviceId: await selectedMicrophone(),
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
          throw new Error(
            'microphone could not start · check browser and Windows microphone access',
          );
        }
        break;
      }
      case 'DEBUG_MIC_START': {
        await captureAllowed();
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
            micDeviceId: await selectedMicrophone(),
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
    const type = (message as { type?: string } | null)?.type;
    if (type === 'INSTALL_IDENTITY') {
      void install().then((kind) => reply({ ok: true, installType: kind }));
      return true;
    }
    if (
      type === 'INSTALL_SUPERSEDED' &&
      sender.tab &&
      /^https:\/\/(?:www\.|m\.|clips\.)?twitch\.tv\//.test(sender.url ?? '')
    ) {
      void serialize(async () => {
        await ready;
        await stop();
      }).then(
        () => reply({ ok: true }),
        () => reply({ ok: false }),
      );
      return true;
    }
    // Old internal update-page links open the local migration guide, never a ZIP downloader.
    if (type === 'UPDATE_CHECK') {
      reply({ ok: true });
      return;
    }
    if (type === 'OPEN_UPDATE' || type === 'FINISH_UPDATE') {
      if (
        ![
          chrome.runtime.getURL('/popup.html'),
          chrome.runtime.getURL('/update.html'),
        ].includes(sender.url?.split('?')[0] ?? '')
      ) {
        reply({ ok: false });
        return;
      }
      void install().then(async (kind) => {
        if (kind !== 'development') return reply({ ok: false });
        await chrome.tabs.create({
          url: chrome.runtime.getURL('/update.html'),
        });
        reply({ ok: true });
      });
      return true;
    }
    if ((message as { type?: string })?.type === 'REPLAY_POSITION') {
      const value = ReplaySchema.safeParse(
        (message as { replay?: unknown }).replay,
      );
      if (
        value.success &&
        sender.tab?.id === state.session?.tabId &&
        state.session?.replay?.url === value.data.url &&
        replayPage(sender.url ?? '')?.url === value.data.url
      ) {
        state.session.replay = value.data;
        replayAnchors = [...replayAnchors, value.data].slice(-64);
      }
      reply({ ok: value.success });
      return;
    }
    if (
      (message as { type?: string })?.type === 'PANEL_LATENCY' &&
      sender.tab?.id === state.session?.tabId
    ) {
      const ms = (message as { ms?: number }).ms;
      if (
        typeof ms === 'number' &&
        Number.isFinite(ms) &&
        ms >= 0 &&
        ms < 60000
      )
        laughPanelLatencyMs = ms;
      reply({ ok: true });
      return;
    }
    const audioUI =
      ['/diagnostics.html', '/popup.html', '/mic-test.html'].some(
        (path) => sender.url === chrome.runtime.getURL(path),
      ) ||
      (sender.tab?.id === state.session?.tabId && twitchPage(sender.url ?? ''));
    if ((message as { type?: string })?.type === 'AUDIO_STUTTER_NOTICE') {
      const value = message as { ownerId?: string; sessionId?: string };
      if (
        sender.url === chrome.runtime.getURL('/offscreen.html') &&
        value.ownerId === activeOwnerId &&
        value.sessionId === state.session?.id
      )
        void chrome.tabs
          .sendMessage(state.session!.tabId, { type: 'STUTTER_NOTICE' })
          .catch(() => {});
      reply({ ok: true });
      return;
    }
    if (audioUI && (message as { type?: string })?.type === 'STUTTER_LAB') {
      const switches = LabSwitchesSchema.safeParse(
        (message as { switches?: unknown }).switches,
      );
      if (!switches.success || !state.session || !state.settings.listen) {
        reply({ ok: false, error: 'start recording before using stutter lab' });
        return;
      }
      void serialize(async () => {
        await ready;
        if (!state.session || !state.settings.listen)
          throw new Error('capture not running');
        const owner = await ownerCommand({
          target: 'offscreen',
          type: 'AUDIO_STATUS',
        });
        if (!owner || owner.sessionId !== state.session?.id)
          throw new Error('capture not running · start again');
        const streamId =
          switches.data.tabCapture && !owner.hasTab
            ? await chrome.tabCapture.getMediaStreamId({
                targetTabId: state.session!.tabId,
              })
            : undefined;
        const value = await ownerCommand({
          target: 'offscreen',
          type: 'AUDIO_LAB',
          switches: switches.data,
          streamId,
        });
        await chrome.tabs
          .sendMessage(state.session!.tabId, {
            type: 'STUTTER_LAB_STATE',
            switches: value,
          })
          .catch(() => {});
        reply({ ok: true });
      }).catch(() =>
        reply({
          ok: false,
          error: 'couldn’t change capture · retry from the Twitch tab',
        }),
      );
      return true;
    }
    if (
      audioUI &&
      (message as { type?: string })?.type === 'GET_AUDIO_PREVIEW'
    ) {
      void (async () => {
        await ready;
        return (await hasAudioOwner())
          ? ownerCommand<string>({
              target: 'offscreen',
              type: 'AUDIO_PREVIEW',
              speech: (message as { speech?: boolean }).speech === true,
            }).catch(() => '')
          : '';
      })().then(reply);
      return true;
    }
    if (audioUI && (message as { type?: string })?.type === 'GET_DIAGNOSTICS') {
      void (async () => {
        await ready;
        const exists = await hasAudioOwner();
        const owner = exists
          ? await ownerCommand<{
              sessionId: string | null;
              audio: unknown;
              inference: unknown;
              lab?: unknown;
              offscreenTasks?: unknown;
              deliveryError?: string;
            }>({
              target: 'offscreen',
              type: 'AUDIO_DIAGNOSTICS',
            }).catch(() => null)
          : null;
        const saved = state.session
          ? await db.sessions.get(state.session.id)
          : undefined;
        return {
          sessionId: state.session?.id ?? state.capture.sessionId,
          offscreenAlive: exists,
          micConsent:
            (await chrome.storage.local.get(MIC_CONSENT_KEY))[
              MIC_CONSENT_KEY
            ] === true,
          sessionMatches:
            !!owner && owner.sessionId === state.capture.sessionId,
          laughPanelLatencyMs,
          lab: owner?.lab,
          offscreenTasks: owner?.offscreenTasks,
          delivery: { ...delivery },
          deliveryError: owner?.deliveryError ?? '',
          savedLaughs: saved?.laughCount ?? 0,
          savedWords: saved?.topWords.reduce((n, w) => n + w.count, 0) ?? 0,
          sessionLaughs: state.session?.laughCount ?? 0,
          sessionWords:
            state.session?.topWords.reduce((n, w) => n + w.count, 0) ?? 0,
          version: chrome.runtime.getManifest().version,
          listening: state.settings.listen,
          captureState: state.capture.phase,
          audio: owner?.audio ?? null,
          inference: owner?.inference ?? null,
          error:
            audioOwnerError() ||
            (state.capture.error === 'none' ? '' : state.capture.error),
        };
      })().then(reply, (error) =>
        reply({ ok: false, error: safeError(error) }),
      );
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
      ) {
        if ((message as { type?: string })?.type === 'PERSONAL_EVENTS')
          deliveryFailed('invalid detection message · reopen the microphone');
        reply({ ok: false, error: 'invalid local audio status/event message' });
        return;
      }
      if (personal.success) delivery.received += personal.data.events.length;
      if (endingSession) {
        if (
          personal.success &&
          personal.data.ownerId === activeOwnerId &&
          personal.data.sessionId === endingSession.id &&
          endingDeadline > Date.now()
        ) {
          for (const event of personal.data.events) {
            if (
              event.ts >= endingSession.startedAt &&
              event.ts <= endingSession.endedAt!
            )
              endingSession = applySessionEvent(
                endingSession,
                event,
                0,
                personal.data.tabLaughTs,
              );
          }
        }
        reply({ ok: true });
        return;
      }
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
        if (!activeOwnerId || activeOwnerId !== reportOwner) {
          if (personal.success)
            deliveryFailed(
              'detection belongs to an old microphone owner · retry mic',
            );
          return false;
        }
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
          delivery.error = '';
          for (const event of personal.data.events) {
            if (
              event.ts < state.session.startedAt ||
              event.ts > Date.now() + 1000
            ) {
              deliveryFailed(
                'detection timestamp is outside this session · retry mic',
              );
              continue;
            }
            state.session = applySessionEvent(
              state.session,
              event,
              state.crowd?.laughingNow ?? 0,
              personal.data.tabLaughTs,
            );
            delivery.applied++;
            if (!state.session.replay) source.addEvents?.([event]);
          }
          // Save accepted counts at the same boundary used by the popup and
          // panel, rather than waiting for the five-second checkpoint timer.
          await db.sessions.put(state.session);
          await publish();
        } else if (
          personal.success &&
          !state.session &&
          state.capture.sessionId?.startsWith('mic-test-') &&
          personal.data.sessionId === state.capture.sessionId
        ) {
          // The visible mic check reports detections, but deliberately creates
          // no saved stream and never shares these events.
          delivery.error = '';
        } else if (personal.success) {
          deliveryFailed(
            !state.settings.listen
              ? 'microphone listening is disabled · enable mic'
              : state.status === 'paused'
                ? 'session paused · resume to count'
                : `no matching active session (${state.capture.phase}) · retry mic`,
          );
          return false;
        } else if (
          ended.success &&
          ended.data.sessionId === state.capture.sessionId
        )
          await stop();
      }).then(
        (accepted) =>
          reply({
            ok: accepted !== false,
            ...(accepted === false
              ? { error: delivery.error || 'audio owner mismatch' }
              : {}),
          }),
        (error) => {
          deliveryFailed(safeError(error));
          reply({ ok: false, error: delivery.error });
        },
      );
      return true;
    }
    const parsed = CommandSchema.safeParse(message);
    if (!parsed.success) return;
    const extensionPage = sender.url?.startsWith(chrome.runtime.getURL('/'));
    const popup = sender.url === chrome.runtime.getURL('/popup.html');
    if (
      (parsed.data.type === 'START' && !popup) ||
      (['MIC_TEST_START', 'MIC_TEST_STOP'].includes(parsed.data.type) &&
        ![
          chrome.runtime.getURL('/popup.html'),
          chrome.runtime.getURL('/mic-test.html'),
        ].includes(sender.url ?? '')) ||
      (['SETTINGS', 'DELETE_DATA'].includes(parsed.data.type) &&
        !extensionPage) ||
      (parsed.data.type === 'DEBUG_MIC_START' &&
        (!AUDIO_DEBUG || sender.url !== chrome.runtime.getURL('/debug.html')))
    ) {
      reply({ ok: false, error: `Use the ${PRODUCT.name} toolbar icon.` });
      return;
    }
    if (
      parsed.data.type === 'OPEN_RECAP' ||
      (parsed.data.type === 'GET_STATE' && endingSession)
    ) {
      void ready
        .then(() => handle(parsed.data))
        .then(
          (snapshot) => reply({ ok: true, state: snapshot }),
          () => reply({ ok: false, error: 'couldn’t open · try again' }),
        );
      return true;
    }
    void serialize(async () => {
      await ready;
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
          state.session.replay &&
          replayPage(change.url!)?.url !== state.session.replay.url
        ) {
          await stop();
          return;
        }
        if (
          state.session?.tabId === tabId &&
          (
            await resolveWatchContext({
              ...(await chrome.tabs.get(tabId)),
              url: change.url,
            })
          ).channel !== state.session.channel &&
          !state.session.replay
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
    void clearToolbar();
    if (reason === 'update')
      void notifyUpdatedTabs(
        PRODUCT.name,
        chrome.runtime.getManifest().version,
      ).catch(() => {});
    if (reason === 'install')
      void chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  });
});
