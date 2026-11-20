/**
 * Hoop Hustle's ball physics: the Hub basketball's feel (src/game/hubPlaySim.ts: the same launch
 * angle, throw speeds, gravity, release point, ball and rim sizes, rim and backboard bounces) on
 * the trial's own little court, whose hoop can slide sideways. Pure and deterministic: no DOM, no
 * three.js, no wall clock, no randomness. The rules core steps it at 60 Hz (two sub-steps, like
 * the Hub), and the Scene runs the very same code for the arc preview, so a gold arc scores.
 *
 * Court frame (1 unit = 1 cm): the felt is y = 0, the hoop faces +z, and with the hoop centred
 * the rim's centre is straight above the origin. The hoop only ever moves along x (`hoopX`).
 */
import { BALL as HUB_BALL, HOOP as HUB_HOOP } from '../../game/hubPlay';
import { BALL_GRAVITY, RELEASE, THROW_ANGLE, THROW_MAX, THROW_MIN, launchVelocity } from '../../game/hubPlaySim';

export { BALL_GRAVITY, RELEASE, THROW_ANGLE, THROW_MAX, THROW_MIN, launchVelocity };

/** Simulation step (ms) and the ball's sub-steps per step (as the Hub). */
export const STEP_MS = 1000 / 60;
const SUBSTEPS = 2;

/** The Hub hoop's sizes, re-centred on the court: rim, backboard and pole relative to the rim. */
export const BALL_R = HUB_BALL.r;
export const RIM = { y: HUB_HOOP.rim.y, r: HUB_HOOP.rim.r, tube: HUB_HOOP.rim.tube };
export const BOARD = {
  w: HUB_HOOP.board.w,
  h: HUB_HOOP.board.h,
  t: HUB_HOOP.board.t,
  y: HUB_HOOP.board.y,
  /** Board centre z (behind the rim). */
  z: HUB_HOOP.board.z - HUB_HOOP.rim.z,
};
export const POLE = { z: HUB_HOOP.z - HUB_HOOP.rim.z, r: HUB_HOOP.pole.r, top: HUB_HOOP.pole.top };

/** The Hub's aim assist: a facing within this angle of the hoop bends onto it. */
export const ASSIST_ANGLE = 0.75;

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export type BallHit = { k: 'rim' | 'board' | 'floor'; v: number } | { k: 'score' };

const round2 = (v: number) => Math.round(v * 100) / 100;

function reflect(b: Ball, nx: number, ny: number, nz: number, e: number, kind: 'rim' | 'board', ev: BallHit[] | null) {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  b.vz -= (1 + e) * vn * nz;
  if (-vn > 6 && ev) ev.push({ k: kind, v: round2(-vn) });
}

