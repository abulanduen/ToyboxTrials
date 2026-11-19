/**
 * Local-only Toy Tower Tumble UI state (never part of the rules): the selected square, the
 * keyboard cursor, an in-progress drag, which board is being watched and which panel is open.
 * Plus the queue of inputs the HUD and the 3D board submit, drained by `readLocalInput`.
 */
import { create } from 'zustand';
import { isBuildable } from './board';
import { MAX_TIER, TOWERS } from './catalogue';
import { towerAt, type TdInput, type TdPlayer } from './rules';

export type TdPanel = 'quests' | 'odds' | 'players' | null;
export interface TumbleUI {
  /** Selected square (a tower or an empty buildable square), or null. */
  selected: number | null;
  /** Keyboard cursor square. */
  cursor: number;
  /** Square of the tower being dragged, and the square under the pointer. */
  dragging: number | null; dragOver: number | null;
  /** Board being watched while knocked out (null = the first one still in). */
  watching: string | null;
  panel: TdPanel;
}
const blank: TumbleUI = { selected: null, cursor: 27, dragging: null, dragOver: null, watching: null, panel: null };
export const useTumbleUI = create<TumbleUI>(() => ({ ...blank }));
export const resetTumbleUI = () => useTumbleUI.setState({ ...blank });

let queue: TdInput[] = [];
export function submitTumbleInput(input: TdInput) { if (queue.length < 64) queue.push(input); }
export function clearTumbleInput() { queue = []; }
export function drainTumbleInput() { const inputs = queue; queue = []; return inputs; }

/** Identical towers can merge (tier 7 is the top). */
export const canMergeCells = (p: TdPlayer, from: number, to: number) => {
  const a = towerAt(p, from), b = towerAt(p, to);
  return !!a && !!b && a !== b && a.def === b.def && TOWERS[a.def].tier < MAX_TIER;
};

/**
 * A tap (or Enter) on a square of your own board. With a tower selected, tapping one of its twins
 * merges them (the new tower lands on the twin you tapped). Otherwise it selects the square, and
 * tapping the selected square again clears the selection. Path squares clear it too.
 */
export function tapCell(p: TdPlayer | undefined, cell: number) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && selected !== cell && canMergeCells(p, selected, cell)) {
    submitTumbleInput({ type: 'merge', from: selected, to: cell });
    useTumbleUI.setState({ selected: cell, cursor: cell });
    return;
  }
  if (selected === cell || !isBuildable(cell)) { useTumbleUI.setState({ selected: null, cursor: isBuildable(cell) ? cell : useTumbleUI.getState().cursor }); return; }
  useTumbleUI.setState({ selected: cell, cursor: cell });
}

/** Build: on the selected empty square if there is one, otherwise on the best free square. */
export function buildHere(p: TdPlayer | undefined) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && isBuildable(selected) && !towerAt(p, selected)) submitTumbleInput({ type: 'build', cell: selected });
  else submitTumbleInput({ type: 'build' });
}
