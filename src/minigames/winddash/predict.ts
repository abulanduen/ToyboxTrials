/**
 * Online own-toy prediction for Wind-Up Dash (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * Without it your toy answered the stick a network round trip late. Your client replays its own
 * not-yet-stepped stick input on the newest server state with the rules' own movement
 * (`moveDashToy`: the stick, the jam, the road's edges, the tape belts) against the course's walls
 * at each moment (`dashWorld`: dominoes, jaws, crayon doors, tops), in 60 Hz steps. What traps do
 * to a toy (a jaw's snap, a marble or the pendulum bowling it over, a top's bounce, the spring) and
 * the toppling of dominoes stay the server's: the next snapshot shows them, and a jump that big is
 * drawn at once. Nothing is predicted while the toy is thrown, stunned or home.
 */
import { latchInput } from '../shared/movement';
import { PredictSmoother } from '../shared/predictSmooth';
import type { PredictFrame } from '../types';
import { dashWorld, moveDashToy, type DashInput, type DashState } from './rules';

const STEP_MS = 1000 / 60;

/**
 * Offline, a key moves the toy over the frame it was read in; the replay only starts it on the next
 * frame. So the drawn toy runs on by the newest frame's time on the newest input (at most 50 ms):
 * the same feel, one frame sooner. It is added after the smoothing, which only sees the replay.
 */
const LOOK_MAX_MS = 50;
const lookMs = (frames: readonly PredictFrame<unknown>[]) => Math.min(frames.length ? frames[frames.length - 1].dt : 0, LOOK_MAX_MS);
const smooth = new PredictSmoother();

export function predictDash(s: DashState, localId: string, frames: readonly PredictFrame<DashInput>[], skipMs = 0): DashState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  if (!me || s.phase !== 'race' || me.finished || me.toss || me.stunMs > 0) {
    smooth.reset();
    return null;
  }
  const p = { ...me, m: { ...me.m } };
  let input = { ...me.input, jump: false }; // a jump the server already took is not taken again
  let t = s.t, skip = skipMs;
  let knownX = p.m.x, knownZ = p.m.z;
  const lastAt = smooth.knownIndex(frames);
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    const cut = Math.min(skip, fr.dt);
    skip -= cut;
    // The frame's time on the stick as it was, then its own input from then on (as on the server).
    for (let left = fr.dt - cut; left > 1e-6; left -= STEP_MS) {
      const dt = Math.min(STEP_MS, left);
      t += dt;
      moveDashToy(s, p, input, dt, dashWorld(s, t));
      if (input.jump) input = { ...input, jump: false };
    }
    input = latchInput(input, fr.inputs.length ? fr.inputs : undefined);
    if (f === lastAt) { knownX = p.m.x; knownZ = p.m.z; }
  }
  const { ox, oz } = smooth.settle(localId, frames, knownX, knownZ, p.m.x, p.m.z);
  const look = { ...input, jump: false };
  for (let left = lookMs(frames); left > 1e-6; left -= STEP_MS) {
    const dt = Math.min(STEP_MS, left);
    t += dt;
    moveDashToy(s, p, look, dt, dashWorld(s, t));
  }
  p.m.x += ox;
  p.m.z += oz;
  p.input = input;
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players };
}

