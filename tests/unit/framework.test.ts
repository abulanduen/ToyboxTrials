import { describe, expect, it } from 'vitest';
import { seededRng, shuffle, subSeed } from '../../src/minigames/rng';
import { selectGames } from '../../src/minigames/tournament';
import { addRound, pointsForPlace, rankByKey, rankStandings, type Standing } from '../../src/minigames/scoring';
import type { MinigameCategory, MinigameId } from '../../src/minigames/types';

describe('seeded rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('shuffle keeps all items; subSeed is stable', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(seededRng(1), items).sort()).toEqual(items);
    expect(subSeed(99, 'round-2')).toBe(subSeed(99, 'round-2'));
    expect(subSeed(99, 'round-2')).not.toBe(subSeed(99, 'round-3'));
  });
});

const pool: { id: MinigameId; category: MinigameCategory }[] = [
  { id: 'copycat-conductor', category: 'memory' },
  { id: 'find-the-original', category: 'observation' },
  { id: 'toybox-trivia', category: 'knowledge' },
  { id: 'red-light-green-light', category: 'reflex' },
  { id: 'wind-up-dash', category: 'racing' },
  { id: 'blink-duel', category: 'pvp' },
  { id: 'spellbox-showdown', category: 'pvp' },
  { id: 'music-box-rhythm', category: 'rhythm' },
];

describe('tournament game selection', () => {
  it('same seed → same order; no repeats when the pool is big enough', () => {
    const a = selectGames(7, 5, pool);
    expect(selectGames(7, 5, pool)).toEqual(a);
    expect(new Set(a).size).toBe(5);
  });
  it('treasure (8) uses all 8 distinct games', () => {
    expect(new Set(selectGames(11, 8, pool)).size).toBe(8);
  });
  it('respects the category cap where possible (pvp ≤ 2)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = selectGames(seed, 5, pool);
      expect(g.filter((id) => id === 'blink-duel' || id === 'spellbox-showdown').length).toBeLessThanOrEqual(2);
    }
  });
  it('with a single eligible game, repeats it (Copycat-only tournaments)', () => {
    expect(selectGames(3, 3, pool.slice(0, 1))).toEqual(['copycat-conductor', 'copycat-conductor', 'copycat-conductor']);
  });
});

describe('scoring', () => {
  it('uses the 10/8/6/5/4/3/2/1 table', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(pointsForPlace)).toEqual([10, 8, 6, 5, 4, 3, 2, 1, 0]);
  });
  it('ties share the higher place and skip the next', () => {
    const p = rankByKey([
      { contestantId: 'a', score: 5, key: 'x' },
      { contestantId: 'b', score: 3, key: 'y' },
      { contestantId: 'c', score: 3, key: 'y' },
      { contestantId: 'd', score: 1, key: 'z' },
    ]);
    expect(p.map((x) => x.place)).toEqual([1, 2, 2, 4]);
  });
  it('accumulates standings and ranks by points, then wins', () => {
    let s: Standing[] = ['a', 'b', 'c'].map((id) => ({ contestantId: id, points: 0, rounds: [], wins: 0 }));
    s = addRound(s, [
      { contestantId: 'a', place: 1, score: 0 },
      { contestantId: 'b', place: 2, score: 0 },
      { contestantId: 'c', place: 3, score: 0 },
    ]);
    s = addRound(s, [
      { contestantId: 'b', place: 1, score: 0 },
      { contestantId: 'a', place: 2, score: 0 },
      { contestantId: 'c', place: 3, score: 0 },
    ]);
    const r = rankStandings(s);
    expect(r.map((x) => [x.contestantId, x.points, x.place])).toEqual([
      ['a', 18, 1],
      ['b', 18, 1],
      ['c', 12, 3],
    ]);
  });
});
