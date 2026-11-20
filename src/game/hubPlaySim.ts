/**
 * Hub play physics: the shared marble (football) and the basketball. Pure and deterministic: no
 * DOM, no three.js, no wall clock, no randomness. The online server runs it as the authority for
 * a Hub room (server/hubRoom.ts) and the browser runs the very same code offline
 * (src/hubplay/runtime.ts), so both behave alike. Fixed steps of STEP seconds.
 *
 * The marble rolls on the table in 2D (x, z), bounces off solid props (the hub's colliders,
 * HUB_SOLIDS) and off toys, and stays on walkable ground (the two play mats and the bridge, whose
 * deck it rolls over). Toys move it by kicking it (Interact) or pushing it (walking into it):
 * both are `kickMarble` calls with a power. A marble that crosses a net's goal line scores for the
 * other team, sits in the net for GOAL_PAUSE seconds and is put back on the centre spot.
 *
 * The basketball is a 3D ball: held by one toy at a time, thrown with a power (0..1) and a facing
 * at a fixed launch angle, under gravity; it bounces on the table, props, the backboard and the
 * rim, and scores when it drops through the rim. Interact takes it: picked up off the floor,
 * snatched in mid-air, or stolen from a holder who is dribbling (moving on the ground). Left alone (or stuck on top of something) it goes
 * back to its spot by the hoop.
 */
import { clampToWalkable } from './hubBounds';
import type { Collider } from './collision';
import { BALL, BRIDGE_DECK, HOOP, MARBLE, NET, NETS, PITCH_CENTRE, rollFloorAt, type NetId } from './hubPlay';
import { HUB_SOLIDS } from './hubSolids';

/** Fixed simulation step (s). */
export const STEP = 1 / 60;

// ---------------------------------------------------------------- tuning
/** Rolling drag on the felt (per second): speed × e^(−k t). A full kick rolls about 33 cm. */
export const MARBLE_DRAG = 0.9;
/** Marble speed (cm/s) from a full kick (power 1). Walking into it pushes with power PUSH_POWER. */
export const KICK_SPEED = 30;
export const PUSH_POWER = 0.45;
/** Furthest a toy can kick from (centre to centre, cm), and the extra the server allows for lag. */
export const KICK_REACH = 3.6;
export const REACH_SLACK = 1.5;
/** A toy's radius for the marble to bounce off. */
export const BODY_R = 0.85;
/** How long the marble sits in the net after a goal (s). */
export const GOAL_PAUSE = 1.6;
const WALL_BOUNCE = 0.7;
const BODY_BOUNCE = 0.6;

export const BALL_GRAVITY = 110;
/** Launch angle of a throw above the horizontal. */
export const THROW_ANGLE = (60 * Math.PI) / 180;
/** Throw speed (cm/s) at power 0 and power 1. */
export const THROW_MIN = 36;
export const THROW_MAX = 78;
/** Where the ball leaves the hands: this far in front of the toy, this high above its feet. */
export const RELEASE = { fwd: 0.9, y: 3.2 };
/** Where a held ball sits: in front of the toy, at chest height. */
export const HELD = { fwd: 0.95, y: 2.3 };
/** Furthest a toy can pick the ball up from (horizontal, cm). */
export const GRAB_REACH = 3.2;
/** A ball left alone this long (s) goes back to its spot; one stuck on top of something, sooner. */
export const BALL_IDLE_RESET = 30;
/**
 * Snatching a ball in mid-air: its centre must be within GRAB_REACH across and between `below`
 * under and `above` over the toy's feet (a jump adds about 2.4 cm).
 */
export const SNATCH_REACH_Y = { below: 1.0, above: 5.4 };
/** A ball counts as in mid-air (snatch, not pick up) when it is this far off the floor and moving. */
export const AIRBORNE_Y = 0.4;
/** A holder moving at least this fast (cm/s) on the ground is dribbling, and the ball can be stolen. */
export const DRIBBLE_SPEED = 2;
/** How close (cm, across) a toy must be to a dribbled ball to steal it. */
export const STEAL_REACH = 2.6;
/** After any pick-up, snatch or steal, the ball can't be stolen for this long (s). */
export const STEAL_GUARD = 1.5;
export const BALL_STUCK_RESET = 2.5;
const BALL_SUBSTEPS = 2;

