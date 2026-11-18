import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/minigames/toysquad/catalogue';
import { UNIT_KITS, type KitEffect } from '../../src/minigames/toysquad/kits';
import { makeFighters, tickBattle } from '../../src/minigames/toysquad/combat';
import { applySupport, buffValue, effectsFor, traitCounts } from '../../src/minigames/toysquad/spellcraft';
import type { Battle, Fighter } from '../../src/minigames/toysquad/rules';

function arena(home = ['soldier'], away = ['robot']): Battle {
  const team = (kinds: string[], side: 0 | 1) => makeFighters(kinds.map((kind, cell) => ({ id: (side ? 100 : 1) + cell, kind, tier: 1, cell })), side, []);
  const b: Battle = { owner: 'a', opponent: 'b', fighters: [...team(home, 0), ...team(away, 1)], done: false, outcome: null, health: 0, attacks: [], damages: [], tick: 0, homePassives: [], awayPassives: [] };
  b.fighters.forEach(u => { u.hp = u.maxHp = 500; u.shield = 0; }); return b;
}
const full = (u: Fighter) => { u.magic.mana = u.magic.maxMana; };
const effect = (type: KitEffect['type'], amount: number, options: Partial<KitEffect> = {}): KitEffect => ({ type, target: 'target', amount, ...options });

