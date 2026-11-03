/**
 * Keyword spotting on top of Moonshine. Instead of asking the model "what was
 * said?" (it rambles or returns nothing for a lone "bro"), we ask "how likely
 * is each reaction, said alone?" and compare against common non-reaction
 * words. Only used for short clips.
 *
 * Offline check (v0.10.0, 168 synthetic TTS clips, 3 voices x 2 speeds):
 * free transcription caught 33/78 reactions; spotting caught 57/78 with 0/90
 * false hits on non-reaction words. Synthetic voices are not real players.
 */
export const SPOT_FORMS: Record<string, readonly string[]> = {
  bro: ['Bro', 'Bro, what'],
  bruh: ['Bruh'],
  what: ['What'],
  'no way': ['No way'],
  'lets go': ["Let's go"],
  omg: ['Oh my god', 'Oh my gosh'],
  wow: ['Wow'],
  yo: ['Yo'],
  sheesh: ['Sheesh'],
  wait: ['Wait'],
  nice: ['Nice'],
  lol: ['LOL'],
  haha: ['Haha', 'Ha ha'],
  gg: ['GG'],
  crazy: ['Crazy'],
  insane: ['Insane'],
  clutch: ['Clutch'],
  wild: ['Wild'],
  amazing: ['Amazing'],
  awesome: ['Awesome'],
  yes: ['Yes'],
  'no shot': ['No shot'],
  'clip that': ['Clip that'],
  oof: ['Oof'],
  bhai: ['Bhai'],
  yaar: ['Yaar'],
};
/** Doubled forms count twice ("bro bro"). */
export const SPOT_DOUBLE: Record<string, string> = { bro: 'Bro bro' };
/** Competitors: everyday words a short clip is more likely to be. */
export const SPOT_OTHER = [
  'The',
  'Okay',
  'Go',
  'So',
  'No',
  'Yeah',
  'Right',
  'Oh',
  'Uh',
  'Hmm',
  'Brother',
  'Broke',
  'Low',
  'Throw',
  'Bread',
  'Hello',
  'Thanks',
  'Well',
  'Yeah, yeah',
  'What is it',
];
export const SPOT_MIN_LOGP = -6;
export const SPOT_MIN_MARGIN = 0;

export type SpotEntry = { word: string; text: string; count: number };
export function spotEntries(): SpotEntry[] {
  const out: SpotEntry[] = [];
  const add = (word: string, text: string, count: number) => {
    for (const p of ['.', '!', '?']) out.push({ word, text: text + p, count });
  };
  for (const [word, forms] of Object.entries(SPOT_FORMS))
    for (const f of forms) add(word, f, 1);
  for (const [word, f] of Object.entries(SPOT_DOUBLE)) add(word, f, 2);
  for (const f of SPOT_OTHER) add('', f, 0);
  return out;
}
export type SpotResult = {
  word: string;
  text: string;
  count: number;
  logp: number;
  margin: number;
  accepted: boolean;
};
/** Pick the best reaction and decide, from per-entry total log-probs. */
export function decideSpot(entries: SpotEntry[], scores: number[]): SpotResult {
  let best = -1,
    other = -Infinity;
  scores.forEach((s, i) => {
    if (entries[i]!.word) {
      if (best < 0 || s > scores[best]!) best = i;
    } else if (s > other) other = s;
  });
  const e = entries[best]!,
    logp = scores[best]!,
    margin = logp - other;
  return {
    word: e.word,
    text: e.text,
    count: e.count,
    logp,
    margin,
    accepted: logp >= SPOT_MIN_LOGP && margin >= SPOT_MIN_MARGIN,
  };
}
