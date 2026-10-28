import type { Snapshot } from '@laughline/shared';

export function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (/toolbar|Alt\+Shift|capture could not/i.test(text))
    return 'audio couldn’t start · open the toolbar and press start';
  if (/open.*Twitch stream/i.test(text)) return 'open a twitch stream to start';
  return 'couldn’t connect · reopen the popup to retry';
}

export function audioNotice(snapshot: Snapshot) {
  if (snapshot.capture.micLost)
    return { text: 'mic lost · tap to retry', action: 'retryMic' } as const;
  if (snapshot.capture.phase === 'permissionRequired')
    return {
      text: 'mic needs permission · open welcome',
      action: 'startAudio',
    } as const;
  if (snapshot.capture.phase === 'error')
    return {
      text: 'audio didn’t start · try start again',
      action: 'startAudio',
    } as const;
  if (!snapshot.session || !snapshot.settings.listen) return null;
  if (snapshot.inference.phase === 'error')
    return {
      text: 'models took a breather · retry models',
      action: 'restartModels',
    } as const;
  if (
    snapshot.capture.phase === 'crowdOnly' ||
    snapshot.capture.error === 'restartRequired'
  )
    return {
      text: 'ready to listen? · start audio',
      action: 'startAudio',
    } as const;
  if (snapshot.inference.lowPower)
    return { text: 'low power · words paused', action: null } as const;
  if (
    snapshot.inference.phase === 'warming' ||
    snapshot.capture.phase === 'starting'
  )
    return { text: 'warming up…', action: null } as const;
  return null;
}
