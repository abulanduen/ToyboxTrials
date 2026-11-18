/**
 * Local picks. Taps and clicks on the crowd (Scene) and the keyboard cursor both end up here; the
 * module's `readLocalInput` drains the queue each frame, so picks reach the rules core through the
 * same fixed-step input queue as key and touch presses.
 *
 * The Scene also publishes where each toy currently is on screen (CSS pixels). Both the tap picker
 * and the keyboard cursor work in screen space, so they behave the same in portrait and landscape.
 */
import type { Action } from '../../game/input';

export const MAX_TOYS = 36;

let queue: number[] = [];

/** Screen-space crowd, refreshed by the Scene every frame. */
export const crowd = {
  count: 0,
  /** x, y of each toy's middle and its on-screen half-height, in CSS px. */
  x: new Float32Array(MAX_TOYS),
  y: new Float32Array(MAX_TOYS),
  r: new Float32Array(MAX_TOYS),
  /** False while picks can't be taken (card showing, round revealed, paused). */
  open: false,
};

/** Keyboard cursor: the toy it is on, or -1. Shown once a key has been used. */
export const cursor = { index: -1 };

export function submitPick(i: number) {
  queue.push(i);
}

export function drainPicks(): number[] {
  const q = queue;
  queue = [];
  return q;
}

export function resetLocal() {
  queue = [];
  cursor.index = -1;
  crowd.count = 0;
  crowd.open = false;
}

/** Fingers are blunt: a tap within this many px of a toy's middle always counts. */
export const MIN_PICK_RADIUS = 34;

/** The toy under a tap/click at (px, py), or -1. Nearest wins when targets overlap. */
export function toyAt(px: number, py: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < crowd.count; i++) {
    const dx = px - crowd.x[i];
    const dy = py - crowd.y[i];
    const r = Math.max(MIN_PICK_RADIUS, crowd.r[i] * 1.15);
    // Toys are taller than they are wide: an ellipse, normalised so 1 = the edge of the target.
    const d = Math.hypot(dx / Math.max(MIN_PICK_RADIUS, r * 0.8), dy / r);
    if (d <= 1 && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const DIRS: Partial<Record<Action, [number, number]>> = { left: [-1, 0], right: [1, 0], forward: [0, -1], back: [0, 1] };

/** Move the cursor to the nearest toy in a screen direction (first press puts it mid-crowd). */
function moveCursor(dx: number, dy: number) {
  if (!crowd.count) return;
  if (cursor.index < 0 || cursor.index >= crowd.count) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < crowd.count; i++) {
      cx += crowd.x[i] / crowd.count;
      cy += crowd.y[i] / crowd.count;
    }
    let best = 0;
    for (let i = 1; i < crowd.count; i++) {
      if (Math.hypot(crowd.x[i] - cx, crowd.y[i] - cy) < Math.hypot(crowd.x[best] - cx, crowd.y[best] - cy)) best = i;
    }
    cursor.index = best;
    return;
  }
  const from = cursor.index;
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < crowd.count; i++) {
    if (i === from) continue;
    const ox = crowd.x[i] - crowd.x[from];
    const oy = crowd.y[i] - crowd.y[from];
    const along = ox * dx + oy * dy;
    const across = Math.abs(ox * dy - oy * dx);
    if (along <= 4 || across > along * 1.2) continue; // must be clearly that way
    const cost = along + across * 2.5;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  if (best >= 0) cursor.index = best;
}

/** Turn this frame's action presses into cursor moves and picks, in the order they happened. */
export function applyPresses(presses: readonly Action[]) {
  for (const a of presses) {
    const d = DIRS[a];
    if (d) moveCursor(d[0], d[1]);
    else if ((a === 'interact' || a === 'jump') && crowd.open) {
      if (cursor.index >= 0 && cursor.index < crowd.count) submitPick(cursor.index);
      else moveCursor(0, 0);
    }
  }
}
