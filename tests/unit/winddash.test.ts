import { describe, expect, it } from 'vitest';
import {
  JAW_SHUT_MS,
  KINDS,
  LENGTH_MAX,
  LENGTH_MIN,
  MARBLE_R,
  SECTION_KINDS,
  beltAt,
  bobX,
  courseKey,
  courseLength,
  courseProblems,
  crayonOpenFor,
  crayonOpensIn,
  generateCourse,
  jawPhase,
  marbleX,
  onRuler,
  roadCx,
  roadHw,
  rulerX,
  type Level,
  type PlanItem,
  type Section,
  type SectionKind,
} from '../../src/minigames/winddash/course';
import { DEFAULT_CONFIG, dashRules, gridSlot, progressOf, stuckInJam, type DashConfig, type DashInput, type DashState } from '../../src/minigames/winddash/rules';
import { createDashBot } from '../../src/minigames/winddash/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import { NO_INPUT, TOY_TUNING } from '../../src/minigames/shared/movement';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';

const DT = 1000 / 60;
const R = TOY_TUNING.radius;
const LEVELS: Level[] = [1, 2, 3];
const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const FWD: DashInput = { ax: 0, ay: 1, run: true, jump: false };
const me = (s: DashState, id = 'you') => s.players.find((p) => p.id === id)!;
type Policy = (s: DashState, id: string) => DashInput;
const only = (pol: (s: DashState) => DashInput): Policy => (s, id) => (id === 'you' ? pol(s) : NO_INPUT);

function run(s: DashState, policy: Policy, until: (s: DashState) => boolean = () => false, maxMs = 200_000) {
  const events: { type: string; [k: string]: unknown }[] = [];
  for (let t = 0; t < maxMs && !dashRules.isOver(s) && !until(s); t += DT) {
    const inputs: Record<string, DashInput[]> = {};
    for (const p of s.players) inputs[p.id] = [policy(s, p.id)];
    dashRules.step(s, inputs, DT);
    events.push(...dashRules.drainEvents(s));
  }
  return events;
}
/** Put a toy somewhere, standing still. */
function place(s: DashState, x: number, z: number, id = 'you') {
  const p = me(s, id);
  Object.assign(p.m, { x, z, vx: 0, vz: 0, y: 0, vy: 0, grounded: true });
  return p;
}
/** Steer towards x while running forward. */
const towards = (x: number, p: { m: { x: number } }): DashInput => ({ ax: Math.max(-1, Math.min(1, (x - p.m.x) * 1.5)), ay: 1, run: true, jump: false });

/** A two-toy race on a course made of just the given trap, already past the countdown. */
function trapRace<K extends SectionKind>(kind: K, level: Level, seed = 5, config: Partial<DashConfig> = {}) {
  const s = dashRules.init([human('you'), human('b')], seed, { plan: [{ kind, level }], limitMs: 3_600_000, ...config });
  run(s, () => NO_INPUT, (st) => st.phase === 'race');
  return { s, sec: s.course.sections[0] as Extract<Section, { kind: K }> };
}

function botMatch(seed: number, difficulties: BotDifficulty[], config?: Partial<DashConfig>) {
  const bots = difficulties.map((d, i) => ({ ...makeBots(subSeed(seed, 'bots'), difficulties.length, d)[i], bot: d }));
  const s = dashRules.init(bots, seed, config);
  const policy = createDashBot();
  const rngs = new Map(bots.map((b) => [b.id, seededRng(subSeed(seed, b.id))]));
  for (let t = 0; t < 200_000 && !dashRules.isOver(s); t += DT) {
    const inputs: Record<string, DashInput[]> = {};
    for (const b of bots) inputs[b.id] = policy.decide(s, b, DT, rngs.get(b.id)!);
    dashRules.step(s, inputs, DT);
    dashRules.drainEvents(s);
  }
  return { s, bots, result: dashRules.result(s) };
}

