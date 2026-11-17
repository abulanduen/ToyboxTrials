import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, findRules, originalIndex, toyPose, type FindInput, type FindState } from '../../src/minigames/findoriginal/rules';
import { createFindBot } from '../../src/minigames/findoriginal/bot';
import { TRAITS, T, isOriginal, normalise, traitCount } from '../../src/minigames/findoriginal/traits';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';

const mk = (id: string, bot?: BotDifficulty): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'brass', isLocal: id === 'you', bot });
const STEP = 1000 / 60;

/** Step until `pred`, feeding `inputs` on the first step only. */
function run(s: FindState, pred: (s: FindState) => boolean, inputs: Record<string, FindInput[]> = {}, maxMs = 200000) {
  let first = true;
  for (let t = 0; t < maxMs && !pred(s); t += STEP) {
    findRules.step(s, first ? inputs : {}, STEP);
    first = false;
  }
  if (!pred(s)) throw new Error('condition never met');
  return s;
}
const toSearch = (s: FindState) => run(s, (x) => x.phase === 'search');
const decoy = (s: FindState, skip: number[] = []) => s.toys.findIndex((t, i) => !isOriginal(t.traits) && !skip.includes(i));
const P = (s: FindState, id: string) => s.players.find((p) => p.id === id)!;

/** A whole match with bots (and optionally a scripted human), exactly as the host runs it. */
function playMatch(contestants: Contestant[], seed: number) {
  const s = findRules.init(contestants, seed);
  const bot = createFindBot();
  const rngs = new Map(contestants.map((c) => [c.id, seededRng(subSeed(seed, c.id))]));
  const log: string[] = [];
  for (let i = 0; i < 60 * 300 && !findRules.isOver(s); i++) {
    const inputs: Record<string, FindInput[]> = {};
    for (const c of contestants) {
      if (!c.bot) continue;
      const out = bot.decide(s, c, STEP, rngs.get(c.id)!);
      if (out.length) inputs[c.id] = out;
    }
    findRules.step(s, inputs, STEP);
    for (const e of findRules.drainEvents(s)) log.push(JSON.stringify(e));
  }
  return { s, log, result: findRules.result(s) };
}

describe('find the original: crowds', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = toSearch(findRules.init([mk('you')], 1234));
    const b = toSearch(findRules.init([mk('you')], 1234));
    const c = toSearch(findRules.init([mk('you')], 1235));
    expect(a.toys).toEqual(b.toys);
    expect(a.toys).not.toEqual(c.toys);
  });

  it('every round has exactly one Baldwyn, on a full grid, and no stored target flag', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = findRules.init([mk('you')], seed);
      for (let r = 1; r <= DEFAULT_CONFIG.rounds.length; r++) {
        run(s, (x) => x.phase === 'search' && x.round === r);
        const spec = DEFAULT_CONFIG.rounds[r - 1];
        expect(s.toys.length).toBe(spec.cols * spec.rows);
        expect(s.toys.filter((t) => isOriginal(t.traits)).length).toBe(1);
        expect(new Set(s.toys.map((t) => `${t.col},${t.row}`)).size).toBe(s.toys.length);
        for (const t of s.toys) {
          expect(Object.keys(t)).not.toContain('target');
          if (isOriginal(t.traits)) continue;
          expect(normalise(t.traits)).toBe(t.traits);
          const n = traitCount(t.traits);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(spec.diffs[1]);
          // Every decoy carries at least one mistake as readable as the round promises.
          expect(TRAITS.some((d) => t.traits & d.bit && d.tier <= spec.needTier)).toBe(true);
        }
        findRules.step(s, { you: [{ pick: originalIndex(s) }] }, STEP);
      }
    }
  });

  it('gets harder: bigger crowds, fewer and subtler mistakes, then shuffling', () => {
    const r = DEFAULT_CONFIG.rounds;
    for (let i = 1; i < r.length; i++) {
      expect(r[i].cols * r[i].rows).toBeGreaterThan(r[i - 1].cols * r[i - 1].rows);
      expect(r[i].hardness).toBeGreaterThan(r[i - 1].hardness);
      expect(r[i].drift).toBeGreaterThanOrEqual(r[i - 1].drift);
    }
    expect(r[0].drift).toBe(0);
    expect(r[r.length - 1].drift).toBeGreaterThan(0);
    expect(r[r.length - 1].diffs).toEqual([1, 1]);
    expect(Math.max(...r.map((x) => x.cols * x.rows))).toBeLessThanOrEqual(30);
  });

  it('toys stay on their own spot while they shuffle (no swapping places, no collisions)', () => {
    const s = findRules.init([mk('you')], 77);
    run(s, (x) => x.phase === 'search' && x.round === 5, {}, 400000);
    let moved = 0;
    const start = s.toys.map((_, i) => ({ ...toyPose(s, i) }));
    for (let k = 0; k < 600; k++) {
      findRules.step(s, {}, STEP);
      for (let i = 0; i < s.toys.length; i++) {
        const p = toyPose(s, i);
        expect(Math.abs(p.u - (s.toys[i].col + 0.5))).toBeLessThan(0.25);
        expect(Math.abs(p.v - (s.toys[i].row + 0.5))).toBeLessThan(0.25);
        moved = Math.max(moved, Math.abs(p.u - start[i].u));
      }
    }
    expect(moved).toBeGreaterThan(0.05);
  });

  it('a missing hat hides the other hat mistakes', () => {
    expect(normalise(T.noHat | T.tilt | T.band | T.belt)).toBe(T.noHat | T.belt);
    expect(normalise(T.tilt | T.band)).toBe(T.tilt | T.band);
  });
});

