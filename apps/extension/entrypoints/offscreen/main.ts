import { AUDIO_DEBUG } from '../../src/audio/config';
import { AudioEngine, microphonePermission } from '../../src/audio/engine';
import { OwnerCommandSchema } from '../../src/audio/protocol';
import { InferenceBridge } from '../../src/inference/bridge';
import { defaultLab, TaskProbe } from '../../src/stutter';

const deliveries = new Set<Promise<unknown>>();
let lab = defaultLab();
let noticeSent = false;
const tasks = new TaskProbe();
let observedTasks = 0;
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
  void chrome.runtime.sendMessage(message).catch(() => {});
});
const inference = new InferenceBridge(engine.frames, (message) => {
  const sent = chrome.runtime.sendMessage(message).catch(() => {});
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
      case 'AUDIO_DIAGNOSTICS':
        return {
          sessionId: engine.status()?.sessionId ?? null,
          audio: engine.diagnostics(),
          inference: inference.diagnostics(),
          lab: { ...lab },
          offscreenTasks: tasks.snapshot(),
        };
      case 'AUDIO_PREVIEW':
        return parsed.data.speech
          ? inference.speechPreview()
          : inference.preview();
      case 'AUDIO_START':
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
    () =>
      reply({
        ok: false,
        error: 'capture',
        diagnostic: engine.diagnostics().error,
      }),
  );
  return true;
});
window.addEventListener('pagehide', () => {
  void engine.stop();
});
