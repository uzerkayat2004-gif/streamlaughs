export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Dock = { edge: 'left' | 'right' | 'top' | 'bottom'; ratio: number };
export const DOT_SIZE = 14;
export const CONTROL_RESERVE = 64;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, Math.max(min, max)));
export const isDrag = (start: Point, next: Point) =>
  Math.hypot(next.x - start.x, next.y - start.y) > 4;
export function readDock(value: unknown): Dock | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('edge' in value) ||
    !('ratio' in value) ||
    !['left', 'right', 'top', 'bottom'].includes(String(value.edge)) ||
    typeof value.ratio !== 'number' ||
    !Number.isFinite(value.ratio)
  )
    return null;
  return { edge: value.edge as Dock['edge'], ratio: clamp(value.ratio, 0, 1) };
}
export function readPanel(value: unknown): Point | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('x' in value) ||
    !('y' in value) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y)
  )
    return null;
  return { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) };
}
export function dockPoint(dock: Dock, size: Size): Point {
  const maxX = Math.max(0, size.width - DOT_SIZE - 12),
    maxY = Math.max(0, size.height - DOT_SIZE - 12 - CONTROL_RESERVE);
  const minX = Math.min(12, maxX),
    minY = Math.min(12, maxY);
  const ratio = clamp(dock.ratio, 0, 1);
  if (dock.edge === 'left' || dock.edge === 'right')
    return {
      x: dock.edge === 'left' ? minX : maxX,
      y: minY + (maxY - minY) * ratio,
    };
  return {
    x: minX + (maxX - minX) * ratio,
    y: dock.edge === 'top' ? minY : maxY,
  };
}
export function snap(point: Point, size: Size): Dock {
  const distances = [
    { edge: 'left', distance: point.x },
    { edge: 'right', distance: size.width - DOT_SIZE - point.x },
    { edge: 'top', distance: point.y },
    {
      edge: 'bottom',
      distance: size.height - DOT_SIZE - CONTROL_RESERVE - point.y,
    },
  ] as const;
  const nearest = [...distances].sort((a, b) => a.distance - b.distance)[0]!;
  const vertical = nearest.edge === 'left' || nearest.edge === 'right';
  return {
    edge: nearest.edge,
    ratio: clamp(
      ((vertical ? point.y : point.x) - 12) /
        Math.max(
          1,
          (vertical ? size.height - CONTROL_RESERVE : size.width) -
            DOT_SIZE -
            24,
        ),
      0,
      1,
    ),
  };
}
export function boxPoint(dot: Point, bounds: Size, box: Size): Point {
  return {
    x: clamp(
      dot.x + DOT_SIZE / 2 >= bounds.width / 2
        ? dot.x + DOT_SIZE - box.width
        : dot.x,
      8,
      bounds.width - box.width - 8,
    ),
    y: clamp(
      dot.y + DOT_SIZE / 2 < bounds.height / 2
        ? dot.y + DOT_SIZE + 10
        : dot.y - box.height - 10,
      8,
      bounds.height - box.height - 8,
    ),
  };
}
/** A single normalized anchor drives both launcher and panel, across player sizes. */
export const clampAnchor = (p: Point, size: Size): Point => ({
  x: clamp(p.x, 8, size.width - DOT_SIZE - 8),
  y: clamp(p.y, 8, size.height - DOT_SIZE - 8),
});
export const normalizeAnchor = (p: Point, size: Size): Point => {
  const a = clampAnchor(p, size);
  return {
    x: (a.x - 8) / Math.max(1, size.width - DOT_SIZE - 16),
    y: (a.y - 8) / Math.max(1, size.height - DOT_SIZE - 16),
  };
};
export const restoreAnchor = (p: Point, size: Size): Point =>
  clampAnchor(
    {
      x: 8 + p.x * Math.max(0, size.width - DOT_SIZE - 16),
      y: 8 + p.y * Math.max(0, size.height - DOT_SIZE - 16),
    },
    size,
  );
export function panelPoint(point: Point, bounds: Size, panel: Size): Point {
  return {
    x: clamp(point.x, 8, bounds.width - panel.width - 8),
    y: clamp(point.y, 8, bounds.height - panel.height - CONTROL_RESERVE - 8),
  };
}
export function normalizePanel(point: Point, bounds: Size, panel: Size): Point {
  const p = panelPoint(point, bounds, panel);
  return {
    x: clamp((p.x - 8) / Math.max(1, bounds.width - panel.width - 16), 0, 1),
    y: clamp(
      (p.y - 8) /
        Math.max(1, bounds.height - panel.height - CONTROL_RESERVE - 16),
      0,
      1,
    ),
  };
}
export function restorePanel(point: Point, bounds: Size, panel: Size): Point {
  return panelPoint(
    {
      x:
        8 + clamp(point.x, 0, 1) * Math.max(0, bounds.width - panel.width - 16),
      y:
        8 +
        clamp(point.y, 0, 1) *
          Math.max(0, bounds.height - panel.height - CONTROL_RESERVE - 16),
    },
    bounds,
    panel,
  );
}