// ---------------------------------------------------------------- state
export interface MarbleState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** The last toy to kick or push it (who scored). */
  lastTouch: string | null;
  /** The net it is sitting in after a goal, until `netUntil` (sim time, s). */
  inNet: NetId | null;
  netUntil: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holder: string | null;
  /** Who threw it last (who scored). */
  thrower: string | null;
  /** Seconds at rest and unheld (back to the spot after BALL_IDLE_RESET). */
  idle: number;
  /** Seconds resting on top of something (back to the spot after BALL_STUCK_RESET). */
  stuck: number;
  /** Sim time of the last pick-up, snatch or steal (for STEAL_GUARD). */
  grabT: number;
}

export interface HubPlayState {
  /** Simulation time (s). */
  t: number;
  marble: MarbleState;
  ball: BallState;
  /** Goals: [Coral, Blue]. */
  score: [number, number];
  /** Baskets scored in this room (everyone). */
  hoops: number;
}

/** A toy in the hub, for the marble to bounce off and for a held ball to follow. */
export interface PlayBody {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Facing (radians, three.js rotation.y convention: forward is (sin, cos)). */
  yaw: number;
}

export type PlayEvent =
  | { k: 'goal'; net: NetId; by: string | null; score: [number, number] }
  | { k: 'hoop'; by: string | null; total: number }
  | { k: 'kick'; by: string; p: number }
  | { k: 'grab'; by: string }
  /** Caught in mid-air. */
  | { k: 'snatch'; by: string }
  /** Taken from a dribbling holder (`from`). */
  | { k: 'steal'; by: string; from: string }
  | { k: 'throw'; by: string; p: number }
  | { k: 'drop'; by: string }
  | { k: 'rim'; v: number }
  | { k: 'board'; v: number }
  | { k: 'bounce'; v: number }
  | { k: 'wall'; v: number }
  | { k: 'reset' };

export function createHubPlay(): HubPlayState {
  return {
    t: 0,
    marble: { x: MARBLE.home.x, z: MARBLE.home.z, vx: 0, vz: 0, lastTouch: null, inNet: null, netUntil: 0 },
    ball: { x: BALL.spot.x, y: BALL.r, z: BALL.spot.z, vx: 0, vy: 0, vz: 0, holder: null, thrower: null, idle: 0, stuck: 0, grabT: -1e9 },
    score: [0, 0],
    hoops: 0,
  };
}

// ---------------------------------------------------------------- static solids
/** Bridge deck and ramps are floor for rolling things (rollFloorAt), not walls. */
const isBridgeFloor = (c: Collider) => c.id === 'bridge-deck' || c.id === 'bridge-ramp';

/** A coarse grid over the colliders, so each step only looks at the solids nearby. */
class SolidGrid {
  private cells = new Map<number, Collider[]>();
  private static readonly CELL = 10;
  constructor(list: readonly Collider[]) {
    for (const c of list) {
      const rad = c.kind === 'circle' ? c.r : Math.hypot(c.hx, c.hz);
      const C = SolidGrid.CELL;
      for (let ix = Math.floor((c.x - rad) / C); ix <= Math.floor((c.x + rad) / C); ix++)
        for (let iz = Math.floor((c.z - rad) / C); iz <= Math.floor((c.z + rad) / C); iz++) {
          const k = SolidGrid.key(ix, iz);
          let cell = this.cells.get(k);
          if (!cell) this.cells.set(k, (cell = []));
          cell.push(c);
        }
    }
  }
  private static key(ix: number, iz: number) {
    return (ix + 1000) * 4096 + (iz + 1000);
  }
  /** Colliders whose cells a circle at (x, z) of radius r touches (each once). */
  near(x: number, z: number, r: number, out: Collider[]): Collider[] {
    out.length = 0;
    const C = SolidGrid.CELL;
    for (let ix = Math.floor((x - r) / C); ix <= Math.floor((x + r) / C); ix++)
      for (let iz = Math.floor((z - r) / C); iz <= Math.floor((z + r) / C); iz++) {
        const cell = this.cells.get(SolidGrid.key(ix, iz));
        if (cell) for (const c of cell) if (!out.includes(c)) out.push(c);
      }
    return out;
  }
}

