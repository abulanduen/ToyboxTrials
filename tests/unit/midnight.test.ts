import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { hungerRules, SHELTERS } from '../../src/minigames/midnight/rules';
import { createHungerBot } from '../../src/minigames/midnight/bot';
const people: Contestant[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Toy ${i}`, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: i === 0, bot: 'normal' }));
const fresh = () => hungerRules.init(people, 123);

describe('Midnight Hunger', () => {
  it('spawns N−1 unique targets, repeatably, away from toys and shelters', () => {
    const s = fresh(); expect(fresh()).toEqual(s);
    expect(hungerRules.init(people, 456).batteries).not.toEqual(s.batteries);
    expect(s.batteries).toHaveLength(3);
    expect(new Set(s.batteries.map(b => `${b.x},${b.z}`)).size).toBe(3);
    for (const b of s.batteries) expect(s.players.some(p => p.x === b.x && p.z === b.z)).toBe(false);
  });
  it('drains continuously, accelerates in daylight and reduces drain under shelter', () => {
    const s = fresh(); s.batteries = [];
    hungerRules.step(s, {}, 1000); expect(s.players[0].energy).toBeCloseTo(98);
    hungerRules.step(s, {}, 9000); expect(s.phase).toBe('day');
    Object.assign(s.players[0], SHELTERS[0]);
    hungerRules.step(s, {}, 1000);
    expect(s.players[0].energy).toBeCloseTo(77);
    expect(s.players[1].energy).toBeCloseTo(71);
  });
  it('restores capped energy exactly once per player per night', () => {
    const s = fresh(); const p = s.players[0]; p.energy = 80;
    s.batteries = [{ id: 0, x: p.x, z: p.z, caughtBy: null }, { id: 1, x: p.x, z: p.z, caughtBy: null }];
    hungerRules.step(s, {}, 1);
    expect(p.energy).toBeCloseTo(99.998); expect(p.batteries).toBe(1); expect(p.fed).toBe(true);
    hungerRules.step(s, {}, 1); expect(p.batteries).toBe(1);
    expect(s.batteries.filter(b => b.caughtBy !== null)).toHaveLength(1);
  });
  it('clears targets by day and respawns N−1 for current survivors at night', () => {
    const s = fresh(); s.batteries = [];
    for (const p of s.players) Object.assign(p, SHELTERS[0]);
    s.players[0].energy = 1;
    hungerRules.step(s, {}, 10000); expect(s.batteries).toEqual([]); expect(s.players[0].alive).toBe(false);
    hungerRules.step(s, {}, 8000); expect(s.phase).toBe('night'); expect(s.night).toBe(2);
    expect(s.batteries).toHaveLength(2); expect(s.players.every(p => !p.fed)).toBe(true);
  });
  it('a shared target has one seeded winner regardless of input object order', () => {
    const s = fresh(); for (const p of s.players) { p.x = 5; p.z = 5; }
    s.batteries = [{ id: 0, x: 5, z: 5, caughtBy: null }];
    hungerRules.step(s, {}, 1);
    expect(s.players.filter(p => p.fed)).toHaveLength(1);
    expect(s.events.filter(e => e.type === 'battery')).toHaveLength(1);
  });
  it('resolves simultaneous energy depletion as a tie and does not revive eliminated toys', () => {
    const s = fresh(); s.batteries = []; for (const p of s.players) p.energy = 1;
    hungerRules.step(s, {}, 1000);
    expect(s.phase).toBe('over'); expect(s.t).toBeCloseTo(500);
    expect(hungerRules.result(s).placements.map(p => p.place)).toEqual([1, 1, 1, 1]);
    const before = JSON.stringify(s); hungerRules.step(s, {}, 1000); expect(JSON.stringify(s)).toBe(before);
  });
  it('ranks the last survivor first and prior eliminations by survival time', () => {
    const s = fresh(); s.batteries = []; s.players.forEach((p, i) => { p.energy = i + 1; });
    hungerRules.step(s, {}, 5000);
    expect(hungerRules.result(s).placements.map(p => p.contestantId)).toEqual(['p3', 'p2', 'p1', 'p0']);
    expect(s.players.filter(p => p.alive)).toHaveLength(1);
    expect(hungerRules.drainEvents(s).some(e => e.type === 'over')).toBe(true);
    expect(hungerRules.drainEvents(s)).toEqual([]);
  });
  it('clamps moves to the board, ignores invalid/dead input and enforces move cooldown', () => {
    const s = fresh(); const p = s.players[0]; p.x = 0; p.z = 0;
    hungerRules.step(s, { p0: [{ direction: 3 }] }, 16); expect(p.x).toBe(0);
    hungerRules.step(s, { p0: [{ direction: 1 }] }, 16); expect(p.x).toBe(0);
    hungerRules.step(s, {}, 200);
    hungerRules.step(s, { p0: [{ direction: 1 }] }, 16); expect(p.x).toBe(1);
    hungerRules.step(s, { p0: [{ direction: 99 as 0 }] }, 200); expect(p.x).toBe(1);
    p.alive = false; hungerRules.step(s, { p0: [{ direction: 1 }] }, 16); expect(p.x).toBe(1);
  });
  it('splits large steps at exact phase, target and elimination boundaries', () => {
    const a = fresh(), b = fresh();
    hungerRules.step(a, {}, 22000);
    for (let i = 0; i < 2200; i++) hungerRules.step(b, {}, 10);
    expect(a.phase).toBe(b.phase); expect(a.t).toBeCloseTo(b.t);
    expect(a.batteries).toEqual(b.batteries);
    a.players.forEach((p, i) => expect(p.energy).toBeCloseTo(b.players[i].energy));
  });
  it('ends at the time limit and ties surviving toys', () => {
    const s = hungerRules.init(people, 42, { maxMs: 500 });
    hungerRules.step(s, {}, 1000); expect(s.phase).toBe('over'); expect(s.t).toBe(500);
    expect(hungerRules.result(s).placements.every(p => p.place === 1)).toBe(true);
  });
  it('completes reproducible bot matches with bounded positions and energy', () => {
    const run = () => {
      const s = hungerRules.init(people, 22, { maxMs: 30000 }); const bot = createHungerBot(); const rng = seededRng(77);
      for (let i = 0; i < 2000 && s.phase !== 'over'; i++) {
        hungerRules.step(s, Object.fromEntries(people.map(c => [c.id, bot.decide(s, c, 16, rng)])), 16);
        hungerRules.drainEvents(s);
        for (const p of s.players) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThan(11); expect(p.energy).toBeGreaterThanOrEqual(0); expect(p.energy).toBeLessThanOrEqual(100); }
      }
      expect(s.phase).toBe('over'); return hungerRules.result(s);
    };
    expect(run()).toEqual(run());
  });
  it('rejects unsupported fields and invalid drain settings', () => {
    expect(() => hungerRules.init(people.slice(0, 1), 1)).toThrow();
    expect(() => hungerRules.init(people, 1, { shelterDrain: 0 })).toThrow();
    expect(() => hungerRules.init(people, 1, { dayDrain: 1 })).toThrow();
  });
});
