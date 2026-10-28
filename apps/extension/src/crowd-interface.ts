import type { CrowdState, PersonalEvent } from '@laughline/shared';
export interface CrowdSource {
  start(channel: string, emit: (state: CrowdState) => void): void;
  stop(): void;
  setSharing?(enabled: boolean): void;
  addEvents?(events: PersonalEvent[]): void;
}
