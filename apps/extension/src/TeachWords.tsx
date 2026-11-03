import { useEffect, useState } from 'react';
import { openSelectedMicrophone, permissionHelp } from './audio/microphone';
import {
  addTemplate,
  features,
  forgetWord,
  loadTemplates,
  OTHER,
  type VoiceTemplate,
} from './inference/voice-match';

/** Words a user can teach; the label is what we ask them to say. */
export const TEACHABLE: { word: string; say: string }[] = [
  { word: 'bro', say: 'bro' },
  { word: 'lets go', say: 'let’s go' },
  { word: 'wow', say: 'wow' },
  { word: 'no way', say: 'no way' },
  { word: 'what', say: 'what' },
  { word: 'omg', say: 'oh my god' },
  { word: 'bruh', say: 'bruh' },
  { word: 'sheesh', say: 'sheesh' },
  { word: 'yo', say: 'yo' },
  { word: 'bhai', say: 'bhai' },
];
const EVERYDAY = ['okay', 'yeah', 'right', 'so'];
const TAKE_MS = 1800;

/** Record one take at 16 kHz from the loudest mic channel (never averaged). */
async function recordTake(stream: MediaStream): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(1024, 2, 1);
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'discrete';
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => {
      const ins = e.inputBuffer;
      let best = ins.getChannelData(0),
        bestE = -1;
      for (let c = 0; c < ins.numberOfChannels; c++) {
        const d = ins.getChannelData(c);
        let s = 0;
        for (const v of d) s += v * v;
        if (s > bestE) [best, bestE] = [d, s];
      }
      chunks.push(new Float32Array(best));
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    await new Promise((r) => setTimeout(r, TAKE_MS));
    src.disconnect();
    node.disconnect();
    const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  } finally {
    void ctx.close();
  }
}

export function TeachWords() {
  const [saved, setSaved] = useState<VoiceTemplate[]>([]);
  const [word, setWord] = useState(TEACHABLE[0]!.word);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    loadTemplates()
      .then(setSaved)
      .catch(() => setSaved([]));
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on open
  useEffect(() => {
    void refresh();
    if (location.hash === '#teach')
      setTimeout(() => document.getElementById('teach')?.scrollIntoView(), 100);
  }, []);
  const taught = new Set(
    saved.filter((t) => t.source === 'taught' && t.word).map((t) => t.word),
  );
  const hasEveryday =
    saved.filter((t) => t.word === OTHER && t.source === 'taught').length >= 3;
  const say = TEACHABLE.find((t) => t.word === word)?.say ?? word;

  async function teach() {
    setBusy(true);
    let stream: MediaStream | undefined;
    try {
      stream = await openSelectedMicrophone();
      const takes: { word: string; label: string }[] = [
        ...[1, 2, 3].map((i) => ({ word, label: `say “${say}” (${i}/3)` })),
        ...(hasEveryday
          ? []
          : EVERYDAY.map((w, i) => ({
              word: OTHER,
              label: `now a normal word: “${w}” (${i + 1}/${EVERYDAY.length})`,
            }))),
      ];
      for (let i = 0; i < takes.length; i++) {
        const take = takes[i]!;
        let feats: number[][] = [];
        for (let attempt = 0; attempt < 3 && !feats.length; attempt++) {
          setPrompt(attempt ? `didn’t hear that · ${take.label}` : take.label);
          await new Promise((r) => setTimeout(r, 350));
          const samples = await recordTake(stream);
          let peak = 0;
          for (const v of samples) peak = Math.max(peak, Math.abs(v));
          if (peak > 0.01) feats = features(samples);
        }
        if (!feats.length)
          throw new Error('could not hear you · check your mic');
        await addTemplate({
          word: take.word,
          source: 'taught',
          feats,
          at: Date.now() + i,
        });
      }
      setPrompt(`learned your “${say}” ✓`);
    } catch (e) {
      setPrompt(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? permissionHelp
          : e instanceof Error
            ? e.message
            : 'could not record · retry',
      );
    } finally {
      for (const t of stream?.getTracks() ?? []) t.stop();
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="mic-test-step teach-words" id="teach">
      <h2>teach your words</h2>
      <p className="sub">
        if a word you shout isn’t counted, say it 3 times here. it learns your
        voice · only numbers stay on this PC, never audio
      </p>
      <fieldset className="teach-chips" aria-label="word to teach">
        {TEACHABLE.map((t) => (
          <button
            key={t.word}
            type="button"
            aria-pressed={word === t.word}
            className={`teach-chip${word === t.word ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => setWord(t.word)}
          >
            {t.say}
            {taught.has(t.word) ? ' ✓' : ''}
          </button>
        ))}
      </fieldset>
      <p className="mic-check-result" role="status">
        {prompt || `press teach, then say “${say}” when asked`}
      </p>
      <button type="button" className="btn" disabled={busy} onClick={teach}>
        {busy
          ? 'listening…'
          : taught.has(word)
            ? `re-teach “${say}”`
            : `teach “${say}”`}
      </button>
      {taught.size > 0 && (
        <button
          type="button"
          className="textbtn"
          disabled={busy}
          onClick={async () => {
            await forgetWord();
            setPrompt('forgot all taught words');
            void refresh();
          }}
        >
          forget my voice
        </button>
      )}
    </div>
  );
}
