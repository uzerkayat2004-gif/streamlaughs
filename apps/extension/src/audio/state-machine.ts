import {
  type AudioReport,
  type CaptureState,
  emptyAudioMetrics,
  initialCaptureState,
} from '@laughline/shared';
export type CaptureEvent =
  | { type: 'start'; sessionId: string; listen: boolean }
  | { type: 'started' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' | 'tabClosed' | 'channelChanged' | 'tabEnded' }
  | { type: 'micLost'; error?: 'permission' | 'device' | 'restartRequired' }
  | { type: 'retry' }
  | { type: 'permissionRequired' }
  | { type: 'failed'; error: 'capture' | 'audioContext' }
  | { type: 'workerRestart'; owner: AudioReport | null };

export function captureTransition(
  state: CaptureState,
  event: CaptureEvent,
): CaptureState {
  switch (event.type) {
    case 'start':
      return {
        ...initialCaptureState(),
        phase: event.listen ? 'starting' : 'crowdOnly',
        sessionId: event.sessionId,
      };
    case 'started':
      return state.sessionId
        ? { ...state, phase: 'active', micLost: false, error: 'none' }
        : state;
    case 'pause':
      return ['active', 'micLost'].includes(state.phase)
        ? { ...state, phase: 'paused' }
        : state;
    case 'resume':
      return state.phase === 'paused'
        ? { ...state, phase: state.micLost ? 'micLost' : 'active' }
        : state;
    case 'micLost':
      return state.sessionId && !['idle', 'crowdOnly'].includes(state.phase)
        ? {
            ...state,
            phase: state.phase === 'paused' ? 'paused' : 'micLost',
            micLost: true,
            error: event.error ?? 'device',
          }
        : state;
    case 'retry':
      return state.micLost ? { ...state, error: 'none' } : state;
    case 'permissionRequired':
      return {
        ...state,
        phase: state.sessionId ? 'micLost' : 'permissionRequired',
        micLost: !!state.sessionId,
        error: 'permission',
      };
    case 'failed':
      return { ...state, phase: 'error', error: event.error };
    case 'workerRestart': {
      if (
        event.owner &&
        event.owner.sessionId === state.sessionId &&
        event.owner.phase !== 'idle'
      )
        return {
          ...state,
          phase: event.owner.phase,
          micLost: event.owner.micLost,
          metrics: event.owner.metrics,
          error: event.owner.micLost ? 'device' : 'none',
        };
      if (!state.sessionId || state.phase === 'crowdOnly') return state;
      return {
        ...state,
        phase: 'micLost',
        micLost: true,
        error: 'restartRequired',
        metrics: emptyAudioMetrics(),
      };
    }
    default:
      return initialCaptureState();
  }
}
