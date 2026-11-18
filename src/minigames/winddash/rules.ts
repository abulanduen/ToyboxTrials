/**
 * Wind-Up Dash — rules core (GAME_DESIGN.md §4 · 07). Deterministic; no DOM/three/timers.
 *
 * A straight sprint down a strip of tabletop props, first across the line wins:
 *
 *   1. Domino rows   standing dominoes block the way except for two gaps per row. Walk into one
 *                    and it topples (and stops blocking), so the leaders clear a path.
 *   2. Spring + wall a block wall with a narrow gate on one side. A spring pad on the other side
 *                    throws a toy clean over it.
 *   3. Ruler bridge  a spill of jam slows toys to a crawl; a ruler lies across it at an angle.
 *   4. Snap jaws     three rows of clockwork jaws that rattle, then snap shut. A toy inside when
 *                    one shuts is stunned; a shut jaw blocks the way. Each row always has one
 *                    side open.
 *
 * The layout (gap positions, sides, ruler angle, jaw timing) is rolled from the seed. Obstacle
 * timing depends only on match time, never on inputs. Toys don't collide with each other.
 * Placement: finish time, then distance along the course.
 */
import { seededRng, randInt } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { NO_INPUT, TOY_TUNING, createMover, latchInput, stepMover, type MoveInput, type MoveWorld, type Mover, type Solid } from '../shared/movement';

export type DashInput = MoveInput;

export interface DashConfig {
  startZ: number;
  finishZ: number;
  halfWidth: number;
  introMs: number;
  limitMs: number;
  /** Time left for everyone else once the first toy finishes. */
  closingMs: number;
  /** A toppling domino still blocks for this long. */
  toppleMs: number;
  /** Top-speed multiplier in the jam. */
  jamSlow: number;
  springDist: number;
  springMs: number;
  stunMs: number;
}

export const DEFAULT_CONFIG: DashConfig = {
  startZ: 53,
  finishZ: -53,
  halfWidth: 11,
  introMs: 500,
  limitMs: 75000,
  closingMs: 15000,
  toppleMs: 320,
  jamSlow: 0.38,
  springDist: 17,
  springMs: 650,
  stunMs: 1100,
};

export interface Domino {
  x: number;
  z: number;
  row: number;
  state: 'up' | 'falling' | 'down';
  /** Match time it was knocked (ms). */
  at: number;
}

export interface Jaw {
  x: number;
  z: number;
  hx: number;
  hz: number;
  periodMs: number;
  offsetMs: number;
}

export const JAW_WARN_MS = 550;
export const JAW_SHUT_MS = 750;
export const DOMINO = { hx: 1.0, hz: 0.32, top: 4, spacing: 2.4 };
export const WALL_TOP = 3.2;

export interface Course {
  /** Per domino row: its z and the x of each gap (for bots and the Scene). */
  rows: { z: number; gaps: number[] }[];
  wall: { z: number; hz: number; gateX: number; gateHalf: number };
  pad: { x: number; z: number; hx: number; hz: number };
  /** Jam between z0 (near side) and z1 (far side); the ruler runs from (x0, z0) to (x1, z1). */
  jam: { z0: number; z1: number };
  ruler: { x0: number; x1: number; half: number };
  jaws: Jaw[];
}

export interface DashPlayer {
  id: string;
  m: Mover;
  input: MoveInput;
  finished: boolean;
  finishT: number;
  /** Ms of stun left (snapped by a jaw). */
  stunMs: number;
  /** In the air off the spring pad. */
  toss: { t: number; fromZ: number; toZ: number } | null;
  snaps: number;
  toppled: number;
}

export type Phase = 'intro' | 'race' | 'over';

export interface DashState {
  config: DashConfig;
  t: number;
  phase: Phase;
  phaseT: number;
  endAt: number;
  finishers: number;
  course: Course;
  dominoes: Domino[];
  players: DashPlayer[];
  /** Walls that never change (the block wall either side of its gate). */
  fixed: Solid[];
  events: MatchEvent[];
}

export function progressOf(s: DashState, p: DashPlayer): number {
  const c = s.config;
  return Math.max(0, Math.min(1, (c.startZ - p.m.z) / (c.startZ - c.finishZ)));
}

/** Where a jaw is in its cycle at match time `t`. */
export function jawPhase(j: Jaw, t: number): 'open' | 'warn' | 'shut' {
  const k = (((t + j.offsetMs) % j.periodMs) + j.periodMs) % j.periodMs;
  const shutAt = j.periodMs - JAW_SHUT_MS;
  return k >= shutAt ? 'shut' : k >= shutAt - JAW_WARN_MS ? 'warn' : 'open';
}

/** x of the ruler's centre line at depth z (clamped to its ends). */
export function rulerX(c: Course, z: number): number {
  const k = Math.max(0, Math.min(1, (c.jam.z0 - z) / (c.jam.z0 - c.jam.z1)));
  return c.ruler.x0 + (c.ruler.x1 - c.ruler.x0) * k;
}

