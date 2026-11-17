/**
 * Shared tournament scoring (GAME_DESIGN.md §2.1). Values are preliminary and configurable.
 *
 * Proposals implemented here (marked as such in GAME_DESIGN.md §9):
 * - Fewer than 8 players: use the top of the table (4 players → 10/8/6/5).
 * - Ties share the higher place's points; the next place is skipped (1, 1, 3…).
 * - A forfeit counts as last place for that round.
 */
import type { Placement } from './types';

export const POINTS_TABLE = [10, 8, 6, 5, 4, 3, 2, 1];

export function pointsForPlace(place: number): number {
  return POINTS_TABLE[place - 1] ?? 0;
}

/**
 * Turn an ordered list of contestants (best first) with tie keys into placements.
 * Contestants with equal `key` share a place.
 */
export function rankByKey<T extends { contestantId: string; score: number; key: string; eliminated?: boolean; forfeit?: boolean }>(ordered: T[]): Placement[] {
  const out: Placement[] = [];
  let place = 1;
  ordered.forEach((c, i) => {
    if (i > 0 && c.key !== ordered[i - 1].key) place = i + 1;
    out.push({ contestantId: c.contestantId, place, score: c.score, eliminated: c.eliminated, forfeit: c.forfeit });
  });
  return out;
}

export interface Standing {
  contestantId: string;
  points: number;
  /** Points per round, for the scoreboard. */
  rounds: number[];
  wins: number;
}

export function addRound(standings: Standing[], placements: Placement[]): Standing[] {
  const next = standings.map((s) => ({ ...s, rounds: s.rounds.slice() }));
  for (const p of placements) {
    const s = next.find((x) => x.contestantId === p.contestantId);
    if (!s) continue;
    const pts = pointsForPlace(p.place);
    s.points += pts;
    s.rounds.push(pts);
    if (p.place === 1) s.wins += 1;
  }
  return next;
}

/** Final standings: points, then round wins, then best single-round points. Ties share a place. */
export function rankStandings(standings: Standing[]): (Standing & { place: number })[] {
  const keyOf = (s: Standing) => `${s.points}|${s.wins}|${Math.max(0, ...s.rounds)}`;
  const sorted = standings.slice().sort((a, b) => b.points - a.points || b.wins - a.wins || Math.max(0, ...b.rounds) - Math.max(0, ...a.rounds));
  let place = 1;
  return sorted.map((s, i) => {
    if (i > 0 && keyOf(s) !== keyOf(sorted[i - 1])) place = i + 1;
    return { ...s, place };
  });
}
