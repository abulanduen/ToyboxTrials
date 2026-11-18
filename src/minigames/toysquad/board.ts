import { BOARD_SIZE } from './rules';
export const CELL_SIZE = 3.5;
export const boardToWorld = (value: number) => (value - (BOARD_SIZE - 1) / 2) * CELL_SIZE;
export const reservePosition = (cell: number) => ({ x: -cell - 1, z: 8.65 });
export const placementPosition = (cell: number) => cell < 0 ? reservePosition(cell) : { x: cell % 8, z: 4 + Math.floor(cell / 8) };
/**
 * Keyboard placement: the cell one step from `cell` (dx: −1 left / +1 right, dz: −1 towards the enemy / +1 towards the player).
 * Stepping back off the board's near row lands on the reserve slot below it, and forward from a reserve returns to that row.
 */
export function stepCell(cell: number, dx: number, dz: number): number | null {
  const reserve = cell < 0, col = (reserve ? -cell - 1 : cell % BOARD_SIZE) + dx, row = (reserve ? 4 : Math.floor(cell / BOARD_SIZE)) + dz;
  if (col < 0 || col >= BOARD_SIZE || row < 0 || row > 4) return null;
  return row === 4 ? -col - 1 : row * BOARD_SIZE + col;
}
/** Only the near four rows are legal. Never clamp an invalid drop onto the board. */
export function worldToDeployment(x: number, z: number): number | null {
  const col = Math.floor(x / CELL_SIZE + BOARD_SIZE / 2);
  const row = Math.floor(z / CELL_SIZE + BOARD_SIZE / 2);
  if (col >= 0 && col < BOARD_SIZE && Math.abs(z - boardToWorld(8.65)) <= CELL_SIZE / 2) return -col - 1;
  return col >= 0 && col < BOARD_SIZE && row >= 4 && row < BOARD_SIZE ? (row - 4) * BOARD_SIZE + col : null;
}
