import {
  type AudioReport,
  emptyAudioMetrics,
  initialCaptureState,
} from '@laughline/shared';
import { describe, expect, it } from 'vitest';
import { captureTransition as transition } from './state-machine';

const starting = () =>
  transition(initialCaptureState(), {
    type: 'start',
    sessionId: 'one',
    listen: true,
  });
const active = () => transition(starting(), { type: 'started' });
describe('capture state machine', () => {
  it('starts one owner, then marks it active', () => {
    expect(starting().phase).toBe('starting');
    expect(active().phase).toBe('active');
  });
  it('creates a crowd-only session when listening is disabled', () =>
    expect(
      transition(initialCaptureState(), {
        type: 'start',
        sessionId: 'one',
        listen: false,
      }).phase,
    ).toBe('crowdOnly'));
  it('pauses and resumes without replacing the owner', () => {
    const paused = transition(active(), { type: 'pause' });
    expect(paused.phase).toBe('paused');
    expect(transition(paused, { type: 'resume' })).toEqual(active());
  });
  it('retains micLost across pause/resume until a successful retry', () => {
    const lost = transition(active(), { type: 'micLost' });
    expect(lost.phase).toBe('micLost');
    const paused = transition(lost, { type: 'pause' });
    expect(transition(paused, { type: 'resume' }).phase).toBe('micLost');
    expect(
      transition(transition(lost, { type: 'retry' }), { type: 'started' })
        .micLost,
    ).toBe(false);
  });
  it.each(['stop', 'tabClosed', 'channelChanged', 'tabEnded'] as const)(
    '%s releases ownership',
    (type) =>
      expect(transition(active(), { type })).toEqual(initialCaptureState()),
  );
  it('requires mic permission before capture and preserves a lost session', () => {
    expect(
      transition(initialCaptureState(), { type: 'permissionRequired' }).phase,
    ).toBe('permissionRequired');
    expect(transition(active(), { type: 'permissionRequired' })).toMatchObject({
      phase: 'micLost',
      sessionId: 'one',
      error: 'permission',
    });
  });
  it('re-syncs an existing offscreen owner after workerRestart', () => {
    const owner: AudioReport = {
      type: 'AUDIO_REPORT',
      ownerId: 'owner-token',
      sessionId: 'one',
      phase: 'paused',
      micLost: false,
      hasMic: true,
      hasTab: true,
      metrics: { ...emptyAudioMetrics(), micFrames: 50 },
    };
    expect(
      transition(active(), { type: 'workerRestart', owner }),
    ).toMatchObject({ phase: 'paused', metrics: { micFrames: 50 } });
  });
  it('requires a fresh toolbar gesture if the owner vanished or belongs to another session', () => {
    expect(
      transition(active(), { type: 'workerRestart', owner: null }),
    ).toMatchObject({ phase: 'micLost', error: 'restartRequired' });
    expect(
      transition(active(), {
        type: 'workerRestart',
        owner: {
          type: 'AUDIO_REPORT',
          ownerId: 'owner-token',
          sessionId: 'other',
          phase: 'active',
          micLost: false,
          hasMic: true,
          hasTab: true,
          metrics: emptyAudioMetrics(),
        },
      }).error,
    ).toBe('restartRequired');
  });
  it('does not turn a crowd-only session into audio on workerRestart', () => {
    const state = transition(initialCaptureState(), {
      type: 'start',
      sessionId: 'one',
      listen: false,
    });
    expect(transition(state, { type: 'workerRestart', owner: null })).toEqual(
      state,
    );
  });
  it('new ownership resets old metrics and mic loss', () =>
    expect(
      transition(transition(active(), { type: 'micLost' }), {
        type: 'start',
        sessionId: 'two',
        listen: true,
      }),
    ).toMatchObject({ phase: 'starting', sessionId: 'two', micLost: false }));
});
