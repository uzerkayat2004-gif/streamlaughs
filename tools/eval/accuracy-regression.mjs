// Targeted recorded-input regression, not the website/e2e runner.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = path.join(root, 'tests/fixtures/audio/accuracy');
const folder = path.resolve(
  process.env.ACCURACY_REPORT_DIR || path.join(root, '.test-runtime/accuracy'),
);
fs.mkdirSync(folder, { recursive: true });
let cases = JSON.parse(
  fs.readFileSync(path.join(fixtures, 'cases.json'), 'utf8'),
);
if (process.env.ACCURACY_CASES)
  cases = cases.filter((c) =>
    process.env.ACCURACY_CASES.split(',').includes(c.name),
  );
if (process.env.ACCURACY_FIRST) {
  const names = process.env.ACCURACY_FIRST.split(',');
  cases.sort(
    (a, b) =>
      (names.includes(a.name) ? names.indexOf(a.name) : names.length) -
      (names.includes(b.name) ? names.indexOf(b.name) : names.length),
  );
}
let failed = 0;
const reports = [];
for (const c of cases) {
  const file = c.file || path.join(fixtures, c.name + '.wav');
  if (
    c.sha256 &&
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !==
      c.sha256
  )
    throw new Error('Fixture receipt mismatch: ' + c.name);
  const env = {
    ...process.env,
    MIC_FIXTURE: file,
    MIC_SESSION_REPORT: path.join(folder, c.name + '.json'),
  };
  for (const key of [
    'MIC_DURATION_SECONDS',
    'MIC_EXPECT_LAUGHS',
    'MIC_EXPECT_WORDS',
    'MIC_TEST_UNDO',
  ])
    delete env[key];
  if (c.seconds) env.MIC_DURATION_SECONDS = String(c.seconds);
  if (c.laughs !== undefined) env.MIC_EXPECT_LAUGHS = String(c.laughs);
  if (c.words) env.MIC_EXPECT_WORDS = JSON.stringify(c.words);
  if (c.name === 'talk-three-laughs') env.MIC_TEST_UNDO = '1';
  console.log(JSON.stringify({ starting: c.name }));
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'tools/eval/mic-session-regression.mjs')],
    { env, encoding: 'utf8', windowsHide: true, timeout: 240000 },
  );
  fs.writeFileSync(
    path.join(folder, c.name + '.txt'),
    (result.stdout || '') + (result.stderr || ''),
  );
  const report = fs.existsSync(env.MIC_SESSION_REPORT)
    ? JSON.parse(fs.readFileSync(env.MIC_SESSION_REPORT, 'utf8'))
    : {};
  const passed =
    result.status === 0 &&
    report.nativePlayback === true &&
    report.sawCalibration === true;
  const row = {
    case: c.name,
    passed,
    version: report.version,
    laughs: report.sessionLaughs,
    words: report.words,
    micFrames: report.audioMetrics?.micFrames,
    detectors: report.laughDetectors,
    panelWord: report.panelWord,
    sawCalibration: report.sawCalibration,
    undo: report.undo,
    fixtureSha256:
      c.sha256 ??
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
  reports.push(row);
  if (!passed) failed++;
  console.log(JSON.stringify(row));
}
fs.writeFileSync(
  path.join(folder, 'summary.json'),
  JSON.stringify(reports, null, 2),
);
if (failed)
  throw new Error(
    `${failed} accuracy fixture(s) failed; retain reports in ${folder}`,
  );
