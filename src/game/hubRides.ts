/**
 * The Hub's rides between its two levels (docs/ARCADE_PLAN.md phase 2), as pure data and maths with
 * no DOM and no three.js: the client draws and follows them, and the online server times them, so
 * every player sees a toy at the same place on its journey.
 *
 *  - `car`: the toy-car track. A toy boards the little wind-up car parked near the spawn table's front
 *    edge, rolls off the edge down a steep drop, round a loop on the rug, back along the side and in
 *    through the arcade's entrance, where it stops on the arcade floor.
 *  - `lift`: the toy lift. A toy steps onto its platform just inside the arcade's entrance; the
 *    platform runs out to the lift's tower beside the table, winds up the tower (turning round as it
 *    goes) and slides in over the table top, where the toy steps off.
 *
 * A ride is a path sampled every ~0.5 cm: each sample carries the point under the rider's feet (the
 * track or platform surface), the way the rider faces (`f`) and its up direction (`u`, which turns
 * over in the loop), the distance along the path and the time it is reached. `ridePose(kind, t)`
 * reads it at a time; t = 0 is the boarding spot and `RIDES[kind].duration` the landing.
 * Input is locked for the whole ride (a scripted journey), so the time alone says where a rider is.
 *
 * Units: cm and seconds; y is up, the table top is y = 0 and the room floor LEVEL_Y.floor.
 */
import { LEVEL_Y, type HubLevel } from './hubBounds';

export type RideKind = 'car' | 'lift';
export const RIDE_KINDS: readonly RideKind[] = ['car', 'lift'];
export const isRideKind = (v: unknown): v is RideKind => v === 'car' || v === 'lift';

type V3 = [number, number, number];

/** A point on a ride: where, facing which way, which way is up, and the facing as a three.js yaw. */
export interface RidePose {
  x: number;
  y: number;
  z: number;
  /** Unit forward (the way the rider faces). */
  f: V3;
  /** Unit up (perpendicular to `f`): upside down at the top of the loop. */
  u: V3;
  /** Facing as three.js rotation.y (atan2(f.x, f.z)): what a toy standing upright would use. */
  yaw: number;
  /** The way the ride is heading over the ground (a yaw), steady through the loop: for chase cameras. */
  h: number;
}

interface Sample extends RidePose {
  /** Distance along the path (cm). */
  s: number;
  /** Time this sample is reached (s). */
  t: number;
}

export interface RideDef {
  kind: RideKind;
  /** The level a rider boards on, and the one it lands on. */
  from: HubLevel;
  to: HubLevel;
  /** Where to stand to board (Interact), facing the way the ride sets off. */
  board: { x: number; z: number; yaw: number };
  /** How close to `board` a toy must be to board it (cm): the prompt's radius and the server's check. */
  reach: number;
  /** Where the rider is put down at the end, on `to`. */
  land: { x: number; z: number; yaw: number };
  /** Seconds from boarding to landing. */
  duration: number;
  /** Total path length (cm). */
  length: number;
  samples: readonly Sample[];
}

// ------------------------------------------------------------------ layout

const FLOOR = LEVEL_Y.floor;
/** The spawn table's front edge (layout.ts TABLE.maxZ; a unit test keeps them equal). */
export const TABLE_FRONT = 46;
/** Height of the car track's running surface above the room floor (its plates lie on the rug). */
export const TRACK_LIFT = 1.4;
/** The car track's running surface on the floor. */
export const TRACK_Y = FLOOR + TRACK_LIFT;
/** Height of the track's running surface where it lies on the table top (its plates under it). */
export const TRACK_ON_TABLE = 0.4;
/** The car's floor above the track: where a riding toy's feet are. */
export const CAR_SEAT = 1.1;
/** The lift's platform thickness: a riding toy's feet are this far above the platform's path. */
export const LIFT_DECK = 0.5;

