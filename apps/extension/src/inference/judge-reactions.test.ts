import { expect, it } from 'vitest';
import { extractWords } from './rules';

it.each(['W', 'w!', 'double you', 'double u'])(
  'counts the spoken reaction %s as w',
  (spoken) => {
    expect(extractWords(spoken).phrases).toEqual([
      { text: 'w', count: 1, class: 'ok' },
    ]);
  },
);
it.each(["let's go", 'lets go', 'lol', 'lmao', 'haha'])(
  'retains approved reaction %s',
  (spoken) => {
    expect(extractWords(spoken).phrases).toEqual([
      { text: spoken.replace("'", ''), count: 1, class: 'ok' },
    ]);
  },
);
it('does not count substrings or a letter mentioned in a sentence', () => {
  expect(extractWords('the word window starts with a w').phrases).toEqual([]);
});
