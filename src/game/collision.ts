/**
 * Planar collision for the hub.
 *
 * World scale: 1 unit = 1 cm. The toy is ~3.5 cm tall; the table top is y = 0.
 *
 * Every solid object is a 2D footprint (circle or rotated box) with a `top` height.
 * - If the player's feet are below `top - STEP_HEIGHT`, the footprint blocks horizontal movement.
 * - Otherwise the footprint is something you can stand on (blocks, books, the fountain rim).
 * This gives satisfying hop-up-onto-things platforming without a physics engine.
 */
export interface CircleCollider {
  kind: 'circle';
  id?: string;
  x: number;
  z: number;
  r: number;
  top: number;
  /** Does it block the camera? (large solid props only) */
  cam?: boolean;
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
}

export type Collider = CircleCollider | BoxCollider;

export const STEP_HEIGHT = 0.45;

/** Playable area on the table top: an axis-aligned rounded rectangle. */
export const PLAY_BOUNDS = { minX: -48, maxX: 46, minZ: -43, maxZ: 33, corner: 8 };

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

/** Highest standable surface under a footprint (at most `feetY + STEP_HEIGHT`). */
export function groundHeightAt(x: number, z: number, r: number, feetY: number): number {
  let g = 0;
  for (const c of allColliders()) {
    if (c.top > g && c.top <= feetY + STEP_HEIGHT && overlaps(c, x, z, r * 0.6)) g = c.top;
  }
  return g;
}

/**
 * Push a circle (player) out of every collider it is not standing above.
 * Mutates and returns pos. Returns the id of the first collider hit (for bump sounds).
 */
export function resolve(pos: { x: number; z: number }, r: number, feetY: number): string | null {
  let hit: string | null = null;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of allColliders()) {
      if (feetY >= c.top - STEP_HEIGHT) continue; // we're above it: it's floor, not wall
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
  clampToBounds(pos, r);
  return hit;
}

/** Keep the player inside the rounded-rectangle play area (the "you can't fall off" rule). */
export function clampToBounds(pos: { x: number; z: number }, r: number) {
  const b = PLAY_BOUNDS;
  const minX = b.minX + r;
  const maxX = b.maxX - r;
  const minZ = b.minZ + r;
  const maxZ = b.maxZ - r;
  pos.x = Math.max(minX, Math.min(maxX, pos.x));
  pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
  // Rounded corners
  const k = b.corner;
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
