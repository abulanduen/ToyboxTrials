/**
 * Hoop Clash AI: one policy for bot contestants (through bot.ts) and for the filler toys and
 * leavers the rules core drives itself. Pure: it reads the state and returns inputs, with its own
 * small memory and a seeded random source.
 *
 *   With the ball: drive towards a shooting spot, away from the nearest defender; shoot when open
 *   within range (power from the solved shot, plus an error that shrinks with difficulty); pass
 *   when marked or when a human teammate calls for it; heave it up as the shot clock runs out.
 *   Teammate has it: spread to open spots around the attacking hoop.
 *   Defence: mark an opponent goal-side, try steals on a dribbler, swipe at shots and passes.
 *   Loose ball: the two nearest on each team chase it; the rest crash the boards or get back.
 */
import type { BotDifficulty } from '../types';
import { STEAL_GUARD, inSnatchReach } from '../../game/hubPlaySim';
import { courtBallAirborne, solveCourtShot, type CourtHoop } from '../shared/courtBall';
import { COURT, HOOPS, inCourt, offAxis } from './court';
import type { HoopInput, HoopPlayer, HoopState } from './rules';
import { holdForPower } from '../shared/shotMeter';
import { CHARGE_MS, attackHoop, bestOpenMate, bodyOf, defendHoop, isDribbling, laneClearance, playerById } from './rules';

export interface AiMemory {
  /** Match time of the next full think. */
  next: number;
  ax: number;
  ay: number;
  run: boolean;
  /** Press the action once on the next step. */
  act: boolean;
  /** Shooting: the power error this shot was dealt (NaN: not shooting). */
  err: number;
  /** The shot or pass (its throw time) this toy has already decided whether to go after. */
  seenThrow: number;
  willSwipe: boolean;
}

export const createAiMemory = (): AiMemory => ({ next: 0, ax: 0, ay: 0, run: false, act: false, err: NaN, seenThrow: -1, willSwipe: false });

export const LEVELS: Record<BotDifficulty, { think: number; range: number; err: number; steal: number; block: number; intercept: number; react: number; open: number; pass: number; inbound: number }> = {
  easy: { think: 330, range: 15, err: 0.07, steal: 0.22, block: 0.15, intercept: 0.35, react: 280, open: 4.6, pass: 0.45, inbound: 1500 },
  normal: { think: 210, range: 20, err: 0.045, steal: 0.4, block: 0.3, intercept: 0.55, react: 170, open: 3.9, pass: 0.65, inbound: 1100 },
  hard: { think: 130, range: 24, err: 0.03, steal: 0.6, block: 0.45, intercept: 0.75, react: 90, open: 3.3, pass: 0.8, inbound: 750 },
};

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** The closest shooting distance the Hub's ball allows (below it, nothing goes in). */
export const MIN_SHOT = 8.5;

function nearestOpp(s: HoopState, p: { x: number; z: number }, team: number): number {
  let d = 99;
  for (const q of s.players) if (q.team !== team) d = Math.min(d, dist(p, q));
  return d;
}

/** A point `r` from a hoop's rim, `ang` radians off the line straight out over the court. */
function aroundRim(h: CourtHoop, ang: number, r: number) {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const x = h.x + (h.dx * c - h.dz * sn) * r;
  const z = h.z + (h.dz * c + h.dx * sn) * r;
  return { x: Math.max(-COURT.halfL + 1.5, Math.min(COURT.halfL - 1.5, x)), z: Math.max(-COURT.halfW + 1.5, Math.min(COURT.halfW - 1.5, z)) };
}

