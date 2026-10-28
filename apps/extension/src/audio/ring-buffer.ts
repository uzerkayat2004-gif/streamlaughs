import { AUDIO_SAMPLE_RATE, BUFFER_SECONDS } from './config';
export type AudioSource = 'mic' | 'tab';
export class AudioRingBuffer {
  private readonly samples: Float32Array;
  private cursor = 0;
  private count = 0;
  constructor(readonly capacity = AUDIO_SAMPLE_RATE * BUFFER_SECONDS) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid buffer capacity');
    this.samples = new Float32Array(capacity);
  }
  get length() {
    return this.count;
  }
  write(frame: Float32Array) {
    for (const sample of frame) {
      this.samples[this.cursor] = sample;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.count = Math.min(this.capacity, this.count + frame.length);
  }
  read(samples: number) {
    const length = Math.min(this.count, Math.max(0, Math.floor(samples)));
    const result = new Float32Array(length);
    const start = (this.cursor - length + this.capacity) % this.capacity;
    for (let i = 0; i < length; i++)
      result[i] = this.samples[(start + i) % this.capacity]!;
    return result;
  }
  clear() {
    this.samples.fill(0);
    this.cursor = 0;
    this.count = 0;
  }
}
// This object lives only in the offscreen document. Part 3 subscribes here, never via runtime messages.
export class AudioFrameHub {
  private readonly buffers = {
    mic: new AudioRingBuffer(),
    tab: new AudioRingBuffer(),
  };
  private listeners = new Set<
    (source: AudioSource, frame: Float32Array, ts: number) => void
  >();
  onFrame(source: AudioSource, frame: Float32Array, ts: number) {
    this.buffers[source].write(frame);
    for (const listener of this.listeners) listener(source, frame, ts);
  }
  getWindow(source: AudioSource, ms: number) {
    return this.buffers[source].read(
      (Math.min(BUFFER_SECONDS * 1000, Math.max(0, ms)) * AUDIO_SAMPLE_RATE) /
        1000,
    );
  }
  subscribe(
    listener: (source: AudioSource, frame: Float32Array, ts: number) => void,
  ) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  size(source: AudioSource) {
    return this.buffers[source].length;
  }
  clear() {
    this.buffers.mic.clear();
    this.buffers.tab.clear();
  }
}
