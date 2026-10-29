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
import {
  emptyWorkerDiagnostics,
  ModelStateSchema,
  modelState,
  SpeechResultSchema,
  safeError,
  WorkerDiagnosticsSchema,
} from '../diagnostics';
import { INFERENCE_CONFIG as C } from './config';

export class InferenceBridge {
  private worker: Worker | null = null;
  private speechWorker: Worker | null = null;
  private speechState = modelState();
  private speechResources: string[] = [];
  private pendingSpeech: { id: number; samples: Float32Array } | null = null;
  private activeSpeechId: number | null = null;
  private lastWorkerReport = 0;
  private owner: AudioReport | null = null;
  private inFlight = 0;
  private drops = 0;
  private health: InferenceHealth = emptyInferenceHealth();
  private debug: unknown = null;
  private failed = false;
  private productionDiagnostics = emptyWorkerDiagnostics();
  diagnostics() {
    const stale = performance.now() - this.lastWorkerReport > 1500;
    return {
      ...this.productionDiagnostics,
      models: {
        ...this.productionDiagnostics.models,
        whisper: this.speechState,
      },
      ...(stale ? { micFps: 0, tabFps: 0 } : {}),
      health: { ...this.health },
    };
  }
  private forwardSpeech() {
    if (!this.pendingSpeech || !this.worker) return;
    if (this.speechState.phase === 'error') {
      const pending = this.pendingSpeech;
      pending.samples.fill(0);
      this.pendingSpeech = null;
      this.worker.postMessage({
        type: 'speech_result',
        id: pending.id,
        error: this.speechState.error || 'speech model unavailable',
      });
    } else if (this.speechState.phase === 'ready' && this.speechWorker) {
      const pending = this.pendingSpeech;
      this.pendingSpeech = null;
      this.activeSpeechId = pending.id;
      this.speechWorker.postMessage(
        { type: 'speech', id: pending.id, samples: pending.samples },
        [pending.samples.buffer],
      );
    }
  }
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
    this.productionDiagnostics = emptyWorkerDiagnostics();
    this.speechState = modelState();
    this.publish([]);
    const worker = new Worker(chrome.runtime.getURL('/inference-worker.js'));
    this.worker = worker;
    const speechWorker = new Worker(chrome.runtime.getURL('/speech-worker.js'));
    this.speechWorker = speechWorker;
    speechWorker.onmessage = ({ data }) => {
      if (speechWorker !== this.speechWorker || worker !== this.worker) return;
      if (data.type === 'speech_status') {
        const parsed = ModelStateSchema.safeParse(data.model);
        if (parsed.success) this.speechState = parsed.data;
        if (AUDIO_DEBUG && Array.isArray(data.resources))
          this.speechResources = data.resources
            .filter(
              (url: unknown) =>
                typeof url === 'string' &&
                url.startsWith(chrome.runtime.getURL('/')),
            )
            .slice(-40);
        worker.postMessage({ type: 'speech_status', model: this.speechState });
        this.forwardSpeech();
      } else if (data.type === 'speech_result') {
        if (data.id !== this.activeSpeechId) return;
        this.activeSpeechId = null;
        if (
          AUDIO_DEBUG &&
          this.debug &&
          typeof this.debug === 'object' &&
          typeof data.debugTranscript === 'string'
        )
          this.debug = {
            ...(this.debug && typeof this.debug === 'object' ? this.debug : {}),
            lastTranscript: data.debugTranscript.slice(0, 1000),
          };
        const parsed = SpeechResultSchema.safeParse(data.result);
        worker.postMessage({
          type: 'speech_result',
          id: data.id,
          ...(parsed.success
            ? { result: parsed.data }
            : {
                error:
                  typeof data.error === 'string'
                    ? data.error.slice(0, 400)
                    : 'invalid local speech result',
              }),
        });
      }
    };
    speechWorker.onerror = (event) => {
      if (speechWorker !== this.speechWorker) return;
      this.speechState = {
        phase: 'error',
        ms: 0,
        error: safeError(new Error(event.message)),
      };
      if (this.activeSpeechId !== null) {
        worker.postMessage({
          type: 'speech_result',
          id: this.activeSpeechId,
          error: this.speechState.error,
        });
        this.activeSpeechId = null;
      }
      worker.postMessage({ type: 'speech_status', model: this.speechState });
      this.forwardSpeech();
    };
    speechWorker.postMessage({
      type: 'init',
      base: chrome.runtime.getURL('').replace(/\/$/, ''),
    });
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.type === 'ack') this.inFlight = Math.max(0, this.inFlight - 1);
      else if (data.type === 'status') {
        this.lastWorkerReport = performance.now();
        const diagnostic = WorkerDiagnosticsSchema.safeParse(data.diagnostics);
        if (diagnostic.success) this.productionDiagnostics = diagnostic.data;
        const parsed = InferenceHealthSchema.safeParse(data.health);
        if (!parsed.success) return;
        this.health = parsed.data;
        if (AUDIO_DEBUG && data.debug && typeof data.debug === 'object')
          this.debug = {
            ...data.debug,
            lastTranscript:
              this.debug && typeof this.debug === 'object'
                ? (Reflect.get(this.debug, 'lastTranscript') ?? '')
                : '',
          };
        const events: PersonalEvent[] = [];
        for (const event of (data.events ?? []).slice(0, 32)) {
          const result = PersonalEventSchema.safeParse(event);
          if (result.success) events.push(result.data);
        }
        this.publish(events);
      } else if (data.type === 'speech_request') {
        if (
          !(data.samples instanceof Float32Array) ||
          data.samples.length > 128000 ||
          !Number.isInteger(data.id)
        )
          return;
        this.pendingSpeech?.samples.fill(0);
        this.pendingSpeech = { id: data.id, samples: data.samples };
        this.forwardSpeech();
      } else if (data.type === 'error')
        this.fail(
          typeof data.error === 'string'
            ? data.error.slice(0, 400)
            : 'inference worker failed',
        );
    };
    worker.onerror = (event) => {
      if (worker === this.worker)
        this.fail(safeError(new Error(event.message)));
    };
    worker.postMessage({
      type: 'init',
      base: chrome.runtime.getURL('').replace(/\/$/, ''),
    });
  }
  private fail(error = 'inference worker failed') {
    const diagnostics = this.productionDiagnostics;
    this.close();
    this.productionDiagnostics = diagnostics;
    this.failed = true;
    this.health.phase = 'error';
    this.productionDiagnostics.error = error;
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
    return AUDIO_DEBUG && this.debug && typeof this.debug === 'object'
      ? {
          ...this.debug,
          resources: [
            ...new Set([
              ...(Array.isArray(Reflect.get(this.debug, 'resources'))
                ? Reflect.get(this.debug, 'resources')
                : []),
              ...this.speechResources,
            ]),
          ],
        }
      : null;
  }
  close() {
    if (!this.worker && !this.speechWorker && this.health.phase === 'idle')
      return;
    // Termination also cancels in-flight inference on pause/micLost; no late result can escape.
    this.worker?.terminate();
    this.speechWorker?.terminate();
    this.speechWorker = null;
    this.pendingSpeech?.samples.fill(0);
    this.pendingSpeech = null;
    this.activeSpeechId = null;
    this.speechResources = [];
    this.worker = null;
    this.inFlight = 0;
    this.drops = 0;
    this.debug = null;
    this.health = emptyInferenceHealth();
    this.productionDiagnostics = emptyWorkerDiagnostics();
    this.speechState = modelState();
    this.publish([]);
  }
}
