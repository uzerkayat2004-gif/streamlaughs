import { expect, it } from 'vitest';
import {
  CONTROL_RESERVE,
  dockPoint,
  normalizePanel,
  panelPoint,
  restorePanel,
} from './geometry';
import { newLaugh, overlayOpacity } from './overlay-behavior';

it('fades after four seconds, stays bright on hover and wakes for a new laugh', () => {
  expect(overlayOpacity(false, 1000, 4999)).toBe(1);
  expect(overlayOpacity(false, 1000, 5000)).toBe(0.25);
  expect(overlayOpacity(true, 1000, 9000)).toBe(1);
  expect(overlayOpacity(false, 9000, 9000)).toBe(1);
  expect(newLaugh('one', 3, 'one', 4)).toBe(true);
  expect(newLaugh('one', 3, 'two', 8)).toBe(false);
  expect(newLaugh('one', 3, 'one', 3)).toBe(false);
});
it('keeps the default launcher and panel above controls and restores normalized dragging', () => {
  const bounds = { width: 1000, height: 600 },
    size = { width: 210, height: 240 };
  const launcher = dockPoint({ edge: 'right', ratio: 1 }, bounds);
  expect(launcher.y + 40).toBeLessThanOrEqual(600 - CONTROL_RESERVE);
  const moved = panelPoint({ x: 5000, y: 5000 }, bounds, size);
  expect(moved.x + size.width).toBeLessThan(1000);
  expect(moved.y + size.height).toBeLessThanOrEqual(600 - CONTROL_RESERVE);
  const stored = normalizePanel(moved, bounds, size);
  expect(restorePanel(stored, bounds, size)).toEqual(moved);
  const smaller = restorePanel(stored, { width: 500, height: 360 }, size);
  expect(smaller.y + size.height).toBeLessThanOrEqual(360 - CONTROL_RESERVE);
});
