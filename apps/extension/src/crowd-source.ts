import type { CrowdState } from '@laughline/shared';
import type { CrowdSource } from './crowd-interface';

export type { CrowdSource } from './crowd-interface';

import { RealCrowdSource } from './real-crowd-source';
export const makeCrowdSource = (): CrowdSource =>
  import.meta.env.MODE === 'test' || import.meta.env.MODE === 'ui-test'
    ? new FakeCrowdSource()
    : new RealCrowdSource(import.meta.env.VITE_CROWD_API_URL ?? '');

// Part 1 demo adapter only. No simulation controls or network transport ship in the UI.
export class FakeCrowdSource implements CrowdSource {
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  start(channel: string, emit: (state: CrowdState) => void) {
    this.stop();
    const next = () => {
      const phase = Math.floor(this.tick++ / 16) % 3;
      const count =
        phase === 0
          ? 2
          : phase === 1
            ? 40 + Math.floor(Math.random() * 50)
            : 150 + Math.floor(Math.random() * 110);
      emit({
        channel,
        laughingNow: count,
        laughlineViewers: phase === 0 ? 2 : phase === 1 ? 124 : 328,
        topWords:
          phase === 0
            ? []
            : [
                {
                  word: phase === 1 ? 'LMAO' : 'WHAT',
                  count: Math.max(3, Math.round(count * 0.5)),
                },
                { word: 'no way', count: Math.max(3, Math.round(count * 0.3)) },
                { word: 'bruh', count: Math.max(3, Math.round(count * 0.15)) },
              ],
        updatedAt: Date.now(),
        source: 'fake',
        state: 'live',
      });
    };
    this.tick = 16;
    next();
    this.timer = setInterval(next, 800);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
