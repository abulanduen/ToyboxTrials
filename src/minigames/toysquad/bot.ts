import type { BotPolicy } from '../types';
import { ROSTER } from './catalogue';
import { boardLimit, canMerge, rerollPrice, type SquadInput, type SquadState } from './rules';
export function createSquadBot(): BotPolicy<SquadState, SquadInput> {
  const next = new Map<string, number>(), rolls = new Map<string, number>();
  return { decide(s, bot, _dt, rng) {
    const p = s.players.find(p => p.id === bot.id);
    if (!p || p.ready || s.phase !== 'build' || s.t < (next.get(p.id) ?? 0)) return [];
    next.set(p.id, s.t + (bot.bot === 'easy' ? 600 : 250));
    if (p.passiveOffers.length) return [{ type: 'passive', passive: p.passiveOffers[Math.floor(rng() * p.passiveOffers.length)] }];
    for (const unit of p.units) { const other = p.units.find(u => canMerge(u, unit)); if (other) return [{ type: 'merge', unit: other.id, other: unit.id }]; }
    const board = p.units.filter(u => u.cell >= 0), bench = p.units.filter(u => u.cell < 0);
    if (board.length < boardLimit(p.level) && bench[0]) {
      const cell = Array.from({ length: 32 }, (_, i) => i).find(c => !board.some(u => u.cell === c))!;
      return [{ type: 'move', unit: bench[0].id, cell }];
    }
    const offers = p.shop.map((kind, slot) => ({ kind, slot })).filter(o => o.kind && ROSTER[o.kind].cost <= p.coins)
      .sort((a, b) => Number(p.units.some(u => u.kind === b.kind && u.tier === 1)) - Number(p.units.some(u => u.kind === a.kind && u.tier === 1)));
    if (offers[0] && (board.length < boardLimit(p.level) || (bench.length < 4 && p.units.some(u => u.kind === offers[0].kind && u.tier === 1)))) return [{ type: 'buy', slot: offers[0].slot }];
    const key = `${p.id}:${s.round}`;
    if ((rolls.get(key) ?? 0) < (bot.bot === 'hard' ? 3 : 1) && p.coins >= rerollPrice(s, p) + 1) { rolls.set(key, (rolls.get(key) ?? 0) + 1); return [{ type: 'reroll' }]; }
    const desired = board.map((u, i) => ({ unit: u, cell: (ROSTER[u.kind].range > 1 ? 24 : 0) + i % 8 + (i >= 8 && ROSTER[u.kind].range === 1 ? 8 : 0) }));
    const wrong = desired.find(d => d.unit.cell !== d.cell && !board.some(u => u !== d.unit && u.cell === d.cell));
    if (wrong) return [{ type: 'move', unit: wrong.unit.id, cell: wrong.cell }];
    return [{ type: 'ready' }];
  } };
}