describe('Wind-Up Dash course generator', () => {
  it('same seed → identical course; different seeds → different courses', () => {
    const a = generateCourse(42);
    expect(generateCourse(42)).toEqual(a);
    expect(JSON.stringify(generateCourse(42))).toBe(JSON.stringify(a));
    expect(dashRules.init([human('you'), human('b')], 42).course).toEqual(a);
    expect(courseKey(generateCourse(43))).not.toBe(courseKey(a));
    // Close seeds must not give near-identical courses either.
    const keys = new Set(Array.from({ length: 200 }, (_, seed) => courseKey(generateCourse(seed))));
    expect(keys.size).toBe(200);
  });

  it('300 seeds: every course is connected, fair, the right length and varied', () => {
    const seen = new Map<SectionKind, number>();
    const selections = new Set<string>();
    const orders = new Set<string>();
    const lengths: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const c = generateCourse(seed);
      expect(courseProblems(c), `seed ${seed}`).toEqual([]);
      const len = courseLength(c);
      lengths.push(len);
      expect(len).toBeGreaterThanOrEqual(LENGTH_MIN);
      expect(len).toBeLessThanOrEqual(LENGTH_MAX);
      expect(c.startZ - c.finishZ).toBe(len);
      for (const sec of c.sections) seen.set(sec.kind, (seen.get(sec.kind) ?? 0) + 1);
      selections.add(c.sections.map((q) => q.kind).sort().join(','));
      orders.add(c.sections.map((q) => q.kind).join(','));
      // Not all hard, never hard first, at least one timing trap and one route trap.
      expect(c.sections.every((q) => q.level === 3)).toBe(false);
      expect(c.sections[0].level).toBeLessThan(3);
      expect(c.sections.some((q) => KINDS[q.kind].timing)).toBe(true);
      expect(c.sections.some((q) => !KINDS[q.kind].timing)).toBe(true);
      // Clutter stays off the road.
      for (const d of c.decor) expect(Math.abs(d.x - roadCx(c, d.z)) - roadHw(c, d.z)).toBeGreaterThan(4);
    }
    // All ten traps turn up, none of them rarely; and runs really are different from each other.
    expect([...seen.keys()].sort()).toEqual([...SECTION_KINDS].sort());
    for (const n of seen.values()) expect(n).toBeGreaterThan(80);
    expect(selections.size).toBeGreaterThan(120);
    expect(orders.size).toBeGreaterThan(270);
    // The road itself varies: widths, bends and length.
    const all = Array.from({ length: 300 }, (_, seed) => generateCourse(seed));
    expect(new Set(all.flatMap((c) => c.sections.map((q) => q.hw))).size).toBeGreaterThan(4);
    expect(all.filter((c) => c.sections.some((q) => Math.abs(q.cx) >= 3)).length).toBeGreaterThan(200);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(15);
  });

  it('every trap is valid at every level, on its own', () => {
    for (const kind of SECTION_KINDS)
      for (const level of LEVELS)
        for (let seed = 0; seed < 25; seed++) {
          const c = generateCourse(seed, [{ kind, level }]);
          expect(c.sections.map((q) => [q.kind, q.level])).toEqual([[kind, level]]);
          expect(courseProblems(c, true), `${kind} ${level} seed ${seed}`).toEqual([]);
        }
  });

  it('the validator really catches broken courses', () => {
    const c = generateCourse(7, [{ kind: 'jaws', level: 2 }, { kind: 'marbles', level: 1 }]);
    expect(courseProblems(c, true)).toEqual([]);
    expect(courseProblems(c).length).toBeGreaterThan(0); // too short and too few traps for a real course
    const jaws = c.sections[0] as Extract<Section, { kind: 'jaws' }>;
    jaws.jaws[1].offsetMs = jaws.jaws[0].offsetMs; // both jaws of a row now shut together
    expect(courseProblems(c, true).some((p) => p.includes('both jaws shut'))).toBe(true);
    const d = generateCourse(7, [{ kind: 'marbles', level: 3 }]);
    (d.sections[0] as Extract<Section, { kind: 'marbles' }>).lanes[0].gap = 3;
    expect(courseProblems(d, true).length).toBeGreaterThan(0);
    const e = generateCourse(7);
    e.road[3].cx += 9; // a kink no toy could follow
    expect(courseProblems(e).length).toBeGreaterThan(0);
  });

  it('the start grid fits two to eight toys without overlap', () => {
    const c = generateCourse(1);
    for (const n of [2, 4, 5, 8]) {
      const slots = Array.from({ length: n }, (_, i) => gridSlot(i, n, c));
      for (let i = 0; i < n; i++) {
        expect(Math.abs(slots[i].x)).toBeLessThan(roadHw(c, slots[i].z) - 1);
        for (let j = 0; j < i; j++) expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThan(2);
      }
    }
  });
});

