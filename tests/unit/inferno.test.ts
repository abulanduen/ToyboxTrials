import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { infernoRules, index, distances, type InfernoState } from '../../src/minigames/inferno/rules';
import { createInfernoBot } from '../../src/minigames/inferno/bot';
import { seededRng } from '../../src/minigames/rng';

const people: Contestant[] = ['you', 'bot'].map(id => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you', bot: 'normal' }));
const fresh = () => { const s = infernoRules.init(people, 123); s.players[0].x = 1; s.players[0].z = 1; s.players[1].x = 9; s.players[1].z = 9; for (const p of s.players) s.tiles[index(p.x, p.z)] = 'floor'; return s; };
function empty(s: InfernoState) { s.tiles = s.tiles.map(t => t === 'edge' ? t : 'floor'); }

describe('Inferno Escape', () => {
  it('starts all eight toys in the centre with rocks everywhere else inside the boundary', () => {
    const s = infernoRules.init(Array.from({ length: 8 }, (_, i) => ({ ...people[0], id: String(i) })), 123);
    expect(new Set(s.players.map(p => index(p.x, p.z))).size).toBe(8);
    expect(s.players.every(p => p.x >= 4 && p.x <= 6 && p.z >= 4 && p.z <= 6)).toBe(true);
    for (let z = 1; z < 10; z++) for (let x = 1; x < 10; x++) expect(s.tiles[index(x, z)]).toBe(x >= 4 && x <= 6 && z >= 4 && z <= 6 ? 'floor' : 'rock');
    for (const p of s.players) expect(s.tiles[index(p.x, p.z)]).toBe('floor');
  });
  it('blocks movement through rocks and boundaries, while turning toward them', () => {
    const s = fresh(); s.tiles[index(2, 1)] = 'rock';
    infernoRules.step(s, { you: [{ direction: 1 }] }, 16);
    expect(s.players[0].x).toBe(1); expect(s.players[0].facing).toBe(1);
    infernoRules.step(s, { you: [{ action: 'break' }] }, 16);
    expect(s.tiles[index(2, 1)]).toBe('floor');
    infernoRules.step(s, { you: [{ direction: 1 }] }, 250);
    expect(s.players[0].x).toBe(2);
  });
  it('permits only one wall, only before the deadline', () => {
    const s = fresh(); empty(s); s.players[0].facing = 1;
    infernoRules.step(s, { you: [{ action: 'build' }, { action: 'build' }] }, 16);
    expect(s.tiles.filter(t => t === 'wall')).toHaveLength(1);
    infernoRules.step(s, { you: [{ action: 'break' }] }, 16);
    infernoRules.step(s, { you: [{ action: 'build' }] }, 16);
    expect(s.tiles.filter(t => t === 'wall')).toHaveLength(0);
    s.players[1].facing = 0;
    infernoRules.step(s, { bot: [{ action: 'build' }] }, 15000);
    expect(s.players[1].wallUsed).toBe(false);
  });
  it('does not build over a contender or the furnace', () => {
    const s = fresh(); empty(s); const p = s.players[0]; p.x = 4; p.z = 5; p.facing = 1;
    infernoRules.step(s, { you: [{ action: 'build' }] }, 16); expect(p.wallUsed).toBe(false);
    p.x = 8; p.z = 9;
    infernoRules.step(s, { you: [{ action: 'build' }] }, 16); expect(p.wallUsed).toBe(false);
  });
  it('recomputes route costs when a rock is removed', () => {
    const s = fresh(); empty(s);
    s.tiles[index(2, 1)] = 'rock'; s.tiles[index(1, 2)] = 'rock';
    const before = distances(s)[index(1, 1)];
    s.players[0].facing = 1;
    infernoRules.step(s, { you: [{ action: 'break' }] }, 16);
    expect(distances(s)[index(1, 1)]).toBeLessThan(before);
  });
  it('protects another player’s wall but lets its owner remove it', () => {
    const s = fresh(); empty(s); s.players[0].facing = 1;
    infernoRules.step(s, { you: [{ action: 'build' }] }, 16);
    expect(s.wallOwners[index(2, 1)]).toBe('you');
    Object.assign(s.players[1], { x: 3, z: 1, facing: 3 });
    infernoRules.step(s, { bot: [{ action: 'break' }] }, 16);
    expect(s.tiles[index(2, 1)]).toBe('wall');
    infernoRules.step(s, { you: [{ action: 'break' }] }, 16);
    expect(s.tiles[index(2, 1)]).toBe('floor');
  });
  it('the furnace waits to break obstacles, with walls taking longer than rocks', () => {
    const breakTime = (tile: 'rock' | 'wall') => {
      const s = fresh(); s.tiles.fill('edge');
      s.tiles[index(5, 5)] = 'floor'; s.tiles[index(6, 5)] = tile; s.tiles[index(7, 5)] = 'floor';
      Object.assign(s.players[0], { x: 7, z: 5 });
      s.wallOwners[index(6, 5)] = 'you';
      infernoRules.step(s, {}, s.config.prepMs + s.config.furnaceMs);
      expect(s.attack).toMatchObject({ x: 6, z: 5 });
      expect(s.tiles[index(6, 5)]).toBe(tile);
      const start = s.t;
      while (s.tiles[index(6, 5)] !== 'floor' && s.t - start < 5000) infernoRules.step(s, {}, 100);
      expect(s.furnace).toEqual({ x: 6, z: 5 });
      expect(s.wallOwners[index(6, 5)]).toBeUndefined();
      return s.t - start;
    };
    expect(breakTime('rock')).toBe(900);
    expect(breakTime('wall')).toBe(1800);
  });
  it('eliminates on contact and ranks the last survivor first', () => {
    const s = fresh(); s.players[0].x = 5; s.players[0].z = 5;
    infernoRules.step(s, {}, 15000);
    expect(s.phase).toBe('over'); expect(s.players[0].alive).toBe(false);
    expect(infernoRules.result(s).placements[0].contestantId).toBe('bot');
    expect(infernoRules.drainEvents(s).some(e => e.type === 'eliminated')).toBe(true);
    expect(infernoRules.drainEvents(s)).toEqual([]);
  });
  it('ties safe survivors at the configured time limit', () => {
    const s = fresh(); s.tiles = s.tiles.map(t => t === 'edge' ? t : 'rock');
    for (const p of s.players) s.tiles[index(p.x, p.z)] = 'floor';
    s.tiles[index(5, 5)] = 'floor';
    infernoRules.step(s, {}, 105000);
    expect(s.phase).toBe('over'); expect(infernoRules.result(s).placements.map(p => p.place)).toEqual([1, 1]);
  });
  it('runs bot matches to completion reproducibly without illegal positions', () => {
    const run = () => {
      const s = infernoRules.init(people, 19, { prepMs: 1000, huntMs: 3000 });
      const bot = createInfernoBot(); const rng = seededRng(12);
      for (let i = 0; i < 300 && !infernoRules.isOver(s); i++) {
        infernoRules.step(s, Object.fromEntries(people.map(c => [c.id, bot.decide(s, c, 16, rng)])), 16);
        for (const p of s.players) expect(s.tiles[index(p.x, p.z)]).toBe('floor');
        infernoRules.drainEvents(s);
      }
      expect(s.phase).toBe('over'); return infernoRules.result(s);
    };
    expect(run()).toEqual(run());
  });
});
