import { MIC_CONSENT_KEY, MICROPHONE_CONSTRAINTS } from './config';
export const MIC_DEVICE_KEY = 'streamlaughs:mic-device';
export async function selectedMicrophone() {
  const value = (await chrome.storage?.local?.get(MIC_DEVICE_KEY))?.[
    MIC_DEVICE_KEY
  ];
  return typeof value === 'string' && value.length <= 256 ? value : 'default';
}
export async function openSelectedMicrophone(
  acquire = (c: MediaStreamConstraints) =>
    navigator.mediaDevices.getUserMedia(c),
  deviceOverride?: string,
) {
  let id = deviceOverride ?? (await selectedMicrophone());
  const concreteDefault = async () => {
    const devices =
      (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ?? [];
    const real = devices.filter(
      (d) =>
        d.kind === 'audioinput' &&
        d.deviceId &&
        !['default', 'communications'].includes(d.deviceId),
    );
    const alias = devices.find((d) => d.deviceId === 'default');
    const match = real.find(
      (d) => alias?.groupId && d.groupId === alias.groupId,
    );
    // Do not open Windows' communications alias. Pin the resolved physical endpoint.
    const label = alias?.label
      ?.replace(/^default\s*[-–:]\s*/i, '')
      .trim()
      .toLowerCase();
    const named = label
      ? real.find((d) => d.label?.trim().toLowerCase() === label)
      : undefined;
    // Enumeration order is NOT the Windows default. The first device can be
    // an unused virtual cable. If identity is hidden, let getUserMedia resolve
    // the browser's actual default instead of guessing a different input.
    return match?.deviceId ?? named?.deviceId;
  };
  if (id === 'default' || id === 'communications')
    id = (await concreteDefault()) ?? 'default';
  const remember = async () => {
    if (deviceOverride === undefined)
      await chrome.storage?.local?.set({ [MIC_DEVICE_KEY]: 'default' });
  };
  // Enumeration can hide identities before a capture opens, even after a grant.
  // Only an actual missing-device capture error justifies changing the input.
  const constraints = {
    audio: {
      ...MICROPHONE_CONSTRAINTS,
      ...(id === 'default' ? {} : { deviceId: { exact: id } }),
    },
    video: false,
  };
  try {
    return await acquire(constraints);
  } catch (error) {
    if (
      id === 'default' ||
      !(error instanceof DOMException) ||
      !['NotFoundError', 'OverconstrainedError'].includes(error.name)
    )
      throw error;
    await remember();
    const fallback = await concreteDefault();
    return acquire({
      audio: {
        ...MICROPHONE_CONSTRAINTS,
        ...(fallback ? { deviceId: { exact: fallback } } : {}),
      },
      video: false,
    });
  }
}
/** Visible extension page only. Release the permission probe BEFORE opening offscreen capture. */
export async function verifyVisibleMicrophone() {
  let permission: PermissionState = 'prompt';
  try {
    permission = (
      await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })
    ).state;
  } catch {
    /* getUserMedia remains authoritative. */
  }
  let stream: MediaStream | undefined;
  try {
    stream = await openSelectedMicrophone();
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live')
      throw new Error('no live microphone · pick another input');
    const receipt = {
      permission,
      name: track.label.slice(0, 256),
      sampleRate: track.getSettings?.().sampleRate ?? 0,
      verifiedAt: Date.now(),
    };
    await chrome.storage.local.set({
      [MIC_CONSENT_KEY]: true,
      'streamlaughs:mic-verification': receipt,
    });
    return receipt;
  } finally {
    for (const track of stream?.getTracks() ?? []) track.stop();
  }
}
export const bluetoothInput = (label: string) =>
  /bluetooth|hands[ -]?free|\bHFP\b|headset.*(?:airpods|buds)|(?:airpods|buds).*headset/i.test(
    label,
  );
export const permissionHelp =
  'microphone blocked · open Chrome settings → privacy and security → site settings → microphone, allow StreamLaughs, then retry';
