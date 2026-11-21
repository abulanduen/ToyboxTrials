/**
 * Local input for movement minigames: turns the shared action layer (keys, touch joystick, touch
 * buttons) into `MoveInput` data for a rules core. Gameplay never reads raw keys or touches.
 */
import { getMoveAxis, type Action } from '../../game/input';
import type { MoveInput } from './movement';

/**
 * WASD / arrows and Space to jump. No interact; Esc / P pause (handled by the host). There is no
 * run key: races are always at full tilt, and the analog stick sets the pace on touch.
 */
export const MOVE_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: [],
  run: [],
  pause: ['Escape', 'KeyP'],
  cancel: [],
  slot1: [],
  slot2: [],
  slot3: [],
  slot4: [],
};

/**
 * Called once per rendered frame by the host (`readLocalInput`). Samples the current axis; the
 * rules core latches it until the next sample, so it survives frames with zero or many 60 Hz steps.
 */
export function readMoveInput(presses: readonly Action[]): MoveInput[] {
  const a = getMoveAxis();
  return [{ ax: a.x, ay: a.y, run: true, jump: presses.includes('jump') }];
}
