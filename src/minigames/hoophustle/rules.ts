/**
 * Hoop Hustle: a 75-second shootout at one shared hoop. Deterministic, fixed 60 Hz steps, seeded;
 * no DOM, three.js or wall clock, so the online server runs it unchanged (server/games.ts).
 *
 * Every toy shoots from its own spot on a taped arc (1, 2 or 3 points by distance). Hold to charge,
 * let go to throw: the Hub basketball's physics (physics.ts), its aim assist (a facing roughly at
 * the hoop bends onto it), and a power assist for the trial: letting go within the gold zone of the
 * charge meter (ASSIST_BAND around the perfect power) throws the perfect power. After a make the toy
 * hops to a new free spot (seeded). At half time the hoop starts sliding on a wind-up track (with a
 * warning first); in the last 15 seconds each toy's next ball is gold and scores double. Shots in
 * the air at the buzzer still count. Most points wins; ties go to made baskets, then share a place.
 */
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { rankByKey } from '../scoring';
import { seededRng, shuffle, subSeed } from '../rng';
import { ASSIST_ANGLE, BALL_R, STEP_MS, angleDelta, launch, perfectPower, stepBall, yawToHoop, type Ball, type BallHit } from './physics';

export interface HoopConfig {
  durationMs: number;
  /** After the buzzer and the last ball: how long the court stays up before results. */
  endingMs: number;
  /** Charge time to full power (the Hub's 1100 ms). */
  chargeMs: number;
  /** A new ball after a miss (ms after the shot is decided). */
  reloadMs: number;
  /** The hop to a new spot after a make. */
  moveMs: number;
  /** The hoop slides from `slideAt` (default: half time), with a warning `slideWarnMs` before. */
  slideAt: number;
  slideWarnMs: number;
  /** Slide half-travel (cm) and one full left-right-left cycle (ms). */
  slideAmp: number;
  slidePeriodMs: number;
  /** The last `goldMs` of the match: each toy's next `goldBalls` balls are gold (double points). */
  goldMs: number;
  goldBalls: number;
  /** A ball still in the air this long after the throw counts as a miss. */
  flightMaxMs: number;
  /** How far back (ms) a throw's own release time may be honoured (online lag; 0 = none). */
  maxLagMs: number;
  /** Ring radii (cm from the hoop's centre line), spots per ring and the arc's half-angle (degrees). */
  rings: [number, number, number];
  spotsPerRing: number;
  arcDeg: number;
  /** Power assist half-width per ring (1, 2, 3 points): let go this close to the perfect power and it is perfect. */
  assistBand: [number, number, number];
}

export const DEFAULT_CONFIG: HoopConfig = {
  durationMs: 75000,
  endingMs: 1500,
  chargeMs: 1100,
  reloadMs: 350,
  moveMs: 700,
  slideAt: 37500,
  slideWarnMs: 3000,
  slideAmp: 5,
  slidePeriodMs: 5000,
  goldMs: 15000,
  goldBalls: 1,
  flightMaxMs: 3500,
  maxLagMs: 250,
  rings: [16, 23, 30],
  spotsPerRing: 8,
  arcDeg: 62,
  assistBand: [0.06, 0.045, 0.035],
};

export type HoopInput =
  | { type: 'aim'; yaw: number }
  | { type: 'charge' }
  | { type: 'cancel' }
  /** `power` 0..1 (else the rules' own charge timer); `yaw` (else the last aim); `at`: the match time it was let go. */
  | { type: 'throw'; power?: number; yaw?: number; at?: number };

export interface Spot {
  x: number;
  z: number;
  ring: 0 | 1 | 2;
  value: 1 | 2 | 3;
}

export interface Shooter {
  id: string;
  spot: number;
  yaw: number;
  /** Holding a ball, ready to shoot. */
  holding: boolean;
  /** When the next ball arrives (after a miss or a hop). */
  readyAt: number;
  charging: boolean;
  chargeAt: number;
  /** The ball in hand is gold; gold balls still to come. */
  gold: boolean;
  goldLeft: number;
  points: number;
  makes: number;
  shots: number;
  /** Makes in a row (for the HUD). */
  streak: number;
  /** Hopping between spots after a make. */
  move: { from: number; to: number; at: number; until: number } | null;
  lastMake: { at: number; points: number; gold: boolean } | null;
  lastMiss: { at: number; kind: 'short' | 'long' } | null;
  lastThrow: number;
}

