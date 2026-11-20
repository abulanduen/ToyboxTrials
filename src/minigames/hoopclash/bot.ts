/** Hoop Clash bot policy: the shared AI (ai.ts) for bot contestants, with per-bot memory. */
import type { BotPolicy } from '../types';
import { aiDecide, createAiMemory, type AiMemory } from './ai';
import type { HoopInput, HoopState } from './rules';

export function createHoopBot(): BotPolicy<HoopState, HoopInput> {
  const mem = new Map<string, AiMemory>();
  return {
    decide(state, bot, _dtMs, rng) {
      const p = state.players.find((q) => q.id === bot.id);
      if (!p || p.ai) return []; // a toy the rules drive themselves
      let m = mem.get(bot.id);
      if (!m) mem.set(bot.id, (m = createAiMemory()));
      return aiDecide(state, p, bot.bot ?? 'normal', rng, m);
    },
  };
}
