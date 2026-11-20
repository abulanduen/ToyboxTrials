/**
 * Local-only Toy Tower Tumble UI state (never part of the rules): the selected square, the
 * keyboard cursor, an in-progress drag, which board is being watched and which panel is open.
 * Plus the queue of inputs the HUD and the 3D board submit, drained by `readLocalInput`.
 */
import { create } from 'zustand';
import { isBuildable } from './board';
import { canMergeTowers, towerAt, type TdInput, type TdPlayer } from './rules';

export type TdPanel = 'quests' | 'odds' | 'board' | null;
export interface TumbleUI {
  /**
   * Selected square (a tower or an empty buildable square), or null. On a board you are only
   * looking at (someone else's from the player rail, or yours once out) it is a tower being inspected.
   */
  selected: number | null;
  /**
   * Touch: the tower that was selected before a same-tier tower was tapped (or dragged onto). Its
   * Merge button comes first in the sheet: on touch a tap never merges, only that button does.
   */
  pair: number | null;
  /** Mouse: the tower under the pointer on the viewed board (a floating tip), or null. */
  hover: number | null;
  /** Keyboard cursor square. */
  cursor: number;
  /** Square of the tower being dragged, and the square under the pointer. */
  dragging: number | null; dragOver: number | null;
  /** Board being viewed from the player rail (null = your own). Read-only. */
  watching: string | null;
  panel: TdPanel;
  /** The knocked-out popup: 'open' after you are knocked out, until you watch or dismiss it. */
  offer: 'none' | 'open' | 'closed';
}
const blank: TumbleUI = { selected: null, pair: null, hover: null, cursor: 27, dragging: null, dragOver: null, watching: null, panel: null, offer: 'none' };
export const useTumbleUI = create<TumbleUI>(() => ({ ...blank }));
export const resetTumbleUI = () => useTumbleUI.setState({ ...blank });

let queue: TdInput[] = [];
export function submitTumbleInput(input: TdInput) { if (queue.length < 64) queue.push(input); }
export function clearTumbleInput() { queue = []; }
export function drainTumbleInput() { const inputs = queue; queue = []; return inputs; }

/** Same-tier towers can merge (tier 7 is the top). */
export const canMergeCells = (p: TdPlayer, from: number, to: number) => {
  const a = towerAt(p, from), b = towerAt(p, to);
  return canMergeTowers(a, b);
};

/**
 * A tap (or Enter) on a square of your own board. With a tower selected, tapping a same-tier partner
 * merges them with a mouse or keyboard (the new tower lands on the twin you tapped). On touch
 * (`touch`, from the shared touch setting) a tap never merges: it selects the tapped tower and keeps
 * the previous one as its `pair`, whose Merge button the sheet shows first. Otherwise it selects the
 * square, and tapping the selected square again clears the selection. Path squares clear it too.
 */
export function tapCell(p: TdPlayer | undefined, cell: number, touch = false) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && selected !== cell && canMergeCells(p, selected, cell)) {
    if (touch) { useTumbleUI.setState({ selected: cell, cursor: cell, pair: selected }); return; }
    submitTumbleInput({ type: 'merge', from: selected, to: cell });
    useTumbleUI.setState({ selected: cell, cursor: cell, pair: null });
    return;
  }
  if (selected === cell || !isBuildable(cell)) { useTumbleUI.setState({ selected: null, pair: null, cursor: isBuildable(cell) ? cell : useTumbleUI.getState().cursor }); return; }
  useTumbleUI.setState({ selected: cell, cursor: cell, pair: null });
}

/** A tap on a board you are only looking at: inspect a tower there (read-only), or clear. */
export function inspectCell(p: TdPlayer | undefined, cell: number | null) {
  const { selected } = useTumbleUI.getState();
  useTumbleUI.setState({ selected: p && cell !== null && cell !== selected && towerAt(p, cell) ? cell : null, pair: null });
}

/** Build: on the selected empty square if there is one, otherwise on the best free square. */
export function buildHere(p: TdPlayer | undefined) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && isBuildable(selected) && !towerAt(p, selected)) submitTumbleInput({ type: 'build', cell: selected });
  else submitTumbleInput({ type: 'build' });
}
