/** Wind-Up Dash module (lazy-loaded by the registry). */
import type { MinigameModule } from '../types';
import { MOVE_BINDINGS, readMoveInput } from '../shared/moveInput';
import { dashRules, type DashInput, type DashState } from './rules';
import { createDashBot } from './bot';
import { predictDash } from './predict';
import { DashScene } from './Scene';
import { DashHud } from './Hud';

const winddash: MinigameModule<DashState, DashInput> = {
  rules: dashRules,
  createBot: createDashBot,
  bindings: MOVE_BINDINGS,
  readLocalInput: readMoveInput,
  // Online: your toy answers the stick at once, not a round trip later (./predict.ts).
  predictLocal: predictDash,
  Scene: DashScene,
  Hud: DashHud,
};

export default winddash;
