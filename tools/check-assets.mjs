import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(
  new URL('../apps/extension/public/models/', import.meta.url),
);
const manifest = JSON.parse(
  await readFile(path.join(base, 'manifest.json'), 'utf8'),
);
for (const receipt of manifest.files) {
  const bytes = await readFile(path.join(base, receipt.path));
  if (
    bytes.length !== receipt.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== receipt.sha256
  )
    throw new Error(`Incomplete or changed model asset: ${receipt.path}`);
}
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.endsWith('.download'))
      throw new Error('A partial model download must not be packaged');
    if (entry.isDirectory()) await check(path.join(dir, entry.name));
  }
}
await check(base);
console.log(
  `Verified ${manifest.files.length} local model/license assets against SHA-256 receipts.`,
);