describe('individual Toy Squad kits', () => {
  it('gives all 62 units two traits, a distinct named passive and a distinct named spell with valid effects', () => {
    expect(Object.keys(UNIT_KITS).sort()).toEqual(Object.keys(ROSTER).sort());
    expect(new Set(Object.values(ROSTER).map(d => d.passive.name)).size).toBe(62);
    expect(new Set(Object.values(ROSTER).map(d => d.spell.name)).size).toBe(62);
    for (const d of Object.values(ROSTER)) {
      expect(new Set(d.traits).size).toBe(2); expect(d.passive.effects.length).toBeGreaterThan(0);
      expect(d.spell.effects.length).toBeGreaterThan(0); expect(d.spell.mana).toBeGreaterThanOrEqual(60);
      expect(d.spell.cooldown).toBeGreaterThanOrEqual(6);
      expect(d.passive.description.length).toBeGreaterThan(20); expect(d.spell.description.length).toBeGreaterThan(20);
      for (const f of [...d.passive.effects, ...d.spell.effects]) {
        if (f.type === 'buff') expect(f.stat).toBeTruthy();
        if (f.target === 'traitAllies') expect(f.trait).toBeTruthy();
      }
    }
  });
  it('casts every authored spell, spends mana and emits the spell name for rendering', () => {
    for (const kind of Object.keys(ROSTER)) {
      const b = arena([kind], ['robot', 'robot']); const u = b.fighters[0]; full(u); tickBattle(b);
      expect(u.magic.casts, kind).toBe(1); expect(u.magic.mana, kind).toBeLessThan(u.magic.maxMana);
      expect(b.attacks.some(a => a.from === u.id && a.spell === ROSTER[kind].spell.name), kind).toBe(true);
      expect(u.attacks, kind).toBe(0); // A cast replaces the basic attack this tick.
    }
  });
  it('gains mana through attacks and health loss, then casts automatically; cooldown prevents loops', () => {
    const b = arena(); const u = b.fighters[0];
    tickBattle(b); expect(u.magic.mana).toBe(28);
    tickBattle(b); tickBattle(b); expect(u.magic.mana).toBe(60);
    tickBattle(b); expect(u.magic.casts).toBe(1); expect(u.magic.nextCast).toBe(10);
    full(u); tickBattle(b); expect(u.magic.casts).toBe(1);
    while (b.tick < 10) { full(u); tickBattle(b); }
    expect(u.magic.casts).toBe(2);
  });
  it('silence blocks spells but allows attacks; stun and death block both', () => {
    const b = arena(); const u = b.fighters[0]; full(u); u.magic.silencedUntil = 2;
    tickBattle(b); expect(u.magic.casts).toBe(0); expect(u.attacks).toBe(1);
    u.stunnedUntil = 2; tickBattle(b); expect(u.attacks).toBe(1);
    tickBattle(b); expect(u.magic.casts).toBe(1);
    const dead = arena(['soldier', 'hare']); dead.fighters[0].hp = 0; full(dead.fighters[0]); tickBattle(dead);
    expect(dead.fighters[0].magic.casts).toBe(0); expect(dead.fighters[0].attacks).toBe(0);
  });
  it('damages only enemies inside an AoE and scales spell damage with stars', () => {
    const run = (tier: number) => {
      const b = arena(['bead-bomber'], ['robot', 'robot', 'robot']); const u = b.fighters[0]; u.tier = tier;
      b.fighters[3].x = 7; full(u); tickBattle(b); return b;
    };
    const b = run(1); expect(b.damages.filter(d => d.unit >= 100).map(d => d.unit)).toEqual([100, 101]);
    expect(run(2).damages.find(d => d.unit === 100)!.amount).toBe(21); // 22 minus robot armour.
    expect(b.damages.find(d => d.unit === 100)!.amount).toBe(10);
  });
  it('supports a line through multiple targets and ignores off-line enemies', () => {
    const b = arena(['pencil-lancer'], ['robot', 'robot', 'robot']); const [u, a, c, off] = b.fighters;
    Object.assign(u, { x: 0, z: 7 }); Object.assign(a, { x: 0, z: 6 }); Object.assign(c, { x: 0, z: 4 }); Object.assign(off, { x: 3, z: 4 });
    full(u); tickBattle(b); expect(b.damages.filter(d => d.unit >= 100).map(d => d.unit)).toEqual([100, 101]);
    expect(b.damages.find(d => d.unit === 100)!.amount).toBe(12);
  });
  it('lets marks set up stronger follow-up damage for a different ally', () => {
    const run = (marked: boolean) => {
      const b = arena(['paper-panther','felt-fox']); const [u, , target] = b.fighters;
      if (marked) { target.magic.markedUntil = 8; target.magic.markPower = 2; }
      tickBattle(b); return { damage: b.damages.find(d => d.unit === target.id)!.amount, bonus: u.magic.markBonus };
    };
    const plain = run(false), marked = run(true); expect(marked.bonus).toBe(1); expect(marked.damage).toBeGreaterThan(plain.damage + 2);
  });
  it('heals and shields living allies, never resurrecting a defeated one', () => {
    const b = arena(['celestial-seamstress','soldier','hare']); const [u, living, dead] = b.fighters;
    living.hp = 10; dead.hp = 0; full(u); tickBattle(b);
    expect(living.hp).toBeGreaterThan(10); expect(living.shield).toBeGreaterThan(0); expect(dead.hp).toBe(0); expect(dead.shield).toBe(0);
    const vfx = b.attacks.find(a => a.from === u.id && a.spell)!;
    expect([vfx.tx,vfx.tz]).toEqual([u.x,u.z]); // Support spell particles centre on the caster.
  });
  it('cleanses negative conditions and debuffs without removing positive buffs', () => {
    const b = arena(); const [u, v] = b.fighters;
    applySupport(effectsFor(u, v, [effect('buff', -2, { stat: 'armour', duration: 4 }), effect('buff', 2, { stat: 'damage', duration: 4 })], b.fighters, 1, 'test'), 1);
    Object.assign(v, { poison: 4, stunnedUntil: 8 }); Object.assign(v.magic, { poisonPower: 3, silencedUntil: 8, markedUntil: 8, markPower: 3 });
    applySupport(effectsFor(u, v, [effect('cleanse',0)], b.fighters, 1, 'clean'), 1);
    expect([v.poison, v.stunnedUntil, v.magic.silencedUntil, v.magic.markedUntil]).toEqual([0,0,0,0]);
    expect(buffValue(v,'armour',1)).toBe(0); expect(buffValue(v,'damage',1)).toBe(2);
  });
  it('spell poison, AoE stun and silence keep their durations and permit cleansing', () => {
    const poison = arena(['rubber-frog'], ['robot','robot']); full(poison.fighters[0]); tickBattle(poison);
    expect(poison.fighters[1].poison).toBe(5); expect(poison.fighters[2].magic.poisonPower).toBe(2);
    tickBattle(poison); expect(poison.damages.some(d => d.unit === 101 && d.amount === 2)).toBe(true);
    const stun = arena(['pendulum-paladin'], ['robot','robot']); full(stun.fighters[0]); tickBattle(stun);
    const attacks = stun.fighters[1].attacks; tickBattle(stun); expect(stun.fighters[1].attacks).toBe(attacks);
    const silence = arena(['clockwork-mouse']); full(silence.fighters[0]); tickBattle(silence); full(silence.fighters[1]); tickBattle(silence);
    expect(silence.fighters[1].magic.casts).toBe(0); expect(silence.fighters[1].attacks).toBe(2);
  });
  it('refreshes temporary buffs rather than stacking the same source, expires them, and caps haste', () => {
    const b = arena(); const [u, v] = b.fighters;
    const request = effectsFor(u, v, [effect('buff', 2, { stat:'damage', duration:3 })], b.fighters, 1, 'same');
    applySupport(request,1); applySupport(request,2); expect(v.magic.buffs).toHaveLength(1);
    expect(buffValue(v,'damage',5)).toBe(2); expect(buffValue(v,'damage',6)).toBe(0);
    for (let i=0;i<5;i++) applySupport(effectsFor(u,v,[effect('buff',1,{stat:'haste'})],b.fighters,1,`buff${i}`),1);
    expect(buffValue(v,'haste',1)).toBe(1);
  });
  it('haste adds alternating attacks, slow removes alternating attacks and neither prevents movement', () => {
    const run = (amount: number) => { const b = arena(); const u = b.fighters[0]; u.magic.buffs.push({ key:'test',stat:'haste',amount,until:8 }); tickBattle(b); tickBattle(b); return u.attacks; };
    expect(run(1)).toBe(3); expect(run(0)).toBe(2); expect(run(-1)).toBe(1);
  });
  it('triggers attack, hurt, cast and once-only wounded passives', () => {
    const attack = arena(['button-brawler']); attack.fighters[0].attacks = 2; tickBattle(attack); expect(attack.fighters[0].shield).toBe(3);
    const hurt = arena(['robot']); tickBattle(hurt); expect(hurt.fighters[0].magic.mana).toBe(36); // 20 attack +8 damage +8 core.
    const cast = arena(['spool-spinner','soldier']); full(cast.fighters[0]); tickBattle(cast); expect(cast.fighters[1].magic.mana).toBeGreaterThanOrEqual(28);
    const wounded = arena(['felt-fox']); wounded.fighters[0].hp = 100; tickBattle(wounded); expect(wounded.fighters[0].shield).toBe(7);
    wounded.fighters[0].shield = 0; tickBattle(wounded); expect(wounded.fighters[0].shield).toBe(0);
  });
  it('counts distinct deployed kinds and applies 2/4 bonuses only to matching members', () => {
    const units = ['soldier','soldier','cap-captain','button-brawler','thimble-guard'].map((kind,cell) => ({ kind,cell }));
    expect(traitCounts([...units,{kind:'robot',cell:-1}])).toEqual({ Tin:4,Vanguard:3,Trickster:1 });
    const four = makeFighters([...units,{kind:'hare',cell:5}].map((u,id) => ({...u,id,tier:1})),0,[]);
    expect(four[0].armour).toBe(3); expect(four[0].shield).toBeGreaterThanOrEqual(4); expect(four.at(-1)!.armour).toBe(0);
    const two = makeFighters([{id:1,kind:'robot',cell:0,tier:1},{id:2,kind:'spool-spinner',cell:1,tier:1}],0,[]);
    expect(two[0].magic.mana).toBe(10); expect(two[1].magic.mana).toBe(10);
  });
  it('preserves deterministic, bounded combat for every kit and larger mixed formations', () => {
    const run = () => Object.keys(ROSTER).map(kind => { const b=arena([kind,'paper-medic'],['robot','cog-crab']); for(let i=0;i<50&&!b.done;i++)tickBattle(b); return b; });
    const first=run(); expect(run()).toEqual(first);
    for(const b of first) for(const u of b.fighters) { expect(Number.isFinite(u.hp)).toBe(true); expect(u.hp).toBeGreaterThanOrEqual(0); expect(u.magic.mana).toBeLessThanOrEqual(u.magic.maxMana); expect(u.magic.buffs.length).toBeLessThan(30); }
  });
});
