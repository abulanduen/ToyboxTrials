/**
 * The Hub basketball, generalised for a court: any number of hoops at any spot and facing, a flat
 * floor at y = 0 and a box of walls (the stands) instead of the hub's colliders. Pure and
 * deterministic (no DOM, no three.js, no clock, no randomness), so a rules core and the online
 * server step it alike.
 *
 * Everything that makes the ball feel like the Hub's is imported from src/game/hubPlaySim.ts and
 * src/game/hubPlay.ts and used unchanged: gravity, the 60° throw and its power range, where the
 * ball leaves the hands and where it is held, the rim and backboard sizes and their bounce, the
 * floor bounce and roll, and the pick-up / snatch / steal reaches. The Hub's own exports are not
 * touched; this file only re-runs the same maths with the hoops as parameters.
 */
import { BALL, HOOP } from '../../game/hubPlay';
import {
  AIRBORNE_Y,
  BALL_GRAVITY,
  GRAB_REACH,
  HELD,
  RELEASE,
  STEP,
  launchVelocity,
  type PlayBody,
} from '../../game/hubPlaySim';

export { STEP };

/** The ball's radius (the Hub's). */
export const BALL_R = BALL.r;
/** The rim: height, radius and tube, as in the Hub. */
export const RIM = { y: HOOP.rim.y, r: HOOP.rim.r, tube: HOOP.rim.tube };
/** The backboard: size, height of its centre, and how far behind the rim's centre it stands. */
export const BOARD = { w: HOOP.board.w, h: HOOP.board.h, t: HOOP.board.t, y: HOOP.board.y, back: HOOP.rim.z - HOOP.board.z };
/** The hoop's pole stands this far behind the rim's centre in the Hub. */
export const POLE_BACK = HOOP.rim.z - HOOP.z;

/** A hoop on a court: the rim's centre and the (unit) direction it faces, out over the court. */
export interface CourtHoop {
  x: number;
  z: number;
  dx: number;
  dz: number;
}

/** A round post the ball bounces off (a hoop's stanchion). */
export interface CourtPost {
  x: number;
  z: number;
  r: number;
  top: number;
}

export interface CourtSpec {
  hoops: readonly CourtHoop[];
  posts: readonly CourtPost[];
  /** The stands: the ball bounces off these (they are as tall as the room). */
  walls: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface CourtBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Who holds it, or null when it is loose. */
  holder: string | null;
  /** Who threw it last. */
  thrower: string | null;
}

export type CourtBallEvent =
  /** Dropped through hoop `hoop` (its index in the spec). */
  | { k: 'hoop'; hoop: number }
  | { k: 'rim'; hoop: number; v: number }
  | { k: 'board'; hoop: number; v: number }
  | { k: 'bounce'; v: number }
  | { k: 'wall'; v: number };

const SUBSTEPS = 2;

export function createCourtBall(x = 0, z = 0): CourtBall {
  return { x, y: BALL_R, z, vx: 0, vy: 0, vz: 0, holder: null, thrower: null };
}

const forward = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

/** Where a toy's held ball sits (in front of it, at chest height): the Hub's `heldPoint`. */
export function heldAt(body: PlayBody) {
  const f = forward(body.yaw);
  return { x: body.x + f.x * HELD.fwd, y: body.y + HELD.y, z: body.z + f.z * HELD.fwd };
}

/** Where a throw leaves the hands: the Hub's `releasePoint`. */
export function releaseAt(body: PlayBody) {
  const f = forward(body.yaw);
  return { x: body.x + f.x * RELEASE.fwd, y: body.y + RELEASE.y, z: body.z + f.z * RELEASE.fwd };
}

/** Is a loose ball in mid-air (moving, off the floor)? The Hub's `ballAirborne` on a flat floor. */
export function courtBallAirborne(b: Pick<CourtBall, 'y' | 'vy' | 'holder'>): boolean {
  return !b.holder && b.vy !== 0 && b.y - BALL_R > AIRBORNE_Y;
}

/** Can a toy pick a resting or rolling ball up off the floor from here? (The Hub's pick-up reach.) */
export function inPickupReach(body: PlayBody, b: Pick<CourtBall, 'x' | 'y' | 'z'>, reach = GRAB_REACH): boolean {
  return Math.hypot(b.x - body.x, b.z - body.z) <= reach && b.y - Math.max(0, body.y) <= 4.5;
}

/** A shot: the Hub's throw (60°, power 0..1) from the toy's hands along `yaw`. */
export function throwCourtBall(b: CourtBall, body: PlayBody, yaw: number, power: number) {
  const at = releaseAt({ ...body, yaw });
  const v = launchVelocity(yaw, power);
  Object.assign(b, { x: at.x, y: at.y, z: at.z, vx: v.vx, vy: v.vy, vz: v.vz, holder: null, thrower: body.id });
}

/**
 * A pass: a flat throw from the hands that arrives at chest height at (tx, tz) after `flight`
 * seconds (the same gravity as every other throw, so it can be snatched on the way).
 */