export interface FlyingBall extends Ball {
  owner: string;
  n: number;
  /** Match time it left the hands, and steps simulated since (the hoop's clock for this ball). */
  born: number;
  steps: number;
  /** Match time of its last update (the Scene extrapolates online snapshots from it). */
  at: number;
  gold: boolean;
  value: number;
  /** Spot it was thrown from (for short/long). */
  fromX: number;
  fromZ: number;
  result: 'make' | 'miss' | null;
  resultAt: number;
}

export interface HoopState {
  kind: 'hoop-hustle';
  seed: number;
  config: HoopConfig;
  phase: 'play' | 'buzzer' | 'over';
  tick: number;
  /** Match time (ms). */
  t: number;
  remainder: number;
  spots: Spot[];
  players: Shooter[];
  balls: FlyingBall[];
  ballSerial: number;
  /** Warning / slide / gold announcements already made. */
  announced: { warn: boolean; slide: boolean; gold: boolean };
  overAt: number;
  pending: Record<string, HoopInput[]>;
  events: MatchEvent[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The hoop's x (cm) at match time `t`: still until `slideAt`, then a clipped sine (it rests at each end). */
export function hoopXAt(c: Pick<HoopConfig, 'slideAt' | 'slideAmp' | 'slidePeriodMs'>, t: number): number {
  if (t <= c.slideAt) return 0;
  const u = ((t - c.slideAt) / c.slidePeriodMs) * Math.PI * 2;
  return c.slideAmp * Math.max(-1, Math.min(1, 1.5 * Math.sin(u)));
}

/** The arc's spots: ring by ring (1, 2, 3 points), left to right. */
export function buildSpots(c: Pick<HoopConfig, 'rings' | 'spotsPerRing' | 'arcDeg'>): Spot[] {
  const out: Spot[] = [];
  const half = (c.arcDeg * Math.PI) / 180;
  c.rings.forEach((r, ring) => {
    for (let i = 0; i < c.spotsPerRing; i++) {
      const a = c.spotsPerRing === 1 ? 0 : -half + (2 * half * i) / (c.spotsPerRing - 1);
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, ring: ring as 0 | 1 | 2, value: (ring + 1) as 1 | 2 | 3 });
    }
  });
  return out;
}

/** Spots nobody stands on or is hopping to. */
export function freeSpots(s: HoopState, except?: Shooter): number[] {
  const taken = new Set<number>();
  for (const p of s.players) {
    if (p === except) continue;
    taken.add(p.spot);
    if (p.move) taken.add(p.move.to);
  }
  return s.spots.map((_, i) => i).filter((i) => !taken.has(i));
}

/** Where a toy stands right now (between spots while hopping). */
export function shooterPos(s: HoopState, p: Shooter, t = s.t) {
  if (p.move) {
    const a = s.spots[p.move.from];
    const b = s.spots[p.move.to];
    const k = clamp01((t - p.move.at) / (p.move.until - p.move.at));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, hop: k };
  }
  const sp = s.spots[p.spot];
  return { x: sp.x, z: sp.z, hop: 1 };
}

/** The power-assist band for a spot. */
export const assistBand = (c: HoopConfig, spot: Spot) => c.assistBand[spot.ring];

/** Can this toy throw right now? */
export const canShoot = (s: HoopState, p: Shooter) => s.phase === 'play' && p.holding && !p.move;

/**
 * The perfect power for a throw from `spot` let go at match time `at`, aimed at the hoop. Pure, so
 * it is memoised: before the slide it depends on the spot only; after, on the step it is let go.
 */
const perfectMemo = new Map<string, number | null>();
export function perfectPowerAt(c: HoopConfig, spot: Spot, at: number): number | null {
  // The hoop is still for flights that land before the slide; after it starts, only the slide's phase matters.
  const rel = at - c.slideAt;
  const phase = rel < -4000 ? 'still' : rel < 0 ? Math.round(rel / STEP_MS) : Math.round((rel % c.slidePeriodMs) / STEP_MS);
  const key = `${spot.x.toFixed(3)},${spot.z.toFixed(3)},${c.slideAmp},${c.slidePeriodMs},${phase}`;
  if (perfectMemo.has(key)) return perfectMemo.get(key)!;
  const p = perfectPower(spot.x, spot.z, yawToHoop(spot.x, spot.z, hoopXAt(c, at)), (i) => hoopXAt(c, at + i * STEP_MS));
  if (perfectMemo.size > 6000) perfectMemo.clear();
  perfectMemo.set(key, p);
  return p;
}