describe('Wind-Up Dash rules', () => {
  it('is deterministic: identical inputs give identical states', () => {
    const pol: Policy = (s, id) => (id === 'b' ? { ax: Math.sin(s.t / 300) * 0.6, ay: 1, run: true, jump: Math.floor(s.t / 900) % 2 === 0 && s.t % 900 < 17 } : FWD);
    for (const seed of [7, 8, 9]) {
      const a = dashRules.init([human('you'), human('b')], seed);
      const b = dashRules.init([human('you'), human('b')], seed);
      run(a, pol);
      run(b, pol);
      expect(a).toEqual(b);
    }
  });

  it('nobody moves during the intro', () => {
    const s = dashRules.init([human('you'), human('b')], 1);
    run(s, () => FWD, (st) => st.phase !== 'intro');
    expect(me(s).m.z).toBeCloseTo(s.course.startZ, 1);
  });

  it('the road edges hold wherever it bends or narrows', () => {
    for (const seed of [3, 4, 5, 6]) {
      for (const ax of [-1, 1]) {
        const s = dashRules.init([human('you'), human('b')], seed);
        for (let t = 0; t < 12_000 && !dashRules.isOver(s); t += DT) {
          dashRules.step(s, { you: [{ ax, ay: 1, run: true, jump: false }] }, DT);
          const m = me(s).m;
          if (me(s).finished) break;
          expect(Math.abs(m.x - roadCx(s.course, m.z))).toBeLessThanOrEqual(roadHw(s.course, m.z) - R + 1e-6);
        }
      }
    }
  });

  it('dominoes: a standing one blocks, then topples and lets you through; a gap is free', () => {
    const a = trapRace('dominoes', 2, 3);
    const row = a.sec.rows[0];
    const dom = a.s.dominoes.find((d) => d.row === 0)!;
    // Straight into a domino.
    place(a.s, dom.x, row.z + 3);
    const ev = run(a.s, only(() => FWD), (s) => me(s).m.z < row.z - 2, 5000);
    expect(ev.filter((e) => e.type === 'domino')).toHaveLength(1);
    expect(dom.state).toBe('down');
    expect(me(a.s).toppled).toBe(1);
    // Through a gap from the same distance: no topple, and quicker.
    const b = trapRace('dominoes', 2, 3);
    place(b.s, row.gaps[0], row.z + 3);
    const ev2 = run(b.s, only(() => FWD), (s) => me(s).m.z < row.z - 2, 5000);
    expect(ev2.filter((e) => e.type === 'domino')).toHaveLength(0);
    expect(a.s.t - b.s.t).toBeGreaterThan(DEFAULT_CONFIG.toppleMs * 0.8);
    // Level 3 leaves a single gap per row.
    expect(trapRace('dominoes', 3).sec.rows.every((r) => r.gaps.length === 1)).toBe(true);
  });

  it('spring: the wall blocks; the gate lets you through; the pad throws you over', () => {
    for (const level of LEVELS) {
      // Into the wall, away from both gate and pad: stuck.
      const a = trapRace('spring', level);
      const { wall, pad, cx } = a.sec;
      place(a.s, cx + (wall.gateX - cx > 0 ? -1 : 1), wall.z + 3);
      run(a.s, only(() => FWD), () => false, 3000);
      expect(me(a.s).m.z).toBeGreaterThan(wall.z + wall.hz);
      // Through the gate.
      const b = trapRace('spring', level);
      place(b.s, wall.gateX, wall.z + 4);
      run(b.s, only(() => FWD), () => false, 1500);
      expect(me(b.s).m.z).toBeLessThan(wall.z - 2);
      // Onto the pad.
      const c = trapRace('spring', level);
      place(c.s, pad.x, pad.z + 4);
      const ev = run(c.s, only(() => FWD), (s) => !!me(s).toss, 1500);
      expect(ev.some((e) => e.type === 'spring' && e.id === 'you')).toBe(true);
      const from = me(c.s).toss!.fromZ;
      run(c.s, () => NO_INPUT, (s) => !me(s).toss, 2000);
      expect(me(c.s).m.z).toBeCloseTo(from - c.sec.dist, 3);
      expect(me(c.s).m.z).toBeLessThan(wall.z - 2); // over the wall
      expect(me(c.s).m.z).toBeGreaterThan(c.sec.z1); // and down before the next stretch of road
      expect(me(c.s).stunMs).toBe(0);
    }
  });

  it('jam: slows toys to a crawl; the ruler (straight or dog-leg) keeps full speed', () => {
    for (const level of [2, 3] as Level[]) {
      const a = trapRace('jam', level, 9);
      const sec = a.sec;
      const mid = (sec.jam.z0 + sec.jam.z1) / 2;
      expect(sec.path).toHaveLength(level === 3 ? 3 : 2);
      expect(onRuler(sec, rulerX(sec, mid), mid)).toBe(true);
      expect(stuckInJam(a.s.course, rulerX(sec, mid), mid)).toBe(false);
      // Along the ruler.
      place(a.s, sec.path[0].x, sec.jam.z0 + 1);
      const t0 = a.s.t;
      run(a.s, only((st) => towards(rulerX(sec, me(st).m.z - 1.5), me(st))), (s) => me(s).m.z < sec.jam.z1, 20000);
      const onTime = a.s.t - t0;
      // Through the jam, as far from the ruler as possible.
      const b = trapRace('jam', level, 9);
      const far = (z: number) => sec.cx + (rulerX(sec, z) > sec.cx ? -1 : 1) * (sec.hw - 1.5);
      expect(stuckInJam(b.s.course, far(mid), mid)).toBe(true);
      place(b.s, far(sec.jam.z0), sec.jam.z0 + 1);
      const t1 = b.s.t;
      run(b.s, only((st) => towards(far(me(st).m.z), me(st))), (s) => me(s).m.z < sec.jam.z1, 20000);
      // (A dog-leg ruler crosses the road, so even the worst line gets a stride or two on it.)
      expect(b.s.t - t1).toBeGreaterThan(onTime * (level === 3 ? 1.2 : 1.5));
    }
  });

  it('jaws: snapping shut on a toy stuns it and spits it out; a shut jaw blocks', () => {
    const { s, sec } = trapRace('jaws', 2, 11);
    const j = sec.jaws[0];
    run(s, () => NO_INPUT, (st) => jawPhase(j, st.t) === 'warn');
    place(s, j.x, j.z);
    const ev = run(s, () => NO_INPUT, (st) => jawPhase(j, st.t) === 'shut');
    expect(ev.some((e) => e.type === 'jaw-shut' && e.jaw === j.id)).toBe(true);
    expect(ev.some((e) => e.type === 'snap' && e.id === 'you')).toBe(true);
    expect(me(s).snaps).toBe(1);
    expect(me(s).stunMs).toBeGreaterThan(0);
    expect(me(s).m.z).toBeGreaterThan(j.z + j.hz); // spat back out the near side
    // Stunned and then blocked: holding forward gets nowhere while the jaw is shut.
    run(s, only(() => FWD), () => false, JAW_SHUT_MS - 100);
    expect(me(s).m.z).toBeGreaterThan(j.z + j.hz);
    // A toy standing clear of the jaw is untouched.
    expect(me(s, 'b').snaps).toBe(0);
  });

  it('crayon gates: a shut gate blocks, an open one lets you through, and there is always one open', () => {
    for (const level of LEVELS) {
      const { s, sec } = trapRace('crayons', level, 4);
      const row = sec.rows[0];
      for (let d = 0; d < 3; d++) {
        for (let t = 0; t < row.slotMs * 3; t += 50) expect(crayonOpenFor(row, d, t) > 0).toBe(crayonOpensIn(row, d, t) === 0);
      }
      // Wait for the middle gate to be freshly shut, then walk into it.
      run(s, () => NO_INPUT, (st) => crayonOpenFor(row, 1, st.t) === 0 && crayonOpensIn(row, 1, st.t) > 700);
      place(s, row.doors[1].x, row.z + 2);
      const ev = run(s, only(() => FWD), () => false, 500);
      expect(me(s).m.z).toBeGreaterThan(row.z + row.hz + R - 0.01);
      expect(ev.some((e) => e.type === 'crayon-shut') || crayonOpenFor(row, 1, s.t) === 0).toBe(true);
      // Keep pushing: it opens in its turn and the toy walks through.
      run(s, only(() => FWD), (st) => me(st).m.z < row.z - 1.5, 5000);
      expect(me(s).m.z).toBeLessThan(row.z - 1.5);
      // The fence between the doorways never opens.
      const post = row.posts[1];
      place(s, post.x, row.z + 2);
      run(s, only(() => FWD), () => false, 4000);
      expect(me(s).m.z).toBeGreaterThan(row.z);
    }
  });

  it('marbles: one bowls a waiting toy back and dazes it; a well-timed hop clears the lane', () => {
    for (const level of LEVELS) {
      const { s, sec } = trapRace('marbles', level, 6);
      const lane = sec.lanes[0];
      place(s, sec.cx, lane.z);
      const ev = run(s, () => NO_INPUT, (st) => me(st).bonks > 0, 4000);
      expect(ev.some((e) => e.type === 'bonk' && e.id === 'you' && e.by === 'marble')).toBe(true);
      expect(me(s).toss).not.toBeNull();
      run(s, () => NO_INPUT, (st) => !me(st).toss, 2000);
      expect(me(s).m.z).toBeCloseTo(lane.z + 2.7, 5);
      expect(me(s).stunMs).toBeGreaterThan(0);
      // Thrown clear: standing where it lands is safe for good.
      run(s, () => NO_INPUT, () => false, 4000);
      expect(me(s).bonks).toBe(1);
    }
    // Run at the first lane from every point of the marbles' cycle: hopping always clears it,
    // walking blind sometimes doesn't.
    let walkedInto = 0;
    for (const hop of [true, false]) {
      for (let k = 0; k < 16; k++) {
        const { s, sec } = trapRace('marbles', 3, 6);
        const lane = sec.lanes[0];
        run(s, () => NO_INPUT, () => false, k * 90);
        place(s, sec.cx, lane.z + 7);
        run(s, only((st) => ({ ...FWD, jump: hop && me(st).m.grounded && me(st).m.z - (lane.z + MARBLE_R + R) < 1.4 })), (st) => me(st).m.z < lane.z - 1.7 || me(st).bonks > 0, 3000);
        if (hop) expect(me(s).bonks, `hop at phase ${k}`).toBe(0);
        else walkedInto += me(s).bonks;
      }
    }
    expect(walkedInto).toBeGreaterThan(0);
    // The marbles never stop on the road and never bunch up.
    const lane = trapRace('marbles', 3).sec.lanes[0];
    for (let t = 0; t < 20_000; t += 137) expect(Math.abs(marbleX(lane, 0, t) - marbleX(lane, 1, t))).toBeGreaterThan(lane.gap - 1e-6);
  });

  it('pendulum: the bead knocks a toy in its path back; beside it you are safe', () => {
    const { s, sec } = trapRace('pendulum', 2, 8);
    const arm = sec.arms[0];
    place(s, arm.x, arm.z);
    const ev = run(s, () => NO_INPUT, (st) => me(st).bonks > 0, arm.periodMs);
    expect(ev.some((e) => e.type === 'bonk' && e.by === 'pendulum')).toBe(true);
    run(s, () => NO_INPUT, (st) => !me(st).toss, 2000);
    expect(me(s).m.z).toBeGreaterThan(arm.z + arm.hz + R);
    expect(me(s).stunMs).toBeGreaterThan(0);
    // Waiting just short of the sweep is safe however long you stand there.
    run(s, () => NO_INPUT, () => false, arm.periodMs * 2);
    expect(me(s).bonks).toBe(1);
    // The bead covers the road but never leaves it.
    for (let t = 0; t < arm.periodMs; t += 20) expect(Math.abs(bobX(arm, t) - sec.cx) + arm.r).toBeLessThanOrEqual(sec.hw);
  });

  it('spinning tops: touching one bounces you off, but they never block the road', () => {
    for (const level of LEVELS) {
      const { s, sec } = trapRace('tops', level, 10);
      const tp = sec.tops[0];
      place(s, tp.x, tp.z + 3.5);
      const ev = run(s, only(() => FWD), (st) => me(st).bumps > 0, 1500);
      expect(ev.some((e) => e.type === 'bump' && e.id === 'you')).toBe(true);
      // Thrown back the way it came.
      expect(me(s).m.vz).toBeGreaterThan(5);
      // Head down and straight through, bounces and all: still out the far side quickly.
      const t0 = s.t;
      run(s, only(() => FWD), (st) => me(st).m.z < sec.z1, 15_000);
      expect(me(s).m.z).toBeLessThan(sec.z1);
      expect(s.t - t0).toBeLessThan(12_000);
    }
  });

  it('tape belts: one carries you forward, the others back, and the quick lane moves between stretches', () => {
    for (const level of LEVELS) {
      const { s, sec } = trapRace('conveyor', level, 12);
      const fwd = sec.belts.find((b) => b.v > 0)!;
      const back = sec.belts.find((b) => b.v < 0)!;
      const mid = (b: typeof fwd) => (b.z0 + b.z1) / 2;
      expect(beltAt(sec, fwd.x, mid(fwd))).toBe(fwd.v);
      // Standing still, a belt carries the toy along at its own speed.
      place(s, fwd.x, mid(fwd) + 1);
      place(s, back.x, mid(back) - 1, 'b');
      run(s, () => NO_INPUT, () => false, 500);
      expect(me(s).m.z).toBeCloseTo(mid(fwd) + 1 - fwd.v * 0.5, 0);
      expect(me(s, 'b').m.z).toBeCloseTo(mid(back) - 1 - back.v * 0.5, 0);
      // Even the worst belt can be outrun.
      place(s, back.x, back.z0 + 1);
      run(s, only(() => FWD), (st) => me(st).m.z < back.z1, 8000);
      expect(me(s).m.z).toBeLessThan(back.z1);
      if (level > 1) {
        const lanes = sec.segments.map((g) => sec.belts.find((b) => b.z0 === g.z0 && b.v > 0)!.x);
        expect(lanes[0]).not.toBe(lanes[1]);
      }
    }
  });

  it('book steps: the face blocks a walking toy; a hop or the ramp gets you up', () => {
    for (const level of LEVELS) {
      // Walking into the book away from the ramp: stuck on the table.
      const a = trapRace('books', level, 14);
      const f = a.sec.faces[0];
      const awayX = 2 * a.sec.cx - f.rampX;
      place(a.s, awayX, f.z + 3);
      run(a.s, only(() => FWD), () => false, 2500);
      expect(me(a.s).m.z).toBeGreaterThan(f.z + R - 0.01);
      expect(me(a.s).m.y).toBe(0);
      // Hopping at each face: up and over every book, back down on the table beyond.
      const hop = (st: DashState): DashInput => {
        const m = me(st).m;
        const face = a.sec.faces.find((q) => m.z > q.z && m.y < q.top - 0.01);
        return { ...FWD, jump: !!face && m.grounded && m.z - face.z - R < 2.5 };
      };
      let peak = 0;
      run(a.s, only(hop), (st) => ((peak = Math.max(peak, me(st).m.grounded ? me(st).m.y : 0)), me(st).m.z < a.sec.z1 - 2), 8000);
      expect(peak).toBeCloseTo(a.sec.faces[a.sec.faces.length - 1].top, 5);
      expect(me(a.s).m.z).toBeLessThan(a.sec.z1 - 2);
      run(a.s, () => NO_INPUT, () => false, 600); // let it drop off the far edge
      expect(me(a.s).m.y).toBe(0);
      // The ramps: no jumping needed at all.
      const b = trapRace('books', level, 14);
      place(b.s, f.rampX, f.z + f.rampLen + 2);
      let top = 0;
      const ev = run(
        b.s,
        only((st) => {
          const m = me(st).m;
          const face = b.sec.faces.find((q) => m.z > q.z - 0.3 && m.y < q.top - 0.01);
          if (!face) return FWD;
          // Line up with the ramp before starting up it (stepping back if its side is in the way).
          const foot = face.z + face.rampLen;
          const lined = Math.abs(m.x - face.rampX) < face.rampHalf - R - 0.3;
          return { ...towards(face.rampX, me(st)), ay: lined || m.z > foot + 2.5 ? 1 : m.z < foot + 1 ? -0.6 : 0 };
        }),
        (st) => ((top = Math.max(top, me(st).m.y)), me(st).m.z < b.sec.z1 - 2),
        12_000,
      );
      expect(ev.some((e) => e.type === 'jump')).toBe(false);
      expect(top).toBeCloseTo(b.sec.faces[b.sec.faces.length - 1].top, 5);
      expect(me(b.s).m.z).toBeLessThan(b.sec.z1 - 2);
    }
  });

  it('first across the line wins; finish order, then distance, decides the placings', () => {
    const s = dashRules.init([human('you'), human('b'), human('c')], 13);
    run(s, () => NO_INPUT, (st) => st.phase === 'race');
    const { finishZ } = s.course;
    // Skip to the last straight: you ahead of b; c stays on the start grid.
    place(s, roadCx(s.course, finishZ), finishZ + 3, 'you');
    place(s, roadCx(s.course, finishZ) + 2, finishZ + 4.5, 'b');
    const ev = run(s, (_st, id) => (id === 'c' ? NO_INPUT : FWD));
    const r = dashRules.result(s);
    expect(r.placements.map((p) => [p.contestantId, p.place])).toEqual([['you', 1], ['b', 2], ['c', 3]]);
    expect(r.placements[0].score).toBeGreaterThan(100);
    expect(r.placements[2].score).toBe(0);
    expect(ev.filter((e) => e.type === 'finish').map((e) => e.id)).toEqual(['you', 'b']);
    // The straggler gets the closing window, not the whole clock.
    expect(s.t).toBeLessThanOrEqual(me(s).finishT + DEFAULT_CONFIG.closingMs + DT);
    expect(progressOf(s, me(s, 'c'))).toBe(0);
    expect(r.stats?.traps).toBe(s.course.sections.length);
  });

  it('the clock ends a race nobody finishes; level toys share a place', () => {
    const s = dashRules.init([human('you'), human('b')], 2, { limitMs: 3000 });
    run(s, () => NO_INPUT);
    expect(dashRules.isOver(s)).toBe(true);
    expect(dashRules.result(s).placements.map((p) => p.place)).toEqual([1, 1]);
  });
});

