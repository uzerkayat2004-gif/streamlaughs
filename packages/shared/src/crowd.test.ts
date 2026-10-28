import { expect, it } from 'vitest';
import {
  ChannelLoginSchema,
  CrowdContributionSchema,
  CrowdPacketSchema,
} from './crowd';

const valid = {
  laughing: 1,
  intensity: 2,
  scream: 0,
  gasp: 0,
  hype: 0,
  swears: 1,
  phrases: ['bro', 'no way'],
};
it('rejects audio/text/extra fields, invalid numbers and arbitrary channels', () => {
  expect(CrowdContributionSchema.safeParse(valid).success).toBe(true);
  for (const extra of [
    { audio: [0, 0.1] },
    { transcript: 'private' },
    { ts: 123 },
    { id: 'viewer' },
    { laughing: 2 },
    { hype: -1 },
    { phrases: ['bro', 'bro', 'bro', 'bro'] },
  ])
    expect(
      CrowdContributionSchema.safeParse({ ...valid, ...extra }).success,
    ).toBe(false);
  for (const value of ['ABC', '../channel', 'a?token=x', '', 'a'.repeat(26)])
    expect(ChannelLoginSchema.safeParse(value).success).toBe(false);
});
it('silently drops unknown names, raw/masked swear words and blocked phrases', () => {
  for (const text of [
    'alice',
    'unknown private sentence',
    'fuck',
    'f***',
    'idiot',
  ])
    expect(
      CrowdContributionSchema.parse({ ...valid, phrases: ['bro', text] })
        .phrases,
    ).toEqual(['bro']);
  expect(
    CrowdPacketSchema.safeParse({ state: 'few', sharing: 2 }).success,
  ).toBe(false);
  expect(
    CrowdPacketSchema.safeParse({ state: 'live', sharing: 2 }).success,
  ).toBe(false);
});
