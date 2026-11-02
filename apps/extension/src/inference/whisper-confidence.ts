import { LogitsProcessor, type Tensor } from '@huggingface/transformers';
import type { SpeechConfidence } from './accuracy';
/** Read actual decoder logits before suppression/forced tokens, not a text heuristic. */
export class WhisperConfidence extends LogitsProcessor {
  private raw = new Float32Array();
  private logZ = 0;
  private noSpeech: number | null = null;
  private probabilities: number[] = [];
  capture(tensor: Tensor) {
    const n = tensor.dims.at(-1) ?? 0,
      start = tensor.data.length - n;
    this.raw = new Float32Array(n);
    for (let i = 0; i < n; i++) this.raw[i] = Number(tensor.data[start + i]);
    let max = -Infinity;
    for (const x of this.raw) max = Math.max(max, x);
    let sum = 0;
    for (const x of this.raw) sum += Math.exp(x - max);
    this.logZ = max + Math.log(sum);
    if (this.noSpeech === null && Number.isFinite(this.logZ) && n > 50361)
      this.noSpeech = Math.exp(this.raw[50361]! - this.logZ);
  }
  override _call(_ids: bigint[][], logits: Tensor) {
    let best = -Infinity,
      token = -1;
    for (let i = 0; i < logits.data.length; i++) {
      const x = Number(logits.data[i]);
      if (x > best) {
        best = x;
        token = i;
      }
    }
    // Include the generated end-of-text token, as Whisper's utterance average
    // does. Exclude forced prompt/language/no-timestamp tokens above EOT.
    if (token >= 0 && token <= 50256 && Number.isFinite(this.logZ))
      this.probabilities.push(this.raw[token]! - this.logZ);
    return logits;
  }
  result(): SpeechConfidence {
    return {
      avgLogprob: this.probabilities.length
        ? this.probabilities.reduce((n, p) => n + p, 0) /
          this.probabilities.length
        : null,
      noSpeechProbability: this.noSpeech,
    };
  }
  clear() {
    this.raw.fill(0);
    this.raw = new Float32Array();
    this.probabilities = [];
  }
}
