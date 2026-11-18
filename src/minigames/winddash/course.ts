/**
 * Wind-Up Dash — course generator (GAME_DESIGN.md §4 · 07). Pure and deterministic: the same seed
 * gives every client (and a future game server) the same course. No DOM, no three.js, no clocks.
 *
 * A course is a road (a strip of felt whose width and centre line change along the way) carrying
 * four or five trap sections picked from a catalogue of ten, each at one of three levels. The
 * output is plain data: the rules core steps it, the bots read it, the Scene draws it.
 *
 * Axes are the rules core's: forward is −z, so `z0` (where a section starts) is greater than `z1`.
 *
 * Fairness rules the generator keeps (checked by `courseProblems`, which the unit tests run over
 * hundreds of seeds):
 *   - no trap kind twice in one course, two timing traps never back to back, the first trap is
 *     never at level 3, and the levels come from a fixed budget (never all hard);
 *   - the road is one connected strip, never narrower than 17 cm, with gentle bends only;
 *   - total length stays close to the original fixed course;
 *   - every trap leaves a way through: gaps a toy fits, one jaw of a pair always open, a crayon
 *     gate always open somewhere, marbles spaced wider than a toy, jumps well inside the toy's hop.
 */
import { randInt, seededRng, shuffle, subSeed } from '../rng';
import { TOY_TUNING } from '../shared/movement';

export type Level = 1 | 2 | 3;
export type SectionKind = 'dominoes' | 'spring' | 'jam' | 'jaws' | 'crayons' | 'marbles' | 'pendulum' | 'tops' | 'conveyor' | 'books';

export interface KindInfo {
  title: string;
  /** Timing traps are the ones you wait for; the rest are about picking a line. */
  timing: boolean;
  /** Section length (cm) at level 1, 2, 3. */
  len: [number, number, number];
  /** Road half-width range this trap is laid out for. */
  hw: [number, number];
}

export const KINDS: Record<SectionKind, KindInfo> = {
  dominoes: { title: 'Domino rows', timing: false, len: [12, 17, 17], hw: [8.5, 11.5] },
  spring: { title: 'Spring pad', timing: false, len: [21.5, 21.5, 21.5], hw: [9, 11.5] },
  jam: { title: 'Sticky jam', timing: false, len: [13, 16, 20], hw: [9, 11.5] },
  jaws: { title: 'Snap jaws', timing: true, len: [9, 16, 23], hw: [8.5, 11] },
  crayons: { title: 'Crayon gates', timing: true, len: [9, 9, 16], hw: [8.5, 10.5] },
  marbles: { title: 'Marble run', timing: true, len: [14, 14, 21], hw: [9.5, 11.5] },
  pendulum: { title: 'Pendulum', timing: true, len: [9, 16, 16], hw: [8.5, 10.5] },
  tops: { title: 'Spinning tops', timing: false, len: [12, 17, 17], hw: [9.5, 11.5] },
  conveyor: { title: 'Tape-measure belts', timing: false, len: [13, 18, 18], hw: [8.5, 10.5] },
  books: { title: 'Book steps', timing: false, len: [13, 18.5, 18.5], hw: [8.5, 10.5] },
};
export const SECTION_KINDS = Object.keys(KINDS) as SectionKind[];

export const LENGTH_MIN = 92;
export const LENGTH_MAX = 122;
export const START_HW = 11;
export const FINISH_HW = 10;
/** Clear road before the first trap and after the last. */
const RUN_IN = 8;
const RUN_OUT = 7;
/** Steepest a road edge may run sideways per cm forward. */
export const MAX_EDGE_SLOPE = 0.8;
const TOY_R = TOY_TUNING.radius;

// ------------------------------------------------------------------------------- trap constants

export const DOMINO = { hx: 1.0, hz: 0.32, top: 4, spacing: 2.4 };
export const WALL_TOP = 3.2;
export const JAW_WARN_MS = 550;
export const JAW_SHUT_MS = 750;
export const JAW_TOP = 3.4;
export const CRAYON_WARN_MS = 380;
export const CRAYON_TOP = 3.2;
export const POST_TOP = 4;
export const MARBLE_R = 0.9;
/** A toy whose feet are above this clears a marble. */
export const MARBLE_CLEAR_Y = 1.0;
export const TOP_HEIGHT = 2.6;

// ------------------------------------------------------------------------------------ sections

interface Base {
  index: number;
  level: Level;
  /** Start (near side) and end (far side); z0 > z1. */
  z0: number;
  z1: number;
  /** Road centre and half-width through the whole section. */
  cx: number;
  hw: number;
}

export interface DominoSpec {
  x: number;
  z: number;
  row: number;
}
export interface DominoSection extends Base {
  kind: 'dominoes';
  /** Per row: its z and the x of each gap. */
  rows: { z: number; gaps: number[] }[];
  dominoes: DominoSpec[];
}

export interface SpringSection extends Base {
  kind: 'spring';
  wall: { z: number; hz: number; gateX: number; gateHalf: number };
  pad: { x: number; z: number; hx: number; hz: number };
  /** How far the pad throws a toy (cm). */
  dist: number;
}

