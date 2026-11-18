/**
 * Wind-Up Dash — rules core (GAME_DESIGN.md §4 · 07). Deterministic; no DOM/three/timers.
 *
 * A sprint down a strip of tabletop props, first across the line wins. Every match gets its own
 * course from the match seed (`course.ts`): a road that bends, narrows and widens, carrying four
 * or five trap sections picked from this catalogue:
 *
 *   Domino rows    standing dominoes block the way except for gaps. Walk into one and it topples
 *                  (and stops blocking), so the leaders clear a path.
 *   Spring pad     a block wall with a narrow gate on one side; the pad on the other side throws
 *                  a toy clean over it.
 *   Sticky jam     a spill that slows toys to a crawl, with a ruler (or two) lying across it.
 *   Snap jaws      rows of clockwork jaws that rattle, then snap shut. A toy inside is stunned; a
 *                  shut jaw blocks. Each row always has one side open.
 *   Crayon gates   a fence with three doorways whose crayon barriers lift in turn.
 *   Marble run     marbles roll across the road in lanes. One bowls a toy over; hop them or time it.
 *   Pendulum       a bead on a long string swings across the road and knocks toys back.
 *   Spinning tops  wandering tops that bounce a toy away on touch.
 *   Tape belts     tape-measure conveyor belts: one carries you forward, the others back.
 *   Book steps     books across the road: hop up, or queue for the ramp at the side.
 *
 * Trap timing depends only on match time, never on inputs. Toys don't collide with each other.
 * Placement: finish time, then distance along the course.
 */
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { NO_INPUT, TOY_TUNING, createMover, latchInput, stepMover, type MoveInput, type MoveWorld, type Mover, type Solid } from '../shared/movement';
import {
  CRAYON_TOP,
  DOMINO,
  JAW_TOP,
  MARBLE_CLEAR_Y,
  MARBLE_R,
  POST_TOP,
  START_HW,
  TOP_HEIGHT,
  WALL_TOP,
  beltAt,
  bobX,
  crayonPhase,
  generateCourse,
  inJam,
  jawPhase,
  marbleX,
  onRuler,
  roadCx,
  roadHw,
  sectionAt,
  topX,
  topZ,
  type Course,
  type Jaw,
  type PlanItem,
} from './course';

export type DashInput = MoveInput;

export interface DashConfig {
  introMs: number;
  limitMs: number;
  /** Time left for everyone else once the first toy finishes. */
  closingMs: number;
  /** A toppling domino still blocks for this long. */
  toppleMs: number;
  /** Top-speed multiplier in the jam. */
  jamSlow: number;
  springMs: number;
  /** Stun after a snap jaw bites. */
  stunMs: number;
  /** A marble or the pendulum bowls a toy back for this long, then it sits dazed for `bonkStunMs`. */
  bonkMs: number;
  bonkStunMs: number;
  /** Speed a spinning top throws a toy off at (cm/s). */
  bumpSpeed: number;
  /** Tests and tuning only: force the trap list instead of rolling it from the seed. */
  plan: PlanItem[] | null;
}

export const DEFAULT_CONFIG: DashConfig = {
  introMs: 500,
  limitMs: 75000,
  closingMs: 15000,
  toppleMs: 320,
  jamSlow: 0.38,
  springMs: 650,
  stunMs: 1100,
  bonkMs: 420,
  bonkStunMs: 350,
  bumpSpeed: 15,
  plan: null,
};

export interface Domino {
  x: number;
  z: number;
  /** Section index and row within it. */
  sec: number;
  row: number;
  state: 'up' | 'falling' | 'down';
  /** Match time it was knocked (ms). */
  at: number;
}

export interface Toss {
  t: number;
  ms: number;
  fromZ: number;
  toZ: number;
  /** Height of the arc (cm), for the render layer. */
  h: number;
  /** Stun on landing (ms). */
  stun: number;
}

