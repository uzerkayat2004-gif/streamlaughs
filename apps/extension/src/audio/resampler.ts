// Streaming 32-tap, 128-phase windowed-sinc low-pass resampler. State survives render quanta.
export class MonoResampler {
  private readonly history = new Float32Array(128);
  private readonly kernels: Float64Array[];
  private inputIndex = -1;
  private outputPosition = 0;
  private readonly ratio: number;
  constructor(
    inputRate: number,
    readonly outputRate = 16000,
  ) {
    if (
      !Number.isFinite(inputRate) ||
      inputRate <= 0 ||
      !Number.isFinite(outputRate) ||
      outputRate <= 0
    )
      throw new RangeError('Unsupported sample rate');
    this.ratio = inputRate / outputRate;
    const cutoff = 0.47 * Math.min(1, outputRate / inputRate);
    this.kernels = Array.from({ length: 128 }, (_, phase) => {
      const kernel = new Float64Array(32);
      for (let tap = 0; tap < 32; tap++) {
        const x = tap - 15 - phase / 128;
        const sinc =
          Math.abs(x) < 1e-9
            ? 2 * cutoff
            : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
        kernel[tap] =
          Math.abs(x) <= 16
            ? sinc * (0.5 + 0.5 * Math.cos((Math.PI * x) / 16))
            : 0;
      }
      const total = kernel.reduce((sum, value) => sum + value, 0);
      return kernel.map((value) => value / total);
    });
  }
  push(channels: readonly Float32Array[], emit: (sample: number) => void) {
    const length = channels[0]?.length ?? 0;
    for (let i = 0; i < length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] ?? 0;
      this.history[++this.inputIndex % 128] = mono / channels.length;
      while (this.outputPosition + 16 <= this.inputIndex) {
        const center = Math.floor(this.outputPosition),
          phase = Math.min(
            127,
            Math.floor((this.outputPosition - center) * 128),
          );
        const kernel = this.kernels[phase]!;
        let sample = 0;
        for (let tap = 0; tap < 32; tap++) {
          const index = center + tap - 15;
          if (index >= 0) sample += this.history[index % 128]! * kernel[tap]!;
        }
        emit(sample);
        this.outputPosition += this.ratio;
      }
    }
  }
  reset() {
    this.history.fill(0);
    this.inputIndex = -1;
    this.outputPosition = 0;
  }
}
export function frameLevels(frame: Float32Array) {
  let energy = 0,
    peak = 0;
  for (const sample of frame) {
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: frame.length ? Math.sqrt(energy / frame.length) : 0, peak };
}
