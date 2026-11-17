/**
 * Cosmetics catalogue: hats and wind-up key skins. Paint jobs live in palette.ts.
 *
 * Unlocks: some items are free; others are earned by finding Playroom secrets (the first
 * progression loop). Later the Odds & Ends shop and minigame results can grant items too.
 * When the existing Base44 app is connected, its customisation options map onto these ids.
 */
import { PALETTE } from './palette';

export type HatId = 'none' | 'thimble' | 'bottlecap' | 'paperboat' | 'acorn';
export type KeySkinId = 'classic' | 'heart' | 'star' | 'golden';

export interface Cosmetic<Id extends string> {
  id: Id;
  name: string;
  blurb: string;
  /** Secret id that unlocks it, or undefined if free. */
  unlockedBy?: string;
  swatch: string;
}

export const HATS: Cosmetic<HatId>[] = [
  { id: 'none', name: 'Bare turret', blurb: 'Factory standard.', swatch: PALETTE.toyBlue },
  { id: 'thimble', name: 'Thimble helmet', blurb: 'Sewing-box steel. Very dented.', swatch: '#C9C7C2' },
  { id: 'bottlecap', name: 'Bottle-cap crown', blurb: 'Fizzy royalty.', swatch: PALETTE.honey },
  { id: 'paperboat', name: 'Paper-boat hat', blurb: 'Folded from an old receipt.', swatch: PALETTE.cream, unlockedBy: 'musicbox' },
  { id: 'acorn', name: 'Acorn cap', blurb: 'Smuggled in from the garden.', swatch: '#8A5A34', unlockedBy: 'marble' },
];

export const KEY_SKINS: Cosmetic<KeySkinId>[] = [
  { id: 'classic', name: 'Classic key', blurb: 'Two loops, lots of turns.', swatch: PALETTE.brass },
  { id: 'heart', name: 'Heart key', blurb: 'Wound with affection.', swatch: PALETTE.coral },
  { id: 'star', name: 'Star key', blurb: 'For show-offs.', swatch: PALETTE.toyBlue, unlockedBy: 'jack' },
  { id: 'golden', name: 'Golden key', blurb: 'From the top of the tower.', swatch: '#F2C14E', unlockedBy: 'key' },
];

export const SECRET_LABELS: Record<string, string> = {
  musicbox: 'Find the forgotten music box',
  marble: 'Push the giant marble',
  jack: 'Open the suspicious box',
  key: 'Grab the golden key from the tower',
};

export function isUnlocked(item: { unlockedBy?: string }, secretsFound: readonly string[]) {
  return !item.unlockedBy || secretsFound.includes(item.unlockedBy);
}

/** Cosmetic unlocked by a given secret (for the reward ticket). */
export function rewardForSecret(secretId: string): string | null {
  const h = HATS.find((x) => x.unlockedBy === secretId);
  if (h) return h.name;
  const k = KEY_SKINS.find((x) => x.unlockedBy === secretId);
  return k ? k.name : null;
}
