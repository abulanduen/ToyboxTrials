import { HUB_BINDINGS, type Action } from '../../game/input';
import type { MinigameModule } from '../types';
import { squadRules, type SquadInput, type SquadState } from './rules';
import { createSquadBot } from './bot';
import { drainSquadInput, getLocalPlayer, useSquadUI } from './local';
import { stepCell } from './board';
import { SquadScene } from './Scene';
import { SquadHud } from './Hud';

const STEPS: Partial<Record<Action, [number, number]>> = { forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
const game: MinigameModule<SquadState, SquadInput> = {
  rules: squadRules, createBot: createSquadBot,
  // Q sell, R reroll, E ready; F picks the next toy and the arrow keys / WASD move the picked toy one square.
  bindings: { ...HUB_BINDINGS, jump: [], run: [], interact: ['KeyF'], slot1: ['KeyQ'], slot2: ['KeyR'], slot3: ['KeyE'] },
  readLocalInput(presses) {
    const inputs = drainSquadInput(), me = getLocalPlayer();
    // A pending passive choice comes first: nothing else is accepted until it is made.
    if (me?.passiveOffers.length) return inputs.filter(i => i.type === 'passive');
    for (const action of presses) {
      const ui = useSquadUI.getState(), unit = ui.hovered ?? ui.selected, step = ui.watching ? undefined : STEPS[action];
      if (action === 'slot1' && unit !== null) inputs.push({ type: 'sell', unit });
      if (action === 'slot2') inputs.push({ type: 'reroll' });
      if (action === 'slot3') inputs.push({ type: 'ready' });
      if (action === 'interact' && !ui.watching && me?.units.length) {
        // Board first (front row to back), then reserves, so F walks the squad in reading order.
        const order = me.units.slice().sort((a, b) => (a.cell < 0 ? 100 - a.cell : a.cell) - (b.cell < 0 ? 100 - b.cell : b.cell));
        const next = order[(order.findIndex(u => u.id === ui.selected) + 1) % order.length];
        useSquadUI.setState({ selected: next.id, hovered: null, shopSlot: null });
      }
      if (step && ui.selected !== null) {
        const from = me?.units.find(u => u.id === ui.selected), cell = from ? stepCell(from.cell, step[0], step[1]) : null;
        if (cell !== null) inputs.push({ type: 'move', unit: ui.selected, cell });
      }
    }
    return inputs;
  },
  Scene: SquadScene, Hud: SquadHud,
};
export default game;
