// Loads the bundled 3 s English speech clip used to check that the word model
// prints real words on this device. Reads only a packaged extension file; no
// user audio passes through here.
export async function loadSelfTestClip(base: string) {
  try {
    const pcm = await (await fetch(`${base}/models/selftest.pcm`)).arrayBuffer();
    const ints = new Int16Array(pcm),
      samples = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i++) samples[i] = ints[i]! / 32768;
    return samples;
  } catch {
    return null;
  }
}
