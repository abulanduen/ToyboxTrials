/**
 * Spellbox Showdown sound mix. Presentation only: rules events in, shared-bus cues out.
 *
 * `spellboxVoice` is the pure event → cue mapping (unit-tested). `createSpellboxAudio` applies
 * the mix: the local toy's casts and hits play at full level, opponents fall off with distance,
 * and per-tick and rolling caps keep eight toys from turning into noise soup.
 */
import { playSpellCue, type SpellCue } from '../../game/audio';
import type { MatchEvent } from '../types';
import type { SpellboxState } from './rules';
import { SPELLS, type SpellId } from './spells';

/** Release ("the cast fires") cue for each spell. */
export const RELEASE_CUES: Record<SpellId, SpellCue> = {
  'pop-rocket':'rocket', 'spring-fan':'gust', 'marble-burst':'marbleShot', 'bubble-ward':'ward',
  'ribbon-tether':'tether', 'pinwheel-storm':'whirl', 'repair-stitches':'mend', 'button-mine':'mineSet',
  'blink':'zip',
};
export type SpellboxLane = 'local' | 'remote' | 'arena';
export interface SpellboxVoice { cue: SpellCue; gain: number; intensity: number; lane: SpellboxLane }

/** Mix levels. The local toy is never attenuated; opponents are quieter and fall off with distance. */
export const MIX = {
  local: 1,
  remote: 0.5,
  /** Distance (cm) at which an opponent's cue is at half its near level. */
  falloff: 14,
  /** Eliminations stay prominent wherever they happen. */
  ringoutFloor: 0.55,
  /** Knockback (cm/s) for a full-weight impact. */
  heavyImpulse: 30,
} as const;
/** Caps per lane: voices per simulation tick, and per rolling window. Lanes never share a cap, so
 * opponents and arena cues can never crowd out the local toy's own sounds. */
export const CAPS = {
  perTick: { local: 3, remote: 2, arena: 2 },
  window: { local: { ms: 250, max: 4 }, remote: { ms: 250, max: 2 }, arena: { ms: 600, max: 2 } },
} as const;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isSpell = (v: unknown): v is SpellId => typeof v === 'string' && Object.hasOwn(SPELLS, v);

/** Gain for an opponent cue heard from `distance` cm away. */
export const remoteGain = (distance: number) => MIX.remote / (1 + Math.max(0, distance) / MIX.falloff);

/** The cue for one rules event as heard by `localId`, or null when it should stay silent. Pure. */
export function spellboxVoice(event: MatchEvent, localId: string, s: SpellboxState): SpellboxVoice | null {
  const me = s.players.find(p => p.id === localId);
  const where = (id: unknown, x?: unknown, z?: unknown) => {
    if (num(x) && num(z)) return { x, z };
    const p = s.players.find(o => o.id === id);
    return p ? { x: p.x, z: p.z } : null;
  };
  const distanceTo = (at: { x: number; z: number } | null) => me && at ? Math.hypot(me.x - at.x, me.z - at.z) : 0;
  const voice = (cue: SpellCue, mine: boolean, at: { x: number; z: number } | null, intensity = .5): SpellboxVoice =>
    ({ cue, intensity, lane: mine ? 'local' : 'remote', gain: mine ? MIX.local : remoteGain(distanceTo(at)) });
  const mine = event.id === localId;
  switch (event.type) {
    case 'spellbox-cast':
      return isSpell(event.spell) ? voice(RELEASE_CUES[event.spell], mine, where(event.id)) : null;
    case 'spellbox-blink':
      return voice('thump', mine, where(event.id, event.x, event.z), .8);
    case 'spellbox-burst':
      return voice('burst', mine, where(event.id, event.x, event.z), .6);
    case 'spellbox-windup':
      // Opponent telegraphs stay visual; eight overlapping wind-ups would be noise.
      return mine ? { cue: 'charge', gain: .7, intensity: .5, lane: 'local' } : null;
    case 'spellbox-hit': {
      const sources = Array.isArray(event.sources) ? event.sources : [event.source];
      const involved = mine || sources.includes(localId);
      const intensity = Math.min(1, (num(event.impulse) ? event.impulse : 10) / MIX.heavyImpulse);
      const v = voice('impact', involved, where(event.id), intensity);
      return { ...v, gain: v.gain * (.55 + .45 * intensity) };
    }
    case 'eliminated': {
      const v = voice('ringout', mine, where(event.id), 1);
      return mine ? v : { ...v, lane: 'arena', gain: Math.max(MIX.ringoutFloor, v.gain) };
    }
    case 'spellbox-shrink-warning':
      return { cue: 'alarm', gain: 1, intensity: .5, lane: 'arena' };
    case 'spellbox-shrink-tick':
      if (!num(event.seconds) || event.seconds < 0 || event.seconds > 3) return null;
      return event.seconds === 0 ? { cue: 'rumble', gain: .9, intensity: .5, lane: 'arena' } : { cue: 'tick', gain: .85, intensity: .5, lane: 'arena' };
    case 'spellbox-countdown':
      // "Fight in 3, 2, 1" after everyone has locked in their build.
      if (!num(event.seconds) || event.seconds < 1 || event.seconds > 3) return null;
      return { cue: 'tick', gain: .85, intensity: .5, lane: 'arena' };
    case 'spellbox-start':
      return { cue: 'go', gain: .9, intensity: .5, lane: 'arena' };
    default:
      return null;
  }
}

/**
 * The mixer. Events from one simulation tick arrive together (the host drains them after each
 * step), so `s.t` identifies the tick. Each lane has its own per-tick cap (at most seven voices in
 * a tick; normally one or two), and a cue plays once per lane per tick (one storm hitting three toys
 * is one impact). Rolling windows bound bursts across ticks.
 */
export function createSpellboxAudio(localId: string, getState: () => SpellboxState | null,
  play: (cue: SpellCue, gain: number, intensity: number) => void = playSpellCue, clock = () => performance.now()) {
  const windows: Record<SpellboxLane, number[]> = { local: [], remote: [], arena: [] };
  let tick = -1, played: SpellboxVoice[] = [];
  return (event: MatchEvent) => {
    const s = getState();
    if (s?.kind !== 'spellbox-showdown') return;
    const v = spellboxVoice(event, localId, s);
    if (!v) return;
    if (s.t !== tick) { tick = s.t; played = []; }
    const lane = played.filter(p => p.lane === v.lane);
    if (lane.length >= CAPS.perTick[v.lane] || lane.some(p => p.cue === v.cue)) return;
    const now = clock(), w = CAPS.window[v.lane];
    const recent = windows[v.lane] = windows[v.lane].filter(at => now - at < w.ms);
    if (recent.length >= w.max) return;
    recent.push(now);
    played.push(v);
    play(v.cue, v.gain, v.intensity);
  };
}