describe('find the original: round flow and scoring', () => {
  it('runs intro → study → search → reveal for five rounds, then is over', () => {
    const s = findRules.init([mk('you')], 5);
    expect(s.phase).toBe('intro');
    run(s, (x) => x.phase === 'study');
    expect(findRules.drainEvents(s).map((e) => e.type)).toContain('round-start');
    for (let r = 1; r <= 5; r++) {
      run(s, (x) => x.phase === 'search' && x.round === r);
      findRules.step(s, { you: [{ pick: originalIndex(s) }] }, STEP);
      expect(s.phase).toBe('reveal');
    }
    run(s, (x) => findRules.isOver(x));
    expect(s.round).toBe(5);
    expect(P(s, 'you').finds).toBe(5);
    const types = findRules.drainEvents(s).map((e) => e.type);
    expect(types.filter((t) => t === 'found').length).toBe(5);
    expect(types[types.length - 1]).toBe('over');
  });

  it('picks before the crowd appears are ignored', () => {
    const s = findRules.init([mk('you')], 5);
    run(s, (x) => x.phase === 'study');
    findRules.step(s, { you: [{ pick: 0 }, { pick: 1 }, { pick: 2 }] }, STEP);
    expect(P(s, 'you').score).toBe(0);
    expect(P(s, 'you').wrongTotal).toBe(0);
  });

  it('a correct pick scores order points plus a speed bonus that fades with time', () => {
    const fast = toSearch(findRules.init([mk('you')], 9));
    findRules.step(fast, { you: [{ pick: originalIndex(fast) }] }, STEP);
    expect(P(fast, 'you').score).toBe(150);
    expect(P(fast, 'you').found).toBe(true);

    const slow = toSearch(findRules.init([mk('you')], 9));
    run(slow, (x) => x.phaseT >= 10000);
    findRules.step(slow, { you: [{ pick: originalIndex(slow) }] }, STEP);
    expect(P(slow, 'you').score).toBe(125);
  });

  it('a wrong pick costs points (never below zero) and locks you out for a while', () => {
    const s = toSearch(findRules.init([mk('you')], 9));
    const me = P(s, 'you');
    const d1 = decoy(s);
    findRules.step(s, { you: [{ pick: d1 }] }, STEP);
    expect(me.score).toBe(0); // nothing to lose yet
    expect(me.lockMs).toBe(DEFAULT_CONFIG.lockMs);
    expect(me.wrong).toEqual([d1]);
    expect(findRules.drainEvents(s).some((e) => e.type === 'wrong' && e.toy === d1)).toBe(true);

    // Locked: even the right answer is ignored.
    findRules.step(s, { you: [{ pick: originalIndex(s) }] }, STEP);
    expect(me.found).toBe(false);
    run(s, () => me.lockMs === 0);
    expect(s.phaseT).toBeGreaterThanOrEqual(DEFAULT_CONFIG.lockMs);

    // The same decoy can't be picked twice; a second mistake locks for longer.
    findRules.step(s, { you: [{ pick: d1 }] }, STEP);
    expect(me.wrongTotal).toBe(1);
    findRules.step(s, { you: [{ pick: decoy(s, [d1]) }] }, STEP);
    expect(me.wrongTotal).toBe(2);
    expect(me.lockMs).toBe(DEFAULT_CONFIG.lockMs + DEFAULT_CONFIG.lockStepMs);

    // With points in the bank a mistake takes the penalty.
    run(s, () => me.lockMs === 0);
    findRules.step(s, { you: [{ pick: originalIndex(s) }] }, STEP);
    const banked = me.score;
    expect(banked).toBeGreaterThan(100);
    run(s, (x) => x.phase === 'search' && x.round === 2);
    expect(me.wrong).toEqual([]);
    findRules.step(s, { you: [{ pick: decoy(s) }] }, STEP);
    expect(me.score).toBe(banked - DEFAULT_CONFIG.wrongPenalty);
  });

  it('rubbish input is ignored', () => {
    const s = toSearch(findRules.init([mk('you')], 9));
    const bad = [{ pick: -1 }, { pick: 999 }, { pick: 1.5 }, { pick: NaN }, {} as FindInput, null as unknown as FindInput];
    findRules.step(s, { you: bad, stranger: [{ pick: originalIndex(s) }] }, STEP);
    expect(P(s, 'you').wrongTotal).toBe(0);
    expect(s.phase).toBe('search');
  });

  it('the round times out if nobody finds him', () => {
    const s = toSearch(findRules.init([mk('you')], 9));
    run(s, (x) => x.phase === 'reveal');
    expect(s.searchT).toBeGreaterThanOrEqual(DEFAULT_CONFIG.searchMs);
    expect(P(s, 'you').score).toBe(0);
    const reveal = findRules.drainEvents(s).find((e) => e.type === 'reveal')!;
    expect(reveal.reason).toBe('time');
    expect(reveal.toy).toBe(originalIndex(s));
  });

  it('later finders score less, the first find starts the hurry clock, and the last toy gets nothing', () => {
    const s = toSearch(findRules.init([mk('a'), mk('b'), mk('c'), mk('d')], 31));
    const target = originalIndex(s);
    findRules.step(s, { a: [{ pick: target }] }, STEP);
    expect(s.limitMs).toBeCloseTo(s.phaseT + DEFAULT_CONFIG.hurryMs, 3);
    expect(findRules.drainEvents(s).some((e) => e.type === 'hurry')).toBe(true);
    run(s, (x) => x.phaseT >= 2000);
    findRules.step(s, { b: [{ pick: target }] }, STEP);
    expect(s.phase).toBe('search');
    findRules.step(s, { c: [{ pick: target }] }, STEP);
    // Three of four have found him: round over, d scores nothing.
    expect(s.phase).toBe('reveal');
    expect(P(s, 'a').score).toBe(150);
    expect(P(s, 'b').score).toBe(70 + 45);
    expect(P(s, 'c').score).toBe(50 + 45);
    expect(P(s, 'd').score).toBe(0);
    expect([P(s, 'a').foundOrder, P(s, 'b').foundOrder, P(s, 'c').foundOrder, P(s, 'd').foundOrder]).toEqual([0, 1, 2, -1]);
  });

  it('hurry: the others run out of time a few seconds after the first find', () => {
    const s = toSearch(findRules.init([mk('a'), mk('b'), mk('c')], 31));
    findRules.step(s, { a: [{ pick: originalIndex(s) }] }, STEP);
    run(s, (x) => x.phase === 'reveal');
    expect(s.searchT).toBeLessThan(DEFAULT_CONFIG.hurryMs + 200);
  });

  it('picks landing in the same step tie for the same points', () => {
    const s = toSearch(findRules.init([mk('a'), mk('b'), mk('c')], 31));
    const target = originalIndex(s);
    findRules.step(s, { a: [{ pick: target }], b: [{ pick: target }] }, STEP);
    expect(P(s, 'a').score).toBe(P(s, 'b').score);
    expect(P(s, 'a').foundOrder).toBe(0);
    expect(P(s, 'b').foundOrder).toBe(0);
    expect(s.phase).toBe('reveal');
  });
});

