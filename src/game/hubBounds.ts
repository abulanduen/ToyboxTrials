/**
 * Where a contender may walk in the hub: a union of rounded rectangles (1 unit = 1 cm, table top
 * y = 0). Pure numbers with no imports, shared by the client (collision.ts) and the online server,
 * which keeps every reported position inside these same rectangles.
 *
 *  - `hub`: the play mat on the spawn table (fountain plaza, Pavilion, Workshop, shop, Scoreboard);
 *  - `gates`: the play mat on the second table, the desk under the window, where the trial gates stand;
 *  - `bridge`: the domino bridge between them, exactly as wide as the walkway between its rails.
 *
 * Nowhere else is walkable: the gap between the two tables and the tables' margins are not.
 */
export interface WalkRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Corner radius (0 = square corners). */
  corner: number;
}

/** The spawn table's play mat. */
export const HUB_WALK: WalkRect = { id: 'hub', minX: -68, maxX: 68, minZ: -46, maxZ: 36, corner: 8 };
/** The gates table's play mat. */
export const GATES_WALK: WalkRect = { id: 'gates', minX: -68, maxX: 122, minZ: -164, maxZ: -94, corner: 8 };

/**
 * The domino bridge: a walkway along x = BRIDGE_X from the spawn table's north edge to the gates
 * table's south edge (ramps included). `halfW` is the inner half-width between the ruler rails.
 * It overlaps both play mats a little so the hand-over is seamless.
 */
export const BRIDGE_X = 24;
export const BRIDGE_HALF_W = 3.5;
export const BRIDGE_WALK: WalkRect = { id: 'bridge', minX: BRIDGE_X - BRIDGE_HALF_W, maxX: BRIDGE_X + BRIDGE_HALF_W, minZ: -104, maxZ: -42, corner: 0 };

export const WALK_AREAS: readonly WalkRect[] = [HUB_WALK, BRIDGE_WALK, GATES_WALK];

/** Clamp a point (circle of radius r) into one rounded rectangle, in place. */
function clampToRect(pos: { x: number; z: number }, b: WalkRect, r: number) {
  const minX = b.minX + r;
  const maxX = b.maxX - r;
  const minZ = b.minZ + r;
  const maxZ = b.maxZ - r;
  pos.x = Math.max(minX, Math.min(maxX, pos.x));
  pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
  const k = Math.min(b.corner, (maxX - minX) / 2, (maxZ - minZ) / 2);
  if (k <= 0) return;
  const ccx = pos.x < minX + k ? minX + k : pos.x > maxX - k ? maxX - k : null;
  const ccz = pos.z < minZ + k ? minZ + k : pos.z > maxZ - k ? maxZ - k : null;
  if (ccx !== null && ccz !== null) {
    const dx = pos.x - ccx;
    const dz = pos.z - ccz;
    const d = Math.hypot(dx, dz);
    if (d > k) {
      pos.x = ccx + (dx / d) * k;
      pos.z = ccz + (dz / d) * k;
    }
  }
}

const tmp = { x: 0, z: 0 };
/**
 * Keep a circle of radius r inside the walkable union (the "you can't fall off" rule): a point
 * inside any rectangle stays put; otherwise it moves to the nearest point of the nearest one.
 * Mutates and returns pos.
 */
export function clampToWalkable<T extends { x: number; z: number }>(pos: T, r: number, areas: readonly WalkRect[] = WALK_AREAS): T {
  let bestX = pos.x;
  let bestZ = pos.z;
  let bestD = Infinity;
  for (const a of areas) {
    tmp.x = pos.x;
    tmp.z = pos.z;
    clampToRect(tmp, a, r);
    const d = (tmp.x - pos.x) ** 2 + (tmp.z - pos.z) ** 2;
    if (d === 0) return pos;
    if (d < bestD) {
      bestD = d;
      bestX = tmp.x;
      bestZ = tmp.z;
    }
  }
  pos.x = bestX;
  pos.z = bestZ;
  return pos;
}

/** Is a circle of radius r at (x, z) wholly on walkable ground? */
export function isWalkable(x: number, z: number, r: number, areas: readonly WalkRect[] = WALK_AREAS) {
  const p = { x, z };
  clampToWalkable(p, r, areas);
  return Math.hypot(p.x - x, p.z - z) < 1e-9;
}
