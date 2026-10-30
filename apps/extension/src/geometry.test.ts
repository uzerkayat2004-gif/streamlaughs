import { describe, expect, it } from 'vitest';
import { boxPoint, dockPoint, isDrag, snap } from './geometry';

describe('dot drag and snap', () => {
  const bounds = { width: 1000, height: 600 };
  it('requires movement greater than four pixels', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 4, y: 1 })).toBe(true);
  });
  it.each([
    [5, 250, 'left'],
    [960, 250, 'right'],
    [500, 5, 'top'],
    [500, 560, 'bottom'],
  ] as const)('snaps %i,%i to %s', (x, y, edge) =>
    expect(snap({ x, y }, bounds).edge).toBe(edge),
  );
  it('preserves normalized positions when resizing', () => {
    const dock = snap({ x: 960, y: 280 }, bounds);
    expect(dockPoint(dock, { width: 500, height: 300 }).x).toBe(448);
    expect(dockPoint(dock, bounds).y).toBeCloseTo(280);
  });
  it('keeps extreme and tiny bounds nonnegative', () => {
    expect(
      dockPoint({ edge: 'bottom', ratio: 4 }, { width: 20, height: 20 }),
    ).toEqual({ x: 0, y: 0 });
  });
  it('opens the box on the side with room and clamps vertically', () => {
    expect(
      boxPoint({ x: 950, y: 550 }, bounds, { width: 300, height: 350 }),
    ).toEqual({ x: 640, y: 178 });
    expect(
      boxPoint({ x: 12, y: 12 }, bounds, { width: 300, height: 350 }).x,
    ).toBe(62);
  });
});
