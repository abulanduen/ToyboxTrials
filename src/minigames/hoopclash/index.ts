/** Hoop Clash module (lazy-loaded by the registry). */
import type { MinigameModule } from '../types';
import { hoopRules, type HoopInput, type HoopState } from './rules';
import { createHoopBot } from './bot';
import { HOOP_BINDINGS, readHoopInput } from './local';
import { HoopScene } from './Scene';
import { HoopHud, HoopResults } from './Hud';
import { predictHoop } from './predict';

const hoopclash: MinigameModule<HoopState, HoopInput> = {
  rules: hoopRules,
  createBot: createHoopBot,
  bindings: HOOP_BINDINGS,
  readLocalInput: readHoopInput,
  Scene: HoopScene,
  Hud: HoopHud,
  ResultsExtra: HoopResults,
  predictLocal: predictHoop,
};

export default hoopclash;
