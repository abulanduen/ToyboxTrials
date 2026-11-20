/**
 * Pure helpers behind the "look at a board" panel (any board: your own, a rival's from the player
 * rail, or the one you spectate). Everything here is public board state; no DOM.
 */
import { FAMILIES, MAX_TIER, TOWERS, type Family } from './catalogue';
import type { TdPlayer } from './rules';

export interface FamilyCount { family: Family; count: number; best: number }
export interface TierGroup { tier: number; towers: { def: string; count: number }[]; total: number }
export interface BoardSummary {
  towers: number;
  /** Per tower family (the game's "traits"): how many towers and the best tier, in catalogue order. */
  families: FamilyCount[];
  /** Towers grouped by tier, highest first; within a tier by count, then name. Empty tiers are left out. */
  tiers: TierGroup[];
}

export function boardSummary(p: Pick<TdPlayer, 'towers'>): BoardSummary {
  const families = FAMILIES.map((family) => ({ family, count: 0, best: 0 }));
  const byTier = new Map<number, Map<string, number>>();
  for (const t of p.towers) {
    const d = TOWERS[t.def];
    if (!d) continue;
    const f = families[FAMILIES.indexOf(d.family)];
    f.count++; f.best = Math.max(f.best, d.tier);
    const tier = byTier.get(d.tier) ?? new Map<string, number>();
    tier.set(t.def, (tier.get(t.def) ?? 0) + 1);
    byTier.set(d.tier, tier);
  }
  const tiers: TierGroup[] = [];
  for (let tier = MAX_TIER; tier >= 1; tier--) {
    const m = byTier.get(tier);
    if (!m) continue;
    const towers = [...m].map(([def, count]) => ({ def, count })).sort((a, b) => b.count - a.count || TOWERS[a.def].name.localeCompare(TOWERS[b.def].name));
    tiers.push({ tier, towers, total: towers.reduce((n, t) => n + t.count, 0) });
  }
  return { towers: p.towers.length, families, tiers };
}
