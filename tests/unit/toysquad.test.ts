import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { squadRules, rollShop, boardLimit, deploymentPosition, type Battle, type SquadInput, type SquadState } from '../../src/minigames/toysquad/rules';
import { ROSTER, RARITIES, SHOP_ODDS, UNIT_POOLS, PASSIVES } from '../../src/minigames/toysquad/catalogue';
import { makeFighters, pathStep, tickBattle } from '../../src/minigames/toysquad/combat';
import { boardToWorld, worldToDeployment } from '../../src/minigames/toysquad/board';
import { createSquadBot } from '../../src/minigames/toysquad/bot';
const people: Contestant[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Toy ${i}`, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: i === 0, bot: 'normal' }));
const fresh = () => squadRules.init(people, 123);
const send = (s: SquadState, ...inputs: SquadInput[]) => squadRules.step(s, { p0: inputs }, 1);
function buy(s: SquadState, kind = 'soldier') { s.players[0].shop[0] = kind; send(s, { type: 'buy', slot: 0 }); return s.players[0].units.at(-1)!; }
function battle(home = 'soldier', away = 'robot'): Battle {
  const b: Battle = { owner: 'p0', opponent: 'p1', fighters: [
    ...makeFighters([{ id: 1, kind: home, tier: 1, cell: 0 }], 0, []), ...makeFighters([{ id: 2, kind: away, tier: 1, cell: 0 }], 1, []),
  ], done: false, outcome: null, health: 0, attacks: [], damages: [], tick: 0, homePassives: [], awayPassives: [] };
  // These legacy attack tests isolate base attacks from the newly added start passives.
  b.fighters.forEach(u => { u.shield = 0; u.magic.buffs = []; }); return b;
}
describe('Toy Squad catalogue and shop', () => {
  it('ships exactly 62 distinct named options in the requested rarity counts', () => {
    expect(Object.keys(ROSTER)).toHaveLength(62);
    expect(UNIT_POOLS.map(p => p.length)).toEqual([16, 14, 13, 12, 7]);
    expect(new Set(Object.values(ROSTER).map(d => d.name)).size).toBe(62);
    Object.values(ROSTER).forEach(d => { expect(d.cost).toBe(RARITIES.indexOf(d.rarity) + 1); expect(d.role.length).toBeGreaterThan(10); });
  });
  it('preserves the exact 10-row rarity table', () => {
    expect(SHOP_ODDS).toEqual([[80,20,0,0,0],[70,30,0,0,0],[55,35,10,0,0],[45,40,15,0,0],[35,40,25,0,0],[25,35,35,5,0],[20,30,40,10,0],[18,24,35,20,3],[15,21,30,28,6],[12,18,28,32,10]]);
    SHOP_ODDS.forEach(row => expect(row.reduce((n, p) => n + p, 0)).toBe(100));
  });
  it('rolls five repeatable offers with no impossible rarities, matching level-10 frequencies', () => {
    expect(rollShop(42, 8)).toEqual(rollShop(42, 8));
    const counts = [0,0,0,0,0];
    for (let seed = 0; seed < 10000; seed++) {
      for (const k of rollShop(seed, 1)) expect(['Common', 'Uncommon']).toContain(ROSTER[k].rarity);
      for (const k of rollShop(seed, 10)) counts[RARITIES.indexOf(ROSTER[k].rarity)]++;
    }
    counts.forEach((n, i) => expect(Math.abs(n / 50000 * 100 - SHOP_ODDS[9][i])).toBeLessThan(1));
  });
  it('only buys stocked slots and charges for a reroll without leaking currency', () => {
    const s = fresh(); s.players[0].shop[0] = 'soldier';
    send(s, { type: 'buy', slot: 0 }); expect(s.players[0].coins).toBe(9);
    send(s, { type: 'buy', slot: 0 }, { type: 'buy', slot: -1 }); expect(s.players[0].coins).toBe(9);
    send(s, { type: 'reroll' }); expect(s.players[0].coins).toBe(7); expect(s.players[0].shop.every(Boolean)).toBe(true);
    s.players[0].coins = 1; const before = [...s.players[0].shop]; send(s, { type: 'reroll' }); expect(s.players[0].shop).toEqual(before);
  });
  it('starts at level 1 with 3 board slots; reserves hold purchases beyond the board cap', () => {
    const s = fresh(); for (let i = 0; i < 5; i++) buy(s);
    expect(s.players[0].level).toBe(1); expect(s.players[0].units.filter(u => u.cell >= 0)).toHaveLength(3);
    expect(s.players[0].units.filter(u => u.cell < 0)).toHaveLength(2);
    const reserve = s.players[0].units[3]; send(s, { type: 'move', unit: reserve.id, cell: 31 }); expect(reserve.cell).toBe(-1);
    send(s, { type: 'move', unit: reserve.id, cell: 0 }); // identical stars merge instead of exceeding the cap
    expect(s.players[0].units.find(u => u.cell === 0)!.tier).toBe(2);
    expect(Array.from({ length: 10 }, (_, i) => boardLimit(i + 1))).toEqual([3,4,5,6,7,8,9,10,10,10]);
  });
  it('rejects purchases beyond a full board and eight reserves without charging', () => {
    const s = fresh(); s.players[0].coins = 100;
    for (let i = 0; i < 11; i++) buy(s, i % 2 ? 'robot' : 'soldier');
    const before = s.players[0].coins; buy(s);
    expect(s.players[0].units).toHaveLength(11); expect(s.players[0].coins).toBe(before); expect(s.players[0].shop[0]).toBe('soldier');
  });
});
describe('Toy Squad merges, placement and passives', () => {
  it('combines two copies at equal stars, including reserves, up to exactly 3 stars', () => {
    const s = fresh(); const a = buy(s), b = buy(s), c = buy(s), d = buy(s);
    send(s, { type: 'move', unit: b.id, cell: a.cell }); expect(a.tier).toBe(2);
    send(s, { type: 'merge', unit: d.id, other: c.id }); expect(c.tier).toBe(2);
    send(s, { type: 'merge', unit: c.id, other: a.id }); expect(a.tier).toBe(3); expect(s.players[0].units).toHaveLength(1);
    const extra = buy(s); extra.tier = 3; send(s, { type: 'merge', unit: extra.id, other: a.id });
    expect(a.tier).toBe(3); expect(s.players[0].units).toHaveLength(2);
  });
  it('does not merge different kinds/stars or other owners; legal nonmatches swap', () => {
    const s = fresh(); const a = buy(s), b = buy(s, 'robot');
    send(s, { type: 'merge', unit: a.id, other: b.id }); expect(s.players[0].units).toHaveLength(2);
    send(s, { type: 'move', unit: a.id, cell: b.cell }); expect([a.cell,b.cell]).toEqual([1,0]);
    b.kind = a.kind; b.tier = 2; send(s, { type: 'merge', unit: b.id, other: a.id }); expect(a.tier).toBe(1);
    send(s, { type: 'merge', unit: 999, other: a.id }); expect(s.players[0].units).toHaveLength(2);
  });
  it('validates all 32 deployment squares and rejects enemy/outside drop coordinates', () => {
    for (let c = 0; c < 32; c++) { const p = deploymentPosition(c, 0); expect(worldToDeployment(boardToWorld(p.x), boardToWorld(p.z))).toBe(c); }
    expect(worldToDeployment(boardToWorld(2), boardToWorld(3))).toBeNull();
    expect(worldToDeployment(boardToWorld(8), boardToWorld(5))).toBeNull();
    const s = fresh(), u = buy(s); send(s, { type: 'move', unit: u.id, cell: 31 }); expect(u.cell).toBe(31);
    send(s, { type: 'move', unit: u.id, cell: 32 }); expect(u.cell).toBe(31);
  });
  it('chooses one offered passive, rejects arbitrary/repeated picks, and locks ready until chosen', () => {
    const s = fresh(), p = s.players[0]; p.passiveOffers = ['padding','springs','bargain'];
    send(s, { type: 'ready' }); expect(p.ready).toBe(false);
    send(s, { type: 'passive', passive: 'bubble' }); expect(p.passives).toEqual([]);
    send(s, { type: 'passive', passive: 'padding' }, { type: 'passive', passive: 'padding' }); expect(p.passives).toEqual(['padding']);
    send(s, { type: 'ready' }); expect(p.ready).toBe(true);
    const before = p.coins; send(s, { type: 'reroll' }); expect(p.coins).toBe(before);
  });
  it('passive stats, shields and discounted rerolls have real effects', () => {
    const [u] = makeFighters([{ id: 1, kind: 'soldier', tier: 2, cell: 0 }], 0, ['padding','springs','polish','bubble','vanguard']);
    expect(u.maxHp).toBe(ROSTER.soldier.hp * 2 + 10); expect(u.bonusDamage).toBe(1); expect(u.armour).toBe(1); expect(u.shield).toBe(9); // Bubble + two-star Parade Discipline
    const s = fresh(); s.players[0].passives = ['bargain']; send(s, { type: 'reroll' }); expect(s.players[0].coins).toBe(9);
  });
  it('runs ten rounds, levels once per round and offers passives only on rounds 3/6/9', () => {
    const s = squadRules.init(people.slice(0,1), 42, { buildMs: 10, battleMs: 10, tickMs: 5, recapMs: 5 });
    const rounds: number[] = [];
    while (s.phase !== 'over') {
      if (s.phase === 'build' && s.players[0].passiveOffers.length) { rounds.push(s.round); send(s, { type: 'passive', passive: s.players[0].passiveOffers[0] }); }
      squadRules.step(s, {}, 5);
    }
    expect(s.round).toBe(10); expect(s.players[0].level).toBe(10); expect(rounds).toEqual([3,6,9]); expect(new Set(s.players[0].passives).size).toBe(3);
  });
  it('auto-selects a remaining passive at the deadline and grants allowance on subsequent rounds', () => {
    const s = squadRules.init(people.slice(0,1), 1, { buildMs: 10, battleMs: 10, tickMs: 5, recapMs: 5 });
    s.players[0].passiveOffers = ['allowance']; squadRules.step(s, {}, 10);
    expect(s.players[0].passives).toEqual(['allowance']); squadRules.step(s, {}, 20);
    expect(s.players[0].coins).toBe(22);
  });
});
describe('Toy Squad combat and corpse handling', () => {
  it('walks through a dead blocker and around a living blocker', () => {
    const b = battle(); const [u,e] = b.fighters; u.x = 0; u.z = 0; e.x = 6; e.z = 0;
    const corpse = { ...u, id: 3, x: 1, z: 0, hp: 0 };
    expect(pathStep(u, e, [u,e,corpse])).toEqual({ x: 1, z: 0 });
    const step = pathStep(u, e, [u,e,{ ...corpse, hp: 10 }])!;
    expect(step).not.toEqual({ x: 1, z: 0 });
  });
  it('resolves contested movement without overlap or permanent waiting', () => {
    const b = battle('soldier','soldier'); b.fighters[0].x = 0; b.fighters[0].z = 0; b.fighters[1].x = 2; b.fighters[1].z = 0;
    const before = b.fighters.map(u => [u.x,u.z]); tickBattle(b);
    expect(b.fighters.map(u => [u.x,u.z])).not.toEqual(before);
    expect(new Set(b.fighters.filter(u => u.hp > 0).map(u => `${u.x},${u.z}`)).size).toBe(2);
    for (let i = 0; i < 40 && !b.done; i++) tickBattle(b); expect(b.done).toBe(true);
  });
  it('applies mutually lethal hits simultaneously and emits damage/facing metadata', () => {
    const b = battle('soldier','soldier'); b.fighters.forEach(u => { u.hp = 1; });
    tickBattle(b); expect(b.outcome).toBe('draw'); expect(b.damages).toHaveLength(2); expect(b.attacks).toHaveLength(2);
    expect(b.fighters[0].facing).toBe(Math.PI); expect(b.fighters[1].facing).toBe(0);
  });
  it('armour and shields reduce damage without preventing all damage forever', () => {
    const b = battle(); b.fighters[1].shield = 2; const before = b.fighters[1].hp; tickBattle(b);
    expect(b.fighters[1].hp).toBe(before); expect(b.fighters[1].shield).toBe(0);
    tickBattle(b); expect(b.fighters[1].hp).toBeLessThan(before);
  });
  it('poison, stun, healing and execution each affect combat', () => {
    const poison = battle('rubber-frog'); tickBattle(poison); expect(poison.fighters[1].poison).toBe(3);
    const stun = battle('domino-drummer'); stun.fighters[0].attacks = 2; tickBattle(stun); expect(stun.fighters[1].stunnedUntil).toBe(2);
    const heal = battle('paper-medic'); heal.fighters[0].attacks = 2; heal.fighters[0].hp = 3; tickBattle(heal); expect(heal.fighters[0].hp).toBeGreaterThan(3);
    const execute = battle('felt-fox'); execute.fighters[1].hp = 6; tickBattle(execute); expect(execute.fighters[1].hp).toBe(1);
  });
  it('cleave/splash/chain can hit an additional enemy, while single-target attacks cannot', () => {
    for (const kind of ['spool-spinner','crayon-cannon','marble-slinger']) {
      const b = battle(kind, 'soldier'); b.fighters.push({ ...b.fighters[1], id: 3, x: 1 });
      tickBattle(b); expect(b.damages.some(h => h.unit === 3)).toBe(true);
    }
  });
  it('piercing ignores armour and hits behind the primary target; fury and drain have distinct effects', () => {
    const pierce = battle('quill-quarreller', 'soldier'); pierce.fighters[1].armour = 100;
    pierce.fighters.push({ ...pierce.fighters[1], id: 3, z: 2 }); tickBattle(pierce);
    expect(pierce.damages.find(h => h.unit === 2)!.amount).toBe(6);
    expect(pierce.damages.find(h => h.unit === 3)!.amount).toBe(3);
    const fury = battle('button-brawler'); fury.fighters[0].attacks = 2; tickBattle(fury);
    expect(fury.damages.find(h => h.unit === 2)!.amount).toBe(3);
    const drain = battle('copper-bat'); drain.fighters[0].hp = 3; tickBattle(drain);
    expect(drain.fighters[0].hp).toBe(2);
  });
  it('repair, backline, range, siphon and encore passives affect their stated conditions', () => {
    const [back] = makeFighters([{ id: 1, kind: 'hare', tier: 1, cell: 24 }], 0, ['backline','sights']);
    expect(back.bonusDamage).toBe(1); expect(back.range).toBe(4);
    const b = battle('soldier','soldier'); b.homePassives = ['repairs','siphon','encore']; b.tick = 3;
    b.fighters[0].attacks = 3; b.fighters[0].hp = 8; tickBattle(b);
    expect(b.damages.find(h => h.unit === 2)!.amount).toBe(5);
    expect(b.fighters[0].hp).toBe(8); // -3 incoming, +2 repair, +1 siphon
  });
  it('bots complete ten rounds with valid limits, merges, passives and repeatable results', () => {
    const run = () => {
      const s = squadRules.init(people, 18, { buildMs: 3000, battleMs: 4000, recapMs: 100 }); const bot = createSquadBot(), rng = seededRng(77);
      for (let i = 0; i < 10000 && s.phase !== 'over'; i++) {
        squadRules.step(s, Object.fromEntries(people.map(p => [p.id, bot.decide(s,p,16,rng)])), 16); squadRules.drainEvents(s);
        for (const p of s.players) { expect(p.coins).toBeGreaterThanOrEqual(0); expect(p.units.filter(u => u.cell >= 0).length).toBeLessThanOrEqual(boardLimit(p.level)); expect(new Set(p.units.map(u => u.cell)).size).toBe(p.units.length); }
      }
      expect(s.phase).toBe('over'); expect(s.round).toBe(10); expect(s.players.every(p => p.passives.length === 3)).toBe(true); return squadRules.result(s);
    };
    expect(run()).toEqual(run());
  });
  it('split-step timing and results remain deterministic without inputs', () => {
    const a = fresh(), b = fresh(); squadRules.step(a, {}, 50000); for (let i = 0; i < 5000; i++) squadRules.step(b, {}, 10); expect(a).toEqual(b);
    expect(Object.keys(PASSIVES)).toHaveLength(12);
  });
});
