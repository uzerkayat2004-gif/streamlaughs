import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { slug } from './config.mjs';

export function assertDownloadBudget(bytes) {
  assert(
    Number.isSafeInteger(bytes) && bytes > 0 && bytes * 2 < 100_000_000,
    'Download copies exceed the 100 MB static asset budget; stop before changing hosting',
  );
}

export function publishDownload({ chrome, edge, directory, product }) {
  const bytes = readFileSync(chrome);
  assert(
    bytes.equals(readFileSync(edge)),
    'Chrome and Edge packages differ; cannot publish a universal ZIP',
  );
  // A conservative 100 MB budget for both generated static copies together.
  // The binary is served by the CDN, never by a Vercel Function.
  assertDownloadBudget(bytes.length);
  const name = slug(product.name);
  const filename = `${name}.zip`;
  const versionedFilename = `${name}-v${product.version}.zip`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(directory, { recursive: true });
  for (const entry of readdirSync(directory)) {
    assert(
      /^[a-z0-9.-]+\.(?:zip|sha256|json)$/.test(entry),
      'Unexpected file in generated downloads directory',
    );
    const file = path.resolve(directory, entry);
    assert.equal(path.dirname(file), path.resolve(directory));
    unlinkSync(file);
  }
  for (const file of [filename, versionedFilename]) {
    copyFileSync(chrome, path.join(directory, file));
    writeFileSync(
      path.join(directory, `${file}.sha256`),
      `${sha256}  ${file}\n`,
    );
  }
  const metadata = {
    version: product.version,
    filename,
    versionedFilename,
    sha256,
    bytes: bytes.length,
  };
  writeFileSync(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}
