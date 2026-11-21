/**
 * Local-only Toy Tower Tumble UI state (never part of the rules): the selected square, the
 * keyboard cursor, an in-progress drag, a merge waiting for its Merge / Swap answer, which board
 * is being watched and which panel is open. Plus the queue of inputs the HUD and the 3D board
 * submit, drained by `readLocalInput`.
 */
import { create } from 'zustand';
import { isBuildable } from './board';
import { canMergeTowers, towerAt, type TdInput, type TdPlayer } from './rules';

export type TdPanel = 'quests' | 'odds' | 'board' | null;
/** A tower dropped (or tapped) onto a same-tier tower: `from` would merge into `to` (where the new tower lands), or swap with it. */
export interface MergeChoice { from: number; to: number }
export interface TumbleUI {
  /**
   * Selected square (a tower or an empty buildable square), or null. On a board you are only
   * looking at (someone else's from the player rail, or yours once out) it is a tower being inspected.
   */
  selected: number | null;
  /**
   * The Merge / Swap popup (mouse, keyboard and touch alike): a tower was dropped on, or tapped
   * after selecting, a same-tier tower. Nothing changes on the board until Merge or Swap is chosen.
   */
  confirm: MergeChoice | null;
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
  /**
   * Phones: the tower sheet shows its full details (true) or a compact summary (false, the default).
   * Kept for the whole page session: a match reset leaves it alone. Desktop always shows the full sheet.
   */
  sheetFull: boolean;
}
const blank: Omit<TumbleUI, 'sheetFull'> = { selected: null, confirm: null, hover: null, cursor: 27, dragging: null, dragOver: null, watching: null, panel: null, offer: 'none' };
export const useTumbleUI = create<TumbleUI>(() => ({ ...blank, sheetFull: false }));
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

/** The open Merge / Swap choice, if it still applies to this board (both towers there, still a pair). */
export function liveChoice(p: TdPlayer | undefined): MergeChoice | null {
  const c = useTumbleUI.getState().confirm;
  return c && p && !p.out && canMergeCells(p, c.from, c.to) ? c : null;
}

/** Ask Merge or Swap for `from` onto `to` (the source stays selected; the popup sits at `to`). */
export function askMerge(from: number, to: number) {
  useTumbleUI.setState({ confirm: { from, to }, selected: from, cursor: to, hover: null });
}

/**
 * Answer the Merge / Swap popup: the input to send (merge lands the new tower on `to`; swap trades
 * the two squares), or null if there is no live choice. The tower that ends up on `to` is selected.
 */
export function chooseMerge(p: TdPlayer | undefined, how: 'merge' | 'swap'): TdInput | null {
  const c = liveChoice(p);
  if (!c) { if (useTumbleUI.getState().confirm) useTumbleUI.setState({ confirm: null }); return null; }
  useTumbleUI.setState({ confirm: null, selected: c.to, cursor: c.to });
  return how === 'merge' ? { type: 'merge', from: c.from, to: c.to } : { type: 'move', from: c.from, to: c.to };
}

/** Close the popup without changing anything (×, Esc or a tap elsewhere): the selection clears too. */
export function cancelMerge() { useTumbleUI.setState({ confirm: null, selected: null }); }

/**
 * A tap (or Enter) on a square of your own board. With a tower selected, tapping a same-tier partner
 * opens the Merge / Swap popup at the partner (where a merged tower would land); nothing merges until
 * Merge is chosen. Otherwise it selects the square, and tapping the selected square again clears the
 * selection. Path squares clear it too.
 */
export function tapCell(p: TdPlayer | undefined, cell: number) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && selected !== cell && canMergeCells(p, selected, cell)) { askMerge(selected, cell); return; }
  if (selected === cell || !isBuildable(cell)) { useTumbleUI.setState({ selected: null, confirm: null, cursor: isBuildable(cell) ? cell : useTumbleUI.getState().cursor }); return; }
  useTumbleUI.setState({ selected: cell, cursor: cell, confirm: null });
}

/**
 * A dragged tower let go over `to`: onto a same-tier tower it asks Merge or Swap; onto any other
 * tower or an empty felt square it moves there at once (swapping with a tower there). Off the felt,
 * or back on its own square, nothing happens.
 */
export function dropTower(p: TdPlayer | undefined, from: number, to: number | null) {
  if (!p || p.out || to === null || to === from) return;
  if (canMergeCells(p, from, to)) { askMerge(from, to); return; }
  if (isBuildable(to)) { submitTumbleInput({ type: 'move', from, to }); useTumbleUI.setState({ selected: to, cursor: to, confirm: null }); }
}

/** A tap on a board you are only looking at: inspect a tower there (read-only), or clear. */
export function inspectCell(p: TdPlayer | undefined, cell: number | null) {
  const { selected } = useTumbleUI.getState();
  useTumbleUI.setState({ selected: p && cell !== null && cell !== selected && towerAt(p, cell) ? cell : null, confirm: null });
}

/** Build: on the selected empty square if there is one, otherwise on the best free square. */
export function buildHere(p: TdPlayer | undefined) {
  if (!p || p.out) return;
  const { selected } = useTumbleUI.getState();
  if (selected !== null && isBuildable(selected) && !towerAt(p, selected)) submitTumbleInput({ type: 'build', cell: selected });
  else submitTumbleInput({ type: 'build' });
}
