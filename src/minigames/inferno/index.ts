import { HUB_BINDINGS, isDown } from '../../game/input';
import type { MinigameModule } from '../types';
import { infernoRules, type InfernoInput, type InfernoState } from './rules';
import { createInfernoBot } from './bot';
import { InfernoScene } from './Scene';
import { InfernoHud } from './Hud';

const game: MinigameModule<InfernoState, InfernoInput> = {
  rules: infernoRules, createBot: createInfernoBot,
  bindings: { ...HUB_BINDINGS, jump: [], slot1: ['Space'], slot2: ['KeyE', 'Enter'], interact: [] },
  readLocalInput(presses) {
    const inputs: InfernoInput[] = [];
    if (isDown('forward') || presses.includes('forward')) inputs.push({ direction: 0 });
    else if (isDown('right') || presses.includes('right')) inputs.push({ direction: 1 });
    else if (isDown('back') || presses.includes('back')) inputs.push({ direction: 2 });
    else if (isDown('left') || presses.includes('left')) inputs.push({ direction: 3 });
    if (isDown('slot1') || presses.includes('slot1')) inputs.push({ action: 'break' });
    if (presses.includes('slot2')) inputs.push({ action: 'build' });
    return inputs;
  },
  Scene: InfernoScene, Hud: InfernoHud,
};
export default game;
