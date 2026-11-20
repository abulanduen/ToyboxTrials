/**
 * Unified input, sampled by the frame loop (no React state).
 *
 * Every device feeds the same *actions*: keyboard keys, the on-screen touch joystick and touch
 * buttons. Gameplay code asks `isDown('jump')` / `getMoveAxis()` and never cares which device
 * produced it. Bindings are data so a minigame can install its own map (e.g. ASJK for
 * Copycat Conductor) — and must provide a matching touch layout (see src/minigames/types.ts).
 */
import type { Action } from './actions';
/** The action type lives in actions.ts (pure, shared with the online server). */
export type { Action };

export const SLOT_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4'] as const;

/**
 * Hub emotes (keys 1–4, or the touch Emote menu). Kept out of `Action` on purpose: minigames
 * spread HUB_BINDINGS into their own maps, and emote presses must never reach a minigame's press
 * log. Only the hub's PlayerController reads them, through `wasPressed()`.
 */
export type EmoteAction = 'emote1' | 'emote2' | 'emote3' | 'emote4';
export const EMOTE_ACTIONS = ['emote1', 'emote2', 'emote3', 'emote4'] as const;
export const EMOTE_KEYS: Record<EmoteAction, string[]> = {
  emote1: ['Digit1', 'Numpad1'],
  emote2: ['Digit2', 'Numpad2'],
  emote3: ['Digit3', 'Numpad3'],
  emote4: ['Digit4', 'Numpad4'],
};
/**
 * Hub voice chat: push-to-talk (hold V, or hold the mic button on touch; src/net/voiceChat.ts).
 * Like the emotes it is not an `Action`, so it never reaches a minigame's bindings or press log.
 * V is free in the Hub (movement is WASD/arrows, E interact, H the controls card).
 */
export type VoiceAction = 'talk';
export const VOICE_KEYS: Record<VoiceAction, string[]> = { talk: ['KeyV'] };
/** Any action a device can trigger. */
export type InputAction = Action | EmoteAction | VoiceAction;
const isEmoteAction = (a: InputAction): a is EmoteAction => a in EMOTE_KEYS;
const isVoiceAction = (a: InputAction): a is VoiceAction => a in VOICE_KEYS;
/**
 * Voice presses not yet taken by voice chat. Kept apart from the per-frame edge sets, which the Hub's
 * PlayerController clears at the end of its frame: a tap shorter than a frame (a quick click on a
 * slow phone) must still count once.
 */
const voicePresses: Record<VoiceAction, number> = { talk: 0 };

export const HUB_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: ['KeyE', 'Enter'],
  run: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  slot1: [],
  slot2: [],
  slot3: [],
  slot4: [],
};

/** Minigames with four slots use A S J K (plus D F J K / 1-4 as alternates); movement is off. */
export const SLOT_BINDINGS: Record<Action, string[]> = {
  forward: [],
  back: [],
  left: [],
  right: [],
  jump: [],
  interact: [],
  run: [],
  pause: ['Escape', 'KeyP'],
  slot1: ['KeyA', 'Digit1', 'ArrowLeft'],
  slot2: ['KeyS', 'Digit2', 'ArrowDown'],
  slot3: ['KeyJ', 'Digit3', 'ArrowUp'],
  slot4: ['KeyK', 'Digit4', 'ArrowRight'],
};

const down = new Set<string>();
const pressedThisFrame = new Set<string>();
/** Every action press since the last frame, in the order it happened (keys, taps, touch buttons). */
const pressLog: Action[] = [];
/**
 * High-resolution time of each press in `pressLog` (same index), on the performance.now() clock.
 * Timing-critical games (Music Box Rhythm) judge against these instead of the frame they are read in.
 */
const pressTimes: number[] = [];

/**
 * Best timestamp for a press: the event's own timeStamp when it is on the performance.now()
 * timeline and recent (it is taken when the OS delivered the input, before any main-thread
 * queueing); otherwise the time the handler ran.
 */
