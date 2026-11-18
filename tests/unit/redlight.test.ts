import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, currentCycle, laneX, progressOf, rlglRules, type RlglInput, type RlglState } from '../../src/minigames/redlight/rules';
import { createRlglBot } from '../../src/minigames/redlight/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import { NO_INPUT } from '../../src/minigames/shared/movement';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';

const DT = 1000 / 60;
const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const FWD: RlglInput = { ax: 0, ay: 1, run: true, jump: false };
const me = (s: RlglState, id = 'you') => s.players.find((p) => p.id === id)!;

type Policy = (s: RlglState, id: string) => RlglInput;

function run(s: RlglState, policy: Policy, until: (s: RlglState) => boolean = () => false, maxMs = 200_000) {
  const events: { type: string; [k: string]: unknown }[] = [];
  for (let t = 0; t < maxMs && !rlglRules.isOver(s) && !until(s); t += DT) {
    const inputs: Record<string, RlglInput[]> = {};
    for (const p of s.players) inputs[p.id] = [policy(s, p.id)];
    rlglRules.step(s, inputs, DT);
    events.push(...rlglRules.drainEvents(s));
  }
  return events;
}

/** Obeys the light perfectly: runs on green, lets go the moment the tell starts. */
const careful: Policy = (s) => (s.phase === 'go' ? FWD : NO_INPUT);
/** Never stops. */
const reckless: Policy = () => FWD;

/** A whole match of bots driven the way the host drives them. */
function botMatch(seed: number, difficulties: BotDifficulty[]) {
  const bots = difficulties.map((d, i) => ({ ...makeBots(subSeed(seed, 'bots'), difficulties.length, d)[i], bot: d }));
  const s = rlglRules.init(bots, seed);
  const policy = createRlglBot();
  const rngs = new Map(bots.map((b) => [b.id, seededRng(subSeed(seed, b.id))]));
  for (let t = 0; t < 200_000 && !rlglRules.isOver(s); t += DT) {
    const inputs: Record<string, RlglInput[]> = {};
    for (const b of bots) inputs[b.id] = policy.decide(s, b, DT, rngs.get(b.id)!);
    rlglRules.step(s, inputs, DT);
    rlglRules.drainEvents(s);
  }
  return { s, bots, result: rlglRules.result(s) };
}

