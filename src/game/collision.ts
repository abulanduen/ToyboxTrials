/**
 * Planar collision for the hub.
 *
 * World scale: 1 unit = 1 cm. The toy is ~3.5 cm tall; the table top is y = 0.
 *
 * Every solid object is a 2D footprint (circle or rotated box) with a `top` height.
 * - If the player's feet are below `top - STEP_HEIGHT`, the footprint blocks horizontal movement.
 * - Otherwise the footprint is something you can stand on (blocks, books, the fountain rim).
 * This gives satisfying hop-up-onto-things platforming without a physics engine.
 *
 * Levels (hubBounds.ts): every collider belongs to one (`lv`, the tables when absent), and every
 * query asks about one: a toy in the arcade under the spawn table neither bumps into nor stands on
 * the props above its head. `top` is a world height either way (the floor's props have tops below 0).
 */
import { HUB_WALK, LEVEL_WALK, LEVEL_Y, ARCADE_CEILING, clampToWalkable, type HubLevel } from './hubBounds';

export interface CircleCollider {
  kind: 'circle';
  id?: string;
  x: number;
  z: number;
  r: number;
  top: number;
  /** Does it block the camera? (large solid props only) */
  cam?: boolean;
  /** The level it stands on (default: the tables). */
  lv?: HubLevel;
}

export interface BoxCollider {
  kind: 'box';
  id?: string;
  x: number;
  z: number;
  hx: number; // half extents
  hz: number;
  rot: number; // radians around Y (same convention as three.js rotation.y)
  top: number;
  cam?: boolean;
  lv?: HubLevel;
}

export type Collider = CircleCollider | BoxCollider;

export const STEP_HEIGHT = 0.45;

/**
 * The spawn table's play mat (an axis-aligned rounded rectangle). The whole walkable hub is a union
 * of rectangles: this mat, the domino bridge and the gates table (hubBounds.ts WALK_AREAS).
 */
export const PLAY_BOUNDS = HUB_WALK;

const staticColliders: Collider[] = [];
const dynamicColliders: Collider[] = [];

export function addStatic(...c: Collider[]) {
  staticColliders.push(...c);
}
export function resetStatic() {
  staticColliders.length = 0;
}
/** Dynamic colliders (e.g. the toy train) are re-registered by their owners each frame. */
export function setDynamic(owner: string, list: Collider[]) {
  for (let i = dynamicColliders.length - 1; i >= 0; i--) {
    if (dynamicColliders[i].id?.startsWith(owner + ':')) dynamicColliders.splice(i, 1);
  }
  dynamicColliders.push(...list);
}
export function allColliders(): readonly Collider[] {
  return dynamicColliders.length ? staticColliders.concat(dynamicColliders) : staticColliders;
}
const onLevel = (c: Collider, level: HubLevel) => (c.lv ?? 'table') === level;

// Rotation convention matches three.js `rotation.y`: local +x maps to (cos r, -sin r) in world xz.
function toLocal(c: BoxCollider, px: number, pz: number): [number, number] {
  const dx = px - c.x;
  const dz = pz - c.z;
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}
function toWorldDir(c: BoxCollider, lx: number, lz: number): [number, number] {
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  return [lx * cos + lz * sin, -lx * sin + lz * cos];
}

/** Is the point (with radius r) overlapping the footprint? */
export function overlaps(c: Collider, x: number, z: number, r: number): boolean {
  if (c.kind === 'circle') {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + r;
    return dx * dx + dz * dz < rr * rr;
  }
  const [lx, lz] = toLocal(c, x, z);
  const cx = Math.max(-c.hx, Math.min(c.hx, lx));
  const cz = Math.max(-c.hz, Math.min(c.hz, lz));
  const dx = lx - cx;
  const dz = lz - cz;
  return dx * dx + dz * dz < r * r;
}

