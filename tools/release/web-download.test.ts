import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { assertDownloadBudget, publishDownload } from './web-download.mjs';

it('publishes byte-identical stable/versioned artifacts and their actual SHA-256', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'streamlaughs-download-'));
  const chrome = path.join(directory, 'chrome.zip');
  const edge = path.join(directory, 'edge.zip');
  const bytes = Buffer.from('verified-package-fixture');
  writeFileSync(chrome, bytes);
  writeFileSync(edge, bytes);
  const output = path.join(directory, 'public');
  const metadata = publishDownload({
    chrome,
    edge,
    directory: output,
    product: { name: 'StreamLaughs', version: '0.6.0' },
  });
  expect(metadata.sha256).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(metadata.bytes).toBe(bytes.length);
  expect(readFileSync(path.join(output, 'streamlaughs.zip'))).toEqual(bytes);
  expect(readFileSync(path.join(output, 'streamlaughs-v0.6.0.zip'))).toEqual(
    bytes,
  );
  expect(
    readFileSync(path.join(output, 'streamlaughs.zip.sha256'), 'utf8'),
  ).toContain(metadata.sha256);
  writeFileSync(edge, 'different-browser-artifact');
  expect(() =>
    publishDownload({
      chrome,
      edge,
      directory: output,
      product: { name: 'StreamLaughs', version: '0.6.0' },
    }),
  ).toThrow('packages differ');
});

it('stops before publishing artifacts at or above the static budget', () => {
  expect(() => assertDownloadBudget(49_999_999)).not.toThrow();
  expect(() => assertDownloadBudget(50_000_000)).toThrow(
    'stop before changing hosting',
  );
});
