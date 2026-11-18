import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { squadRules, tickBattle, deploymentPosition, type Battle, type SquadInput, type SquadState } from '../../src/minigames/toysquad/rules';
import { boardToWorld, worldToDeployment } from '../../src/minigames/toysquad/board';
import { createSquadBot } from '../../src/minigames/toysquad/bot';
const people: Contestant[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Toy ${i}`, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: i === 0, bot: 'normal' }));
const fresh = () => squadRules.init(people, 123);
const send = (s: SquadState, ...inputs: SquadInput[]) => squadRules.step(s, { p0: inputs }, 1);

describe('Toy Squad', () => {
  it('deploys across all 32 home squares on an 8×8 board and rejects enemy/outside drops', () => {
    for (let cell = 0; cell < 32; cell++) {
      const home = deploymentPosition(cell, 0), away = deploymentPosition(cell, 1);
      expect(home.x).toBeGreaterThanOrEqual(0); expect(home.x).toBeLessThan(8);
      expect(home.z).toBeGreaterThanOrEqual(4); expect(home.z).toBeLessThan(8);
      expect(away.z).toBe(7 - home.z);
      expect(worldToDeployment(boardToWorld(home.x), boardToWorld(home.z))).toBe(cell);
    }
    expect(worldToDeployment(boardToWorld(2), boardToWorld(3))).toBeNull();
    expect(worldToDeployment(boardToWorld(8), boardToWorld(5))).toBeNull();
    const s = fresh(); send(s, { type: 'buy', kind: 'soldier' });
    send(s, { type: 'move', unit: 1, cell: 31 }); expect(s.players[0].units[0].cell).toBe(31);
    send(s, { type: 'move', unit: 1, cell: 32 }); expect(s.players[0].units[0].cell).toBe(31);
  });
  it('buys within budget and board capacity, rejecting invalid kinds', () => {
    const s = fresh(); send(s, { type: 'buy', kind: 'soldier' }, { type: 'buy', kind: 'hare' }, { type: 'buy', kind: 'robot' });
    expect(s.players[0].units).toHaveLength(2); expect(s.players[0].coins).toBe(3);
    send(s, { type: 'buy', kind: 'nope' as 'hare' }); expect(s.players[0].coins).toBe(3);
    s.players[0].coins = 100;
    for (let i = 0; i < 10; i++) send(s, { type: 'buy', kind: 'soldier' });
    expect(s.players[0].units).toHaveLength(6); expect(new Set(s.players[0].units.map(u => u.cell)).size).toBe(6);
  });
  it('moves, swaps and upgrades owned units with level and currency limits', () => {
    const s = fresh(); send(s, { type: 'buy', kind: 'soldier' }, { type: 'buy', kind: 'robot' });
    const [a, b] = s.players[0].units;
    send(s, { type: 'move', unit: a.id, cell: 1 }); expect([a.cell, b.cell]).toEqual([1, 0]);
    send(s, { type: 'move', unit: a.id, cell: 2.5 }); expect(a.cell).toBe(1);
    send(s, { type: 'upgrade', unit: a.id }); expect(a.tier).toBe(2); expect(s.players[0].coins).toBe(0);
    send(s, { type: 'upgrade', unit: a.id }); expect(a.tier).toBe(2);
    s.players[0].coins = 20;
    send(s, { type: 'upgrade', unit: a.id }, { type: 'upgrade', unit: a.id }); expect(a.tier).toBe(3);
    send(s, { type: 'upgrade', unit: 999 }); expect(s.players[0].coins).toBe(17);
  });
  it('sells for a partial refund without creating a buy/sell currency exploit', () => {
    const s = fresh(); send(s, { type: 'buy', kind: 'soldier' }); const id = s.players[0].units[0].id;
    send(s, { type: 'sell', unit: id }, { type: 'sell', unit: id });
    expect(s.players[0].coins).toBe(9); expect(s.players[0].units).toEqual([]);
  });
  it('locks ready squads, auto-starts on deadline, snapshots opponents and supports odd fields', () => {
    const s = fresh(); send(s, { type: 'buy', kind: 'soldier' }, { type: 'ready' }, { type: 'sell', unit: 1 });
    expect(s.players[0].units).toHaveLength(1);
    squadRules.step(s, {}, 30000); expect(s.phase).toBe('battle'); expect(s.battles).toHaveLength(3);
    expect(s.battles.every(b => b.owner !== b.opponent)).toBe(true);
    const home = s.battles.find(b => b.owner === 'p0')!.fighters.find(u => u.side === 0)!;
    home.hp = 1; expect(s.players[0].units[0].tier).toBe(1);
  });
  it('applies simultaneous attacks and ties mutual eliminations', () => {
    const b: Battle = { owner: 'p0', opponent: 'p1', done: false, outcome: null, health: 0, fighters: [
      { id: 1, kind: 'soldier', tier: 1, side: 0, x: 3, z: 0, hp: 2, maxHp: 8 },
      { id: 2, kind: 'soldier', tier: 1, side: 1, x: 4, z: 0, hp: 2, maxHp: 8 },
    ] };
    tickBattle(b); expect(b.fighters.map(u => u.hp)).toEqual([0, 0]); expect(b.outcome).toBe('draw');
    expect(b.fighters.map(u => u.facing)).toEqual([Math.PI / 2, -Math.PI / 2]);
    expect(b.attacks).toHaveLength(2); expect(b.attacks![0]).toMatchObject({ from: 1, to: 2, x: 3, tx: 4 });
  });
  it('closes a gap and fights without overlap or first-side bias', () => {
    const b: Battle = { owner: 'p0', opponent: 'p1', done: false, outcome: null, health: 0, fighters: [
      { id: 1, kind: 'soldier', tier: 1, side: 0, x: 2, z: 0, hp: 8, maxHp: 8 },
      { id: 2, kind: 'soldier', tier: 1, side: 1, x: 6, z: 0, hp: 8, maxHp: 8 },
    ] };
    for (let i = 0; i < 20; i++) { tickBattle(b); expect(b.fighters[0].x).toBeLessThan(b.fighters[1].x); }
    expect(b.done).toBe(true); expect(b.outcome).toBe('draw');
  });
  it('a ranged unit attacks before a melee opponent enters melee range', () => {
    const b: Battle = { owner: 'p0', opponent: 'p1', done: false, outcome: null, health: 0, fighters: [
      { id: 1, kind: 'hare', tier: 1, side: 0, x: 2, z: 0, hp: 5, maxHp: 5 },
      { id: 2, kind: 'soldier', tier: 1, side: 1, x: 5, z: 0, hp: 8, maxHp: 8 },
    ] };
    tickBattle(b); expect(b.fighters.map(u => u.hp)).toEqual([5, 7]);
  });
  it('a lone ranged unit needs protection against an advancing durable robot', () => {
    const b: Battle = { owner: 'p0', opponent: 'p1', done: false, outcome: null, health: 0, fighters: [
      { id: 1, kind: 'hare', tier: 1, side: 0, x: 2, z: 0, hp: 5, maxHp: 5 },
      { id: 2, kind: 'robot', tier: 1, side: 1, x: 5, z: 0, hp: 14, maxHp: 14 },
    ] };
    for (let i = 0; i < 40 && !b.done; i++) tickBattle(b);
    expect(b.outcome).toBe('loss');
  });
  it('runs solo against clockwork opponents, keeps the squad and pays next-round income once', () => {
    const s = squadRules.init(people.slice(0, 1), 1, { battleMs: 1000, recapMs: 100 });
    send(s, { type: 'buy', kind: 'soldier' }, { type: 'ready' });
    expect(s.phase).toBe('battle'); expect(s.battles[0].opponent).toBe('clockwork');
    const before = s.players[0].coins; squadRules.step(s, {}, 1100);
    expect(s.phase).toBe('build'); expect(s.round).toBe(2);
    expect(s.players[0].coins).toBe(before + 10); expect(s.players[0].units).toHaveLength(1);
  });
  it('splits elapsed time at phase/combat boundaries deterministically', () => {
    const a = fresh(), b = fresh();
    squadRules.step(a, {}, 80000);
    for (let i = 0; i < 8000; i++) squadRules.step(b, {}, 10);
    expect(a).toEqual(b);
  });
  it('ranks by points then accumulated surviving health and preserves exact ties', () => {
    const s = fresh(); s.players[0].points = 6; s.players[1].points = 6; s.players[2].points = 3;
    s.players[1].health = 10;
    expect(squadRules.result(s).placements.map(p => p.contestantId)).toEqual(['p1', 'p0', 'p2']);
    s.players[0].health = 10; expect(squadRules.result(s).placements.map(p => p.place)).toEqual([1, 1, 3]);
  });
  it('bots complete repeatable three-round matches, with valid owned formations', () => {
    const run = () => {
      const s = squadRules.init(people, 12, { buildMs: 5000, battleMs: 12000, recapMs: 100 });
      const bot = createSquadBot(); const rng = seededRng(23);
      for (let i = 0; i < 4000 && s.phase !== 'over'; i++) {
        squadRules.step(s, Object.fromEntries(people.map(c => [c.id, bot.decide(s, c, 16, rng)])), 16);
        squadRules.drainEvents(s);
      }
      expect(s.phase).toBe('over'); expect(s.round).toBe(3);
      for (const p of s.players) { expect(p.coins).toBeGreaterThanOrEqual(0); expect(new Set(p.units.map(u => u.cell)).size).toBe(p.units.length); }
      return squadRules.result(s);
    };
    expect(run()).toEqual(run());
  });
});
