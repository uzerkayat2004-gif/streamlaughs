import { BLOCKED_WORDS, PRIVATE_NAMES, SWEARS } from './privacy';
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
const allowed = new Set<string>(
  REACTION_WORDS.filter((w) => w !== 'oh my god'),
);
const denied = new Set([...PRIVATE_NAMES, ...SWEARS, ...BLOCKED_WORDS]);
const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’‘]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const collapse = (s: string, doubles = false) =>
  doubles ? s.replace(/([a-z])\1+/g, '$1') : s.replace(/([a-z])\1{2,}/g, '$1');
const alias: Record<string, string> = {
  letsgo: 'lets go',
  lesgo: 'lets go',
  lessgo: 'lets go',
  'lets goo': 'lets go',
  ohmygod: 'omg',
  'oh my god': 'omg',
  'oh my gosh': 'omg',
  ohmygosh: 'omg',
  omg: 'omg',
  noway: 'no way',
  dub: 'w',
  'double u': 'w',
  'double you': 'w',
  'double yew': 'w',
  lmfao: 'lmao',
  hehe: 'haha',
  'ha ha': 'haha',
  'he he': 'haha',
  yar: 'yaar',
  arey: 'arre',
  bhaiyya: 'bhaiya',
  shesh: 'sheesh',
  bruhh: 'bruh',
  // Moonshine often writes a shouted "bro" as one of these.
  bros: 'bro',
  broo: 'bro',
  brah: 'bro',
  broh: 'bro',
  brow: 'bro',
  brough: 'bro',
};
function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1]! + 1,
        row[j]! + 1,
        row[j - 1]! + Number(a[i - 1] !== b[j - 1]),
      );
    row = next;
  }
  return row[b.length]!;
}
const phonetic = (s: string) =>
  s
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/sh/g, 's')
    .replace(/[aeiouy ]/g, '')
    .replace(/(.)\1+/g, '$1');
/** The only vocabulary boundary for inference AND the server. Never return arbitrary text. */
export function canonicalize(text: string): string | null {
  if (text.length > 1000) return null;
  const normalized = clean(text);
  if (
    !normalized ||
    normalized
      .split(' ')
      .some(
        (w) =>
          denied.has(w) ||
          denied.has(collapse(w)) ||
          denied.has(collapse(w, true)),
      )
  )
    return null;
  const variants = [
    ...new Set([normalized, collapse(normalized), collapse(normalized, true)]),
  ];
  for (const word of variants) {
    if (alias[word]) return alias[word]!;
    if (/^(?:ha|he)(?:\s*(?:ha|he))+$/.test(word)) return 'haha';
    if (allowed.has(word)) return word;
  }
  const compact = variants.map((v) => v.replace(/ /g, ''));
  if (compact.some((v) => ['letsgo', 'lesgo', 'lessgo'].includes(v)))
    return 'lets go';
  if (compact.includes('ohmygod') || compact.includes('ohmygosh')) return 'omg';
  if (compact.includes('noway')) return 'no way';
  const candidates = [...allowed]
    .map((word) => ({
      word,
      distance: Math.min(...variants.map((v) => editDistance(v, word))),
      phone: variants.some((v) => phonetic(v) === phonetic(word)),
    }))
    .filter((c) => {
      const n = c.word.replace(/ /g, '').length;
      return (
        n >= 3 && c.distance <= (n >= 6 ? 2 : 1) && (c.phone || c.distance <= 1)
      );
    })
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] &&
    (!candidates[1] || candidates[0].distance < candidates[1].distance)
    ? candidates[0].word
    : null;
}
// Compatibility for history/old callers: unknown text is never shared through this helper.
export function normalizeReaction(word: string) {
  return canonicalize(word) ?? clean(word);
}
export const topReactionWords = (words: { word: string; count: number }[]) =>
  words
    .filter((w) => w.count > 0 && canonicalize(w.word) !== null)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 3);
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
