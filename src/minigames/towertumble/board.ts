/**
 * Toy Tower Tumble board geometry. Pure data and maths: no DOM, no three.js.
 *
 * Every player has the same 8×8 board. Cells are indexed `row * 8 + col`; in board units a cell
 * centre is (col, row), so x runs left → right and z runs far (row 0) → near (row 7).
 *
 *        0 1 2 3 4 5 6 7
 *   r0   . . . . . . . .
 *   r1 → P P P P P P P .      enemies enter from the toy box on the left of row 1,
 *   r2   . . . . . . P .
 *   r3   . P P P P P P .      zig-zag down the board,
 *   r4   . P . . . . . .
 *   r5   . P P P P P P .
 *   r6   . . . . . . P .
 *   r7   . . . . . . P .  ↓   and leave past the bottom of column 6 (your toy chest).
 *
 * 23 path cells, 41 buildable cells. Flying enemies ignore the path and glide straight from the
 * entry to the exit (`FLIGHT`).
 */
export const GRID = 8;
export const CELLS = GRID * GRID;
export const cellIndex = (col: number, row: number) => row * GRID + col;
export const cellCol = (cell: number) => cell % GRID;
export const cellRow = (cell: number) => Math.floor(cell / GRID);
export const inGrid = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < CELLS;

/** Path corners in board units, entry first. Enemies walk the straight segments between them. */
export const ROUTE: readonly (readonly [number, number])[] = [[-1, 1], [6, 1], [6, 3], [1, 3], [1, 5], [6, 5], [6, 8]];
/** Flyers: one straight glide from the entry to the exit. */
export const FLIGHT: readonly (readonly [number, number])[] = [[-1, 1], [6, 8]];

export interface Polyline { pts: readonly (readonly [number, number])[]; cum: number[]; length: number }
const polyline = (pts: readonly (readonly [number, number])[]): Polyline => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
};
export const WALK = polyline(ROUTE);
export const GLIDE = polyline(FLIGHT);

/** Position at `dist` along a route, written into `out` (no allocation). */
export function pointAt(line: Polyline, dist: number, out: { x: number; z: number }) {
  const d = Math.max(0, Math.min(line.length, dist));
  let i = 1;
  while (i < line.cum.length - 1 && line.cum[i] < d) i++;
  const a = line.pts[i - 1], b = line.pts[i], seg = line.cum[i] - line.cum[i - 1] || 1, k = (d - line.cum[i - 1]) / seg;
  out.x = a[0] + (b[0] - a[0]) * k; out.z = a[1] + (b[1] - a[1]) * k;
  return out;
}

/** Every path cell, in walking order. */
export const PATH_CELLS: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, az] = ROUTE[i - 1], [bx, bz] = ROUTE[i];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let s = 0; s <= steps; s++) {
      const x = ax + Math.sign(bx - ax) * s, z = az + Math.sign(bz - az) * s;
      if (x >= 0 && x < GRID && z >= 0 && z < GRID && !out.includes(cellIndex(x, z))) out.push(cellIndex(x, z));
    }
  }
  return out;
})();
const pathSet = new Set(PATH_CELLS);
export const isPath = (cell: number) => pathSet.has(cell);
export const BUILDABLE: readonly number[] = Array.from({ length: CELLS }, (_, i) => i).filter((c) => !pathSet.has(c));
export const isBuildable = (cell: number) => inGrid(cell) && !pathSet.has(cell);

/** How many path cells a tower on `cell` reaches with `range` (board units, centre to centre). */
export function coverage(cell: number, range: number): number {
  const x = cellCol(cell), z = cellRow(cell);
  let n = 0;
  for (const p of PATH_CELLS) if ((cellCol(p) - x) ** 2 + (cellRow(p) - z) ** 2 <= range * range) n++;
  return n;
}
/** Auto-placement order for Build without a chosen square: most path in reach first, then reading order. */
export const BUILD_ORDER: readonly number[] = BUILDABLE.slice().sort((a, b) => coverage(b, 2.3) - coverage(a, 2.3) || a - b);

/** Board-unit distance squared between a cell centre and a point. */
export const dist2 = (cell: number, x: number, z: number) => (cellCol(cell) - x) ** 2 + (cellRow(cell) - z) ** 2;

/** Short human name for a square, e.g. "C4" (column letter, row number from the far edge). */
export const cellName = (cell: number) => `${String.fromCharCode(65 + cellCol(cell))}${cellRow(cell) + 1}`;