describe('find the original: placement', () => {
  it('ranks by score; equal scores go to the faster total pick time; identical results share a place', () => {
    const s = toSearch(findRules.init([mk('a'), mk('b'), mk('c'), mk('d')], 31));
    const target = originalIndex(s);
    // a and b tie on the same step; c is later; d never finds him.
    findRules.step(s, { a: [{ pick: target }], b: [{ pick: target }] }, STEP);
    findRules.step(s, { c: [{ pick: target }] }, STEP);
    const res = findRules.result(s);
    expect(res.placements.map((p) => [p.contestantId, p.place])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
      ['d', 4],
    ]);
    expect(res.placements[0].score).toBe(150);

    // Same score, different speed: fake two players level on points.
    const t = findRules.init([mk('x'), mk('y')], 1);
    Object.assign(P(t, 'x'), { score: 200, finds: 2, findMs: 9000 });
    Object.assign(P(t, 'y'), { score: 200, finds: 2, findMs: 4000 });
    expect(findRules.result(t).placements.map((p) => [p.contestantId, p.place])).toEqual([
      ['y', 1],
      ['x', 2],
    ]);
  });
});

describe('find the original: bots', () => {
  it('a bot-only match finishes, is deterministic, and produces a full ranking', () => {
    const field = [mk('b1', 'easy'), mk('b2', 'normal'), mk('b3', 'hard'), mk('b4', 'normal')];
    const a = playMatch(field, 2024);
    const b = playMatch(field, 2024);
    expect(findRules.isOver(a.s)).toBe(true);
    expect(a.log).toEqual(b.log);
    expect(a.result.placements.length).toBe(4);
    expect(a.result.placements[0].place).toBe(1);
    expect(a.result.durationMs).toBeLessThan(140000);
    expect(a.result.stats!.finds).toBeGreaterThan(5);
  });

  it('a solo bot plays all five rounds on its own', () => {
    const { s, result } = playMatch([mk('b1', 'normal')], 8);
    expect(findRules.isOver(s)).toBe(true);
    expect(result.placements[0].score).toBeGreaterThan(200);
  });

  it('harder bots score more and win more against each other', () => {
    const totals: Record<BotDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
    let hardWins = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const field = [mk('e', 'easy'), mk('n', 'normal'), mk('h', 'hard')];
      const { s, result } = playMatch(field, seed * 7919);
      totals.easy += P(s, 'e').score;
      totals.normal += P(s, 'n').score;
      totals.hard += P(s, 'h').score;
      if (result.placements[0].contestantId === 'h') hardWins++;
    }
    expect(totals.hard).toBeGreaterThan(totals.normal * 1.15);
    expect(totals.normal).toBeGreaterThan(totals.easy * 1.15);
    expect(hardWins).toBeGreaterThan(N * 0.6);
  });

  it('on their own, harder bots are faster, slip less and time out less', () => {
    const N = 60;
    const solo = (d: BotDifficulty) => {
      let score = 0;
      let wrong = 0;
      let finds = 0;
      let ms = 0;
      for (let seed = 1; seed <= N; seed++) {
        const { s } = playMatch([mk('b', d)], seed * 104729);
        const p = P(s, 'b');
        score += p.score;
        wrong += p.wrongTotal;
        finds += p.finds;
        ms += p.findMs;
      }
      return { score: score / N, wrong: wrong / N, finds: finds / N, avgMs: ms / finds };
    };
    const easy = solo('easy');
    const normal = solo('normal');
    const hard = solo('hard');
    expect(hard.score).toBeGreaterThan(normal.score);
    expect(normal.score).toBeGreaterThan(easy.score);
    expect(easy.wrong).toBeGreaterThan(normal.wrong);
    expect(normal.wrong).toBeGreaterThan(hard.wrong);
    expect(hard.avgMs).toBeLessThan(normal.avgMs);
    expect(normal.avgMs).toBeLessThan(easy.avgMs);
    // Hard bots all but always find him; easy bots are beatable but not hopeless.
    expect(hard.finds).toBeGreaterThan(4.9);
    expect(easy.finds).toBeGreaterThan(3.5);
    expect(easy.finds).toBeLessThan(hard.finds);
  });

  it('bots never pick while locked out or after finding him', () => {
    const field = [mk('e', 'easy'), mk('e2', 'easy'), mk('e3', 'easy')];
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = playMatch(field, seed);
      for (const p of s.players) expect(p.finds).toBeLessThanOrEqual(5);
    }
  });
});