let grid: SolidGrid | null = null;
const solids = () => (grid ??= new SolidGrid(HUB_SOLIDS));
const nearBuf: Collider[] = [];

/** Push a circle out of one collider (in place). Returns true if it overlapped. Same maths as collision.ts. */
function pushOut(pos: { x: number; z: number }, r: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d >= min) return false;
    const nx = d > 1e-6 ? dx / d : 1;
    const nz = d > 1e-6 ? dz / d : 0;
    pos.x = c.x + nx * min;
    pos.z = c.z + nz * min;
    return true;
  }
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const ox = pos.x - c.x;
  const oz = pos.z - c.z;
  const lx = ox * cos - oz * sin;
  const lz = ox * sin + oz * cos;
  const cx = Math.max(-c.hx, Math.min(c.hx, lx));
  const cz = Math.max(-c.hz, Math.min(c.hz, lz));
  let dx = lx - cx;
  let dz = lz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  let px: number;
  let pz: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    dx /= d;
    dz /= d;
    px = cx + dx * r - lx;
    pz = cz + dz * r - lz;
  } else {
    const ax = c.hx - Math.abs(lx) + r;
    const az = c.hz - Math.abs(lz) + r;
    if (ax < az) {
      px = Math.sign(lx || 1) * ax;
      pz = 0;
    } else {
      px = 0;
      pz = Math.sign(lz || 1) * az;
    }
  }
  pos.x += px * cos + pz * sin;
  pos.z += -px * sin + pz * cos;
  return true;
}

/** Does a circle at (x, z) of radius r overlap a collider's footprint? */
function overlapsXZ(c: Collider, x: number, z: number, r: number): boolean {
  const p = { x, z };
  return pushOut(p, r, c);
}

const tmpPos = { x: 0, z: 0 };
/**
 * Move a circle out of every solid taller than `minTop` (bridge deck and ramps excepted) and back
 * onto walkable ground. Returns the correction (where it ended minus where it was), for bounces.
 */
function resolveCircle(x: number, z: number, r: number, minTop: number, skip?: (c: Collider) => boolean): { x: number; z: number; dx: number; dz: number } {
  tmpPos.x = x;
  tmpPos.z = z;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of solids().near(tmpPos.x, tmpPos.z, r + 1, nearBuf)) {
      if (c.top <= minTop || isBridgeFloor(c) || skip?.(c)) continue;
      if (pushOut(tmpPos, r, c)) moved = true;
    }
    if (!moved) break;
  }
  clampToWalkable(tmpPos, r);
  return { x: tmpPos.x, z: tmpPos.z, dx: tmpPos.x - x, dz: tmpPos.z - z };
}

// ---------------------------------------------------------------- marble
const FUNNELS = [
  // spawn table → bridge (heading north, −z) and gates table → bridge (heading south, +z)
  { zMin: BRIDGE_DECK.deckA + BRIDGE_DECK.ramp - 4, zMax: BRIDGE_DECK.deckA + BRIDGE_DECK.ramp + 14, dir: -1 },
  { zMin: BRIDGE_DECK.deckB - BRIDGE_DECK.ramp - 14, zMax: BRIDGE_DECK.deckB - BRIDGE_DECK.ramp + 4, dir: 1 },
] as const;