describe('Red Light, Green Light rules', () => {
  it('same seed → same signal schedule; the tell is never shorter than the minimum', () => {
    const a = rlglRules.init([human('you'), human('b')], 77);
    expect(rlglRules.init([human('you'), human('b')], 77).cycles).toEqual(a.cycles);
    expect(rlglRules.init([human('you'), human('b')], 78).cycles).not.toEqual(a.cycles);
    for (const c of a.cycles) {
      expect(c.warnMs).toBeGreaterThanOrEqual(DEFAULT_CONFIG.warnMs[0]);
      expect(c.warnMs).toBeLessThanOrEqual(DEFAULT_CONFIG.warnMs[1]);
      expect(c.goMs).toBeGreaterThanOrEqual(DEFAULT_CONFIG.snapGoMs[0]);
      expect(c.stopMs).toBeGreaterThanOrEqual(DEFAULT_CONFIG.stopMs[0]);
    }
    expect(a.cycles[0].goMs).toBeGreaterThanOrEqual(DEFAULT_CONFIG.goMs[0]); // never opens with a snap go
    for (let i = 1; i < a.cycles.length; i++) {
      const snap = (k: number) => a.cycles[k].goMs < DEFAULT_CONFIG.goMs[0];
      expect(snap(i) && snap(i - 1)).toBe(false); // never two snaps in a row
    }
  });

  it('is deterministic: identical inputs give identical states', () => {
    const mk = () => rlglRules.init([human('you'), human('b'), human('c')], 5);
    const pol: Policy = (s, id) => (id === 'b' ? reckless(s, id) : id === 'c' ? { ax: 0.3, ay: 0.8, run: true, jump: s.phase === 'go' && s.phaseT < 20 } : careful(s, id));
    const a = mk();
    const b = mk();
    run(a, pol);
    run(b, pol);
    expect(a).toEqual(b);
    expect(rlglRules.result(a)).toEqual(rlglRules.result(b));
  });

  it('lines the field up across the runway, centred, inside the edges', () => {
    for (const n of [2, 3, 5, 8]) {
      const xs = Array.from({ length: n }, (_, i) => laneX(i, n, DEFAULT_CONFIG.halfWidth));
      expect(new Set(xs.map((x) => x.toFixed(3))).size).toBe(n);
      expect(Math.abs(xs.reduce((a, b) => a + b, 0))).toBeLessThan(1e-6);
      expect(Math.max(...xs.map(Math.abs))).toBeLessThan(DEFAULT_CONFIG.halfWidth - 1);
      const sorted = xs.slice().sort((a, b) => a - b);
      for (let i = 1; i < n; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(2);
    }
  });

  it('nobody moves before the first green', () => {
    const s = rlglRules.init([human('you'), human('b')], 1);
    run(s, reckless, (s) => s.phase !== 'intro');
    expect(me(s).m.z).toBeCloseTo(DEFAULT_CONFIG.startZ, 1);
    expect(s.phase).toBe('go');
  });

  it('a GO run makes progress, and stopping on the tell is always safe', () => {
    const s = rlglRules.init([human('you'), human('b')], 9);
    const ev = run(s, (st, id) => (id === 'you' ? careful(st, id) : NO_INPUT), (s) => s.cycle >= 3);
    expect(progressOf(s, me(s))).toBeGreaterThan(0.25);
    expect(me(s).caught).toBe(0);
    expect(ev.filter((e) => e.type === 'caught')).toHaveLength(0);
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['go', 'warn', 'stop']));
  });

  it('a 300 ms reaction to the tell is always safe, even at full speed', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = rlglRules.init([human('you'), human('b')], seed);
      const pol: Policy = (st, id) => (id === 'you' && (st.phase === 'go' || (st.phase === 'warn' && st.phaseT < 300)) ? FWD : NO_INPUT);
      run(s, pol, (s) => s.cycle >= 6);
      expect(me(s).caught).toBe(0);
    }
  });

  it('moving on red is caught after the grace: flicked back to the start and held until the next green', () => {
    const s = rlglRules.init([human('you'), human('b')], 3);
    const pol: Policy = (st, id) => (id === 'you' ? reckless(st, id) : NO_INPUT);
    const ev = run(s, pol, (s) => me(s).caught > 0);
    expect(s.phase).toBe('stop');
    expect(s.phaseT).toBeGreaterThan(DEFAULT_CONFIG.graceMs);
    expect(s.phaseT).toBeLessThan(DEFAULT_CONFIG.graceMs + 2 * DT);
    expect(ev.find((e) => e.type === 'caught')!.id).toBe('you');
    expect(progressOf(s, me(s))).toBeGreaterThan(0.2);
    expect(me(s).held).toBe(true);
    // Still holding forward: lands on the start line, isn't caught again, and can't move until green.
    run(s, pol, (s) => !me(s).fling);
    expect(me(s).m.z).toBe(DEFAULT_CONFIG.startZ);
    run(s, pol, (s) => s.phase === 'go');
    expect(me(s).caught).toBe(1);
    expect(me(s).m.z).toBeCloseTo(DEFAULT_CONFIG.startZ, 1);
    expect(me(s).held).toBe(false);
    // …and is free to run again on green.
    run(s, pol, (s) => s.phase !== 'go');
    expect(me(s).m.z).toBeLessThan(DEFAULT_CONFIG.startZ - 5);
    // The toy that stood still was never caught.
    expect(me(s, 'b').caught).toBe(0);
  });

  it('the knock-back distance is configurable and never goes behind the start line', () => {
    const s = rlglRules.init([human('you'), human('b')], 3, { knockBack: 10 });
    run(s, (st, id) => (id === 'you' ? reckless(st, id) : NO_INPUT), (s) => me(s).caught > 0);
    const z = me(s).m.z;
    run(s, () => NO_INPUT, (s) => !me(s).fling);
    expect(me(s).m.z).toBeCloseTo(z + 10, 6);
    const near = rlglRules.init([human('you'), human('b')], 4, { goMs: [300, 300], snapChance: 0, knockBack: 30 });
    run(near, (st, id) => (id === 'you' ? reckless(st, id) : NO_INPUT), (s) => me(s).caught > 0 && !me(s).fling);
    expect(near.players[0].m.z).toBe(DEFAULT_CONFIG.startZ);
  });

  it('recklessness never pays: a toy that never stops never finishes', () => {
    const s = rlglRules.init([human('you'), human('b')], 21);
    run(s, (st, id) => (id === 'you' ? reckless(st, id) : NO_INPUT));
    expect(me(s).finished).toBe(false);
    expect(me(s).caught).toBeGreaterThan(5);
    expect(s.t).toBeGreaterThanOrEqual(DEFAULT_CONFIG.limitMs);
  });

  it('first across the line wins; finish order, then distance, decides the placings', () => {
    const s = rlglRules.init([human('you'), human('b'), human('c'), human('d')], 11);
    // you: perfect. b: perfect but slower. c: perfect but crawling (won't make it). d: never moves.
    const pol: Policy = (st, id) => {
      if (id === 'd' || st.phase !== 'go') return NO_INPUT;
      return { ...FWD, ay: id === 'you' ? 1 : id === 'b' ? 0.7 : 0.2 };
    };
    const ev = run(s, pol);
    const r = rlglRules.result(s);
    expect(r.placements.map((p) => p.contestantId)).toEqual(['you', 'b', 'c', 'd']);
    expect(r.placements.map((p) => p.place)).toEqual([1, 2, 3, 4]);
    expect(me(s).finished && me(s, 'b').finished).toBe(true);
    expect(me(s, 'c').finished).toBe(false);
    expect(me(s).finishT).toBeLessThan(me(s, 'b').finishT);
    // Scores: finishers beat 100 and the faster one scores more; the rest score their percentage.
    const score = (id: string) => r.placements.find((p) => p.contestantId === id)!.score;
    expect(score('you')).toBeGreaterThan(score('b'));
    expect(score('b')).toBeGreaterThan(100);
    expect(score('c')).toBeGreaterThan(0);
    expect(score('c')).toBeLessThan(100);
    expect(score('d')).toBe(0);
    // Once the winner is home the rest get the closing window, not the whole clock.
    expect(ev.find((e) => e.type === 'closing')).toBeTruthy();
    expect(s.t).toBeLessThanOrEqual(me(s).finishT + DEFAULT_CONFIG.closingMs + DT);
    expect(r.durationMs).toBe(s.t);
  });

  it('toys level on distance share a place; the clock ends a race nobody finishes', () => {
    const s = rlglRules.init([human('you'), human('b')], 2, { limitMs: 5000 });
    run(s, () => NO_INPUT);
    expect(s.t).toBeGreaterThanOrEqual(5000);
    expect(rlglRules.result(s).placements.map((p) => p.place)).toEqual([1, 1]);
  });

  it('finished toys are never caught and wait past the line', () => {
    const s = rlglRules.init([human('you'), human('b')], 6);
    run(s, (st, id) => (id === 'you' ? careful(st, id) : NO_INPUT), (s) => me(s).finished);
    const caught = me(s).caught;
    run(s, reckless, (s) => s.cycle > 60, 20_000);
    expect(me(s).caught).toBe(caught);
    expect(me(s).m.z).toBeLessThan(DEFAULT_CONFIG.finishZ);
  });

  it('ignores garbage input', () => {
    const s = rlglRules.init([human('you'), human('b')], 8);
    for (let i = 0; i < 300; i++) rlglRules.step(s, { you: [{ ax: NaN, ay: 1e9, run: true, jump: false }], nobody: [FWD] }, DT);
    expect(Number.isFinite(me(s).m.z)).toBe(true);
    expect(Math.hypot(me(s).m.vx, me(s).m.vz)).toBeLessThanOrEqual(14.001);
  });
});

