export const OVERLAY_FADE_MS = 4000;
export function overlayOpacity(
  hovered: boolean,
  activeAt: number,
  now: number,
): number {
  return 1; // Open panels stay readable on any footage.
}
export function launcherOpacity(
  hovered: boolean,
  activeAt: number,
  now: number,
) {
  return hovered ? 1 : 0.6;
}
export function newLaugh(
  previousSession: string | null,
  previousCount: number,
  session: string | null,
  count: number,
) {
  return (
    session !== null && session === previousSession && count > previousCount
  );
}