export interface JamSection extends Base {
  kind: 'jam';
  /** Jam lies between z0 (near) and z1 (far). */
  jam: { z0: number; z1: number };
  /** Centre line of the ruler(s), near end first. Two points, or three for a dog-leg. */
  path: { x: number; z: number }[];
  half: number;
}

export interface Jaw {
  /** Index among all jaws of the course (for events). */
  id: number;
  x: number;
  z: number;
  hx: number;
  hz: number;
  periodMs: number;
  offsetMs: number;
}
export interface JawSection extends Base {
  kind: 'jaws';
  /** Two per row: [left, right, left, right, …]. */
  jaws: Jaw[];
}

export interface CrayonRow {
  /** Index among all crayon rows of the course (for events). */
  id: number;
  z: number;
  hz: number;
  doors: { x: number; half: number }[];
  /** Solid fence between and beside the doorways. */
  posts: { x: number; hx: number }[];
  slotMs: number;
  offsetMs: number;
  /** order[k] = the door whose open window starts in slot k. */
  order: number[];
  /** How many doors are open at once (1 or 2). */
  open: number;
}
export interface CrayonSection extends Base {
  kind: 'crayons';
  rows: CrayonRow[];
}

export interface MarbleLane {
  z: number;
  /** +1 rolls towards +x, −1 towards −x. */
  dir: 1 | -1;
  /** cm/s. */
  speed: number;
  count: number;
  /** Distance between marbles (cm). */
  gap: number;
  offset: number;
  /** Marbles wrap round from x0 to x0 + count × gap (both ends are off the road). */
  x0: number;
}
export interface MarbleSection extends Base {
  kind: 'marbles';
  lanes: MarbleLane[];
}

export interface PendulumArm {
  x: number;
  z: number;
  amp: number;
  periodMs: number;
  phase: number;
  /** Bob radius, and half the depth of road it sweeps. */
  r: number;
  hz: number;
}
export interface PendulumSection extends Base {
  kind: 'pendulum';
  arms: PendulumArm[];
}

export interface SpinTop {
  /** Index among all tops of the course (for solid ids and events). */
  id: number;
  x: number;
  z: number;
  r: number;
  /** It wanders round a small circle of this radius. */
  orbit: number;
  periodMs: number;
  phase: number;
  dir: 1 | -1;
}
export interface TopsSection extends Base {
  kind: 'tops';
  tops: SpinTop[];
  /** Per row: its z and the x of each way through (for bots). */
  rows: { z: number; gaps: number[] }[];
}

export interface Belt {
  x: number;
  hx: number;
  z0: number;
  z1: number;
  /** cm/s it carries a toy forward (negative: backwards). */
  v: number;
}
export interface ConveyorSection extends Base {
  kind: 'conveyor';
  belts: Belt[];
  /** Stretches along the road; each has its own arrangement of belts. */
  segments: { z0: number; z1: number }[];
}

export interface Slab {
  x: number;
  z: number;
  hx: number;
  hz: number;
  top: number;
}
export interface BooksSection extends Base {
  kind: 'books';
  books: Slab[];
  /** Stair steps of each ramp (drawn as one wedge). */
  steps: Slab[];
  /** One per book: the face to hop up, and the ramp that avoids the hop. */
  faces: { z: number; top: number; from: number; rampX: number; rampHalf: number; rampLen: number }[];
}

export type Section = DominoSection | SpringSection | JamSection | JawSection | CrayonSection | MarbleSection | PendulumSection | TopsSection | ConveyorSection | BooksSection;

export interface RoadPoint {
  z: number;
  cx: number;
  hw: number;
}

export type DecorKind = 'block' | 'button' | 'spool' | 'pencil' | 'tree';
export interface Decor {
  kind: DecorKind;
  x: number;
  z: number;
  rot: number;
  size: number;
  /** Index into the Scene's palette list. */
  tint: number;
}

export interface PlanItem {
  kind: SectionKind;
  level: Level;
}

export interface Course {
  seed: number;
  startZ: number;
  finishZ: number;
  /** Road outline, start to finish (z descending); centre and width are linear in between. */
  road: RoadPoint[];
  sections: Section[];
  /** Tabletop clutter beside the road. Looks only: it never touches play. */
  decor: Decor[];
}

// ------------------------------------------------------------------------------------- queries

export const courseLength = (c: Course) => c.startZ - c.finishZ;

function roadLerp(c: Course, z: number, key: 'cx' | 'hw'): number {
  const r = c.road;
  if (z >= r[0].z) return r[0][key];
  for (let i = 1; i < r.length; i++) {
    if (z >= r[i].z) {
      const a = r[i - 1];
      const b = r[i];
      return a[key] + ((b[key] - a[key]) * (a.z - z)) / (a.z - b.z);
    }
  }
  return r[r.length - 1][key];
}
/** Road centre (x) at depth z. */
export const roadCx = (c: Course, z: number) => roadLerp(c, z, 'cx');
/** Road half-width at depth z. */
export const roadHw = (c: Course, z: number) => roadLerp(c, z, 'hw');

