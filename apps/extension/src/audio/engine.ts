import {
  type AudioMetrics,
  type AudioReport,
  emptyAudioMetrics,
} from '@laughline/shared';
import { safeError } from '../diagnostics';
import { AUDIO_DEBUG, AUDIO_STATUS_MS, MICROPHONE_CONSTRAINTS } from './config';
import { AudioFrameHub, type AudioSource } from './ring-buffer';

type SourceStats = {
  rms: number;
  peak: number;
  frames: number;
  previousFrames: number;
  dropped: number;
  cpuMsPerSecond: number;
  cpuMsPerFrame: number;
};
const emptyStats = (): SourceStats => ({
  rms: 0,
  peak: 0,
  frames: 0,
  previousFrames: 0,
  dropped: 0,
  cpuMsPerSecond: 0,
  cpuMsPerFrame: 0,
});
const stopTracks = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) {
    track.onended = null;
    track.onmute = null;
    track.stop();
  }
};

export async function microphonePermission(): Promise<PermissionState> {
  try {
    return (
      await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })
    ).state;
  } catch {
    return 'prompt';
  }
}
// The only owner of live audio. No storage, DB, network, recorder or audio logging is allowed in this module.
export class AudioEngine {
  private readonly ownerId = crypto.randomUUID();
  readonly frames = new AudioFrameHub();
  private context: AudioContext | null = null;
  private tab: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private tabPlayback: MediaStreamAudioSourceNode | null = null;
  private nodes = new Map<
    AudioSource,
    {
      source: MediaStreamAudioSourceNode;
      worklet: AudioWorkletNode;
      sink: GainNode;
    }
  >();
  private stats = { mic: emptyStats(), tab: emptyStats() };
  private metrics = emptyAudioMetrics();
  private phase: AudioReport['phase'] = 'idle';
  private sessionId: string | null = null;
  private paused = false;
  private micLost = false;
  private generation = 0;
  private segment = 0;
  private permission: PermissionStatus | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastReport = 0;
  private lastError = '';
  private lastMicTrack: MediaStreamTrack | null = null;
  private deviceSignature = '';
  private changingDevice = false;
  private deviceHandler = () => {
    const generation = this.generation;
    if (this.changingDevice || !this.sessionId) return;
    void (async () => {
      const signature = await this.inputDevices();
      if (generation !== this.generation || signature === this.deviceSignature)
        return;
      this.deviceSignature = signature;
      this.changingDevice = true;
      try {
        this.loseMic();
        await this.retryMic();
      } finally {
        this.changingDevice = false;
      }
    })();
  };
  private async inputDevices() {
    const devices =
      (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ?? [];
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => `${device.deviceId}:${device.label}`)
      .sort()
      .join('|');
  }
  diagnostics() {
    const describe = (
      stream: MediaStream | null,
      previous: MediaStreamTrack | null = null,
    ) => {
      const track = stream?.getAudioTracks()[0] ?? previous;
      return {
        name: track?.label?.slice(0, 256) ?? 'not opened',
        state: track?.readyState ?? 'none',
        muted: track?.muted ?? false,
        enabled: track?.enabled ?? false,
        sampleRate: track?.getSettings?.().sampleRate ?? 0,
      };
    };
    return {
      phase: this.phase,
      context: this.context?.state ?? 'closed',
      inputSampleRate: this.context?.sampleRate ?? 0,
      sampleRate: 16000 as const,
      frameSamples: 320 as const,
      mic: describe(this.mic, this.lastMicTrack),
      tab: describe(this.tab),
      metrics: { ...this.metrics },
      error: this.lastError,
    };
  }
  constructor(
    private readonly emit: (
      report:
        | AudioReport
        | { type: 'AUDIO_TAB_ENDED'; sessionId: string; ownerId: string },
    ) => void,
  ) {}

