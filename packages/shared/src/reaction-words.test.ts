import { expect, it } from 'vitest';
import { canonicalize } from './reaction-words';
it('canonicalizes short reaction spellings and refuses private/blocked words', () => {
  for (const text of ['bro', 'brooooo', 'broo'])
    expect(canonicalize(text)).toBe('bro');
  for (const text of ['letsgooo', 'lesgo', "let's go", 'lets goo'])
    expect(canonicalize(text)).toBe('lets go');
  for (const text of ['W', 'w.', 'dub', 'double u'])
    expect(canonicalize(text)).toBe('w');
  for (const text of ['hahaha', 'hehe', 'ha ha'])
    expect(canonicalize(text)).toBe('haha');
  for (const text of ['idiot', 'shit', 'Alice', 'hello there stranger'])
    expect(canonicalize(text)).toBeNull();
  expect(canonicalize('sheeesh')).toBe('sheesh');
  expect(canonicalize('oh my god')).toBe('omg');
});
