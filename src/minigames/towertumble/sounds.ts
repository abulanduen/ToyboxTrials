/**
 * Which Toy Tower Tumble sounds to play. Pure logic; `Scene.tsx` plays the result through the
 * shared synthesiser (`src/game/audio.ts`).
 *
 * Eight boards fight at once, so only your own actions sound, only the watched board's combat is
 * heard, and shots are capped to a few voices per moment.
 */
import type { MatchEvent } from '../types';
import type { Family } from './catalogue';

export type TumbleCue = 'build' | 'merge' | 'lucky' | 'sell' | 'builder' | 'quest' | 'gift' | 'wave' | 'boss' | 'boss-down' | 'leak' | 'out' | 'cleared';
/** The cue for a rules event, or null when it belongs to a board you are not playing or watching. */
export function eventCue(e: MatchEvent, localId: string, watchedId: string): TumbleCue | null {
  const id = (e as { id?: string }).id, mine = id === localId, watched = id === watchedId;
  switch (e.type) {
    case 'td-build': return mine ? 'build' : null;
    case 'td-merge': return mine ? ((e as { lucky?: boolean }).lucky ? 'lucky' : 'merge') : null;
    case 'td-sell': return mine ? 'sell' : null;
    case 'td-builder': return mine ? 'builder' : null;
    case 'td-quest': return mine ? 'quest' : null;
    case 'td-gift': return mine ? 'gift' : null;
    case 'td-wave': return (e as { boss?: boolean }).boss ? 'boss' : 'wave';
    case 'td-boss-down': return watched ? 'boss-down' : null;
    case 'td-leak': return watched ? 'leak' : null;
    case 'td-out': return mine ? 'out' : null;
    case 'td-cleared': return 'cleared';
    default: return null;
  }
}

/** Shot voice per family. */
export const SHOT_VOICE: Record<Family, 'hit' | 'puff' | 'charge' | 'marble' | 'button'> = { tin: 'hit', paper: 'puff', clockwork: 'charge', rubber: 'marble', plush: 'button' };
/** At most this many shot sounds per 100 ms of match time. */
export const SHOT_VOICES_PER_TICK = 2;
