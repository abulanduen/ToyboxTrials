/**
 * Minigame module contract (design draft — Milestone 4+).
 *
 * Each trial is a self-contained module that owns its scene, rules, controls, timer, scoring,
 * win/loss logic, audio and VFX. It receives shared services (character identity, audio bus,
 * settings, results/progression) from the host and never re-implements them.
 *
 * The rules core is deliberately framework-free (`step(state, inputs, dt)`), so the same logic can
 * later run on a server or be replayed for networking. The React/three layer only renders state.
 */
import type { ComponentType } from 'react';
import type { PaintJob } from '../game/palette';

export type MinigameId =
  | 'copycat-conductor'
  | 'inferno-escape'
  | 'midnight-hunger'
  | 'find-the-original'
  | 'red-light-green-light'
  | 'blink-duel'
  | 'wind-up-dash'
  | 'music-box-rhythm'
  | 'toy-squad'
  | 'spellbox-showdown'
  | 'toybox-trivia';

export interface Contestant {
  id: string;
  name: string;
  paint: PaintJob;
  isLocal: boolean;
}

/** Shared services the host passes into every minigame. */
export interface MinigameHost {
  contestants: Contestant[];
  /** Plays a named sound through the shared, volume-respecting audio bus. */
  playSfx: (name: string) => void;
  /** Ends the round and hands results to the shared results screen. */
  finish: (result: MinigameResult) => void;
  /** Leave without results (pause menu → quit). */
  exit: () => void;
}

export interface MinigameResult {
  minigame: MinigameId;
  /** Ordered best → worst. */
  placements: { contestantId: string; score: number; eliminated?: boolean }[];
  durationMs: number;
  /** Minigame-specific record fields (e.g. longest sequence). */
  records?: Record<string, number>;
}

/** Pure rules core. No DOM, no three.js, no timers — deterministic given inputs. */
export interface RulesCore<State, Input> {
  init(contestants: Contestant[], seed: number): State;
  step(state: State, inputs: Record<string, Input[]>, dtMs: number): State;
  isOver(state: State): boolean;
  result(state: State): Omit<MinigameResult, 'minigame'>;
}

/**
 * Touch layout — REQUIRED for every minigame (Toybox Trials is a web game that must be fully
 * playable on phones and tablets). Controls feed the shared action layer in src/game/input.ts,
 * so the rules core never knows which device is in use.
 */
export interface TouchLayout {
  /** How the player moves, if at all. */
  movement: 'joystick' | 'none' | 'tap-to-target' | 'swipe';
  /** Look/aim: drag on the scene, or fixed camera. */
  look: 'drag' | 'none';
  /** On-screen buttons (≥ 56 px, thumb-reachable, right side unless stated). */
  buttons: { id: string; label: string; colour?: string; hold?: boolean }[];
  /** Orientations the game is designed for. Both, unless there's a strong reason. */
  orientation: 'any' | 'landscape' | 'portrait';
  /** Anything special: e.g. "instruments are the buttons — tap them directly". */
  notes?: string;
}

export interface MinigameDefinition {
  id: MinigameId;
  title: string;
  tagline: string;
  accent: string;
  players: { min: number; max: number };
  /** Human-readable key map, shown on the intro card. */
  controls: { keys: string; action: string }[];
  /** Mobile/touch controls. Required: a minigame without a touch layout is not shippable. */
  touch: TouchLayout;
  status: 'playable' | 'integrating' | 'planned';
  /** Lazy so each minigame is code-split and loaded only when entered. */
  load?: () => Promise<{ default: ComponentType<{ host: MinigameHost }> }>;
}
