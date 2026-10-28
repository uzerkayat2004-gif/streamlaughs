import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { notes, readProduct, root, validateVersion } from './config.mjs';

const product = readProduct(),
  next = process.argv[2];
if (next !== '--notes') {
  validateVersion(next);
  const a = next.split('.').map(Number),
    b = product.version.split('.').map(Number);
  assert(
    a[0] > b[0] ||
      (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))),
    'Choose a version greater than the current version',
  );
  product.version = next;
  writeFileSync(
    path.join(root, 'product.config.json'),
    `${JSON.stringify(product, null, 2)}\n`,
  );
}
writeFileSync(path.join(root, 'docs/release-notes.md'), notes(product));
console.log(
  `Prepared ${product.name} v${product.version}; no tag, release or deployment created.`,
);
