import { AUDIO_DEBUG } from '../../src/audio/config';
import { AudioEngine, microphonePermission } from '../../src/audio/engine';
import { OwnerCommandSchema } from '../../src/audio/protocol';
import { InferenceBridge } from '../../src/inference/bridge';

const engine = new AudioEngine((message) => {
  if (message.type === 'AUDIO_REPORT') inference?.sync(message);
  void chrome.runtime.sendMessage(message).catch(() => {});
});
const inference = new InferenceBridge(engine.frames, (message) => {
  void chrome.runtime.sendMessage(message).catch(() => {});
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    (sender.url && sender.url !== chrome.runtime.getURL('/background.js'))
  )
    return;
  if (
    AUDIO_DEBUG &&
    (message as { type?: string })?.type === 'AI_DEBUG_OWNER'
  ) {
    reply(inference.debugState());
    return;
  }
  const parsed = OwnerCommandSchema.safeParse(message);
  if (!parsed.success) return;
  const run = async () => {
    switch (parsed.data.type) {
      case 'AUDIO_START':
        return engine.start(parsed.data);
      case 'AUDIO_PAUSE':
        return engine.pause(parsed.data.paused);
      case 'AUDIO_STOP':
        await engine.stop();
        return null;
      case 'AUDIO_RETRY':
        return engine.retryMic();
      case 'AUDIO_PERMISSION':
        return microphonePermission();
      case 'AUDIO_STATUS':
        return engine.status();
    }
  };
  void run().then(
    (value) => reply({ ok: true, value }),
    () => reply({ ok: false, error: 'capture' }),
  );
  return true;
});
window.addEventListener('pagehide', () => {
  void engine.stop();
});
