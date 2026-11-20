/**
 * The facts about each trial that the online game server needs: category, group (party or
 * strategy), field size, tournament eligibility and the formats a trial may appear in. Pure data (no React, no lazy imports), so the
 * server can import it; the client's registry.ts holds the full catalogue, and
 * tests/unit/lobby-match.test.ts checks the two agree.
 *
 * Partial on purpose: a trial added to the registry without an entry here (and in
 * server/games.ts) simply isn't offered online yet; the lobby says so.
 */
import type { MinigameId } from './ids';
import type { TournamentFormat } from './tournament';
import type { MinigameCategory, TrialGroup } from './types';

export interface GameFacts {
  id: MinigameId;
  category: MinigameCategory;
  /** Mirrors the registry's `group` (absent = party): strategy trials are tournament finales only. */
  group?: TrialGroup;
  players: { min: number; max: number };
  /** Typical round length in seconds [min, max]. */
  durationSec: [number, number];
  eligibility: {
    tournament: boolean;
    /** Formats this trial may appear in; undefined = every format. */
    formats?: readonly TournamentFormat[];
  };
  /**
   * Held-input games: the browser sends its input batch at every flush, even an empty one, and the
   * server repeats the latest batch on each rules step until the next arrives (a held direction
   * keeps walking; an empty batch lets go).
   */
  heldInputs?: boolean;
  /** Mirrors the registry's `skipStartCountdown`: the trial opens with its own phase (Spellbox's draft, Siege's class pick). */
  skipStartCountdown?: boolean;
}

const f = (id: MinigameId, category: MinigameCategory, min: number, durationSec: [number, number], eligibility: GameFacts['eligibility'] = { tournament: true }, heldInputs = false): GameFacts => ({
  id,
  category,
  players: { min, max: 8 },
  durationSec,
  eligibility,
  ...(heldInputs ? { heldInputs } : {}),
});

/** The strategy trials' eligibility: tournaments, but only the longer formats (as their finale). */
const FINALE: GameFacts['eligibility'] = { tournament: true, formats: ['normal', 'treasure'] };

export const GAME_FACTS: Partial<Record<MinigameId, GameFacts>> = {
  'copycat-conductor': f('copycat-conductor', 'memory', 1, [60, 180]),
  'inferno-escape': f('inferno-escape', 'survival', 2, [60, 120], undefined, true),
  'midnight-hunger': f('midnight-hunger', 'survival', 2, [90, 180], undefined, true),
  'find-the-original': f('find-the-original', 'observation', 1, [40, 120]),
  'red-light-green-light': f('red-light-green-light', 'reflex', 2, [25, 90]),
  'blink-duel': f('blink-duel', 'pvp', 2, [45, 120]),
  'wind-up-dash': f('wind-up-dash', 'racing', 2, [20, 75]),
  'music-box-rhythm': f('music-box-rhythm', 'rhythm', 1, [60, 80]),
  // Owner decisions (19 and 20 Nov 2026): the strategy trials only close Normal and Treasure tournaments.
  'toy-squad': { ...f('toy-squad', 'strategy', 1, [300, 630], FINALE), group: 'strategy' },
  'spellbox-showdown': { ...f('spellbox-showdown', 'pvp', 2, [90, 180]), skipStartCountdown: true },
  'jack-in-the-box': f('jack-in-the-box', 'knowledge', 2, [60, 240]),
  'odd-page-out': f('odd-page-out', 'observation', 1, [60, 145]),
  'toy-tower-tumble': { ...f('toy-tower-tumble', 'strategy', 1, [300, 600], FINALE), group: 'strategy' },
  'toybox-siege': { ...f('toybox-siege', 'survival', 1, [300, 390], FINALE), group: 'strategy', skipStartCountdown: true },
  // A team game: one-trial lobbies only, never a tournament round (registry.ts says why).
  'hoop-clash': f('hoop-clash', 'pvp', 2, [270, 360], { tournament: false }),
};

/** Every trial the online server can run. */
export const onlineGames = (): GameFacts[] => Object.values(GAME_FACTS).filter((g): g is GameFacts => !!g);

/** Can this trial be played in an online lobby? */
export const isOnlineGame = (id: MinigameId) => !!GAME_FACTS[id];
