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
    // Put durable units nearest the opponent; ranged units prefer the back.
    const ordered = [...p.units].sort((a, b) => ROSTER[b.kind].range - ROSTER[a.kind].range);
    const misplaced = ordered.find((u, i) => u.cell !== i);
    if (misplaced) return [{ type: 'move', unit: misplaced.id, cell: ordered.indexOf(misplaced) }];
    return [{ type: 'ready' }];
  } };
}
