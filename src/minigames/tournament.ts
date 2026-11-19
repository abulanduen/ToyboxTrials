/**
 * Tournament formats and seeded game selection (GAME_DESIGN.md §2.1).
 */
import { seededRng, shuffle } from './rng';
import type { MinigameCategory, MinigameId } from './types';

export type TournamentFormat = 'blitz' | 'normal' | 'treasure';

export const FORMATS: Record<TournamentFormat, { name: string; games: number; blurb: string }> = {
  blitz: { name: 'Blitz', games: 3, blurb: 'Three quick trials.' },
  normal: { name: 'Normal', games: 5, blurb: 'Five trials. The classic.' },
  treasure: { name: 'Treasure', games: 8, blurb: 'Eight trials. Pack snacks.' },
};

/** Proposal: at most this many games from one category per tournament (when avoidable). */
export const CATEGORY_CAP = 2;

/**
 * Pick `count` games for a tournament from the eligible pool, deterministically from `seed`.
 * - No repeats while there are enough distinct games; once exhausted, the pool is reshuffled.
 * - Soft category cap: prefers games from under-represented categories.
 * - Never two identical games back-to-back if it can be avoided.
 */
export function selectGames(seed: number, count: number, pool: { id: MinigameId; category: MinigameCategory }[]): MinigameId[] {
  if (pool.length === 0) return [];
  const rng = seededRng(seed);
  const out: MinigameId[] = [];
  const used = new Map<MinigameCategory, number>();
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

export const FORMAT_IDS = Object.keys(FORMATS) as TournamentFormat[];

export const isTournamentFormat = (v: unknown): v is TournamentFormat => typeof v === 'string' && (FORMAT_IDS as string[]).includes(v);

/** What `poolForFormat` needs to know about a game (the registry entries and the server's GAME_FACTS both fit). */
export interface PoolEntry {
  id: MinigameId;
  category: MinigameCategory;
  players: { min: number; max: number };
  /** Registry entries: only 'playable' games are eligible. Absent = playable. */
  status?: 'playable' | 'planned';
  eligibility: { tournament: boolean; formats?: readonly TournamentFormat[] };
}

/**
 * The games a tournament of `format` may draw from, for a field of `field` toys (when given).
 * A game with `eligibility.formats` only appears in those formats (Toy Squad: Normal and
 * Treasure, never Blitz — owner decision, 19 Nov 2026). Used by local and online tournaments.
 */
export function poolForFormat<G extends PoolEntry>(format: TournamentFormat, games: readonly G[], field?: number): G[] {
  return games.filter(
    (g) =>
      (g.status ?? 'playable') === 'playable' &&
      g.eligibility.tournament &&
      (!g.eligibility.formats || g.eligibility.formats.includes(format)) &&
      (field === undefined || (field >= g.players.min && field <= g.players.max)),
  );
}
