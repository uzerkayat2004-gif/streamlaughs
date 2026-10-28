import { mkdir, writeFile } from 'node:fs/promises';
import { encodeWav } from './wav.mjs';

const folder = new URL('./fixtures/', import.meta.url);
await mkdir(folder, { recursive: true });
const silence = new Float32Array(32000),
  keyboard = new Float32Array(32000);
let seed = 7;
for (const start of [1200, 4300, 8600, 14000, 16100, 21000, 25000, 28400])
  for (let j = 0; j < 400 && start + j < keyboard.length; j++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    keyboard[start + j] =
      ((seed / 0xffffffff) * 2 - 1) * Math.exp(-j / 60) * 0.3;
  }
for (const [name, samples, label] of [
  ['silence', silence, 'silence'],
  ['keyboard', keyboard, 'keyboard'],
]) {
  await writeFile(new URL(`${name}.wav`, folder), encodeWav(samples));
  await writeFile(
    new URL(`${name}.labels.json`, folder),
    `${JSON.stringify([{ start: 0, end: 2, label }])}\n`,
  );
}
