/**
 * Personal voice match for reaction words.
 *
 * Generic speech models (Moonshine, Whisper, even Whisper small) mishear how
 * many people actually shout a short reaction: a real player's "bro" came out
 * as "No", "Oh", "Pro" or "The". No setup: when a model hears a short
 * reaction plainly, its sound is kept as an example of this user's voice, and
 * later short clips are compared against those examples with MFCC + DTW.
 *
 * Only MFCC numbers are kept (on this device, in IndexedDB). Never raw audio.
 *
 * Offline check (one real player's recording, 10 "bro" + sentences + laughs):
 * full chain caught 6/10 on the first pass and 9/10 once it had learned.
 */
export const SAMPLE_RATE = 16000;
const FRAME = 400,
  HOP = 160,
  NFFT = 512,
  MELS = 26,
  CEPS = 13;
/** Accept a match below this mean DTW frame distance. */
export const MATCH_MAX = 2.05;
/** Second best word must be at least this much further away. */
export const MATCH_MARGIN = 0.15;
export const MAX_CLIP_SECONDS = 1.8;
export const MAX_PER_WORD = 6;

export type Features = number[][];
export type VoiceTemplate = {
  id?: number;
  word: string;
  source: 'taught' | 'auto';
  feats: Features;
  at: number;
};
export type VoiceMatch = {
  word: string;
  distance: number;
  margin: number;
  accepted: boolean;
};

let melBank: Float32Array[] | null = null;
let window_: Float32Array | null = null;
let dct: Float32Array[] | null = null;
function setup() {
  if (melBank) return;
  const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const top = mel(SAMPLE_RATE / 2);
  const pts = Array.from({ length: MELS + 2 }, (_, i) =>
    Math.floor(((NFFT + 1) * hz((top * i) / (MELS + 1))) / SAMPLE_RATE),
  );
  melBank = [];
  for (let m = 1; m <= MELS; m++) {
    const f = new Float32Array(NFFT / 2 + 1);
    for (let k = pts[m - 1]!; k < pts[m]!; k++)
      f[k] = (k - pts[m - 1]!) / Math.max(1, pts[m]! - pts[m - 1]!);
    for (let k = pts[m]!; k < pts[m + 1]!; k++)
      f[k] = (pts[m + 1]! - k) / Math.max(1, pts[m + 1]! - pts[m]!);
    melBank.push(f);
  }
  window_ = Float32Array.from(
    { length: FRAME },
    (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1)),
  );
  dct = [];
  for (let c = 0; c < CEPS; c++)
    dct.push(
      Float32Array.from({ length: MELS }, (_, m) =>
        Math.cos((Math.PI * c * (m + 0.5)) / MELS),
      ),
    );
}

function powerSpectrum(frame: Float32Array) {
  // Iterative radix-2 FFT on NFFT points.
  const re = new Float64Array(NFFT),
    im = new Float64Array(NFFT);
  re.set(frame);
  for (let i = 1, j = 0; i < NFFT; i++) {
    let bit = NFFT >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
    }
  }
  for (let len = 2; len <= NFFT; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < NFFT; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k),
          wi = Math.sin(ang * k);
        const a = i + k,
          b = a + len / 2;
        const tr = re[b]! * wr - im[b]! * wi,
          ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
  }
  const out = new Float32Array(NFFT / 2 + 1);
  for (let k = 0; k <= NFFT / 2; k++)
    out[k] = (re[k]! * re[k]! + im[k]! * im[k]!) / NFFT;
  return out;
}

/** Cut leading/trailing quiet so taught and live clips line up. */
export function trimQuiet(samples: Float32Array) {
  const w = 320,
    n = Math.floor(samples.length / w);
  if (n < 3) return samples;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * w; j < (i + 1) * w; j++) s += samples[j]! * samples[j]!;
    e[i] = Math.sqrt(s / w);
  }
  const max = e.reduce((a, b) => Math.max(a, b), 0);
  if (max <= 0) return samples;
  const thr = max * 0.1;
  let a = 0,
    b = n - 1;
  while (a < n && e[a]! < thr) a++;
  while (b > a && e[b]! < thr) b--;
  return samples.subarray(Math.max(0, a - 2) * w, Math.min(n, b + 3) * w);
}

