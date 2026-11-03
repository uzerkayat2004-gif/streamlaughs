import { describe, expect, it } from 'vitest';
import { decideSpot, spotEntries } from './keyword-spot';

describe('keyword spotting decision', () => {
  const entries = spotEntries();
  const at = (text: string) => entries.findIndex((e) => e.text === text);
  it('accepts a reaction that beats every everyday word', () => {
    const scores = entries.map(() => -12);
    scores[at('Bro.')] = -2;
    scores[at('Go.')] = -3;
    expect(decideSpot(entries, scores)).toMatchObject({
      word: 'bro',
      count: 1,
      accepted: true,
    });
  });
  it('rejects when an everyday word fits better', () => {
    const scores = entries.map(() => -12);
    scores[at('Bro.')] = -3.6;
    scores[at('Go.')] = -2.1;
    expect(decideSpot(entries, scores).accepted).toBe(false);
  });
  it('rejects a weak best guess', () => {
    const scores = entries.map(() => -14);
    scores[at('Wow.')] = -7;
    expect(decideSpot(entries, scores).accepted).toBe(false);
  });
  it('counts "bro bro" twice', () => {
    const scores = entries.map(() => -12);
    scores[at('Bro bro.')] = -1;
    expect(decideSpot(entries, scores)).toMatchObject({
      word: 'bro',
      count: 2,
    });
  });
});
