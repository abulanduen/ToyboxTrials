/**
 * Snapshot interpolation for remote players. Pure (no DOM, no three.js): the frame loop renders
 * each remote toy about INTERP_DELAY_MS behind the newest snapshot, blending between the two
 * snapshots around that moment, so 15 Hz updates look smooth.
 */
export interface NetSample {
  /** Server time (ms). */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  grounded: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Shortest-way angle blend. */
export function lerpAngle(a: number, b: number, k: number): number {
  return wrap(a + wrap(b - a) * k);
}

/** Longest a toy is extrapolated past its newest snapshot before it just holds still (ms). */
export const MAX_EXTRAPOLATE_MS = 120;

export class SnapshotBuffer {
  private items: NetSample[] = [];

  push(s: NetSample) {
    const last = this.items[this.items.length - 1];
    if (last && s.t <= last.t) return; // late or duplicate
    this.items.push(s);
    if (this.items.length > 32) this.items.splice(0, this.items.length - 32);
  }

  get size() {
    return this.items.length;
  }

  latest(): NetSample | undefined {
    return this.items[this.items.length - 1];
  }

  /** Position at server time `t`, written into `out` (which is returned). */
  sample(t: number, out: NetSample): NetSample | null {
    const it = this.items;
    if (!it.length) return null;
    if (t <= it[0].t) return Object.assign(out, it[0], { t });
    for (let i = it.length - 1; i > 0; i--) {
      const a = it[i - 1];
      const b = it[i];
      if (t >= a.t && t <= b.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        out.t = t;
        out.x = a.x + (b.x - a.x) * k;
        out.y = a.y + (b.y - a.y) * k;
        out.z = a.z + (b.z - a.z) * k;
        out.yaw = lerpAngle(a.yaw, b.yaw, k);
        out.speed = a.speed + (b.speed - a.speed) * k;
        out.grounded = k < 0.5 ? a.grounded : b.grounded;
        return out;
      }
    }
    // Past the newest snapshot: carry on along the last step a little, then hold.
    const b = it[it.length - 1];
    const a = it.length > 1 ? it[it.length - 2] : b;
    const ahead = Math.min(t - b.t, MAX_EXTRAPOLATE_MS);
    const k = b.t === a.t ? 0 : ahead / (b.t - a.t);
    Object.assign(out, b, { t });
    out.x = b.x + (b.x - a.x) * k;
    out.z = b.z + (b.z - a.z) * k;
    return out;
  }
}

/**
 * Estimates the server clock from snapshot timestamps. offset = serverTime − localTime; the
 * largest sample is the one with the least network delay, so the estimate follows the maximum
 * and decays slowly (so clock drift and route changes are picked up).
 */
export class ClockSync {
  private offset: number | null = null;

  update(serverNow: number, localNow: number) {
    const sample = serverNow - localNow;
    if (this.offset === null || sample > this.offset || this.offset - sample > 1000) this.offset = sample;
    else this.offset -= 0.25; // ~4 ms/s at 15 Hz
  }

  reset() {
    this.offset = null;
  }

  /** Server time now, or null before the first snapshot. */
  serverTime(localNow: number): number | null {
    return this.offset === null ? null : localNow + this.offset;
  }
}
