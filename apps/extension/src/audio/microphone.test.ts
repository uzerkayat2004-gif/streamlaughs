import { afterEach, expect, it, vi } from 'vitest';
import {
  bluetoothInput,
  MIC_DEVICE_KEY,
  openSelectedMicrophone,
  verifyVisibleMicrophone,
} from './microphone';

afterEach(() => vi.unstubAllGlobals());
function setup(selected = 'default', present = true) {
  const stop = vi.fn(),
    getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => ({
      getTracks: () => [{ stop }],
      getAudioTracks: () => [
        {
          readyState: 'live',
          label: 'laptop mic',
          getSettings: () => ({ sampleRate: 48000 }),
        },
      ],
    }));
  const set = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async () => ({ [MIC_DEVICE_KEY]: selected }), set },
    },
  });
  vi.stubGlobal('navigator', {
    permissions: { query: async () => ({ state: 'prompt' }) },
    mediaDevices: {
      getUserMedia,
      enumerateDevices: async () =>
        present ? [{ kind: 'audioinput', deviceId: selected }] : [],
    },
  });
  return { stop, getUserMedia, set };
}
it('releases the visible permission probe before the offscreen opener is invoked', async () => {
  const x = setup();
  await verifyVisibleMicrophone();
  expect(x.stop).toHaveBeenCalledOnce();
  expect(x.set).toHaveBeenCalledWith(
    expect.objectContaining({ 'streamlaughs:mic-consent': true }),
  );
  expect(x.getUserMedia).toHaveBeenCalledWith({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
});
it('uses the chosen device exactly and falls back if it was unplugged', async () => {
  const x = setup('headset');
  await openSelectedMicrophone();
  expect(x.getUserMedia.mock.calls[0]![0].audio).toMatchObject({
    deviceId: { exact: 'headset' },
  });
  const y = setup('unplugged', false);
  y.getUserMedia.mockRejectedValueOnce(
    new DOMException('gone', 'NotFoundError'),
  );
  await openSelectedMicrophone();
  expect(y.set).toHaveBeenCalledWith({ [MIC_DEVICE_KEY]: 'default' });
  expect(y.getUserMedia.mock.calls[1]![0].audio).not.toHaveProperty('deviceId');
});
it('does not claim permission after browser denial', async () => {
  const x = setup();
  x.getUserMedia.mockRejectedValue(
    new DOMException('blocked', 'NotAllowedError'),
  );
  await expect(verifyVisibleMicrophone()).rejects.toThrow('blocked');
  expect(x.set).not.toHaveBeenCalled();
});
it.each(['Bluetooth Headset', 'Headphones Hands-Free AG Audio', 'HFP input'])(
  'identifies a communications input %s',
  (label) => expect(bluetoothInput(label)).toBe(true),
);

it('uses a device preference sent by the background without touching unsupported offscreen storage APIs', async () => {
  const x = setup('headset');
  vi.stubGlobal('chrome', { runtime: { id: 'extension' } });
  await openSelectedMicrophone(navigator.mediaDevices.getUserMedia, 'headset');
  expect(x.getUserMedia.mock.calls[0]![0].audio).toMatchObject({
    deviceId: { exact: 'headset' },
  });
});

it('tries the selected input when permission hides enumerated device identities', async () => {
  const x = setup('usb-mic');
  Object.assign(navigator.mediaDevices, {
    enumerateDevices: async () => [
      { kind: 'audioinput', deviceId: '', label: '' },
    ],
  });
  await openSelectedMicrophone(navigator.mediaDevices.getUserMedia, 'usb-mic');
  expect(x.getUserMedia.mock.calls[0]![0].audio).toMatchObject({
    deviceId: { exact: 'usb-mic' },
  });
});

it('resolves the Windows default/communications alias to a physical input without forcing sample rate', async () => {
  const x = setup('communications');
  Object.assign(navigator.mediaDevices, {
    enumerateDevices: async () => [
      {
        kind: 'audioinput',
        deviceId: 'default',
        groupId: 'laptop',
        label: 'Default - laptop mic',
      },
      {
        kind: 'audioinput',
        deviceId: 'communications',
        groupId: 'bt',
        label: 'Communications headset',
      },
      {
        kind: 'audioinput',
        deviceId: 'physical-laptop',
        groupId: 'laptop',
        label: 'Laptop mic',
      },
      {
        kind: 'audioinput',
        deviceId: 'physical-bt',
        groupId: 'bt',
        label: 'Bluetooth headset',
      },
    ],
  });
  await openSelectedMicrophone();
  expect(x.getUserMedia.mock.calls[0]![0].audio).toMatchObject({
    deviceId: { exact: 'physical-laptop' },
  });
  expect(x.getUserMedia.mock.calls[0]![0].audio).not.toHaveProperty(
    'sampleRate',
  );
});
