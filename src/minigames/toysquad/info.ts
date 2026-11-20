/** Pure helpers behind the Toy Squad HUD panels (owned copies, trait progress, handbook filters). No DOM. */
import { RARITIES, ROSTER, type Rarity } from './catalogue';
import type { Trait } from './kits';
import type { Fighter, SquadUnit } from './rules';
import { STATUS_BIT, type StatusKind } from '../shared/statusKinds';

/** Copies of a kind the player owns at one, two and three stars (board and reserves). */
export function ownedCopies(units: readonly Pick<SquadUnit, 'kind' | 'tier'>[], kind: string): [number, number, number] {
  const copies: [number, number, number] = [0, 0, 0];
  for (const u of units) if (u.kind === kind && u.tier >= 1 && u.tier <= 3) copies[u.tier - 1]++;
  return copies;
}
/** Compact form for attributes and tests, e.g. "1:1,2:1" for one 1-star and one 2-star copy. */
export const ownedSummary = (copies: readonly number[]) => copies.map((n, i) => n ? `${i + 1}:${n}` : '').filter(Boolean).join(',');

/** Trait bonuses switch on at 2 and 4 distinct deployed kinds. */
export const TRAIT_THRESHOLDS = [2, 4] as const;
export function traitProgress(count: number): { rank: 0 | 1 | 2; next: number | null } {
  const rank = count >= 4 ? 2 : count >= 2 ? 1 : 0;
  return { rank, next: rank === 2 ? null : TRAIT_THRESHOLDS[rank] };
}
/** Active traits first (highest rank, then count), then the rest, alphabetical within ties. */
export const sortTraits = (counts: Partial<Record<Trait, number>>) => (Object.entries(counts) as [Trait, number][])
  .filter(([, n]) => n > 0).sort((a, b) => traitProgress(b[1]).rank - traitProgress(a[1]).rank || b[1] - a[1] || a[0].localeCompare(b[0]));
const order = (id: string) => RARITIES.indexOf(ROSTER[id].rarity) * 1000 + Object.keys(ROSTER).indexOf(id);
/** Every roster id, rarity order then catalogue order, optionally narrowed to one rarity and/or one trait. */
export function handbookEntries(rarity: Rarity | null = null, trait: Trait | null = null): string[] {
  return Object.keys(ROSTER).filter(id => (!rarity || ROSTER[id].rarity === rarity) && (!trait || ROSTER[id].traits.includes(trait))).sort((a, b) => order(a) - order(b));
}
export const toggleFavourite = (favourites: readonly string[], id: string) => favourites.includes(id) ? favourites.filter(f => f !== id) : [...favourites, id];

/** Every debuff a Toy Squad fighter can carry, in legend order. */
export const SQUAD_STATUSES: readonly StatusKind[] = ['poison', 'stun', 'mark', 'silence', 'slow', 'shred', 'weaken'];
/**
 * A fighter's debuffs for the battle tick after `tick`, as a `STATUS_BIT` mask: poison (damage over
 * time), stun, mark, silence, and net-negative buffs: haste → slow, armour → shred, and damage,
 * spell power or range → weaken. Reads the fields the way `tickBattle` does.
 */
export function fighterStatus(u: Pick<Fighter, 'hp' | 'poison' | 'stunnedUntil' | 'magic'>, tick: number): number {
  if (u.hp <= 0) return 0;
  const next = tick + 1, net: Record<string, number> = {};
  let m = 0;
  if (u.poison > 0) m |= STATUS_BIT.poison;
  if (u.stunnedUntil >= next) m |= STATUS_BIT.stun;
  if (u.magic.markedUntil >= next) m |= STATUS_BIT.mark;
  if (u.magic.silencedUntil >= next) m |= STATUS_BIT.silence;
  for (const b of u.magic.buffs) if (b.until >= next) net[b.stat] = (net[b.stat] ?? 0) + b.amount;
  if ((net.haste ?? 0) < 0) m |= STATUS_BIT.slow;
  if ((net.armour ?? 0) < 0) m |= STATUS_BIT.shred;
  if ((net.damage ?? 0) < 0 || (net.spellPower ?? 0) < 0 || (net.range ?? 0) < 0) m |= STATUS_BIT.weaken;
  return m;
}

export type DamageMode = 'dealt' | 'taken';
export interface DamageRow { id: number; kind: string; tier: number; value: number; spell: number; alive: boolean }
/** Damage overview rows for one side: highest first, stable by fighter id on ties. `spell` is the part of `dealt` from spells and passives. */
export function damageRows(fighters: readonly Pick<Fighter, 'id' | 'kind' | 'tier' | 'hp' | 'stats'>[], mode: DamageMode): DamageRow[] {
  return fighters.map(u => ({ id: u.id, kind: u.kind, tier: u.tier, value: mode === 'dealt' ? u.stats.dealt : u.stats.taken, spell: mode === 'dealt' ? u.stats.spell : 0, alive: u.hp > 0 }))
    .sort((a, b) => b.value - a.value || a.id - b.id);
}
