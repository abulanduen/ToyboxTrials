/**
 * Shared by the tile games' online own-toy prediction (Midnight Hunger, Inferno Escape; see
 * `predictLocal` in ../types.ts and ../remote.ts). Both are held-input games (`heldInputs` in
 * ../facts.ts).
 *
 * `replayHeld` gives the input timeline the server steps. A frame's time passes first, then its
 * inputs act, as the server steps a message when it arrives; the snapshot already holds the first
 * `skipMs` of that time. After that the server keeps stepping the same inputs every step until the
 * next ones arrive (for up to HELD_INPUT_MS), so a held direction keeps hopping the toy between
 * messages; that starts with the newest message it has stepped (`held`).
 *
 * When the server steps each message is only known to about one of its ticks, so a hop near the
 * moment you let go can be guessed either way. `GridSettle` keeps such a hop on screen until the
 * server has had time to make it, instead of taking it back and showing it again.
 */
import { HELD_INPUT_MS, MATCH_TICK_HZ } from '../../net/protocol';
import { predictClock } from './predictSmooth';
import type { PredictFrame } from '../types';

export { predictClock };

const STEP_MS = 1000 / 60;
/** The server takes in messages once per tick (two rules steps). */
const TICK_MS = 1000 / MATCH_TICK_HZ;
/**
 * A predicted hop waits this long past the rules' cooldown. When the server steps each message is
 * only known to about a tick, so a hop near the moment you let go can go either way: a hop shown a
 * little late is never seen (the server is a round trip behind anyway), one too many is taken back.
 */
export const HOP_SLACK_MS = TICK_MS;

/**
 * Call `apply(t, inputs)` in order at each match time the server would step these inputs. Times are
 * on the server's step grid (a cooldown ends on the first step after it, so a 220 ms one lasts
 * 233 ms there: unrounded times gained a step per hop and ran a hop ahead).
 */
export function replayHeld<Input>(t0: number, frames: readonly PredictFrame<Input>[], skipMs: number, held: readonly Input[], apply: (t: number, inputs: readonly Input[]) => void) {
  const tickSteps = Math.round(TICK_MS / STEP_MS);
  let t = t0, skip = skipMs;
  let heldUntil = t0 - skipMs + HELD_INPUT_MS;
  let done = 0; // steps after t0 already replayed
  for (const fr of frames) {
    const cut = Math.min(skip, fr.dt);
    skip -= cut;
    t += fr.dt - cut;
    const k = Math.max(done, Math.ceil((t - t0) / STEP_MS - 1e-6));
    // Repeats stop a server tick short of the next inputs: a hop shown too few is caught up, while
    // one too many would be taken back.
    if (held.length) for (let j = done + 1; j <= k - tickSteps && t0 + j * STEP_MS <= heldUntil; j++) apply(t0 + j * STEP_MS, held);
    apply(t0 + k * STEP_MS, fr.inputs);
    done = k;
    held = fr.inputs;
    heldUntil = t + HELD_INPUT_MS;
  }
}

interface Cell { x: number; z: number }
const dist = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/** How long a shown hop is kept while the server has not made it yet (about a tick past a late guess). */
const KEEP_MS = 250;

export class GridSettle {
  private id = '';
  private shown: Cell | null = null;
  /** When the replay started falling back from the shown cell (−1: it is not). */
  private backSince = -1;
  private last = 0;

  reset() {
    this.shown = null;
    this.backSince = -1;
  }

  /**
   * The cell to draw the local toy on, given the server's cell and the replay's. A replay that falls
   * one hop back towards the server's cell (a new snapshot put the hop's moment a little later, or
   * the server is about to make it from a held input) keeps the shown cell for up to KEEP_MS.
   */
  settle(id: string, server: Cell, predicted: Cell): Cell {
    const now = predictClock.now();
    // A long gap (a new match, a phase without prediction): nothing to carry over.
    if (now - this.last > 500 || now < this.last) this.reset();
    this.last = now;
    if (this.id !== id) this.reset();
    this.id = id;
    const shown = this.shown;
    if (shown && dist(predicted, server) < dist(shown, server) && dist(shown, predicted) === 1) {
      if (this.backSince < 0) this.backSince = now;
      if (now - this.backSince < KEEP_MS) return shown;
    }
    this.backSince = -1;
    this.shown = { ...predicted };
    return predicted;
  }
}
