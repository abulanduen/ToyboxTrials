/**
 * Red Light, Green Light — rules core (GAME_DESIGN.md §4 · 05). Deterministic; no DOM/three/timers.
 *
 * Toys race down a runway towards the Signalman, a mechanical referee. The match cycles:
 *
 *   go    the Signalman faces away. Run!
 *   warn  the tell: its key ratchets and it starts to turn (always at least `warnMs[0]` long).
 *   stop  it faces the runway. After a short grace, any toy still moving is caught: flicked
 *         back to the start line (`knockBack`) and held there until the next go.
 *
 * Every cycle's lengths are rolled from the seed up front, so the timing never depends on inputs.
 * First across the line wins; once somebody finishes, the rest have `closingMs` to get home.
 * Placement: finish time, then distance (GAME_DESIGN "progress" scoring).
 *
 * Coordinates: 1 unit = 1 cm, runway along −z (start at `startZ`, finish at `finishZ`).
 */
import { seededRng } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { NO_INPUT, TOY_TUNING, createMover, latchInput, moverSpeed, stepMover, type MoveInput, type MoveWorld, type Mover } from '../shared/movement';

export type RlglInput = MoveInput;

export interface RlglConfig {
  startZ: number;
  finishZ: number;
  /** Half the runway width (cm). */
  halfWidth: number;
  introMs: number;
  goMs: [number, number];
  /** Now and then the go is a short "snap" one, to keep everybody honest. */
  snapChance: number;
  snapGoMs: [number, number];
  warnMs: [number, number];
  stopMs: [number, number];
  /** After the light turns red, movement is forgiven for this long. */
  graceMs: number;
  /** Horizontal speed (cm/s) above which a toy counts as moving. */
  moveThreshold: number;
  /** How far a caught toy is flicked back (cm). The default is further than the runway: back to the start. */
  knockBack: number;
  flingMs: number;
  limitMs: number;
  /** Time left for everyone else once the first toy finishes. */
  closingMs: number;
}

export const DEFAULT_CONFIG: RlglConfig = {
  startZ: 53,
  finishZ: -53,
  halfWidth: 17,
  introMs: 900,
  goMs: [1300, 2700],
  snapChance: 0.2,
  snapGoMs: [750, 1150],
  warnMs: [600, 900],
  stopMs: [1700, 2900],
  graceMs: 140,
  moveThreshold: 1,
  knockBack: 1000,
  flingMs: 700,
  limitMs: 90000,
  closingMs: 15000,
};

export type Phase = 'intro' | 'go' | 'warn' | 'stop' | 'over';

export interface Cycle {
  goMs: number;
  warnMs: number;
  stopMs: number;
}

export interface Fling {
  t: number;
  fromZ: number;
  toZ: number;
}

export interface RlglPlayer {
  id: string;
  m: Mover;
  input: MoveInput;
  finished: boolean;
  /** Match time at the finish (ms), or 0. */
  finishT: number;
  /** Times caught. */
  caught: number;
  /** Being flicked back right now. */
  fling: Fling | null;
  /** Caught this stop: can't move (and can't be caught again) until the next go. */
  held: boolean;
}

export interface RlglState {
  config: RlglConfig;
  t: number;
  phase: Phase;
  phaseT: number;
  /** Index into `cycles` (wraps). */
  cycle: number;
  cycles: Cycle[];
  /** Match time at which the round ends (the limit, or sooner once someone finishes). */
  endAt: number;
  finishers: number;
  players: RlglPlayer[];
  world: MoveWorld;
  events: MatchEvent[];
}

export const currentCycle = (s: RlglState) => s.cycles[s.cycle % s.cycles.length];

/** 0 at the start line, 1 at the finish. */
export function progressOf(s: RlglState, p: RlglPlayer): number {
  const c = s.config;
  return Math.max(0, Math.min(1, (c.startZ - p.m.z) / (c.startZ - c.finishZ)));
}

/** Start-line x for contestant `i` of `n`: first in the middle, the rest alternating outwards. */
export function laneX(i: number, n: number, halfWidth: number): number {
  const gap = Math.min(4.2, (halfWidth * 2 - 4) / Math.max(1, n - 1));
  const side = i % 2 === 1 ? -1 : 1;
  const step = Math.ceil(i / 2);
  // With an even field, shift half a gap so the row stays centred on the runway.
  return side * step * gap + (n % 2 === 0 ? gap / 2 : 0);
}

function setPhase(s: RlglState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
}

function rollCycles(rng: () => number, cfg: RlglConfig): Cycle[] {
  const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
  const out: Cycle[] = [];
  let lastSnap: boolean = true; // never open with a snap go
  for (let i = 0; i < 64; i++) {
    const snap: boolean = !lastSnap && rng() < cfg.snapChance;
    lastSnap = snap;
    out.push({ goMs: between(snap ? cfg.snapGoMs : cfg.goMs), warnMs: between(cfg.warnMs), stopMs: between(cfg.stopMs) });
  }
  return out;
}

