import { HUB_BINDINGS, isDown } from '../../game/input';
import type { MinigameModule } from '../types';
import { hungerRules, type Direction, type HungerInput, type HungerState } from './rules';
import { createHungerBot } from './bot';
import { HungerScene } from './Scene';
import { HungerHud } from './Hud';

const game: MinigameModule<HungerState, HungerInput> = {
  rules: hungerRules, createBot: createHungerBot,
  bindings: { ...HUB_BINDINGS, jump: [], interact: [], run: [], slot1: ['Space'] },
  readLocalInput(presses) {
    const actions = ['forward', 'right', 'back', 'left'] as const;
    const direction = actions.findIndex(a => isDown(a) || presses.includes(a));
    return [{ direction: direction < 0 ? null : direction as Direction, hit: isDown('slot1') || presses.includes('slot1') }];
  },
  Scene: HungerScene, Hud: HungerHud,
};
export default game;
