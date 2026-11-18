/** Red Light, Green Light module (lazy-loaded by the registry). */
import type { MinigameModule } from '../types';
import { MOVE_BINDINGS, readMoveInput } from '../shared/moveInput';
import { rlglRules, type RlglInput, type RlglState } from './rules';
import { createRlglBot } from './bot';
import { RlglScene } from './Scene';
import { RlglHud } from './Hud';

const redlight: MinigameModule<RlglState, RlglInput> = {
  rules: rlglRules,
  createBot: createRlglBot,
  bindings: MOVE_BINDINGS,
  readLocalInput: readMoveInput,
  Scene: RlglScene,
  Hud: RlglHud,
};

export default redlight;
