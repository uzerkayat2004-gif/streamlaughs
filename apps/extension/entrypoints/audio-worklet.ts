import { frameLevels, MonoResampler } from '../src/audio/resampler';
export default defineUnlistedScript(() => {
  class FrameProcessor extends AudioWorkletProcessor {
    private resampler = new MonoResampler(sampleRate);
    private frame = new Float32Array(320);
    private cursor = 0;
    private enabled = false;
    private segment = 0;
    private pending = 0;
    private sequence = 0;
    private dropped = 0;
    private frames = 0;
    private cpuMs = 0;
    private lastStatus = 0;
    private rms = 0;
    private peak = 0;
    private epoch: number;
    constructor(options: AudioWorkletNodeOptions) {
      super(options);
      this.epoch = Number(options.processorOptions?.epochMs ?? 0);
      this.port.onmessage = ({ data }) => {
        if (data.type === 'ack') this.pending = Math.max(0, this.pending - 1);
        if (data.type === 'processing') {
          this.segment = data.segment;
          this.enabled = !!data.enabled;
          this.resampler.reset();
          this.cursor = 0;
          this.frame.fill(0);
          this.rms = 0;
          this.peak = 0;
        }
      };
    }
    process(inputs: Float32Array[][]) {
      const start = Date.now();
      if (this.enabled && inputs[0]?.[0]?.length)
        this.resampler.push(inputs[0], (sample) => {
          this.frame[this.cursor++] = sample;
          if (this.cursor === 320) {
            const levels = frameLevels(this.frame);
            this.rms = levels.rms;
            this.peak = levels.peak;
            this.frames++;
            if (this.pending < 8) {
              const frame = this.frame;
              this.port.postMessage(
                {
                  type: 'frame',
                  segment: this.segment,
                  frame,
                  ts: this.epoch + currentTime * 1000,
                  sequence: this.sequence++,
                },
                [frame.buffer],
              );
              this.pending++;
              this.frame = new Float32Array(320);
            } else {
              this.dropped++;
              this.frame.fill(0);
            }
            this.cursor = 0;
          }
        });
      this.cpuMs += Math.max(0, Date.now() - start);
      if (currentTime - this.lastStatus >= 0.25) {
        this.port.postMessage({
          type: 'metrics',
          segment: this.segment,
          rms: this.rms,
          peak: this.peak,
          frames: this.frames,
          dropped: this.dropped,
          cpuMs: this.cpuMs,
          intervalMs: (currentTime - this.lastStatus) * 1000,
        });
        this.cpuMs = 0;
        this.lastStatus = currentTime;
      }
      return true;
    }
  }
  registerProcessor('laughline-frames', FrameProcessor);
});