/** The facing and power a throw from `p`'s spot actually leaves with (both assists applied). */
export function assistedThrow(s: HoopState, spot: Spot, yaw: number, power: number, at: number): { yaw: number; power: number; perfect: number | null } {
  const c = s.config;
  const want = yawToHoop(spot.x, spot.z, hoopXAt(c, at));
  const inCone = Math.abs(angleDelta(want, yaw)) < ASSIST_ANGLE;
  const aimed = inCone ? want : yaw;
  const perfect = inCone ? perfectPowerAt(c, spot, at) : null;
  const p = perfect !== null && Math.abs(power - perfect) <= assistBand(c, spot) ? perfect : power;
  return { yaw: aimed, power: p, perfect };
}

function emit(s: HoopState, e: MatchEvent) {
  s.events.push(e);
}

function giveBall(s: HoopState, p: Shooter) {
  p.holding = true;
  p.charging = false;
  if (s.t >= s.config.durationMs - s.config.goldMs && p.goldLeft > 0 && !p.gold) {
    p.gold = true;
    p.goldLeft--;
  }
}

function throwBall(s: HoopState, p: Shooter, input: Extract<HoopInput, { type: 'throw' }>) {
  const c = s.config;
  // The release time: now, or (online) when the player let go, at most maxLagMs ago, on a step.
  let at = s.t;
  if (typeof input.at === 'number' && Number.isFinite(input.at) && c.maxLagMs > 0) {
    const back = Math.max(0, Math.min(c.maxLagMs, s.t - input.at));
    at = s.t - Math.round(back / STEP_MS) * STEP_MS;
  }
  const power = typeof input.power === 'number' && Number.isFinite(input.power) ? clamp01(input.power) : p.charging ? clamp01((s.t - p.chargeAt) / c.chargeMs) : 0;
  const yaw = typeof input.yaw === 'number' && Number.isFinite(input.yaw) ? input.yaw : p.yaw;
  const spot = s.spots[p.spot];
  const shot = assistedThrow(s, spot, yaw, power, at);
  const b = launch(spot.x, spot.z, shot.yaw, shot.power);
  const ball: FlyingBall = {
    ...b,
    owner: p.id,
    n: s.ballSerial++,
    born: at,
    steps: 0,
    at,
    gold: p.gold,
    value: spot.value * (p.gold ? 2 : 1),
    fromX: spot.x,
    fromZ: spot.z,
    result: null,
    resultAt: 0,
  };
  p.yaw = yaw;
  p.holding = false;
  p.charging = false;
  p.gold = false;
  p.shots++;
  p.lastThrow = s.t;
  s.balls.push(ball);
  emit(s, { type: 'hh-throw', id: p.id, power: Math.round(shot.power * 1000) / 1000, gold: ball.gold, perfect: shot.perfect !== null && shot.power === shot.perfect });
  // Online catch-up: a throw let go a few steps ago has already flown those steps.
  while (ball.at + STEP_MS <= s.t + 1e-6 && !ball.result) stepFlight(s, ball);
}

function decide(s: HoopState, ball: FlyingBall, made: boolean) {
  const p = s.players.find((q) => q.id === ball.owner);
  ball.result = made ? 'make' : 'miss';
  ball.resultAt = s.t;
  if (!p) return;
  if (made) {
    p.points += ball.value;
    p.makes++;
    p.streak++;
    p.lastMake = { at: s.t, points: ball.value, gold: ball.gold };
    emit(s, { type: 'hh-score', id: p.id, points: ball.value, gold: ball.gold, total: p.points });
    if (s.phase === 'play') hopToNewSpot(s, p);
    else p.readyAt = 1e12;
  } else {
    p.streak = 0;
    // Short or long: did it come down nearer than the hoop, or past it?
    const dHoop = Math.hypot(ball.fromX - hoopXAt(s.config, s.t), ball.fromZ);
    const dBall = Math.hypot(ball.fromX - ball.x, ball.fromZ - ball.z);
    const kind = dBall < dHoop - 0.5 ? 'short' : 'long';
    p.lastMiss = { at: s.t, kind };
    emit(s, { type: 'hh-miss', id: p.id, kind });
    p.readyAt = s.t + s.config.reloadMs;
  }
}

