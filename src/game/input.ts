/**
 * Keyboard + mouse input, sampled by the frame loop (no React state).
 * Bindings are data so a minigame can install its own map (e.g. ASJK for Copycat Conductor)
 * without fighting the hub's WASD controls.
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
  return bindings[a].some((c) => down.has(c));
}

/** Edge-triggered: true once per physical press, until endFrame() is called. */
export function wasPressed(a: Action): boolean {
  return bindings[a].some((c) => pressedThisFrame.has(c));
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
}

/** Used by UI layers (pause menu) to drop held keys so the toy doesn't keep walking. */
export function clearInput() {
  down.clear();
  pressedThisFrame.clear();
  mouseDX = 0;
  mouseDY = 0;
}
