export async function checkMicrophone(
  stream: MediaStream,
  update: (level: number) => void,
  signal: AbortSignal,
) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let peak = 0;
  try {
    await context.resume();
    await new Promise<void>((resolve) => {
      const started = performance.now();
      let animation = 0;
      const end = () => {
        cancelAnimationFrame(animation);
        signal.removeEventListener('abort', end);
        resolve();
      };
      const tick = () => {
        if (signal.aborted) {
          end();
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        let square = 0;
        for (const sample of samples) square += sample * sample;
        const rms = Math.sqrt(square / samples.length);
        peak = Math.max(peak, rms);
        update(rms);
        const elapsed = performance.now() - started;
        if (elapsed >= 4000 || (peak >= 0.002 && elapsed >= 900)) end();
        else animation = requestAnimationFrame(tick);
      };
      signal.addEventListener('abort', end, { once: true });
      tick();
    });
    return peak;
  } finally {
    samples.fill(0);
    source.disconnect();
    analyser.disconnect();
    await context.close();
  }
}
