import { heldGridDirection } from '../shared/gridStick';
import { HUB_BINDINGS, isDown } from '../../game/input';
import type { MinigameModule } from '../types';
import { infernoRules, type InfernoInput, type InfernoState } from './rules';
import { createInfernoBot } from './bot';
import { InfernoScene } from './Scene';
import { InfernoHud } from './Hud';

const game: MinigameModule<InfernoState, InfernoInput> = {
  rules: infernoRules, createBot: createInfernoBot,
  bindings: { ...HUB_BINDINGS, jump: [], slot1: ['Space'], slot2: ['KeyR'], interact: [] },
  readLocalInput(presses) {
    const inputs: InfernoInput[] = [];
    // Keys/taps, or the touch joystick snapped to up/right/down/left.
    const direction = heldGridDirection(presses);
    if (direction !== null) inputs.push({ direction });
    if (isDown('slot1') || presses.includes('slot1')) inputs.push({ action: 'break' });
    if (presses.includes('slot2')) inputs.push({ action: 'build' });
    return inputs;
  },
  Scene: InfernoScene, Hud: InfernoHud,
};
export default game;
