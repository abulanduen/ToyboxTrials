import { getMoveAxis, type Action } from '../../game/input';
import { getMatchState, LOCAL_ID } from '../session';
import type { MinigameModule } from '../types';
import { siegeRules, type SiegeInput, type SiegeState } from './rules';
import { createSiegeBot } from './bot';
import { drainSiegeInput } from './local';
import { SiegeScene } from './Scene';
import { SiegeHud } from './Hud';

/** WASD / arrows move. Space: Rally Horn (in the arena: summon the Baron), or revive when down, or watch the next board when out. 1–4 pick a card. Q / E: previous / next board. */
const BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  slot1: ['Space'], slot2: ['Digit1', 'Numpad1'], slot3: ['Digit2', 'Numpad2'], slot4: ['Digit3', 'Numpad3'], run: ['Digit4', 'Numpad4'],
  interact: ['KeyQ'], jump: ['KeyE'], pause: ['Escape', 'KeyP'],
};
const CARD_KEYS: Partial<Record<Action, number>> = { slot2: 0, slot3: 1, slot4: 2, run: 3 };

let lastX = NaN, lastY = NaN;

const game: MinigameModule<SiegeState, SiegeInput> = {
  rules: siegeRules,
  createBot: createSiegeBot,
  bindings: BINDINGS,
  readLocalInput(presses) {
    const out: SiegeInput[] = drainSiegeInput();
    const s = getMatchState() as SiegeState | null;
    const me = s?.kind === 'toybox-siege' ? s.players.find((p) => p.id === LOCAL_ID) : undefined;
    // The stick / keys, sent only when they change (the rules latch the last value).
    const a = getMoveAxis();
    if (a.x !== lastX || a.y !== lastY || !me || (me.ax !== a.x || me.ay !== a.y)) { lastX = a.x; lastY = a.y; out.push({ type: 'move', x: a.x, y: a.y }); }
    if (!me) return out;
    for (const action of presses) {
      const card = CARD_KEYS[action];
      if (card !== undefined && me.choice) out.push({ type: 'choose', index: card });
      const watcher = me.status === 'ghost' || (me.status === 'prep' && !me.choice);
      if (action === 'slot1') {
        if (me.status === 'downed') out.push({ type: 'revive' });
        else if (watcher) out.push({ type: 'watch', dir: 1 }); // the first press starts watching the others
        else if (!me.choice) out.push({ type: 'skill' });
      }
      if (action === 'jump' && watcher) out.push({ type: 'watch', dir: 1 });
      if (action === 'interact' && watcher) out.push({ type: 'watch', dir: -1 });
    }
    return out;
  },
  Scene: SiegeScene,
  Hud: SiegeHud,
};
export default game;
