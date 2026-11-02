import { defaultLab, LabSwitchesSchema, TaskProbe } from './stutter';
let current = defaultLab();
const listeners = new Set<() => void>();
export const labSurface = {
  get: () => current,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  accept: (value: unknown) => {
    const parsed = LabSwitchesSchema.safeParse(value);
    if (
      parsed.success &&
      Object.keys(current).some(
        (key) =>
          current[key as keyof typeof current] !==
          parsed.data[key as keyof typeof current],
      )
    ) {
      current = parsed.data;
      for (const listener of listeners) listener();
    }
  },
};
let contentProbe: TaskProbe | undefined;
export function contentStutterMetrics() {
  contentProbe ??= new TaskProbe();
  const video = document.querySelector('video'),
    quality = video?.getVideoPlaybackQuality?.();
  return {
    tasks: contentProbe.snapshot(),
    video: quality
      ? {
          droppedFrames: quality.droppedVideoFrames,
          totalFrames: quality.totalVideoFrames,
        }
      : null,
  };
}