export interface DashPlayer {
  id: string;
  m: Mover;
  input: MoveInput;
  finished: boolean;
  finishT: number;
  /** Ms of stun left (snapped by a jaw, or dazed after a knock). */
  stunMs: number;
  /** In the air: off the spring pad, or bowled over by a marble or the pendulum. */
  toss: Toss | null;
  snaps: number;
  toppled: number;
  /** Times bowled over (marbles, pendulum). */
  bonks: number;
  /** Times bounced off a spinning top. */
  bumps: number;
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
  /** Walls and floors that never change (block wall, fence posts, books and their ramps). */
  fixed: Solid[];
  events: MatchEvent[];
}

export function progressOf(s: DashState, p: DashPlayer): number {
  const c = s.course;
  return Math.max(0, Math.min(1, (c.startZ - p.m.z) / (c.startZ - c.finishZ)));
}

/** Is a grounded toy at (x, z) wading through jam (in the spill and off the ruler)? */
export function stuckInJam(course: Course, x: number, z: number): boolean {
  const sec = sectionAt(course, z);
  return !!sec && sec.kind === 'jam' && inJam(sec, z) && !onRuler(sec, x, z);
}

const inRect = (x: number, z: number, r: { x: number; z: number; hx: number; hz: number }) => Math.abs(x - r.x) <= r.hx && Math.abs(z - r.z) <= r.hz;

/** Start grid: two rows so eight toys fit the road. */
export function gridSlot(i: number, n: number, course: Course): { x: number; z: number } {
  const perRow = Math.min(4, n);
  const row = Math.floor(i / perRow);
  const inRow = Math.min(perRow, n - row * perRow);
  const col = i % perRow;
  const gap = Math.min(4.4, (START_HW * 2 - 4) / Math.max(1, inRow - 1));
  return { x: (col - (inRow - 1) / 2) * gap, z: course.startZ + row * 3 };
}

