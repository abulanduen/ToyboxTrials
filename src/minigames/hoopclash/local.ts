/**
 * Hoop Clash local input: the shared action layer (keys, the touch joystick and buttons) plus the
 * mouse on the court (held left button = the action, right click = pass), turned into rules
 * inputs once per rendered frame. Gameplay never reads raw keys or touches.
 */
import { getMoveAxis, isDown, stickRunning, type Action } from '../../game/input';
import type { HoopInput } from './rules';

/** WASD / arrows move, Shift sprints, E or Space is the action (hold to charge), Q passes, X cancels a shot. */
export const HOOP_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: [],
  interact: ['KeyE', 'Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  // X drops a held shot (right click is the pass here, so it is not a cancel).
  cancel: ['KeyX'],
  slot1: ['KeyQ'],
  slot2: [],
  slot3: [],
  slot4: [],
};

const mouse = { held: false, passes: 0, tapped: false };

/** The court's pointer handlers (Scene.tsx): the left button is the action, right click passes. */
export function mouseAct(down: boolean) {
  if (down && !mouse.held) mouse.tapped = true;
  mouse.held = down;
}
export function mousePass() {
  if (mouse.passes < 4) mouse.passes++;
}
export function clearHoopInput() {
  mouse.held = false;
  mouse.tapped = false;
  mouse.passes = 0;
}

export function readHoopInput(presses: readonly Action[]): HoopInput[] {
  const a = getMoveAxis();
  const run = isDown('run') || stickRunning();
  const act = isDown('interact') || mouse.held;
  const out: HoopInput[] = [];
  // Cancel (X, or sliding off the touch Shoot button) first, so a let-go in the same frame shoots nothing.
  if (presses.includes('cancel')) out.push({ type: 'cancel' });
  // A press and release inside one frame still counts: down, then up.
  if (!act && (presses.includes('interact') || mouse.tapped)) out.push({ type: 'in', ax: a.x, ay: a.y, run, act: true });
  mouse.tapped = false;
  out.push({ type: 'in', ax: a.x, ay: a.y, run, act });
  let passes = presses.filter((p) => p === 'slot1').length + mouse.passes;
  mouse.passes = 0;
  while (passes-- > 0) out.push({ type: 'pass' });
  return out;
}