/** The section a toy at depth z is inside, if any. */
export function sectionAt(c: Course, z: number): Section | null {
  for (const s of c.sections) if (z <= s.z0 && z >= s.z1) return s;
  return null;
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

/** Where a jaw is in its cycle at match time `t`. */
export function jawPhase(j: Jaw, t: number): 'open' | 'warn' | 'shut' {
  const k = mod(t + j.offsetMs, j.periodMs);
  const shutAt = j.periodMs - JAW_SHUT_MS;
  return k >= shutAt ? 'shut' : k >= shutAt - JAW_WARN_MS ? 'warn' : 'open';
}
/** Ms until the jaw next shuts (0 if it is shut now). */
export function jawUntilShut(j: Jaw, t: number): number {
  const k = mod(t + j.offsetMs, j.periodMs);
  const shutAt = j.periodMs - JAW_SHUT_MS;
  return k >= shutAt ? 0 : shutAt - k;
}

/** Ms a crayon gate stays open from `t` (0 = shut now). */
export function crayonOpenFor(row: CrayonRow, door: number, t: number): number {
  const n = row.doors.length;
  const k = mod(t + row.offsetMs, n * row.slotMs);
  const rel = mod(Math.floor(k / row.slotMs) - row.order.indexOf(door), n);
  return rel < row.open ? (row.open - rel) * row.slotMs - (k % row.slotMs) : 0;
}
/** Ms until a crayon gate next opens (0 = open now). */
export function crayonOpensIn(row: CrayonRow, door: number, t: number): number {
  const n = row.doors.length;
  const k = mod(t + row.offsetMs, n * row.slotMs);
  const rel = mod(Math.floor(k / row.slotMs) - row.order.indexOf(door), n);
  return rel < row.open ? 0 : (n - rel) * row.slotMs - (k % row.slotMs);
}
export function crayonPhase(row: CrayonRow, door: number, t: number): 'open' | 'warn' | 'shut' {
  const left = crayonOpenFor(row, door, t);
  return left <= 0 ? 'shut' : left < CRAYON_WARN_MS ? 'warn' : 'open';
}

/** x of marble `i` in a lane at match time `t`. */
export function marbleX(l: MarbleLane, i: number, t: number): number {
  return l.x0 + mod(l.dir * (t / 1000) * l.speed + l.offset + i * l.gap, l.count * l.gap);
}

/** x of a pendulum's bob at match time `t`. */
export function bobX(a: PendulumArm, t: number): number {
  return a.x + a.amp * Math.sin((t / a.periodMs) * Math.PI * 2 + a.phase);
}

export function topX(tp: SpinTop, t: number): number {
  return tp.x + tp.orbit * Math.cos(tp.dir * (t / tp.periodMs) * Math.PI * 2 + tp.phase);
}
export function topZ(tp: SpinTop, t: number): number {
  return tp.z + tp.orbit * Math.sin(tp.dir * (t / tp.periodMs) * Math.PI * 2 + tp.phase);
}

/** x of the ruler's centre line at depth z (clamped to its ends). */
export function rulerX(s: JamSection, z: number): number {
  const p = s.path;
  if (z >= p[0].z) return p[0].x;
  for (let i = 1; i < p.length; i++) if (z >= p[i].z) return p[i - 1].x + ((p[i].x - p[i - 1].x) * (p[i - 1].z - z)) / (p[i - 1].z - p[i].z);
  return p[p.length - 1].x;
}
export const inJam = (s: JamSection, z: number) => z < s.jam.z0 && z > s.jam.z1;
export const onRuler = (s: JamSection, x: number, z: number) => Math.abs(x - rulerX(s, z)) <= s.half + 0.35;

/** Speed (cm/s forward) of the belt under a point, 0 on plain road. */
export function beltAt(s: ConveyorSection, x: number, z: number): number {
  for (const b of s.belts) if (z <= b.z0 && z >= b.z1 && Math.abs(x - b.x) <= b.hx) return b.v;
  return 0;
}

// ----------------------------------------------------------------------------------- generator

type Rng = () => number;
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
const half = (v: number) => Math.round(v * 2) / 2;
const sign = (rng: Rng): 1 | -1 => (rng() < 0.5 ? -1 : 1);

const TIMING = SECTION_KINDS.filter((k) => KINDS[k].timing);
const ROUTE = SECTION_KINDS.filter((k) => !KINDS[k].timing);
const LEVEL_SETS: Level[][] = [
  [1, 1, 2, 2, 3],
  [1, 2, 2, 2, 3],
  [1, 1, 2, 3, 3],
];
const SHORT_SETS: Level[][] = [
  [1, 2, 2, 3],
  [1, 2, 2, 2],
];
/** Used only if the dice refuse to give a course of the right length (they never have). */
const FALLBACK: PlanItem[] = [
  { kind: 'dominoes', level: 1 },
  { kind: 'jaws', level: 1 },
  { kind: 'jam', level: 2 },
  { kind: 'marbles', level: 2 },
  { kind: 'tops', level: 1 },
];

/** Which traps, in which order, at which level. */
function pickPlan(rng: Rng): PlanItem[] {
  const n = rng() < 0.25 ? 4 : 5;
  const nTiming = n === 4 ? 1 + randInt(rng, 2) : [1, 2, 2, 2, 3][randInt(rng, 5)];
  const timing = shuffle(rng, TIMING).slice(0, nTiming);
  const route = shuffle(rng, ROUTE).slice(0, n - nTiming);
  // Slots for the timing traps: never two in a row.
  const masks: number[] = [];
  for (let m = 0; m < 1 << n; m++) {
    let bits = 0;
    for (let i = 0; i < n; i++) bits += (m >> i) & 1;
    if (bits === nTiming && (m & (m << 1)) === 0) masks.push(m);
  }
  const mask = masks[randInt(rng, masks.length)];
  const levels = shuffle(rng, n === 4 ? SHORT_SETS[randInt(rng, SHORT_SETS.length)] : LEVEL_SETS[randInt(rng, LEVEL_SETS.length)]);
  // Ease in: the first trap is never the hardest.
  if (levels[0] === 3) {
    const j = levels.indexOf(1);
    levels[0] = 1;
    levels[j] = 3;
  }
  const plan: PlanItem[] = [];
  for (let i = 0; i < n; i++) plan.push({ kind: (mask >> i) & 1 ? timing.pop()! : route.pop()!, level: levels[i] });
  return plan;
}

interface Ids {
  jaw: number;
  crayon: number;
  top: number;
}

function buildSection(rng: Rng, item: PlanItem, base: Base, ids: Ids): Section {
  const { z0, z1, cx, hw, level } = base;
  switch (item.kind) {
    case 'dominoes': {
      const perRow = Math.floor((hw * 2 - 0.4) / DOMINO.spacing);
      const x0 = cx - ((perRow - 1) / 2) * DOMINO.spacing;
      const nRows = level === 1 ? 2 : 3;
      const rows: DominoSection['rows'] = [];
      const dominoes: DominoSpec[] = [];
      for (let row = 0; row < nRows; row++) {
        const z = z0 - 3.5 - row * 5;
        const a = randInt(rng, perRow);
        let b = randInt(rng, perRow - 3);
        if (b >= a - 1) b += 3; // second gap at least two dominoes away from the first
        const open = level === 3 ? [a] : [a, b];
        rows.push({ z, gaps: open.map((i) => x0 + i * DOMINO.spacing) });
        for (let i = 0; i < perRow; i++) if (!open.includes(i)) dominoes.push({ x: x0 + i * DOMINO.spacing, z, row });
      }
      return { ...base, kind: 'dominoes', rows, dominoes };
    }
    case 'spring': {
      // Spring pad on one side, the wall's gate on the other.
      const side = sign(rng);
      const gateHalf = [1.9, 1.7, 1.5][level - 1];
      const padHx = [hw * 0.5 - 1, 3.2, 2.4][level - 1];
      return {
        ...base,
        kind: 'spring',
        wall: { z: z0 - 12, hz: 0.7, gateX: cx - side * (hw - gateHalf - 0.6), gateHalf },
        pad: { x: cx + side * (hw - padHx - 1), z: z0 - 4.5, hx: padHx, hz: 1.7 },
        dist: 15,
      };
    }
    case 'jam': {
      const span = hw - 3.5;
      const jam = { z0: z0 - 2, z1: z1 + 2 };
      const xa = (rng() * 2 - 1) * span;
      let xb = (rng() * 2 - 1) * span;
      if (Math.abs(xb - xa) < 4) xb = xa > 0 ? xa - 6 : xa + 6; // always a real diagonal
      const path = [{ x: cx + xa, z: jam.z0 }];
      if (level === 3) {
        // Dog-leg: out to one side, then back across.
        let xc = (rng() * 2 - 1) * span;
        if (Math.abs(xc - xb) < 4) xc = xb > 0 ? xb - 6 : xb + 6;
        path.push({ x: cx + xb, z: (jam.z0 + jam.z1) / 2 }, { x: cx + xc, z: jam.z1 });
      } else path.push({ x: cx + xb, z: jam.z1 });
      return { ...base, kind: 'jam', jam, path, half: [1.9, 1.7, 1.7][level - 1] };
    }
    case 'jaws': {
      // Two per row, half a period apart, so one side is always open.
      const jaws: Jaw[] = [];
      for (let row = 0; row < level; row++) {
        const periodMs = level === 3 ? between(rng, 2500, 3000) : between(rng, 2700, 3400);
        const offsetMs = rng() * periodMs;
        const flip = rng() < 0.5 ? 0 : 1;
        for (let i = 0; i < 2; i++) jaws.push({ id: ids.jaw++, x: cx + ((i ? 1 : -1) * hw) / 2, z: z0 - 4.5 - row * 7, hx: hw / 2 - 0.25, hz: 1.5, periodMs, offsetMs: offsetMs + ((i + flip) % 2) * (periodMs / 2) });
      }
      return { ...base, kind: 'jaws', jaws };
    }
    case 'crayons': {
      const rows: CrayonRow[] = [];
      const doorHalf = level === 3 ? 1.75 : 1.9;
      const xs = [-0.62 * hw, 0, 0.62 * hw];
      const first = shuffle(rng, [0, 1, 2]);
      for (let row = 0; row < (level === 3 ? 2 : 1); row++) {
        const posts: CrayonRow['posts'] = [];
        let from = -hw;
        for (const x of [...xs, hw + doorHalf]) {
          const to = x - doorHalf;
          if (to - from > 0.1) posts.push({ x: cx + (from + to) / 2, hx: (to - from) / 2 });
          from = x + doorHalf;
        }
        const slotMs = [1300, 1200, 1050][level - 1];
        rows.push({
          id: ids.crayon++,
          z: z0 - 4.5 - row * 7,
          hz: 0.45,
          doors: xs.map((x) => ({ x: cx + x, half: doorHalf })),
          posts,
          slotMs,
          offsetMs: rng() * 3 * slotMs,
          // The second row runs the other way round.
          order: row === 0 ? first : first.slice().reverse(),
          open: level === 1 ? 2 : 1,
        });
      }
      return { ...base, kind: 'crayons', rows };
    }
    case 'marbles': {
      const lanes: MarbleLane[] = [];
      const first = sign(rng);
      // Lanes sit far enough apart to stop between them; marbles far enough apart to walk between.
      const target = level === 3 ? 11.5 : 11;
      const nLanes = level === 3 ? 3 : 2;
      for (let i = 0; i < nLanes; i++) {
        const width = hw * 2 + 4;
        const count = Math.max(2, Math.floor(width / target));
        const gap = width / count;
        lanes.push({
          z: z0 - 3.5 - i * 7,
          dir: (i % 2 ? -first : first) as 1 | -1,
          speed: [between(rng, 8, 9.5), between(rng, 10, 11.5), between(rng, 11, 12.5)][level - 1],
          count,
          gap,
          offset: rng() * gap,
          x0: cx - width / 2,
        });
      }
      return { ...base, kind: 'marbles', lanes };
    }
    case 'pendulum': {
      const arms: PendulumArm[] = [];
      for (let i = 0; i < (level === 1 ? 1 : 2); i++)
        arms.push({ x: cx, z: z0 - 4.5 - i * 7, amp: hw - 1.7, periodMs: [between(rng, 3400, 3800), between(rng, 3000, 3400), between(rng, 2500, 2900)][level - 1], phase: rng() * Math.PI * 2, r: 1.5, hz: 1.4 });
      return { ...base, kind: 'pendulum', arms };
    }
    case 'tops': {
      const tops: SpinTop[] = [];
      const rows: TopsSection['rows'] = [];
      const s = hw * 0.62;
      const orbit = [0.3, 0.5, 0.6][level - 1];
      const wide = rng() < 0.5 ? 0 : 1; // which rows carry three tops
      for (let row = 0; row < (level === 1 ? 2 : 3); row++) {
        const z = z0 - 3.5 - row * 5;
        const xs = row % 2 === wide ? [-s, 0, s] : [-s / 2, s / 2];
        for (const x of xs) tops.push({ id: ids.top++, x: cx + x, z, r: 1.3, orbit, periodMs: between(rng, 2400, 4000), phase: rng() * Math.PI * 2, dir: sign(rng) });
        rows.push({ z, gaps: xs.length === 3 ? [cx - s / 2, cx + s / 2] : [cx - (s / 2 + hw) / 2, cx, cx + (s / 2 + hw) / 2] });
      }
      return { ...base, kind: 'tops', tops, rows };
    }
    case 'conveyor': {
      const belts: Belt[] = [];
      const segments: ConveyorSection['segments'] = [];
      const lane = (hw * 2) / 3;
      const nSeg = level === 1 ? 1 : 2;
      const segLen = (z0 - z1 - 2) / nSeg - 1;
      let fast = -1;
      for (let k = 0; k < nSeg; k++) {
        const sz0 = z0 - 1.5 - k * (segLen + 1);
        const speeds = level === 3 ? [6, -8, -8] : [6, 0, -7];
        let perm = shuffle(rng, speeds);
        // The quick lane moves between stretches, so there is always a lane change to make.
        while (perm.indexOf(6) === fast) perm = shuffle(rng, speeds);
        fast = perm.indexOf(6);
        segments.push({ z0: sz0, z1: sz0 - segLen });
        perm.forEach((v, i) => {
          if (v !== 0) belts.push({ x: cx - hw + lane * (i + 0.5), hx: lane / 2 - 0.25, z0: sz0, z1: sz0 - segLen, v });
        });
      }
      return { ...base, kind: 'conveyor', belts, segments };
    }
    case 'books': {
      const books: Slab[] = [];
      const steps: Slab[] = [];
      const faces: BooksSection['faces'] = [];
      const rampHalf = 2.4;
      const side = sign(rng);
      const addRamp = (faceZ: number, from: number, top: number, s: number) => {
        const n = Math.round((top - from) / 0.3) - 1;
        const rampX = cx + s * (hw - rampHalf);
        for (let i = 0; i < n; i++) steps.push({ x: rampX, z: faceZ + n - i - 0.5, hx: rampHalf, hz: 0.5, top: from + 0.3 * (i + 1) });
        faces.push({ z: faceZ, top, from, rampX, rampHalf, rampLen: n });
      };
      const aZ = z0 - 4.5;
      books.push({ x: cx, z: aZ - 3.25, hx: hw, hz: 3.25, top: 1.5 });
      addRamp(aZ, 0, 1.5, side);
      if (level > 1) {
        // A second, thicker book on the far half: another hop, or the ramp on top of the first.
        const bZ = aZ - 6.5;
        books.push({ x: cx, z: bZ - 2.75, hx: hw, hz: 2.75, top: 2.7 });
        addRamp(bZ, 1.5, 2.7, level === 3 ? ((-side) as 1 | -1) : side);
      }
      return { ...base, kind: 'books', books, steps, faces };
    }
  }
}

function layDecor(rng: Rng, c: Course): Decor[] {
  const out: Decor[] = [];
  const kinds: DecorKind[] = ['block', 'button', 'spool', 'pencil', 'tree', 'block', 'button'];
  for (const side of [-1, 1]) {
    let z = c.startZ + 6 - rng() * 4;
    while (z > c.finishZ - 5) {
      const kind = kinds[randInt(rng, kinds.length)];
      const size = between(rng, 0.8, 1.25);
      // Clear of the kerb and of anything a trap stands beside the road, wherever the road bends.
      let edge = 0;
      for (const dz of [-3, 0, 3]) edge = Math.max(edge, side * roadCx(c, z + dz) + roadHw(c, z + dz));
      out.push({ kind, x: side * (edge + 6.5 + rng() * 6), z, rot: rng() * Math.PI * 2, size, tint: randInt(rng, 4) });
      z -= between(rng, 6, 11);
    }
  }
  return out;
}

function assemble(rng: Rng, plan: PlanItem[], seed: number): Course {
  // Road shape first: a width and a centre line per section, bends in between.
  const shapes: { cx: number; hw: number; link: number }[] = [];
  let pcx = 0;
  let phw = START_HW;
  const bend = (hw: number, limit: number) => {
    // Sideways shift the link can carry once the width change has used its share of the slope.
    const room = Math.max(0, 5.6 - Math.abs(hw - phw));
    let cx = half(pcx + sign(rng) * between(rng, 0.35, 1) * room);
    if (Math.abs(cx) > limit) cx = half(pcx - Math.sign(cx) * between(rng, 0.35, 1) * room);
    cx = Math.max(-limit, Math.min(limit, cx));
    const link = Math.max(5, half((Math.abs(cx - pcx) + Math.abs(hw - phw)) / MAX_EDGE_SLOPE + 0.49));
    pcx = cx;
    phw = hw;
    return { cx, hw, link };
  };
  for (const item of plan) {
    const [lo, hi] = KINDS[item.kind].hw;
    shapes.push(bend(half(between(rng, lo, hi)), 6.5));
  }
  const end = bend(FINISH_HW, 4);
  shapes[0].link = Math.max(shapes[0].link, RUN_IN - 3);

  let length = 3; // flat start pad in front of the grid
  plan.forEach((item, i) => (length += shapes[i].link + KINDS[item.kind].len[item.level - 1]));
  length += end.link + (RUN_OUT - 3);
  const startZ = half(length / 2);
  const finishZ = startZ - length;

  const road: RoadPoint[] = [
    { z: startZ + 7, cx: 0, hw: START_HW },
    { z: startZ - 3, cx: 0, hw: START_HW },
  ];
  const sections: Section[] = [];
  const ids: Ids = { jaw: 0, crayon: 0, top: 0 };
  let z = startZ - 3;
  plan.forEach((item, index) => {
    const sh = shapes[index];
    const z0 = z - sh.link;
    const z1 = z0 - KINDS[item.kind].len[item.level - 1];
    road.push({ z: z0, cx: sh.cx, hw: sh.hw }, { z: z1, cx: sh.cx, hw: sh.hw });
    sections.push(buildSection(rng, item, { index, level: item.level, z0, z1, cx: sh.cx, hw: sh.hw }, ids));
    z = z1;
  });
  road.push({ z: z - end.link, cx: end.cx, hw: end.hw }, { z: finishZ - 7, cx: end.cx, hw: end.hw });
  const course: Course = { seed, startZ, finishZ, road, sections, decor: [] };
  return course;
}

/**
 * Build the course for a match seed. `plan` forces the trap list (tests and tuning only); a
 * forced plan skips the length check.
 */
export function generateCourse(seed: number, plan?: readonly PlanItem[] | null): Course {
  const rng = seededRng(seed);
  let course: Course | null = null;
  if (plan && plan.length) course = assemble(rng, plan.slice(), seed);
  for (let tries = 0; !course && tries < 60; tries++) {
    const c = assemble(rng, pickPlan(rng), seed);
    const len = courseLength(c);
    if (len >= LENGTH_MIN && len <= LENGTH_MAX) course = c;
  }
  course ??= assemble(rng, FALLBACK, seed);
  // Clutter has its own dice so that restyling it can never change a course's play.
  course.decor = layDecor(seededRng(subSeed(seed, 'dash-decor')), course);
  return course;
}

/** Short fingerprint of a course's play (road + traps), for comparing courses. */
export function courseKey(c: Course): string {
  return c.sections.map((s) => `${s.kind}${s.level}@${s.z0.toFixed(1)}:${s.cx.toFixed(1)}/${s.hw.toFixed(1)}`).join(' ');
}

// ----------------------------------------------------------------------------------- validator

/**
 * Everything that would make a course unfair or unfinishable. Empty for every generated course;
 * the unit tests run this over hundreds of seeds. `forced` relaxes the checks that only apply to
 * a generated trap list (length, variety, level budget).
 */
export function courseProblems(c: Course, forced = false): string[] {
  const bad: string[] = [];
  const need = (ok: boolean, msg: string) => {
    if (!ok) bad.push(msg);
  };
  const r = c.road;
  const len = courseLength(c);
  need(r[0].z >= c.startZ + 6 && r[r.length - 1].z <= c.finishZ - 5, 'road must run past both ends');
  for (let i = 1; i < r.length; i++) {
    const dz = r[i - 1].z - r[i].z;
    need(dz > 0, `road point ${i} is out of order`);
    need(r[i].hw >= 8.5, `road narrower than 17 cm at point ${i}`);
    const slope = (Math.abs(r[i].cx - r[i - 1].cx) + Math.abs(r[i].hw - r[i - 1].hw)) / dz;
    need(slope <= MAX_EDGE_SLOPE + 1e-6, `road bends too sharply at point ${i} (${slope.toFixed(2)})`);
  }
  need(Math.abs(roadCx(c, c.startZ)) < 1e-9 && roadHw(c, c.startZ + 3) === START_HW, 'start grid must be straight and full width');
  const n = c.sections.length;
  need(n >= 1, 'no traps');
  if (!forced) {
    need(len >= LENGTH_MIN && len <= LENGTH_MAX, `length ${len}`);
    need(n >= 4 && n <= 5, `${n} traps`);
    need(new Set(c.sections.map((s) => s.kind)).size === n, 'a trap kind repeats');
    need(c.sections[0].level < 3, 'first trap is at level 3');
    const sum = c.sections.reduce((a, s) => a + s.level, 0);
    need(sum / n >= 1.75 && sum / n <= 2.2 && c.sections.filter((s) => s.level === 3).length <= 2 && c.sections.some((s) => s.level === 1), `level budget ${sum}`);
    const timing = c.sections.filter((s) => KINDS[s.kind].timing).length;
    need(timing >= 1 && timing <= 3, `${timing} timing traps`);
  }
  let prev = c.startZ;
  c.sections.forEach((s, i) => {
    const at = `${s.kind}#${i}`;
    need(s.index === i, `${at}: index`);
    need(s.z0 > s.z1 && Math.abs(s.z0 - s.z1 - KINDS[s.kind].len[s.level - 1]) < 1e-6, `${at}: length`);
    need(prev - s.z0 >= 4.99, `${at}: needs 5 cm of clear road before it`);
    if (i > 0 && !forced) need(!(KINDS[s.kind].timing && KINDS[c.sections[i - 1].kind].timing), `${at}: two timing traps in a row`);
    prev = s.z1;
    for (const z of [s.z0, (s.z0 + s.z1) / 2, s.z1]) need(Math.abs(roadCx(c, z) - s.cx) < 1e-6 && Math.abs(roadHw(c, z) - s.hw) < 1e-6, `${at}: road does not match the section`);
    need(s.hw >= KINDS[s.kind].hw[0] - 1e-6 && s.hw <= KINDS[s.kind].hw[1] + 1e-6, `${at}: width ${s.hw}`);
    const inside = (x: number, margin = 0) => Math.abs(x - s.cx) <= s.hw - margin + 1e-6;
    const within = (z: number) => z < s.z0 - 1 && z > s.z1 + 1;
    switch (s.kind) {
      case 'dominoes':
        for (const [ri, row] of s.rows.entries()) {
          need(within(row.z) && row.gaps.length >= 1, `${at}: row ${ri}`);
          for (const g of row.gaps) {
            need(inside(g, TOY_R), `${at}: gap outside the road`);
            need(s.dominoes.every((d) => d.row !== ri || Math.abs(d.x - g) - DOMINO.hx > TOY_R), `${at}: gap too tight`);
          }
        }
        break;
      case 'spring': {
        need(inside(s.wall.gateX, s.wall.gateHalf) && s.wall.gateHalf > TOY_R + 0.3, `${at}: gate`);
        need(inside(s.pad.x, s.pad.hx) && Math.sign(s.pad.x - s.cx) === -Math.sign(s.wall.gateX - s.cx), `${at}: pad and gate must be on opposite sides`);
        need(Math.abs(s.pad.x - s.wall.gateX) > s.pad.hx + s.wall.gateHalf + 1, `${at}: pad overlaps the gate line`);
        need(s.pad.z - s.pad.hz > s.wall.z + s.wall.hz + 2, `${at}: pad too close to the wall`);
        need(s.pad.z + s.pad.hz - s.dist < s.wall.z - s.wall.hz - 2 && s.pad.z - s.pad.hz - s.dist > s.z1, `${at}: landing zone`);
        break;
      }
      case 'jam':
        need(s.jam.z0 < s.z0 && s.jam.z1 > s.z1 && s.path[0].z === s.jam.z0 && s.path[s.path.length - 1].z === s.jam.z1, `${at}: jam span`);
        for (let k = 0; k < s.path.length; k++) {
          need(inside(s.path[k].x, s.half + 0.5), `${at}: ruler leaves the road`);
          if (k) need(s.path[k].z < s.path[k - 1].z && Math.abs(s.path[k].x - s.path[k - 1].x) >= 4 - 1e-6, `${at}: ruler leg`);
        }
        need(s.half > TOY_R + 0.5, `${at}: ruler too thin`);
        break;
      case 'jaws':
        need(s.jaws.length === s.level * 2, `${at}: jaw count`);
        for (let k = 0; k < s.jaws.length; k += 2) {
          const [a, b] = [s.jaws[k], s.jaws[k + 1]];
          need(within(a.z) && inside(a.x, a.hx) && inside(b.x, b.hx), `${at}: jaw placement`);
          // The open spell must be long enough to walk through with time to spare.
          need(a.periodMs - JAW_SHUT_MS - JAW_WARN_MS > 1100, `${at}: jaw barely opens`);
          for (let t = 0; t < a.periodMs; t += 25) need(!(jawPhase(a, t) === 'shut' && jawPhase(b, t) === 'shut'), `${at}: both jaws shut at ${t}`);
        }
        break;
      case 'crayons':
        for (const row of s.rows) {
          need(within(row.z) && row.doors.length === 3, `${at}: row`);
          for (const d of row.doors) need(inside(d.x, d.half) && d.half > TOY_R + 0.6, `${at}: doorway`);
          need(row.slotMs >= 1000 && row.open >= 1, `${at}: gate timing`);
          for (let t = 0; t < row.slotMs * 3; t += 25) need(row.doors.some((_, d) => crayonOpenFor(row, d, t) > 0), `${at}: every gate shut at ${t}`);
        }
        break;
      case 'marbles':
        for (const l of s.lanes) {
          need(within(l.z), `${at}: lane`);
          need(l.x0 < s.cx - s.hw - MARBLE_R && l.x0 + l.count * l.gap > s.cx + s.hw + MARBLE_R, `${at}: marbles must wrap off the road`);
          // Room between marbles for a toy to walk through with half a second in hand.
          need((l.gap - 2 * (MARBLE_R + TOY_R)) / l.speed > 0.55, `${at}: marbles too close together`);
        }
        break;
      case 'pendulum':
        for (const a of s.arms) {
          need(within(a.z - a.hz) && within(a.z + a.hz), `${at}: arm`);
          need(a.amp + a.r <= s.hw && a.periodMs >= 2400, `${at}: swing`);
        }
        break;
      case 'tops':
        for (const row of s.rows) {
          const xs = s.tops.filter((t) => t.z === row.z);
          need(within(row.z) && xs.length >= 2, `${at}: row`);
          // Every way through stays wider than a toy however the tops wander.
          for (const g of row.gaps) need(inside(g, TOY_R) && xs.every((t) => Math.abs(t.x - g) - t.r - t.orbit >= TOY_R), `${at}: gap too tight`);
        }
        break;
      case 'conveyor':
        for (const seg of s.segments) {
          const here = s.belts.filter((b) => b.z0 === seg.z0);
          need(seg.z0 < s.z0 && seg.z1 > s.z1 && here.some((b) => b.v > 0), `${at}: stretch without a forward belt`);
          for (const b of here) need(inside(b.x, b.hx) && b.v > -TOY_TUNING.run * 0.7, `${at}: belt`);
        }
        break;
      case 'books': {
        let from = 0;
        for (const [k, f] of s.faces.entries()) {
          // A hop clears about 2.4 cm; keep every step up well inside that.
          need(f.from === from && f.top - f.from <= 1.6, `${at}: step ${k} too high`);
          need(inside(f.rampX, f.rampHalf) && f.rampHalf > TOY_R + 1, `${at}: ramp`);
          const stairs = s.steps.filter((st) => st.z > f.z && st.z < f.z + f.rampLen + 0.01).map((st) => st.top);
          let h = f.from;
          for (const t of stairs.sort((a, b) => a - b)) {
            need(t - h <= 0.4, `${at}: ramp step too tall`);
            h = t;
          }
          need(f.top - h <= 0.4, `${at}: ramp stops short`);
          from = f.top;
        }
        break;
      }
    }
  });
  need(prev - c.finishZ >= 5, 'needs 5 cm of clear road before the finish');
  return bad;
}
