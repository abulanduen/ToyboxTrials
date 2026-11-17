import { describe, expect, it } from 'vitest';
import { copycatRules, inputDeadline, lengthFor, type CopycatInput, type CopycatState } from '../../src/minigames/copycat/rules';
import { createCopycatBot } from '../../src/minigames/copycat/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });

/** Step the rules at 16 ms, letting `policy` decide inputs per player each step. */
function run(s: CopycatState, policy: (s: CopycatState, id: string) => CopycatInput[], maxMs = 600_000) {
  const events: string[] = [];
  for (let t = 0; t < maxMs && !copycatRules.isOver(s); t += 16) {
    const inputs: Record<string, CopycatInput[]> = {};
    for (const p of s.players) inputs[p.id] = s.phase === 'input' ? policy(s, p.id) : [];
    copycatRules.step(s, inputs, 16);
    events.push(...copycatRules.drainEvents(s).map((e) => e.type));
  }
  return events;
}

/** A perfect player who presses one correct note per step, failing on `failRound` (wrong note). */
const perfect = (failRound: Record<string, number> = {}) => (s: CopycatState, id: string): CopycatInput[] => {
  const p = s.players.find((x) => x.id === id)!;
  if (!p.alive || p.finished) return [];
  const exp = s.sequence[p.progress];
  if (failRound[id] === s.round && p.progress === (failRound[`${id}@`] ?? 0)) return [{ slot: ((exp + 1) % 4) as 0 }];
  return [{ slot: exp }];
};

describe('Copycat Conductor rules', () => {
  it('same seed → same sequence; never three identical notes in a row', () => {
    const a = copycatRules.init([human('you')], 123);
    expect(copycatRules.init([human('you')], 123).sequence).toEqual(a.sequence);
    expect(copycatRules.init([human('you')], 124).sequence).not.toEqual(a.sequence);
    for (let i = 2; i < a.sequence.length; i++) expect(a.sequence[i] === a.sequence[i - 1] && a.sequence[i] === a.sequence[i - 2]).toBe(false);
  });

  it('sequence grows by one per round and demonstrations speed up', () => {
    const s = copycatRules.init([human('you')], 1);
    const lens: number[] = [];
    run(s, (st, id) => {
      if (lens[lens.length - 1] !== lengthFor(st)) lens.push(lengthFor(st));
      return perfect({ you: 5 })(st, id);
    });
    expect(lens).toEqual([3, 4, 5, 6, 7]);
  });

  it('solo: ends on the first mistake and scores rounds completed', () => {
    const s = copycatRules.init([human('you')], 9);
    const ev = run(s, perfect({ you: 4 }));
    expect(copycatRules.isOver(s)).toBe(true);
    const r = copycatRules.result(s);
    expect(r.placements[0].score).toBe(3);
    expect(r.stats?.longestSequence).toBe(5);
    expect(ev).toContain('eliminated');
    expect(ev.filter((e) => e === 'demo-note').length).toBe(3 + 4 + 5 + 6);
  });

  it('timeout eliminates a player who stops pressing', () => {
    const s = copycatRules.init([human('you')], 5);
    run(s, (st, id) => (st.round === 2 && st.players[0].progress >= 1 ? [] : perfect()(st, id)));
    expect(s.players[0].alive).toBe(false);
    expect(s.players[0].elimRound).toBe(2);
    expect(s.players[0].elimProgress).toBe(1);
  });

  it('input deadline scales with sequence length', () => {
    const s = copycatRules.init([human('you')], 5);
    const d1 = inputDeadline(s);
    s.round = 6;
    expect(inputDeadline(s)).toBeGreaterThan(d1);
  });

  it('multiplayer: last standing wins; elimination order decides the rest', () => {
    const s = copycatRules.init([human('a'), human('b'), human('c')], 77);
    run(s, perfect({ a: 1, b: 2 }));
    const places = Object.fromEntries(copycatRules.result(s).placements.map((p) => [p.contestantId, p.place]));
    expect(places).toEqual({ c: 1, b: 2, a: 3 });
    // The game ends as soon as one remains (c doesn't have to finish round 2).
    expect(s.round).toBe(2);
  });

  it('simultaneous identical exits share a place', () => {
    const s = copycatRules.init([human('a'), human('b'), human('c')], 3);
    run(s, perfect({ a: 2, b: 2 }));
    const res = copycatRules.result(s).placements;
    const pa = res.find((p) => p.contestantId === 'a')!.place;
    const pb = res.find((p) => p.contestantId === 'b')!.place;
    expect(res.find((p) => p.contestantId === 'c')!.place).toBe(1);
    expect(pa).toBe(pb);
    expect(pa).toBe(2);
  });

  it('forfeit counts as last place', () => {
    const s = copycatRules.init([human('a'), human('b'), human('c')], 4);
    copycatRules.forfeit(s, 'a');
    run(s, perfect({ b: 3 }));
    const res = copycatRules.result(s).placements;
    expect(res[res.length - 1].contestantId).toBe('a');
    expect(res[res.length - 1].forfeit).toBe(true);
  });

  it('bot matches always finish, and hard bots beat easy bots more often', () => {
    let hardWins = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const easy = makeBots(seed, 2, 'easy').map((b) => ({ ...b, id: `e-${b.id}` }));
      const hard = makeBots(seed + 1000, 2, 'hard').map((b) => ({ ...b, id: `h-${b.id}` }));
      const field = [...easy, ...hard];
      const s = copycatRules.init(field, seed);
      const bot = createCopycatBot();
      const rng = seededRng(seed);
      run(s, (st, id) => bot.decide(st, field.find((c) => c.id === id)!, 16, rng));
      expect(copycatRules.isOver(s)).toBe(true);
      const winner = copycatRules.result(s).placements[0].contestantId;
      if (winner.startsWith('h-')) hardWins++;
    }
    expect(hardWins / N).toBeGreaterThan(0.6);
  });
});