/** Car track: boards on the table at x CAR_X, drops off the edge, loops, returns along x CAR_BACK_X, enters the arcade at CAR_IN_X. */
export const CAR = {
  x: 10,
  boardZ: 30,
  /** Where the drop starts: just past the table's edge, so the track clears the table's slab. */
  dropZ: TABLE_FRONT + 1,
  /** Where the drop meets the floor and the loop begins. */
  loopZ: 100,
  loopR: 10,
  /** Sideways shift across the loop (so the way out runs beside the way in). */
  loopShift: 6,
  /** The U-turn: radius, and the straight before it. */
  turnR: 13,
  turnRun: 8,
  backX: 42,
  /** Into the arcade along x = inX, through the entrance, stopping at z = stopZ. */
  inX: 22,
  bendZ: 70,
  inZ: 44,
  stopZ: 28,
};

/** Toy lift: boards in the arcade at (x, boardZ), runs out to the tower at towerZ, rises, slides in to landZ on the table. */
export const LIFT = {
  x: -4,
  boardZ: 32,
  towerZ: TABLE_FRONT + 8,
  landZ: 33,
  /** Platform speeds (cm/s): along the rails, and up the tower. */
  run: 14,
  climb: 22,
};

// ------------------------------------------------------------------ path building

interface Point {
  p: V3;
  /** Up hint (made perpendicular to the path later). */
  u: V3;
  /** Facing override (else the path's own direction). */
  f?: V3;
  /** Heading override for chase cameras (else the facing's own yaw). */
  h?: number;
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP: V3 = [0, 1, 0];
const STEP = 0.5;

/** Points along a straight line (a excluded, b included). */
function line(out: Point[], a: V3, b: V3, extra: Partial<Point> = {}) {
  const n = Math.max(1, Math.ceil(len(sub(b, a)) / STEP));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    out.push({ p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], u: UP, ...extra });
  }
}

/** A cubic Hermite curve from a (tangent ta) to b (tangent tb), a excluded. */
function hermite(out: Point[], a: V3, ta: V3, b: V3, tb: V3) {
  const n = Math.max(2, Math.ceil((len(sub(b, a)) * 1.3) / STEP));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    out.push({
      p: [0, 1, 2].map((j) => h00 * a[j] + h10 * ta[j] + h01 * b[j] + h11 * tb[j]) as V3,
      u: UP,
    });
  }
}

/** Arc in the horizontal plane round centre c, radius r, angle a0 → a1 (angle 0 = +x, π/2 = +z). */
function arc(out: Point[], c: V3, r: number, a0: number, a1: number) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / STEP));
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ p: [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], u: UP });
  }
}

/** A vertical loop heading +z, starting at `a` on the ground, shifting sideways by `shift` in x. Up points at the loop's centre. */
function loop(out: Point[], a: V3, r: number, shift: number) {
  const n = Math.ceil((2 * Math.PI * r) / STEP);
  for (let i = 1; i <= n; i++) {
    const th = (2 * Math.PI * i) / n;
    // a smooth sideways shift (no kink where the loop joins the straight track)
    const k = (1 - Math.cos(th / 2)) / 2;
    out.push({ p: [a[0] + shift * k, a[1] + r * (1 - Math.cos(th)), a[2] + r * Math.sin(th)], u: [0, Math.cos(th), -Math.sin(th)], h: 0 });
  }
}

const yawOf = (f: V3) => Math.atan2(f[0], f[2]);

/** Turn points into samples: distances, frames (forward and up made perpendicular), then times from a speed function. */
function finish(points: Point[], speed: (s: number, y: number, total: number, i: number, pts: Point[]) => number): { samples: Sample[]; duration: number; length: number } {
  const n = points.length;
  const dist: number[] = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + len(sub(points[i].p, points[i - 1].p)));
  const total = dist[n - 1];
  const samples: Sample[] = [];
  let t = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const pt = points[i];
    let f = pt.f;
    if (!f) {
      const a = points[Math.max(0, i - 1)].p;
      const b = points[Math.min(n - 1, i + 1)].p;
      f = norm(sub(b, a));
    }
    f = norm(f);
    // up: the hint with its forward part taken out (perpendicular to the facing)
    let u = sub(pt.u, [f[0] * dot(pt.u, f), f[1] * dot(pt.u, f), f[2] * dot(pt.u, f)]);
    u = len(u) < 1e-6 ? UP : norm(u);
    if (i > 0) {
      const ds = dist[i] - dist[i - 1];
      const v0 = speed(dist[i - 1], points[i - 1].p[1], total, i - 1, points);
      const v1 = speed(dist[i], pt.p[1], total, i, points);
      t += ds / Math.max(0.5, (v0 + v1) / 2);
    }
    // heading: the facing's yaw, held while the path runs (nearly) straight up or down
    if (pt.h !== undefined) h = pt.h;
    else if (Math.hypot(f[0], f[2]) > 0.2) h = yawOf(f);
    samples.push({ x: pt.p[0], y: pt.p[1], z: pt.p[2], f, u, yaw: yawOf(f), h, s: dist[i], t });
  }
  return { samples, duration: t, length: total };
}