function stepMarble(s: HubPlayState, bodies: readonly PlayBody[], ev: PlayEvent[]) {
  const m = s.marble;
  const R = MARBLE.r;
  if (m.inNet) {
    m.vx *= Math.exp(-6 * STEP);
    m.vz *= Math.exp(-6 * STEP);
    if (s.t >= m.netUntil) {
      m.inNet = null;
      m.x = PITCH_CENTRE.x;
      m.z = PITCH_CENTRE.z;
      m.vx = m.vz = 0;
    }
  }
  const k = Math.exp(-MARBLE_DRAG * STEP);
  m.vx *= k;
  m.vz *= k;

  // Toys are solid to the marble: it bounces off them (they push it by kicking: kickMarble).
  for (const b of bodies) {
    if (b.y - rollFloorAt(b.x, b.z) > 2.2) continue; // jumping over it
    const dx = m.x - b.x;
    const dz = m.z - b.z;
    const d = Math.hypot(dx, dz);
    const min = R + BODY_R;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d;
    const nz = dz / d;
    m.x = b.x + nx * min;
    m.z = b.z + nz * min;
    const vn = m.vx * nx + m.vz * nz;
    if (vn < 0) {
      m.vx -= (1 + BODY_BOUNCE) * vn * nx;
      m.vz -= (1 + BODY_BOUNCE) * vn * nz;
    }
  }

  // The bridge's mouths gently gather a marble rolling at them, like a shallow gutter.
  if (!m.inNet && Math.abs(m.x - BRIDGE_DECK.x) < 10) {
    for (const f of FUNNELS) {
      if (m.z < f.zMin || m.z > f.zMax || m.vz * f.dir < 3) continue;
      const want = (BRIDGE_DECK.x - m.x) * 5;
      m.vx += (want - m.vx) * Math.min(1, 6 * STEP);
    }
  }

  const speed = Math.hypot(m.vx, m.vz);
  if (speed < 0.05) {
    m.vx = m.vz = 0;
  } else {
    const tx = m.x + m.vx * STEP;
    const tz = m.z + m.vz * STEP;
    const r = resolveCircle(tx, tz, R, 0.6);
    m.x = r.x;
    m.z = r.z;
    const cl = Math.hypot(r.dx, r.dz);
    if (cl > 1e-5) {
      const nx = r.dx / cl;
      const nz = r.dz / cl;
      const vn = m.vx * nx + m.vz * nz;
      if (vn < 0) {
        m.vx -= (1 + WALL_BOUNCE) * vn * nx;
        m.vz -= (1 + WALL_BOUNCE) * vn * nz;
        if (-vn > 4) ev.push({ k: 'wall', v: round2(-vn) });
      }
    }
  }

  if (!m.inNet) {
    for (const n of NETS) {
      if ((m.x - n.mouthX) * n.dir < -R * 0.6 && Math.abs(m.z - n.z) < NET.width / 2) {
        m.inNet = n.id;
        m.netUntil = s.t + GOAL_PAUSE;
        s.score[n.scorer]++;
        ev.push({ k: 'goal', net: n.id, by: m.lastTouch, score: [s.score[0], s.score[1]] });
        break;
      }
    }
  }
}

/**
 * A toy kicks (power 1) or pushes (power PUSH_POWER) the marble along `dir`. The toy must be
 * within KICK_REACH (+ `slack`) of it and not kicking it backwards through itself. Returns
 * whether it took.
 */
export function kickMarble(s: HubPlayState, body: PlayBody, dirX: number, dirZ: number, power: number, slack = 0, ev?: PlayEvent[]): boolean {
  const m = s.marble;
  if (m.inNet) return false;
  if (!Number.isFinite(dirX) || !Number.isFinite(dirZ) || !Number.isFinite(power)) return false;
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-6) return false;
  const dx = dirX / len;
  const dz = dirZ / len;
  const ox = m.x - body.x;
  const oz = m.z - body.z;
  const d = Math.hypot(ox, oz);
  if (d > KICK_REACH + slack) return false;
  if (body.y - rollFloorAt(body.x, body.z) > 2.6) return false;
  if (d > 0.5 && (ox * dx + oz * dz) / d < -0.25) return false;
  const p = Math.max(0.1, Math.min(1, power));
  const v = KICK_SPEED * p;
  // A push never slows a marble already rolling faster the same way.
  const along = m.vx * dx + m.vz * dz;
  const keep = along > v ? along : v;
  m.vx = dx * keep + (m.vx - dx * along) * 0.3;
  m.vz = dz * keep + (m.vz - dz * along) * 0.3;
  m.lastTouch = body.id;
  ev?.push({ k: 'kick', by: body.id, p: round2(p) });
  return true;
}

