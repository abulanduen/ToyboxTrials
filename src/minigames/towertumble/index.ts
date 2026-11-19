import { HUB_BINDINGS, type Action } from '../../game/input';
import { getMatchState, LOCAL_ID } from '../session';
import type { MinigameModule } from '../types';
import { GRID } from './board';
import { tumbleRules, towerAt, twinsOf, type TdInput, type TdState } from './rules';
import { createTumbleBot } from './bot';
import { buildHere, drainTumbleInput, tapCell, useTumbleUI } from './local';
import { TumbleScene } from './Scene';
import { TumbleHud } from './Hud';

const STEPS: Partial<Record<Action, [number, number]>> = { forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
const game: MinigameModule<TdState, TdInput> = {
  rules: tumbleRules,
  createBot: createTumbleBot,
  // Arrows / WASD move the square cursor, E or Enter acts on it (select, or merge into a twin);
  // B builds, U levels the builder, Q (or Delete) sells the selected tower, M merges it with a twin, N or Space starts the next wave.
  bindings: { ...HUB_BINDINGS, jump: ['Space', 'KeyN'], run: [], interact: ['KeyE', 'Enter'], slot1: ['KeyB'], slot2: ['KeyU'], slot3: ['KeyQ', 'Delete'], slot4: ['KeyM'] },
  readLocalInput(presses) {
    const inputs = drainTumbleInput();
    const s = getMatchState() as TdState | null, me = s?.kind === 'tower-tumble' ? s.players.find((p) => p.id === LOCAL_ID) : undefined;
    if (!me || me.out) return inputs;
    for (const action of presses) {
      const ui = useTumbleUI.getState(), step = STEPS[action];
      if (step) {
        const col = Math.min(GRID - 1, Math.max(0, (ui.cursor % GRID) + step[0])), row = Math.min(GRID - 1, Math.max(0, Math.floor(ui.cursor / GRID) + step[1]));
        useTumbleUI.setState({ cursor: row * GRID + col });
      } else if (action === 'interact') tapCell(me, ui.cursor);
      else if (action === 'slot1') { buildHere(me); inputs.push(...drainTumbleInput()); }
      else if (action === 'slot2') inputs.push({ type: 'builder' });
      else if (action === 'slot3' && ui.selected !== null && towerAt(me, ui.selected)) { inputs.push({ type: 'sell', cell: ui.selected }); useTumbleUI.setState({ selected: null }); }
      else if (action === 'slot4' && ui.selected !== null) {
        const t = towerAt(me, ui.selected), twin = t && twinsOf(me, t)[0];
        if (twin) inputs.push({ type: 'merge', from: twin.cell, to: ui.selected });
      } else if (action === 'jump') inputs.push({ type: 'ready' });
    }
    return inputs.concat(drainTumbleInput());
  },
  Scene: TumbleScene,
  Hud: TumbleHud,
};
export default game;