/** 12 MFCCs per 10 ms (c0 dropped), mean/variance normalised per clip. */
export function features(input: Float32Array): Features {
  setup();
  const trimmed = trimQuiet(input);
  let peak = 0;
  for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
  if (peak <= 0 || trimmed.length < FRAME) return [];
  const x = new Float32Array(trimmed.length);
  x[0] = trimmed[0]! / peak;
  for (let i = 1; i < x.length; i++)
    x[i] = (trimmed[i]! - 0.97 * trimmed[i - 1]!) / peak;
  const frames: number[][] = [];
  const buf = new Float32Array(FRAME);
  for (let s = 0; s + FRAME <= x.length; s += HOP) {
    for (let i = 0; i < FRAME; i++) buf[i] = x[s + i]! * window_![i]!;
    const p = powerSpectrum(buf);
    const logMel = melBank!.map((f) => {
      let v = 0;
      for (let k = 0; k < f.length; k++) v += f[k]! * p[k]!;
      return Math.log(Math.max(v, 1e-10));
    });
    const row: number[] = [];
    for (let c = 1; c < CEPS; c++) {
      let v = 0;
      for (let m = 0; m < MELS; m++) v += dct![c]![m]! * logMel[m]!;
      row.push(v);
    }
    frames.push(row);
  }
  if (frames.length < 5) return [];
  const d = frames[0]!.length;
  for (let c = 0; c < d; c++) {
    let mean = 0;
    for (const f of frames) mean += f[c]!;
    mean /= frames.length;
    let v = 0;
    for (const f of frames) v += (f[c]! - mean) ** 2;
    const sd = Math.sqrt(v / frames.length) + 1e-6;
    for (const f of frames)
      f[c] = Math.round(((f[c]! - mean) / sd) * 1000) / 1000;
  }
  return frames;
}

/** Mean per-step DTW distance (path cost / (n + m)). */
export function dtwDistance(a: Features, b: Features) {
  const n = a.length,
    m = b.length;
  if (!n || !m) return Infinity;
  // Clips more than 2.5x apart in length are not the same word.
  if (n > m * 2.5 || m > n * 2.5) return Infinity;
  let prev = new Float64Array(m + 1).fill(Infinity),
    cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const ai = a[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const bj = b[j - 1]!;
      let s = 0;
      for (let k = 0; k < ai.length; k++) s += (ai[k]! - bj[k]!) ** 2;
      cur[j] = Math.sqrt(s) + Math.min(prev[j]!, cur[j - 1]!, prev[j - 1]!);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m]! / (n + m);
}

/** Auto-learned examples count only once two of them agree with each other. */
export function usableTemplates(all: VoiceTemplate[]) {
  const out = all.filter((t) => t.source === 'taught');
  const byWord = new Map<string, VoiceTemplate[]>();
  for (const t of all)
    if (t.word === OTHER) out.push(t);
    else if (t.source === 'auto')
      byWord.set(t.word, [...(byWord.get(t.word) ?? []), t]);
  for (const list of byWord.values())
    for (const t of list)
      if (
        list.some((o) => o !== t && dtwDistance(t.feats, o.feats) < MATCH_MAX)
      )
        out.push(t);
  return out;
}

/** Everyday short clips of this user ("other") are kept as competitors. */
export const OTHER = '';
export const MAX_OTHER = 24;
/** Before enough everyday clips are known, only very close matches count. */
export const COLD_MAX = 1.6;
export const MIN_OTHER = 4;

export function matchVoice(
  feats: Features,
  templates: VoiceTemplate[],
): VoiceMatch | null {
  if (!feats.length || !templates.length) return null;
  const best = new Map<string, number>();
  let other = Infinity,
    others = 0;
  for (const t of templates) {
    const d = dtwDistance(feats, t.feats);
    if (t.word === OTHER) {
      others++;
      other = Math.min(other, d);
    } else if (d < (best.get(t.word) ?? Infinity)) best.set(t.word, d);
  }
  const ranked = [...best.entries()].sort((x, y) => x[1] - y[1]);
  if (!ranked.length || !Number.isFinite(ranked[0]![1])) return null;
  const [word, distance] = ranked[0]!;
  const margin = Math.min(ranked[1]?.[1] ?? Infinity, other) - distance;
  return {
    word,
    distance,
    margin,
    accepted:
      distance <= (others >= MIN_OTHER ? MATCH_MAX : COLD_MAX) &&
      margin >= MATCH_MARGIN,
  };
}

// ---- storage (IndexedDB, extension origin: shared by pages and workers) ----
const DB = 'streamlaughs-voice',
  STORE = 'templates';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, {
        keyPath: 'id',
        autoIncrement: true,
      });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
export function loadTemplates() {
  return tx('readonly', (s) => s.getAll() as IDBRequest<VoiceTemplate[]>);
}
export async function addTemplate(t: VoiceTemplate) {
  const all = await loadTemplates();
  const cap = t.word === OTHER ? MAX_OTHER : MAX_PER_WORD;
  const same = all
    .filter((o) => o.word === t.word && o.source === t.source)
    .sort((a, b) => a.at - b.at);
  for (const old of same.slice(0, Math.max(0, same.length - cap + 1)))
    await tx('readwrite', (s) => s.delete(old.id!));
  if (t.source === 'taught' && t.word !== OTHER)
    // An everyday clip that sounds like this word was probably a missed one.
    for (const o of all)
      if (
        o.word === OTHER &&
        o.source === 'auto' &&
        dtwDistance(o.feats, t.feats) < MATCH_MAX
      )
        await tx('readwrite', (s) => s.delete(o.id!));
  const { id: _drop, ...row } = t;
  await tx('readwrite', (s) => s.add(row));
}
export async function forgetWord(word?: string) {
  const all = await loadTemplates();
  for (const t of all)
    if (!word || t.word === word) await tx('readwrite', (s) => s.delete(t.id!));
}
