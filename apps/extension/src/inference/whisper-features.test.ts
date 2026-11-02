import { readFileSync } from 'node:fs';
import { WhisperFeatureExtractor } from '@huggingface/transformers';
import { expect, it } from 'vitest';
import {
  compactWhisperFeatures,
  expandWhisperFeatures,
} from './whisper-features';

it.each(['tone', 'silence', 'reaction-control'])(
  'matches full padded Whisper features for %s, including boundaries and silence',
  async (kind) => {
    const config = JSON.parse(
      readFileSync(
        'public/models/whisper-tiny.en/preprocessor_config.json',
        'utf8',
      ),
    );
    const extractor = new WhisperFeatureExtractor(config);
    let audio = Float32Array.from({ length: 11000 }, (_, i) =>
      kind === 'silence' ? 0 : Math.sin(i * 0.17) * 0.05,
    );
    if (kind === 'reaction-control') {
      const wav = readFileSync(
        '../../tests/fixtures/audio/accuracy/bro-source.wav',
      );
      const chunk = wav.indexOf(Buffer.from('data')),
        size = wav.readUInt32LE(chunk + 4),
        bits = wav.readUInt16LE(34);
      audio = Float32Array.from({ length: size / (bits / 8) }, (_, i) =>
        bits === 32
          ? wav.readFloatLE(chunk + 8 + i * 4)
          : wav.readInt16LE(chunk + 8 + i * 2) / 32768,
      );
    }
    const full = (await extractor(audio)).input_features;
    const short = (
      await extractor(audio, { max_length: audio.length + config.n_fft })
    ).input_features;
    const expanded = expandWhisperFeatures(
      short.data as Float32Array,
      short.dims[1]!,
      short.dims[2]!,
      config.nb_max_frames,
    );
    expect(expanded.length).toBe(full.data.length);
    let difference = 0;
    for (let i = 0; i < expanded.length; i++)
      difference = Math.max(
        difference,
        Math.abs(expanded[i]! - Number(full.data[i])),
      );
    expect(difference).toBeLessThan(0.00001);
    compactWhisperFeatures(extractor);
    const compact = (await extractor(audio)).input_features;
    let endToEnd = 0;
    for (let i = 0; i < compact.data.length; i++)
      endToEnd = Math.max(
        endToEnd,
        Math.abs(Number(compact.data[i]) - Number(full.data[i])),
      );
    expect(endToEnd).toBeLessThan(0.00001);
    compact.dispose();
    full.dispose();
    short.dispose();
  },
  15000,
);
