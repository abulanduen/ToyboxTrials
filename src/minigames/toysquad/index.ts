import { HUB_BINDINGS } from '../../game/input';
import type { MinigameModule } from '../types';
import { squadRules, type SquadInput, type SquadState } from './rules';
import { createSquadBot } from './bot';
import { drainSquadInput } from './local';
import { SquadScene } from './Scene';
import { SquadHud } from './Hud';

const game: MinigameModule<SquadState, SquadInput> = {
  rules: squadRules, createBot: createSquadBot,
  bindings: { ...HUB_BINDINGS, forward: [], back: [], left: [], right: [], jump: [], interact: [], run: [] },
  readLocalInput: drainSquadInput,
  Scene: SquadScene, Hud: SquadHud,
};
export default game;
