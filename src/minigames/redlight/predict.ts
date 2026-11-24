/**
 * Online own-toy prediction for Red Light, Green Light (see `predictLocal` in ../types.ts and
 * ../remote.ts). Without it your toy kept walking for a whole network round trip after you let go,
 * which shows most on red, the moment everyone stops. Your client replays its own unstepped stick
 * input with the rules' own movement (`stepMover`, 60 Hz steps) whenever the rules let the toy walk:
 * not during the intro, and not once it is knocked out. Whether you are caught stays the server's
 * call (its grace allows for the network trip, see server/games.ts).
 */
import { TOY_TUNING, latchInput, stepMover } from '../shared/movement';
import { PredictSmoother } from '../shared/predictSmooth';
import type { PredictFrame } from '../types';
import type { RlglInput, RlglState } from './rules';

const STEP_MS = 1000 / 60;

/**
 * Offline, a key moves the toy over the frame it was read in; the replay only starts it on the next
 * frame. So the drawn toy runs on by the newest frame's time on the newest input (at most 50 ms):
 * the same feel, one frame sooner. It is added after the smoothing, which only sees the replay.
 */
const LOOK_MAX_MS = 50;
const lookMs = (frames: readonly PredictFrame<unknown>[]) => Math.min(frames.length ? frames[frames.length - 1].dt : 0, LOOK_MAX_MS);
const smooth = new PredictSmoother();

export function predictRlgl(s: RlglState, localId: string, frames: readonly PredictFrame<RlglInput>[], skipMs = 0): RlglState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  if (!me || me.out || s.phase === 'intro' || s.phase === 'over') {
    smooth.reset();
    return null;
  }
  const m = { ...me.m };
  let input = { ...me.input, jump: false }; // a jump the server already took is not taken again
  let knownX = m.x, knownZ = m.z, skip = skipMs;
  const lastAt = smooth.knownIndex(frames);
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    const cut = Math.min(skip, fr.dt);
    skip -= cut;
    // The frame's time on the stick as it was, then its own input from then on (as on the server).
    for (let left = fr.dt - cut; left > 1e-6; left -= STEP_MS) {
      stepMover(m, input, Math.min(STEP_MS, left), s.world, TOY_TUNING);
      if (input.jump) input = { ...input, jump: false };
    }
    input = latchInput(input, fr.inputs.length ? fr.inputs : undefined);
    if (f === lastAt) { knownX = m.x; knownZ = m.z; }
  }
  const { ox, oz } = smooth.settle(localId, frames, knownX, knownZ, m.x, m.z);
  const look = { ...input, jump: false };
  for (let left = lookMs(frames); left > 1e-6; left -= STEP_MS) stepMover(m, look, Math.min(STEP_MS, left), s.world, TOY_TUNING);
  const b = s.world.bounds;
  if (b) {
    const r = TOY_TUNING.radius;
    m.x = Math.max(b.minX + r, Math.min(b.maxX - r, m.x + ox));
    m.z = Math.max(b.minZ + r, Math.min(b.maxZ - r, m.z + oz));
  } else {
    m.x += ox;
    m.z += oz;
  }
  const players = s.players.slice();
  players[i] = { ...me, m, input };
  return { ...s, players };
}
