/**
 * Hoop Clash rules core: team basketball, Red against Blue, 2 v 2 or 4 v 4, with the Hub's ball.
 *
 * Pure and deterministic (no DOM, no three.js, no wall clock, randomness only from the seed), so
 * the online server runs it unchanged. The ball is the Hub basketball (src/minigames/shared/
 * courtBall.ts, built on src/game/hubPlaySim.ts): the same 60° throw, charge power, rim, backboard
 * and floor bounces, and the same pick-up, mid-air snatch and dribble-steal reaches and guard. The
 * shot meter is the shared one (src/minigames/shared/shotMeter.ts): held, it winds up and back
 * down; letting go shoots at the power it shows, and a `cancel` input drops the charge unshot.
 *
 * Toys a match needs beyond its contestants (to make two even teams) are "fillers": the rules core
 * itself drives them with the same AI the bot policy uses (ai.ts), so they play on every device and
 * on the server alike. A player who leaves an online match is handed to the AI the same way.
 *
 * The rules (provisional; see README.md): a jump ball at centre; 2 points inside the arc, 3 beyond;
 * after a basket the other team inbounds under that basket; out of bounds or a shot-clock violation
 * gives the other team a sideline inbound; two halves, switching ends; a tie goes to overtime where
 * the next basket wins (capped, then a tie). No fouls.
 */
import type { BotDifficulty, Contestant, MatchEvent, RulesCore } from '../types';
import { seededRng, shuffle, subSeed } from '../rng';
import { makeBots } from '../bots';
import { rankByKey } from '../scoring';
import { PAINT_JOBS } from '../../game/palette';
import type { HatId, KeySkinId } from '../../game/cosmetics';
import { DRIBBLE_SPEED, STEAL_GUARD, STEAL_REACH, inSnatchReach, type PlayBody } from '../../game/hubPlaySim';
import { TOY_TUNING, stepMover, type MoveTuning, type Mover } from '../shared/movement';
import { SHOT_SWEEP_MS, shotPower } from '../shared/shotMeter';
import {
  BALL_R,
  courtBallAirborne,
  createCourtBall,
  heldAt,
  holdCourtBall,
  inPickupReach,
  passCourtBall,
  solveCourtShot,
  stepCourtBall,
  throwCourtBall,
  yawTo,
  type CourtBall,
  type CourtBallEvent,
} from '../shared/courtBall';
import { COURT, COURT_SPEC, HOOPS, MOVE_BOUNDS, SOLIDS, inCourt, isThree, offAxis, type Team } from './court';
import { aiDecide, createAiMemory, type AiMemory } from './ai';

export const STEP_MS = 1000 / 60;

// ---------------------------------------------------------------- tuning
/** One sweep of the shot meter, empty to full or back (ms): the Hub's. Held longer, it winds back down. */
export const CHARGE_MS = SHOT_SWEEP_MS;
/** The aim bends onto the attacking rim when it is this close (cm) and within this angle of your facing: the Hub's. */
export const ASSIST_RANGE = 40;
export const ASSIST_ANGLE = 0.75;
/** A swipe (the action button without the ball) reaches for this long, then rests. */
export const SWIPE_MS = 280;
export const SWIPE_COOLDOWN_MS = 620;
/** "Pass to me" (Pass without the ball) lasts this long. */
export const CALL_MS = 1600;
/** Passes travel at about this speed (cm/s), within these flight times (s). */
export const PASS_SPEED = 55;
export const PASS_FLIGHT = { min: 0.16, max: 0.8 };
/** A loose ball on the floor is picked up by walking into it within this reach. */
export const WALK_PICKUP = 1.8;
/** A pass or a loose ball that flies into a toy's body is caught. */
export const BODY_CATCH = { r: 1.1, below: 0.2, above: 3.9 };
/** Your own throw can't be caught back for this long (ms). */
export const OWN_THROW_MS = 450;
/** Phase lengths (ms). */
export const TOSS_MS = 1600;
export const DEAD_MS = 1300;
export const HALF_MS = 3800;
export const FINAL_MS = 3200;
export const OT_INTRO_MS = 2600;

/** Holding the ball slows a toy a little; charging a shot roots it. */
export const BALL_SPEED = 0.9;
/**
 * How far a let-go's claimed charge (what the player's meter showed) may sit from the rules' own
 * count (ms): up to `behind` less (the press reached the server later than the player saw it start,
 * plus input batching) and `ahead` more (step rounding). Otherwise the rules' count stands. A
 * modified client could pick its power within that window; every player gets the same allowance.
 */
export const CHARGE_CLAIM = { behind: 250, ahead: 50 };
export const TUNING: MoveTuning = { ...TOY_TUNING, walk: 10, run: 14.5 };

export interface HoopConfig {
  /** Game clock per half (ms). Two halves: about four minutes of play. */
  halfMs: number;
  shotMs: number;
  /** Overtime: next basket wins, at most this long, then a tie. */
  otMs: number;
  /** An inbounder who hasn't passed by then passes automatically. */
  inboundMs: number;
  /** Players per team; 0 = from the field (4 toys or fewer: 2, more: 4). */
  teamSize: 0 | 2 | 4;
  /** The AI's level for filler toys; null = the contestant bots' level, else normal. */
  fillDifficulty: BotDifficulty | null;
}

export const DEFAULT_CONFIG: HoopConfig = { halfMs: 120_000, shotMs: 14_000, otMs: 60_000, inboundMs: 5000, teamSize: 0, fillDifficulty: null };

