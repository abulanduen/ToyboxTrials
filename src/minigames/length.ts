/**
 * How long a trial takes, for the choosers (intro card, gate lobby card, practice grid, the
 * host's game picker). Derived from each registry entry's `durationSec` upper bound, so new
 * games get the right class from their own entry, with no list to keep in step:
 *
 *   short   up to 4 minutes
 *   medium  over 4 and up to 6 minutes
 *   long    over 6 minutes
 *
 * Pure; unit-tested in tests/unit/length.test.ts.
 */
import { groupOf } from './tournament';
import type { TrialGroup } from './types';

export type LengthClass = 'short' | 'medium' | 'long';

export const SHORT_MAX_SEC = 4 * 60;
export const MEDIUM_MAX_SEC = 6 * 60;

export const LENGTH_ORDER: Record<LengthClass, number> = { short: 0, medium: 1, long: 2 };
export const LENGTH_LABEL: Record<LengthClass, string> = { short: 'Short', medium: 'Medium', long: 'Long' };

export function lengthClassOf(def: { durationSec: readonly [number, number] }): LengthClass {
  const max = def.durationSec[1];
  return max <= SHORT_MAX_SEC ? 'short' : max <= MEDIUM_MAX_SEC ? 'medium' : 'long';
}

/** Whole minutes, never below 1 (a 20-second race still reads "about 1 min"). */
const minutes = (sec: number, round: (x: number) => number) => Math.max(1, round(sec / 60));

/** "about 1–3 min", "about 2 min", "about 5–11 min". */
export function durationLabel(def: { durationSec: readonly [number, number] }): string {
  const [lo, hi] = def.durationSec;
  const a = minutes(lo, Math.floor);
  const b = Math.max(a, minutes(hi, Math.ceil));
  return a === b ? `about ${a} min` : `about ${a}–${b} min`;
}

/** The compact chip: "~2 min" (the middle of the range, rounded). */
export function durationChip(def: { durationSec: readonly [number, number] }): string {
  const [lo, hi] = def.durationSec;
  return `~${Math.max(1, Math.round((lo + hi) / 2 / 60))} min`;
}

/** Short to long, ties kept in the given (registry) order. */
export function byLength<T extends { durationSec: readonly [number, number] }>(games: readonly T[]): T[] {
  return games
    .map((g, i) => ({ g, i }))
    .sort((a, b) => LENGTH_ORDER[lengthClassOf(a.g)] - LENGTH_ORDER[lengthClassOf(b.g)] || a.i - b.i)
    .map((x) => x.g);
}

// ------------------------------------------------------------------ trial groups, for the pickers
/*
 * The pickers' two sections (practice list, host's trial picker). Membership is each game's own
 * `group` field (absent = party; see types.ts TrialGroup), so no UI keeps a list of its own.
 */
export const GROUP_ORDER: readonly TrialGroup[] = ['party', 'strategy'];
export const GROUP_INFO: Record<TrialGroup, { label: string; blurb: string }> = {
  party: { label: 'Party games', blurb: 'Quick trials, in every tournament' },
  strategy: { label: 'Strategy games', blurb: 'Long and deeper: the Normal and Treasure finale' },
};

/** The games of one group, in the given order. */
export function inGroup<T extends { group?: TrialGroup }>(games: readonly T[], group: TrialGroup): T[] {
  return games.filter((g) => groupOf(g) === group);
}

/** "about 1–4 min each": the span of a group's typical lengths (empty for no games). */
export function groupDurationLabel(games: readonly { durationSec: readonly [number, number] }[]): string {
  if (!games.length) return '';
  const lo = Math.min(...games.map((g) => g.durationSec[0]));
  const hi = Math.max(...games.map((g) => g.durationSec[1]));
  return `${durationLabel({ durationSec: [lo, hi] })} each`;
}
