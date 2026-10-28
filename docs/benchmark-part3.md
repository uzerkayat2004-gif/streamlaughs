# Part 3 machine benchmark

Measured 2026-10-27 on this host: ASUS Vivobook 15 X1504VAP / Intel Core 5 120U (10 cores, 12 logical processors), 15.6 GiB usable RAM, Intel integrated graphics. Chromium 156 on Windows; WebGPU adapter reports intel / gen-12lp. No external model requests.

## Bundled assets

| Asset                                     |      Bytes | Decimal MB |
| ----------------------------------------- | ---------: | ---------: |
| Silero v5.1.2 ONNX                        |  2,327,524 |      2.328 |
| YAMNet TFLite                             |  4,126,810 |      4.127 |
| Whisper q8 encoder                        | 10,124,993 |     10.125 |
| Whisper q8 merged decoder                 | 30,718,858 |     30.719 |
| Whisper including tokenizer/configuration | 43,538,547 |     43.539 |

Both SIMD and non-SIMD MediaPipe runtimes are bundled for compatibility. ONNX uses the local JSEP WASM/mjs pair for both tested execution modes.

## Measured initialization and inference

| Measurement                                |    WASM | WebGPU preferred (mixed) |
| ------------------------------------------ | ------: | -----------------------: |
| vad initialization, ms                     |   677.5 |                    712.8 |
| yamnet initialization, ms                  |   180.7 |                    187.9 |
| whisper initialization, ms                 |  1072.3 |                   2780.9 |
| VAD / 512 samples, mean of 50, ms          |    1.93 |                     1.52 |
| YAMNet / 15,600 samples, mean of 10, ms    |   17.01 |                    14.17 |
| Whisper first full decode / 1 s input, ms  | 1606.20 |                  9245.10 |
| Whisper second full decode / 1 s input, ms | 1193.30 |                  9577.40 |

The GPU initialization number includes a one-token local-silence warmup to compile initial kernels. Full-decode measurements allow up to 64 tokens and disable the live time budget; generated text is discarded. Inputs are zero arrays so these are reproducible plumbing/timing measurements, **not representative speech/laugh accuracy or guaranteed latency**. The second call reuses loaded sessions. GPU is used by Whisper; VAD/YAMNet remain CPU/WASM. Disk/browser/driver caches and background load affect initialization.

Whisper is slower on this integrated GPU in this run. Default auto still prefers available WebGPU; an over-budget live decode pauses words and uses WASM on the next recovered attempt. Set preferredBackend to wasm in src/inference/config.ts for a direct comparison. Decoder deadlines are checked between tokens; individual backend kernels cannot be interrupted except by terminating the worker.

## CPU estimate

| Isolated bulk benchmark       |    WASM |    Mixed |
| ----------------------------- | ------: | -------: |
| Wall time, ms                 | 3072.65 | 19047.29 |
| Browser process CPU delta, ms | 7849.82 | 18730.37 |
| CPU ms per wall second        | 2554.74 |   983.36 |
| Share of 12 logical CPUs, %   |   21.29 |     8.19 |

Method: CDP SystemInfo process CPU deltas for this isolated Chromium instance, around 50 VAD calls + 10 YAMNet calls + two Whisper decodes. New/exited processes are excluded. It includes browser/driver overhead and CPU work during GPU waits; it is an estimate, not a streaming-session OS profile. Baseline VAD+two-source YAMNet elapsed budget from the WASM means is about 128.3 ms per audio second (31.25 VAD + 4 sound calls), before Whisper and capture/UI overhead.

## Installed extension size

| Build                  |      Bytes | Decimal MB |
| ---------------------- | ---------: | ---------: |
| chrome-mv3             | 86,418,650 |     86.419 |
| chrome-mv3-audio-debug | 86,858,708 |     86.859 |
| edge-mv3               | 86,418,650 |     86.419 |

These are uncompressed load-unpacked sizes including models, tokenizers, runtimes, licenses, fonts and UI. Release ZIP also includes source plus all three builds; its size differs.

## Verification limits

- Real YAMNet inference on the temporary public-domain laugh WAV updated dot/popup counts and created a local recap at the unchanged 0.5/two-hop threshold. This is a positive smoke test, not measured personal recall.
- The same worker processed local Windows-generated speech: six VAD segments, one Whisper decode, two approved phrase labels and four hype events; no transcript text was logged/saved and no outbound requests occurred. Words degraded to low power during that short run.
- Tiny committed synthetic keyboard/silence clips each produced zero reaction false positives across two seconds. With no positive ground truth in those clips, precision/recall are null, not 100%. Raw metrics are in eval-synthetic.jsonl.
- Your labelled recording guide is needed for precision/recall on real laughter/speech/screams and physical speaker leakage. Physical Edge/audio routing, speakers/headphones and a two-hour hardware soak remain manual.

Reproduce: node tools/eval/cli.mjs tools/eval/fixtures --benchmark [--webgpu]. Raw benchmark-wasm.json and benchmark-webgpu.json preserve the measured values.
