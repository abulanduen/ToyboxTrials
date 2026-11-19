/**
 * Toy Tower Tumble bots: build, merge, quest and level the builder, on the same inputs a player
 * sends. Decisions are throttled (easy bots think slowly and place badly); every random choice uses
 * the host's seeded per-bot RNG.
 */
import type { BotDifficulty, BotPolicy } from '../types';
import { BUILDABLE, coverage } from './board';
import { BUILD_COST, MAX_TIER, TOWERS } from './catalogue';
import { builderCost, freeCell, type TdInput, type TdPlayer, type TdState, type Tower } from './rules';

/** Builder level each bot aims for by wave (index = wave − 1, capped at the last entry). */
const BUILDER_PLAN: Record<BotDifficulty, readonly number[]> = {
  easy: [1, 1, 1, 1, 1, 1, 1, 1, 2],
  normal: [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6],
  hard: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
};
const THINK_MS: Record<BotDifficulty, number> = { easy: 1500, normal: 650, hard: 300 };
const reach = new Map<number, number>(BUILDABLE.map((c) => [c, coverage(c, 2.4)]));

/** Merge pairs, lowest tier first; the result lands on the better-placed of the two. */
function mergePair(s: TdState, p: TdPlayer, skill: BotDifficulty): TdInput | null {
  const groups = new Map<string, Tower[]>();
  for (const t of p.towers) if (TOWERS[t.def].tier < MAX_TIER) groups.set(t.def, [...(groups.get(t.def) ?? []), t]);
  const pairs = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => TOWERS[a[0].def].tier - TOWERS[b[0].def].tier);
  for (const g of pairs) {
    const def = g[0].def, tier = TOWERS[def].tier;
    // Quest-minded bots hold a pair while collecting three of an ordered tower (if there is room to wait).
    const ordered = (def === s.orders.t1 && !p.quests.order1) || (def === s.orders.t2 && !p.quests.order2) || (def === s.orders.t3 && !p.quests.order3)
      || (tier === 2 && !p.quests.triple2 && skill === 'hard');
    if (ordered && g.length === 2 && skill !== 'easy' && p.towers.length < 30) continue;
    const [a, b] = g.slice().sort((x, y) => (reach.get(y.cell) ?? 0) - (reach.get(x.cell) ?? 0));
    return { type: 'merge', from: b.cell, to: a.cell };
  }
  return null;
}

function upgradeSpot(p: TdPlayer): TdInput | null {
  const best = p.towers.slice().sort((a, b) => TOWERS[b.def].tier - TOWERS[a.def].tier)[0];
  if (!best || TOWERS[best.def].tier < 3) return null;
  const empty = BUILDABLE.filter((c) => !p.towers.some((t) => t.cell === c)).sort((a, b) => (reach.get(b) ?? 0) - (reach.get(a) ?? 0))[0];
  if (empty === undefined || (reach.get(empty) ?? 0) <= (reach.get(best.cell) ?? 0) + 1) return null;
  return { type: 'move', from: best.cell, to: empty };
}

export function createTumbleBot(): BotPolicy<TdState, TdInput> {
  const next = new Map<string, number>();
  return {
    decide(s, bot, _dt, rng) {
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || p.out || s.phase === 'over' || s.t < (next.get(p.id) ?? 0)) return [];
      const skill = bot.bot ?? 'normal';
      next.set(p.id, s.t + THINK_MS[skill] * (0.75 + rng() * 0.5));
      if (skill !== 'easy' || rng() < 0.6) { const merge = mergePair(s, p, skill); if (merge) return [merge]; }
      // Hard bots keep their strongest tower on the best empty square they can find.
      if (skill === 'hard') { const move = upgradeSpot(p); if (move) return [move]; }
      const plan = BUILDER_PLAN[skill], want = plan[Math.min(plan.length - 1, s.wave - 1)], cost = builderCost(p);
      if (cost !== null && p.builder < want && p.gold >= cost) return [{ type: 'builder' }];
      const free = freeCell(p);
      if (p.gold >= BUILD_COST && free !== undefined) {
        if (skill === 'easy') {
          const empty = BUILDABLE.filter((c) => !p.towers.some((t) => t.cell === c));
          return [{ type: 'build', cell: empty[Math.floor(rng() * empty.length)] }];
        }
        return [{ type: 'build' }];
      }
      // A full board with nothing to merge: sell the weakest tower to make room for another roll.
      if (free === undefined && skill !== 'easy' && p.gold >= BUILD_COST) {
        const weakest = p.towers.slice().sort((a, b) => TOWERS[a.def].tier - TOWERS[b.def].tier || (reach.get(a.cell) ?? 0) - (reach.get(b.cell) ?? 0))[0];
        if (weakest && TOWERS[weakest.def].tier <= 2) return [{ type: 'sell', cell: weakest.cell }];
      }
      return [];
    },
  };
}
