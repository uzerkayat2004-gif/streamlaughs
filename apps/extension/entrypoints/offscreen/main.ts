import { AUDIO_DEBUG } from '../../src/audio/config';
import { AudioEngine, microphonePermission } from '../../src/audio/engine';
import { OwnerCommandSchema } from '../../src/audio/protocol';
import { InferenceBridge } from '../../src/inference/bridge';
import { defaultLab, TaskProbe } from '../../src/stutter';
import { safeError } from '../../src/diagnostics';

const deliveries = new Set<Promise<unknown>>();
let lab = defaultLab();
let noticeSent = false;
const tasks = new TaskProbe();
let observedTasks = 0;
let deliveryError = '';
let runtimeError = '';
const rememberRuntimeError = (error: unknown) => {
  runtimeError = safeError(error);
  console.error('StreamLaughs: offscreen runtime', runtimeError);
};
window.addEventListener('error', (event) =>
  rememberRuntimeError(event.error ?? new Error(event.message)),
);
window.addEventListener('unhandledrejection', (event) =>
  rememberRuntimeError(event.reason),
);
async function deliver(message: unknown) {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.ok === false)
      throw new Error(result.error || 'background rejected the audio update');
    deliveryError = '';
  } catch (error) {
    const reason = safeError(error);
    if (reason !== deliveryError)
      console.error('StreamLaughs: audio status/event delivery', reason);
    deliveryError = reason;
  }
}
const engine = new AudioEngine((message) => {
  if (message.type === 'AUDIO_REPORT') {
    tasks.tick();
    const currentTasks = tasks.snapshot();
    if (currentTasks.count > observedTasks) {
      observedTasks = currentTasks.count;
      inference?.backoffSpeech();
    }
    const audio = engine.diagnostics();
    inference?.setLab(lab, audio.playback.speechPaused);
    inference?.sync(message);
    if (
      !noticeSent &&
      (audio.bluetooth ||
        audio.playback.watchdogGaps ||
        (audio.playback.underruns ?? 0) > 1)
    ) {
      noticeSent = true;
      void chrome.runtime
        .sendMessage({
          type: 'AUDIO_STUTTER_NOTICE',
          ownerId: message.ownerId,
          sessionId: message.sessionId,
        })
        .catch(() => {});
    }
  }
  void deliver(message);
});
const inference = new InferenceBridge(engine.frames, (message) => {
  const sent = deliver(message);
  if ((message as { type?: string }).type === 'PERSONAL_EVENTS') {
    deliveries.add(sent);
    void sent.finally(() => deliveries.delete(sent));
  }
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
      case 'AUDIO_DIAGNOSTICS': {
        const audio = engine.diagnostics();
        return {
          sessionId: engine.status()?.sessionId ?? null,
          audio: { ...audio, error: audio.error || runtimeError },
          inference: inference.diagnostics(),
          lab: { ...lab },
          offscreenTasks: tasks.snapshot(),
          deliveryError,
        };
      }
      case 'AUDIO_PREVIEW':
        return parsed.data.speech
          ? inference.speechPreview()
          : inference.preview();
      case 'AUDIO_START':
        runtimeError = '';
        inference.setSensitivity(parsed.data.sensitivity ?? 'normal');
        lab = defaultLab();
        tasks.reset();
        noticeSent = false;
        return engine.start(parsed.data);
      case 'AUDIO_SENSITIVITY':
        inference.setSensitivity(parsed.data.value);
        return null;
      case 'AUDIO_LAB': {
        const previous = lab;
        lab = parsed.data.switches;
        try {
          await engine.setLab(lab, parsed.data.streamId);
        } catch (error) {
          lab = previous;
          throw error;
        }
        inference.setLab(lab, engine.diagnostics().playback.speechPaused);
        return { ...lab };
      }
      case 'AUDIO_PAUSE':
        return engine.pause(parsed.data.paused);
      case 'AUDIO_DRAIN':
        await inference.finish();
        await Promise.allSettled([...deliveries]);
        return null;
      case 'AUDIO_STOP':
        await engine.stop();
        return null;
      case 'AUDIO_RETRY':
        return engine.retryMic(parsed.data.micDeviceId);
      case 'AUDIO_PERMISSION':
        return microphonePermission();
      case 'AUDIO_STATUS':
        return engine.status();
    }
  };
  void run().then(
    (value) => reply({ ok: true, value }),
    (error) => {
      const diagnostic = safeError(error);
      console.error(
        'StreamLaughs: offscreen command failed',
        parsed.data.type,
        diagnostic,
      );
      reply({
        ok: false,
        error: 'capture',
        diagnostic: engine.diagnostics().error || diagnostic,
      });
    },
  );
  return true;
});
window.addEventListener('pagehide', () => {
  void engine.stop();
});
