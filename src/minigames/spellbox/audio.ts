import { playToyCue, type ToyCue } from '../../game/audio';
import type { MatchEvent } from '../types';
import type { SpellboxState } from './rules';
import type { SpellId } from './spells';

const voices: Record<SpellId, ToyCue> = {
  'pop-rocket':'puff', 'spring-fan':'fan', 'marble-burst':'marble', 'bubble-ward':'bubble',
  'ribbon-tether':'ribbon', 'pinwheel-storm':'storm', 'repair-stitches':'stitch', 'button-mine':'button',
};

/** Presentation-only mix: bound overlapping cues and reserve voices for the local toy. */
export function createSpellboxAudio(localId: string, getState: () => SpellboxState | null,
  play = playToyCue, clock = () => performance.now()) {
  const lanes = { local: [] as number[], remote: [] as number[], warning: [] as number[] };
  return (event: MatchEvent) => {
    const s = getState();
    if (s?.kind !== 'spellbox-showdown') return;
    const local = event.id === localId;
    let cue: ToyCue;
    let lane: keyof typeof lanes = local ? 'local' : 'remote';
    if (event.type === 'spellbox-cast') {
      if (typeof event.spell !== 'string' || !Object.hasOwn(voices,event.spell)) return;
      cue = voices[event.spell as SpellId];
    } else if (event.type === 'spellbox-windup') {
      if (!local) return; // Opponent telegraphs remain visual; avoid eight overlapping ratchets.
      cue = 'charge';
    } else if (event.type === 'spellbox-hit') cue = 'hit';
    else if (event.type === 'eliminated') cue = 'out';
    else if (event.type === 'spellbox-shrink-warning') { cue = 'warning'; lane = 'warning'; }
    else if (event.type === 'spellbox-shrink-tick') {
      if (typeof event.seconds !== 'number' || event.seconds < 1 || event.seconds > 3) return;
      cue = 'count'; lane = 'warning';
    } else return;

    const now = clock(), windowMs = lane === 'warning' ? 600 : 250;
    const active = lanes[lane] = lanes[lane].filter(t => now-t < windowMs);
    if (active.length >= (lane === 'local' ? 3 : lane === 'remote' ? 2 : 1)) return;
    const me = s.players.find(p => p.id === localId), source = s.players.find(p => p.id === event.id);
    const distance = me && source ? Math.hypot(me.x-source.x,me.z-source.z) : 0;
    const gain = lane === 'warning' ? .8 : local ? .85 : .28 / (1+distance/12);
    active.push(now);
    play(cue,gain);
  };
}
