/**
 * Four-way grid movement from the shared action layer, for tile-based minigames (Inferno Escape,
 * Midnight Hunger). Keys and taps win; otherwise the touch joystick is snapped to the nearest of
 * up / right / down / left. Direction indices: 0 forward (up), 1 right, 2 back (down), 3 left.
 */
import { getMoveAxis, isDown, type Action } from '../../game/input';

export type GridDirection = 0 | 1 | 2 | 3;

/** Below this stick deflection the toy stays put (a resting thumb shouldn't walk it). */
export const GRID_STICK_DEADZONE = 0.35;
/** Near a diagonal (|x| and |y| within this fraction) keep the previous direction instead of zigzagging. */
export const GRID_STICK_HYSTERESIS = 0.22;

const KEYS: readonly Action[] = ['forward', 'right', 'back', 'left'];

/** Pure snap of a stick vector (x right, y forward) to a grid direction, with diagonal hysteresis. */
export function snapStick(x: number, y: number, previous: GridDirection | null): GridDirection | null {
  const m = Math.hypot(x, y);
  if (m < GRID_STICK_DEADZONE) return null;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const vertical: GridDirection = y > 0 ? 0 : 2;
  const horizontal: GridDirection = x > 0 ? 1 : 3;
  if (previous !== null && Math.abs(ax - ay) < GRID_STICK_HYSTERESIS * m && (previous === vertical || previous === horizontal)) return previous;
  return ay >= ax ? vertical : horizontal;
}

let last: GridDirection | null = null;

/** The direction the local player is holding this step, or null. */
export function heldGridDirection(presses: readonly Action[]): GridDirection | null {
  const k = KEYS.findIndex((a) => isDown(a) || presses.includes(a));
  if (k >= 0) return (last = k as GridDirection);
  const { x, y } = getMoveAxis();
  return (last = snapStick(x, y, last));
}
