import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const identity = path.join(root, 'apps/extension/extension-identity.json');
if (
  !process.env.EXTENSION_KEY_PATH ||
  !path.isAbsolute(process.env.EXTENSION_KEY_PATH)
)
  throw new Error(
    'Set EXTENSION_KEY_PATH to an absolute path outside the repository (for example C:\\Users\\Asus\\Documents\\StreamLaughs-keys\\extension-private.pem).',
  );
const privatePath = path.resolve(process.env.EXTENSION_KEY_PATH);
const relative = path.relative(root, privatePath);
if (
  !relative ||
  (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
)
  throw new Error('EXTENSION_KEY_PATH must stay outside the repository.');
if (existsSync(identity) || existsSync(privatePath))
  throw new Error(
    'Identity already exists. Never rotate the release key during a build.',
  );
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const id = [
  ...createHash('sha256').update(publicKey).digest('hex').slice(0, 32),
]
  .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
  .join('');
mkdirSync(path.dirname(privatePath), { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600, flag: 'wx' });
writeFileSync(
  identity,
  JSON.stringify({ id, publicKey: publicKey.toString('base64') }, null, 2) +
    '\n',
  { flag: 'wx' },
);
console.log(`Fixed extension ID: ${id}`);
console.log(
  'Public identity saved; private key is at EXTENSION_KEY_PATH outside the repository (never package or commit it).',
);
