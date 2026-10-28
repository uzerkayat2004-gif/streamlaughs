import { expect, it } from 'vitest';
import { CrowdContributionSchema } from '../../packages/shared/src/crowd';
import { options, wave } from './cli.mjs';

const args = [
  '--channel',
  'demo',
  '--origin',
  `chrome-extension://${'a'.repeat(32)}`,
];
it('defaults to local and refuses accidental production demo traffic', () => {
  expect(options(args).api).toBe('http://127.0.0.1:8787');
  expect(() => options([...args, '--api', 'https://example.com'])).toThrow(
    'Remote traffic',
  );
  expect(
    options([...args, '--api', 'https://example.com', '--allow-prod']).viewers,
  ).toBe(25);
  expect(() => options([...args, '--viewers', '201'])).toThrow();
});
it('sends only approved, bounded contributions without client time or text', () => {
  for (let t = 0; t < 32; t++)
    for (let n = 0; n < 25; n++)
      expect(CrowdContributionSchema.safeParse(wave(t, n)).success).toBe(true);
});
