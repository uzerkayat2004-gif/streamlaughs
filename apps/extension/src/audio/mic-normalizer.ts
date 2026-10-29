import { MICROPHONE_NORMALIZATION as C } from './config';
// Normalize only local model input; capture buffers retain the original frames.
export class MicNormalizer {
  gain = 1;
  noiseFloor = 0.0001;
  private levels: number[] = [];
  private previousInput = 0;
  private previousOutput = 0;
  private envelope = 0;
  process(frame: Float32Array, speech = false) {
    const output = new Float32Array(frame.length);
    let square = 0,
      peak = 0;
    for (let i = 0; i < frame.length; i++) {
      const value =
        frame[i]! -
        this.previousInput +
        C.highPassFeedback * this.previousOutput;
      this.previousInput = frame[i]!;
      this.previousOutput = value;
      output[i] = value;
      square += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    const rms = Math.sqrt(square / Math.max(1, frame.length));
    // Fast level attack, ~1 s release: do not erase the rhythm of syllables/laughs.
    this.envelope = Math.max(rms, this.envelope * C.rmsRelease);
    if (!speech) {
      this.levels.push(rms);
      if (this.levels.length > 64) this.levels.shift();
      if (this.levels.length >= 12) {
        const sorted = [...this.levels].sort((a, b) => a - b);
        this.noiseFloor = Math.max(
          C.silenceFloor,
          Math.min(
            C.maximumNoiseFloor,
            sorted[Math.floor(sorted.length * 0.1)]!,
          ),
        );
      }
    }
    const desired = Math.max(
      1,
      Math.min(
        C.maximumGain,
        C.targetRms /
          Math.max(this.envelope, this.noiseFloor * 4, C.minimumGainRms),
      ),
    );
    this.gain +=
      (desired - this.gain) *
      (desired < this.gain ? C.gainAttack : C.gainRelease);
    const effective = Math.min(
      this.gain,
      C.peakHeadroom / Math.max(0.00001, peak),
    );
    for (let i = 0; i < output.length; i++)
      output[i] = rms < C.silenceFloor ? 0 : output[i]! * effective;
    return output;
  }
  reset() {
    this.gain = 1;
    this.noiseFloor = 0.0001;
    this.levels = [];
    this.previousInput = 0;
    this.previousOutput = 0;
    this.envelope = 0;
  }
}