export const inJam = (c: Course, z: number) => z < c.jam.z0 && z > c.jam.z1;
export const onRuler = (c: Course, x: number, z: number) => Math.abs(x - rulerX(c, z)) <= c.ruler.half + 0.35;

const inRect = (x: number, z: number, r: { x: number; z: number; hx: number; hz: number }) => Math.abs(x - r.x) <= r.hx && Math.abs(z - r.z) <= r.hz;

/** Start grid: two rows so eight toys fit the narrow course. */
export function gridSlot(i: number, n: number, cfg: DashConfig): { x: number; z: number } {
  const perRow = Math.min(4, n);
  const row = Math.floor(i / perRow);
  const inRow = Math.min(perRow, n - row * perRow);
  const col = i % perRow;
  const gap = Math.min(4.4, (cfg.halfWidth * 2 - 4) / Math.max(1, inRow - 1));
  return { x: (col - (inRow - 1) / 2) * gap, z: cfg.startZ + row * 3 };
}

function buildCourse(rng: () => number, cfg: DashConfig): { course: Course; dominoes: Domino[]; fixed: Solid[] } {
  const hw = cfg.halfWidth;
  // 1. Domino rows.
  const perRow = Math.floor((hw * 2 - 0.4) / DOMINO.spacing);
  const x0 = -((perRow - 1) / 2) * DOMINO.spacing;
  const dominoes: Domino[] = [];
  const rows: Course['rows'] = [];
  [39, 33, 27].forEach((z, row) => {
    const a = randInt(rng, perRow);
    let b = randInt(rng, perRow - 3);
    if (b >= a - 1) b += 3; // second gap at least two dominoes away from the first
    const gaps = [a, b].map((i) => x0 + i * DOMINO.spacing);
    rows.push({ z, gaps });
    for (let i = 0; i < perRow; i++) if (i !== a && i !== b) dominoes.push({ x: x0 + i * DOMINO.spacing, z, row, state: 'up', at: 0 });
  });
  // 2. Spring pad on one side, the wall's gate on the other.
  const side = rng() < 0.5 ? -1 : 1;
  const gateHalf = 1.7;
  const gateX = -side * (hw - gateHalf - 0.6);
  const wall = { z: 9, hz: 0.7, gateX, gateHalf };
  const pad = { x: side * hw * 0.5, z: 17.5, hx: hw * 0.5 - 1, hz: 1.7 };
  const fixed: Solid[] = [];
  const addWall = (from: number, to: number) => {
    if (to - from > 0.2) fixed.push({ kind: 'box', id: 'wall', x: (from + to) / 2, z: wall.z, hx: (to - from) / 2, hz: wall.hz, rot: 0, top: WALL_TOP });
  };
  addWall(-hw, gateX - gateHalf);
  addWall(gateX + gateHalf, hw);
  // 3. Jam and ruler.
  const span = hw - 3.5;
  const rx0 = (rng() * 2 - 1) * span;
  let rx1 = (rng() * 2 - 1) * span;
  if (Math.abs(rx1 - rx0) < 4) rx1 = rx0 > 0 ? rx0 - 6 : rx0 + 6; // always a real diagonal
  const jam = { z0: -3, z1: -23 };
  const ruler = { x0: rx0, x1: rx1, half: 1.7 };
  // 4. Snap jaws: two per row, half a period apart, so one side is always open.
  const jaws: Jaw[] = [];
  for (const z of [-31, -38.5, -46]) {
    const periodMs = 2700 + rng() * 700;
    const offsetMs = rng() * periodMs;
    const flip = rng() < 0.5 ? 0 : 1;
    [-1, 1].forEach((sx, i) => jaws.push({ x: (sx * hw) / 2, z, hx: hw / 2 - 0.25, hz: 1.5, periodMs, offsetMs: offsetMs + ((i + flip) % 2) * (periodMs / 2) }));
  }
  return { course: { rows, wall, pad, jam, ruler, jaws }, dominoes, fixed };
}

function finish(s: DashState, p: DashPlayer) {
  p.finished = true;
  p.finishT = s.t;
  s.finishers++;
  s.events.push({ type: 'finish', id: p.id, order: s.finishers, t: s.t });
  if (s.finishers === 1 && s.t + s.config.closingMs < s.endAt) {
    s.endAt = s.t + s.config.closingMs;
    s.events.push({ type: 'closing', ms: s.config.closingMs });
  }
}

