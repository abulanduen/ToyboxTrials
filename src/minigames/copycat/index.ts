/** Copycat Conductor module (lazy-loaded by the registry). */
import { SLOT_BINDINGS, type Action } from '../../game/input';
import type { MinigameModule } from '../types';
import { copycatRules, type CopycatInput, type CopycatState, type Slot } from './rules';
import { createCopycatBot } from './bot';
import { CopycatScene } from './Scene';
import { CopycatHud } from './Hud';

const SLOTS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4'];

const copycat: MinigameModule<CopycatState, CopycatInput> = {
  rules: copycatRules,
  createBot: createCopycatBot,
  bindings: SLOT_BINDINGS,
  readLocalInput: (presses) => {
    const out: CopycatInput[] = [];
    for (const a of presses) {
      const i = SLOTS.indexOf(a);
      if (i >= 0) out.push({ slot: i as Slot });
    }
    return out;
  },
  Scene: CopycatScene,
  Hud: CopycatHud,
};

export default copycat;
