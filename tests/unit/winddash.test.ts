import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  DOMINO,
  JAW_SHUT_MS,
  dashRules,
  gridSlot,
  inJam,
  jawPhase,
  onRuler,
  progressOf,
  rulerX,
  type DashInput,
  type DashState,
} from '../../src/minigames/winddash/rules';
import { createDashBot } from '../../src/minigames/winddash/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import { NO_INPUT, TOY_TUNING } from '../../src/minigames/shared/movement';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';

const DT = 1000 / 60;
const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const FWD: DashInput = { ax: 0, ay: 1, run: true, jump: false };
const me = (s: DashState, id = 'you') => s.players.find((p) => p.id === id)!;
type Policy = (s: DashState, id: string) => DashInput;

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
/** Put the local toy somewhere, standing still. */
function place(s: DashState, x: number, z: number, id = 'you') {
  const p = me(s, id);
  Object.assign(p.m, { x, z, vx: 0, vz: 0, y: 0, vy: 0, grounded: true });
  return p;
}
/** Steer towards x while running forward. */
const towards = (x: number, p: { m: { x: number } }): DashInput => ({ ax: Math.max(-1, Math.min(1, (x - p.m.x) * 1.5)), ay: 1, run: true, jump: false });

function botMatch(seed: number, difficulties: BotDifficulty[]) {
  const bots = difficulties.map((d, i) => ({ ...makeBots(subSeed(seed, 'bots'), difficulties.length, d)[i], bot: d }));
  const s = dashRules.init(bots, seed);
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

describe('Wind-Up Dash course', () => {
  it('same seed → same course; different seeds differ', () => {
    const a = dashRules.init([human('you'), human('b')], 42);
    expect(dashRules.init([human('you'), human('b')], 42).course).toEqual(a.course);
    expect(dashRules.init([human('you'), human('b')], 43).course).not.toEqual(a.course);
  });

  it('every layout is passable: two real gaps per domino row, a gate, a diagonal ruler, one open jaw per row', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = dashRules.init([human('you'), human('b')], seed);
      const { course: c, config: cfg } = s;
      for (const [i, row] of c.rows.entries()) {
        expect(row.gaps).toHaveLength(2);
        expect(Math.abs(row.gaps[0] - row.gaps[1])).toBeGreaterThanOrEqual(2 * DOMINO.spacing - 1e-6);
        const xs = s.dominoes.filter((d) => d.row === i).map((d) => d.x);
        for (const g of row.gaps) {
          expect(Math.abs(g)).toBeLessThan(cfg.halfWidth - 1);
          // Nothing standing within a toy's width of the gap's centre.
          expect(xs.every((x) => Math.abs(x - g) - DOMINO.hx > TOY_TUNING.radius)).toBe(true);
        }
      }
      expect(Math.abs(c.wall.gateX) + c.wall.gateHalf).toBeLessThanOrEqual(cfg.halfWidth);
      expect(c.wall.gateHalf).toBeGreaterThan(TOY_TUNING.radius + 0.3);
      expect(Math.sign(c.pad.x)).toBe(-Math.sign(c.wall.gateX)); // spring one side, gate the other
      expect(Math.abs(c.ruler.x1 - c.ruler.x0)).toBeGreaterThanOrEqual(4);
      expect(Math.max(Math.abs(c.ruler.x0), Math.abs(c.ruler.x1)) + c.ruler.half).toBeLessThan(cfg.halfWidth);
      for (let r = 0; r < 3; r++) {
        const [a, b] = [c.jaws[r * 2], c.jaws[r * 2 + 1]];
        for (let t = 0; t < a.periodMs * 2; t += 50) expect(jawPhase(a, t) === 'shut' && jawPhase(b, t) === 'shut').toBe(false);
      }
    }
  });

  it('the start grid fits two to eight toys without overlap', () => {
    for (const n of [2, 4, 5, 8]) {
      const slots = Array.from({ length: n }, (_, i) => gridSlot(i, n, DEFAULT_CONFIG));
      for (let i = 0; i < n; i++) {
        expect(Math.abs(slots[i].x)).toBeLessThan(DEFAULT_CONFIG.halfWidth - 1);
        for (let j = 0; j < i; j++) expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThan(2);
      }
    }
  });
});

