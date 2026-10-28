import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Resolve the installed graph rather than pnpm's disposable content-store index.
// Vercel may restore node_modules without that index; license files still exist.
export function dependencyNotices(packageDirectories) {
  const visited = new Set();
  const packages = new Map();
  function visit(directory, include) {
    const folder = realpathSync(directory);
    if (visited.has(folder)) return;
    visited.add(folder);
    const manifestFile = path.join(folder, 'package.json');
    const pkg = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (include) packages.set(`${pkg.name}@${pkg.version}`, { pkg, folder });
    const require = createRequire(manifestFile);
    const optional = pkg.optionalDependencies || {};
    for (const name of Object.keys({
      ...pkg.dependencies,
      ...optional,
    }).sort()) {
      const dependency = (require.resolve.paths(name) || [])
        .map((base) => path.join(base, name))
        .find((candidate) => existsSync(path.join(candidate, 'package.json')));
      assert(
        dependency || name in optional,
        `Missing installed dependency: ${name}`,
      );
      if (dependency) visit(dependency, true);
    }
  }
  for (const directory of packageDirectories) visit(directory, false);
  let text =
    'Installed production dependency inventory and available upstream license texts. Original project code: root MIT LICENSE.\n';
  for (const [, { pkg, folder }] of [...packages].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const license =
      typeof pkg.license === 'string'
        ? pkg.license
        : pkg.license?.type || 'not declared';
    text += `\n--- ${pkg.name} ${pkg.version} (${license}) ---\n${pkg.homepage || ''}\n`;
    for (const name of readdirSync(folder)
      .sort()
      .filter((name) => /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(name))) {
      const filename = path.join(folder, name);
      // Some upstream packages use license directories; their manifest stays listed.
      try {
        text += `\n${name}\n${readFileSync(filename, 'utf8')}\n`;
      } catch (error) {
        if (error.code !== 'EISDIR') throw error;
      }
    }
  }
  assert(packages.size > 0, 'No installed production dependencies found');
  return text;
}