// ---------------------------------------------------------------- ball
const forward = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

/** Initial velocity of a throw. */
export function launchVelocity(yaw: number, power: number) {
  const p = Math.max(0, Math.min(1, power));
  const v = THROW_MIN + (THROW_MAX - THROW_MIN) * p;
  const h = v * Math.cos(THROW_ANGLE);
  const f = forward(yaw);
  return { vx: f.x * h, vy: v * Math.sin(THROW_ANGLE), vz: f.z * h };
}

/** Where a toy's ball leaves its hands. */
export function releasePoint(body: PlayBody) {
  const f = forward(body.yaw);
  return { x: body.x + f.x * RELEASE.fwd, y: body.y + RELEASE.y, z: body.z + f.z * RELEASE.fwd };
}

/** Where a held ball is drawn and simulated. */
export function heldPoint(body: PlayBody) {
  const f = forward(body.yaw);
  return { x: body.x + f.x * HELD.fwd, y: body.y + HELD.y, z: body.z + f.z * HELD.fwd };
}

/** Is a loose ball in mid-air (moving, off the floor)? A ball resting on a prop is not. */
export function ballAirborne(b: Pick<BallState, 'x' | 'y' | 'z' | 'vy' | 'holder'>): boolean {
  return !b.holder && b.vy !== 0 && b.y - BALL.r > rollFloorAt(b.x, b.z) + AIRBORNE_Y;
}

/** Can a toy at `body` catch a mid-air ball centred at `p`? */
export function inSnatchReach(body: PlayBody, p: { x: number; y: number; z: number }, slack = 0): boolean {
  if (Math.hypot(p.x - body.x, p.z - body.z) > GRAB_REACH + slack) return false;
  const up = p.y - body.y;
  return up >= -SNATCH_REACH_Y.below - slack * 0.5 && up <= SNATCH_REACH_Y.above + slack * 0.5;
}

export interface GrabOptions {
  /**
   * Where the ball was a moment ago (newest last), for the server's lag allowance: a player
   * presses on the ball they see, which is a little behind the server's. Any one in reach counts.
   */
  rewind?: readonly { x: number; y: number; z: number }[];
  /** Is the current holder dribbling (moving on the ground)? Only a dribbled ball can be stolen. */
  holderDribbling?: boolean;
}

/**
 * A toy takes the ball (Interact): picks it up off the floor, snatches it in mid-air, or steals
 * it from a holder who is dribbling. Returns whether it took.
 */
export function grabBall(s: HubPlayState, body: PlayBody, slack = 0, ev?: PlayEvent[], opts?: GrabOptions): boolean {
  const b = s.ball;
  let kind: 'grab' | 'snatch' | 'steal';
  const from = b.holder;
  if (from) {
    if (from === body.id || !opts?.holderDribbling) return false;
    if (s.t - b.grabT < STEAL_GUARD) return false;
    if (Math.hypot(b.x - body.x, b.z - body.z) > STEAL_REACH + slack) return false;
    kind = 'steal';
  } else if (ballAirborne(b)) {
    if (!inSnatchReach(body, b, slack) && !opts?.rewind?.some((p) => inSnatchReach(body, p, slack))) return false;
    kind = 'snatch';
  } else {
    if (Math.hypot(b.x - body.x, b.z - body.z) > GRAB_REACH + slack) return false;
    if (b.y - Math.max(rollFloorAt(b.x, b.z), body.y) > 4.5) return false;
    kind = 'grab';
  }
  b.holder = body.id;
  b.idle = b.stuck = 0;
  b.grabT = s.t;
  const h = heldPoint(body);
  b.x = h.x;
  b.y = h.y;
  b.z = h.z;
  b.vx = b.vy = b.vz = 0;
  if (kind === 'steal') ev?.push({ k: 'steal', by: body.id, from: from! });
  else ev?.push({ k: kind, by: body.id });
  return true;
}