function hopToNewSpot(s: HoopState, p: Shooter) {
  const free = freeSpots(s, p).filter((i) => i !== p.spot);
  if (!free.length) {
    p.readyAt = s.t + s.config.reloadMs;
    return;
  }
  const rng = seededRng(subSeed(s.seed, `${p.id}:spot:${p.makes}`));
  // A ring first (each equally likely, among rings with room), then a spot on it.
  const rings = [0, 1, 2].filter((r) => free.some((i) => s.spots[i].ring === r));
  const ring = rings[Math.floor(rng() * rings.length)];
  const options = free.filter((i) => s.spots[i].ring === ring);
  const to = options[Math.floor(rng() * options.length)];
  p.move = { from: p.spot, to, at: s.t, until: s.t + s.config.moveMs };
  p.spot = to;
  p.yaw = yawToHoop(s.spots[to].x, s.spots[to].z, hoopXAt(s.config, s.t));
  p.charging = false;
  emit(s, { type: 'hh-move', id: p.id, from: p.move.from, to, value: s.spots[to].value });
}

/** One 60 Hz step of a ball's flight (against the hoop where it is on the ball's own clock). */
function stepFlight(s: HoopState, ball: FlyingBall) {
  const hits: BallHit[] = [];
  stepBall(ball, hoopXAt(s.config, ball.born + ball.steps * STEP_MS), hits);
  ball.steps++;
  ball.at = ball.born + ball.steps * STEP_MS;
  for (const h of hits) {
    if (h.k === 'score') {
      if (!ball.result) decide(s, ball, true);
      emit(s, { type: 'hh-swish', id: ball.owner, gold: ball.gold });
    } else if (h.k === 'floor') {
      if (h.v > 8) emit(s, { type: 'hh-bounce', v: h.v });
      if (!ball.result) decide(s, ball, false);
    } else emit(s, { type: h.k === 'rim' ? 'hh-rim' : 'hh-board', v: h.v });
  }
  if (!ball.result && ball.at - ball.born >= s.config.flightMaxMs) decide(s, ball, false);
}

function applyInputs(s: HoopState, p: Shooter, inputs: HoopInput[]) {
  for (const input of inputs) {
    if (!input || typeof input !== 'object') continue;
    if (input.type === 'aim') {
      if (Number.isFinite(input.yaw)) p.yaw = Math.atan2(Math.sin(input.yaw), Math.cos(input.yaw));
    } else if (input.type === 'charge') {
      if (canShoot(s, p) && !p.charging) {
        p.charging = true;
        p.chargeAt = s.t;
        emit(s, { type: 'hh-charge', id: p.id });
      }
    } else if (input.type === 'cancel') {
      p.charging = false;
    } else if (input.type === 'throw') {
      if (canShoot(s, p)) throwBall(s, p, input);
    }
  }
}

function tick(s: HoopState) {
  const c = s.config;
  // Inputs (order does not matter: nothing a toy does changes another toy's throw).
  for (const p of s.players) {
    const q = s.pending[p.id];
    if (q?.length) {
      s.pending[p.id] = [];
      if (s.phase === 'play') applyInputs(s, p, q);
    }
  }
  // Balls in flight, and a while after they are decided (they drop through the net, bounce away).
  for (const b of s.balls) stepFlight(s, b);
  s.balls = s.balls.filter((b) => !b.result || s.t - b.resultAt < 900);

  s.tick++;
  s.t = s.tick * STEP_MS;

  // Hops land; new balls arrive.
  for (const p of s.players) {
    if (p.move && s.t >= p.move.until) {
      p.move = null;
      p.readyAt = s.t;
    }
    if (s.phase === 'play' && !p.holding && !p.move && s.t >= p.readyAt && !s.balls.some((b) => b.owner === p.id && !b.result)) giveBall(s, p);
  }

  if (s.phase === 'play') {
    if (!s.announced.warn && s.t >= c.slideAt - c.slideWarnMs) {
      s.announced.warn = true;
      emit(s, { type: 'hh-slide-warn' });
    }
    if (!s.announced.slide && s.t >= c.slideAt) {
      s.announced.slide = true;
      emit(s, { type: 'hh-slide' });
    }
    if (!s.announced.gold && s.t >= c.durationMs - c.goldMs) {
      s.announced.gold = true;
      for (const p of s.players) {
        p.goldLeft = c.goldBalls;
        if (p.holding && !p.gold && p.goldLeft > 0) {
          p.gold = true;
          p.goldLeft--;
        }
      }
      emit(s, { type: 'hh-gold' });
    }
    if (s.t >= c.durationMs) {
      s.phase = 'buzzer';
      for (const p of s.players) {
        p.charging = false;
        p.holding = false;
      }
      emit(s, { type: 'hh-buzzer' });
    }
  }
  if (s.phase === 'buzzer') {
    const flying = s.balls.some((b) => !b.result);
    const busy = s.players.some((p) => p.move);
    if (!flying && !busy && s.overAt < 0) s.overAt = s.t + c.endingMs;
    if (s.overAt >= 0 && s.t >= s.overAt) s.phase = 'over';
  }
}