// ---------------------------------------------------------------- state
export type HoopPhase = 'jump' | 'live' | 'dead' | 'inbound' | 'half' | 'final' | 'over';

export interface HoopInputState {
  /** Stick: right (+) / forward (+, world −z), −1..1. */
  ax: number;
  ay: number;
  run: boolean;
  /** The action button is down (charge with the ball; steal / snatch / pick up without). */
  act: boolean;
}

export type HoopInput =
  /**
   * `charge`: on letting go of a shot, the charge (ms) the player's meter showed. Online the meter
   * is predicted on the client, so the rules take it within CHARGE_CLAIM of their own count.
   */
  | ({ type: 'in'; charge?: number } & HoopInputState)
  /** Pass (to the teammate nearest your facing, or `to`); without the ball, call for it. */
  | { type: 'pass'; to?: string }
  /** Drop a shot being charged without shooting (the action button must come up before the next press). */
  | { type: 'cancel' };

export interface HoopPlayer extends Mover {
  id: string;
  name: string;
  team: Team;
  num: number;
  /** Driven by the rules' own AI (fillers, and players who left), at this level; null otherwise. */
  ai: BotDifficulty | null;
  filler: boolean;
  /** A bot (a bot contestant or a filler): humans can call these teammates for a pass. */
  cpu: boolean;
  /** A filler's look (contestants bring their own). */
  look: { paint: number; hat: HatId; keySkin: KeySkinId } | null;
  forfeit: boolean;
  in: HoopInputState;
  /** Ms the action has been held with the ball (a shot charging: the meter winds back and forth), or −1. */
  charge: number;
  /** Ms left reaching, and until the next swipe may start. */
  swipeT: number;
  swipeCd: number;
  hop: boolean;
  /** Ms left on a "pass to me" call. */
  callT: number;
  pts: number;
  made: number;
  tries: number;
  threes: number;
  steals: number;
  blocks: number;
  boards: number;
}

export interface ShotInfo {
  by: string;
  team: Team;
  three: boolean;
  /** The hoop it was thrown at. */
  hoop: number;
  at: number;
  /** It touched a rim, or the floor (it can no longer be a clean shot). */
  rim: boolean;
  floor: boolean;
}

export interface HoopBall extends CourtBall {
  /** Match time (ms) of the last pick-up, snatch, steal or catch (the Hub's steal guard). */
  grabT: number;
  /** When the last throw left the hands. */
  throwT: number;
  /** The team that touched it last (out of bounds goes against them). */
  lastTeam: Team | null;
}

export interface HoopState {
  kind: 'hoop-clash';
  /** Match time (ms). */
  t: number;
  tick: number;
  seed: number;
  /** The rules' own random stream (fillers' AI, tie-breaks). */
  rng: number;
  config: HoopConfig;
  teamSize: 2 | 4;
  players: HoopPlayer[];
  ball: HoopBall;
  phase: HoopPhase;
  /** Match time the phase began. */
  phaseT: number;
  /** 1, 2, or 3 for overtime. */
  period: 1 | 2 | 3;
  /** Teams have switched ends (from halftime). */
  swapped: boolean;
  /** Game clock left in the period (ms). */
  clock: number;
  shotClock: number;
  /** Team in possession (null: nobody yet, or a jump ball). */
  poss: Team | null;
  /** A shot touched the rim: the next possession gets a fresh shot clock. */
  rimReset: boolean;
  score: [number, number];
  shot: ShotInfo | null;
  pass: { by: string; team: Team; to: string; at: number } | null;
  /** The inbound being taken (phase 'inbound'), or queued for when the dead ball ends. */
  inbound: { team: Team; x: number; z: number; yaw: number; by: string | null; kind: 'basket' | 'side' | 'half' } | null;
  /** What happens when the dead ball (phase 'dead') ends. */
  next: 'inbound' | 'end-period' | 'jump' | null;
  /** The team that won the opening jump ball (the other inbounds after halftime). */
  tip: Team | null;
  /** The buzzer has gone with a shot in the air: the period ends once it lands. */
  buzzer: boolean;
  winner: Team | 'tie' | null;
  /** Who threw each loose ball last and whether it was a pass: for assists, sounds. */
  events: MatchEvent[];
  ai: Record<string, AiMemory>;
}