function catchPlayer(s: RlglState, p: RlglPlayer) {
  const c = s.config;
  p.caught++;
  p.held = true;
  p.fling = { t: 0, fromZ: p.m.z, toZ: Math.min(c.startZ, p.m.z + c.knockBack) };
  p.m.vx = p.m.vz = p.m.vy = 0;
  p.m.y = 0;
  p.m.grounded = true;
  s.events.push({ type: 'caught', id: p.id, back: p.fling.toZ - p.fling.fromZ });
}

function finish(s: RlglState, p: RlglPlayer) {
  p.finished = true;
  p.finishT = s.t;
  s.finishers++;
  s.events.push({ type: 'finish', id: p.id, order: s.finishers, t: s.t });
  if (s.finishers === 1 && s.t + s.config.closingMs < s.endAt) {
    s.endAt = s.t + s.config.closingMs;
    s.events.push({ type: 'closing', ms: s.config.closingMs });
  }
}

export const rlglRules: RulesCore<RlglState, RlglInput, RlglConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<RlglConfig>): RlglState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const rng = seededRng(seed);
    const n = contestants.length;
    return {
      config: cfg,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      cycle: 0,
      cycles: rollCycles(rng, cfg),
      endAt: cfg.limitMs,
      finishers: 0,
      players: contestants.map((c, i) => ({
        id: c.id,
        m: createMover(laneX(i, n, cfg.halfWidth), cfg.startZ),
        input: NO_INPUT,
        finished: false,
        finishT: 0,
        caught: 0,
        fling: null,
        held: false,
      })),
      // Room to back up behind the start line and to run on past the finish.
      world: { solids: [], bounds: { minX: -cfg.halfWidth, maxX: cfg.halfWidth, minZ: cfg.finishZ - 5, maxZ: cfg.startZ + 3 } },
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    const c = s.config;
    s.t += dtMs;
    s.phaseT += dtMs;

    // ---- the signal
    const cyc = currentCycle(s);
    if (s.phase === 'intro' && s.phaseT >= c.introMs) {
      setPhase(s, 'go');
      s.events.push({ type: 'go', first: true });
    } else if (s.phase === 'go' && s.phaseT >= cyc.goMs) {
      setPhase(s, 'warn');
      s.events.push({ type: 'warn', ms: cyc.warnMs });
    } else if (s.phase === 'warn' && s.phaseT >= cyc.warnMs) {
      setPhase(s, 'stop');
      s.events.push({ type: 'stop' });
    } else if (s.phase === 'stop' && s.phaseT >= cyc.stopMs) {
      s.cycle++;
      setPhase(s, 'go');
      for (const p of s.players) if (!p.fling) p.held = false;
      s.events.push({ type: 'go', first: false });
    }

    // ---- the toys
    const watching = s.phase === 'stop' && s.phaseT > c.graceMs;
    for (const p of s.players) {
      p.input = latchInput(p.input, inputs[p.id]);

      if (p.fling) {
        // Flicked back along the runway; the Scene adds the arc.
        p.fling.t += dtMs;
        const k = Math.min(1, p.fling.t / c.flingMs);
        p.m.z = p.fling.fromZ + (p.fling.toZ - p.fling.fromZ) * (1 - (1 - k) * (1 - k));
        if (k >= 1) {
          p.fling = null;
          if (s.phase !== 'stop') p.held = false;
          s.events.push({ type: 'landed', id: p.id });
        }
        continue;
      }

      let input = p.input;
      if (p.finished) {
        // Trot a little past the line and wait there.
        input = p.m.z > c.finishZ - 3 ? { ax: 0, ay: 0.7, run: false, jump: false } : NO_INPUT;
      } else if (p.held || s.phase === 'intro') {
        input = NO_INPUT;
      }
      const rep = stepMover(p.m, input, dtMs, s.world, TOY_TUNING);
      if (rep.jumped) s.events.push({ type: 'jump', id: p.id });
      if (rep.landed) s.events.push({ type: 'land', id: p.id, impact: rep.landed });

      if (p.finished) continue;
      if (p.m.z <= c.finishZ) finish(s, p);
      else if (watching && !p.held && moverSpeed(p.m) > c.moveThreshold) catchPlayer(s, p);
    }

    if (s.finishers === s.players.length || s.t >= s.endAt) {
      setPhase(s, 'over');
      s.events.push({ type: 'over' });
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    const limitS = s.config.limitMs / 1000;
    const ordered = s.players
      .map((p) => {
        const prog = progressOf(s, p);
        return {
          contestantId: p.id,
          // Finishers: 100 + seconds left on the clock. Everyone else: percent of the runway covered.
          score: p.finished ? 100 + Math.max(0, Math.round(limitS - p.finishT / 1000)) : Math.min(99, Math.floor(prog * 100)),
          key: p.finished ? `f|${Math.round(p.finishT)}` : `d|${Math.round(prog * 1000)}`,
          finished: p.finished,
          finishT: p.finishT,
          prog,
        };
      })
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return a.finished ? a.finishT - b.finishT : Math.round(b.prog * 1000) - Math.round(a.prog * 1000);
      });
    return {
      placements: rankByKey(ordered),
      durationMs: s.t,
      stats: { cycles: s.cycle + 1, finishers: s.finishers, caught: s.players.reduce((n, p) => n + p.caught, 0) },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
