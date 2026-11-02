import { expect, it } from 'vitest';
import { extractWords, hallucinationReason } from './rules';
it('requires complete reaction words and accepts emphatic standalone what, not sentence filler', () => {
  expect(extractWords('Broccoli grows beside the walkway.').phrases).toEqual(
    [],
  );
  expect(extractWords('I wonder what the weather will bring.').phrases).toEqual(
    [],
  );
  expect(extractWords('whaaat?!').phrases).toEqual([
    { text: 'what', count: 1, class: 'ok' },
  ]);
  expect(
    extractWords('He described a great landscape beside a nice garden.')
      .phrases,
  ).toEqual([]);
  expect(extractWords('great!').phrases).toEqual([
    { text: 'great', count: 1, class: 'ok' },
  ]);
  expect(extractWords('bro bro no way').phrases).toEqual([
    { text: 'bro', count: 2, class: 'ok' },
    { text: 'no way', count: 1, class: 'ok' },
  ]);
});
it.each([
  'thank you',
  'thanks for watching',
  'you',
  'bye',
  '♪ music ♫',
  'bro bro bro bro bro',
])('rejects hallucination %s', (text) => {
  expect(hallucinationReason(text)).not.toBe('');
  expect(extractWords(text).phrases).toEqual([]);
});

it('requires generic sentiment labels to be standalone reactions, not prose words', () => {
  expect(
    extractWords('they love the weather and wait for the train').phrases,
  ).toEqual([]);
  expect(extractWords('love!').phrases).toEqual([
    { text: 'love', count: 1, class: 'ok' },
  ]);
});
