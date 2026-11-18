import { BOARD_SIZE } from './rules';
export const CELL_SIZE = 3.5;
export const boardToWorld = (value: number) => (value - (BOARD_SIZE - 1) / 2) * CELL_SIZE;
/** Only the near four rows are legal. Never clamp an invalid drop onto the board. */
export function worldToDeployment(x: number, z: number): number | null {
  const col = Math.floor(x / CELL_SIZE + BOARD_SIZE / 2);
  const row = Math.floor(z / CELL_SIZE + BOARD_SIZE / 2);
  return col >= 0 && col < BOARD_SIZE && row >= 4 && row < BOARD_SIZE ? (row - 4) * BOARD_SIZE + col : null;
}