export function throwBall(s: HubPlayState, body: PlayBody, yaw: number, power: number, ev?: PlayEvent[]): boolean {
  const b = s.ball;
  if (b.holder !== body.id || !Number.isFinite(yaw) || !Number.isFinite(power)) return false;
  const p = Math.max(0, Math.min(1, power));
  const at = releasePoint({ ...body, yaw });
  // Out of a wall or a prop first (a toy facing a building throws from in front of it).
  const r = resolveCircle(at.x, at.z, BALL.r, at.y - BALL.r);
  b.x = r.x;
  b.y = at.y;
  b.z = r.z;
  const v = launchVelocity(yaw, p);
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.holder = null;
  b.thrower = body.id;
  b.idle = b.stuck = 0;
  ev?.push({ k: 'throw', by: body.id, p: round2(p) });
  return true;
}

/** The holder lets go (left the room, went into a trial): the ball drops from its hands. */
export function dropBall(s: HubPlayState, id: string, body: PlayBody | null, ev?: PlayEvent[]) {
  const b = s.ball;
  if (b.holder !== id) return;
  b.holder = null;
  if (body) {
    const h = heldPoint(body);
    const r = resolveCircle(h.x, h.z, BALL.r, h.y - BALL.r);
    b.x = r.x;
    b.y = h.y;
    b.z = r.z;
  }
  b.vx = b.vy = b.vz = 0;
  b.idle = b.stuck = 0;
  ev?.push({ k: 'drop', by: id });
}

function resetBall(b: BallState) {
  b.x = BALL.spot.x;
  b.y = BALL.r;
  b.z = BALL.spot.z;
  b.vx = b.vy = b.vz = 0;
  b.holder = null;
  b.idle = b.stuck = 0;
  b.grabT = -1e9;
}

const BOARD = {
  minX: HOOP.x - HOOP.board.w / 2,
  maxX: HOOP.x + HOOP.board.w / 2,
  minY: HOOP.board.y - HOOP.board.h / 2,
  maxY: HOOP.board.y + HOOP.board.h / 2,
  minZ: HOOP.board.z - HOOP.board.t / 2,
  maxZ: HOOP.board.z + HOOP.board.t / 2,
};