export function passCourtBall(b: CourtBall, body: PlayBody, tx: number, tz: number, flight: number) {
  const yaw = Math.atan2(tx - body.x, tz - body.z);
  const at = releaseAt({ ...body, yaw });
  const t = Math.max(0.08, flight);
  const vy = (HELD.y - at.y + 0.5 * BALL_GRAVITY * t * t) / t;
  Object.assign(b, { x: at.x, y: at.y, z: at.z, vx: (tx - at.x) / t, vy, vz: (tz - at.z) / t, holder: null, thrower: body.id });
}

/** Give the ball to a toy (it sits at the hands). */
export function holdCourtBall(b: CourtBall, body: PlayBody) {
  Object.assign(b, heldAt(body), { vx: 0, vy: 0, vz: 0, holder: body.id });
}

function reflect(b: CourtBall, nx: number, ny: number, nz: number, e: number): number {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  b.vz -= (1 + e) * vn * nz;
  return -vn;
}

function sub(b: CourtBall, spec: CourtSpec, dt: number, ev: CourtBallEvent[]) {
  const R = BALL_R;
  const prevY = b.y;
  b.vy -= BALL_GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Posts (the stanchions behind the baselines): their sides, below their tops.
  for (const p of spec.posts) {
    if (b.y - R >= p.top) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.r + R;
    if (d >= min || d < 1e-6) continue;
    b.x = p.x + (dx / d) * min;
    b.z = p.z + (dz / d) * min;
    const v = reflect(b, dx / d, 0, dz / d, 0.5);
    if (v > 6) ev.push({ k: 'wall', v: round2(v) });
  }
  // The stands.
  const w = spec.walls;
  const wall = (n: [number, number]) => {
    const v = reflect(b, n[0], 0, n[1], 0.5);
    if (v > 6) ev.push({ k: 'wall', v: round2(v) });
  };
  if (b.x - R < w.minX) (b.x = w.minX + R), wall([1, 0]);
  if (b.x + R > w.maxX) (b.x = w.maxX - R), wall([-1, 0]);
  if (b.z - R < w.minZ) (b.z = w.minZ + R), wall([0, 1]);
  if (b.z + R > w.maxZ) (b.z = w.maxZ - R), wall([0, -1]);

  spec.hoops.forEach((h, i) => {
    // Backboard: a box BOARD.back behind the rim, its face square to the hoop's facing.
    const px = -h.dz;
    const pz = h.dx; // across the board
    const cx = h.x - h.dx * BOARD.back;
    const cz = h.z - h.dz * BOARD.back;
    const ox = b.x - cx;
    const oz = b.z - cz;
    const u = ox * h.dx + oz * h.dz;
    const s = ox * px + oz * pz;
    const qu = Math.max(-BOARD.t / 2, Math.min(BOARD.t / 2, u));
    const qs = Math.max(-BOARD.w / 2, Math.min(BOARD.w / 2, s));
    const qy = Math.max(BOARD.y - BOARD.h / 2, Math.min(BOARD.y + BOARD.h / 2, b.y));
    const eu = u - qu;
    const es = s - qs;
    const ey = b.y - qy;
    const d = Math.hypot(eu, es, ey);
    if (d < R) {
      const nu = d > 1e-6 ? eu / d : 1;
      const ns = d > 1e-6 ? es / d : 0;
      const ny = d > 1e-6 ? ey / d : 0;
      const nx = h.dx * nu + px * ns;
      const nz = h.dz * nu + pz * ns;
      const qx = cx + h.dx * qu + px * qs;
      const qz = cz + h.dz * qu + pz * qs;
      b.x = qx + nx * R;
      b.y = qy + ny * R;
      b.z = qz + nz * R;
      const v = reflect(b, nx, ny, nz, 0.6);
      if (v > 6) ev.push({ k: 'board', hoop: i, v: round2(v) });
    }
    // Rim: a ring of radius RIM.r (tube RIM.tube) in the horizontal plane.
    {
      const hx = b.x - h.x;
      const hz = b.z - h.z;
      const hd = Math.hypot(hx, hz);
      const rx = h.x + (hd > 1e-6 ? hx / hd : 1) * RIM.r;
      const rz = h.z + (hd > 1e-6 ? hz / hd : 0) * RIM.r;
      const ex = b.x - rx;
      const ey2 = b.y - RIM.y;
      const ez = b.z - rz;
      const dd = Math.hypot(ex, ey2, ez);
      const min = R + RIM.tube;
      if (dd < min && dd > 1e-6) {
        const nx = ex / dd;
        const ny = ey2 / dd;
        const nz = ez / dd;
        b.x = rx + nx * min;
        b.y = RIM.y + ny * min;
        b.z = rz + nz * min;
        const v = reflect(b, nx, ny, nz, 0.5);
        // Every touch counts for the rules (the shot clock); the sound only for a real knock.
        ev.push({ k: 'rim', hoop: i, v: round2(v) });
      }
    }
    // Through the hoop: the centre drops through the rim's plane inside the ring.
    if (prevY > RIM.y && b.y <= RIM.y && b.vy < 0) {
      const k = (prevY - RIM.y) / Math.max(1e-6, prevY - b.y);
      const cx2 = b.x - b.vx * dt * (1 - k);
      const cz2 = b.z - b.vz * dt * (1 - k);
      if (Math.hypot(cx2 - h.x, cz2 - h.z) < RIM.r - RIM.tube) {
        // the net slows it down
        b.vx *= 0.3;
        b.vz *= 0.3;
        b.vy *= 0.5;
        ev.push({ k: 'hoop', hoop: i });
      }
    }
  });

  // The floor.
  if (b.y - R <= 0) {
    b.y = R;
    if (b.vy < 0) {
      const impact = -b.vy;
      b.vy = impact > 5 ? impact * 0.55 : 0;
      if (impact > 5) {
        b.vx *= 0.85;
        b.vz *= 0.85;
      }
      if (impact > 8) ev.push({ k: 'bounce', v: round2(impact) });
    }
    if (b.vy === 0) {
      const f = Math.exp(-1.6 * dt);
      b.vx *= f;
      b.vz *= f;
    }
  }
}

