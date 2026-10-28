import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProduct, root } from './config.mjs';

const internals = JSON.parse(
  readFileSync(new URL('./branding-internals.json', import.meta.url), 'utf8'),
);
export function assertPublicBrand(text, context, allowInternals = true) {
  if (!/laughline/i.test(text)) return;
  let publicText = text;
  if (allowInternals) {
    for (const id of [...internals.identifiers].sort(
      (a, b) => b.length - a.length,
    ))
      publicText = publicText
        .replaceAll(id, '')
        .replaceAll(id.toLowerCase(), '');
    if (context.replaceAll('\\', '/').endsWith(internals.databaseSource))
      publicText = publicText.replace(
        /new\s+Dexie\(\s*['"]laughline['"]\s*\)/g,
        '',
      );
    if (/\.m?js$/.test(context))
      publicText = publicText.replace(
        /\bnew\s+[\w$.]+\(\s*([\x60'"])laughline\1\s*\)/g,
        '',
      );
    const location = root.endsWith(path.sep) ? root.slice(0, -1) : root;
    for (const value of [
      location,
      location.replaceAll('\\', '/'),
      JSON.stringify(location).slice(1, -1),
      encodeURIComponent(location),
      encodeURIComponent(location.replaceAll('\\', '/')),
    ])
      publicText = publicText.replaceAll(value, '__CHECKOUT__');
  }
  assert(!/laughline/i.test(publicText), `Old public branding in ${context}`);
}
function files(directory, includeBuildDirectories = false) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      (entry.name.startsWith('.') &&
        !(includeBuildDirectories && entry.name === '.next')) ||
      ['node_modules', 'public'].includes(entry.name)
    )
      return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(target, includeBuildDirectories)
      : [target];
  });
}
export function checkBrandSources() {
  const directories = [
    'apps/extension/src',
    'apps/extension/entrypoints',
    'apps/extension/public',
    'apps/web/app',
    'apps/web/components',
    'apps/web/lib',
    'apps/web/public',
    'packages/shared/src',
    'workers/api/src',
  ];
  for (const file of directories.flatMap((directory) =>
    files(path.join(root, directory)),
  )) {
    if (/\.(tsx?|html|svg)$/.test(file) && !file.endsWith('.test.ts'))
      assertPublicBrand(readFileSync(file, 'utf8'), file);
  }
  for (const file of [
    path.join(root, 'product.config.json'),
    path.join(root, 'README.md'),
    ...files(path.join(root, 'docs')).filter((file) => file.endsWith('.md')),
  ]) {
    if (
      internals.documentationExceptions.some(
        (value) => file === path.join(root, value),
      )
    )
      continue;
    assertPublicBrand(readFileSync(file, 'utf8'), file);
  }
}
export function checkWebsiteBrand(directory) {
  // Vercel's onBuildComplete adapter can relocate the prerendered HTML before
  // this post-build command runs. Inspect both actual output formats.
  const hosted = [
    path.resolve(directory, '../.vercel/output'),
    path.join(root, '.vercel/output'),
  ].filter((folder) => existsSync(path.join(folder, 'config.json')));
  const outputs = [
    ...new Set([
      ...files(path.join(directory, 'server/app')),
      ...files(path.join(directory, 'static/chunks')),
      ...hosted.flatMap((folder) => [
        ...files(path.join(folder, 'static'), true),
        ...files(path.join(folder, 'functions'), true),
      ]),
    ]),
  ].filter((file) => /\.(html|rsc|body|js|mjs)$/.test(file));
  assert(outputs.length > 0, 'Build the website before checking output');
  for (const file of outputs)
    assertPublicBrand(readFileSync(file, 'utf8'), file);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkBrandSources();
  if (process.argv.includes('--website'))
    checkWebsiteBrand(path.join(root, 'apps/web/.next'));
  console.log(
    `${readProduct().name} source, docs and requested website output branding checks passed.`,
  );
}
