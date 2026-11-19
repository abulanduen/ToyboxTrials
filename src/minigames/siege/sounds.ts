/**
 * Which Toybox Siege sounds play, and how often. Pure logic; `Scene.tsx` plays the result through
 * the shared synthesiser (`game/audio.ts`). A busy board can kill dozens of toys a second, so
 * every repeating cue goes through a limiter: a minimum gap per cue and a cap on voices per
 * short window across all cues. Only the board on screen is heard.
 */
import type { MatchEvent } from '../types';

export type SiegeCue = 'kill' | 'sweep' | 'pop' | 'chime' | 'marble' | 'plane' | 'hurt' | 'level' | 'card' | 'elite' | 'boss' | 'chest' | 'evolve'
  | 'downed' | 'revive' | 'ghost' | 'victory' | 'sent' | 'incoming' | 'blocked' | 'start';

/** Minimum time between two plays of the same cue (ms of simulation time). */
export const CUE_GAP: Record<SiegeCue, number> = {
  kill: 70, sweep: 120, pop: 110, chime: 140, marble: 120, plane: 200, hurt: 180, level: 300, card: 150, elite: 800, boss: 1500, chest: 300,
  evolve: 800, downed: 800, revive: 800, ghost: 800, victory: 1500, sent: 400, incoming: 400, blocked: 300, start: 1000,
};
/** At most this many voices in any VOICE_WINDOW ms. Important cues (not kills or weapons) always get through. */
export const MAX_VOICES = 6;
export const VOICE_WINDOW = 250;
const BUSY: ReadonlySet<SiegeCue> = new Set(['kill', 'sweep', 'pop', 'chime', 'marble', 'plane']);

export class CueLimiter {
  private last = new Map<SiegeCue, number>();
  private recent: number[] = [];
  /** True if `cue` may play at simulation time `now` (and records it). */
  allow(cue: SiegeCue, now: number): boolean {
    const prev = this.last.get(cue);
    if (prev !== undefined && now - prev < CUE_GAP[cue] && now >= prev) return false;
    while (this.recent.length && now - this.recent[0] > VOICE_WINDOW) this.recent.shift();
    if (BUSY.has(cue) && this.recent.length >= MAX_VOICES) return false;
    this.last.set(cue, now);
    this.recent.push(now);
    return true;
  }
  reset() { this.last.clear(); this.recent.length = 0; }
}

/** The cue for a rules event, as heard by `localId` while `viewedId`'s board is on screen (null = silent). */
export function eventCue(e: MatchEvent, localId: string, viewedId: string): SiegeCue | null {
  const id = e.id as string | undefined, mine = id === localId, onScreen = id === viewedId;
  switch (e.type) {
    case 'siege-start': return 'start';
    case 'siege-level': return mine ? 'level' : null;
    case 'siege-choice': return mine ? 'card' : null;
    case 'siege-elite': return onScreen ? 'elite' : null;
    case 'siege-boss': return onScreen ? 'boss' : null;
    case 'siege-chest-pick': return mine ? 'chest' : null;
    case 'siege-evolve': return mine ? 'evolve' : null;
    case 'siege-hurt': return mine ? 'hurt' : null;
    case 'siege-downed': return mine ? 'downed' : null;
    case 'siege-revive': return mine || onScreen ? 'revive' : null;
    case 'siege-ghost': return mine ? 'ghost' : null;
    case 'siege-victory': return mine || onScreen ? 'victory' : null;
    case 'siege-sent': return mine ? 'sent' : e.to === localId ? 'incoming' : null;
    case 'siege-send-blocked': return mine ? 'blocked' : null;
    default: return null;
  }
}
