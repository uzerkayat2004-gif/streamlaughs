# Third-party notices

The root MIT license covers original project code. It does not relicense models, fonts, libraries or supplied reference assets. Preserve their notices when redistributing.

| Asset                                      | License / bundled notice                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Silero VAD v5.1.2                          | MIT, models/licenses/silero-MIT.txt                                                                                      |
| YAMNet / MediaPipe model                   | Apache-2.0, models/licenses/YAMNet-Apache-2.0.txt                                                                        |
| Whisper tiny.en quantized weights          | Apache-2.0 model card, models/licenses/Whisper-model-card.md; OpenAI implementation MIT, models/licenses/Whisper-MIT.txt |
| Transformers.js                            | Apache-2.0, models/licenses/Transformers-Apache-2.0.txt                                                                  |
| ONNX Runtime Web                           | MIT, runtime/onnx/LICENSE.txt                                                                                            |
| MediaPipe Tasks Audio                      | Apache-2.0, runtime/mediapipe/LICENSE.txt                                                                                |
| Bricolage Grotesque, Inter, JetBrains Mono | SIL Open Font License 1.1, fonts/*-LICENSE.txt                                                                           |

Extension asset paths above are relative to the installed ZIP. Their source is apps/extension/public/. Model sources, pinned revision, file sizes and SHA-256 receipts are in models/manifest.json; build-time verification rejects changed files. Website font notices live in apps/web/public/fonts/.

JavaScript dependency copyright/license notices are retained by the production bundler's legal comments, with the complete package list and exact versions in pnpm-lock.yaml. React, WXT, Vite, Zustand, Dexie, Hono, Next.js, Tailwind CSS and Zod use their upstream licenses; Lucide icons use ISC. Each release ZIP includes dependency-notices.txt with an installed production dependency inventory and upstream license texts available in those packages. No private test recordings are distributed.