  status(): AudioReport | null {
    return this.sessionId
      ? {
          type: 'AUDIO_REPORT',
          ownerId: this.ownerId,
          sessionId: this.sessionId,
          phase: this.phase,
          micLost: this.micLost,
          hasMic:
            !!this.mic &&
            this.mic
              .getAudioTracks()
              .some((track) => track.readyState === 'live'),
          hasTab:
            !!this.tab &&
            this.tab
              .getAudioTracks()
              .some((track) => track.readyState === 'live'),
          metrics: { ...this.metrics },
        }
      : null;
  }
  private report() {
    const report = this.status();
    if (report) this.emit(report);
  }
  private async resumeContext() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.context!.resume(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('audioContext')), 3000);
        }),
      ]);
      if (this.context?.state !== 'running') throw new Error('audioContext');
    } finally {
      clearTimeout(timer);
    }
  }
  private async acquire(
    constraints: MediaStreamConstraints,
    generation: number,
  ) {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = navigator.mediaDevices.getUserMedia(constraints);
    void pending.then(
      (stream) => {
        if (expired || generation !== this.generation) stopTracks(stream);
      },
      () => {},
    );
    try {
      const stream = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error('device'));
          }, 15000);
        }),
      ]);
      if (generation !== this.generation) {
        stopTracks(stream);
        throw new Error('device');
      }
      return stream;
    } finally {
      clearTimeout(timer);
    }
  }
  async start({
    sessionId,
    streamId,
    micOnly = false,
    paused = false,
  }: {
    sessionId: string;
    streamId?: string;
    micOnly?: boolean;
    paused?: boolean;
  }) {
    await this.stop();
    if (micOnly && !AUDIO_DEBUG) throw new Error('capture');
    if (!streamId && !micOnly) throw new Error('capture');
    const generation = ++this.generation;
    this.sessionId = sessionId;
    this.phase = 'starting';
    this.paused = paused;
    this.micLost = false;
    this.lastError = '';
    try {
      if (streamId) {
        const audio = {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        } as unknown as MediaTrackConstraints;
        this.tab = await this.acquire({ audio, video: false }, generation);
        for (const track of this.tab.getAudioTracks())
          track.onended = () => {
            if (generation !== this.generation || !this.sessionId) return;
            this.emit({
              type: 'AUDIO_TAB_ENDED',
              sessionId: this.sessionId,
              ownerId: this.ownerId,
            });
            void this.stop();
          };
      }
      this.context = new AudioContext({ latencyHint: 'interactive' });
      if (this.tab) {
        // Direct replay is independent of processing/pause/microphone health.
        this.tabPlayback = this.context.createMediaStreamSource(this.tab);
        this.tabPlayback.connect(this.context.destination);
      }
      await this.context.audioWorklet.addModule(
        chrome.runtime.getURL('/audio-worklet.js'),
      );
      await this.resumeContext();
      if (this.context.state !== 'running') throw new Error('audioContext');
      if (this.tab) this.attach('tab', this.tab, generation);
      try {
        await this.openMic(generation);
      } catch (error) {
        this.lastError = safeError(error);
        this.loseMic();
      }
      this.deviceSignature = await this.inputDevices();
      navigator.mediaDevices.addEventListener?.(
        'devicechange',
        this.deviceHandler,
      );
      if (generation !== this.generation) throw new Error('device');
      this.phase = this.paused ? 'paused' : this.micLost ? 'micLost' : 'active';
      this.setProcessing();
      this.lastReport = performance.now();
      this.timer = setInterval(() => this.tick(), AUDIO_STATUS_MS);
      this.report();
      return this.status();
    } catch (error) {
      this.lastError = safeError(error);
      await this.stop();
      throw new Error(
        error instanceof Error && error.message === 'audioContext'
          ? 'audioContext'
          : 'capture',
      );
    }
  }
  private attach(source: AudioSource, stream: MediaStream, generation: number) {
    const context = this.context!;
    const node = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, 'laughline-frames', {
      processorOptions: { epochMs: Date.now() - context.currentTime * 1000 },
    });
    const sink = context.createGain();
    sink.gain.value = 0;
    node.connect(worklet);
    worklet.connect(sink);
    sink.connect(context.destination);
    this.nodes.set(source, { source: node, worklet, sink });
    worklet.onprocessorerror = () => {
      if (generation !== this.generation) return;
      if (source === 'mic') this.loseMic();
      else if (this.sessionId) {
        this.emit({
          type: 'AUDIO_TAB_ENDED',
          sessionId: this.sessionId,
          ownerId: this.ownerId,
        });
        void this.stop();
      }
    };
    worklet.port.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      if (data.segment !== this.segment) {
        if (data.type === 'frame') worklet.port.postMessage({ type: 'ack' });
        return;
      }
      if (data.type === 'frame') {
        if (
          !this.paused &&
          !this.micLost &&
          data.frame instanceof Float32Array &&
          data.frame.length === 320
        )
          this.frames.onFrame(source, data.frame, data.ts);
        worklet.port.postMessage({ type: 'ack' });
      }
      if (data.type === 'metrics') {
        const stat = this.stats[source],
          newFrames = Math.max(0, data.frames - stat.frames);
        stat.rms = data.rms;
        stat.peak = data.peak;
        stat.frames = data.frames;
        stat.dropped = data.dropped;
        stat.cpuMsPerSecond =
          (data.cpuMs * 1000) / Math.max(1, data.intervalMs);
        stat.cpuMsPerFrame = newFrames ? data.cpuMs / newFrames : 0;
      }
    };
  }
  private async openMic(generation: number) {
    if ((await microphonePermission()) !== 'granted')
      throw new Error('permission');
    const mic = await this.acquire(
      { audio: MICROPHONE_CONSTRAINTS, video: false },
      generation,
    );
    this.mic = mic;
    this.lastMicTrack = mic.getAudioTracks()[0] ?? null;
    for (const track of mic.getAudioTracks()) {
      track.onended = () => {
        if (generation === this.generation) this.loseMic();
      };
      track.onmute = () => {
        if (generation === this.generation) this.loseMic();
      };
    }
    this.attach('mic', mic, generation);
    this.permission = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    this.permission.onchange = () => {
      if (this.permission?.state !== 'granted') this.loseMic();
    };
    this.micLost = false;
  }
  private disconnect(source: AudioSource) {
    const graph = this.nodes.get(source);
    if (graph) {
      graph.worklet.port.onmessage = null;
      graph.worklet.onprocessorerror = null;
      graph.worklet.port.close();
      graph.source.disconnect();
      graph.worklet.disconnect();
      graph.sink.disconnect();
      this.nodes.delete(source);
    }
  }
  private loseMic() {
    if (!this.sessionId) return;
    if (this.permission) this.permission.onchange = null;
    this.permission = null;
    stopTracks(this.mic);
    this.mic = null;
    this.disconnect('mic');
    this.micLost = true;
    this.phase = this.paused ? 'paused' : 'micLost';
    this.frames.clear();
    this.stats.mic.rms = 0;
    this.stats.mic.peak = 0;
    this.setProcessing();
    this.report();
  }
  private setProcessing() {
    this.segment++;
    for (const graph of this.nodes.values())
      graph.worklet.port.postMessage({
        type: 'processing',
        segment: this.segment,
        enabled: !this.paused && !this.micLost,
      });
  }
  pause(paused: boolean) {
    this.paused = paused;
    if (this.sessionId) {
      this.phase = paused ? 'paused' : this.micLost ? 'micLost' : 'active';
      this.setProcessing();
      this.report();
    }
    return this.status();
  }
  async retryMic() {
    if (!this.sessionId || !this.context || !this.micLost) return this.status();
    const generation = this.generation;
    try {
      this.disconnect('mic');
      stopTracks(this.mic);
      this.mic = null;
      this.stats.mic = emptyStats();
      await this.resumeContext();
      if (generation !== this.generation || !this.context) return this.status();
      await this.openMic(generation);
      this.phase = this.paused ? 'paused' : 'active';
      this.setProcessing();
      this.report();
    } catch (error) {
      this.lastError = safeError(error);
      this.loseMic();
    }
    return this.status();
  }
  private tick() {
    if (
      this.mic
        ?.getAudioTracks()
        .some(
          (track) =>
            track.muted || !track.enabled || track.readyState !== 'live',
        )
    )
      this.loseMic();
    const now = performance.now(),
      elapsed = Math.max(1, now - this.lastReport);
    this.lastReport = now;
    const mic = this.stats.mic,
      tab = this.stats.tab,
      processing = !this.paused && !this.micLost;
    const micDelta = Math.max(0, mic.frames - mic.previousFrames),
      tabDelta = Math.max(0, tab.frames - tab.previousFrames);
    this.metrics = {
      micLevel: processing ? mic.rms : 0,
      tabLevel: processing ? tab.rms : 0,
      micPeak: processing ? mic.peak : 0,
      tabPeak: processing ? tab.peak : 0,
      micFps: (Math.max(0, mic.frames - mic.previousFrames) * 1000) / elapsed,
      tabFps: (Math.max(0, tab.frames - tab.previousFrames) * 1000) / elapsed,
      micFrames: mic.frames,
      tabFrames: tab.frames,
      micSamples: this.frames.size('mic'),
      tabSamples: this.frames.size('tab'),
      droppedFrames: mic.dropped + tab.dropped,
      cpuMsPerFrame:
        (mic.cpuMsPerFrame * micDelta + tab.cpuMsPerFrame * tabDelta) /
        Math.max(1, micDelta + tabDelta),
      cpuMsPerSecond: mic.cpuMsPerSecond + tab.cpuMsPerSecond,
    } satisfies AudioMetrics;
    mic.previousFrames = mic.frames;
    tab.previousFrames = tab.frames;
    this.report();
  }
  async stop() {
    ++this.generation;
    navigator.mediaDevices.removeEventListener?.(
      'devicechange',
      this.deviceHandler,
    );
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.permission) this.permission.onchange = null;
    this.permission = null;
    this.disconnect('mic');
    this.disconnect('tab');
    stopTracks(this.mic);
    stopTracks(this.tab);
    this.mic = null;
    this.tab = null;
    this.tabPlayback?.disconnect();
    this.tabPlayback = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
    this.frames.clear();
    this.stats = { mic: emptyStats(), tab: emptyStats() };
    this.metrics = emptyAudioMetrics();
    this.phase = 'idle';
    this.paused = false;
    this.micLost = false;
    this.report();
    this.sessionId = null;
  }
}
