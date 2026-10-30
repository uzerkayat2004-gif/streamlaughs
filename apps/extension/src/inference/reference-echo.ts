import { MICROPHONE_NORMALIZATION as C } from '../audio/config';
import { waveformMatch } from './rules';

// Local linear echo estimate. Remove only a stable component of the known tab
// reference; never discard the mic window or treat matching loudness as echo.
export function removeReferenceEcho(
  mic: Float32Array,
  reference: Float32Array,
) {
  if (reference.length < mic.length) return mic;
  let low = Infinity,
    high = -Infinity;
  for (const value of reference) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (high - low < 1e-6) return mic;
  const match = waveformMatch(mic, reference);
  if (!match.valid || match.correlation < 0.25 || reference.length < mic.length)
    return mic;
  const delay = Math.round(match.lagMs * 16),
    start = reference.length - mic.length - delay;
  if (start < 0) return mic;
  let xy = 0,
    xx = 0,
    yy = 0;
  for (let i = 0; i < mic.length; i++) {
    const x = reference[start + i]!,
      y = mic[i]!;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  const correlation = Math.abs(xy) / Math.sqrt(Math.max(1e-20, xx * yy));
  const coefficient = xy / Math.max(1e-12, xx);
  if (correlation < 0.25 || Math.abs(coefficient) > 4 || xx < 1e-6) return mic;
  // Validate the same transfer on both halves, rather than fitting a chance syllable.
  const middle = Math.floor(mic.length / 2);
  for (const [a, b] of [
    [0, middle],
    [middle, mic.length],
  ]) {
    let cross = 0,
      energy = 0;
    for (let i = a!; i < b!; i++) {
      const x = reference[start + i]!;
      cross += mic[i]! * x;
      energy += x * x;
    }
    if (
      Math.abs(cross / Math.max(1e-12, energy) - coefficient) >
      Math.abs(coefficient) * 0.4
    )
      return mic;
  }
  const result = new Float32Array(mic.length);
  let square = 0,
    peak = 0;
  for (let i = 0; i < mic.length; i++) {
    const value = mic[i]! - coefficient * reference[start + i]!;
    result[i] = value;
    square += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(square / Math.max(1, result.length));
  // Restore the existing mic normalization after removing a loud reference.
  const gain = Math.min(
    C.maximumGain,
    Math.max(1, C.targetRms / Math.max(rms, C.minimumGainRms)),
    C.peakHeadroom / Math.max(1e-6, peak),
  );
  for (let i = 0; i < result.length; i++)
    result[i] = rms < C.silenceFloor ? 0 : result[i]! * gain;
  return result;
}
