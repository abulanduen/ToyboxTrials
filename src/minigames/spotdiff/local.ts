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
  const from = sl[local.cursor];
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < sl.length; i++) {
    if (i === local.cursor) continue;
    const ox = sl[i].x - from.x;
    const oy = sl[i].y - from.y;
    const along = ox * dx + oy * dy;
    const across = Math.abs(ox * dy - oy * dx);
    if (along <= 4 || across > along * 1.5) continue;
    const cost = along + across * 2.5;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  if (best >= 0) local.cursor = best;
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