export const dashRules: RulesCore<DashState, DashInput, DashConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<DashConfig>): DashState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const built = buildCourse(seededRng(seed), cfg);
    const n = contestants.length;
    return {
      config: cfg,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      endAt: cfg.limitMs,
      finishers: 0,
      course: built.course,
      dominoes: built.dominoes,
      fixed: built.fixed,
      players: contestants.map((c, i) => {
        const g = gridSlot(i, n, cfg);
        return { id: c.id, m: createMover(g.x, g.z), input: NO_INPUT, finished: false, finishT: 0, stunMs: 0, toss: null, snaps: 0, toppled: 0 };
      }),
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    const c = s.config;
    const prevT = s.t;
    s.t += dtMs;
    s.phaseT += dtMs;
    if (s.phase === 'intro' && s.phaseT >= c.introMs) {
      s.phase = 'race';
      s.phaseT = 0;
      s.events.push({ type: 'start' });
    }

    // ---- obstacles that run on the clock
    for (const d of s.dominoes) if (d.state === 'falling' && s.t - d.at >= c.toppleMs) d.state = 'down';
    const shutNow: number[] = [];
    s.course.jaws.forEach((j, i) => {
      const was = jawPhase(j, prevT);
      const now = jawPhase(j, s.t);
      if (was === now) return;
      if (now === 'warn') s.events.push({ type: 'jaw-warn', jaw: i });
      if (now === 'shut') {
        shutNow.push(i);
        s.events.push({ type: 'jaw-shut', jaw: i });
      }
    });

    // ---- this step's walls
    const solids: Solid[] = s.fixed.slice();
    s.dominoes.forEach((d, i) => {
      if (d.state !== 'down') solids.push({ kind: 'box', id: `dom:${i}`, x: d.x, z: d.z, hx: DOMINO.hx, hz: DOMINO.hz, rot: 0, top: DOMINO.top });
    });
    s.course.jaws.forEach((j, i) => {
      if (jawPhase(j, s.t) === 'shut') solids.push({ kind: 'box', id: `jaw:${i}`, x: j.x, z: j.z, hx: j.hx, hz: j.hz, rot: 0, top: 3.4 });
    });
    const world: MoveWorld = { solids, bounds: { minX: -c.halfWidth, maxX: c.halfWidth, minZ: c.finishZ - 5, maxZ: c.startZ + 6 } };

    for (const p of s.players) {
      p.input = latchInput(p.input, inputs[p.id]);

      if (p.toss) {
        // Thrown by the spring: straight over the wall, no steering, no collisions.
        p.toss.t += dtMs;
        const k = Math.min(1, p.toss.t / c.springMs);
        p.m.z = p.toss.fromZ + (p.toss.toZ - p.toss.fromZ) * k;
        if (k >= 1) {
          p.toss = null;
          s.events.push({ type: 'land', id: p.id, impact: 1.4 });
        }
        continue;
      }

      // A jaw snapping shut on a toy stuns it and spits it back out the near side.
      for (const i of shutNow) {
        const j = s.course.jaws[i];
        if (p.finished || !inRect(p.m.x, p.m.z, { ...j, hx: j.hx + 0.3, hz: j.hz + 0.5 })) continue;
        p.stunMs = c.stunMs;
        p.snaps++;
        p.m.z = j.z + j.hz + TOY_TUNING.radius + 0.6;
        p.m.vx = p.m.vz = 0;
        s.events.push({ type: 'snap', id: p.id, jaw: i });
      }

      let input = p.input;
      if (p.finished) input = p.m.z > c.finishZ - 3 ? { ax: 0, ay: 0.7, run: false, jump: false } : NO_INPUT;
      else if (s.phase === 'intro') input = NO_INPUT;
      else if (p.stunMs > 0) {
        p.stunMs = Math.max(0, p.stunMs - dtMs);
        input = NO_INPUT;
      }
      const slow = !p.finished && p.m.grounded && inJam(s.course, p.m.z) && !onRuler(s.course, p.m.x, p.m.z);
      const rep = stepMover(p.m, input, dtMs, world, TOY_TUNING, slow ? c.jamSlow : 1);
      if (rep.jumped) s.events.push({ type: 'jump', id: p.id });
      if (rep.landed) s.events.push({ type: 'land', id: p.id, impact: rep.landed });
      if (rep.hit?.startsWith('dom:')) {
        const d = s.dominoes[Number(rep.hit.slice(4))];
        if (d.state === 'up') {
          d.state = 'falling';
          d.at = s.t;
          p.toppled++;
          s.events.push({ type: 'domino', index: Number(rep.hit.slice(4)), id: p.id });
        }
      }
      if (p.finished) continue;

      if (p.m.grounded && p.stunMs <= 0 && inRect(p.m.x, p.m.z, s.course.pad)) {
        p.toss = { t: 0, fromZ: p.m.z, toZ: p.m.z - c.springDist };
        p.m.vx = 0;
        p.m.vz = -TOY_TUNING.run; // lands running
        p.m.yaw = Math.PI;
        s.events.push({ type: 'spring', id: p.id });
      } else if (p.m.z <= c.finishZ) finish(s, p);
    }

    if (s.finishers === s.players.length || s.t >= s.endAt) {
      s.phase = 'over';
      s.phaseT = 0;
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
          // Finishers: 100 + seconds left on the clock. Everyone else: percent of the course covered.
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
      stats: { finishers: s.finishers, snaps: s.players.reduce((n, p) => n + p.snaps, 0), dominoes: s.dominoes.filter((d) => d.state !== 'up').length },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