describe('Wind-Up Dash bots', () => {
  it('a bot-only match finishes with everyone home on every difficulty (and replays identically)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const field: BotDifficulty[] = ['easy', 'normal', 'hard', 'normal', 'easy', 'hard', 'normal', 'easy'];
      const a = botMatch(seed, field);
      expect(dashRules.isOver(a.s)).toBe(true);
      expect(a.result.placements).toHaveLength(8);
      expect(a.s.finishers).toBeGreaterThanOrEqual(6);
      expect(botMatch(seed, field).result).toEqual(a.result);
    }
  }, 30_000);

  it('bots of every difficulty finish 240 generated courses well inside the clock', () => {
    // No closing window here: each bot gets the whole clock, so a bot that got stuck would show.
    for (const d of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
      for (let seed = 0; seed < 80; seed++) {
        const { s } = botMatch(seed, [d, d], { closingMs: DEFAULT_CONFIG.limitMs });
        expect(s.finishers, `${d} seed ${seed}: ${courseKey(s.course)}`).toBe(2);
        expect(Math.max(...s.players.map((p) => p.finishT))).toBeLessThan(40_000);
      }
    }
  }, 60_000);

  it('bots get through every trap at every level', () => {
    for (const kind of SECTION_KINDS)
      for (const level of LEVELS) {
        const plan: PlanItem[] = [{ kind, level }];
        for (const d of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
          for (let seed = 0; seed < 6; seed++) {
            const { s } = botMatch(seed, [d, d], { plan, closingMs: DEFAULT_CONFIG.limitMs });
            expect(s.finishers, `${d} ${kind} ${level} seed ${seed}`).toBe(2);
            expect(Math.max(...s.players.map((p) => p.finishT))).toBeLessThan(25_000);
          }
        }
      }
  }, 60_000);

  it('harder bots do better: more wins, fewer knocks, faster times', () => {
    const wins: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const hurt: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const time: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const N = 60;
    for (let seed = 200; seed < 200 + N; seed++) {
      const order = [['easy', 'normal', 'hard'], ['hard', 'easy', 'normal'], ['normal', 'hard', 'easy']][seed % 3] as BotDifficulty[];
      const { s, bots, result } = botMatch(seed, order);
      wins[bots.find((b) => b.id === result.placements[0].contestantId)!.bot!]++;
      for (const b of bots) {
        const p = s.players.find((x) => x.id === b.id)!;
        hurt[b.bot!] += p.snaps + p.bonks;
        time[b.bot!] += p.finished ? p.finishT : DEFAULT_CONFIG.limitMs;
      }
    }
    expect(wins.hard).toBeGreaterThan(wins.normal);
    expect(wins.normal).toBeGreaterThan(wins.easy);
    expect(time.hard).toBeLessThan(time.normal);
    expect(time.normal).toBeLessThan(time.easy);
    expect(hurt.easy).toBeGreaterThan(hurt.hard);
  }, 30_000);
});
