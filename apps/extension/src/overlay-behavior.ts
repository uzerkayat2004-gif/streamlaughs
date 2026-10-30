export const OVERLAY_FADE_MS = 4000;
export function overlayOpacity(
  hovered: boolean,
  activeAt: number,
  now: number,
): number {
  return hovered || now - activeAt < OVERLAY_FADE_MS ? 1 : 0.25;
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
