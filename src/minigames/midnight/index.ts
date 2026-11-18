import { HUB_BINDINGS, isDown } from '../../game/input';
import type { MinigameModule } from '../types';
import { hungerRules, type Direction, type HungerInput, type HungerState } from './rules';
import { createHungerBot } from './bot';
import { HungerScene } from './Scene';
import { HungerHud } from './Hud';

const game: MinigameModule<HungerState, HungerInput> = {
  rules: hungerRules, createBot: createHungerBot,
  bindings: { ...HUB_BINDINGS, jump: [], interact: [], run: [] },
  readLocalInput(presses) {
    const actions = ['forward', 'right', 'back', 'left'] as const;
    const direction = actions.findIndex(a => isDown(a) || presses.includes(a));
    return direction < 0 ? [] : [{ direction: direction as Direction }];
  },
  Scene: HungerScene, Hud: HungerHud,
};
export default game;
