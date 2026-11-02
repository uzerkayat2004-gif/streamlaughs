import { type Command, type Reply, STATE_KEY } from '@laughline/shared';
import { createSurfaceStore } from './sync-store';
import { labSurface } from './stutter-surface';

export const surface = createSurfaceStore();
export async function command(message: Command) {
  const reply: Reply = await chrome.runtime.sendMessage(message);
  if (!reply?.ok)
    throw new Error(reply?.error ?? 'The extension is restarting. Try again.');
  surface.accept(reply.state);
  return reply.state;
}
export function connectSurface(throttleMs = 0) {
  let last = 0,
    latest: unknown,
    timer: ReturnType<typeof setTimeout> | undefined;
  const accept = (payload: unknown) => {
    latest = payload;
    if (throttleMs && !labSurface.get().overlay) return;
    const remaining = throttleMs - (performance.now() - last);
    if (remaining > 0) {
      timer ??= setTimeout(() => {
        timer = undefined;
        accept(latest);
      }, remaining);
      return;
    }
    last = performance.now();
    surface.accept(payload);
  };
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[STATE_KEY])
      accept(changes[STATE_KEY].newValue);
  };
  const onMessage = (message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'STUTTER_LAB_STATE' &&
      'switches' in message
    ) {
      labSurface.accept(message.switches);
      accept(latest);
      return;
    }
    if (
      typeof message === 'object' &&
      message &&
      'type' in message &&
      message.type === 'STATE' &&
      'state' in message
    )
      accept(message.state);
  };
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);
  void chrome.storage.local
    .get(STATE_KEY)
    .then((values) => accept(values[STATE_KEY]));
  void command({ type: 'GET_STATE' }).catch(console.error);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(onStorage);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
}
