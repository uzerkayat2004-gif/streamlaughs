export async function checkMicrophone(
  stream: MediaStream,
  update: (level: number) => void,
  signal: AbortSignal,
) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  // Measure each physical channel on its own: mic arrays can send anti-phase
  // channels that cancel to silence when an analyser downmixes them.
  const splitter = context.createChannelSplitter(2);
  source.connect(splitter);
  const analysers = [0, 1].map((channel) => {
    const node = context.createAnalyser();
    node.fftSize = 1024;
    splitter.connect(node, channel);
    return node;
  });
  const samples = new Float32Array(1024);
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
        let rms = 0;
        for (const analyser of analysers) {
          analyser.getFloatTimeDomainData(samples);
          let square = 0;
          for (const sample of samples) square += sample * sample;
          rms = Math.max(rms, Math.sqrt(square / samples.length));
        }
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
    splitter.disconnect();
    for (const analyser of analysers) analyser.disconnect();
    await context.close();
  }
}
