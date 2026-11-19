/**
 * Odd Page Out: local input. Taps and clicks on either page (Hud) and the keyboard cursor both end
 * up in one queue of taps in normalised picture coordinates; the module's `readLocalInput` drains
 * it each frame, so taps reach the rules core through the host's fixed-step input queue.
 *
 * The keyboard cursor hops between the scene's 60 slots (all of them, so it gives nothing away):
 * the arrows move it to the nearest slot that way, Enter or Space taps there.
 */
import type { Action } from '../../game/input';
import type { SpotInput } from './rules';
import { PIC_H, PIC_W } from './shapes';
import type { SlotDef } from './themes';

let queue: SpotInput[] = [];

export const local = {
  /** True while taps count (search phase, not finished, not paused). Set by the Hud. */
  open: false,
  /** The current scene's slots (for the keyboard cursor). */
  slots: [] as readonly SlotDef[],
  /** Keyboard cursor: slot index, or -1 (hidden until a key is used). */
  cursor: -1,
};

export function submitTap(x: number, y: number) {
  queue.push({ x, y });
}

export function drainTaps(): SpotInput[] {
  const q = queue;
  queue = [];
  return q;
}

export function resetLocal() {
  queue = [];
  local.open = false;
  local.cursor = -1;
  local.slots = [];
}

const DIRS: Partial<Record<Action, [number, number]>> = { left: [-1, 0], right: [1, 0], forward: [0, -1], back: [0, 1] };

/** Move the cursor to the nearest slot in a direction (the first press puts it mid-page). */
export function moveCursor(dx: number, dy: number) {
  const sl = local.slots;
  if (!sl.length) return;
  if (local.cursor < 0 || local.cursor >= sl.length) {
    let best = 0;
    for (let i = 1; i < sl.length; i++) {
      if (Math.hypot(sl[i].x - PIC_W / 2, sl[i].y - PIC_H / 2) < Math.hypot(sl[best].x - PIC_W / 2, sl[best].y - PIC_H / 2)) best = i;
    }
    local.cursor = best;
    return;
  }
  const next = nextSlot(sl, local.cursor, dx, dy);
  if (next >= 0) local.cursor = next;
}

/** The slot an arrow press moves to from slot `from` (screen direction dx, dy), or -1. Pure. */
export function nextSlot(sl: readonly SlotDef[], from: number, dx: number, dy: number): number {
  const f = sl[from];
  // Prefer things clearly that way (a cone); failing that, anything on that side of the page.
  for (const cone of [1.5, Infinity]) {
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < sl.length; i++) {
      if (i === from) continue;
      const ox = sl[i].x - f.x;
      const oy = sl[i].y - f.y;
      const along = ox * dx + oy * dy;
      const across = Math.abs(ox * dy - oy * dx);
      if (along <= 4 || across > along * cone) continue;
      const cost = along + across * 1.2;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

const ARROWS: [Action, number, number][] = [
  ['left', -1, 0],
  ['right', 1, 0],
  ['forward', 0, -1],
  ['back', 0, 1],
];

/** Shortest list of arrow presses from slot `from` to slot `to`, or null if it can't be reached. */
export function keyPath(sl: readonly SlotDef[], from: number, to: number): Action[] | null {
  const prev = new Map<number, [number, Action]>([[from, [-1, 'left']]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) {
      const out: Action[] = [];
      for (let k = to; k !== from; k = prev.get(k)![0]) out.unshift(prev.get(k)![1]);
      return out;
    }
    for (const [a, dx, dy] of ARROWS) {
      const n = nextSlot(sl, at, dx, dy);
      if (n >= 0 && !prev.has(n)) {
        prev.set(n, [at, a]);
        queue.push(n);
      }
    }
  }
  return null;
}

/** Turn this frame's presses into cursor moves and taps, in the order they happened. */
export function applyPresses(presses: readonly Action[]) {
  for (const a of presses) {
    const d = DIRS[a];
    if (d) moveCursor(d[0], d[1]);
    else if ((a === 'interact' || a === 'jump') && local.open) {
      const s = local.slots[local.cursor];
      if (s) submitTap(s.x / PIC_W, s.y / PIC_H);
      else moveCursor(0, 0);
    }
  }
}