describe('Red Light, Green Light bots', () => {
  it('a bot-only match finishes with a full, valid set of placings (and replays identically)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = botMatch(seed, ['easy', 'normal', 'hard', 'normal', 'easy', 'hard', 'normal', 'easy']);
      expect(rlglRules.isOver(a.s)).toBe(true);
      expect(a.result.placements).toHaveLength(8);
      expect(a.result.placements[0].place).toBe(1);
      expect(a.s.finishers).toBeGreaterThanOrEqual(1);
      expect(a.result.durationMs).toBeLessThanOrEqual(DEFAULT_CONFIG.limitMs + DT);
      const b = botMatch(seed, ['easy', 'normal', 'hard', 'normal', 'easy', 'hard', 'normal', 'easy']);
      expect(b.result).toEqual(a.result);
    }
  });

  it('harder bots do better: fewer catches, more wins, and they do get caught sometimes', () => {
    const wins: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const caught: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    const N = 60;
    for (let seed = 100; seed < 100 + N; seed++) {
      // Rotate the line-up so no difficulty always gets the same lane.
      const order: BotDifficulty[] = [['easy', 'normal', 'hard'], ['hard', 'easy', 'normal'], ['normal', 'hard', 'easy']][seed % 3] as BotDifficulty[];
      const { s, bots, result } = botMatch(seed, order);
      wins[bots.find((b) => b.id === result.placements[0].contestantId)!.bot!]++;
      for (const b of bots) caught[b.bot!] += s.players.find((p) => p.id === b.id)!.caught;
    }
    expect(wins.hard).toBeGreaterThan(wins.normal);
    expect(wins.normal).toBeGreaterThan(wins.easy);
    expect(caught.easy).toBeGreaterThan(caught.normal);
    expect(caught.normal).toBeGreaterThan(caught.hard);
    expect(caught.easy / N).toBeGreaterThan(0.5); // easy bots visibly slip up
    expect(caught.hard / N).toBeLessThan(0.6); // hard bots rarely do
  });

  it('exposes the current cycle for the HUD/scene', () => {
    const s = rlglRules.init([human('you'), human('b')], 12);
    expect(currentCycle(s)).toBe(s.cycles[0]);
  });
});
