/**
 * The shared status vocabulary (pure data, no three.js or DOM), so rules-side helpers and unit
 * tests can build status masks. The badges themselves are drawn by `statusIcons.ts`.
 */
export const STATUS_KINDS = ['burn', 'poison', 'slow', 'stun', 'mark', 'shred', 'silence', 'weaken'] as const;
export type StatusKind = typeof STATUS_KINDS[number];
/** One bit per kind, so a unit's statuses are a single number (in `STATUS_KINDS` order). */
export const STATUS_BIT: Record<StatusKind, number> = Object.fromEntries(STATUS_KINDS.map((k, i) => [k, 1 << i])) as Record<StatusKind, number>;
/** The kinds set in a mask, in display order. */
export const statusList = (mask: number) => STATUS_KINDS.filter((k) => mask & STATUS_BIT[k]);
