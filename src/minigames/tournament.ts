/**
 * Tournament formats and seeded game selection (GAME_DESIGN.md §2.1).
 */
import { seededRng, shuffle, subSeed } from './rng';
import type { MinigameCategory, MinigameId, TrialGroup } from './types';

export type TournamentFormat = 'blitz' | 'normal' | 'treasure';

/**
 * `finale`: the format ends with one strategy trial (owner decision, 20 Nov 2026); the others are
 * party trials. Blitz is party trials only.
 */
export const FORMATS: Record<TournamentFormat, { name: string; games: number; finale: boolean; blurb: string }> = {
  blitz: { name: 'Blitz', games: 3, finale: false, blurb: 'Three quick party trials.' },
  normal: { name: 'Normal', games: 5, finale: true, blurb: 'Four party trials, then a strategy finale.' },
  treasure: { name: 'Treasure', games: 8, finale: true, blurb: 'Seven party trials, then a strategy finale. Pack snacks.' },
};

/** Proposal: at most this many games from one category per tournament (when avoidable). */
export const CATEGORY_CAP = 2;

/**
 * Pick `count` games for a tournament from the eligible pool, deterministically from `seed`.
 * - No repeats while there are enough distinct games; once exhausted, the pool is reshuffled.
 * - Soft category cap: prefers games from under-represented categories.
 * - Never two identical games back-to-back if it can be avoided.
 * `alreadyUsed`: categories the tournament has already spent (its strategy finale), counted
 * towards the cap.
 */
export function selectGames(seed: number, count: number, pool: { id: MinigameId; category: MinigameCategory }[], alreadyUsed: readonly MinigameCategory[] = []): MinigameId[] {
  if (pool.length === 0 || count <= 0) return [];
  const rng = seededRng(seed);
  const out: MinigameId[] = [];
  const used = new Map<MinigameCategory, number>();
  for (const c of alreadyUsed) used.set(c, (used.get(c) ?? 0) + 1);
  let bag: typeof pool = [];
  while (out.length < count) {
    if (bag.length === 0) bag = shuffle(rng, pool);
    // Prefer: not the previous game, then under the category cap.
    let idx = bag.findIndex((g) => g.id !== out[out.length - 1] && (used.get(g.category) ?? 0) < CATEGORY_CAP);
    if (idx < 0) idx = bag.findIndex((g) => g.id !== out[out.length - 1]);
    if (idx < 0) idx = 0;
    const [g] = bag.splice(idx, 1);
    out.push(g.id);
    used.set(g.category, (used.get(g.category) ?? 0) + 1);
  }
  return out;
}

/** Absent `group` means a party trial. */
export const groupOf = (g: { group?: TrialGroup }): TrialGroup => g.group ?? 'party';
export const isStrategy = (g: { group?: TrialGroup }) => groupOf(g) === 'strategy';
/** Team trials (side against side) are never tournament rounds, whatever their eligibility says. */
export const isTeamGame = (g: { group?: TrialGroup }) => groupOf(g) === 'team';

/**
 * A tournament's trials, deterministically from `seed` (local and online tournaments both use this):
 *  - Blitz: `selectGames` over the party trials only.
 *  - Normal and Treasure: the party trials first (`selectGames`, one fewer than the format's
 *    count), then exactly one strategy trial, picked by its own sub-seed, as the finale.
 * The pool is already filtered for the format and field (`poolForFormat`). Group membership
 * comes from each game's `group`, never its duration, so retuned lengths don't move a game.
 * Degenerate pools (no strategy trial for this field, or no party trial) fall back to what there is.
 * Team trials never take part, even in a pool that holds them.
 */
export function selectTournament(seed: number, format: TournamentFormat, pool: readonly { id: MinigameId; category: MinigameCategory; group?: TrialGroup }[]): MinigameId[] {
  const count = FORMATS[format].games;
  const party = pool.filter((g) => groupOf(g) === 'party');
  const strategy = pool.filter(isStrategy);
  if (!FORMATS[format].finale || !strategy.length) return selectGames(seed, count, party);
  if (!party.length) return selectGames(seed, count, strategy);
  const finale = strategy[Math.floor(seededRng(subSeed(seed, 'finale'))() * strategy.length)];
  return [...selectGames(seed, count - 1, party, [finale.category]), finale.id];
}

export const FORMAT_IDS = Object.keys(FORMATS) as TournamentFormat[];

export const isTournamentFormat = (v: unknown): v is TournamentFormat => typeof v === 'string' && (FORMAT_IDS as string[]).includes(v);

/** What `poolForFormat` needs to know about a game (the registry entries and the server's GAME_FACTS both fit). */
export interface PoolEntry {
  id: MinigameId;
  category: MinigameCategory;
  group?: TrialGroup;
  players: { min: number; max: number };
  /** Registry entries: only 'playable' games are eligible. Absent = playable. */
  status?: 'playable' | 'planned';
  eligibility: { tournament: boolean; formats?: readonly TournamentFormat[] };
}

/**
 * The games a tournament of `format` may draw from, for a field of `field` toys (when given).
 * A game with `eligibility.formats` only appears in those formats (the strategy trials: Normal
 * and Treasure, never Blitz — owner decisions, 19 and 20 Nov 2026). Team trials are never in the
 * pool (owner decision, 21 Nov 2026). Used by local and online tournaments; `selectTournament`
 * then keeps strategy trials to the finale.
 */
export function poolForFormat<G extends PoolEntry>(format: TournamentFormat, games: readonly G[], field?: number): G[] {
  return games.filter(
    (g) =>
      (g.status ?? 'playable') === 'playable' &&
      g.eligibility.tournament &&
      !isTeamGame(g) &&
      (!g.eligibility.formats || g.eligibility.formats.includes(format)) &&
      (field === undefined || (field >= g.players.min && field <= g.players.max)),
  );
}
