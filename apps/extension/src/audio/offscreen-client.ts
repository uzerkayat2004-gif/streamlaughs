import type { AudioReport } from '@laughline/shared';
import type { OwnerCommand } from './protocol';

let creating: Promise<void> | undefined;
const url = () => chrome.runtime.getURL('/offscreen.html');
export async function hasAudioOwner() {
  return !!(await audioOwnerContext());
}
export async function audioOwnerContext() {
  return (
    await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [url()],
    })
  )[0];
}
export async function ensureAudioOwner() {
  if (await hasAudioOwner()) return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification:
          'Process microphone and Twitch tab audio locally in memory and replay the captured tab to the speakers.',
      })
      .finally(() => {
        creating = undefined;
      });
  await creating;
}
export async function ownerCommand<T = AudioReport | null>(
  message: OwnerCommand,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: { ok: boolean; value: T; error?: string };
  try {
    result = await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Audio owner did not respond. Try again.')),
          message.type === 'AUDIO_START'
            ? 20000
            : message.type === 'AUDIO_STOP'
              ? 3000
              : 5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!result?.ok)
    throw new Error(
      'Audio capture could not start. Try the toolbar start button again.',
    );
  return result.value;
}
export async function closeAudioOwner() {
  if (creating) await creating;
  if (!(await hasAudioOwner())) return;
  await ownerCommand({ target: 'offscreen', type: 'AUDIO_STOP' }).catch(
    () => null,
  );
  // Closing the document is the final resource cleanup even if its JS handler failed.
  if (await hasAudioOwner())
    await chrome.offscreen.closeDocument().catch(async () => {
      if (await hasAudioOwner())
        throw new Error('Audio teardown failed. Retry stop.');
    });
}
