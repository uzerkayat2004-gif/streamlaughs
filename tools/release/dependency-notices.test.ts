import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { dependencyNotices } from './dependency-notices.mjs';

it('keeps upstream license text without a pnpm store index or exported package.json', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'streamlaughs-license-'));
  const dependency = path.join(root, 'node_modules/@example/runtime');
  mkdirSync(dependency, { recursive: true });
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      dependencies: { '@example/runtime': '1.0.0' },
      optionalDependencies: { 'other-platform': '1.0.0' },
    }),
  );
  writeFileSync(
    path.join(dependency, 'package.json'),
    JSON.stringify({
      name: '@example/runtime',
      version: '1.0.0',
      license: 'MIT',
      exports: './index.js',
    }),
  );
  writeFileSync(
    path.join(dependency, 'LICENSE'),
    'Full upstream license fixture.',
  );
  const text = dependencyNotices([root]);
  expect(text).toContain('@example/runtime 1.0.0 (MIT)');
  expect(text).toContain('Full upstream license fixture.');
  expect(text).not.toContain('other-platform');
});

it('fails when a required production dependency is absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'streamlaughs-license-'));
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { 'missing-runtime': '1.0.0' } }),
  );
  expect(() => dependencyNotices([root])).toThrow(
    'Missing installed dependency',
  );
});
