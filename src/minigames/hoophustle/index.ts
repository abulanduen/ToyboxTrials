import { HUB_BINDINGS } from '../../game/input';
import type { MinigameModule } from '../types';
import { getMatchState, useMatch } from '../session';
import { hoopRules, type HoopInput, type HoopState } from './rules';
import { createHoopBot } from './bot';
import { readHoopInput } from './local';
import { HoopScene } from './Scene';
import { HoopHud } from './Hud';

const game: MinigameModule<HoopState, HoopInput> = {
  rules: hoopRules,
  createBot: createHoopBot,
  // A / D (or the arrows) turn the aim; Space or E (or the left mouse button, or the Throw button) charges.
  bindings: {
    ...HUB_BINDINGS,
    forward: [],
    back: [],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: [],
    interact: [],
    run: [],
    slot1: ['Space', 'KeyE'],
  },
  readLocalInput(presses) {
    const s = getMatchState() as HoopState | null;
    const id = useMatch.getState().localId;
    return readHoopInput(s, s?.kind === 'hoop-hustle' ? s.players.find((p) => p.id === id) : undefined, presses);
  },
  Scene: HoopScene,
  Hud: HoopHud,
};
export default game;
