/**
 * Online own-toy prediction for Toybox Siege (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * The server runs the match; a client only hears where its toy is a round trip after pressing a key.
 * Here the client replays its own not-yet-stepped stick inputs on the newest server state with the
 * rules' own `movePlayer`, in the same situations the rules move the toy (running and not choosing a
 * card, waiting for the arena, fighting in it), so the toy answers the stick at once. Everything
 * else (enemies, damage, pickups, other toys) stays exactly as the server sent it.
 *
 * Each new snapshot can shift the replayed position slightly (the server stepped an input a little
 * earlier or later than the client counted). That jump is folded into an offset which fades over
 * about a tenth of a second, so the toy glides rather than twitches; a big jump (respawn, entering
 * the arena) is shown at once.
 */
import { ARENA_HALF, FINALE, PLAYER_RADIUS } from './config';
import { movePlayer, type SiegeInput, type SiegePlayer, type SiegeState } from './rules';
import type { PredictFrame } from '../types';

/** Jumps bigger than this (cm) are real moves, not prediction error: show them at once. */
const SNAP_CM = 4;
/** How fast a correction fades (ms, e-folding time). */
const SMOOTH_MS = 90;

/** Where the rules move this toy now, as a half-size of its square, or null when they do not. */
function moveHalf(s: SiegeState, p: SiegePlayer): number | null {
  if (s.phase === 'arena') return p.status === 'arena' ? FINALE.half : null;
  if (s.phase !== 'run') return null;
  if (p.status === 'alive' || p.status === 'prep') return p.choice ? null : ARENA_HALF;
  return null;
}

/** The fade's clock (tests drive their own). */
export const predictClock = { now: () => performance.now() };

const smooth = { on: false, id: '', rawX: 0, rawZ: 0, ox: 0, oz: 0, at: 0, last: null as PredictFrame<SiegeInput> | null };

export function predictSiege(s: SiegeState, localId: string, frames: readonly PredictFrame<SiegeInput>[]): SiegeState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  const half = me ? moveHalf(s, me) : null;
  if (!me || half === null) { smooth.on = false; smooth.last = null; return null; }

  // Replay. `knownX/Z`: the position after the frames already replayed last time, which without a
  // new snapshot equals last time's result exactly (so only a new snapshot can move it).
  const p = { ...me };
  let knownX = p.x, knownZ = p.z;
  const lastAt = smooth.last ? frames.indexOf(smooth.last) : -1;
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    for (const inp of fr.inputs) if (inp.type === 'move') { p.ax = Math.max(-1, Math.min(1, Number(inp.x) || 0)); p.ay = Math.max(-1, Math.min(1, Number(inp.y) || 0)); }
    movePlayer(p, fr.dt / 1000, half);
    if (f === lastAt) { knownX = p.x; knownZ = p.z; }
  }

  const now = predictClock.now();
  if (smooth.on && smooth.id === localId) {
    // Whatever moved the already-replayed part is a correction: keep the shown toy where it was and fade it in.
    const dx = knownX - smooth.rawX, dz = knownZ - smooth.rawZ;
    if (Math.hypot(dx, dz) > SNAP_CM) { smooth.ox = 0; smooth.oz = 0; }
    else { smooth.ox -= dx; smooth.oz -= dz; }
    const k = Math.exp(-Math.max(0, now - smooth.at) / SMOOTH_MS);
    smooth.ox *= k; smooth.oz *= k;
  } else { smooth.ox = 0; smooth.oz = 0; }
  smooth.on = true; smooth.id = localId; smooth.at = now;
  smooth.rawX = p.x; smooth.rawZ = p.z;
  smooth.last = frames.length ? frames[frames.length - 1] : null;

  const lim = half - PLAYER_RADIUS;
  p.x = Math.max(-lim, Math.min(lim, p.x + smooth.ox));
  p.z = Math.max(-lim, Math.min(lim, p.z + smooth.oz));
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players };
}
