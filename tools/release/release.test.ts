import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  notes,
  readProduct,
  releaseConfig,
  root,
  slug,
  validateVersion,
} from './config.mjs';
import { verifyProduction } from './verify-production.mjs';

it('validates Chrome-compatible versions and tag/config/repository binding', () => {
  expect(slug(' a fun name! ')).toBe('a-fun-name');
  expect(() => slug('!!!')).toThrow('filename');
  for (const version of ['0.1.0', '0.6.0', '1.65535.0'])
    expect(validateVersion(version)).toBe(version);
  for (const version of [
    '0.0.0',
    '1.02.3',
    '1.65536.0',
    'v1.0.0',
    '1.0.0-beta',
  ])
    expect(() => validateVersion(version)).toThrow();
  const product = readProduct(),
    env = {
      SITE_URL: 'https://project.vercel.app',
      VITE_CROWD_API_URL: 'https://crowd.example.workers.dev',
      RELEASE_REPO_NAME: 'test',
      GITHUB_REPOSITORY: 'uzerkayat2004-gif/test',
      GITHUB_REF_NAME: `v${product.version}`,
    };
  expect(releaseConfig(product, env).slug).toBe(slug(product.name));
  expect(() =>
    releaseConfig(product, { ...env, GITHUB_REF_NAME: 'v999.0.0' }),
  ).toThrow('Tag');
  expect(() =>
    releaseConfig(product, { ...env, GITHUB_REPOSITORY: 'other/test' }),
  ).toThrow('repository');
  expect(() =>
    releaseConfig(product, { ...env, SITE_URL: 'http://localhost:3000' }),
  ).toThrow('HTTPS');
  expect(() => releaseConfig(product, {})).toThrow();
  const defaults = releaseConfig(product, {
    VITE_CROWD_API_URL: 'https://crowd.example.workers.dev',
  });
  expect(defaults.site).toBe('https://streamlaughs.vercel.app');
  expect(defaults.repo).toBe('streamlaughs');
  expect(defaults.slug).toBe(slug(product.name));
  expect(releaseConfig(product, env, true)).toMatchObject({
    site: '',
    api: '',
    offline: true,
  });
  expect(notes(product)).toContain(`v${product.version}`);
  expect(notes(product, true)).toContain('Do not publish');
});
it('rejects leaked controls/private files and wrong versions in a built release', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'release-controls-'));
  // Copy only the public manifest; these tests inject one bad file at a time.
  const product = readProduct();
  const identity = JSON.parse(
    readFileSync(
      path.join(root, 'apps/extension/extension-identity.json'),
      'utf8',
    ),
  );
  writeFileSync(
    path.join(folder, 'manifest.json'),
    JSON.stringify({
      name: product.name,
      description: `${product.name} — ${product.pitch}`,
      action: { default_title: product.name },
      version: product.version,
      key: identity.publicKey,
      permissions: ['storage', 'tabs', 'tabCapture', 'offscreen', 'downloads'],
      host_permissions: ['https://www.twitch.tv/*'],
      content_security_policy: { extension_pages: "connect-src 'self';" },
    }),
  );
  expect(() => verifyProduction(folder, product)).not.toThrow();
  writeFileSync(
    path.join(folder, 'debug.html'),
    '<button>test microphone</button>',
  );
  expect(() => verifyProduction(folder, product)).toThrow('Development');
  expect(() =>
    verifyProduction(folder, { ...product, version: '99.0.0' }),
  ).toThrow('Stale');
});
it('bumps the one version source and regenerates matching notes without touching a tag', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'release-version-'));
  mkdirSync(path.join(folder, 'tools/release'), { recursive: true });
  mkdirSync(path.join(folder, 'docs'));
  for (const file of ['config.mjs', 'version.mjs'])
    cpSync(
      path.join(root, 'tools/release', file),
      path.join(folder, 'tools/release', file),
    );
  writeFileSync(path.join(folder, 'package.json'), '{"type":"module"}');
  writeFileSync(
    path.join(folder, 'product.config.json'),
    JSON.stringify({ ...readProduct(), version: '0.1.0' }),
  );
  execFileSync(
    process.execPath,
    [path.join(folder, 'tools/release/version.mjs'), '0.2.0'],
    { windowsHide: true },
  );
  expect(
    JSON.parse(readFileSync(path.join(folder, 'product.config.json'), 'utf8'))
      .version,
  ).toBe('0.2.0');
  expect(
    readFileSync(path.join(folder, 'docs/release-notes.md'), 'utf8'),
  ).toContain('v0.2.0');
  expect(() =>
    execFileSync(
      process.execPath,
      [path.join(folder, 'tools/release/version.mjs'), '0.1.0'],
      { windowsHide: true, stdio: 'pipe' },
    ),
  ).toThrow();
});
it('writes flat reproducible ZIPs with notices and rejects signing material', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'release-zip-')),
    source = path.join(folder, 'extension');
  mkdirSync(source);
  writeFileSync(
    path.join(source, 'manifest.json'),
    JSON.stringify({
      key: 'public test key',
      version: '0.6.4',
      permissions: ['storage', 'downloads'],
      optional_permissions: ['downloads', 'tabs'],
    }),
  );
  writeFileSync(path.join(folder, 'notice'), 'public license');
  const inputs = path.join(folder, 'extras.json');
  writeFileSync(
    inputs,
    JSON.stringify({
      LICENSE: path.join(folder, 'notice'),
      'THIRD_PARTY_NOTICES.md': path.join(folder, 'notice'),
    }),
  );
  const python =
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const pack = (file: string, store = false) =>
    execFileSync(
      python,
      [
        path.join(root, 'tools/release/pack.py'),
        source,
        path.join(folder, file),
        inputs,
        ...(store ? ['--edge-store'] : []),
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  expect(pack('first.zip')).toBe(pack('second.zip'));
  pack('store.zip', true);
  const comparison = execFileSync(
    python,
    [
      '-c',
      `import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as normal, zipfile.ZipFile(sys.argv[2]) as store:
 a=json.loads(normal.read('manifest.json'));b=json.loads(store.read('manifest.json'));a.pop('key')
 assert 'downloads' in a['permissions']
 for field in ('permissions', 'optional_permissions'): a[field]=[p for p in a[field] if p!='downloads']
 assert a==b and 'key' not in b and 'downloads' not in b['permissions'] and 'downloads' not in b['optional_permissions']
 assert normal.namelist()==store.namelist()
 assert all(normal.read(n)==store.read(n) for n in normal.namelist() if n!='manifest.json')
 assert [n for n in store.namelist() if n.split('/')[-1].lower()=='manifest.json']==['manifest.json']
 print('verified')`,
      path.join(folder, 'first.zip'),
      path.join(folder, 'store.zip'),
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  expect(comparison.trim()).toBe('verified');
  const verifier = path.join(root, 'tools/release/verify-store.py');
  expect(
    execFileSync(python, [verifier, path.join(folder, 'store.zip')], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  ).toContain('no downloads');
  expect(() =>
    execFileSync(python, [verifier, path.join(folder, 'first.zip')], {
      stdio: 'pipe',
      windowsHide: true,
    }),
  ).toThrow();
  for (const field of ['permissions', 'optional_permissions']) {
    const invalid = path.join(folder, `bad-${field}.zip`);
    execFileSync(
      python,
      [
        '-c',
        `import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as archive:
 archive.writestr('manifest.json', json.dumps({sys.argv[2]: ['downloads']}))`,
        invalid,
        field,
      ],
      { windowsHide: true },
    );
    expect(() =>
      execFileSync(python, [verifier, invalid], {
        stdio: 'pipe',
        windowsHide: true,
      }),
    ).toThrow();
  }
  mkdirSync(path.join(source, 'models'));
  writeFileSync(path.join(source, 'models/manifest.json'), '{}');
  expect(() => pack('nested.zip', true)).toThrow();
  unlinkSync(path.join(source, 'models/manifest.json'));
  writeFileSync(path.join(source, 'signing.pem'), 'private material');
  expect(() => pack('unsafe.zip')).toThrow();
});