export function aiDecide(s: HoopState, p: HoopPlayer, diff: BotDifficulty, rnd: () => number, mem: AiMemory): HoopInput[] {
  const L = LEVELS[diff];
  const att = HOOPS[attackHoop(s, p.team)];

  // Charging a shot: face the rim, let go at the solved power for where it stands, plus its error.
  if (p.charge >= 0) {
    const dx = att.x - p.x;
    const dz = att.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const sol = solveCourtShot(l, offAxis(att, p));
    const power = Math.max(0, Math.min(1, (sol?.power ?? 0.95) + (Number.isFinite(mem.err) ? mem.err : 0)));
    // Let go on the meter's first rise (held on, it would wind back down).
    return [{ type: 'in', ax: dx / l, ay: -dz / l, run: false, act: p.charge < holdForPower(power, CHARGE_MS) - 8 }];
  }
  mem.err = NaN;

  // Every step: react to a ball in the air within reach (a pass to the other team, a shot going
  // up, a rebound coming down), once per throw, after a reaction delay.
  react(s, p, L, rnd, mem);

  if (s.t >= mem.next) {
    mem.next = s.t + L.think * (0.75 + 0.5 * rnd());
    const pass = think(s, p, L, rnd, mem);
    if (pass) return [{ type: 'in', ax: mem.ax, ay: mem.ay, run: false, act: false }, pass];
  }
  const act = mem.act;
  mem.act = false;
  return [{ type: 'in', ax: mem.ax, ay: mem.ay, run: mem.run, act }];
}

function react(s: HoopState, p: HoopPlayer, L: (typeof LEVELS)['normal'], rnd: () => number, mem: AiMemory) {
  const b = s.ball;
  if (s.phase !== 'live' || b.holder || p.swipeCd > 0 || !courtBallAirborne(b) || b.thrower === p.id) return;
  if (mem.seenThrow !== b.throwT) {
    mem.seenThrow = b.throwT;
    const odds = s.shot ? (s.shot.team !== p.team ? L.block : 1) : s.pass ? (s.pass.team !== p.team ? L.intercept : 0) : 1;
    mem.willSwipe = rnd() < odds;
  }
  if (!mem.willSwipe || s.t - b.throwT < L.react) return;
  const mine = s.pass && s.pass.team === p.team; // a pass to your team is caught without a swipe
  if (mine) return;
  // Within reach (counting the little hop a swipe gives), and for a shot only while it rises
  // near the shooter or once it falls back to reach.
  if (!inSnatchReach({ ...bodyOf(p), y: p.y + 1.2 }, b)) return;
  const age = s.t - b.throwT;
  if (s.shot && s.shot.team !== p.team && age > 700 && b.vy > 0) return;
  mem.act = true;
}

function setMove(p: HoopPlayer, mem: AiMemory, target: { x: number; z: number } | null, runFar = 7) {
  if (!target) {
    mem.ax = mem.ay = 0;
    mem.run = false;
    return;
  }
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) {
    mem.ax = mem.ay = 0;
    mem.run = false;
    return;
  }
  const k = d < 2 ? 0.55 : 1;
  mem.ax = (dx / d) * k;
  mem.ay = (-dz / d) * k;
  mem.run = d > runFar;
}

/** Face a point without walking (the inbounder, a rooted toy). */
function faceOnly(p: HoopPlayer, mem: AiMemory, target: { x: number; z: number }) {
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  mem.ax = dx / d;
  mem.ay = -dz / d;
  mem.run = false;
}

function think(s: HoopState, p: HoopPlayer, L: (typeof LEVELS)['normal'], rnd: () => number, mem: AiMemory): HoopInput | null {
  const b = s.ball;
  const holder = playerById(s, b.holder);
  if (s.phase === 'jump' || s.phase === 'dead' || s.phase === 'half' || s.phase === 'final' || s.phase === 'over') {
    setMove(p, mem, null);
    return null;
  }
  if (s.phase === 'inbound') {
    const ib = s.inbound!;
    if (holder === p) {
      const mate = bestOpenMate(s, p);
      if (mate) faceOnly(p, mem, mate);
      const waited = s.t - s.phaseT;
      const clear = !!mate && laneClearance(s, p, mate) > 3.4;
      if (mate && waited > L.inbound * (0.8 + 0.4 * rnd()) && (clear || waited > s.config.inboundMs - 700)) return { type: 'pass', to: mate.id };
      return null;
    }
    if (ib.team === p.team) setMove(p, mem, inboundSpot(s, p));
    else setMove(p, mem, markSpot(s, p));
    return null;
  }
  // live
  if (holder === p) return withBall(s, p, L, rnd, mem);
  if (holder && holder.team === p.team) {
    setMove(p, mem, openSpot(s, p, holder));
    return null;
  }
  if (holder) {
    defend(s, p, holder, L, rnd, mem);
    return null;
  }
  loose(s, p, mem);
  return null;
}

