import {
  type AudioReport,
  emptyInferenceHealth,
  type InferenceHealth,
  InferenceHealthSchema,
  type PersonalEvent,
  PersonalEventSchema,
} from '@laughline/shared';
import { AUDIO_DEBUG } from '../audio/config';
import type { AudioFrameHub } from '../audio/ring-buffer';
import { INFERENCE_CONFIG as C } from './config';

export class InferenceBridge {
  private worker: Worker | null = null;
  private owner: AudioReport | null = null;
  private inFlight = 0;
  private drops = 0;
  private health: InferenceHealth = emptyInferenceHealth();
  private debug: unknown = null;
  private failed = false;
  constructor(
    hub: AudioFrameHub,
    private send: (message: unknown) => void,
  ) {
    hub.subscribe((source, frame, ts) => {
      if (!this.worker || this.health.phase !== 'ready') return;
      if (this.inFlight >= C.maxTransportFrames) {
        this.drops++;
        return;
      }
      const copy = frame.slice();
      this.inFlight++;
      this.worker.postMessage(
        { type: 'frame', source, frame: copy, ts, drops: this.drops },
        [copy.buffer],
      );
      this.drops = 0;
    });
  }
  sync(owner: AudioReport) {
    this.owner = owner;
    if (owner.phase !== 'active' || owner.micLost || !owner.hasMic) {
      this.close();
      this.failed = false;
      return;
    }
    if (this.worker || this.failed) return;
    this.health = { ...emptyInferenceHealth(), phase: 'warming' };
    this.publish([]);
    const worker = new Worker(chrome.runtime.getURL('/inference-worker.js'));
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.type === 'ack') this.inFlight = Math.max(0, this.inFlight - 1);
      else if (data.type === 'status') {
        const parsed = InferenceHealthSchema.safeParse(data.health);
        if (!parsed.success) return;
        this.health = parsed.data;
        if (AUDIO_DEBUG) this.debug = data.debug;
        const events: PersonalEvent[] = [];
        for (const event of (data.events ?? []).slice(0, 32)) {
          const result = PersonalEventSchema.safeParse(event);
          if (result.success) events.push(result.data);
        }
        this.publish(events);
      } else if (data.type === 'error') this.fail();
    };
    worker.onerror = () => {
      if (worker === this.worker) this.fail();
    };
    worker.postMessage({
      type: 'init',
      base: chrome.runtime.getURL('').replace(/\/$/, ''),
    });
  }
  private fail() {
    this.close();
    this.failed = true;
    this.health.phase = 'error';
    this.publish([]);
  }
  private publish(events: PersonalEvent[]) {
    if (!this.owner?.sessionId) return;
    this.send({
      type: 'INFERENCE_STATUS',
      ownerId: this.owner.ownerId,
      sessionId: this.owner.sessionId,
      health: this.health,
    });
    if (events.length)
      this.send({
        type: 'PERSONAL_EVENTS',
        ownerId: this.owner.ownerId,
        sessionId: this.owner.sessionId,
        events,
        tabLaughTs: this.health.tabLaughTs,
      });
  }
  debugState() {
    return AUDIO_DEBUG ? this.debug : null;
  }
  close() {
    if (!this.worker && this.health.phase === 'idle') return;
    // Termination also cancels in-flight inference on pause/micLost; no late result can escape.
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = 0;
    this.drops = 0;
    this.debug = null;
    this.health = emptyInferenceHealth();
    this.publish([]);
  }
}
