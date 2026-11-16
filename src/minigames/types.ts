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

export interface MinigameDefinition {
  id: MinigameId;
  title: string;
  tagline: string;
  accent: string;
  players: { min: number; max: number };
  /** Human-readable key map, shown on the intro card. */
  controls: { keys: string; action: string }[];
  status: 'playable' | 'integrating' | 'planned';
  /** Lazy so each minigame is code-split and loaded only when entered. */
  load?: () => Promise<{ default: ComponentType<{ host: MinigameHost }> }>;
}