/** One sub-step of `dt` seconds against a hoop centred at x = `hx`. Returns true when it dropped through the rim. */
function sub(b: Ball, hx: number, dt: number, ev: BallHit[] | null): boolean {
  const R = BALL_R;
  const prevY = b.y;
  b.vy -= BALL_GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Backboard: an axis-aligned box facing +z.
  {
    const qx = Math.max(hx - BOARD.w / 2, Math.min(hx + BOARD.w / 2, b.x));
    const qy = Math.max(BOARD.y - BOARD.h / 2, Math.min(BOARD.y + BOARD.h / 2, b.y));
    const qz = Math.max(BOARD.z - BOARD.t / 2, Math.min(BOARD.z + BOARD.t / 2, b.z));
    const ex = b.x - qx;
    const ey = b.y - qy;
    const ez = b.z - qz;
    const d = Math.hypot(ex, ey, ez);
    if (d < R) {
      const nx = d > 1e-6 ? ex / d : 0;
      const ny = d > 1e-6 ? ey / d : 0;
      const nz = d > 1e-6 ? ez / d : 1;
      b.x = qx + nx * R;
      b.y = qy + ny * R;
      b.z = qz + nz * R;
      reflect(b, nx, ny, nz, 0.6, 'board', ev);
    }
  }
  // Rim: a ring in the horizontal plane.
  {
    const hxr = b.x - hx;
    const hz = b.z;
    const hd = Math.hypot(hxr, hz);
    const qx = hx + (hd > 1e-6 ? hxr / hd : 1) * RIM.r;
    const qz = (hd > 1e-6 ? hz / hd : 0) * RIM.r;
    const ex = b.x - qx;
    const ey = b.y - RIM.y;
    const ez = b.z - qz;
    const d = Math.hypot(ex, ey, ez);
    const min = R + RIM.tube;
    if (d < min && d > 1e-6) {
      const nx = ex / d;
      const ny = ey / d;
      const nz = ez / d;
      b.x = qx + nx * min;
      b.y = RIM.y + ny * min;
      b.z = qz + nz * min;
      reflect(b, nx, ny, nz, 0.5, 'rim', ev);
    }
  }
  // The pole, below the board: a vertical cylinder.
  if (b.y - R < POLE.top) {
    const dx = b.x - hx;
    const dz = b.z - POLE.z;
    const d = Math.hypot(dx, dz);
    const min = R + POLE.r;
    if (d < min && d > 1e-6) {
      const nx = dx / d;
      const nz = dz / d;
      b.x = hx + nx * min;
      b.z = POLE.z + nz * min;
      reflect(b, nx, 0, nz, 0.5, 'board', ev);
    }
  }

  // Through the hoop: the centre drops through the rim's plane inside the ring.
  let scored = false;
  if (prevY > RIM.y && b.y <= RIM.y && b.vy < 0) {
    const k = (prevY - RIM.y) / Math.max(1e-6, prevY - b.y);
    const cx = b.x - b.vx * dt * (1 - k);
    const cz = b.z - b.vz * dt * (1 - k);
    if (Math.hypot(cx - hx, cz) < RIM.r - RIM.tube) {
      scored = true;
      b.vx *= 0.3;
      b.vz *= 0.3;
      b.vy *= 0.5;
      ev?.push({ k: 'score' });
    }
  }

  // The felt.
  if (b.y - R <= 0) {
    b.y = R;
    if (b.vy < 0) {
      const impact = -b.vy;
      b.vy = impact > 5 ? impact * 0.55 : 0;
      if (impact > 5) {
        b.vx *= 0.85;
        b.vz *= 0.85;
      }
      ev?.push({ k: 'floor', v: round2(impact) });
    }
    if (b.vy === 0) {
      const f = Math.exp(-1.6 * dt);
      b.vx *= f;
      b.vz *= f;
    }
  }
  return scored;
}

/** Advance a free ball by one 60 Hz step against a hoop at `hx`. Hits (rim, board, floor, score) go to `ev`. */
export function stepBall(b: Ball, hx: number, ev: BallHit[] | null) {
  for (let i = 0; i < SUBSTEPS; i++) sub(b, hx, STEP_MS / 1000 / SUBSTEPS, ev);
}

/** Where a toy at (x, z) facing `yaw` lets go of the ball. */
export function releaseAt(x: number, z: number, yaw: number) {
  return { x: x + Math.sin(yaw) * RELEASE.fwd, y: RELEASE.y, z: z + Math.cos(yaw) * RELEASE.fwd };
}

/** A freshly thrown ball. */
export function launch(x: number, z: number, yaw: number, power: number): Ball {
  const at = releaseAt(x, z, yaw);
  const v = launchVelocity(yaw, power);
  return { x: at.x, y: at.y, z: at.z, vx: v.vx, vy: v.vy, vz: v.vz };
}

/** Facing from a point to the hoop (centred at `hx`). */
export const yawToHoop = (x: number, z: number, hx: number) => Math.atan2(hx - x, -z);

export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** The Hub's aim assist: the facing bends onto the hoop when it is roughly ahead. */
export function assistYaw(x: number, z: number, yaw: number, hx: number) {
  const want = yawToHoop(x, z, hx);
  return Math.abs(angleDelta(want, yaw)) < ASSIST_ANGLE ? want : yaw;
}

/**
 * The flight of a throw: up to `max` points (x, y, z triples into `out`, every `every` steps)
 * until it first touches the felt or scores. `hoopAt(stepIndex)` gives the hoop's x on each step
 * (it can slide during the flight). Uses the real step, so the preview bends off the rim and the
 * board exactly as the throw will.
 */
