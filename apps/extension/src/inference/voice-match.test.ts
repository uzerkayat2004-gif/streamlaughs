import { describe, expect, it } from 'vitest';
import {
  dtwDistance,
  features,
  matchVoice,
  OTHER,
  usableTemplates,
  type VoiceTemplate,
} from './voice-match';

const tone = (hz: number, sec = 0.5, hz2 = hz) => {
  const n = Math.round(16000 * sec),
    out = new Float32Array(n + 4800);
  for (let i = 0; i < n; i++) {
    const f = hz + ((hz2 - hz) * i) / n;
    out[i + 2400] =
      0.3 * Math.sin((2 * Math.PI * f * i) / 16000) +
      0.05 * Math.sin((2 * Math.PI * 3 * f * i) / 16000);
  }
  return out;
};
const t = (
  word: string,
  f: number[][],
  source: 'taught' | 'auto' = 'taught',
): VoiceTemplate => ({ word, source, feats: f, at: 0 });

describe('voice match', () => {
  it('makes 12 normalised coefficients per 10 ms and trims silence', () => {
    const f = features(tone(300));
    expect(f[0]).toHaveLength(12);
    expect(f.length).toBeGreaterThan(40);
    expect(f.length).toBeLessThan(60);
    expect(features(new Float32Array(16000))).toEqual([]);
  });
  it('a clip is closest to itself', () => {
    const a = features(tone(200, 0.5, 600)),
      b = features(tone(600, 0.5, 200));
    expect(dtwDistance(a, a)).toBe(0);
    expect(dtwDistance(a, b)).toBeGreaterThan(0);
  });
  it('picks the closer word and needs a margin over everyday clips', () => {
    const up = features(tone(200, 0.5, 600)),
      down = features(tone(600, 0.5, 200));
    const m = matchVoice(up, [t('bro', up), t('wow', down)]);
    expect(m?.word).toBe('bro');
    expect(m?.accepted).toBe(true);
    const clash = matchVoice(up, [t('bro', up), t(OTHER, up, 'auto')]);
    expect(clash?.accepted).toBe(false);
    expect(matchVoice(up, [])).toBeNull();
  });
  it('uses auto-learned words only once two agree', () => {
    const up = features(tone(200, 0.5, 600));
    expect(usableTemplates([t('bro', up, 'auto')])).toHaveLength(0);
    expect(
      usableTemplates([t('bro', up, 'auto'), t('bro', up, 'auto')]),
    ).toHaveLength(2);
  });
});
