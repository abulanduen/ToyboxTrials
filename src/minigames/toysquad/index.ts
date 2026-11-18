import { HUB_BINDINGS } from '../../game/input';
import type { MinigameModule } from '../types';
import { squadRules, type SquadInput, type SquadState } from './rules';
import { createSquadBot } from './bot';
import { drainSquadInput, useSquadUI } from './local';
import { SquadScene } from './Scene';
import { SquadHud } from './Hud';

const game: MinigameModule<SquadState, SquadInput> = {
  rules: squadRules, createBot: createSquadBot,
  bindings: { ...HUB_BINDINGS, forward: [], back: [], left: [], right: [], jump: [], interact: [], run: [], slot1: ['KeyQ'], slot2: ['KeyR'], slot3: ['KeyE'] },
  readLocalInput(presses) {
    const inputs = drainSquadInput();
    for (const action of presses) {
      const ui = useSquadUI.getState(), unit = ui.hovered ?? ui.selected;
      if (action === 'slot1' && unit !== null) inputs.push({ type: 'sell', unit });
      if (action === 'slot2') inputs.push({ type: 'reroll' });
      if (action === 'slot3') inputs.push({ type: 'ready' });
    }
    return inputs;
  },
  Scene: SquadScene, Hud: SquadHud,
};
export default game;
