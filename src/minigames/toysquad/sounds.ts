/**
 * Which Toy Squad sounds the local player should hear. Pure logic; `Scene.tsx` plays the result.
 *
 * Every contender builds and fights at the same time, so playing every event would stack the other
 * boards' noise on top of your own. Only the local player's purchases and upgrades sound, only
 * the local battle's combat sounds, and each combat tick is capped at a few voices.
 */
import type { MatchEvent } from '../types';
import type { AttackEffect, Battle } from './rules';

export type SquadCue = 'buy' | 'upgrade' | 'battle' | 'recap';
/** The cue for a rules event, or null when it belongs to another player's board. */
export function eventCue(e: MatchEvent, localId: string): SquadCue | null {
  const mine = (e as { id?: string }).id === localId;
  if (e.type === 'squad-buy') return mine ? 'buy' : null;
  if (e.type === 'squad-upgrade') return mine ? 'upgrade' : null;
  return e.type === 'squad-battle' ? 'battle' : e.type === 'squad-recap' ? 'recap' : null;
}

export type CombatVoice = 'hit' | 'heavy' | 'spell';
export const MAX_COMBAT_VOICES = 3;
/**
 * The voices for one combat tick of the watched battle: at most one spell chime, then light hits,
 * with one "heavy" thump when four or more attacks land together. Never more than MAX_COMBAT_VOICES.
 */
export function combatVoices(attacks: readonly Pick<AttackEffect, 'spell'>[]): CombatVoice[] {
  const spells = attacks.filter(a => a.spell).length, hits = attacks.length - spells, voices: CombatVoice[] = [];
  if (spells) voices.push('spell');
  if (hits >= 4) voices.push('heavy');
  for (let i = hits >= 4 ? 1 : 0; i < Math.min(hits, 2) && voices.length < MAX_COMBAT_VOICES; i++) voices.push('hit');
  return voices;
}
/** The one battle whose combat is audible: the local player's own. */
export const audibleBattle = (battles: readonly Battle[], localId: string) => battles.find(b => b.owner === localId);
