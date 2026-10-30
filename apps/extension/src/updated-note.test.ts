import { afterEach, expect, it, vi } from 'vitest';
import { notifyUpdatedTabs, showUpdatedNote } from './updated-note';

afterEach(() => vi.unstubAllGlobals());
it('notifies only existing Twitch tabs with the running build version, without reloading them', async () => {
  const query = vi.fn(async () => [{ id: 3 }, { id: 9 }]),
    executeScript = vi.fn(async () => []);
  vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });
  await notifyUpdatedTabs('StreamLaughs', '0.8.0');
  expect(query).toHaveBeenCalledWith({ url: 'https://www.twitch.tv/*' });
  expect(executeScript).toHaveBeenCalledTimes(2);
  expect(executeScript).toHaveBeenCalledWith({
    target: { tabId: 3 },
    func: showUpdatedNote,
    args: ['StreamLaughs', '0.8.0'],
  });
});