export const hoopRules: RulesCore<HoopState, HoopInput, HoopConfig> & { forfeit(s: HoopState, id: string): void } = {
  init(contestants: Contestant[], seed, config) {
    const c: HoopConfig = { ...DEFAULT_CONFIG, ...config };
    if (contestants.length < 1 || contestants.length > 8 || new Set(contestants.map((x) => x.id)).size !== contestants.length) throw new Error('Hoop Hustle needs 1 to 8 toys.');
    if (c.spotsPerRing < contestants.length) throw new Error('Hoop Hustle needs a spot on the near ring for every toy.');
    const spots = buildSpots(c);
    const rng = seededRng(subSeed(seed, 'start'));
    // Everyone starts on a 1-point spot, spread out along the near ring.
    const near = spots.map((_, i) => i).filter((i) => spots[i].ring === 0);
    const order = shuffle(rng, near).slice(0, contestants.length).sort((a, b) => a - b);
    const seats = shuffle(rng, contestants.map((_, i) => i));
    const players: Shooter[] = contestants.map((ct, i) => {
      const spot = order[seats[i]];
      const sp = spots[spot];
      return {
        id: ct.id,
        spot,
        yaw: Math.atan2(-sp.x, -sp.z),
        holding: true,
        readyAt: 0,
        charging: false,
        chargeAt: 0,
        gold: false,
        goldLeft: 0,
        points: 0,
        makes: 0,
        shots: 0,
        streak: 0,
        move: null,
        lastMake: null,
        lastMiss: null,
        lastThrow: -1e9,
      };
    });
    return {
      kind: 'hoop-hustle',
      seed,
      config: c,
      phase: 'play',
      tick: 0,
      t: 0,
      remainder: 0,
      spots,
      players,
      balls: [],
      ballSerial: 0,
      announced: { warn: false, slide: false, gold: false },
      overAt: -1,
      pending: {},
      events: [],
    };
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    for (const p of s.players) {
      const list = inputs[p.id];
      if (!list?.length) continue;
      const q = (s.pending[p.id] ??= []);
      q.push(...list.slice(0, Math.max(0, 64 - q.length)));
    }
    s.remainder += dtMs;
    while (s.remainder + 1e-6 >= STEP_MS) {
      s.remainder -= STEP_MS;
      tick(s);
      if ((s.phase as string) === 'over') break;
    }
    return s;
  },
  isOver: (s) => s.phase === 'over',
  result(s) {
    const ordered = [...s.players].sort((a, b) => b.points - a.points || b.makes - a.makes);
    return {
      durationMs: Math.min(s.t, s.config.durationMs),
      placements: rankByKey(ordered.map((p) => ({ contestantId: p.id, score: p.points, key: `${p.points}|${p.makes}` }))),
      stats: {
        baskets: s.players.reduce((n, p) => n + p.makes, 0),
        shots: s.players.reduce((n, p) => n + p.shots, 0),
        bestPoints: Math.max(0, ...s.players.map((p) => p.points)),
      },
    };
  },
  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
  /** A player who leaves an online match stops shooting (their points stand). */
  forfeit(s, id) {
    const p = s.players.find((q) => q.id === id);
    if (!p) return;
    p.holding = false;
    p.charging = false;
    p.readyAt = 1e12;
  },
};

/** For the HUD and bots: the ball radius (cm). */
export { BALL_R };
