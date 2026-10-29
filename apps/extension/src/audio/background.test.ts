import {
  type AudioReport,
  type CrowdState,
  emptyAudioMetrics,
  initialSnapshot,
  type Snapshot,
  STATE_KEY,
} from '@laughline/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerCommand } from './protocol';

const fixture = vi.hoisted(() => ({
  owner: null as AudioReport | null,
  exists: false,
  storage: {} as Record<string, unknown>,
  messages: [] as ((
    message: unknown,
    sender: unknown,
    reply: (value: { ok: boolean; state: Snapshot }) => void,
  ) => unknown)[],
  closed: [] as ((id: number) => void)[],
  changed: [] as ((id: number, changes: { url?: string }) => void)[],
  recaps: [] as unknown[],
  sessions: [] as unknown[],
  activeTab: 1,
  permission: 'granted' as PermissionState,
  crowdListeners: [] as ((crowd: CrowdState) => void)[],
  getStreamId: vi.fn(async () => 'ephemeral-test-id'),
  closeOwner: vi.fn(async () => {}),
  ensureOwner: vi.fn(async () => {}),
}));
vi.mock('../crowd-source', () => ({
  makeCrowdSource: () => ({
    start: (_channel: string, emit: (crowd: CrowdState) => void) => {
      fixture.crowdListeners.push(emit);
    },
    stop: () => {},
    setSharing: () => {},
    addEvents: () => {},
  }),
}));
vi.mock('../db', () => ({
  db: {
    sessions: {
      put: vi.fn(async (session) => {
        fixture.sessions.push(structuredClone(session));
      }),
      clear: vi.fn(async () => {
        fixture.sessions = [];
      }),
    },
    recaps: {
      put: vi.fn(async (recap) => {
        fixture.recaps.push(structuredClone(recap));
      }),
      clear: vi.fn(async () => {
        fixture.recaps = [];
      }),
    },
    transaction: vi.fn(async (_mode, _sessions, _recaps, work) => work()),
  },
}));
vi.mock('./offscreen-client', () => ({
  audioOwnerError: () => '',
  hasAudioOwner: async () => fixture.exists,
  audioOwnerContext: async () =>
    fixture.exists ? { documentId: 'owner-document' } : undefined,
  ensureAudioOwner: async () => {
    fixture.ensureOwner();
    fixture.exists = true;
  },
  closeAudioOwner: async () => {
    fixture.closeOwner();
    fixture.exists = false;
    fixture.owner = null;
  },
  ownerCommand: async (message: OwnerCommand) => {
    if (message.type === 'AUDIO_PERMISSION') return fixture.permission;
    if (message.type === 'AUDIO_START')
      fixture.owner = {
        type: 'AUDIO_REPORT',
        ownerId: 'owner-token',
        sessionId: message.sessionId,
        phase: message.paused ? 'paused' : 'active',
        micLost: false,
        hasMic: true,
        hasTab: true,
        metrics: emptyAudioMetrics(),
      };
    if (message.type === 'AUDIO_PAUSE' && fixture.owner)
      fixture.owner.phase = message.paused ? 'paused' : 'active';
    return fixture.owner;
  },
}));
const url = (path: string) => `chrome-extension://unit${path}`;
const tab = (id: number) => ({
  id,
  url: `https://www.twitch.tv/${id === 1 ? 'nightowl_tv' : 'second_channel'}`,
});
async function dispatch(
  message: unknown,
  offscreen = false,
  updatePage = false,
) {
  return new Promise<{ ok: boolean; state: Snapshot }>((resolve) =>
    fixture.messages[0]!(
      message,
      {
        id: 'unit',
        url: url(
          offscreen
            ? '/offscreen.html'
            : updatePage
              ? '/update.html?download=1'
              : '/popup.html',
        ),
        documentId: offscreen ? 'owner-document' : 'popup-document',
      },
      resolve,
    ),
  );
}
async function loadWorker() {
  fixture.messages = [];
  fixture.closed = [];
  fixture.changed = [];
  await import('../../entrypoints/background');
  return dispatch({ type: 'GET_STATE' });
}
describe('background capture integration with browser ports mocked', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    fixture.exists = false;
    fixture.owner = null;
    fixture.recaps = [];
    fixture.sessions = [];
    fixture.crowdListeners = [];
    fixture.activeTab = 1;
    fixture.permission = 'granted';
    fixture.storage = { [STATE_KEY]: initialSnapshot() };
    vi.stubGlobal('defineBackground', (main: () => void) => main());
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'unit',
        reload: vi.fn(),
        getURL: url,
        sendMessage: async () => {},
        onMessage: {
          addListener: (listener: (typeof fixture.messages)[number]) =>
            fixture.messages.push(listener),
        },
        onInstalled: { addListener: () => {} },
      },
      storage: {
        local: {
          get: async (key: string) => ({
            [key]: structuredClone(fixture.storage[key]),
          }),
          set: async (values: Record<string, unknown>) => {
            Object.assign(fixture.storage, structuredClone(values));
          },
          clear: async () => {
            fixture.storage = {};
          },
        },
      },
      tabs: {
        query: async () => [tab(fixture.activeTab)],
        get: async (id: number) => tab(id),
        create: vi.fn(),
        onRemoved: {
          addListener: (listener: (typeof fixture.closed)[number]) =>
            fixture.closed.push(listener),
        },
        onUpdated: {
          addListener: (listener: (typeof fixture.changed)[number]) =>
            fixture.changed.push(listener),
        },
      },
      commands: { onCommand: { addListener: () => {} } },
      tabCapture: { getMediaStreamId: fixture.getStreamId },
    });
    await loadWorker();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('never opens media or an offscreen document when listening is off', async () => {
    await dispatch({ type: 'SETTINGS', settings: { listen: false } });
    const result = await dispatch({ type: 'START', tabId: 1 });
    expect(result.state.capture.phase).toBe('crowdOnly');
    expect(fixture.getStreamId).not.toHaveBeenCalled();
    expect(fixture.ensureOwner).not.toHaveBeenCalled();
  });
  it('rejects old crowd callbacks after restarting on the same channel', async () => {
    await dispatch({ type: 'SETTINGS', settings: { listen: false } });
    await dispatch({ type: 'START', tabId: 1 });
    const old = fixture.crowdListeners[0]!;
    await dispatch({ type: 'STOP' });
    await dispatch({ type: 'START', tabId: 1 });
    const crowd: CrowdState = {
      channel: 'nightowl_tv',
      source: 'live',
      state: 'live',
      laughingNow: 3,
      laughlineViewers: 3,
      laughPercent: 100,
      topWords: [],
      updatedAt: Date.now(),
    };
    old(crowd);
    expect(
      (await dispatch({ type: 'GET_STATE' })).state.session!.crowdSummary,
    ).toBeNull();
    fixture.crowdListeners.at(-1)!(crowd);
    expect(
      (await dispatch({ type: 'GET_STATE' })).state.session!.crowdSummary,
    ).toMatchObject({ source: 'live', peakLaughingNow: 3 });
  });
  it('finishing an update requires its extension page, closes audio and saves a recap before reload without clearing settings', async () => {
    await dispatch({ type: 'START', tabId: 1 });
    const settings = structuredClone(
      (await dispatch({ type: 'GET_STATE' })).state.settings,
    );
    fixture.storage['laughline:update-attempt'] = {
      version: '0.6.2',
      phase: 'downloaded',
    };
    expect((await dispatch({ type: 'FINISH_UPDATE' })).ok).toBe(false);
    expect(chrome.runtime.reload).not.toHaveBeenCalled();
    expect((await dispatch({ type: 'FINISH_UPDATE' }, false, true)).ok).toBe(
      true,
    );
    expect(fixture.closeOwner).toHaveBeenCalled();
    expect(fixture.recaps).toHaveLength(1);
    expect(fixture.sessions.at(-1)).toMatchObject({ endedAt: Date.now() });
    expect(fixture.storage[STATE_KEY]).toMatchObject({
      status: 'idle',
      session: null,
      settings,
    });
    expect(fixture.storage['laughline:update-attempt']).toMatchObject({
      phase: 'reloading',
      version: '0.6.2',
    });
    expect(chrome.runtime.reload).toHaveBeenCalledOnce();
  });
  it('a missing owner retry opens permission onboarding without an automatic retry loop', async () => {
    await dispatch({ type: 'START', tabId: 1 });
    fixture.owner = null;
    fixture.exists = false;
    await dispatch({ type: 'RETRY_MIC' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining('step=mic'),
    });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.not.stringContaining('retry='),
    });
    expect((await dispatch({ type: 'GET_STATE' })).state.capture.error).toBe(
      'restartRequired',
    );
    expect(fixture.getStreamId).toHaveBeenCalledOnce();
  });
  it('enabling listening mid-session with denied permission keeps an explicit toolbar restart path', async () => {
    await dispatch({ type: 'SETTINGS', settings: { listen: false } });
    const before = await dispatch({ type: 'START', tabId: 1 });
    await dispatch({ type: 'SETTINGS', settings: { listen: true } });
    fixture.permission = 'denied';
    const after = await dispatch({ type: 'START', tabId: 1 });
    expect(after.state.session?.id).toBe(before.state.session?.id);
    expect(after.state.capture).toMatchObject({
      phase: 'crowdOnly',
      error: 'restartRequired',
    });
    expect(fixture.exists).toBe(false);
    expect(fixture.getStreamId).not.toHaveBeenCalled();
  });
  it('listening-off releases audio and ignores the late owner-idle report without ending the session', async () => {
    const start = await dispatch({ type: 'START', tabId: 1 });
    const sessionId = start.state.session!.id;
    const late = { ...fixture.owner!, phase: 'idle' };
    await dispatch({ type: 'SETTINGS', settings: { listen: false } });
    await dispatch(late, true);
    const result = await dispatch({ type: 'GET_STATE' });
    expect(result.state.session!.id).toBe(sessionId);
    expect(result.state.capture.phase).toBe('crowdOnly');
    expect(fixture.recaps).toHaveLength(0);
    expect(fixture.closeOwner).toHaveBeenCalled();
  });
  it('saves the old session when starting another tab and finalizes on channel departure', async () => {
    const first = await dispatch({ type: 'START', tabId: 1 });
    const second = await dispatch({ type: 'START', tabId: 2 });
    expect(second.state.session!.id).not.toBe(first.state.session!.id);
    expect(fixture.recaps).toHaveLength(1);
    expect(fixture.getStreamId).toHaveBeenLastCalledWith({ targetTabId: 2 });
    fixture.changed[0]!(2, { url: 'https://www.twitch.tv/directory' });
    expect((await dispatch({ type: 'GET_STATE' })).state.session).toBeNull();
    expect(fixture.recaps).toHaveLength(2);
  });
  it('recovers the paused owner after worker restart without asking tabCapture for a second stream', async () => {
    await dispatch({ type: 'START', tabId: 1 });
    await dispatch({ type: 'PAUSE' });
    vi.clearAllTimers();
    vi.resetModules();
    const result = await loadWorker();
    expect(result.state.status).toBe('paused');
    expect(result.state.capture.phase).toBe('paused');
    expect(fixture.getStreamId).toHaveBeenCalledOnce();
    expect(fixture.ensureOwner).toHaveBeenCalledOnce();
  });
  it('tab track ending stops and saves even while the tab remains open', async () => {
    const result = await dispatch({ type: 'START', tabId: 1 });
    await dispatch(
      {
        type: 'AUDIO_TAB_ENDED',
        sessionId: result.state.session!.id,
        ownerId: 'owner-token',
      },
      true,
    );
    expect((await dispatch({ type: 'GET_STATE' })).state.session).toBeNull();
    expect(fixture.recaps).toHaveLength(1);
  });
  it('aggregates real validated personal events and rejects stale owners and paused results', async () => {
    const started = await dispatch({ type: 'START', tabId: 1 });
    const batch = {
      type: 'PERSONAL_EVENTS',
      ownerId: 'owner-token',
      sessionId: started.state.session!.id,
      tabLaughTs: 0,
      events: [
        { kind: 'laugh', ts: Date.now(), confidence: 0.9, intensity: 3 },
        {
          kind: 'words',
          ts: Date.now(),
          phrases: [
            { text: 'no way', count: 2, class: 'ok' },
            { text: 'f***', count: 1, class: 'swear' },
          ],
        },
      ],
    };
    await dispatch({ ...batch, ownerId: 'old-owner' }, true);
    expect(
      (await dispatch({ type: 'GET_STATE' })).state.session!.laughCount,
    ).toBe(0);
    await dispatch(batch, true);
    const state = (await dispatch({ type: 'GET_STATE' })).state;
    expect(state.session).toMatchObject({
      source: 'local',
      laughCount: 1,
      topWords: [{ word: 'no way', count: 2 }],
      personal: { swears: 1, hardest: { intensity: 3 } },
    });
    await dispatch({ type: 'PAUSE' });
    await dispatch(batch, true);
    expect(
      (await dispatch({ type: 'GET_STATE' })).state.session!.laughCount,
    ).toBe(1);
    await dispatch({ type: 'STOP' });
    expect(fixture.recaps[0]).toMatchObject({
      totalLaughs: 1,
      source: 'local',
      topWord: 'no way',
      swears: 1,
    });
    expect(JSON.stringify(fixture.sessions)).not.toMatch(
      /transcript|Float32Array/,
    );
  });
});
