import {
  Tensor,
  type WhisperFeatureExtractor,
} from '@huggingface/transformers';
import type { SpeechBudget } from './speech-budget';

/** Restore Whisper's configured fixed context shape without FFT/mel work on a silent tail.
 * The extractor receives at least one extra FFT window of zeros, so centered
 * reflection at the short boundary is zero, exactly as in the full padding.
 */
export function expandWhisperFeatures(
  data: Float32Array,
  bands: number,
  frames: number,
  target = 3000,
) {
  if (data.length !== bands * frames || frames > target)
    throw new Error('invalid local speech feature shape');
  let maximum = -Infinity;
  for (const x of data) maximum = Math.max(maximum, x);
  // Extractor already applied (max(logMel, maxLogMel-8)+4)/4; zero mel is log10(1e-10).
  const silence = Math.max(-1.5, maximum - 2);
  const expanded = new Float32Array(bands * target).fill(silence);
  for (let b = 0; b < bands; b++)
    expanded.set(data.subarray(b * frames, (b + 1) * frames), b * target);
  return expanded;
}

export function compactWhisperFeatures(
  extractor: WhisperFeatureExtractor,
  budget: () => SpeechBudget | undefined = () => undefined,
) {
  const original = extractor._call;
  extractor._call = async function (audio, options) {
    const compute = async () => {
      const result = await original.call(this, audio, {
        ...options,
        max_length: Math.min(
          Number(this.config.n_samples),
          audio.length + Number(this.config.n_fft),
        ),
      });
      const tensor = result.input_features;
      const target = Number(this.config.nb_max_frames);
      const expanded = expandWhisperFeatures(
        tensor.data as Float32Array,
        tensor.dims[1]!,
        tensor.dims[2]!,
        target,
      );
      const input_features = new Tensor('float32', expanded, [
        1,
        tensor.dims[1]!,
        target,
      ]);
      tensor.dispose();
      return { ...result, input_features };
    };
    return budget()?.run(compute, 'features') ?? compute();
  };
}
