import { useEffect, useState } from 'react';
import {
  MIC_DEVICE_KEY,
  selectedMicrophone,
  bluetoothInput,
} from './audio/microphone';
export function MicDevicePicker({ changed }: { changed?: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [selected, setSelected] = useState('default'),
    [error, setError] = useState('');
  useEffect(() => {
    const update = async () => {
      setSelected(await selectedMicrophone());
      try {
        setDevices(
          (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) =>
              d.kind === 'audioinput' &&
              !['default', 'communications'].includes(d.deviceId),
          ),
        );
      } catch {
        setError('allow the mic to see input names');
      }
    };
    void update();
    navigator.mediaDevices.addEventListener('devicechange', update);
    return () =>
      navigator.mediaDevices.removeEventListener('devicechange', update);
  }, []);
  return (
    <div className="mic-device-picker">
      <label>
        microphone
        <select
          aria-label="microphone input"
          value={selected}
          onChange={async (e) => {
            const id = e.currentTarget.value;
            await chrome.storage.local.set({ [MIC_DEVICE_KEY]: id });
            setSelected(id);
            changed?.();
          }}
        >
          <option value="default">system default</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `microphone ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="sub">{error}</p>}
      {bluetoothInput(
        devices.find((d) => d.deviceId === selected)?.label ?? '',
      ) && (
        <p className="mic-bluetooth-tip">
          Bluetooth headphones sound bad while the mic is on; use your laptop
          mic instead
        </p>
      )}
    </div>
  );
}
