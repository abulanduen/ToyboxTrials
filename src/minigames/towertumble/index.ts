import { HUB_BINDINGS, type Action } from '../../game/input';
import { getMatchState, useMatch } from '../session';
import type { MinigameModule } from '../types';
import { GRID } from './board';
import { tumbleRules, towerAt, viewedBoard, type TdInput, type TdState } from './rules';
import { createTumbleBot } from './bot';
import { buildHere, chooseMerge, drainTumbleInput, liveChoice, tapCell, useTumbleUI } from './local';
import { TumbleScene } from './Scene';
import { TumbleHud } from './Hud';

const STEPS: Partial<Record<Action, [number, number]>> = { forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
const game: MinigameModule<TdState, TdInput> = {
  rules: tumbleRules,
  createBot: createTumbleBot,
  // Arrows / WASD move the square cursor, E or Enter selects (on a same-tier partner: the Merge / Swap popup, answered with M or S);
  // B builds, U levels the builder, Q (or Delete) sells, M merges any same-tier pair, N or Space starts the next wave.
  bindings: { ...HUB_BINDINGS, jump: ['Space', 'KeyN'], run: [], interact: ['KeyE', 'Enter'], slot1: ['KeyB'], slot2: ['KeyU'], slot3: ['KeyQ', 'Delete'], slot4: ['KeyM'] },
  readLocalInput(presses) {
    const inputs = drainTumbleInput();
    const s = getMatchState() as TdState | null, me = s?.kind === 'tower-tumble' ? s.players.find((p) => p.id === useMatch.getState().localId) : undefined;
    if (!me || me.out) return inputs;
    // Looking at someone else's board is read-only: no shortcut acts until you are back on yours.
    if (viewedBoard(s!, me.id, useTumbleUI.getState().watching) !== me.id) return inputs;
    for (const action of presses) {
      const ui = useTumbleUI.getState(), step = STEPS[action];
      // The Merge / Swap popup is open: the HUD answers M, S and Esc (before they reach here); the cursor and Enter wait.
      if (liveChoice(me)) {
        if (action === 'slot4') { const pick = chooseMerge(me, 'merge'); if (pick) inputs.push(pick); }
        else if (action === 'jump') inputs.push({ type: 'ready' });
        else if (action === 'slot2') inputs.push({ type: 'builder' });
        continue;
      }
      if (step) {
        const col = Math.min(GRID - 1, Math.max(0, (ui.cursor % GRID) + step[0])), row = Math.min(GRID - 1, Math.max(0, Math.floor(ui.cursor / GRID) + step[1]));
        useTumbleUI.setState({ cursor: row * GRID + col });
      } else if (action === 'interact') tapCell(me, ui.cursor);
      else if (action === 'slot1') { buildHere(me); inputs.push(...drainTumbleInput()); }
      else if (action === 'slot2') inputs.push({ type: 'builder' });
      else if (action === 'slot3' && ui.selected !== null && towerAt(me, ui.selected)) { inputs.push({ type: 'sell', cell: ui.selected }); useTumbleUI.setState({ selected: null }); }
      else if (action === 'slot4') inputs.push({ type: 'auto-merge', preferredCell: ui.selected ?? undefined });
      else if (action === 'jump') inputs.push({ type: 'ready' });
    }
    return inputs.concat(drainTumbleInput());
  },
  Scene: TumbleScene,
  Hud: TumbleHud,
};
export default game;
