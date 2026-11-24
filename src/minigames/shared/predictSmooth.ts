/**
 * Shared by the games' online own-toy prediction (`predictLocal`, see ../types.ts and ../remote.ts).
 *
 * The prediction replays a toy's unstepped inputs on the newest server state. Each new snapshot can
 * shift the replayed position slightly (the server stepped an input a little earlier or later than
 * the client counted). That jump is folded into an offset which fades over about a tenth of a
 * second, so the toy glides rather than twitches; a big jump (a respawn, a teleport, a push by
 * another toy the client could not know about) is shown at once.
 */

/** The fade's clock (tests drive their own). */
export const predictClock = { now: () => performance.now() };

export class PredictSmoother {
  private on = false;
  private id = '';
  private rawX = 0;
  private rawZ = 0;
  private ox = 0;
  private oz = 0;
  private at = 0;
  private last: object | null = null;

  /** Jumps bigger than `snap` (cm) are shown at once; smaller ones fade with this e-folding time (ms). */
  constructor(private readonly snap = 4, private readonly fadeMs = 90) {}

  /** Nothing is predicted now: start afresh next time. */
  reset() {
    this.on = false;
    this.last = null;
  }

  /**
   * Where last time's newest frame now sits in `frames` (−1: stepped by the server since, or none).
   * The replay's position just after that frame (`known`) equals last time's result unless a new
   * snapshot moved it: that difference is the correction.
   */
  knownIndex(frames: readonly object[]): number {
    return this.last ? frames.indexOf(this.last) : -1;
  }

  /** Given the replay's positions (after the known frames, and after all of them), the offset to draw the toy at. */
  settle(id: string, frames: readonly object[], knownX: number, knownZ: number, rawX: number, rawZ: number): { ox: number; oz: number } {
    const now = predictClock.now();
    // A long gap (a new match, a phase without prediction): nothing to carry over.
    if (this.on && this.id === id && now - this.at < 500) {
      const dx = knownX - this.rawX;
      const dz = knownZ - this.rawZ;
      if (Math.hypot(dx, dz) > this.snap) this.ox = this.oz = 0;
      else {
        this.ox -= dx;
        this.oz -= dz;
      }
      const k = Math.exp(-Math.max(0, now - this.at) / this.fadeMs);
      this.ox *= k;
      this.oz *= k;
    } else this.ox = this.oz = 0;
    this.on = true;
    this.id = id;
    this.at = now;
    this.rawX = rawX;
    this.rawZ = rawZ;
    this.last = frames.length ? frames[frames.length - 1] : null;
    return { ox: this.ox, oz: this.oz };
  }
}