/** One ball sub-step of `dt` seconds (unheld). Returns true when it scored. */
function ballSub(s: HubPlayState, dt: number, ev: PlayEvent[]) {
  const b = s.ball;
  const R = BALL.r;
  const prevY = b.y;
  b.vy -= BALL_GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Props: walls below their top, floors above it.
  let support = 0;
  const p = { x: b.x, z: b.z };
  for (const c of solids().near(b.x, b.z, R + 1, nearBuf)) {
    if (isBridgeFloor(c) || c.top <= 0.3) continue;
    if (!overlapsXZ(c, p.x, p.z, R * 0.7)) {
      if (b.y - R >= c.top) continue;
      // the ball's side against the prop's side
      const before = { x: p.x, z: p.z };
      if (!pushOut(p, R, c)) continue;
      const cx = p.x - before.x;
      const cz = p.z - before.z;
      const cl = Math.hypot(cx, cz);
      if (cl > 1e-6) reflect(b, cx / cl, 0, cz / cl, 0.5, ev, 'board');
      continue;
    }
    if (prevY - R >= c.top - 0.25) {
      // landing on top
      support = Math.max(support, c.top);
    } else {
      const before = { x: p.x, z: p.z };
      pushOut(p, R, c);
      const cx = p.x - before.x;
      const cz = p.z - before.z;
      const cl = Math.hypot(cx, cz);
      if (cl > 1e-6) reflect(b, cx / cl, 0, cz / cl, 0.5, ev, 'board');
    }
  }
  const before = { x: p.x, z: p.z };
  clampToWalkable(p, R);
  {
    const cx = p.x - before.x;
    const cz = p.z - before.z;
    const cl = Math.hypot(cx, cz);
    if (cl > 1e-6) reflect(b, cx / cl, 0, cz / cl, 0.5, ev, 'board');
  }
  b.x = p.x;
  b.z = p.z;

  // Backboard (an axis-aligned box: the hoop faces +z).
  {
    const qx = Math.max(BOARD.minX, Math.min(BOARD.maxX, b.x));
    const qy = Math.max(BOARD.minY, Math.min(BOARD.maxY, b.y));
    const qz = Math.max(BOARD.minZ, Math.min(BOARD.maxZ, b.z));
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
      reflect(b, nx, ny, nz, 0.6, ev, 'board');
    }
  }
  // Rim: a ring of radius rim.r (tube rim.tube) in the horizontal plane.
  {
    const rim = HOOP.rim;
    const hx = b.x - rim.x;
    const hz = b.z - rim.z;
    const hd = Math.hypot(hx, hz);
    const qx = rim.x + (hd > 1e-6 ? hx / hd : 1) * rim.r;
    const qz = rim.z + (hd > 1e-6 ? hz / hd : 0) * rim.r;
    const ex = b.x - qx;
    const ey = b.y - rim.y;
    const ez = b.z - qz;
    const d = Math.hypot(ex, ey, ez);
    const min = R + rim.tube;
    if (d < min && d > 1e-6) {
      const nx = ex / d;
      const ny = ey / d;
      const nz = ez / d;
      b.x = qx + nx * min;
      b.y = rim.y + ny * min;
      b.z = qz + nz * min;
      reflect(b, nx, ny, nz, 0.5, ev, 'rim');
    }
  }

  // Through the hoop: the centre drops through the rim's plane inside the ring.
  let scored = false;
  if (prevY > HOOP.rim.y && b.y <= HOOP.rim.y && b.vy < 0) {
    const k = (prevY - HOOP.rim.y) / Math.max(1e-6, prevY - b.y);
    const cx = b.x - b.vx * dt * (1 - k);
    const cz = b.z - b.vz * dt * (1 - k);
    if (Math.hypot(cx - HOOP.rim.x, cz - HOOP.rim.z) < HOOP.rim.r - HOOP.rim.tube) {
      s.hoops++;
      scored = true;
      // the net slows it down
      b.vx *= 0.3;
      b.vz *= 0.3;
      b.vy *= 0.5;
      ev.push({ k: 'hoop', by: b.thrower, total: s.hoops });
    }
  }

  // Floor: the table, the bridge deck, or the top of a prop it landed on.
  const floor = Math.max(rollFloorAt(b.x, b.z), support);
  if (b.y - R <= floor) {
    b.y = floor + R;
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
  return { scored, floor, onProp: support > 0 && b.y - R <= support + 0.01 };
}

function reflect(b: BallState, nx: number, ny: number, nz: number, e: number, ev: PlayEvent[], kind: 'rim' | 'board') {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  b.vz -= (1 + e) * vn * nz;
  if (-vn > 6) ev.push({ k: kind, v: round2(-vn) });
}

function stepBall(s: HubPlayState, bodies: readonly PlayBody[], ev: PlayEvent[]) {
  const b = s.ball;
  if (b.holder) {
    const body = bodies.find((x) => x.id === b.holder);
    if (!body) {
      dropBall(s, b.holder, null, ev);
      return;
    }
    const h = heldPoint(body);
    b.x = h.x;
    b.y = h.y;
    b.z = h.z;
    b.vx = b.vy = b.vz = 0;
    return;
  }
  const resting = b.vx === 0 && b.vy === 0 && b.vz === 0 && b.y - BALL.r <= rollFloorAt(b.x, b.z) + 0.01;
  let onProp = false;
  if (!resting) {
    for (let i = 0; i < BALL_SUBSTEPS; i++) {
      const r = ballSub(s, STEP / BALL_SUBSTEPS, ev);
      onProp = r.onProp;
    }
    if (Math.hypot(b.vx, b.vz) < 0.15 && b.vy === 0) b.vx = b.vz = 0;
  }
  const still = b.vx === 0 && b.vz === 0 && Math.abs(b.vy) < 1e-9;
  b.idle = still ? b.idle + STEP : 0;
  b.stuck = still && onProp ? b.stuck + STEP : still && b.y - BALL.r > rollFloorAt(b.x, b.z) + 0.3 ? b.stuck + STEP : 0;
  const away = Math.hypot(b.x - BALL.spot.x, b.z - BALL.spot.z) > 2;
  if ((b.idle > BALL_IDLE_RESET && away) || b.stuck > BALL_STUCK_RESET) {
    resetBall(b);
    ev.push({ k: 'reset' });
  }
}

