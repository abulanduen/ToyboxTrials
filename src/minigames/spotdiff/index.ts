/** Odd Page Out module (lazy-loaded by the registry). */
import type { Action } from '../../game/input';
import type { MinigameModule } from '../types';
import { spotRules, type SpotInput, type SpotState } from './rules';
import { createSpotBot } from './bot';
import { applyPresses, drainTaps, resetLocal } from './local';
import { SpotScene } from './Scene';
import { SpotHud } from './Hud';

/**
 * Click or tap either picture. Keyboard players hop a ring between the scene's things with the
 * arrows / WASD and tap there with Enter or Space.
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
  cancel: [],
  slot1: [],
  slot2: [],
  slot3: [],
  slot4: [],
};

resetLocal(); // nothing left over from a previous match

const oddPageOut: MinigameModule<SpotState, SpotInput> = {
  rules: spotRules,
  createBot: createSpotBot,
  bindings: BINDINGS,
  readLocalInput: (presses) => {
    applyPresses(presses);
    return drainTaps();
  },
  Scene: SpotScene,
  Hud: SpotHud,
};

export default oddPageOut;
