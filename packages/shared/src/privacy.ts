// Local vocabulary only. These labels are never transmitted to a service.
export const PRIVATE_NAMES =
  'alice bob charlie david emma frank george grace harry henry jack james jane john jones joseph lily mary michael mike nancy oliver oscar peter rachel robert sarah sophia steve thomas tom victoria william zoe'.split(
    ' ',
  );
export const SWEARS = [
  'fuck',
  'fucking',
  'shit',
  'bullshit',
  'bitch',
  'ass',
  'asshole',
  'damn',
  'hell',
  'bastard',
];
export const BLOCKED_WORDS = [
  'idiot',
  'moron',
  'retard',
  'retarded',
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'cunt',
  'kike',
  'spic',
  'chink',
];
const denied = new Set([...PRIVATE_NAMES, ...SWEARS, ...BLOCKED_WORDS]);
export const isApprovedPhrase = (text: string) =>
  /^[a-z]+(?: [a-z]+){0,2}$/.test(text) &&
  !text.split(' ').some((word) => denied.has(word));
