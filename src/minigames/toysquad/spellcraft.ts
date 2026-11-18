import { ROSTER } from './catalogue';
import type { BuffStat, KitEffect, Trait } from './kits';
import type { Fighter, SquadUnit } from './rules';

export const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
/** Duplicates and bench units never increase a formation's trait thresholds. */
export function traitCounts(units: readonly Pick<SquadUnit, 'kind' | 'cell'>[]): Partial<Record<Trait, number>> {
  const counts: Partial<Record<Trait, number>> = {};
  for (const kind of new Set(units.filter(u => u.cell >= 0).map(u => u.kind))) for (const trait of ROSTER[kind].traits) counts[trait] = (counts[trait] ?? 0) + 1;
  return counts;
}
export function buffValue(u: Fighter, stat: BuffStat, tick: number) {
  const n = u.magic.buffs.filter(b => b.stat === stat && b.until >= tick).reduce((sum, b) => sum + b.amount, 0);
  const cap = stat === 'haste' ? 1 : stat === 'range' ? 3 : stat === 'armour' ? 10 : 20;
  return Math.max(-cap, Math.min(cap, n));
}
export interface EffectRequest { source: Fighter; target: Fighter; effect: KitEffect; key: string }
export function effectsFor(source: Fighter, target: Fighter, effects: readonly KitEffect[], fighters: readonly Fighter[], tick: number, key: string): EffectRequest[] {
  const live = fighters.filter(u => u.hp > 0), allies = live.filter(u => u.side === source.side), enemies = live.filter(u => u.side !== source.side);
  return effects.flatMap((effect, i) => {
    const radius = effect.radius ?? 1;
    let targets: Fighter[];
    switch (effect.target) {
      case 'self': targets = [source]; break;
      case 'target': targets = [target]; break;
      case 'lowestAlly': targets = allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id).slice(0, 1); break;
      case 'allAllies': targets = allies; break;
      case 'nearAllies': targets = allies.filter(u => distance(source, u) <= radius); break;
      case 'allEnemies': targets = enemies; break;
      case 'nearEnemies': targets = enemies.filter(u => distance(target, u) <= radius); break;
      case 'markedEnemies': targets = enemies.filter(u => u.magic.markedUntil >= tick); break;
      case 'traitAllies': targets = allies.filter(u => effect.trait && ROSTER[u.kind].traits.includes(effect.trait)); break;
      case 'line': {
        const dx = target.x - source.x, dz = target.z - source.z, length = Math.hypot(dx, dz) || 1;
        targets = enemies.filter(u => (u.x - source.x) * dx + (u.z - source.z) * dz > 0 && Math.abs((u.x - source.x) * dz - (u.z - source.z) * dx) / length <= 0.55); break;
      }
    }
    return targets.filter(u => u.hp > 0).map(u => ({ source, target: u, effect, key: `${source.id}:${key}:${i}` }));
  });
}
/** Non-damage effects resolve after the simultaneous damage batch; dead toys cannot be revived. */
export function applySupport(requests: readonly EffectRequest[], tick: number) {
  for (const { source, target: u, effect: f, key } of requests) {
    if (u.hp <= 0 || f.type === 'damage') continue;
    const scale = 2 ** (source.tier - 1), value = f.amount * scale;
    switch (f.type) {
      case 'heal': u.hp = Math.min(u.maxHp, u.hp + value + source.magic.healPower); break;
      case 'shield': u.shield = Math.min(u.maxHp, u.shield + value); break;
      case 'mana': u.magic.mana = Math.min(u.magic.maxMana, u.magic.mana + f.amount); break;
      case 'poison': u.poison = Math.max(u.poison, f.duration ?? 3); u.magic.poisonPower = Math.max(u.magic.poisonPower, value); break;
      case 'stun': u.stunnedUntil = Math.max(u.stunnedUntil, tick + (f.duration ?? 1)); break;
      case 'silence': u.magic.silencedUntil = Math.max(u.magic.silencedUntil, tick + (f.duration ?? 3)); break;
      case 'mark': u.magic.markedUntil = Math.max(u.magic.markedUntil, tick + (f.duration ?? 4)); u.magic.markPower = Math.max(u.magic.markPower, value); break;
      case 'cleanse': u.poison = 0; u.magic.poisonPower = 1; u.stunnedUntil = 0; u.magic.silencedUntil = 0; u.magic.markedUntil = 0; u.magic.markPower = 0; u.magic.buffs = u.magic.buffs.filter(b => b.amount >= 0); break;
      case 'buff': {
        const stat = f.stat!; const existing = u.magic.buffs.find(b => b.key === key);
        const buff = { key, stat, amount: f.amount, until: tick + (f.duration ?? 6) };
        if (existing) Object.assign(existing, buff); else u.magic.buffs.push(buff);
        break;
      }
    }
  }
}
export function initMagic(fighters: Fighter[]) {
  const counts = traitCounts(fighters.map(u => ({ kind: u.kind, cell: 0 }))), rank = (t: Trait) => (counts[t] ?? 0) >= 4 ? 2 : (counts[t] ?? 0) >= 2 ? 1 : 0;
  for (const u of fighters) {
    const has = (t: Trait) => ROSTER[u.kind].traits.includes(t) ? rank(t) : 0;
    u.armour += has('Tin') + has('Vanguard');
    u.shield += (has('Tin') === 2 ? 4 : 0) + ([0, 3, 8][has('Wood')]);
    const hp = [0, 4, 10][has('Felt')]; u.hp += hp; u.maxHp += hp;
    u.magic.spellPower = [0, 1, 3][has('Paper')] + has('Prism');
    u.magic.healPower = [0, 1, 3][has('Medic')]; u.magic.markBonus = [0, 1, 3][has('Trickster')];
    u.magic.attackMana = (has('Clockwork') === 2 ? 5 : 0) + has('Artificer') * 3;
    u.magic.mana = has('Clockwork') * 10 + (has('Prism') === 2 ? 10 : 0);
    u.range += has('Ranger'); u.magic.baseRange = u.range;
  }
  const starts = fighters.flatMap(u => ROSTER[u.kind].passive.trigger === 'start' ? effectsFor(u, u, ROSTER[u.kind].passive.effects, fighters, 0, 'passive') : []);
  applySupport(starts, 0);
}
