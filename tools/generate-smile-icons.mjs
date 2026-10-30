import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const require = createRequire(webRequire.resolve('next/package.json'));
const sharp = require('sharp');
const source = readFileSync(
  path.join(root, 'apps/extension/src/SmileLogo.tsx'),
  'utf8',
);
const curve = /SMILE_PATH = '([^']+)'/.exec(source)?.[1];
if (!curve) throw new Error('Smile curve missing');
for (const [name, color] of [
  ['white', '#FFFFFF'],
  ['yellow', '#FFD23F'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${curve}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/></svg>`;
  for (const destination of [
    'apps/extension/public/brand',
    'apps/web/public/brand',
  ]) {
    mkdirSync(path.join(root, destination), { recursive: true });
    writeFileSync(path.join(root, destination, `smile-${name}.svg`), svg);
  }
}

const face = readFileSync(
  path.join(root, 'apps/extension/src/AppIcon.tsx'),
  'utf8',
);
const eyes = /EYES_PATH = '([^']+)'/.exec(face)[1];
const mouth = /MOUTH_PATH = '([^']+)'/.exec(face)[1];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#FFD23F"/><path d="${eyes}" fill="none" stroke="#14141A" stroke-width="4" stroke-linecap="round"/><path d="${mouth}" fill="#14141A"/></svg>`;
for (const destination of [
  'apps/extension/public/brand',
  'apps/web/public/brand',
])
  writeFileSync(path.join(root, destination, 'app-icon.svg'), svg);
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(root, 'apps/extension/public/icon', `${size}.png`));

console.log(
  'Laughing-face icons and smile underline assets generated; extension identity unchanged.',
);