// ---------------------------------------------------------------- the step
/** Advance one fixed STEP. `bodies` are the toys in the hub (positions as the authority knows them). */
export function stepHubPlay(s: HubPlayState, bodies: readonly PlayBody[], ev: PlayEvent[]) {
  s.t += STEP;
  stepMarble(s, bodies, ev);
  stepBall(s, bodies, ev);
}

/** Copy a state (for predictions). */
export function cloneHubPlay(s: HubPlayState): HubPlayState {
  return { t: s.t, marble: { ...s.marble }, ball: { ...s.ball }, score: [s.score[0], s.score[1]], hoops: s.hoops };
}

/**
 * The path a throw would take: up to `max` points (x, y, z triples into `out`), one every `every`
 * steps, until the ball first touches the floor or scores. Uses the real step, so the preview bends
 * off the rim and the backboard exactly as the throw will. Returns the number of points and
 * whether it scores.
 */
export function predictThrow(from: PlayBody, yaw: number, power: number, out: Float32Array, max: number, every = 3): { n: number; scores: boolean } {
  const s = createHubPlay();
  s.ball.holder = from.id;
  const ev: PlayEvent[] = [];
  throwBall(s, from, yaw, power);
  let n = 0;
  let scores = false;
  const b = s.ball;
  for (let i = 0; i < 240 && n < max; i++) {
    if (i % every === 0) {
      out[n * 3] = b.x;
      out[n * 3 + 1] = b.y;
      out[n * 3 + 2] = b.z;
      n++;
    }
    ev.length = 0;
    stepBall(s, [], ev);
    if (ev.some((e) => e.k === 'hoop')) scores = true;
    if (b.y - BALL.r <= rollFloorAt(b.x, b.z) + 0.02 || ev.some((e) => e.k === 'bounce')) {
      if (n < max) {
        out[n * 3] = b.x;
        out[n * 3 + 1] = b.y;
        out[n * 3 + 2] = b.z;
        n++;
      }
      break;
    }
  }
  return { n, scores };
}

/** Facing from a point to the rim (for aim assist). */
export function yawToHoop(x: number, z: number) {
  return Math.atan2(HOOP.rim.x - x, HOOP.rim.z - z);
}

/**
 * The power (0..1) that sinks a throw from `from` facing `yaw`, or null: searched with the real
 * step. For the aim assist's "perfect power" tick and the tests.
 */
export function solveShot(from: PlayBody, yaw: number): number | null {
  const out = new Float32Array(3 * 100);
  let best: number | null = null;
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    if (predictThrow(from, yaw, p, out, 100).scores) {
      // the middle of the scoring window is the safest
      let j = i;
      while (j + 1 <= 200 && predictThrow(from, yaw, (j + 1) / 200, out, 100).scores) j++;
      best = (i + j) / 400;
      break;
    }
  }
  return best;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Fixed-step driver: advance `s` to sim time `t` (s), catching up at most `maxSteps`. */
export function advanceHubPlay(s: HubPlayState, t: number, bodies: readonly PlayBody[], ev: PlayEvent[], maxSteps = 30) {
  let n = 0;
  while (s.t + STEP <= t + 1e-9 && n < maxSteps) {
    stepHubPlay(s, bodies, ev);
    n++;
  }
  if (s.t + STEP <= t) s.t = t; // too far behind (a stalled host): drop the backlog
}