function fixedSolids(course: Course): Solid[] {
  const out: Solid[] = [];
  const box = (id: string, x: number, z: number, hx: number, hz: number, top: number) => out.push({ kind: 'box', id, x, z, hx, hz, rot: 0, top });
  for (const sec of course.sections) {
    if (sec.kind === 'spring') {
      const { wall } = sec;
      const span = (from: number, to: number) => {
        if (to - from > 0.2) box('wall', (from + to) / 2, wall.z, (to - from) / 2, wall.hz, WALL_TOP);
      };
      span(sec.cx - sec.hw, wall.gateX - wall.gateHalf);
      span(wall.gateX + wall.gateHalf, sec.cx + sec.hw);
    } else if (sec.kind === 'crayons') {
      for (const row of sec.rows) for (const p of row.posts) box('post', p.x, row.z, p.hx, row.hz + 0.25, POST_TOP);
    } else if (sec.kind === 'books') {
      for (const b of sec.books) box('book', b.x, b.z, b.hx, b.hz, b.top);
      for (const st of sec.steps) box('step', st.x, st.z, st.hx, st.hz, st.top);
    }
  }
  return out;
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

/** Bowled over: thrown back to `toZ`, then dazed for a moment. */
function knock(s: DashState, p: DashPlayer, toZ: number, by: string) {
  const c = s.config;
  p.toss = { t: 0, ms: c.bonkMs, fromZ: p.m.z, toZ: Math.max(p.m.z, toZ), h: 3, stun: c.bonkStunMs };
  p.m.vx = p.m.vz = p.m.vy = 0;
  p.m.y = 0;
  p.m.grounded = true;
  p.bonks++;
  s.events.push({ type: 'bonk', id: p.id, by });
}

export const dashRules: RulesCore<DashState, DashInput, DashConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<DashConfig>): DashState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const course = generateCourse(seed, cfg.plan);
    const dominoes: Domino[] = [];
    for (const sec of course.sections) if (sec.kind === 'dominoes') for (const d of sec.dominoes) dominoes.push({ x: d.x, z: d.z, sec: sec.index, row: d.row, state: 'up', at: 0 });
    const n = contestants.length;
    return {
      config: cfg,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      endAt: cfg.limitMs,
      finishers: 0,
      course,
      dominoes,
      fixed: fixedSolids(course),
      players: contestants.map((c, i) => {
        const g = gridSlot(i, n, course);
        return { id: c.id, m: createMover(g.x, g.z), input: NO_INPUT, finished: false, finishT: 0, stunMs: 0, toss: null, snaps: 0, toppled: 0, bonks: 0, bumps: 0 };
      }),
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    const c = s.config;
    const course = s.course;
    const prevT = s.t;
    s.t += dtMs;
    s.phaseT += dtMs;
    if (s.phase === 'intro' && s.phaseT >= c.introMs) {
      s.phase = 'race';
      s.phaseT = 0;
      s.events.push({ type: 'start' });
    }

    // ---- traps that run on the clock, and this step's walls
    const solids: Solid[] = s.fixed.slice();
    for (let i = 0; i < s.dominoes.length; i++) {
      const d = s.dominoes[i];
      if (d.state === 'falling' && s.t - d.at >= c.toppleMs) d.state = 'down';
      if (d.state !== 'down') solids.push({ kind: 'box', id: `dom:${i}`, x: d.x, z: d.z, hx: DOMINO.hx, hz: DOMINO.hz, rot: 0, top: DOMINO.top });
    }
    const shutNow: Jaw[] = [];
    for (const sec of course.sections) {
      if (sec.kind === 'jaws') {
        for (const j of sec.jaws) {
          const was = jawPhase(j, prevT);
          const now = jawPhase(j, s.t);
          if (was !== now) {
            if (now === 'warn') s.events.push({ type: 'jaw-warn', jaw: j.id });
            if (now === 'shut') {
              shutNow.push(j);
              s.events.push({ type: 'jaw-shut', jaw: j.id });
            }
          }
          if (now === 'shut') solids.push({ kind: 'box', id: `jaw:${j.id}`, x: j.x, z: j.z, hx: j.hx, hz: j.hz, rot: 0, top: JAW_TOP });
        }
      } else if (sec.kind === 'crayons') {
        for (const row of sec.rows) {
          for (let d = 0; d < row.doors.length; d++) {
            const now = crayonPhase(row, d, s.t);
            if (now !== 'shut') continue;
            if (crayonPhase(row, d, prevT) !== 'shut') s.events.push({ type: 'crayon-shut', row: row.id, door: d });
            solids.push({ kind: 'box', id: `crayon:${row.id}:${d}`, x: row.doors[d].x, z: row.z, hx: row.doors[d].half, hz: row.hz, rot: 0, top: CRAYON_TOP });
          }
        }
      } else if (sec.kind === 'tops') {
        for (const tp of sec.tops) solids.push({ kind: 'circle', id: `top:${tp.id}`, x: topX(tp, s.t), z: topZ(tp, s.t), r: tp.r, top: TOP_HEIGHT });
      }
    }
    const world: MoveWorld = { solids, bounds: { minX: -1000, maxX: 1000, minZ: course.finishZ - 5, maxZ: course.startZ + 6 } };
    const R = TOY_TUNING.radius;

    for (const p of s.players) {
      p.input = latchInput(p.input, inputs[p.id]);

      if (p.toss) {
        // Thrown: by the spring (straight over the wall) or bowled back. No steering, no collisions.
        const tz = p.toss;
        tz.t += dtMs;
        const k = Math.min(1, tz.t / tz.ms);
        p.m.z = tz.fromZ + (tz.toZ - tz.fromZ) * k;
        if (k >= 1) {
          p.stunMs = Math.max(p.stunMs, tz.stun);
          p.toss = null;
          s.events.push({ type: 'land', id: p.id, impact: 1.4 });
        }
        continue;
      }

      // A jaw snapping shut on a toy stuns it and spits it back out the near side.
      for (const j of shutNow) {
        if (p.finished || Math.abs(p.m.x - j.x) > j.hx + 0.3 || Math.abs(p.m.z - j.z) > j.hz + 0.5) continue;
        p.stunMs = c.stunMs;
        p.snaps++;
        p.m.z = j.z + j.hz + R + 0.6;
        p.m.vx = p.m.vz = 0;
        s.events.push({ type: 'snap', id: p.id, jaw: j.id });
      }

      let input = p.input;
      if (p.finished) input = p.m.z > course.finishZ - 3 ? { ax: 0, ay: 0.7, run: false, jump: false } : NO_INPUT;
      else if (s.phase === 'intro') input = NO_INPUT;
      else if (p.stunMs > 0) {
        p.stunMs = Math.max(0, p.stunMs - dtMs);
        input = NO_INPUT;
      }
      const slow = !p.finished && p.m.grounded && stuckInJam(course, p.m.x, p.m.z);
      const rep = stepMover(p.m, input, dtMs, world, TOY_TUNING, slow ? c.jamSlow : 1);
      if (rep.jumped) s.events.push({ type: 'jump', id: p.id });
      if (rep.landed) s.events.push({ type: 'land', id: p.id, impact: rep.landed });

      // The road's own edges (it bends and changes width, so they depend on where the toy is).
      const cx = roadCx(course, p.m.z);
      const reach = roadHw(course, p.m.z) - R;
      if (p.m.x < cx - reach) {
        p.m.x = cx - reach;
        if (p.m.vx < 0) p.m.vx = 0;
      } else if (p.m.x > cx + reach) {
        p.m.x = cx + reach;
        if (p.m.vx > 0) p.m.vx = 0;
      }

      if (rep.hit?.startsWith('dom:')) {
        const i = Number(rep.hit.slice(4));
        const d = s.dominoes[i];
        if (d.state === 'up') {
          d.state = 'falling';
          d.at = s.t;
          p.toppled++;
          s.events.push({ type: 'domino', index: i, id: p.id });
        }
      }
      if (p.finished) continue;

      const sec = sectionAt(course, p.m.z);
      if (sec) {
        if (sec.kind === 'tops' && rep.hit?.startsWith('top:')) {
          // Bounced off: thrown directly away from the top it touched.
          const id = Number(rep.hit.slice(4));
          const tp = sec.tops.find((x) => x.id === id);
          if (tp) {
            const dx = p.m.x - topX(tp, s.t);
            const dz = p.m.z - topZ(tp, s.t);
            const d = Math.hypot(dx, dz) || 1;
            p.m.vx = (dx / d) * c.bumpSpeed;
            p.m.vz = (dz / d) * c.bumpSpeed;
            p.bumps++;
            s.events.push({ type: 'bump', id: p.id, top: id });
          }
        } else if (sec.kind === 'conveyor' && p.m.grounded) {
          p.m.z -= beltAt(sec, p.m.x, p.m.z) * (dtMs / 1000);
        } else if (sec.kind === 'marbles' && p.m.y < MARBLE_CLEAR_Y) {
          const reachM = MARBLE_R + R - 0.2;
          for (const lane of sec.lanes) {
            const dz = p.m.z - lane.z;
            if (Math.abs(dz) >= reachM) continue;
            let hit = false;
            for (let i = 0; i < lane.count && !hit; i++) hit = Math.hypot(p.m.x - marbleX(lane, i, s.t), dz) < reachM;
            if (hit) knock(s, p, lane.z + 2.7, 'marble');
            break;
          }
        } else if (sec.kind === 'pendulum') {
          for (const arm of sec.arms) {
            if (Math.abs(p.m.z - arm.z) < arm.hz && Math.abs(p.m.x - bobX(arm, s.t)) < arm.r + 0.55) {
              knock(s, p, arm.z + arm.hz + R + 1.2, 'pendulum');
              break;
            }
          }
        } else if (sec.kind === 'spring' && p.m.grounded && p.stunMs <= 0 && inRect(p.m.x, p.m.z, sec.pad)) {
          p.toss = { t: 0, ms: c.springMs, fromZ: p.m.z, toZ: p.m.z - sec.dist, h: 7.5, stun: 0 };
          p.m.vx = 0;
          p.m.vz = -TOY_TUNING.run; // lands running
          p.m.yaw = Math.PI;
          s.events.push({ type: 'spring', id: p.id });
        }
      }
      if (!p.toss && p.m.z <= course.finishZ) finish(s, p);
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
      stats: {
        finishers: s.finishers,
        snaps: s.players.reduce((n, p) => n + p.snaps, 0),
        bonks: s.players.reduce((n, p) => n + p.bonks, 0),
        dominoes: s.dominoes.filter((d) => d.state !== 'up').length,
        traps: s.course.sections.length,
      },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
