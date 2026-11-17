/** Jack-in-the-Box module (lazy-loaded by the registry). */
import type { Action } from '../../game/input';
import type { MinigameModule } from '../types';
import { jackRules, type JackInput, type JackState } from './rules';
import { createJackBot } from './bot';
import { drainAnswers } from './local';
import { JackScene } from './Scene';
import { JackHud } from './Hud';

/** Typing happens in a text box, so no game keys at all except pause. */
const BINDINGS: Record<Action, string[]> = {
  forward: [],
  back: [],
  left: [],
  right: [],
  jump: [],
  interact: [],
  run: [],
  pause: ['Escape'],
  slot1: [],
  slot2: [],
  slot3: [],
  slot4: [],
};

drainAnswers(); // nothing left over from a previous match

const jack: MinigameModule<JackState, JackInput> = {
  rules: jackRules,
  createBot: createJackBot,
  bindings: BINDINGS,
  readLocalInput: () => drainAnswers().map((text) => ({ text })),
  Scene: JackScene,
  Hud: JackHud,
};

export default jack;