function withBall(s: HoopState, p: HoopPlayer, L: (typeof LEVELS)['normal'], rnd: () => number, mem: AiMemory): HoopInput | null {
  const att = HOOPS[attackHoop(s, p.team)];
  const held = s.t - s.ball.grabT;
  const dRim = dist(p, att);
  const open = nearestOpp(s, p, p.team);
  const late = s.shotClock < 2600;
  // A human teammate calling for it gets it.
  const caller = s.players.find((q) => q.team === p.team && q !== p && !q.cpu && q.callT > 0);
  if (caller && held > 250) return { type: 'pass', to: caller.id };

  const inRange = dRim >= MIN_SHOT && dRim <= L.range && inCourt(p.x, p.z);
  const close = dRim >= MIN_SHOT && dRim < 12.5 && open > 2.3;
  const heave = late && dRim >= MIN_SHOT && dRim < 44;
  if ((inRange && (open > L.open || late)) || close || (heave && s.shotClock < 1300)) {
    mem.err = (rnd() * 2 - 1) * L.err * (dRim > COURT.three ? 1.25 : 1);
    mem.act = true;
    faceOnly(p, mem, att);
    return null;
  }
  // Marked, or too far out with the clock running down: pass to someone more open.
  if (held > 600 && (open < 3 || (late && dRim > L.range)) && rnd() < L.pass) {
    const mate = bestOpenMate(s, p);
    if (mate && nearestOpp(s, mate, p.team) > open + 1 && laneClearance(s, p, mate) > 2.8) return { type: 'pass', to: mate.id };
  }
  // Drive: to a spot at a comfortable range, swinging round the hoop away from the nearest
  // defender, but never round behind the backboard.
  const want = Math.max(MIN_SHOT + 1.5, Math.min(L.range * 0.75, 15));
  let ang = offAxis(att, p);
  let near: HoopPlayer | null = null;
  for (const q of s.players) if (q.team !== p.team && (!near || dist(p, q) < dist(p, near))) near = q;
  if (near && dist(p, near) < 6) ang += offAxis(att, near) > ang ? -0.45 : 0.45;
  ang = Math.max(-1.15, Math.min(1.15, ang));
  const target = aroundRim(att, ang, dRim > want + 6 ? Math.min(dRim - 4, want + 10) : want);
  setMove(p, mem, target, 6);
  return null;
}

/** Off the ball on offence: spread to open spots around the attacking hoop. */
function openSpot(s: HoopState, p: HoopPlayer, holder: HoopPlayer) {
  const att = HOOPS[attackHoop(s, p.team)];
  const others = s.players.filter((q) => q.team === p.team && q !== holder);
  const idx = Math.max(0, others.indexOf(p));
  const spots = [
    [0.95, 14],
    [-0.95, 14],
    [0, 19],
    [1.35, 9.5],
    [-1.35, 9.5],
  ].map(([a, r]) => aroundRim(att, a, r));
  // Skip spots the ball handler is standing near.
  const free = spots.filter((sp) => dist(sp, holder) > 7);
  const spot = (free.length ? free : spots)[idx % (free.length || spots.length)];
  // While the ball is brought up the court, run ahead of it.
  if (dist(holder, att) > 30) return { x: (spot.x + holder.x) / 2, z: spot.z };
  return spot;
}

