import type { BotPolicy } from '../types';
import { ROSTER, type SquadInput, type SquadState, type UnitKind } from './rules';

export function createSquadBot(): BotPolicy<SquadState, SquadInput> {
  const next = new Map<string, number>();
  return { decide(s, bot, _dt, rng) {
    const p = s.players.find(p => p.id === bot.id);
    if (!p || p.ready || s.phase !== 'build' || s.t < (next.get(p.id) ?? 0)) return [];
    next.set(p.id, s.t + (bot.bot === 'easy' ? 900 : 400));
    const kinds: UnitKind[] = bot.bot === 'easy' ? ['soldier'] : ['robot', 'soldier', 'hare'];
    const affordable = kinds.filter(k => ROSTER[k].cost <= p.coins);
    if (p.units.length < 6 && affordable.length) return [{ type: 'buy', kind: affordable[Math.floor(rng() * affordable.length)] }];
    const upgrade = p.units.find(u => u.tier < 3);
    if (upgrade && p.coins >= 3) return [{ type: 'upgrade', unit: upgrade.id }];
    const placements = p.units.map((u, i) => ({ unit: u, cell: (u.kind === 'hare' ? 24 : 0) + i }));
    const misplaced = placements.find(p => p.unit.cell !== p.cell);
    if (misplaced) return [{ type: 'move', unit: misplaced.unit.id, cell: misplaced.cell }];
    return [{ type: 'ready' }];
  } };
}
