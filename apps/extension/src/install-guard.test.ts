import { afterEach, expect, it, vi } from 'vitest';
import {
  createInstallGuard,
  INSTALL_MARKER_PREFIX,
  preferredInstall,
} from './install-guard';

const zip = 'fkocldgggcmhihelohiicoakcfomhepg',
  store = 'lofdkbfimkjjfglhhnpkiljocbikmkej';
function fixture() {
  const attributes = new Map<string, string>();
  const callbacks: MutationCallback[] = [];
  const element = {
    getAttributeNames: () => [...attributes.keys()],
    getAttribute: (k: string) => attributes.get(k) ?? null,
    setAttribute: (k: string, v: string) => attributes.set(k, v),
    removeAttribute: (k: string) => attributes.delete(k),
  };
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(cb: MutationCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  const tick = () =>
    callbacks.forEach((cb) => {
      cb(
        [{ attributeName: INSTALL_MARKER_PREFIX + store }] as MutationRecord[],
        {} as MutationObserver,
      );
    });
  return { element: element as unknown as HTMLElement, tick };
}
afterEach(() => vi.unstubAllGlobals());
it('prefers store instances and deterministically elects only one among multiple normal installs', () => {
  expect(
    preferredInstall([
      { id: zip, kind: 'development', yielded: false },
      { id: store, kind: 'normal', yielded: false },
    ]),
  ).toBe(store);
  expect(
    preferredInstall([
      { id: 'b', kind: 'normal', yielded: false },
      { id: 'a', kind: 'normal', yielded: false },
    ]),
  ).toBe('a');
});
it('hides ZIP, stops its recording, then acknowledges the handoff before a store mic can start', async () => {
  const { element, tick } = fixture();
  let finish: () => void = () => {};
  const visible = vi.fn(),
    tip = vi.fn();
  const stop = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const manual = createInstallGuard(element, zip, 'development', {
    visible,
    stop,
    tip,
  });
  expect(await manual.claim()).toBe(true);
  const normal = createInstallGuard(element, store, 'normal', {
    visible: vi.fn(),
    stop: async () => {},
    tip: vi.fn(),
  });
  tick();
  expect(manual.owns()).toBe(false);
  expect(visible).toHaveBeenLastCalledWith(false);
  expect(stop).toHaveBeenCalledOnce();
  expect(tip).toHaveBeenCalledOnce();
  expect(await normal.claim(0)).toBe(false);
  finish();
  await Promise.resolve();
  tick();
  expect(await normal.claim()).toBe(true);
  expect(await manual.claim()).toBe(false);
  tick();
  expect(tip).toHaveBeenCalledOnce();
  normal.cleanup();
  tick();
  expect(await manual.claim()).toBe(true);
  manual.cleanup();
  expect(element.getAttributeNames()).toHaveLength(0);
});
it('fails closed if the other recorder cannot stop; never acknowledges a second mic', async () => {
  const { element, tick } = fixture();
  const manual = createInstallGuard(element, zip, 'development', {
    visible: () => {},
    stop: async () => {
      throw new Error('save failed');
    },
    tip: () => {},
  });
  const normal = createInstallGuard(element, store, 'normal', {
    visible: () => {},
    stop: async () => {},
    tip: () => {},
  });
  tick();
  await Promise.resolve();
  expect(await normal.claim(0)).toBe(false);
  manual.cleanup();
  normal.cleanup();
});