describe('Wind-Up Dash rules', () => {
  it('is deterministic: identical inputs give identical states', () => {
    const pol: Policy = (s, id) => (id === 'b' ? { ax: Math.sin(s.t / 300) * 0.6, ay: 1, run: true, jump: Math.floor(s.t / 900) % 2 === 0 && s.t % 900 < 17 } : FWD);
    const a = dashRules.init([human('you'), human('b')], 7);
    const b = dashRules.init([human('you'), human('b')], 7);
    run(a, pol);
    run(b, pol);
    expect(a).toEqual(b);
  });

  it('nobody moves during the intro', () => {
    const s = dashRules.init([human('you'), human('b')], 1);
    run(s, () => FWD, (s) => s.phase !== 'intro');
    expect(me(s).m.z).toBeCloseTo(DEFAULT_CONFIG.startZ, 1);
  });

  it('a standing domino blocks, then topples and lets you through; a gap is free', () => {
    const s = dashRules.init([human('you'), human('b')], 3);
    run(s, () => NO_INPUT, (s) => s.phase === 'race');
    const row = s.course.rows[0];
    const dom = s.dominoes.find((d) => d.row === 0)!;
    // Straight into a domino.
    place(s, dom.x, row.z + 3);
    const ev = run(s, (st, id) => (id === 'you' ? FWD : NO_INPUT), (s) => me(s).m.z < row.z - 2, 5000);
    const blocked = s.t;
    expect(ev.filter((e) => e.type === 'domino')).toHaveLength(1);
    expect(dom.state).toBe('down');
    expect(me(s).toppled).toBe(1);
    // Through a gap from the same distance: no topple, and quicker.
    const s2 = dashRules.init([human('you'), human('b')], 3);
    run(s2, () => NO_INPUT, (s) => s.phase === 'race');
    place(s2, row.gaps[0], row.z + 3);
    const ev2 = run(s2, (st, id) => (id === 'you' ? FWD : NO_INPUT), (s) => me(s).m.z < row.z - 2, 5000);
    expect(ev2.filter((e) => e.type === 'domino')).toHaveLength(0);
    expect(blocked - s2.t).toBeGreaterThan(DEFAULT_CONFIG.toppleMs * 0.8);
  });

  it('the wall blocks; the gate lets you through; the spring pad throws you over', () => {
    const mk = () => {
      const s = dashRules.init([human('you'), human('b')], 5);
      run(s, () => NO_INPUT, (s) => s.phase === 'race');
      return s;
    };
    // Into the wall, away from both gate and pad: stuck.
    const a = mk();
    const { wall, pad } = a.course;
    place(a, -wall.gateX * 0.9, wall.z + 4);
    run(a, (st, id) => (id === 'you' ? FWD : NO_INPUT), () => false, 3000);
    expect(me(a).m.z).toBeGreaterThan(wall.z + wall.hz);
    // Through the gate.
    const b = mk();
    place(b, wall.gateX, wall.z + 4);
    run(b, (st, id) => (id === 'you' ? FWD : NO_INPUT), () => false, 1500);
    expect(me(b).m.z).toBeLessThan(wall.z - 2);
    // Onto the pad.
    const c = mk();
    place(c, pad.x, pad.z + 4);
    const ev = run(c, (st, id) => (id === 'you' ? FWD : NO_INPUT), (s) => !!me(s).toss, 1500);
    expect(ev.some((e) => e.type === 'spring' && e.id === 'you')).toBe(true);
    const from = me(c).toss!.fromZ;
    run(c, () => NO_INPUT, (s) => !me(s).toss, 2000);
    expect(me(c).m.z).toBeCloseTo(from - DEFAULT_CONFIG.springDist, 3);
    expect(me(c).m.z).toBeLessThan(wall.z - 2); // over the wall
    expect(me(c).m.z).toBeGreaterThan(c.course.jam.z0); // and down before the jam
  });

  it('jam slows toys to a crawl; the ruler keeps full speed', () => {
    const s = dashRules.init([human('you'), human('b')], 9);
    run(s, () => NO_INPUT, (s) => s.phase === 'race');
    const c = s.course;
    const mid = (c.jam.z0 + c.jam.z1) / 2;
    expect(inJam(c, mid)).toBe(true);
    expect(onRuler(c, rulerX(c, mid), mid)).toBe(true);
    // Along the ruler.
    place(s, c.ruler.x0, c.jam.z0 + 1);
    run(s, (st, id) => (id === 'you' ? towards(rulerX(st.course, me(st).m.z - 1.5), me(st)) : NO_INPUT), (s) => me(s).m.z < c.jam.z1, 20000);
    const onTime = s.t;
    // Through the jam, as far from the ruler as possible.
    const s2 = dashRules.init([human('you'), human('b')], 9);
    run(s2, () => NO_INPUT, (s) => s.phase === 'race');
    const far = (z: number) => (rulerX(c, z) > 0 ? -1 : 1) * (DEFAULT_CONFIG.halfWidth - 1.5);
    place(s2, far(c.jam.z0), c.jam.z0 + 1);
    run(s2, (st, id) => (id === 'you' ? towards(far(me(st).m.z), me(st)) : NO_INPUT), (s) => me(s).m.z < c.jam.z1, 20000);
    expect(s2.t).toBeGreaterThan(onTime * 1.6);
  });

  it('a jaw snapping shut on a toy stuns it and spits it out; a shut jaw blocks', () => {
    const s = dashRules.init([human('you'), human('b')], 11);
    run(s, () => NO_INPUT, (s) => s.phase === 'race');
    const j = s.course.jaws[0];
    run(s, () => NO_INPUT, (s) => jawPhase(j, s.t) === 'warn');
    place(s, j.x, j.z);
    const ev = run(s, () => NO_INPUT, (s) => jawPhase(j, s.t) === 'shut');
    expect(ev.some((e) => e.type === 'jaw-shut' && e.jaw === 0)).toBe(true);
    expect(ev.some((e) => e.type === 'snap' && e.id === 'you')).toBe(true);
    expect(me(s).snaps).toBe(1);
    expect(me(s).stunMs).toBeGreaterThan(0);
    expect(me(s).m.z).toBeGreaterThan(j.z + j.hz); // spat back out the near side
    // Stunned and then blocked: holding forward gets nowhere while the jaw is shut.
    run(s, (st, id) => (id === 'you' ? FWD : NO_INPUT), () => false, JAW_SHUT_MS - 100);
    expect(me(s).m.z).toBeGreaterThan(j.z + j.hz);
    // A toy standing clear of the jaw is untouched.
    expect(me(s, 'b').snaps).toBe(0);
  });

  it('first across the line wins; finish order, then distance, decides the placings', () => {
    const s = dashRules.init([human('you'), human('b'), human('c')], 13);
    run(s, () => NO_INPUT, (s) => s.phase === 'race');
    // Skip to the last straight: you ahead of b; c stays on the start grid.
    place(s, 0, DEFAULT_CONFIG.finishZ + 3, 'you');
    place(s, 2, DEFAULT_CONFIG.finishZ + 5, 'b');
    const ev = run(s, (st, id) => (id === 'c' ? NO_INPUT : FWD));
    const r = dashRules.result(s);
    expect(r.placements.map((p) => [p.contestantId, p.place])).toEqual([['you', 1], ['b', 2], ['c', 3]]);
    expect(r.placements[0].score).toBeGreaterThan(100);
    expect(r.placements[2].score).toBe(0);
    expect(ev.filter((e) => e.type === 'finish').map((e) => e.id)).toEqual(['you', 'b']);
    // The straggler gets the closing window, not the whole clock.
    expect(s.t).toBeLessThanOrEqual(me(s).finishT + DEFAULT_CONFIG.closingMs + DT);
    expect(progressOf(s, me(s, 'c'))).toBe(0);
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
  });

  it('no bot ever gets stuck: solo runs always finish well inside the clock', () => {
    for (const d of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
      for (let seed = 0; seed < 40; seed++) {
        const { s } = botMatch(seed, [d, d]);
        expect(s.finishers).toBe(2);
        expect(Math.max(...s.players.map((p) => p.finishT))).toBeLessThan(45_000);
      }
    }
  });

  it('harder bots do better: more wins, fewer snaps, faster times', () => {
    const wins: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const snaps: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const time: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const N = 60;
    for (let seed = 200; seed < 200 + N; seed++) {
      const order = [['easy', 'normal', 'hard'], ['hard', 'easy', 'normal'], ['normal', 'hard', 'easy']][seed % 3] as BotDifficulty[];
      const { s, bots, result } = botMatch(seed, order);
      wins[bots.find((b) => b.id === result.placements[0].contestantId)!.bot!]++;
      for (const b of bots) {
        const p = s.players.find((x) => x.id === b.id)!;
        snaps[b.bot!] += p.snaps;
        time[b.bot!] += p.finished ? p.finishT : DEFAULT_CONFIG.limitMs;
      }
    }
    expect(wins.hard).toBeGreaterThan(wins.normal);
    expect(wins.normal).toBeGreaterThan(wins.easy);
    expect(time.hard).toBeLessThan(time.normal);
    expect(time.normal).toBeLessThan(time.easy);
    expect(snaps.easy).toBeGreaterThan(snaps.hard);
  });
});
