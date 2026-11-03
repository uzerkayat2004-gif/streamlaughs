import {
  type AudioMetrics,
  type AudioReport,
  emptyAudioMetrics,
} from '@laughline/shared';
import { safeError, logAudioError } from '../diagnostics';
import {
  bluetoothHint,
  defaultLab,
  type LabSwitches,
  PlaybackWatchdog,
} from '../stutter';
import { AUDIO_STATUS_MS, MICROPHONE_CONSTRAINTS } from './config';
import { openSelectedMicrophone } from './microphone';
import { AudioFrameHub, type AudioSource } from './ring-buffer';

type SourceStats = {
  rms: number;
  peak: number;
  frames: number;
  previousFrames: number;
  dropped: number;
  cpuMsPerSecond: number;
  cpuMsPerFrame: number;
  lastFrameAt: number;
  inputChannels: number;
  selectedChannel: number;
};
const emptyStats = (): SourceStats => ({
  rms: 0,
  peak: 0,
  frames: 0,
  previousFrames: 0,
  dropped: 0,
  cpuMsPerSecond: 0,
  cpuMsPerFrame: 0,
  lastFrameAt: 0,
  inputChannels: 0,
  selectedChannel: 0,
});
const stopTracks = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) {
    track.onended = null;
    track.onmute = null;
    track.onunmute = null;
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
  private playbackContext: AudioContext | null = null;
  private tab: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private tabPlayback: MediaStreamAudioSourceNode | null = null;
  private nodes = new Map<
    AudioSource,
    {
      source: MediaStreamAudioSourceNode;
      worklet: AudioWorkletNode;
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
  private micTestTimer: ReturnType<typeof setTimeout> | undefined;
  private lastReport = 0;
  private lastError = '';
  private errors: string[] = [];
  private recordError(error: unknown) {
    const message = safeError(error);
    if (message !== this.lastError) logAudioError('microphone capture', error);
    this.lastError = message;
    this.errors.push(this.lastError);
    this.errors = this.errors.slice(-10);
  }
  private lastMicTrack: MediaStreamTrack | null = null;
  private deviceSignature = '';
  private changingDevice = false;
  private mutedSince: number | null = null;
  private lab = defaultLab();
  private watchdog = new PlaybackWatchdog();
  private playback = this.watchdog.sample(null);
  private recoveryAttempts = 0;
  private recoveryReason = '';
  private recovering = false;
  private nextRecoveryAt = 0;
  private lastNonzeroAt = 0;
  private everHeard = false;
  private micAttempts = 0;
  private micOpened = 0;
  private micDeviceId = 'default';
  private micPermission: PermissionState = 'prompt';
  private deviceHandler = () => {
    const generation = this.generation;
    if (this.changingDevice || !this.sessionId || !this.lab.micCapture) return;
    void (async () => {
      const signature = await this.inputDevices();
      if (generation !== this.generation || signature === this.deviceSignature)
        return;
      this.deviceSignature = signature;
      const active = this.mic?.getAudioTracks()[0];
      const id = active?.getSettings?.().deviceId;
      // Plugging in a camera or a second mic is not loss of the active device.
      if (
        active?.readyState === 'live' &&
        !active.muted &&
        id &&
        signature.split('|').some((device) => device.startsWith(`${id}:`))
      )
        return;
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
        channelCount: track?.getSettings?.().channelCount ?? 0,
        echoCancellation: track?.getSettings?.().echoCancellation ?? false,
        noiseSuppression: track?.getSettings?.().noiseSuppression ?? false,
        autoGainControl: track?.getSettings?.().autoGainControl ?? false,
        device:
          this.micDeviceId === 'default'
            ? 'system default'
            : 'selected locally',
      };
    };
    return {
      recoveryAttempts: this.recoveryAttempts,
      recoveryReason: this.recoveryReason,
      phase: this.phase,
      context: this.context?.state ?? 'closed',
      playbackContext: this.playbackContext?.state ?? 'closed',
      speakerConnections: this.playbackContext && this.tabPlayback ? 1 : 0,
      tabCaptureTracks:
        this.tab?.getAudioTracks().filter((t) => t.readyState === 'live')
          .length ?? 0,
      inputSampleRate: this.context?.sampleRate ?? 0,
      sampleRate: 16000 as const,
      frameSamples: 320 as const,
      mic: describe(this.mic, this.lastMicTrack),
      tab: describe(this.tab),
      metrics: { ...this.metrics },
      micWorklet: {
        lastFrameAt: this.stats.mic.lastFrameAt,
        inputChannels: this.stats.mic.inputChannels,
        selectedChannel: this.stats.mic.selectedChannel,
      },
      error: this.lastError,
      permission: this.micPermission,
      micAttempts: this.micAttempts,
      micOpened: this.micOpened,
      errors: [...this.errors],
      playback: { ...this.playback },
      lab: { ...this.lab },
      bluetooth:
        !!this.mic && bluetoothHint(this.mic.getAudioTracks()[0]?.label ?? ''),
      noiseSuppression:
        this.mic?.getAudioTracks()[0]?.getSettings?.().noiseSuppression ??
        false,
      autoGainControl:
        this.mic?.getAudioTracks()[0]?.getSettings?.().autoGainControl ?? false,
      echoCancellation:
        this.mic?.getAudioTracks()[0]?.getSettings?.().echoCancellation ??
        MICROPHONE_CONSTRAINTS.echoCancellation,
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
  private async resumeContext(context = this.context) {
    if (!context) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.resume(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('audioContext')), 3000);
        }),
      ]);
      if (context.state !== 'running') throw new Error('audioContext');
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
    micDeviceId = 'default',
    micOnly = false,
    nativePlayback = false,
    paused = false,
  }: {
    sessionId: string;
    streamId?: string;
    micDeviceId?: string;
    micOnly?: boolean;
    nativePlayback?: boolean;
    paused?: boolean;
  }) {
    await this.stop();
    // Only the background's explicit mic-check gesture can request micOnly.
    if (!streamId && !micOnly && !nativePlayback) throw new Error('capture');
    const generation = ++this.generation;
    this.sessionId = sessionId;
    this.recoveryAttempts = 0;
    this.recovering = false;
    this.recoveryReason = '';
    this.lastNonzeroAt = Date.now();
    this.everHeard = false;
    this.nextRecoveryAt = 0;
    this.micDeviceId = micDeviceId;
    this.phase = 'starting';
    this.paused = paused;
    this.lastNonzeroAt = Date.now();
    this.micLost = false;
    this.lab = { ...defaultLab(), tabCapture: !!streamId };
    this.watchdog = new PlaybackWatchdog();
    this.playback = this.watchdog.sample(null);
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
      if (this.tab) {
        const rate = this.tab.getAudioTracks()[0]?.getSettings?.().sampleRate;
        this.playbackContext = new AudioContext({
          latencyHint: 'playback',
          ...(rate ? { sampleRate: rate } : {}),
        });
        // Direct replay is independent of processing/pause/microphone health.
        this.tabPlayback = this.playbackContext.createMediaStreamSource(
          this.tab,
        );
        this.tabPlayback.connect(this.playbackContext.destination);
        await this.resumeContext(this.playbackContext);
      }
      // Active microphone capture must exist before analysis is resumed. With
      // native Twitch playback there is no tab capture to unlock Web Audio or
      // settle an input/output device change (notably Bluetooth) for us.
      try {
        await this.openMic(generation);
      } catch (error) {
        this.recordError(error);
        this.loseMic();
      }
      if (generation !== this.generation) throw new Error('device');
      this.context = new AudioContext({ latencyHint: 'balanced' });
      await this.context.audioWorklet.addModule(
        chrome.runtime.getURL('/audio-worklet.js'),
      );
      if (this.tab) this.attach('tab', this.tab, generation);
      if (this.mic) this.attach('mic', this.mic, generation);
      if (this.mic || this.tab) {
        await this.resumeContext();
        if (this.context.state !== 'running') throw new Error('audioContext');
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
      if (micOnly)
        this.micTestTimer = setTimeout(() => {
          if (!this.sessionId || generation !== this.generation) return;
          this.emit({
            type: 'AUDIO_TAB_ENDED',
            sessionId: this.sessionId,
            ownerId: this.ownerId,
          });
          void this.stop();
        }, 120000);
      this.report();
      return this.status();
    } catch (error) {
      this.recordError(error);
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
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: {
        source,
        epochMs: Date.now() - context.currentTime * 1000,
      },
    });
    // A zero-output worklet is an active capture sink. It never opens a speaker route.
    node.connect(worklet);
    this.nodes.set(source, { source: node, worklet });
    worklet.onprocessorerror = () => {
      if (generation !== this.generation) return;
      this.recordError(
        new Error(`${source} AudioWorklet processor failed · retry microphone`),
      );
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
        this.stats[source].lastFrameAt = Date.now();
        if (
          source === 'mic' &&
          data.frame instanceof Float32Array &&
          data.frame.some((x: number) => x !== 0)
        ) {
          this.lastNonzeroAt = Date.now();
          this.everHeard = true;
        }
        try {
          if (
            !this.paused &&
            !this.micLost &&
            data.frame instanceof Float32Array &&
            data.frame.length === 320
          )
            this.frames.onFrame(source, data.frame, data.ts);
        } catch (error) {
          this.recordError(error);
        } finally {
          // A failed subscriber must not strand the worklet's eight-frame
          // backpressure allowance and silence every later microphone packet.
          worklet.port.postMessage({ type: 'ack' });
        }
      }
      if (data.type === 'metrics') {
        const stat = this.stats[source],
          newFrames = Math.max(0, data.frames - stat.frames);
        stat.rms = data.rms;
        stat.inputChannels = data.inputChannels ?? 0;
        stat.selectedChannel = data.selectedChannel ?? 0;
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
    this.micPermission = await microphonePermission();
    this.micAttempts++;
    const mic = await openSelectedMicrophone(
      (c) => this.acquire(c, generation),
      this.micDeviceId,
    );
    if (!mic.getAudioTracks().some((track) => track.readyState === 'live')) {
      stopTracks(mic);
      throw new Error(
        'selected input has no live microphone track · choose another microphone',
      );
    }
    this.mic = mic;
    this.micOpened++;
    this.lastNonzeroAt = Date.now();
    this.micPermission = 'granted';
    this.lastError = '';
    this.mutedSince = null;
    this.lastMicTrack = mic.getAudioTracks()[0] ?? null;
    for (const track of mic.getAudioTracks()) {
      track.onended = () => {
        if (generation === this.generation) this.loseMic();
      };
      track.onmute = () => {
        if (generation === this.generation)
          this.mutedSince ??= performance.now();
      };
      track.onunmute = () => {
        if (generation !== this.generation || !this.mic) return;
        this.mutedSince = null;
        if (this.micLost) {
          this.micLost = false;
          this.lastError = '';
          this.phase = this.paused ? 'paused' : 'active';
          this.setProcessing();
          this.report();
        }
      };
    }
    if (this.context) this.attach('mic', mic, generation);
    // Track state / the actual capture result are authoritative. Permissions API
    // can report denied for a working extension-origin getUserMedia grant.
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
    this.lastNonzeroAt = Date.now();
    if (this.sessionId) {
      this.phase = paused ? 'paused' : this.micLost ? 'micLost' : 'active';
      this.setProcessing();
      this.report();
    }
    return this.status();
  }
  async retryMic(micDeviceId?: string, automatic = false) {
    if (!automatic) {
      this.recoveryAttempts = 0;
      this.nextRecoveryAt = 0;
    }

    if (micDeviceId) this.micDeviceId = micDeviceId;
    if (!this.sessionId || !this.context) return this.status();
    const generation = this.generation;
    try {
      // Publish loss first so failed/stale model workers are also restarted.
      this.loseMic();
      this.stats.mic = emptyStats();
      if (this.context.state !== 'running') {
        this.disconnect('mic');
        this.disconnect('tab');
        const previous = this.context;
        this.context = null;
        if (previous.state !== 'closed') await previous.close();
        if (generation !== this.generation) return this.status();
        this.context = new AudioContext({ latencyHint: 'balanced' });
        await this.context.audioWorklet.addModule(
          chrome.runtime.getURL('/audio-worklet.js'),
        );
        if (this.tab) this.attach('tab', this.tab, generation);
      }
      await this.openMic(generation);
      await this.resumeContext();
      if (generation !== this.generation || !this.context) return this.status();
      this.phase = this.paused ? 'paused' : 'active';
      this.setProcessing();
      this.report();
    } catch (error) {
      if (generation !== this.generation) return this.status();
      this.recordError(error);
      this.loseMic();
    }
    return this.status();
  }
  private healCapture() {
    if (
      !this.sessionId ||
      this.paused ||
      !this.lab.micCapture ||
      this.recovering
    )
      return;
    const track = this.mic?.getAudioTracks()[0];
    const age = Date.now() - this.lastNonzeroAt;
    const reason =
      !track || track.readyState !== 'live'
        ? 'microphone track ended'
        : track.muted
          ? 'microphone track muted'
          : this.context?.state !== 'running'
            ? 'AudioContext is not running'
            : age >= 2000
              ? 'no non-zero microphone frames for 2 seconds'
              : '';
    if (!reason || age < 2000 || Date.now() < this.nextRecoveryAt) return;
    this.recoveryReason = reason;
    if (this.recoveryAttempts >= 3) {
      this.lastError = `${reason} · 3 automatic retries used · choose input and retry`;
      return;
    }
    this.recoveryAttempts++;
    this.recovering = true;
    this.recordError(
      new Error(`${reason} · automatic retry ${this.recoveryAttempts}/3`),
    );
    const generation = this.generation;
    void this.retryMic(undefined, true).finally(() => {
      if (generation !== this.generation) return;
      this.recovering = false;
      this.nextRecoveryAt = Date.now() + 1000 * 2 ** this.recoveryAttempts;
    });
  }
  private tick() {
    this.healCapture();
    this.playback = this.watchdog.sample(this.playbackContext);
    if (
      this.mic
        ?.getAudioTracks()
        .some((track) => !track.enabled || track.readyState !== 'live')
    )
      this.loseMic();
    const muted = this.mic?.getAudioTracks().some((track) => track.muted);
    if (muted) {
      this.mutedSince ??= performance.now();
      if (performance.now() - this.mutedSince >= 1500 && !this.micLost) {
        // A source mute is reversible. Keep its live track and listen for unmute.
        this.micLost = true;
        this.lastError = 'microphone is muted · unmute your input or tap retry';
        this.phase = this.paused ? 'paused' : 'micLost';
        this.frames.clear();
        this.setProcessing();
        this.report();
      }
    } else if (this.mic && this.mutedSince !== null) {
      this.mutedSince = null;
      if (this.micLost) {
        this.micLost = false;
        this.lastError = '';
        this.phase = this.paused ? 'paused' : 'active';
        this.setProcessing();
        this.report();
      }
    }
    for (const audioContext of [this.context, this.playbackContext])
      if (
        audioContext &&
        ['suspended', 'interrupted'].includes(audioContext.state) &&
        this.sessionId &&
        (this.mic || this.tab)
      )
        void this.resumeContext(audioContext).catch((error) => {
          if (
            audioContext === this.context ||
            audioContext === this.playbackContext
          )
            this.recordError(error);
        });
    const now = performance.now(),
      elapsed = Math.max(1, now - this.lastReport);
    this.lastReport = now;
    const mic = this.stats.mic,
      tab = this.stats.tab,
      processing = !this.paused && !this.micLost && !muted;
    const micDelta = Math.max(0, mic.frames - mic.previousFrames),
      tabDelta = Math.max(0, tab.frames - tab.previousFrames);
    this.metrics = {
      micEverNonzero: this.everHeard,
      micLevel: processing && micDelta ? mic.rms : 0,
      tabLevel: processing && tabDelta ? tab.rms : 0,
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
    this.recovering = false;
    navigator.mediaDevices.removeEventListener?.(
      'devicechange',
      this.deviceHandler,
    );
    clearInterval(this.timer);
    clearTimeout(this.micTestTimer);
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
    const playback = this.playbackContext;
    this.playbackContext = null;
    if (playback && playback.state !== 'closed') await playback.close();
    this.frames.clear();
    this.stats = { mic: emptyStats(), tab: emptyStats() };
    this.metrics = emptyAudioMetrics();
    this.phase = 'idle';
    this.paused = false;
    this.micLost = false;
    this.mutedSince = null;
    this.report();
    this.sessionId = null;
  }
  /** Live diagnostic isolation; never changes detector settings or saved session data. */
  async setLab(next: LabSwitches, streamId?: string) {
    if (!this.sessionId) return this.status();
    const generation = this.generation;
    if (next.tabCapture && !this.tab) {
      if (!streamId) throw new Error('tab capture needs a toolbar gesture');
      const tab = await this.acquire(
        {
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId,
            },
          } as unknown as MediaTrackConstraints,
          video: false,
        },
        generation,
      );
      const rate = tab.getAudioTracks()[0]?.getSettings?.().sampleRate;
      const context = new AudioContext({
        latencyHint: 'playback',
        ...(rate ? { sampleRate: rate } : {}),
      });
      const source = context.createMediaStreamSource(tab);
      try {
        source.connect(context.destination);
        await this.resumeContext(context);
      } catch (error) {
        stopTracks(tab);
        source.disconnect();
        await context.close();
        throw error;
      }
      if (generation !== this.generation) {
        stopTracks(tab);
        source.disconnect();
        await context.close();
        return this.status();
      }
      this.tab = tab;
      this.playbackContext = context;
      this.tabPlayback = source;
      for (const track of tab.getAudioTracks())
        track.onended = () => {
          if (generation !== this.generation || !this.sessionId) return;
          this.emit({
            type: 'AUDIO_TAB_ENDED',
            sessionId: this.sessionId,
            ownerId: this.ownerId,
          });
          void this.stop();
        };
      this.attach('tab', tab, generation);
      this.watchdog = new PlaybackWatchdog();
    } else if (!next.tabCapture && this.tab) {
      this.disconnect('tab');
      stopTracks(this.tab);
      this.tab = null;
      this.tabPlayback?.disconnect();
      this.tabPlayback = null;
      const context = this.playbackContext;
      this.playbackContext = null;
      await context?.close();
      this.frames.clear();
      this.stats.tab = emptyStats();
      this.watchdog = new PlaybackWatchdog();
    }
    this.lab = { ...next };
    if (!next.micCapture && this.mic) {
      this.disconnect('mic');
      stopTracks(this.mic);
      this.mic = null;
      this.micLost = false;
      this.stats.mic = emptyStats();
      this.frames.clear();
    } else if (next.micCapture && !this.mic) await this.retryMic();
    this.phase = this.paused ? 'paused' : this.micLost ? 'micLost' : 'active';
    this.playback = this.watchdog.sample(this.playbackContext);
    this.setProcessing();
    this.report();
    return this.status();
  }
}
