import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function extensionId(publicKey) {
  const der = Buffer.from(publicKey, 'base64');
  assert.equal(
    createPublicKey({ key: der, format: 'der', type: 'spki' })
      .asymmetricKeyType,
    'rsa',
  );
  return [...createHash('sha256').update(der).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
    .join('');
}
export function checkManifest(manifest, identity) {
  assert.equal(
    manifest.key,
    identity.publicKey,
    'Built manifest must contain the fixed public key',
  );
  assert.equal(
    extensionId(manifest.key),
    identity.id,
    'Built extension ID changed',
  );
  assert(!JSON.stringify(manifest).includes('PRIVATE KEY'));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const identity = JSON.parse(
    readFileSync(
      new URL('../apps/extension/extension-identity.json', import.meta.url),
      'utf8',
    ),
  );
  const targets = process.argv.slice(2);
  if (!targets.length)
    targets.push(
      'apps/extension/.output/chrome-mv3',
      'apps/extension/.output/edge-mv3',
    );
  for (const target of targets) {
    checkManifest(
      JSON.parse(readFileSync(path.resolve(target, 'manifest.json'), 'utf8')),
      identity,
    );
    console.log(
      `Built manifest identity verified: ${identity.id} (${path.basename(target)})`,
    );
  }
}