/** Advance a loose ball one fixed STEP (a held ball is placed by the caller with `holdCourtBall`). */
export function stepCourtBall(b: CourtBall, spec: CourtSpec, ev: CourtBallEvent[]) {
  if (b.holder) return;
  if (b.vx === 0 && b.vy === 0 && b.vz === 0 && b.y - BALL_R <= 0.01) return;
  for (let i = 0; i < SUBSTEPS; i++) sub(b, spec, STEP / SUBSTEPS, ev);
  if (Math.hypot(b.vx, b.vz) < 0.15 && b.vy === 0) b.vx = b.vz = 0;
}

/**
 * The path a throw would take (x, y, z triples into `out`, one every `every` steps) until it first
 * touches the floor or scores, with the real step: the preview bends off the rim and the board
 * exactly as the throw will. Returns the number of points and the hoop it scores in (or -1).
 */
export function predictCourtThrow(spec: CourtSpec, from: PlayBody, yaw: number, power: number, out: Float32Array | null, max: number, every = 3): { n: number; hoop: number; board: boolean } {
  const b = createCourtBall();
  throwCourtBall(b, from, yaw, power);
  const ev: CourtBallEvent[] = [];
  let n = 0;
  let hoop = -1;
  let board = false;
  const put = () => {
    if (out && n < max) {
      out[n * 3] = b.x;
      out[n * 3 + 1] = b.y;
      out[n * 3 + 2] = b.z;
    }
    n++;
  };
  for (let i = 0; i < 260 && n < max; i++) {
    if (i % every === 0) put();
    ev.length = 0;
    stepCourtBall(b, spec, ev);
    for (const e of ev) {
      if (e.k === 'hoop') hoop = e.hoop;
      else if (e.k === 'board') board = true;
    }
    if (hoop >= 0 || b.y - BALL_R <= 0.02 || ev.some((e) => e.k === 'bounce')) {
      if (n < max) put();
      break;
    }
  }
  return { n: Math.min(n, max), hoop, board };
}

/** Facing from (x, z) to a hoop's rim. */
export const yawTo = (x: number, z: number, h: { x: number; z: number }) => Math.atan2(h.x - x, h.z - z);

/** A lone hoop facing +x, for solving shots by distance (every hoop on a flat court is alike). */
const SOLO: CourtSpec = { hoops: [{ x: 0, z: 0, dx: 1, dz: 0 }], posts: [], walls: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } };
const solved = new Map<number, { power: number; width: number } | null>();

/**
 * The power that sinks a shot from `dist` cm away from a rim and `angle` radians round from
 * straight out in front of its backboard, facing the rim: the middle of the widest scoring window
 * (off the rim or the board, as it falls), and that window's width; null when nothing goes in.
 * Searched with the real step and cached per 0.5 cm and 4° (pure: the same answer everywhere).
 * Bots aim with it.
 */
export function solveCourtShot(dist: number, angle = 0): { power: number; width: number } | null {
  const dk = Math.round(Math.max(0, dist) * 2);
  const ak = Math.min(22, Math.round((Math.abs(angle) * 180) / Math.PI / 4));
  const key = dk * 64 + ak;
  if (solved.has(key)) return solved.get(key)!;
  const d = dk / 2;
  const a = (ak * 4 * Math.PI) / 180;
  const x = Math.cos(a) * d;
  const z = Math.sin(a) * d;
  const body: PlayBody = { id: 'solve', x, y: 0, z, yaw: Math.atan2(-x, -z) };
  const N = 100;
  let res: { power: number; width: number } | null = null;
  let start = -1;
  for (let i = 0; i <= N + 1; i++) {
    const ok = i <= N && predictCourtThrow(SOLO, body, body.yaw, i / N, null, 400, 1).hoop === 0;
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      const lo = start / N;
      const hi = (i - 1) / N;
      if (!res || hi - lo > res.width) res = { power: (lo + hi) / 2, width: hi - lo };
      start = -1;
    }
  }
  solved.set(key, res);
  return res;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