// ------------------------------------------------------------------ the toy car

/** Wind-up motor speed on the flat (cm/s), the drop's pull (cm/s²), rolling losses, launch and brakes. */
const CAR_MOTOR = 30;
const CAR_PULL = 130;
const CAR_DRAG = 15;
const CAR_LAUNCH = 80;
const CAR_BRAKE = 90;

function buildCar(): RideDef {
  const C = CAR;
  const pts: Point[] = [];
  const start: V3 = [C.x, TRACK_ON_TABLE, C.boardZ];
  pts.push({ p: start, u: UP });
  const edge: V3 = [C.x, TRACK_ON_TABLE, C.dropZ];
  line(pts, start, edge);
  // the drop: leaves the table level, steepest halfway, lands level on the track's floor plates
  const bottom: V3 = [C.x, TRACK_Y, C.loopZ];
  const run = C.loopZ - C.dropZ;
  hermite(pts, edge, [0, 0, run], bottom, [0, 0, run]);
  loop(pts, bottom, C.loopR, C.loopShift);
  const out: V3 = [C.x + C.loopShift, TRACK_Y, C.loopZ];
  const preTurn: V3 = [out[0], TRACK_Y, C.loopZ + C.turnRun];
  line(pts, out, preTurn);
  // U-turn to the east, back towards the table
  const r = (C.backX - preTurn[0]) / 2;
  arc(pts, [preTurn[0] + r, TRACK_Y, preTurn[2]], r, Math.PI, 0);
  const back: V3 = [C.backX, TRACK_Y, preTurn[2]];
  const bend: V3 = [C.backX, TRACK_Y, C.bendZ];
  line(pts, back, bend);
  // S-bend west to the arcade's way in
  const inAt: V3 = [C.inX, TRACK_Y, C.inZ];
  hermite(pts, bend, [0, 0, -(C.bendZ - C.inZ)], inAt, [0, 0, -(C.bendZ - C.inZ)]);
  line(pts, inAt, [C.inX, TRACK_Y, C.stopZ]);

  const top = TRACK_ON_TABLE;
  const { samples, duration, length } = finish(pts, (s, y, total) => {
    const energy = Math.sqrt(Math.max(CAR_MOTOR * CAR_MOTOR, CAR_MOTOR * CAR_MOTOR + 2 * CAR_PULL * (top - y) - 2 * CAR_DRAG * s));
    const launch = Math.sqrt(36 + 2 * CAR_LAUNCH * s);
    const brake = Math.sqrt(2 * CAR_BRAKE * Math.max(0, total - s)) + 3;
    return Math.min(energy, launch, brake);
  });
  const end = samples[samples.length - 1];
  return {
    kind: 'car',
    from: 'table',
    to: 'floor',
    board: { x: C.x, z: C.boardZ, yaw: 0 },
    reach: 5,
    land: { x: end.x, z: end.z, yaw: end.yaw },
    duration,
    length,
    samples,
  };
}

// ------------------------------------------------------------------ the toy lift

/** Platform speed: eased in and out of every stop (each leg starts and ends at a standstill). */
const LIFT_EASE = 30; // cm/s²