/** Highest standable surface under a footprint on `level` (its ground, or a prop at most `feetY + STEP_HEIGHT`). */
export function groundHeightAt(x: number, z: number, r: number, feetY: number, level: HubLevel = 'table'): number {
  let g = LEVEL_Y[level];
  for (const c of allColliders()) {
    if (c.top > g && c.top <= feetY + STEP_HEIGHT && onLevel(c, level) && overlaps(c, x, z, r * 0.6)) g = c.top;
  }
  return g;
}

/** How high above the table top the camera stays, and above anything low it is over. */
export const CAMERA_CLEARANCE = 0.8;
/** Colliders up to this height lift the camera over them (bridge deck, ramps, books, the block
 *  tower, passing train cars). Taller ones (buildings) stop the camera through camBlock instead. */
const CAMERA_LOW_PROP = 6;
/**
 * Lowest height the hub camera may sit at (x, z). Without this the camera only stayed 0.8 cm above
 * the table top and dipped inside raised props (the bridge deck, a passing train car), where the
 * unlit inside faces showed as black flashes.
 */
export function cameraFloorAt(x: number, z: number, level: HubLevel = 'table'): number {
  const base = LEVEL_Y[level];
  let floor = base + CAMERA_CLEARANCE;
  for (const c of allColliders()) {
    if (c.top <= base + CAMERA_LOW_PROP && c.top + CAMERA_CLEARANCE > floor && onLevel(c, level) && overlaps(c, x, z, 0.7)) floor = c.top + CAMERA_CLEARANCE;
  }
  return floor;
}

/**
 * Highest the camera may go on `level`: in the arcade, just under the spawn table's apron, so it
 * never pokes up through the table into the village. (On the tables there is no ceiling.)
 */
export function cameraCeiling(level: HubLevel): number {
  return level === 'floor' ? ARCADE_CEILING - CAMERA_CLEARANCE : Infinity;
}

/**
 * Push a circle (player) out of every collider it is not standing above.
 * Mutates and returns pos. Returns the id of the first collider hit (for bump sounds).
 */
export function resolve(pos: { x: number; z: number }, r: number, feetY: number, level: HubLevel = 'table'): string | null {
  let hit: string | null = null;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of allColliders()) {
      if (feetY >= c.top - STEP_HEIGHT || !onLevel(c, level)) continue; // we're above it (it's floor, not wall), or it's on another level
      if (c.kind === 'circle') {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d < min) {
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          pos.x = c.x + nx * min;
          pos.z = c.z + nz * min;
          moved = true;
          hit ??= c.id ?? 'solid';
        }
      } else {
        const [lx, lz] = toLocal(c, pos.x, pos.z);
        const cx = Math.max(-c.hx, Math.min(c.hx, lx));
        const cz = Math.max(-c.hz, Math.min(c.hz, lz));
        let dx = lx - cx;
        let dz = lz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let pushX: number;
        let pushZ: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          pushX = cx + dx * r - lx;
          pushZ = cz + dz * r - lz;
        } else {
          // Centre is inside the box: leave along the shallowest axis.
          const px = c.hx - Math.abs(lx) + r;
          const pz = c.hz - Math.abs(lz) + r;
          if (px < pz) {
            pushX = Math.sign(lx || 1) * px;
            pushZ = 0;
          } else {
            pushX = 0;
            pushZ = Math.sign(lz || 1) * pz;
          }
        }
        const [wx, wz] = toWorldDir(c, pushX, pushZ);
        pos.x += wx;
        pos.z += wz;
        moved = true;
        hit ??= c.id ?? 'solid';
      }
    }
    if (!moved) break;
  }
  clampToBounds(pos, r, level);
  return hit;
}

/**
 * Keep the player on walkable ground (the "you can't fall off" rule): on the tables, inside the
 * union of the two play mats and the bridge between them; in the arcade, inside its floor
 * (hubBounds.ts LEVEL_WALK). The online server uses the same function.
 */
export function clampToBounds(pos: { x: number; z: number }, r: number, level: HubLevel = 'table') {
  clampToWalkable(pos, r, LEVEL_WALK[level]);
}
