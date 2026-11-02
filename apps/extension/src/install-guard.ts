import type { InstallKind } from './install-type';

export type InstallMarker = { id: string; kind: InstallKind; yielded: boolean };
export const INSTALL_MARKER_PREFIX = 'data-streamlaughs-install-';
export function preferredInstall(markers: InstallMarker[]) {
  return [...markers].sort(
    (a, b) =>
      Number(b.kind === 'normal') - Number(a.kind === 'normal') ||
      a.id.localeCompare(b.id),
  )[0]?.id;
}
export function readInstallMarkers(element: Element): InstallMarker[] {
  return element.getAttributeNames().flatMap((key) => {
    if (!key.startsWith(INSTALL_MARKER_PREFIX)) return [];
    const id = key.slice(INSTALL_MARKER_PREFIX.length);
    if (!/^[a-p]{32}$/.test(id)) return [];
    const [kind, status] = (element.getAttribute(key) ?? '').split(':');
    if (kind !== 'development' && kind !== 'normal' && kind !== 'other')
      return [];
    return [{ id, kind, yielded: status === 'yielded' }];
  });
}

/** Cooperating instances share only install type and handoff readiness, never history or audio. */
export function createInstallGuard(
  element: HTMLElement,
  id: string,
  kind: InstallKind,
  effects: {
    visible: (value: boolean) => void;
    stop: () => Promise<void>;
    tip: () => void;
  },
) {
  const key = INSTALL_MARKER_PREFIX + id;
  let alive = true,
    winning = true,
    stopping: Promise<void> | undefined,
    tipped = false;
  const mark = (yielded: boolean) => {
    const value = `${kind}:${yielded ? 'yielded' : 'ready'}`;
    if (element.getAttribute(key) !== value) element.setAttribute(key, value);
  };
  const reconcile = () => {
    if (!alive) return;
    const markers = readInstallMarkers(element);
    const next = preferredInstall(markers) === id;
    effects.visible(next);
    if (!next && winning) {
      stopping = effects
        .stop()
        .then(() => {
          if (alive) mark(true);
        })
        .catch(() => {
          // No acknowledgement on a failed stop: the winner must refuse to open another mic.
        });
    }
    if (next && !winning) {
      mark(false);
      stopping = undefined;
    }
    winning = next;
    if (
      !next &&
      kind === 'development' &&
      markers.some((m) => m.kind === 'normal') &&
      !tipped
    ) {
      tipped = true;
      effects.tip();
    }
  };
  mark(false);
  const observer = new MutationObserver((changes) => {
    if (changes.some((c) => c.attributeName?.startsWith(INSTALL_MARKER_PREFIX)))
      reconcile();
  });
  observer.observe(element, { attributes: true });
  reconcile();
  return {
    async claim(timeoutMs = 15_000) {
      const end = Date.now() + timeoutMs;
      do {
        reconcile();
        const markers = readInstallMarkers(element);
        if (!winning) return false;
        if (markers.every((m) => m.id === id || m.yielded)) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (alive && Date.now() < end);
      return false;
    },
    owns: () => winning,
    cleanup() {
      alive = false;
      observer.disconnect();
      element.removeAttribute(key);
      void stopping;
    },
  };
}
