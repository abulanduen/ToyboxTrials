/** Find the Original module (lazy-loaded by the registry). */
import type { Action } from '../../game/input';
import type { MinigameModule } from '../types';
import { findRules, type FindInput, type FindState } from './rules';
import { createFindBot } from './bot';
import { applyPresses, drainPicks, resetLocal } from './local';
import { FindScene } from './Scene';
import { FindHud } from './Hud';

/**
 * Tap or click a toy to pick it. Keyboard-only players move a ring around the crowd with the
 * arrows / WASD and pick with Enter or Space.
 */
const BINDINGS: Record<Action, string[]> = {
  forward: ['ArrowUp', 'KeyW'],
  back: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space'],
  interact: ['Enter', 'KeyE'],
  run: [],
  pause: ['Escape', 'KeyP'],
  slot1: [],
  slot2: [],
  slot3: [],
  slot4: [],
};

resetLocal(); // nothing left over from a previous match

const findTheOriginal: MinigameModule<FindState, FindInput> = {
  rules: findRules,
  createBot: createFindBot,
  bindings: BINDINGS,
  readLocalInput: (presses) => {
    applyPresses(presses);
    return drainPicks().map((pick) => ({ pick }));
  },
  Scene: FindScene,
  Hud: FindHud,
};

export default findTheOriginal;
