import { type Command, type Reply, STATE_KEY } from '@laughline/shared';
import { createSurfaceStore } from './sync-store';

export const surface = createSurfaceStore();
export async function command(message: Command) {
  const reply: Reply = await chrome.runtime.sendMessage(message);
  if (!reply?.ok)
    throw new Error(reply?.error ?? 'The extension is restarting. Try again.');
  surface.accept(reply.state);
  return reply.state;
}
export function connectSurface() {
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[STATE_KEY])
      surface.accept(changes[STATE_KEY].newValue);
  };
  const onMessage = (message: unknown) => {
    if (
      typeof message === 'object' &&
      message &&
      'type' in message &&
      message.type === 'STATE' &&
      'state' in message
    )
      surface.accept(message.state);
  };
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);
  void chrome.storage.local
    .get(STATE_KEY)
    .then((values) => surface.accept(values[STATE_KEY]));
  void command({ type: 'GET_STATE' }).catch(console.error);
  return () => {
    chrome.storage.onChanged.removeListener(onStorage);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
}
