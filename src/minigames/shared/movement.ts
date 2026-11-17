/**
 * Shared movement core for movement minigames (Red Light Green Light, Wind-Up Dash, …).
 *
 * Pure and deterministic: no DOM, no three.js, no timers, no globals. The same code can run on a
 * future authoritative game server. A rules core owns one `Mover` per contestant and calls
 * `stepMover` once per fixed step with that contestant's latest `MoveInput`.
 *
 * The tuning matches the hub toy (src/character/PlayerController.tsx): walk 9 cm/s, run 14 cm/s,
 * snappy acceleration, a slightly softer brake, weak air control, the same jump and gravity.
 * Collision follows src/game/collision.ts: every solid is a 2D footprint (circle or rotated box)
 * with a `top`. Below `top - STEP_HEIGHT` it is a wall; otherwise it is something to stand on.
 *
 * Axes: `ax` is world +x (screen right), `ay` is "forward", which is world −z (away from the
 * camera), exactly like the hub with the camera behind the toy.
 */
import { STEP_HEIGHT, overlaps, type BoxCollider, type Collider } from '../../game/collision';

export type Solid = Collider;

export interface MoveInput {
  /** Right (+) / left (−), −1..1. */
  ax: number;
  /** Forward (+) / back (−), −1..1. */
  ay: number;
  run: boolean;
  /** Edge-triggered: true on the step the jump was pressed. */
  jump: boolean;
}

export const NO_INPUT: MoveInput = { ax: 0, ay: 0, run: false, jump: false };

export interface Mover {
  x: number;
  z: number;
  /** Feet height above the table (cm). */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** Facing, three.js `rotation.y` convention (0 faces +z, π faces −z). */
  yaw: number;
  grounded: boolean;
}

export interface MoveTuning {
  radius: number;
  walk: number;
  run: number;
  /** Ground acceleration while steering (cm/s²). */
  accel: number;
  /** Ground deceleration with no input (cm/s²). */
  brake: number;
  airAccel: number;
  jumpV: number;
  gravity: number;
  /** rad/s. */
  turnRate: number;
}

/** The hub toy's feel. */
export const TOY_TUNING: MoveTuning = { radius: 0.85, walk: 9, run: 14, accel: 70, brake: 55, airAccel: 22, jumpV: 16.5, gravity: 56, turnRate: 13 };

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MoveWorld {
  solids: readonly Solid[];
  /** Axis-aligned play area; the toy's edge stays inside it. */
  bounds?: Bounds;
}

export interface StepReport {
  /** Id of the first wall touched this step, if any. */
  hit: string | null;
  jumped: boolean;
  /** Landing impact (0 = didn't land this step). */
  landed: number;
}

export function createMover(x: number, z: number, yaw = Math.PI): Mover {
  return { x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw, grounded: true };
}

export const moverSpeed = (m: Mover) => Math.hypot(m.vx, m.vz);

const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Clamp anything that arrives over the wire into a legal input (magnitude ≤ 1, no NaN). */
export function sanitizeInput(i: Partial<MoveInput> | undefined | null): MoveInput {
  let ax = finite(i?.ax);
  let ay = finite(i?.ay);
  const m = Math.hypot(ax, ay);
  if (m > 1) {
    ax /= m;
    ay /= m;
  }
  return { ax, ay, run: !!i?.run, jump: !!i?.jump };
}

/**
 * Inputs are sampled per rendered frame but consumed per fixed step, so a step may get several
 * inputs or none. Hold the newest axis; a jump pressed in any of them counts once.
 */
