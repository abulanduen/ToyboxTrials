/**
 * Unified input, sampled by the frame loop (no React state).
 *
 * Every device feeds the same *actions*: keyboard keys, the on-screen touch joystick and touch
 * buttons. Gameplay code asks `isDown('jump')` / `getMoveAxis()` and never cares which device
 * produced it. Bindings are data so a minigame can install its own map (e.g. ASJK for
 * Copycat Conductor) — and must provide a matching touch layout (see src/minigames/types.ts).
 */
export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'interact' | 'run' | 'pause';

export const HUB_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: ['KeyE', 'Enter'],
  run: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
};

const down = new Set<string>();
const pressedThisFrame = new Set<string>();
let mouseDX = 0;
let mouseDY = 0;
let bindings = HUB_BINDINGS;

// ---- virtual (touch) input ----
const virtualDown = new Set<Action>();
const virtualPressed = new Set<Action>();
/** Joystick vector: x = right, y = forward. Magnitude 0..1. */
const stick = { x: 0, y: 0 };

/** Joystick push beyond this counts as running. */
export const STICK_RUN_THRESHOLD = 0.92;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;
  if (!down.has(e.code)) pressedThisFrame.add(e.code);
  down.add(e.code);
  // Stop the page scrolling on Space / arrows while playing.
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
}
function onKeyUp(e: KeyboardEvent) {
  down.delete(e.code);
}
function onBlur() {
  down.clear();
  virtualDown.clear();
  stick.x = stick.y = 0;
}

let installed = false;
export function installInput() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
}

export function setBindings(b: Record<Action, string[]>) {
  bindings = b;
}

export function isDown(a: Action): boolean {
  return virtualDown.has(a) || bindings[a].some((c) => down.has(c));
}

/** Edge-triggered: true once per physical press, until endFrame() is called. */
export function wasPressed(a: Action): boolean {
  return virtualPressed.has(a) || bindings[a].some((c) => pressedThisFrame.has(c));
}

/**
 * Analog move vector in "input space": x = right, y = forward, magnitude 0..1.
 * Keyboard gives full-magnitude 8-way input; the touch stick gives analog input.
 */
export function getMoveAxis(): { x: number; y: number; magnitude: number } {
  let x = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  let y = (isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0);
  if (stick.x !== 0 || stick.y !== 0) {
    x += stick.x;
    y += stick.y;
  }
  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x, y, magnitude: Math.min(1, m) };
}

/** True when the touch stick is pushed hard enough to run. */
export function stickRunning(): boolean {
  return Math.hypot(stick.x, stick.y) >= STICK_RUN_THRESHOLD;
}

// ---- virtual input API (used by on-screen touch controls) ----
export function setStick(x: number, y: number) {
  stick.x = x;
  stick.y = y;
}
export function pressVirtual(a: Action) {
  if (!virtualDown.has(a)) virtualPressed.add(a);
  virtualDown.add(a);
}
export function releaseVirtual(a: Action) {
  virtualDown.delete(a);
}
/** One-shot tap (press + release on the next frame). */
export function tapVirtual(a: Action) {
  virtualPressed.add(a);
}

export function addMouseDelta(dx: number, dy: number) {
  mouseDX += dx;
  mouseDY += dy;
}

export function consumeMouseDelta(): [number, number] {
  const r: [number, number] = [mouseDX, mouseDY];
  mouseDX = 0;
  mouseDY = 0;
  return r;
}

export function endFrame() {
  pressedThisFrame.clear();
  virtualPressed.clear();
}

/** Used by UI layers (pause menu) to drop held keys so the toy doesn't keep walking. */
export function clearInput() {
  down.clear();
  pressedThisFrame.clear();
  virtualDown.clear();
  virtualPressed.clear();
  stick.x = stick.y = 0;
  mouseDX = 0;
  mouseDY = 0;
}

// ---- device detection ----
/** Primary pointer is a finger (phones, most tablets). Re-evaluated on first touch. */
export const device = {
  touch:
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0 && !window.matchMedia?.('(pointer: fine)').matches),
};
