import { expect, it, vi } from 'vitest';
import { initialSnapshot } from '@laughline/shared';
it('caps Twitch state paints at four a second and applies the latest snapshot after lab unfreeze', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.resetModules();
  const state = initialSnapshot();
  let storage!: (v: unknown, area: string) => void,
    message!: (v: unknown) => void;
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async () => ({}) },
      onChanged: {
        addListener: (f: typeof storage) => {
          storage = f;
        },
        removeListener: vi.fn(),
      },
    },
    runtime: {
      sendMessage: async () => ({ ok: true, state }),
      onMessage: {
        addListener: (f: typeof message) => {
          message = f;
        },
        removeListener: vi.fn(),
      },
    },
  });
  const { connectSurface, surface, panelDeliveryStats } = await import(
    './bridge'
  );
  const { labSurface } = await import('./stutter-surface');
  const close = connectSurface(250);
  await Promise.resolve();
  let paints = 0;
  const unsubscribe = surface.store.subscribe(() => paints++);
  try {
    for (let i = 1; i <= 20; i++) {
      storage(
        { 'laughline:state': { newValue: { ...state, revision: i } } },
        'local',
      );
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(paints).toBeLessThanOrEqual(4);
    expect(surface.store.getState().snapshot.revision).toBe(20);
    expect(panelDeliveryStats()).toMatchObject({
      updates: paints + 1,
      revision: 20,
    });
    labSurface.accept({ ...labSurface.get(), overlay: false });
    storage(
      { 'laughline:state': { newValue: { ...state, revision: 21 } } },
      'local',
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(surface.store.getState().snapshot.revision).toBe(20);
    message({
      type: 'STUTTER_LAB_STATE',
      switches: { ...labSurface.get(), overlay: true },
    });
    expect(surface.store.getState().snapshot.revision).toBe(21);
    expect(panelDeliveryStats()).toMatchObject({ revision: 21 });
  } finally {
    close();
    unsubscribe();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
