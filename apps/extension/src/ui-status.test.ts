import { initialSnapshot } from '@laughline/shared';
import { expect, it } from 'vitest';
import { audioNotice, friendlyError } from './ui-status';

it('shows one actionable priority message instead of stacked audio states', () => {
  const snapshot = initialSnapshot();
  snapshot.capture.phase = 'permissionRequired';
  snapshot.capture.micLost = true;
  snapshot.inference.phase = 'warming';
  snapshot.inference.lowPower = true;
  expect(audioNotice(snapshot)?.action).toBe('retryMic');
  snapshot.capture.micLost = false;
  expect(audioNotice(snapshot)?.action).toBe('startAudio');
  snapshot.capture.phase = 'idle';
  expect(audioNotice(snapshot)).toBeNull();
});
it('keeps internal exception details out of production error copy', () => {
  expect(friendlyError(new Error('secret-token SQLITE_ERROR'))).toBe(
    'couldn’t connect · reopen the popup to retry',
  );
  expect(friendlyError(new Error('Audio capture could not start.'))).toContain(
    'press start',
  );
  expect(friendlyError(new Error('open any Twitch stream'))).toBe(
    'open a twitch stream to start',
  );
});
