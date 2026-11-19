/** Board units (one per square) to world centimetres, for the render layer. */
import { GRID } from './board';

/** One board square is 3.5 cm, like Toy Squad's. */
export const CELL = 3.5;
/** Board coordinate (column or row, cell centres are integers) to world x or z. */
export const bw = (v: number) => (v - (GRID - 1) / 2) * CELL;
/** World x/z to the board coordinate. */
export const wb = (w: number) => w / CELL + (GRID - 1) / 2;
/** The square under a world point, or null off the board. */
export function worldCell(x: number, z: number): number | null {
  const col = Math.round(wb(x)), row = Math.round(wb(z));
  return col >= 0 && col < GRID && row >= 0 && row < GRID ? row * GRID + col : null;
}
/** The open-book bridge the path crosses (row 5, columns 3–4): enemies ride up onto it. */
export const BRIDGE = { row: 5, from: 2.6, to: 4.4, height: 0.42 };
export const groundY = (x: number, z: number) => (Math.abs(z - BRIDGE.row) < 0.5 && x > BRIDGE.from && x < BRIDGE.to ? BRIDGE.height * Math.min(1, (x - BRIDGE.from) * 3, (BRIDGE.to - x) * 3) : 0);