export function pressStamp(eventTime?: number): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  // (A handler can run seconds after the event on a stalled main thread; a timeStamp on another
  // timeline — some older browsers use the epoch — is off by far more than that.)
  return eventTime !== undefined && eventTime > 0 && eventTime <= now + 1 && now - eventTime < 10_000 ? eventTime : now;
}

function logPress(a: Action, eventTime?: number) {
  pressLog.push(a);
  pressTimes.push(pressStamp(eventTime));
}

function logKeyPress(code: string, eventTime?: number) {
  for (const a of Object.keys(bindings) as Action[]) if (bindings[a].includes(code)) logPress(a, eventTime);
}
let mouseDX = 0;
let mouseDY = 0;
let bindings = HUB_BINDINGS;

// ---- virtual (touch) input ----
const virtualDown = new Set<InputAction>();
const virtualPressed = new Set<InputAction>();
/** Joystick vector: x = right, y = forward. Magnitude 0..1. */
const stick = { x: 0, y: 0 };

/** Joystick push beyond this counts as running. */
export const STICK_RUN_THRESHOLD = 0.92;

/** A text box, text area, select or editable element has the key (the game ignores it; so must other key handlers). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;
  if (!down.has(e.code)) {
    pressedThisFrame.add(e.code);
    if (!e.repeat) for (const a of Object.keys(VOICE_KEYS) as VoiceAction[]) if (VOICE_KEYS[a].includes(e.code)) voicePresses[a]++;
    if (!e.repeat) logKeyPress(e.code, e.timeStamp);
  }
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

const keysFor = (a: InputAction): readonly string[] => (isEmoteAction(a) ? EMOTE_KEYS[a] : isVoiceAction(a) ? VOICE_KEYS[a] : bindings[a]);

export function isDown(a: InputAction): boolean {
  return virtualDown.has(a) || keysFor(a).some((c) => down.has(c));
}

/** Edge-triggered: true once per physical press, until endFrame() is called. */
export function wasPressed(a: InputAction): boolean {
  return virtualPressed.has(a) || keysFor(a).some((c) => pressedThisFrame.has(c));
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
/** `eventTime`: the pointer/touch event's timeStamp, for timing-critical games (optional). */
export function pressVirtual(a: Action, eventTime?: number) {
  if (!virtualDown.has(a)) {
    virtualPressed.add(a);
    logPress(a, eventTime);
  }
  virtualDown.add(a);
}
export function releaseVirtual(a: Action) {
  virtualDown.delete(a);
}
/** One-shot tap (press + release on the next frame). Emote taps never enter the press log. */
export function tapVirtual(a: InputAction, eventTime?: number) {
  virtualPressed.add(a);
  if (!isEmoteAction(a) && !isVoiceAction(a)) logPress(a, eventTime);
}
/** Hold or let go of a Hub-only action from a touch button (the mic button's push-to-talk). Never logged as a press. */
export function holdVirtual(a: VoiceAction, held: boolean) {
  if (held && !virtualDown.has(a)) voicePresses[a]++;
  if (held) virtualDown.add(a);
  else virtualDown.delete(a);
}
/** How many times a voice action was pressed (key or touch) since the last call; resets the count. */
export function takePresses(a: VoiceAction): number {
  const n = voicePresses[a];
  voicePresses[a] = 0;
  return n;
}

/** Ordered presses since the last frame (for minigames where order matters, e.g. Copycat). */
export function getPressLog(): readonly Action[] {
  return pressLog;
}

/** performance.now()-clock time of each entry in `getPressLog()` (parallel array, same frame lifetime). */
export function getPressTimes(): readonly number[] {
  return pressTimes;
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
  pressLog.length = 0;
  pressTimes.length = 0;
}

/** Used by UI layers (pause menu) to drop held keys so the toy doesn't keep walking. */
export function clearInput() {
  voicePresses.talk = 0;
  down.clear();
  pressedThisFrame.clear();
  virtualDown.clear();
  virtualPressed.clear();
  pressLog.length = 0;
  pressTimes.length = 0;
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
