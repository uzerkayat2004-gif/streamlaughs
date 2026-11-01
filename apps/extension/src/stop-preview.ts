import type { MySession } from '@laughline/shared';
export type StopPreview = {
  id: string;
  durationSeconds: number;
  laughs: number;
};
/** The UI commits this preview synchronously; persistence never gates feedback. */
export function stopWithPreview<T>(
  session: MySession,
  show: (preview: StopPreview) => void,
  stop: () => Promise<T>,
  now = Date.now(),
) {
  show({
    id: session.id,
    durationSeconds: Math.max(0, Math.floor((now - session.startedAt) / 1000)),
    laughs: session.laughCount,
  });
  return stop();
}