/** Defence: the opponent with my index on the other team, guarded from the hoop side. */
function markOf(s: HoopState, p: HoopPlayer) {
  const mine = s.players.filter((q) => q.team === p.team);
  const opps = s.players.filter((q) => q.team !== p.team);
  return opps[mine.indexOf(p) % opps.length];
}

function markSpot(s: HoopState, p: HoopPlayer, gap = 3) {
  const def = HOOPS[defendHoop(s, p.team)];
  const m = markOf(s, p);
  const dx = def.x - m.x;
  const dz = def.z - m.z;
  const l = Math.hypot(dx, dz) || 1;
  const g = Math.min(gap, l * 0.6);
  return { x: m.x + (dx / l) * g, z: m.z + (dz / l) * g };
}

function defend(s: HoopState, p: HoopPlayer, holder: HoopPlayer, L: (typeof LEVELS)['normal'], rnd: () => number, mem: AiMemory) {
  let mark = markOf(s, p);
  // Help: nobody near the ball handler and I'm the closest of my team: take him.
  const mates = s.players.filter((q) => q.team === p.team);
  const guarded = mates.some((q) => dist(q, holder) < 4.5);
  const closest = mates.reduce((a, q) => (dist(q, holder) < dist(a, holder) ? q : a), mates[0]);
  if (!guarded && closest === p) mark = holder;
  const def = HOOPS[defendHoop(s, p.team)];
  const onBall = mark === holder;
  const dx = def.x - mark.x;
  const dz = def.z - mark.z;
  const l = Math.hypot(dx, dz) || 1;
  const g = Math.min(onBall ? (holder.charge >= 0 ? 1.4 : 1.9) : 3, l * 0.6);
  setMove(p, mem, { x: mark.x + (dx / l) * g, z: mark.z + (dz / l) * g }, 5);
  // A swipe at a dribbler in reach, once the Hub's steal guard has passed.
  if (onBall && dist(p, holder) < 3.1 && isDribbling(holder) && s.t - s.ball.grabT > STEAL_GUARD * 1000 && p.swipeCd <= 0 && rnd() < L.steal) mem.act = true;
}

/** The ball is loose: the two nearest on each team chase it, the rest go to the boards or back. */
function loose(s: HoopState, p: HoopPlayer, mem: AiMemory) {
  const b = s.ball;
  const lead = courtBallAirborne(b) ? 0.35 : 0.2;
  const at = { x: b.x + b.vx * lead, z: b.z + b.vz * lead };
  const mine = s.players.filter((q) => q.team === p.team).sort((a, q) => dist(a, at) - dist(q, at));
  if (mine.indexOf(p) < 2) {
    setMove(p, mem, at, 3);
    return;
  }
  if (s.shot && s.shot.team === p.team) {
    const att = HOOPS[attackHoop(s, p.team)];
    setMove(p, mem, aroundRim(att, (mine.indexOf(p) % 2 ? 1 : -1) * 0.7, 6));
    return;
  }
  setMove(p, mem, markSpot(s, p, 2.5));
}

/** Getting open for an inbound pass: a few steps in from the inbounder, spread out. */
function inboundSpot(s: HoopState, p: HoopPlayer) {
  const ib = s.inbound!;
  const mates = s.players.filter((q) => q.team === p.team && q.id !== ib.by);
  const i = Math.max(0, mates.indexOf(p));
  const inX = ib.kind === 'basket' ? -Math.sign(ib.x) : 0;
  const inZ = ib.kind === 'basket' ? 0 : -Math.sign(ib.z);
  const spread = (i - (mates.length - 1) / 2) * 7;
  return {
    x: Math.max(-COURT.halfL + 2, Math.min(COURT.halfL - 2, ib.x + inX * (7 + i * 3) + (inX ? 0 : spread))),
    z: Math.max(-COURT.halfW + 2, Math.min(COURT.halfW - 2, ib.z + inZ * (6 + i * 2) + (inZ ? 0 : spread))),
  };
}
