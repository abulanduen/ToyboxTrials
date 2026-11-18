/**
 * Baldwyn's look, as data (no three.js here so the rules core and a future game server can use it).
 *
 * Baldwyn is an original wind-up tin gentleman: a sage barrel body with a honey belt and two cream
 * buttons, a cream head with round ink eyes, a coral nose and a handlebar moustache, an ink-purple
 * bowler hat with a coral band tipped over one ear, and a brass key sticking out of his side.
 *
 * A toy's look is a bitmask of *deviations* from that design. `0` is the real Baldwyn; anything
 * else is a Not-Baldwyn. There is deliberately no "isTarget" flag anywhere in the match state
 * (GAME_DESIGN.md amendment A5): identity is only ever derived from the render parameters.
 */

/** How easy a deviation is to spot: 0 = obvious, 1 = medium, 2 = subtle. */
export type Tier = 0 | 1 | 2;

export interface TraitDef {
  id: string;
  bit: number;
  tier: Tier;
  /** What the Not-Baldwyn got wrong. */
  label: string;
}

export const TRAITS = [
  { id: 'body', bit: 1 << 0, tier: 0, label: 'blue body' },
  { id: 'hatColour', bit: 1 << 1, tier: 0, label: 'coral hat' },
  { id: 'noHat', bit: 1 << 2, tier: 0, label: 'no hat' },
  { id: 'belt', bit: 1 << 3, tier: 1, label: 'coral belt' },
  { id: 'nose', bit: 1 << 4, tier: 1, label: 'blue nose' },
  { id: 'noTache', bit: 1 << 5, tier: 1, label: 'no moustache' },
  { id: 'keySide', bit: 1 << 6, tier: 1, label: 'key on the wrong side' },
  { id: 'band', bit: 1 << 7, tier: 1, label: 'cream hat band' },
  { id: 'button', bit: 1 << 8, tier: 2, label: 'a button missing' },
  { id: 'tilt', bit: 1 << 9, tier: 2, label: 'hat tipped the wrong way' },
  { id: 'wink', bit: 1 << 10, tier: 2, label: 'one eye shut' },
] as const satisfies readonly TraitDef[];

export type TraitId = (typeof TRAITS)[number]['id'];

export const T = Object.fromEntries(TRAITS.map((t) => [t.id, t.bit])) as Record<TraitId, number>;

const HAT_BITS = T.hatColour | T.band | T.tilt;

/** Drop combinations that can't be seen (a missing hat has no colour, band or tilt). */
export function normalise(traits: number): number {
  return traits & T.noHat ? traits & ~HAT_BITS : traits;
}

export const isOriginal = (traits: number) => traits === 0;

export function traitCount(traits: number): number {
  let n = 0;
  for (const t of TRAITS) if (traits & t.bit) n++;
  return n;
}

export function describe(traits: number): string {
  return TRAITS.filter((t) => traits & t.bit)
    .map((t) => t.label)
    .join(', ');
}
