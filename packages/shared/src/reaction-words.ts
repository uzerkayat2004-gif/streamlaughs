/** Local reaction aliases. Network crowd vocabulary remains a separate, stricter list. */
export const REACTION_WORDS = [
  'w',
  'bro',
  'bruh',
  'bhai',
  'bhaiya',
  'arre',
  'kya',
  'yaar',
  'oye',
  'wah',
  'haha',
  'lol',
  'lmao',
  'omg',
  'sheesh',
  'wow',
  'yo',
  'what',
  'no way',
  'lets go',
  'oh my god',
  'no shot',
  'clip that',
  'hype',
  'nice',
  'amazing',
  'funny',
  'good',
  'great',
  'wait',
  'yes',
  'not good',
  'love',
  'laugh',
  'laughs',
  'awesome',
  'crazy',
  'wild',
  'clutch',
  'insane',
  'unreal',
  'gg',
  'oof',
  'mast',
  'achha',
  'accha',
  'haan',
  'zabardast',
  'shabaash',
] as const;
const key = (s: string) => s.toLowerCase().replace(/(.)\1+/g, '$1');
const aliases = new Map<string, string>(REACTION_WORDS.map((s) => [key(s), s]));
aliases.set('bhaiyya', 'bhaiya');
aliases.set('arey', 'arre');
aliases.set('yar', 'yaar');
aliases.set('hahaha', 'haha');
export function normalizeReaction(word: string) {
  const normalized = word.toLowerCase().replace(/['’]/g, '');
  if (/^(?:ha|he){2,}$/.test(normalized)) return 'haha';
  if (normalized === 'yar') return 'yaar';
  if (normalized === 'arey') return 'arre';
  const candidate = aliases.get(key(normalized));
  return candidate && normalized.length >= candidate.length
    ? candidate
    : normalized;
}
export function sessionWord(session: {
  topWords: { word: string; count: number }[];
  wordEvents?: { word: string; at: number }[];
}) {
  const repeated = [...session.topWords]
    .filter((w) => w.count >= 2)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  if (repeated.length) return repeated[0];
  const latest = session.wordEvents?.at(-1)?.word;
  return (
    session.topWords.find((w) => w.word === latest) ?? session.topWords.at(-1)
  );
}
