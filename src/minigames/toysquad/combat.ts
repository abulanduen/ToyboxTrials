import { ROSTER, type PassiveId } from './catalogue';
import type { Battle, Fighter, SquadUnit } from './rules';
import { applySupport, buffValue, distance, effectsFor, initMagic, type EffectRequest } from './spellcraft';

export function makeFighters(units: SquadUnit[], side: 0 | 1, passives: readonly PassiveId[]): Fighter[] {
  const fighters: Fighter[] = units.map(u => {
    const d = ROSTER[u.kind], front = Math.floor(u.cell / 8) < 2;
    const hp = d.hp * 2 ** (u.tier - 1) + (passives.includes('padding') ? 4 : 0) + (front && passives.includes('vanguard') ? 6 : 0);
    return { ...u, side, x: u.cell % 8, z: side === 0 ? 4 + Math.floor(u.cell / 8) : 3 - Math.floor(u.cell / 8), hp, maxHp: hp,
      facing: side === 0 ? Math.PI : 0, armour: d.armour + (passives.includes('polish') ? 1 : 0), shield: passives.includes('bubble') ? 5 : 0,
      poison: 0, stunnedUntil: 0, attacks: 0, bonusDamage: (passives.includes('springs') ? 1 : 0) + (!front && passives.includes('backline') ? 1 : 0),
      range: d.range + (d.range > 1 && passives.includes('sights') ? 1 : 0),
      magic: { mana: 0, maxMana: d.spell.mana, nextCast: 0, casts: 0, lastSpell: '', baseRange: 0, spellPower: 0, healPower: 0, attackMana: 0, markBonus: 0, poisonPower: 1, markedUntil: 0, markPower: 0, silencedUntil: 0, hurtCount: 0, wounded: false, buffs: [] } };
  });
  initMagic(fighters); return fighters;
}
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
/** Search to an attack square around the target. Only living units are obstacles. */
export function pathStep(unit: Fighter, target: Fighter, live: Fighter[]): { x: number; z: number } | null {
  const queue = [{ x: unit.x, z: unit.z, first: null as { x: number; z: number } | null }];
  const visited = new Set([`${unit.x},${unit.z}`]);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]; if (c.first && distance(c, target) <= unit.range) return c.first;
    for (const [dx, dz] of directions) {
      const n = { x: c.x + dx, z: c.z + dz }; const key = `${n.x},${n.z}`;
      if (n.x < 0 || n.x > 7 || n.z < 0 || n.z > 7 || visited.has(key) || live.some(p => p !== unit && p.hp > 0 && p.x === n.x && p.z === n.z)) continue;
      // No diagonal squeezing between two occupied orthogonal squares.
      if (dx && dz && live.some(p => p.hp > 0 && p.x === c.x + dx && p.z === c.z) && live.some(p => p.hp > 0 && p.x === c.x && p.z === c.z + dz)) continue;
      visited.add(key); queue.push({ ...n, first: c.first ?? n });
    }
  }
  return null;
}
function finish(b: Battle) {
  const home = b.fighters.filter(u => u.hp > 0 && u.side === 0), away = b.fighters.filter(u => u.hp > 0 && u.side === 1);
  if (home.length && away.length) return;
  b.done = true; b.outcome = home.length ? 'win' : away.length ? 'loss' : 'draw'; b.health = home.reduce((n, u) => n + u.hp, 0);
}
export function tickBattle(b: Battle) {
  if (b.done) return;
  b.tick++; b.attacks = []; b.damages = [];
  const hurt = new Set<Fighter>();
  for (const u of b.fighters) {
    u.magic.buffs = u.magic.buffs.filter(f => f.until >= b.tick);
    u.range = Math.max(1, u.magic.baseRange + buffValue(u, 'range', b.tick));
    if (u.magic.markedUntil < b.tick) u.magic.markPower = 0;
    if (!u.poison) u.magic.poisonPower = 1;
  }
  for (const u of b.fighters) if (u.hp > 0 && u.poison > 0) {
    const amount = u.magic.poisonPower;
    u.hp = Math.max(0, u.hp - amount); u.poison--; hurt.add(u); b.damages.push({ serial: b.tick * 1024 + b.damages.length, unit: u.id, x: u.x, z: u.z, amount });
  }
  finish(b); if (b.done) return;
  const live = b.fighters.filter(u => u.hp > 0);
  const hits: { source: Fighter; target: Fighter; amount: number; pierce: boolean; primary: boolean }[] = [];
  const heals = new Map<Fighter, number>(); const poison = new Set<Fighter>(), stuns = new Set<Fighter>();
  const moves: { unit: Fighter; x: number; z: number }[] = [];
  const requests: EffectRequest[] = [];
  const passive = (u: Fighter, target: Fighter, trigger: 'attack' | 'cast' | 'hurt' | 'wounded', count: number, into = requests) => {
    const p = ROSTER[u.kind].passive;
    if (p.trigger === trigger && count % p.every === 0) into.push(...effectsFor(u, target, p.effects, live, b.tick, 'passive'));
  };
  for (const u of live) {
    const passives = u.side === 0 ? b.homePassives : b.awayPassives;
    if (b.tick % 4 === 0 && passives.includes('repairs')) heals.set(u, 2);
    if (u.stunnedUntil >= b.tick) continue;
    const enemies = live.filter(e => e.side !== u.side).sort((a, c) => distance(u, a) - distance(u, c) || a.id - c.id);
    const target = enemies.find(e => distance(u, e) <= u.range) ?? enemies.find(e => pathStep(u, e, live)) ?? enemies[0];
    if (!target) continue;
    u.facing = Math.atan2(target.x - u.x, target.z - u.z);
    const def = ROSTER[u.kind];
    if (u.magic.mana >= u.magic.maxMana && u.magic.nextCast <= b.tick && u.magic.silencedUntil < b.tick) {
      u.magic.mana -= u.magic.maxMana; u.magic.nextCast = b.tick + def.spell.cooldown;
      u.magic.casts++; u.magic.lastSpell = def.spell.name;
      requests.push(...effectsFor(u, target, def.spell.effects, live, b.tick, 'spell'));
      passive(u, target, 'cast', u.magic.casts);
      const centre = def.spell.effects.some(f => ['target','nearEnemies','allEnemies','line','markedEnemies'].includes(f.target)) ? target : u;
      b.attacks.push({ serial: b.tick * 1024 + b.attacks.length, from: u.id, to: target.id, kind: u.kind, x: u.x, z: u.z, tx: centre.x, tz: centre.z, spell: def.spell.name, radius: Math.max(1, ...def.spell.effects.map(f => f.radius ?? 0)) });
      continue;
    }
    if (distance(u, target) > u.range) { const step = pathStep(u, target, live); if (step) moves.push({ unit: u, ...step }); continue; }
    const haste = buffValue(u, 'haste', b.tick);
    if (haste < 0 && b.tick % 2 === 0) continue;
    for (let swing = 0; swing < (haste > 0 && b.tick % 2 === 0 ? 2 : 1); swing++) {
      u.attacks++;
      u.magic.mana = Math.min(u.magic.maxMana, u.magic.mana + 20 + u.magic.attackMana);
      passive(u, target, 'attack', u.attacks);
      let amount = Math.max(1, def.damage * 2 ** (u.tier - 1) + u.bonusDamage + buffValue(u, 'damage', b.tick));
      if ((def.ability === 'execute' && target.hp < target.maxHp / 3) || (def.ability === 'fury' && u.attacks % 3 === 0)) amount *= 2;
      if (passives.includes('encore') && u.attacks % 4 === 0) amount += 2;
      hits.push({ source: u, target, amount, pierce: def.ability === 'pierce', primary: true });
      b.attacks.push({ serial: b.tick * 1024 + b.attacks.length, from: u.id, to: target.id, kind: u.kind, x: u.x, z: u.z, tx: target.x, tz: target.z });
      if (def.ability === 'poison') poison.add(target);
      if (def.ability === 'stun' && u.attacks % 3 === 0) stuns.add(target);
      if (def.ability === 'heal' && u.attacks % 3 === 0) {
        const ally = live.filter(a => a.side === u.side).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp || a.id - c.id)[0];
        heals.set(ally, (heals.get(ally) ?? 0) + 4 * u.tier);
    }
    if (def.ability === 'drain' || passives.includes('siphon')) heals.set(u, (heals.get(u) ?? 0) + (def.ability === 'drain' ? Math.max(1, Math.floor(amount / 3)) : 0) + (passives.includes('siphon') ? 1 : 0));
    let extra = enemies.filter(e => e !== target && distance(e, target) <= 1);
    if (def.ability === 'chain') extra = extra.slice(0, 1);
    else if (def.ability === 'pierce') extra = enemies.filter(e => e.x === target.x + Math.sign(target.x - u.x) && e.z === target.z + Math.sign(target.z - u.z)).slice(0, 1);
    else if (def.ability !== 'cleave' && def.ability !== 'splash') extra = [];
    for (const e of extra) hits.push({ source: u, target: e, amount: Math.max(1, Math.floor(amount / 2)), pierce: def.ability === 'pierce', primary: false });
    }
  }
  // One winner per destination, alternating side priority each tick. Dead units never reserve cells.
  const claimed = new Set<string>();
  moves.sort((a, c) => ((a.unit.side + b.tick) % 2) - ((c.unit.side + b.tick) % 2) || a.unit.id - c.unit.id);
  for (const m of moves) { const key = `${m.x},${m.z}`; if (!claimed.has(key)) { claimed.add(key); m.unit.x = m.x; m.unit.z = m.z; } }
  const resolve = (batch: typeof hits) => {
    const totals = new Map<Fighter, number>();
    for (const h of batch) {
      const marked = h.target.magic.markedUntil >= b.tick ? h.target.magic.markPower + h.source.magic.markBonus : 0;
      const amount = Math.max(1, h.amount + marked - (h.pierce ? 0 : Math.max(0, h.target.armour + buffValue(h.target, 'armour', b.tick))));
      const absorbed = Math.min(h.target.shield, amount); h.target.shield -= absorbed;
      if (amount > absorbed) hurt.add(h.target);
      totals.set(h.target, (totals.get(h.target) ?? 0) + amount - absorbed);
    }
    for (const [u, amount] of totals) { u.hp = Math.max(0, u.hp - amount); if (amount) b.damages.push({ serial: b.tick * 1024 + b.damages.length, unit: u.id, x: u.x, z: u.z, amount }); }
  };
  const spellHits = (effects: EffectRequest[]) => effects.filter(r => r.effect.type === 'damage').map(r => ({ source: r.source, target: r.target,
    amount: Math.max(1, r.effect.amount * 2 ** (r.source.tier - 1) + r.source.magic.spellPower + buffValue(r.source, 'spellPower', b.tick)), pierce: r.effect.pierce ?? false, primary: false }));
  resolve([...hits, ...spellHits(requests)]);
  for (const u of poison) if (u.hp > 0) u.poison = Math.max(u.poison, 3);
  for (const u of stuns) if (u.hp > 0) u.stunnedUntil = b.tick + 1;
  for (const [u, amount] of heals) if (u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + amount);
  applySupport(requests, b.tick);
  // One bounded reaction batch. Reactions cannot recursively trigger other reactions.
  const reactions: EffectRequest[] = [];
  for (const u of live) if (u.hp > 0) {
    const target = live.filter(e => e.side !== u.side).sort((a, c) => distance(u, a) - distance(u, c) || a.id - c.id)[0] ?? u;
    if (hurt.has(u)) passive(u, target, 'hurt', ++u.magic.hurtCount, reactions);
    if (!u.magic.wounded && u.hp < u.maxHp * 0.4) { u.magic.wounded = true; passive(u, target, 'wounded', 1, reactions); }
  }
  resolve(spellHits(reactions)); applySupport(reactions, b.tick);
  for (const u of hurt) if (u.hp > 0) u.magic.mana = Math.min(u.magic.maxMana, u.magic.mana + 8);
  finish(b);
}
