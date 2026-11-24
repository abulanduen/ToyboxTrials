/**
 * Online own-toy prediction for Toybox Siege (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * The server runs the match; a client only hears where its toy is a round trip after pressing a key.
 * Here the client replays its own not-yet-stepped stick inputs on the newest server state with the
 * rules' own `movePlayer`, in the same situations the rules move the toy (running and not choosing a
 * card, waiting for the arena, fighting in it), so the toy answers the stick at once. Everything
 * else (enemies, damage, pickups, other toys) stays exactly as the server sent it. Corrections from
 * new snapshots fade in (../shared/predictSmooth.ts).
 */
import { ARENA_HALF, FINALE, PLAYER_RADIUS } from './config';
import { movePlayer, type SiegeInput, type SiegePlayer, type SiegeState } from './rules';
import { PredictSmoother } from '../shared/predictSmooth';
import type { PredictFrame } from '../types';

export { predictClock } from '../shared/predictSmooth';

/** Where the rules move this toy now, as a half-size of its square, or null when they do not. */
function moveHalf(s: SiegeState, p: SiegePlayer): number | null {
  if (s.phase === 'arena') return p.status === 'arena' ? FINALE.half : null;
  if (s.phase !== 'run') return null;
  if (p.status === 'alive' || p.status === 'prep') return p.choice ? null : ARENA_HALF;
  return null;
}

const smooth = new PredictSmoother();

export function predictSiege(s: SiegeState, localId: string, frames: readonly PredictFrame<SiegeInput>[]): SiegeState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  const half = me ? moveHalf(s, me) : null;
  if (!me || half === null) {
    smooth.reset();
    return null;
  }

  // A frame's time passed before its inputs were read, so it moves on the stick as it was, and its
  // inputs act from then on, as on the server (which steps an input from the moment it arrives).
  // Applying them first would run a slow frame's whole length on the new stick, then need
  // correcting back once the server's position arrives.
  const p = { ...me };
  let knownX = p.x, knownZ = p.z;
  const lastAt = smooth.knownIndex(frames);
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    movePlayer(p, fr.dt / 1000, half);
    for (const inp of fr.inputs) if (inp.type === 'move') { p.ax = Math.max(-1, Math.min(1, Number(inp.x) || 0)); p.ay = Math.max(-1, Math.min(1, Number(inp.y) || 0)); }
    if (f === lastAt) { knownX = p.x; knownZ = p.z; }
  }
  const { ox, oz } = smooth.settle(localId, frames, knownX, knownZ, p.x, p.z);
  const lim = half - PLAYER_RADIUS;
  p.x = Math.max(-lim, Math.min(lim, p.x + ox));
  p.z = Math.max(-lim, Math.min(lim, p.z + oz));
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players };
}
