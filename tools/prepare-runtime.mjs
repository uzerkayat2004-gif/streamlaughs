import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const extension = path.join(root, 'apps/extension');
for (const [pkg, subdir, target, filter] of [
  [
    'onnxruntime-web',
    'dist',
    'onnx',
    (name) => /^ort-wasm-simd-threaded\.jsep\.(wasm|mjs)$/.test(name),
  ],
  [
    '@mediapipe/tasks-audio',
    'wasm',
    'mediapipe',
    (name) => /\.(wasm|js)$/.test(name),
  ],
]) {
  const source = path.join(extension, 'node_modules', pkg, subdir);
  const destination = path.join(extension, 'public/runtime', target);
  await mkdir(destination, { recursive: true });
  let bytes = 0;
  for (const name of await readdir(source))
    if (filter(name)) {
      await copyFile(path.join(source, name), path.join(destination, name));
      bytes += (await stat(path.join(destination, name))).size;
    }
  console.log(
    `${target}: ${bytes.toLocaleString('en-US')} local runtime bytes`,
  );
}