export function predictShot(
  x: number,
  z: number,
  yaw: number,
  power: number,
  hoopAt: (step: number) => number,
  out: Float32Array | null,
  max = 0,
  every = 3,
): { n: number; scores: boolean; steps: number } {
  const b = launch(x, z, yaw, power);
  const ev: BallHit[] = [];
  let n = 0;
  let scores = false;
  let i = 0;
  for (; i < 240; i++) {
    if (out && n < max && i % every === 0) {
      out[n * 3] = b.x;
      out[n * 3 + 1] = b.y;
      out[n * 3 + 2] = b.z;
      n++;
    }
    ev.length = 0;
    stepBall(b, hoopAt(i), ev);
    if (ev.some((e) => e.k === 'score')) scores = true;
    if (scores || ev.some((e) => e.k === 'floor')) {
      if (out && n < max) {
        out[n * 3] = b.x;
        out[n * 3 + 1] = b.y;
        out[n * 3 + 2] = b.z;
        n++;
      }
      break;
    }
  }
  return { n, scores, steps: i };
}

/**
 * Along-the-throw miss (cm) where a throw's centre first comes down through the rim's height,
 * flying freely (no rim or board): negative is short, positive is long. -Infinity when the ball
 * never rises to the rim. Same integrator as `stepBall`, so it agrees with the real flight.
 */
function freeMiss(x: number, z: number, yaw: number, power: number, hoopAt: (step: number) => number): { miss: number; side: number } {
  const b = launch(x, z, yaw, power);
  const dt = STEP_MS / 1000 / SUBSTEPS;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let wasAbove = b.y > RIM.y;
  for (let i = 0; i < 240; i++) {
    const hx = hoopAt(i);
    for (let k = 0; k < SUBSTEPS; k++) {
      const py = b.y;
      b.vy -= BALL_GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y > RIM.y) wasAbove = true;
      if (wasAbove && py > RIM.y && b.y <= RIM.y && b.vy < 0) {
        const f = (py - RIM.y) / Math.max(1e-6, py - b.y);
        const cx = b.x - b.vx * dt * (1 - f) - hx;
        const cz = b.z - b.vz * dt * (1 - f);
        return { miss: cx * fx + cz * fz, side: cx * fz - cz * fx };
      }
      if (b.vy < 0 && b.y < RIM.y && !wasAbove) return { miss: -Infinity, side: 0 };
    }
  }
  return { miss: -Infinity, side: 0 };
}

/**
 * The power (0..1) that drops a throw from (x, z) facing `yaw` through the middle of the rim,
 * the hoop's x on each step given by `hoopAt` (it may slide during the flight); found by
 * bisection on the free flight, then checked with the real step (rim and board included). Null
 * when no power in 0..1 sinks it (out of range, or the sliding hoop will have moved away).
 */
export function perfectPower(x: number, z: number, yaw: number, hoopAt: (step: number) => number): number | null {
  let lo = 0;
  let hi = 1;
  if (freeMiss(x, z, yaw, hi, hoopAt).miss < 0) return null;
  if (freeMiss(x, z, yaw, lo, hoopAt).miss > 0) return null;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (freeMiss(x, z, yaw, mid, hoopAt).miss < 0) lo = mid;
    else hi = mid;
  }
  const p0 = (lo + hi) / 2;
  if (Math.abs(freeMiss(x, z, yaw, p0, hoopAt).side) > RIM.r) return null;
  // The real flight (rim and board) shifts the window a little: take the middle of the scoring
  // run of powers nearest the free-flight answer.
  const scores = (p: number) => p >= 0 && p <= 1 && predictShot(x, z, yaw, p, hoopAt, null).scores;
  const D = 0.002;
  let seed = -1;
  for (let k = 0; k <= 30 && seed < 0; k++) {
    if (scores(p0 - k * D)) seed = p0 - k * D;
    else if (k && scores(p0 + k * D)) seed = p0 + k * D;
  }
  if (seed < 0) return null;
  let a = seed;
  let b = seed;
  while (a - D >= 0 && scores(a - D)) a -= D;
  while (b + D <= 1 && scores(b + D)) b += D;
  return (a + b) / 2;
}

/**
 * The scoring window of powers for a throw from (x, z) facing `yaw` at a still hoop at `hx`:
 * searched in 1/400 steps with the real step. Null when nothing in 0..1 goes in.
 */
export function scoringWindow(x: number, z: number, yaw: number, hx: number): { lo: number; hi: number; mid: number } | null {
  const still = () => hx;
  let lo = -1;
  let hi = -1;
  for (let i = 0; i <= 400; i++) {
    const p = i / 400;
    if (predictShot(x, z, yaw, p, still, null).scores) {
      if (lo < 0) lo = p;
      hi = p;
    } else if (lo >= 0) break;
  }
  return lo < 0 ? null : { lo, hi, mid: (lo + hi) / 2 };
}
