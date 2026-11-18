import { HUB_BINDINGS, isDown } from '../../game/input';
import { heldGridDirection } from '../shared/gridStick';
import type { MinigameModule } from '../types';
import { hungerRules, type Direction, type HungerInput, type HungerState } from './rules';
import { createHungerBot } from './bot';
import { HungerScene } from './Scene';
import { HungerHud } from './Hud';

const game: MinigameModule<HungerState, HungerInput> = {
  rules: hungerRules, createBot: createHungerBot,
  bindings: { ...HUB_BINDINGS, jump: [], interact: [], run: [], slot1: ['Space'] },
  readLocalInput(presses) {
    // Keys/taps, or the touch joystick snapped to up/right/down/left. Holding it keeps resisting a push.
    const direction = heldGridDirection(presses);
    return [{ direction: direction as Direction | null, hit: isDown('slot1') || presses.includes('slot1') }];
  },
  Scene: HungerScene, Hud: HungerHud,
};
export default game;
