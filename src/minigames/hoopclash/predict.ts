/**
 * Online own-toy prediction for Hoop Clash (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * Online, the server runs the game: without this, your toy and your shot meter only answered a
 * round trip after you pressed. Here your client replays its own unstepped inputs on the newest
 * server state with the rules' own per-toy movement (`moveToy`), in fixed steps like the rules,
 * so your toy moves, plants its feet for a shot and turns at once, and the meter winds from the
 * moment you press. On letting go, the meter value you saw goes with the input (`charge`), and the
 * rules honour it within CHARGE_CLAIM of their own count, so the power you saw is the power you get.
 *
 * Predicted: your toy's movement, facing and shot charge. Not predicted: the ball, passes, steals,
 * other toys, and being pushed by them (each new snapshot corrects those; small corrections fade in,
 * ../shared/predictSmooth.ts).
 */
import { clampToCourt, isFrozen, moveToy, STEP_MS, type HoopInput, type HoopState } from './rules';
import { PredictSmoother } from '../shared/predictSmooth';
import type { PredictFrame } from '../types';

const smooth = new PredictSmoother();
const fin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

export function predictHoop(s: HoopState, localId: string, frames: readonly PredictFrame<HoopInput>[], skipMs = 0): HoopState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  if (!me || me.ai || isFrozen(s)) {
    smooth.reset();
    return null;
  }
  const p = { ...me, in: { ...me.in } };
  let knownX = p.x, knownZ = p.z, skip = skipMs;
  const lastAt = smooth.knownIndex(frames);
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    // The frame's time on the inputs as they were (less what the state already holds: `skipMs`),
    // in the rules' own steps (charge counts up first, as there).
    const cut = Math.min(skip, fr.dt);
    skip -= cut;
    for (let left = fr.dt - cut; left > 1e-6; left -= STEP_MS) {
      const dt = Math.min(STEP_MS, left);
      if (p.charge >= 0) p.charge += dt;
      p.hop = false; // hops come from the server (a swipe or a jump shot)
      moveToy(s, p, dt);
    }
    // Then its inputs, as the rules take them (only what concerns your own toy).
    for (const inp of fr.inputs) {
      if (inp.type === 'cancel' || inp.type === 'pass') {
        p.charge = -1;
        continue;
      }
      if (inp.type !== 'in') continue;
      let ax = fin(inp.ax), ay = fin(inp.ay);
      const m = Math.hypot(ax, ay);
      if (m > 1) (ax /= m), (ay /= m);
      const was = p.in.act;
      p.in = { ax, ay, run: !!inp.run, act: !!inp.act };
      if (p.in.act && !was && s.ball.holder === p.id && s.phase === 'live') {
        p.charge = 0; // a set shot: plant your feet
        p.vx = p.vz = 0;
      } else if (!p.in.act && was) p.charge = -1; // the shot is away (the ball follows with the server)
    }
    if (f === lastAt) { knownX = p.x; knownZ = p.z; }
  }
  const { ox, oz } = smooth.settle(localId, frames, knownX, knownZ, p.x, p.z);
  p.x += ox;
  p.z += oz;
  clampToCourt(p);
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players };
}