// ---------------------------------------------------------------- helpers
export const teamOf = (s: HoopState, id: string | null) => (id ? s.players.find((p) => p.id === id)?.team ?? null : null);
export const playerById = (s: HoopState, id: string | null) => (id ? s.players.find((p) => p.id === id) ?? null : null);
/** The hoop a team attacks right now (index into HOOPS). Red attacks the east hoop first. */
export const attackHoop = (s: Pick<HoopState, 'swapped'>, team: Team): number => ((team === 0) !== s.swapped ? 1 : 0);
export const defendHoop = (s: Pick<HoopState, 'swapped'>, team: Team): number => 1 - attackHoop(s, team);
export const bodyOf = (p: HoopPlayer): PlayBody => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
/** Is the holder dribbling (moving on the ground, not charging)? The Hub's steal rule. */
export const isDribbling = (p: HoopPlayer) => p.grounded && Math.hypot(p.vx, p.vz) >= DRIBBLE_SPEED && p.charge < 0;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The rules' own random stream (mulberry32 on a state word). */
export function nextRandom(s: HoopState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The facing a shot goes in: yours, bent onto the attacking rim when it is close and roughly ahead (the Hub's assist). */
export function aimYaw(s: HoopState, p: HoopPlayer): number {
  const h = HOOPS[attackHoop(s, p.team)];
  if (Math.hypot(h.x - p.x, h.z - p.z) < ASSIST_RANGE) {
    const want = yawTo(p.x, p.z, h);
    if (Math.abs(wrap(want - p.yaw)) < ASSIST_ANGLE) return want;
  }
  return p.yaw;
}

/** The teammate a pass goes to: nearest your facing (within a wide cone), else the nearest. */
export function passTarget(s: HoopState, p: HoopPlayer, to?: string): HoopPlayer | null {
  const mates = s.players.filter((q) => q.team === p.team && q.id !== p.id);
  if (!mates.length) return null;
  if (to) {
    const m = mates.find((q) => q.id === to);
    if (m) return m;
  }
  let best: HoopPlayer | null = null;
  let bestScore = Infinity;
  for (const q of mates) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    const off = Math.abs(wrap(Math.atan2(q.x - p.x, q.z - p.z) - p.yaw));
    const score = off < 1.9 ? off * 12 + d * 0.15 : 1000 + d;
    if (score < bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

const emit = (s: HoopState, e: MatchEvent) => s.events.push(e);

// ---------------------------------------------------------------- set-up
const JERSEY_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 20, 21, 22, 24, 25, 31, 32, 33, 34, 35, 40, 42, 44, 50, 55, 77, 88, 99];

/**
 * Split a field into two even teams: humans alternate Red, Blue (so friends in a lobby stay
 * balanced; the local player is first, so plays for Red), then each bot joins the smaller side.
 * Returns team per contestant id and the team size (4 toys or fewer: 2 a side, more: 4).
 */
export function assignTeams(contestants: readonly Contestant[], forced: 0 | 2 | 4 = 0): { teams: Map<string, Team>; size: 2 | 4 } {
  const size: 2 | 4 = forced || (contestants.length <= 4 ? 2 : 4);
  const teams = new Map<string, Team>();
  const count = [0, 0];
  contestants.filter((c) => !c.bot).forEach((c, i) => {
    const t = (i % 2) as Team;
    teams.set(c.id, t);
    count[t]++;
  });
  for (const c of contestants) {
    if (!c.bot) continue;
    const t: Team = count[0] <= count[1] ? 0 : 1;
    teams.set(c.id, t);
    count[t]++;
  }
  return { teams, size };
}

function makePlayer(id: string, name: string, team: Team, num: number, x: number, z: number): HoopPlayer {
  return {
    id, name, team, num, ai: null, filler: false, cpu: false, look: null, forfeit: false,
    x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw: team === 0 ? Math.PI / 2 : -Math.PI / 2, grounded: true,
    in: { ax: 0, ay: 0, run: false, act: false },
    charge: -1, swipeT: 0, swipeCd: 0, hop: false, callT: 0,
    pts: 0, made: 0, tries: 0, threes: 0, steals: 0, blocks: 0, boards: 0,
  };
}

/**
 * Where everyone stands for a jump ball (`jumpers` at the circle) or a restart, on their own
 * defensive half (sign `-dir`, where `dir` is the way the team attacks).
 */
function formation(s: HoopState, jump: boolean) {
  for (const team of [0, 1] as Team[]) {
    const dir = attackHoop(s, team) === 1 ? 1 : -1;
    const mine = s.players.filter((p) => p.team === team);
    const spots = jump
      ? [[-1.8, 0], [-9, -7], [-9, 7], [-16, 0]]
      : [[-6, 0], [-12, -8], [-12, 8], [-20, 0]];
    mine.forEach((p, i) => {
      const [x, z] = spots[i % spots.length];
      Object.assign(p, { x: x * dir, z, vx: 0, vz: 0, vy: 0, y: 0, grounded: true, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, charge: -1, swipeT: 0, hop: false });
    });
  }
}

function startJump(s: HoopState, delay = 0) {
  formation(s, true);
  Object.assign(s.ball, { x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, holder: null, thrower: null, lastTeam: null });
  s.phase = 'jump';
  s.phaseT = s.t + delay;
  s.poss = null;
  s.shot = null;
  s.pass = null;
  s.inbound = null;
  emit(s, { type: 'jumpball', period: s.period });
}

export const hoopRules: RulesCore<HoopState, HoopInput, HoopConfig> & { forfeit(state: HoopState, id: string): void } = {
  init(contestants, seed, config) {
    const cfg: HoopConfig = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    const { teams, size } = assignTeams(contestants, cfg.teamSize);
    const rng = seededRng(subSeed(seed, 'jerseys'));
    const nums = [shuffle(rng, JERSEY_NUMBERS), shuffle(rng, JERSEY_NUMBERS)];
    const players: HoopPlayer[] = [];
    for (const c of contestants) {
      const team = teams.get(c.id)!;
      const p = makePlayer(c.id, c.name, team, nums[team][players.filter((q) => q.team === team).length], 0, 0);
      p.cpu = !!c.bot;
      players.push(p);
    }
    const fillDiff = cfg.fillDifficulty ?? contestants.find((c) => c.bot)?.bot ?? 'normal';
    const need = [0, 1].map((t) => size - players.filter((p) => p.team === t).length);
    const fillers = makeBots(subSeed(seed, 'fillers'), need[0] + need[1] + contestants.length, fillDiff).filter(
      (b) => !contestants.some((c) => c.name.toLowerCase() === b.name.toLowerCase()),
    );
    let k = 0;
    for (const team of [0, 1] as Team[]) {
      for (let i = 0; i < need[team]; i++) {
        const b = fillers[k % fillers.length];
        k++;
        const p = makePlayer(`fill-${k}`, b.name, team, nums[team][players.filter((q) => q.team === team).length], 0, 0);
        p.ai = fillDiff;
        p.filler = true;
        p.cpu = true;
        p.look = { paint: Math.max(0, PAINT_JOBS.indexOf(b.paint)), hat: b.hat, keySkin: b.keySkin };
        players.push(p);
      }
    }
    const s: HoopState = {
      kind: 'hoop-clash',
      t: 0,
      tick: 0,
      seed,
      rng: subSeed(seed, 'rules'),
      config: cfg,
      teamSize: size,
      players,
      ball: { ...createCourtBall(0, 0), grabT: -1e9, throwT: -1e9, lastTeam: null },
      phase: 'jump',
      phaseT: 0,
      period: 1,
      swapped: false,
      clock: cfg.halfMs,
      shotClock: cfg.shotMs,
      poss: null,
      rimReset: false,
      score: [0, 0],
      shot: null,
      pass: null,
      inbound: null,
      next: null,
      tip: null,
      buzzer: false,
      winner: null,
      events: [],
      ai: {},
    };
    for (const p of players) if (p.ai) s.ai[p.id] = createAiMemory();
    startJump(s);
    return s;
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.t += dtMs;
    s.tick++;
    for (const p of s.players) {
      p.swipeCd = Math.max(0, p.swipeCd - dtMs);
      p.swipeT = Math.max(0, p.swipeT - dtMs);
      p.callT = Math.max(0, p.callT - dtMs);
      if (p.charge >= 0) p.charge += dtMs;
      const list = p.ai ? aiDecide(s, p, p.ai, () => nextRandom(s), (s.ai[p.id] ??= createAiMemory())) : inputs[p.id];
      if (list) for (const i of list) applyInput(s, p, i);
    }
    phaseTimers(s);
    movePlayers(s, dtMs);
    stepBall(s);
    if (s.phase === 'live') {
      outOfBounds(s);
      clocks(s, dtMs);
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    const win = s.winner;
    const seated = s.players.filter((p) => !p.filler);
    const ordered = seated
      .slice()
      .sort((a, b) => (win === 'tie' || win === null ? 0 : (a.team === win ? 0 : 1) - (b.team === win ? 0 : 1)) || b.pts - a.pts)
      .map((p) => ({ contestantId: p.id, score: p.pts, key: win === 'tie' || win === null ? 'tie' : p.team === win ? 'win' : 'lose', forfeit: p.forfeit || undefined }));
    return {
      placements: rankByKey(ordered),
      durationMs: Math.round(s.t),
      stats: { red: s.score[0], blue: s.score[1], teamSize: s.teamSize, overtime: s.period === 3 ? 1 : 0, winner: win === 'tie' || win === null ? -1 : win },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },

  forfeit(s, id) {
    const p = playerById(s, id);
    if (!p || p.forfeit) return;
    p.forfeit = true;
    p.cpu = true;
    p.ai = s.config.fillDifficulty ?? 'normal';
    p.in = { ax: 0, ay: 0, run: false, act: false };
    p.charge = -1;
    s.ai[p.id] = createAiMemory();
  },
};

// ---------------------------------------------------------------- inputs
function applyInput(s: HoopState, p: HoopPlayer, i: HoopInput) {
  if (!i || typeof i !== 'object') return;
  if (i.type === 'pass') {
    if (s.ball.holder === p.id && (s.phase === 'live' || s.phase === 'inbound')) {
      if (p.charge >= 0) p.charge = -1;
      passBall(s, p, i.to);
    } else if (s.ball.holder !== p.id && p.callT <= 0) {
      p.callT = CALL_MS;
      emit(s, { type: 'call', by: p.id });
    }
    return;
  }
  if (i.type === 'cancel') {
    if (p.charge >= 0) {
      p.charge = -1;
      emit(s, { type: 'uncharge', by: p.id });
    }
    return;
  }
  if (i.type !== 'in') return;
  const fin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  let ax = fin(i.ax);
  let ay = fin(i.ay);
  const m = Math.hypot(ax, ay);
  if (m > 1) (ax /= m), (ay /= m);
  const was = p.in.act;
  p.in = { ax, ay, run: !!i.run, act: !!i.act };
  if (p.in.act && !was) press(s, p);
  if (!p.in.act && was && p.charge >= 0) release(s, p, i.charge);
}

/** The action button went down. */
function press(s: HoopState, p: HoopPlayer) {
  if (s.ball.holder === p.id) {
    // The inbounder can only pass; everywhere else it starts charging a shot.
    if (s.phase === 'inbound') passBall(s, p);
    else if (s.phase === 'live') {
      // A set shot: plant your feet (no sliding while you aim).
      p.charge = 0;
      p.vx = p.vz = 0;
    }
    return;
  }
  if (p.swipeCd > 0 || !(s.phase === 'live' || s.phase === 'inbound' || (s.phase === 'jump' && s.t >= s.phaseT))) return;
  p.swipeT = SWIPE_MS;
  p.swipeCd = SWIPE_COOLDOWN_MS;
  if (p.grounded) p.hop = true;
  emit(s, { type: 'swipe', by: p.id });
}

/** The action button came up while charging: shoot. */
function release(s: HoopState, p: HoopPlayer, claim?: number) {
  const seen = typeof claim === 'number' && Number.isFinite(claim) && claim >= p.charge - CHARGE_CLAIM.behind && claim <= p.charge + CHARGE_CLAIM.ahead ? Math.max(0, claim) : p.charge;
  const power = shotPower(seen, CHARGE_MS);
  p.charge = -1;
  if (s.ball.holder !== p.id || s.phase !== 'live') return;
  const hoop = attackHoop(s, p.team);
  const yaw = aimYaw(s, p);
  p.yaw = yaw;
  throwCourtBall(s.ball, bodyOf(p), yaw, power);
  s.ball.throwT = s.t;
  s.ball.lastTeam = p.team;
  s.shot = { by: p.id, team: p.team, three: isThree(p.x, p.z, HOOPS[hoop]), hoop, at: s.t, rim: false, floor: false };
  s.pass = null;
  p.tries++;
  if (p.grounded) p.hop = true; // a little jump shot
  emit(s, { type: 'shot', by: p.id, power: Math.round(power * 100) / 100, three: s.shot.three });
}

function passBall(s: HoopState, p: HoopPlayer, to?: string) {
  const mate = passTarget(s, p, to);
  if (!mate) return;
  const d = Math.hypot(mate.x - p.x, mate.z - p.z);
  const flight = Math.max(PASS_FLIGHT.min, Math.min(PASS_FLIGHT.max, d / PASS_SPEED));
  // Lead a moving teammate, but never out of the court's stands.
  const tx = Math.max(MOVE_BOUNDS.minX, Math.min(MOVE_BOUNDS.maxX, mate.x + mate.vx * flight * 0.85));
  const tz = Math.max(MOVE_BOUNDS.minZ, Math.min(MOVE_BOUNDS.maxZ, mate.z + mate.vz * flight * 0.85));
  p.yaw = Math.atan2(tx - p.x, tz - p.z);
  passCourtBall(s.ball, bodyOf(p), tx, tz, flight);
  s.ball.throwT = s.t;
  s.ball.lastTeam = p.team;
  s.pass = { by: p.id, team: p.team, to: mate.id, at: s.t };
  s.shot = null;
  emit(s, { type: 'pass', by: p.id, to: mate.id });
  if (s.phase === 'inbound') {
    // The ball is in play: the clocks run from here.
    s.phase = 'live';
    s.phaseT = s.t;
    s.inbound = null;
  }
}

// ---------------------------------------------------------------- phases
function phaseTimers(s: HoopState) {
  const since = s.t - s.phaseT;
  switch (s.phase) {
    case 'jump':
      if (since >= TOSS_MS) {
        // The referee tosses it up between the two jumpers.
        Object.assign(s.ball, { x: 0, y: 6, z: 0, vx: 0, vy: 30, vz: 0, holder: null, thrower: null, throwT: s.t, lastTeam: null });
        s.phase = 'live';
        s.phaseT = s.t;
        emit(s, { type: 'toss' });
        emit(s, { type: 'whistle' });
      }
      break;
    case 'inbound':
      if (since >= s.config.inboundMs && s.ball.holder) {
        const p = playerById(s, s.ball.holder);
        if (p) passBall(s, p, bestOpenMate(s, p)?.id);
      }
      break;
    case 'dead':
      if (since >= (s.next === 'jump' ? OT_INTRO_MS : DEAD_MS)) {
        const next = s.next;
        s.next = null;
        if (s.clock <= 0 && next !== 'jump') endPeriod(s);
        else if (next === 'jump') startJump(s);
        else if (s.inbound) setupInbound(s);
      }
      break;
    case 'half':
      if (since >= HALF_MS) {
        s.period = 2;
        s.swapped = true;
        s.clock = s.config.halfMs;
        s.buzzer = false;
        formation(s, false);
        const team: Team = s.tip === 0 ? 1 : 0;
        s.inbound = { team, x: 0, z: -(COURT.halfW + 1.2), yaw: 0, by: null, kind: 'half' };
        setupInbound(s);
      }
      break;
    case 'final':
      if (since >= FINAL_MS) s.phase = 'over';
      break;
  }
}

/** The best teammate to pass to: the most open one within reach (for auto-passes and bots). */
export function bestOpenMate(s: HoopState, p: HoopPlayer): HoopPlayer | null {
  let best: HoopPlayer | null = null;
  let bestScore = -Infinity;
  for (const q of s.players) {
    if (q.team !== p.team || q.id === p.id) continue;
    const opps = s.players.filter((o) => o.team !== p.team);
    const open = Math.min(99, ...opps.map((o) => Math.hypot(o.x - q.x, o.z - q.z)));
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    // Someone standing in the passing lane makes it a poor pass.
    const lane = Math.min(99, ...opps.map((o) => laneGap(p, q, o)));
    const score = Math.min(open, 9) - Math.max(0, d - 30) * 0.5 + (inCourt(q.x, q.z) ? 2 : 0) - (lane < 2.4 ? 8 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

/** How far the nearest opponent stands from the passing lane between `p` and `q`. */
export function laneClearance(s: HoopState, p: HoopPlayer, q: { x: number; z: number }) {
  let gap = 99;
  for (const o of s.players) if (o.team !== p.team) gap = Math.min(gap, laneGap(p, q, o));
  return gap;
}

/** How far `o` stands from the straight line between a passer and a receiver (beyond the ends: from them). */
function laneGap(a: { x: number; z: number }, b: { x: number; z: number }, o: { x: number; z: number }) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / l2));
  return Math.hypot(a.x + dx * k - o.x, a.z + dz * k - o.z);
}

/** Hand the ball to the nearest player of the inbounding team, standing at the inbound spot. */
function setupInbound(s: HoopState) {
  const ib = s.inbound!;
  const mine = s.players.filter((p) => p.team === ib.team);
  let by = mine[0];
  for (const p of mine) if (Math.hypot(p.x - ib.x, p.z - ib.z) < Math.hypot(by.x - ib.x, by.z - ib.z)) by = p;
  // Anyone else standing on the spot steps aside.
  for (const p of s.players) {
    if (p === by) continue;
    const d = Math.hypot(p.x - ib.x, p.z - ib.z);
    if (d < 2.4) {
      const k = (2.4 - d) / Math.max(d, 0.01);
      p.x += (p.x - ib.x) * k || 2.4;
      p.z += (p.z - ib.z) * k;
    }
  }
  Object.assign(by, { x: ib.x, z: ib.z, y: 0, vx: 0, vz: 0, vy: 0, grounded: true, yaw: ib.yaw, charge: -1, hop: false });
  ib.by = by.id;
  holdCourtBall(s.ball, bodyOf(by));
  s.ball.grabT = s.t;
  s.ball.lastTeam = ib.team;
  s.ball.thrower = null;
  s.poss = ib.team;
  s.shotClock = s.config.shotMs;
  s.rimReset = false;
  s.shot = null;
  s.pass = null;
  s.phase = 'inbound';
  s.phaseT = s.t;
  emit(s, { type: 'inbound', team: ib.team, by: by.id, kind: ib.kind });
}

/** A dead ball: the other team (`team`) will inbound at (x, z) after a moment. */
function deadBall(s: HoopState, team: Team, kind: 'basket' | 'side', x: number, z: number) {
  let yaw: number;
  if (kind === 'basket') yaw = x > 0 ? -Math.PI / 2 : Math.PI / 2;
  else yaw = z > 0 ? Math.PI : 0;
  s.inbound = { team, x, z, yaw, by: null, kind };
  s.phase = 'dead';
  s.phaseT = s.t;
  s.next = 'inbound';
  for (const p of s.players) p.charge = -1;
}

function sidelineSpot(x: number, z: number) {
  return { x: Math.max(-COURT.halfL + 4, Math.min(COURT.halfL - 4, x)), z: (z > 0 ? 1 : -1) * (COURT.halfW + 1.2) };
}

/** A turnover (out of bounds, shot clock): the other team gets a sideline inbound. */
function turnover(s: HoopState, against: Team, reason: 'out' | 'shotclock', at: { x: number; z: number }) {
  const team = (1 - against) as Team;
  if (s.ball.holder) {
    const h = playerById(s, s.ball.holder);
    s.ball.holder = null;
    if (h) Object.assign(s.ball, heldAt(bodyOf(h)), { vx: 0, vy: 0, vz: 0 });
  }
  emit(s, { type: 'whistle' });
  emit(s, { type: reason === 'out' ? 'out' : 'violation', team: against, x: at.x, z: at.z });
  const spot = sidelineSpot(at.x, at.z);
  deadBall(s, team, 'side', spot.x, spot.z);
}

function endPeriod(s: HoopState) {
  s.buzzer = false;
  for (const p of s.players) p.charge = -1;
  if (s.period === 1) {
    s.phase = 'half';
    s.phaseT = s.t;
    s.ball.holder = null;
    emit(s, { type: 'half' });
    return;
  }
  if (s.period === 2 && s.score[0] === s.score[1]) {
    s.period = 3;
    s.clock = s.config.otMs;
    s.shotClock = s.config.shotMs;
    s.ball.holder = null;
    s.phase = 'dead';
    s.phaseT = s.t;
    s.next = 'jump';
    emit(s, { type: 'overtime' });
    return;
  }
  finish(s, s.score[0] === s.score[1] ? 'tie' : s.score[0] > s.score[1] ? 0 : 1);
}

function finish(s: HoopState, winner: Team | 'tie') {
  s.winner = winner;
  s.phase = 'final';
  s.phaseT = s.t;
  s.next = null;
  for (const p of s.players) {
    p.charge = -1;
    p.in = { ...p.in, act: false };
  }
  emit(s, { type: 'final', winner: winner === 'tie' ? -1 : winner, score: [s.score[0], s.score[1]] });
}

// ---------------------------------------------------------------- movement
const ZERO = { ax: 0, ay: 0, run: false, jump: false };

const WORLD = { solids: SOLIDS, bounds: MOVE_BOUNDS };
export const isFrozen = (s: HoopState) => s.phase === 'jump' || s.phase === 'half' || s.phase === 'final' || s.phase === 'over';

/**
 * One toy's own movement for one step, before toys are pushed apart: the stick, or rooted (turning
 * only) while charging a shot or inbounding. `s` is only read. Online clients replay it for their
 * own toy (predict.ts).
 */
export function moveToy(s: HoopState, p: HoopPlayer, dtMs: number) {
  const frozen = isFrozen(s);
  const holding = s.ball.holder === p.id;
  const rooted = frozen || p.charge >= 0 || (s.phase === 'inbound' && s.inbound?.by === p.id);
  const jump = p.hop && !frozen;
  p.hop = false;
  if (rooted) {
    stepMover(p, { ...ZERO, jump }, dtMs, WORLD, TUNING);
    // Rooted toys still turn to the stick (aiming a shot, picking a pass).
    if (!frozen && Math.hypot(p.in.ax, p.in.ay) > 0.3) {
      const want = Math.atan2(p.in.ax, -p.in.ay);
      const lim = (TUNING.turnRate * dtMs) / 1000;
      p.yaw = wrap(p.yaw + Math.max(-lim, Math.min(lim, wrap(want - p.yaw))));
    }
  } else {
    stepMover(p, { ax: p.in.ax, ay: p.in.ay, run: p.in.run, jump }, dtMs, WORLD, TUNING, holding ? BALL_SPEED : 1);
  }
}

/** Toys stay inside the run-off around the court. */
export function clampToCourt(p: { x: number; z: number }) {
  p.x = Math.max(MOVE_BOUNDS.minX + TUNING.radius, Math.min(MOVE_BOUNDS.maxX - TUNING.radius, p.x));
  p.z = Math.max(MOVE_BOUNDS.minZ + TUNING.radius, Math.min(MOVE_BOUNDS.maxZ - TUNING.radius, p.z));
}

function movePlayers(s: HoopState, dtMs: number) {
  for (const p of s.players) moveToy(s, p, dtMs);
  // Toys don't overlap: push pairs apart (a holder standing still is a little heavier).
  const R = TUNING.radius * 2;
  for (let i = 0; i < s.players.length; i++) {
    for (let j = i + 1; j < s.players.length; j++) {
      const a = s.players[i];
      const b = s.players[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const push = R - d;
      const fixA = s.phase === 'inbound' && s.inbound?.by === a.id;
      const fixB = s.phase === 'inbound' && s.inbound?.by === b.id;
      const ka = fixA ? 0 : fixB ? 1 : 0.5;
      a.x -= nx * push * ka;
      a.z -= nz * push * ka;
      b.x += nx * push * (1 - ka);
      b.z += nz * push * (1 - ka);
    }
  }
  for (const p of s.players) clampToCourt(p);
}

// ---------------------------------------------------------------- the ball
const evBuf: CourtBallEvent[] = [];

function stepBall(s: HoopState) {
  const b = s.ball;
  if (s.phase === 'jump') {
    // In the referee's hands until the toss.
    Object.assign(b, { x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, holder: null });
    return;
  }
  if (b.holder) {
    const h = playerById(s, b.holder);
    if (h) holdCourtBall(b, bodyOf(h));
    if (s.phase === 'live' || s.phase === 'inbound') tryTakes(s);
    return;
  }
  evBuf.length = 0;
  stepCourtBall(b, COURT_SPEC, evBuf);
  for (const e of evBuf) {
    switch (e.k) {
      case 'hoop':
        if (s.phase === 'live') basket(s, e.hoop);
        break;
      case 'rim':
        if (s.shot) s.shot.rim = true;
        if (s.phase === 'live' && s.poss !== null) s.rimReset = true;
        if (e.v > 6) emit(s, { type: 'rim', v: e.v, hoop: e.hoop });
        break;
      case 'board':
        emit(s, { type: 'board', v: e.v, hoop: e.hoop });
        break;
      case 'bounce':
        emit(s, { type: 'bounce', v: e.v });
        break;
      case 'wall':
        emit(s, { type: 'wall', v: e.v });
        break;
    }
  }
  if (b.y - BALL_R <= 0.05) {
    if (s.shot) s.shot.floor = true;
    s.pass = null;
  }
  if (s.phase === 'live') tryTakes(s);
}

/** Pick-ups, catches, snatches and steals, in a fair rotating order. */
function tryTakes(s: HoopState) {
  const b = s.ball;
  const n = s.players.length;
  const start = s.tick % n;
  const airborne = courtBallAirborne(b);
  for (let k = 0; k < n; k++) {
    const p = s.players[(start + k) % n];
    if (b.holder === p.id) continue;
    if (s.phase === 'inbound' && s.inbound?.by === p.id) continue;
    const body = bodyOf(p);
    const ownThrow = b.thrower === p.id && s.t - b.throwT < OWN_THROW_MS;
    if (b.holder) {
      // Steal: only off a dribbler, only once the Hub's guard has passed, only while reaching.
      if (p.swipeT <= 0 || s.phase !== 'live') continue;
      const h = playerById(s, b.holder);
      if (!h || h.team === p.team || !isDribbling(h) || s.t - b.grabT < STEAL_GUARD * 1000) continue;
      if (Math.hypot(b.x - p.x, b.z - p.z) > STEAL_REACH) continue;
      take(s, p, 'steal', h);
      return;
    }
    if (ownThrow) continue;
    if (airborne) {
      // A pass to your team flies into your hands; anything flying into your body is caught,
      // except a shot (blocking one takes a swipe).
      const toMate = s.pass && s.pass.team === p.team && inSnatchReach(body, b);
      const intoBody = !s.shot && Math.hypot(b.x - p.x, b.z - p.z) <= BODY_CATCH.r && b.y - p.y >= BODY_CATCH.below && b.y - p.y <= BODY_CATCH.above;
      const snatched = p.swipeT > 0 && inSnatchReach(body, b);
      if (toMate || intoBody || snatched) {
        take(s, p, toMate ? 'catch' : 'snatch');
        return;
      }
    } else {
      const walk = Math.hypot(b.x - p.x, b.z - p.z) <= WALK_PICKUP && b.y - BALL_R <= 0.6;
      if (walk || (p.swipeT > 0 && inPickupReach(body, b))) {
        take(s, p, 'grab');
        return;
      }
    }
  }
}

function take(s: HoopState, p: HoopPlayer, kind: 'steal' | 'snatch' | 'catch' | 'grab', from?: HoopPlayer) {
  const b = s.ball;
  const shot = s.shot;
  const pass = s.pass;
  holdCourtBall(b, bodyOf(p));
  b.grabT = s.t;
  b.lastTeam = p.team;
  p.swipeT = 0;
  p.charge = -1;
  // A press held through the catch doesn't start a shot: let go and press again.
  if (s.tip === null) s.tip = p.team;
  if (s.poss !== p.team || s.rimReset) s.shotClock = s.config.shotMs;
  s.poss = p.team;
  s.rimReset = false;
  s.shot = null;
  s.pass = null;
  if (kind === 'steal') {
    p.steals++;
    emit(s, { type: 'steal', by: p.id, from: from!.id });
    return;
  }
  if (kind === 'snatch' && shot && shot.team !== p.team && !shot.rim && !shot.floor && s.t - shot.at < 900) {
    p.blocks++;
    emit(s, { type: 'block', by: p.id, from: shot.by });
    return;
  }
  if (shot && (shot.rim || s.t - shot.at > 500)) p.boards++;
  if (kind === 'catch' || (pass && pass.team === p.team)) emit(s, { type: 'catch', by: p.id, from: pass?.by ?? null });
  else if (pass && pass.team !== p.team) emit(s, { type: 'intercept', by: p.id, from: pass.by });
  else emit(s, { type: kind === 'snatch' ? 'snatch' : 'grab', by: p.id, rebound: !!shot });
}

function basket(s: HoopState, hoop: number) {
  // The team attacking this hoop scores (into your own basket counts for the other team).
  const team: Team = attackHoop(s, 0) === hoop ? 0 : 1;
  const shot = s.shot;
  const pts = shot && shot.hoop === hoop && shot.team === team && shot.three && !shot.floor ? 3 : 2;
  s.score[team] += pts;
  const byId = shot && shot.team === team ? shot.by : s.ball.thrower && teamOf(s, s.ball.thrower) === team ? s.ball.thrower : null;
  const by = playerById(s, byId);
  if (by) {
    by.pts += pts;
    by.made++;
    if (pts === 3) by.threes++;
  }
  s.shot = null;
  s.pass = null;
  const h = HOOPS[hoop];
  emit(s, { type: 'score', team, pts, by: by?.id ?? null, hoop, x: h.x, z: h.z, score: [s.score[0], s.score[1]] });
  if (s.period === 3) {
    // Overtime: the next basket wins.
    emit(s, { type: 'buzzer' });
    finish(s, team);
    return;
  }
  // The other team inbounds under the basket it was scored on.
  const sx = h.x > 0 ? 1 : -1;
  deadBall(s, (1 - team) as Team, 'basket', sx * (COURT.halfL + 1.2), 3.2);
}

/** Out of bounds: a holder whose feet cross a line, or a loose ball touching the floor outside. */
function outOfBounds(s: HoopState) {
  const b = s.ball;
  if (b.holder) {
    const h = playerById(s, b.holder);
    if (h && !inCourt(h.x, h.z, 0.15)) turnover(s, h.team, 'out', h);
    return;
  }
  const touching = b.y - BALL_R <= 0.08;
  const stands = b.x <= STANDS_IN.minX || b.x >= STANDS_IN.maxX || b.z <= STANDS_IN.minZ || b.z >= STANDS_IN.maxZ;
  // A jump ball nobody touched counts against Red (it can't happen with a straight toss; a safe default).
  if (stands || (touching && !inCourt(b.x, b.z))) turnover(s, b.lastTeam ?? 0, 'out', b);
}
const STANDS_IN = { minX: COURT_SPEC.walls.minX + BALL_R + 0.01, maxX: COURT_SPEC.walls.maxX - BALL_R - 0.01, minZ: COURT_SPEC.walls.minZ + BALL_R + 0.01, maxZ: COURT_SPEC.walls.maxZ - BALL_R - 0.01 };

function clocks(s: HoopState, dtMs: number) {
  const b = s.ball;
  const shotUp = !b.holder && !!s.shot && !s.shot.floor;
  // Game clock.
  if (s.clock > 0) {
    s.clock = Math.max(0, s.clock - dtMs);
    if (s.clock === 0) {
      emit(s, { type: 'buzzer' });
      // A shot in the air when the buzzer goes still counts: the period ends once it is decided.
      if (shotUp) {
        s.buzzer = true;
        return;
      }
      return endPeriod(s);
    }
  } else {
    // Waiting on a buzzer-beater: it missed once it touches the floor or someone takes it.
    if (!s.buzzer || !shotUp) endPeriod(s);
    return;
  }
  // Shot clock: runs while a team has the ball; paused while a released shot is in the air and
  // after it touched the rim (the next possession starts afresh).
  if (s.poss === null || s.rimReset || (shotUp && !s.shot!.rim)) return;
  s.shotClock = Math.max(0, s.shotClock - dtMs);
  if (s.shotClock === 0) {
    const at = b.holder ? playerById(s, b.holder)! : b;
    emit(s, { type: 'buzzer', shotClock: true });
    turnover(s, s.poss, 'shotclock', at);
  }
}

/** For the Scene: where the local toy's shot would go right now. */
export function shotPreview(s: HoopState, id: string): { body: PlayBody; yaw: number; power: number } | null {
  const p = playerById(s, id);
  if (!p || p.charge < 0 || s.ball.holder !== p.id) return null;
  return { body: bodyOf(p), yaw: aimYaw(s, p), power: shotPower(p.charge, CHARGE_MS) };
}

/** The power that sinks a shot from where `p` stands, facing its attacking rim (null: none goes in). */
export function solveShotFor(s: HoopState, p: HoopPlayer): number | null {
  const h = HOOPS[attackHoop(s, p.team)];
  return solveCourtShot(Math.hypot(p.x - h.x, p.z - h.z), offAxis(h, p))?.power ?? null;
}
