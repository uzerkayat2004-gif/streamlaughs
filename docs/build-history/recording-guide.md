# Ten-minute local evaluation recording

The extension never records. Use your own recorder explicitly, save mono 16 kHz PCM16 WAV under **eval/local/**, and keep that folder out of git, archives and sharing. Do not put stream recordings into the repository. Use comfortable reactions without straining your voice. Keep mic/gain/speaker volume/AEC consistent and note them privately.

| Time       | Record                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–1:00  | 30 s quiet room, then small movements/breathing.                                                                                                              |
| 1:00–2:30  | Your natural laughs, quiet giggles and louder bouts, with 3–5 s gaps.                                                                                         |
| 2:30–4:00  | Ordinary English talk/reading, with gaps. Include a name, blocked term and swear only if comfortable, to check local filtering.                               |
| 4:00–5:00  | “no way”, “let’s go”, “oh my god”, “bro”, “yo”, “no shot”; a few comfortable screams/gasps separated by silence.                                              |
| 5:00–6:00  | Keyboard/mouse at normal/brisk speed, no talking.                                                                                                             |
| 6:00–8:00  | Stream through speakers, you silent; include stream laughs/talk. Keep private. Obtain a synchronized tab track separately for offline correlation evaluation. |
| 8:00–10:00 | Headphones: first minute silent, second minute your own laughs/talk over the stream.                                                                          |

Split into 30–60 s clips. For each `clip.wav`, make `clip.labels.json`:

```json
[
  { "start": 0, "end": 4, "label": "silence" },
  { "start": 4.2, "end": 6.5, "label": "laugh" },
  { "start": 8, "end": 12, "label": "speech" }
]
```

Mark each laugh/scream bout separately; the scorer matches each bout once. Use keyboard and stream-through-speakers as negative labels. Optional `clip.tab.wav` must have the same start/sample rate as `clip.wav`; mic-only audio cannot exercise the cross-input guard. A recorder's processing may differ from Chromium live AEC, so also use the live checklist.

After building debug, run `node tools/eval/cli.mjs eval/local` from the repo root. It prints metrics, never PCM or transcripts. Review false positives per negative minute and class recall separately for speakers/headphones. Note backend/threshold changes before comparing; reserve held-out clips when tuning. Meaningful accuracy requires your labelled clips; the committed synthetic fixtures only check negative/plumbing behavior.