function buildLift(): RideDef {
  const L = LIFT;
  const pts: Point[] = [];
  const legs: { from: number; to: number; v: number }[] = [];
  const leg = (v: number, add: () => void) => {
    const from = pts.length - 1;
    add();
    legs.push({ from, to: pts.length - 1, v });
  };
  const start: V3 = [L.x, FLOOR, L.boardZ];
  pts.push({ p: start, u: UP, f: [0, 0, 1] });
  const foot: V3 = [L.x, FLOOR, L.towerZ];
  leg(L.run, () => line(pts, start, foot, { f: [0, 0, 1] }));
  // up the tower, turning round to face the table on the way
  const head: V3 = [L.x, 0, L.towerZ];
  leg(L.climb, () => {
    const from = pts.length;
    line(pts, foot, head);
    const n = pts.length - from;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * (i + 1)) / n;
      pts[from + i].f = [Math.sin(a), 0, Math.cos(a)];
    }
  });
  leg(L.run, () => line(pts, head, [L.x, 0, L.landZ], { f: [0, 0, -1] }));

  // distance of every point, to ease each leg
  const d: number[] = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + len(sub(pts[i].p, pts[i - 1].p)));
  const legOf = (i: number) => legs.find((l) => i >= l.from && i <= l.to) ?? legs[legs.length - 1];
  const { samples, duration, length } = finish(pts, (s, _y, _total, i) => {
    const l = legOf(i);
    const into = s - d[l.from];
    const left = d[l.to] - s;
    return Math.min(l.v, Math.sqrt(2 * LIFT_EASE * Math.max(0, into)) + 2, Math.sqrt(2 * LIFT_EASE * Math.max(0, left)) + 2);
  });
  const end = samples[samples.length - 1];
  return {
    kind: 'lift',
    from: 'floor',
    to: 'table',
    board: { x: L.x, z: L.boardZ, yaw: 0 },
    reach: 5,
    land: { x: end.x, z: end.z, yaw: end.yaw },
    duration,
    length,
    samples,
  };
}

export const RIDES: Record<RideKind, RideDef> = { car: buildCar(), lift: buildLift() };

// ------------------------------------------------------------------ reading a ride

/** Where on ride `kind` a rider is `t` seconds after boarding (clamped to the ride). Writes into `out` if given. */
export function ridePose(kind: RideKind, t: number, out?: RidePose): RidePose {
  const { samples } = RIDES[kind];
  const o: RidePose = out ?? { x: 0, y: 0, z: 0, f: [0, 0, 1], u: [0, 1, 0], yaw: 0, h: 0 };
  let lo = 0;
  let hi = samples.length - 1;
  if (t <= 0) hi = 0;
  else if (t >= samples[hi].t) lo = hi;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) lo = mid;
      else hi = mid;
    }
  }
  const a = samples[lo];
  const b = samples[hi];
  const k = hi === lo ? 0 : (t - a.t) / (b.t - a.t);
  o.x = a.x + (b.x - a.x) * k;
  o.y = a.y + (b.y - a.y) * k;
  o.z = a.z + (b.z - a.z) * k;
  const f = norm(add(a.f, sub(b.f, a.f), k));
  const u = norm(add(a.u, sub(b.u, a.u), k));
  o.f[0] = f[0];
  o.f[1] = f[1];
  o.f[2] = f[2];
  o.u[0] = u[0];
  o.u[1] = u[1];
  o.u[2] = u[2];
  o.yaw = yawOf(f);
  o.h = a.h + Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)) * k;
  return o;
}

/** How far above the path a riding toy's feet are (in the car's seat, on the lift's deck). */
export const RIDE_SEAT: Record<RideKind, number> = { car: CAR_SEAT, lift: LIFT_DECK };

/** Where a riding toy's feet are at time t: the path point lifted along its up direction by the seat height. */
export function riderAt(kind: RideKind, t: number, out?: RidePose): RidePose {
  const p = ridePose(kind, t, out);
  const h = RIDE_SEAT[kind];
  p.x += p.u[0] * h;
  p.y += p.u[1] * h;
  p.z += p.u[2] * h;
  return p;
}

/** The ride boarded from level `level` within reach of (x, z), if any. */
export function rideAt(level: HubLevel, x: number, z: number): RideKind | null {
  for (const k of RIDE_KINDS) {
    const r = RIDES[k];
    if (r.from === level && Math.hypot(x - r.board.x, z - r.board.z) <= r.reach) return k;
  }
  return null;
}
