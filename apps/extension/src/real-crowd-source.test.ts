import { PersonalEventSchema } from '@laughline/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CrowdAccumulator, RealCrowdSource } from './real-crowd-source';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
const sources: RealCrowdSource[] = [];
const words = PersonalEventSchema.parse({
  kind: 'words',
  ts: 1000,
  phrases: [
    { text: 'bro', count: 7, class: 'ok' },
    { text: 'f***', count: 20, class: 'swear' },
    { text: 'stream', count: 9, class: 'ok' },
  ],
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: 'opaque-ephemeral-token-'.repeat(3),
        expiresAt: Date.now() + 7200000,
      }),
    })),
  );
});
afterEach(() => {
  for (const s of sources.splice(0)) s.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function source(share = false) {
  const s = new RealCrowdSource('http://localhost:8787');
  sources.push(s);
  s.setSharing(share);
  const emit = vi.fn();
  s.start('demo', emit);
  await vi.advanceTimersByTimeAsync(0);
  const ws = Socket.instances.at(-1)!;
  ws.open();
  return { s, ws, emit };
}
it('keeps a watch socket completely receive-only and keeps its token out of the URL', async () => {
  const { s, ws, emit } = await source();
  s.addEvents([words]);
  ws.onmessage?.({ data: '{"state":"few"}' });
  await vi.advanceTimersByTimeAsync(28000);
  expect(ws.sent).toEqual([]);
  expect(ws.url).toContain('mode=watch');
  expect(ws.url).not.toContain('token');
  expect(emit).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'few', source: 'live' }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('sends only allowlisted labels and numeric masked swear counts, then opts out immediately', async () => {
  const { s, ws } = await source(true);
  s.addEvents([words]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(ws.sent.at(-1)!)).toEqual({
    laughing: 0,
    intensity: 0,
    scream: 0,
    gasp: 0,
    hype: 0,
    swears: 3,
    phrases: ['bro'],
  });
  s.setSharing(false);
  const count = ws.sent.length;
  s.addEvents([words]);
  await vi.advanceTimersByTimeAsync(1050);
  const watch = Socket.instances.at(-1)!;
  watch.open();
  await vi.advanceTimersByTimeAsync(8000);
  expect(ws.sent).toHaveLength(count);
  expect(watch.sent).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('drops buffered/private-derived events on reconnect and never sends an offline backlog', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const { s, ws } = await source(true);
  ws.bufferedAmount = 1000;
  s.addEvents([words]);
  await vi.advanceTimersByTimeAsync(12000);
  expect(ws.sent).toHaveLength(1);
  expect(ws.readyState).toBe(3);
  ws.close();
  s.addEvents([words]);
  await vi.advanceTimersByTimeAsync(1000);
  const next = Socket.instances.at(-1)!;
  next.open();
  expect(JSON.parse(next.sent[0]!).phrases).toEqual([]);
  expect(JSON.parse(next.sent[0]!).swears).toBe(0);
  s.stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(Socket.instances).toHaveLength(2);
});
it('expires a silent connection and ignores stale replies after stopping', async () => {
  const { s, ws, emit } = await source();
  await vi.advanceTimersByTimeAsync(35000);
  expect(ws.readyState).toBe(3);
  expect(emit).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'offline' }),
  );
  s.stop();
  const calls = emit.mock.calls.length;
  ws.onmessage?.({ data: '{"state":"few"}' });
  await vi.advanceTimersByTimeAsync(60000);
  expect(emit).toHaveBeenCalledTimes(calls);
});
it('limits an accumulator to three crowd phrases and never returns event timestamps', () => {
  const a = new CrowdAccumulator();
  a.add([words]);
  expect(a.take()).toMatchObject({ phrases: ['bro'], swears: 3 });
  expect(a.take().phrases).toEqual([]);
  a.clear();
  expect(a.take().swears).toBe(0);
});