export function latchInput(prev: MoveInput, incoming: readonly Partial<MoveInput>[] | undefined): MoveInput {
  if (!incoming || incoming.length === 0) return prev.jump ? { ...prev, jump: false } : prev;
  const last = sanitizeInput(incoming[incoming.length - 1]);
  last.jump = incoming.some((i) => !!i?.jump);
  return last;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Rotation convention matches three.js `rotation.y` (see src/game/collision.ts).
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

/** Highest standable surface under a footprint (at most `feetY + STEP_HEIGHT`). */
export function groundAt(solids: readonly Solid[], x: number, z: number, r: number, feetY: number): number {
  let g = 0;
  for (const c of solids) {
    if (c.top > g && c.top <= feetY + STEP_HEIGHT && overlaps(c, x, z, r * 0.6)) g = c.top;
  }
  return g;
}

/** Push a circle out of every solid it isn't standing above. Returns the first solid hit. */
export function resolveSolids(pos: { x: number; z: number }, r: number, feetY: number, solids: readonly Solid[]): string | null {
  let hit: string | null = null;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of solids) {
      if (feetY >= c.top - STEP_HEIGHT) continue; // above it: floor, not wall
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
  return hit;
}

export function clampToBounds(pos: { x: number; z: number }, r: number, b: Bounds) {
  pos.x = Math.max(b.minX + r, Math.min(b.maxX - r, pos.x));
  pos.z = Math.max(b.minZ + r, Math.min(b.maxZ - r, pos.z));
}

/**
 * Advance one mover by `dtMs`. `speedScale` multiplies the top speed (slow patches, boosts).
 * Mutates `m` and returns what happened, for sounds and animation.
 */
export function stepMover(m: Mover, input: MoveInput, dtMs: number, world: MoveWorld, tune: MoveTuning = TOY_TUNING, speedScale = 1): StepReport {
  const dt = dtMs / 1000;
  const report: StepReport = { hit: null, jumped: false, landed: 0 };
  if (dt <= 0) return report;

  // ---- horizontal: accelerate towards the wanted velocity
  const max = (input.run ? tune.run : tune.walk) * speedScale;
  const tvx = input.ax * max;
  const tvz = -input.ay * max;
  const steering = input.ax !== 0 || input.ay !== 0;
  const accel = m.grounded ? (steering ? tune.accel : tune.brake) : tune.airAccel;
  const dvx = tvx - m.vx;
  const dvz = tvz - m.vz;
  const dvl = Math.hypot(dvx, dvz);
  if (dvl > 1e-9) {
    const k = Math.min(dvl, accel * dt) / dvl;
    m.vx += dvx * k;
    m.vz += dvz * k;
  }

  const px = m.x;
  const pz = m.z;
  m.x += m.vx * dt;
  m.z += m.vz * dt;
  report.hit = resolveSolids(m, tune.radius, m.y, world.solids);
  if (world.bounds) clampToBounds(m, tune.radius, world.bounds);
  // Drop the velocity lost to walls so the toy slides along them instead of pushing.
  m.vx = (m.x - px) / dt;
  m.vz = (m.z - pz) / dt;
  // Float rounding in the line above must never leave a "stopped" toy creeping.
  if (Math.abs(m.vx) < 1e-6) m.vx = 0;
  if (Math.abs(m.vz) < 1e-6) m.vz = 0;

  // ---- facing follows travel direction
  const sp = Math.hypot(m.vx, m.vz);
  if (sp > 0.6) {
    const d = wrapAngle(Math.atan2(m.vx, m.vz) - m.yaw);
    const lim = tune.turnRate * dt;
    m.yaw = wrapAngle(m.yaw + Math.max(-lim, Math.min(lim, d)));
  }

  // ---- vertical
  if (input.jump && m.grounded) {
    m.vy = tune.jumpV;
    m.grounded = false;
    report.jumped = true;
  }
  if (!m.grounded) m.vy -= tune.gravity * dt;
  const prevY = m.y;
  m.y += m.vy * dt;
  const ground = groundAt(world.solids, m.x, m.z, tune.radius, Math.max(m.y, prevY));
  if (m.y <= ground) {
    if (!m.grounded && m.vy < -4) report.landed = Math.min(2, -m.vy / 14);
    m.y = ground;
    m.vy = 0;
    m.grounded = true;
  } else if (m.grounded && m.y > ground + 0.05) {
    m.grounded = false; // walked off a ledge
  }
  return report;
}
