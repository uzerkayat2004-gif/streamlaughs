import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openEvaluator } from './browser.mjs';
import { evaluate } from './metrics.mjs';
import { decodeWav } from './wav.mjs';

const folder = process.argv[2] ?? 'tools/eval/fixtures';
const backend = process.argv.includes('--webgpu') ? 'webgpu' : 'wasm';
const runner = await openEvaluator(backend);
try {
  if (process.argv.includes('--benchmark')) {
    const info = await runner.page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      const i = adapter?.info;
      return {
        userAgent: navigator.userAgent,
        gpu: i
          ? {
              vendor: i.vendor,
              architecture: i.architecture,
              device: i.device,
              description: i.description,
            }
          : null,
        logicalProcessors: navigator.hardwareConcurrency,
      };
    });
    const before = await runner.cpu(),
      start = performance.now();
    const benchmark = await runner.run('benchmark'),
      elapsed = performance.now() - start,
      after = await runner.cpu();
    const cpuMs = after.reduce(
      (sum, p) =>
        sum +
        Math.max(
          0,
          p.cpuTime - (before.find((b) => b.id === p.id)?.cpuTime ?? p.cpuTime),
        ) *
          1000,
      0,
    );
    console.log(
      JSON.stringify(
        {
          machine: info,
          benchmark,
          cpuEstimate: {
            wallMs: elapsed,
            cpuMs,
            cpuMsPerSecond: (cpuMs / elapsed) * 1000,
            logicalCpuPercent: (cpuMs / elapsed / info.logicalProcessors) * 100,
            method:
              'CDP process CPU deltas for this isolated browser; exited/new processes excluded',
          },
        },
        null,
        2,
      ),
    );
  } else
    for (const file of (await readdir(folder))
      .filter((file) => file.endsWith('.wav') && !file.endsWith('.tab.wav'))
      .sort()) {
      const stem = path.join(folder, file.slice(0, -4)),
        labels = JSON.parse(await readFile(`${stem}.labels.json`, 'utf8'));
      const mic = decodeWav(await readFile(`${stem}.wav`));
      const tab = await readFile(`${stem}.tab.wav`).then(
        decodeWav,
        () => undefined,
      );
      if (mic.length > 16000 * 600)
        throw new Error('Split recordings into clips of at most ten minutes');
      const result = await runner.run('evaluate', {
        mic: Array.from(mic),
        tab: tab ? Array.from(tab) : undefined,
      });
      mic.fill(0);
      tab?.fill(0);
      console.log(
        JSON.stringify({
          file,
          metrics: evaluate(labels, result.events, result.segments),
          health: result.metrics.health,
        }),
      );
    }
} finally {
  await runner.close();
}
