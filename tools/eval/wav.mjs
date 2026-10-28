export function decodeWav(bytes) {
  const b = Buffer.from(bytes);
  if (
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('Expected RIFF WAV');
  let format, channels, rate, bits, data;
  for (let offset = 12; offset + 8 <= b.length; ) {
    const size = b.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + size > b.length) throw new Error('Truncated WAV');
    const id = b.toString('ascii', offset, offset + 4);
    if (id === 'fmt ') {
      format = b.readUInt16LE(start);
      channels = b.readUInt16LE(start + 2);
      rate = b.readUInt32LE(start + 4);
      bits = b.readUInt16LE(start + 14);
    }
    if (id === 'data') data = b.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (
    !data ||
    channels !== 1 ||
    rate !== 16000 ||
    !((format === 1 && bits === 16) || (format === 3 && bits === 32))
  )
    throw new Error('Use 16 kHz mono PCM16 or float32 WAV');
  const samples = new Float32Array(data.length / (bits / 8));
  for (let i = 0; i < samples.length; i++)
    samples[i] =
      format === 1 ? data.readInt16LE(i * 2) / 32768 : data.readFloatLE(i * 4);
  if (samples.some((x) => !Number.isFinite(x)))
    throw new Error('Non-finite WAV sample');
  return samples;
}
export function encodeWav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
      44 + i * 2,
    );
  return b;
}
