/**
 * Minigame module contract (GAME_DESIGN.md §5).
 *
 * Every trial is a self-contained, lazy-loaded module:
 *   - a deterministic **rules core** (no DOM, no three.js, no timers, seeded RNG), which can run
 *     unchanged on a future authoritative game server;
 *   - an optional **bot policy** so solo players always have opponents;
 *   - a **Scene** (react-three-fiber content placed on the table) and a **Hud** (DOM overlay).
 *
 * The shared host owns everything else: loading, intro card, countdown, pause, results,
 * tournament scoring, records, input bindings. The tournament controller never needs
 * game-specific logic to know a round has finished — it asks `rules.isOver()`.
 */
import type { ComponentType } from 'react';
import type { PaintJob } from '../game/palette';
import type { Accessories, HatId, KeySkinId } from '../game/cosmetics';
import type { Action } from '../game/actions';
import type { MinigameId } from './ids';
import type { TournamentFormat } from './tournament';

/** The id list lives in `ids.ts` (pure data the online server can import). */
export type { MinigameId };

export type MinigameCategory = 'memory' | 'survival' | 'observation' | 'reflex' | 'pvp' | 'racing' | 'rhythm' | 'strategy' | 'knowledge';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface Contestant {
  id: string;
  name: string;
  paint: PaintJob;
  hat: HatId;
  keySkin: KeySkinId;
  /** Back/face/neck accessories (the local player's full WindupBot shows them; MiniContender ignores them). */
  accessories?: Accessories;
  isLocal: boolean;
  /** Undefined for humans. */
  bot?: BotDifficulty;
}

export interface Placement {
  contestantId: string;
  /** 1-based; tied contestants share a place. */
  place: number;
  /** Game-specific score (rounds survived, points, time…), for display and records. */
  score: number;
  eliminated?: boolean;
  forfeit?: boolean;
}

export interface MinigameResult {
  minigame: MinigameId;
  placements: Placement[];
  durationMs: number;
  /** Game-specific stats for records (e.g. longest sequence). */
  stats?: Record<string, number>;
}

/** Deterministic rules core. Mutating `state` in place is allowed; it must not touch globals. */
export interface RulesCore<State, Input, Config = Record<string, never>> {
  init(contestants: Contestant[], seed: number, config?: Partial<Config>): State;
  /** Advance by dtMs, applying inputs that arrived since the last step (keyed by contestant id). */
  step(state: State, inputs: Record<string, Input[]>, dtMs: number): State;
  isOver(state: State): boolean;
  result(state: State): Omit<MinigameResult, 'minigame'>;
  /** Events produced during the last step (sounds/animations for the render layer). Host drains them. */
  drainEvents(state: State): MatchEvent[];
}

/** A rules-core event the Scene/Hud react to (e.g. `{ type: 'note', slot: 2 }`). */
export interface MatchEvent {
  type: string;
  [k: string]: unknown;
}

/** Bot policy: decides a bot's inputs each step from the (shared) state. Own seeded RNG. */
export interface BotPolicy<State, Input> {
  decide(state: State, bot: Contestant, dtMs: number, rng: () => number): Input[];
}

export interface MinigameSceneProps<State> {
  /** Live state (mutable object; read it in useFrame, don't copy into React state). */
  getState: () => State | null;
  contestants: Contestant[];
  localId: string;
}

export interface MinigameModule<State = unknown, Input = unknown> {
  rules: RulesCore<State, Input>;
  /** Fresh bot policy per match (policies may keep per-match memory). */
  createBot?: () => BotPolicy<State, Input>;
  /** Keyboard bindings while this game runs (e.g. SLOT_BINDINGS). */
  bindings: Record<Action, string[]>;
  /** Turn this frame's local presses (keyboard / touch / taps, in the order they happened) into inputs. */
  readLocalInput(presses: readonly Action[]): Input[];
  Scene: ComponentType<MinigameSceneProps<State>>;
  Hud: ComponentType<MinigameSceneProps<State>>;
  /** Optional game-specific options on the intro card (e.g. Music Box Rhythm's track + timing offset). */
  IntroExtras?: ComponentType<{ practice: boolean }>;
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
  description: string;
  category: MinigameCategory;
  accent: string;
  players: { min: number; max: number };
  /** Typical round length in seconds [min, max]. */
  durationSec: [number, number];
  inputs: ('keyboard' | 'mouse' | 'touch')[];
  bots: 'none' | 'planned' | 'available';
  /** `formats`: the tournament formats this trial may appear in (absent = all of them). */
  eligibility: { tournament: boolean; ranked: boolean; casual: boolean; formats?: readonly TournamentFormat[] };
  scoring: 'elimination-order' | 'score' | 'time' | 'progress';
  tieBreak: string;
  /** What the record score counts, e.g. "rounds" or "answers" (plural). */
  recordUnit: string;
  /** Human-readable key map, shown on the intro card. */
  controls: { keys: string; action: string }[];
  /** Mobile/touch controls. Required: a minigame without a touch layout is not shippable. */
  touch: TouchLayout;
  status: 'playable' | 'planned';
  /**
   * Skip the host's 3-2-1 countdown: Start goes straight to playing. For games whose rules open
   * with their own untimed pre-phase (e.g. Spellbox Showdown's build draft) and count in the action
   * themselves. Default false.
   */
  skipStartCountdown?: boolean;
  /** Lazy so each minigame is code-split and loaded only when entered. */
  load?: () => Promise<MinigameModule<any, any>>;
}
