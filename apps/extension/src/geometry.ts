export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Dock = { edge: 'left' | 'right' | 'top' | 'bottom'; ratio: number };
export const DOT_SIZE = 32;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, Math.max(min, max)));
export const isDrag = (start: Point, next: Point) =>
  Math.hypot(next.x - start.x, next.y - start.y) > 4;
export function dockPoint(dock: Dock, size: Size): Point {
  const maxX = Math.max(0, size.width - DOT_SIZE - 12),
    maxY = Math.max(0, size.height - DOT_SIZE - 12);
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
    { edge: 'bottom', distance: size.height - DOT_SIZE - point.y },
  ] as const;
  const nearest = [...distances].sort((a, b) => a.distance - b.distance)[0]!;
  const vertical = nearest.edge === 'left' || nearest.edge === 'right';
  return {
    edge: nearest.edge,
    ratio: clamp(
      ((vertical ? point.y : point.x) - 12) /
        Math.max(1, (vertical ? size.height : size.width) - DOT_SIZE - 24),
      0,
      1,
    ),
  };
}
export function boxPoint(dot: Point, bounds: Size, box: Size): Point {
  const rightSpace = bounds.width - dot.x - DOT_SIZE;
  return {
    x: clamp(
      rightSpace >= box.width + 10
        ? dot.x + DOT_SIZE + 10
        : dot.x - box.width - 10,
      8,
      bounds.width - box.width - 8,
    ),
    y: clamp(dot.y, 8, bounds.height - box.height - 8),
  };
}
