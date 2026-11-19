/**
 * Cosmetics catalogue: every paint job, hat, wind-up key, accessory and gesture a toy can own.
 *
 * Pure data (no DOM, no three.js): the client, the shop, the economy rules and the online server
 * (`server/sanitize.ts`) all read this one list. Item ids are unique across the whole catalogue
 * and never change once shipped, because saves and (later) accounts store them.
 *
 * How an item is unlocked:
 *   - `starter`: every toy owns it from the start;
 *   - `shop`: bought with cogs at the Odds & Ends shop (`price` > 0);
 *   - `secret`: found by discovering a Playroom secret (`secret`);
 *   - `achievement`: earned by an achievement in economy.ts (`achievement`).
 * The 3D models live in src/character/Cosmetics.tsx and the card art in src/ui/itemIcons.tsx.
 */
import { PAINT_JOBS, PALETTE, RARITY, type PaintJob } from './palette';
import { EMOTE_IDS, EMOTE_LABELS, FREE_EMOTES, type EmoteId } from './emotes';

export const PAINT_IDS = ['toy-blue', 'coral-clank', 'sage-sprocket', 'honey-hustle', 'midnight-tin', 'mint-condition', 'plum-pudding', 'racing-red', 'chalkboard', 'bubblegum', 'copper-kettle'] as const;
export type PaintId = (typeof PAINT_IDS)[number];
export const HAT_IDS = ['none', 'thimble', 'bottlecap', 'paperboat', 'acorn', 'reeltop', 'partycone', 'propeller', 'laurel'] as const;
export type HatId = (typeof HAT_IDS)[number];
export const KEY_SKIN_IDS = ['classic', 'heart', 'star', 'golden', 'clover', 'moon', 'gear'] as const;
export type KeySkinId = (typeof KEY_SKIN_IDS)[number];

export const ACCESSORY_SLOTS = ['back', 'face', 'neck'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];
export const BACK_IDS = ['backpack', 'cape', 'balloon', 'wings'] as const;
export const FACE_IDS = ['monocle', 'goggles', 'moustache', 'beadnose'] as const;
export const NECK_IDS = ['scarf', 'bowtie', 'bellcollar', 'medal'] as const;
export type BackId = (typeof BACK_IDS)[number] | 'none';
export type FaceId = (typeof FACE_IDS)[number] | 'none';
export type NeckId = (typeof NECK_IDS)[number] | 'none';
/** What a toy wears in the three accessory slots ('none' = empty). */
export interface Accessories {
  back: BackId;
  face: FaceId;
  neck: NeckId;
}
export const NO_ACCESSORIES: Accessories = { back: 'none', face: 'none', neck: 'none' };

export type Category = 'paint' | 'hat' | 'key' | 'accessory' | 'gesture';
export const CATEGORIES: readonly Category[] = ['paint', 'hat', 'key', 'accessory', 'gesture'];
export const CATEGORY_LABELS: Record<Category, string> = { paint: 'Paints', hat: 'Hats', key: 'Keys', accessory: 'Accessories', gesture: 'Gestures' };
export const SLOT_LABELS: Record<AccessorySlot, string> = { back: 'Back', face: 'Face', neck: 'Neck' };

export type Rarity = keyof typeof RARITY;
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_LABELS: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
export { RARITY as RARITY_COLOURS };

export type UnlockKind = 'starter' | 'shop' | 'secret' | 'achievement';

export interface CatalogueItem {
  /** Unique across the catalogue. Paint/hat/key/accessory/gesture ids are what loadouts store. */
  id: string;
  name: string;
  /** One short line for the card and the shop's detail box. */
  blurb: string;
  category: Category;
  /** Accessories only. */
  slot?: AccessorySlot;
  rarity: Rarity;
  unlock: UnlockKind;
  /** Cogs; > 0 for shop items, 0 otherwise. */
  price: number;
  /** `secret` items: the Playroom secret that unlocks it. */
  secret?: string;
  /** `achievement` items: the achievement id (economy.ts) that unlocks it. */
  achievement?: string;
  /** Main colour, for card art and swatches. */
  swatch: string;
  /** Paints: index into PAINT_JOBS (what online looks send). */
  paintIndex?: number;
}

const paint = (id: PaintId, index: number, rarity: Rarity, unlock: UnlockKind, price: number, blurb: string): CatalogueItem => ({
  id,
  name: PAINT_JOBS[index].name,
  blurb,
  category: 'paint',
  rarity,
  unlock,
  price,
  swatch: PAINT_JOBS[index].body,
  paintIndex: index,
});

export const CATALOGUE: readonly CatalogueItem[] = [
  // ---------------------------------------------------------------- paints
  paint('toy-blue', 0, 'common', 'starter', 0, 'Factory blue, straight off the line.'),
  paint('coral-clank', 1, 'common', 'starter', 0, 'Warm as a biscuit tin.'),
  paint('sage-sprocket', 2, 'common', 'starter', 0, 'The colour of a well-loved felt board.'),
  paint('honey-hustle', 3, 'common', 'starter', 0, 'Sticky-bun gold.'),
  paint('midnight-tin', 4, 'common', 'starter', 0, 'For toys who stay up late.'),
  paint('mint-condition', 5, 'common', 'shop', 60, 'Never been out of the box. Probably.'),
  paint('plum-pudding', 6, 'uncommon', 'shop', 120, 'Rich, dark and a bit festive.'),
  paint('racing-red', 7, 'uncommon', 'shop', 120, 'Red ones go faster. Everybody knows that.'),
  paint('chalkboard', 8, 'rare', 'shop', 200, 'Matte slate with cream piping.'),
  paint('bubblegum', 9, 'rare', 'shop', 200, 'Pink enough to stick to the ceiling.'),
  paint('copper-kettle', 10, 'epic', 'shop', 300, 'Polished like the good teapot.'),

  // ---------------------------------------------------------------- hats
  { id: 'thimble', name: 'Thimble helmet', blurb: 'Sewing-box steel. Very dented.', category: 'hat', rarity: 'common', unlock: 'starter', price: 0, swatch: '#C9C7C2' },
  { id: 'bottlecap', name: 'Bottle-cap crown', blurb: 'Fizzy royalty.', category: 'hat', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.honey },
  { id: 'paperboat', name: 'Paper-boat hat', blurb: 'Folded from an old receipt.', category: 'hat', rarity: 'rare', unlock: 'secret', secret: 'musicbox', price: 0, swatch: PALETTE.cream },
  { id: 'acorn', name: 'Acorn cap', blurb: 'Smuggled in from the garden.', category: 'hat', rarity: 'rare', unlock: 'secret', secret: 'marble', price: 0, swatch: '#8A5A34' },
  { id: 'partycone', name: 'Party cone', blurb: 'Striped card and a pompom on top.', category: 'hat', rarity: 'common', unlock: 'shop', price: 80, swatch: PALETTE.coral },
  { id: 'reeltop', name: 'Cotton-reel top hat', blurb: 'A wooden spool, still wound with thread.', category: 'hat', rarity: 'uncommon', unlock: 'shop', price: 120, swatch: PALETTE.woodLight },
  { id: 'propeller', name: 'Propeller cap', blurb: 'Spins when you walk. Does not fly.', category: 'hat', rarity: 'epic', unlock: 'shop', price: 300, swatch: PALETTE.toyBlue },
  { id: 'laurel', name: 'Champion laurel', blurb: 'Felt leaves for a tournament winner.', category: 'hat', rarity: 'legendary', unlock: 'achievement', achievement: 'champion', price: 0, swatch: PALETTE.sage },

  // ---------------------------------------------------------------- keys
  { id: 'classic', name: 'Classic key', blurb: 'Two loops, lots of turns.', category: 'key', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.brass },
  { id: 'heart', name: 'Heart key', blurb: 'Wound with affection.', category: 'key', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.coral },
  { id: 'star', name: 'Star key', blurb: 'For show-offs.', category: 'key', rarity: 'rare', unlock: 'secret', secret: 'jack', price: 0, swatch: PALETTE.toyBlue },
  { id: 'golden', name: 'Golden key', blurb: 'From the top of the tower.', category: 'key', rarity: 'legendary', unlock: 'secret', secret: 'key', price: 0, swatch: '#F2C14E' },
  { id: 'clover', name: 'Clover key', blurb: 'Four leaves, four times the luck.', category: 'key', rarity: 'uncommon', unlock: 'shop', price: 120, swatch: PALETTE.sage },
  { id: 'moon', name: 'Crescent key', blurb: 'Wind it up at bedtime.', category: 'key', rarity: 'rare', unlock: 'shop', price: 200, swatch: PALETTE.cream },
  { id: 'gear', name: 'Cog key', blurb: 'For toys who never miss a trial.', category: 'key', rarity: 'epic', unlock: 'achievement', achievement: 'regular', price: 0, swatch: '#9AA3A8' },

  // ---------------------------------------------------------------- accessories: back
  { id: 'backpack', name: 'Button backpack', blurb: 'Room for three buttons and a raisin.', category: 'accessory', slot: 'back', rarity: 'common', unlock: 'shop', price: 80, swatch: PALETTE.woodMid },
  { id: 'balloon', name: 'Party balloon', blurb: 'Tied on tight. Bobs as you go.', category: 'accessory', slot: 'back', rarity: 'uncommon', unlock: 'shop', price: 140, swatch: PALETTE.coral },
  { id: 'cape', name: 'Felt cape', blurb: 'Cut from a pencil-case lining.', category: 'accessory', slot: 'back', rarity: 'rare', unlock: 'shop', price: 200, swatch: '#B8434A' },
  { id: 'wings', name: 'Paper wings', blurb: 'Folded twice and very nearly symmetrical.', category: 'accessory', slot: 'back', rarity: 'epic', unlock: 'shop', price: 320, swatch: PALETTE.white },
  // ---------------------------------------------------------------- accessories: face
  { id: 'moustache', name: 'Bristle moustache', blurb: 'Snipped from an old paintbrush.', category: 'accessory', slot: 'face', rarity: 'common', unlock: 'shop', price: 60, swatch: PALETTE.woodDark },
  { id: 'beadnose', name: 'Bead nose', blurb: 'One red bead, no questions asked.', category: 'accessory', slot: 'face', rarity: 'common', unlock: 'shop', price: 60, swatch: PALETTE.coral },
  { id: 'monocle', name: 'Brass monocle', blurb: 'For inspecting very small print.', category: 'accessory', slot: 'face', rarity: 'uncommon', unlock: 'shop', price: 120, swatch: PALETTE.brass },
  { id: 'goggles', name: 'Tinker goggles', blurb: 'A jam-jar lens on an elastic strap.', category: 'accessory', slot: 'face', rarity: 'rare', unlock: 'shop', price: 220, swatch: PALETTE.toyBlue },
  // ---------------------------------------------------------------- accessories: neck
  { id: 'bowtie', name: 'Ribbon bow tie', blurb: 'Dressed for the Pavilion.', category: 'accessory', slot: 'neck', rarity: 'common', unlock: 'shop', price: 70, swatch: PALETTE.toyBlue },
  { id: 'scarf', name: 'Knitted scarf', blurb: 'Two rows of wool, lots of love.', category: 'accessory', slot: 'neck', rarity: 'common', unlock: 'shop', price: 80, swatch: PALETTE.honey },
  { id: 'bellcollar', name: 'Bell collar', blurb: 'Jingles. Sneaking is now impossible.', category: 'accessory', slot: 'neck', rarity: 'uncommon', unlock: 'shop', price: 120, swatch: PALETTE.coral },
  { id: 'medal', name: 'Bottle-cap medal', blurb: 'Awarded for ten trial wins.', category: 'accessory', slot: 'neck', rarity: 'epic', unlock: 'achievement', achievement: 'trial-winner', price: 0, swatch: '#F2C14E' },

  // ---------------------------------------------------------------- gestures
  { id: 'wave', name: EMOTE_LABELS.wave, blurb: 'A friendly hello.', category: 'gesture', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.honey },
  { id: 'cheer', name: EMOTE_LABELS.cheer, blurb: 'Three springy hops.', category: 'gesture', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.honey },
  { id: 'spin', name: EMOTE_LABELS.spin, blurb: 'One full twirl, arms out like a top.', category: 'gesture', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.honey },
  { id: 'bow', name: EMOTE_LABELS.bow, blurb: 'Very polite.', category: 'gesture', rarity: 'common', unlock: 'starter', price: 0, swatch: PALETTE.honey },
  { id: 'laugh', name: EMOTE_LABELS.laugh, blurb: 'Rattles every gear in the gearbox.', category: 'gesture', rarity: 'common', unlock: 'shop', price: 80, swatch: PALETTE.honey },
  { id: 'sit', name: EMOTE_LABELS.sit, blurb: 'Plonk down for a breather.', category: 'gesture', rarity: 'common', unlock: 'shop', price: 80, swatch: PALETTE.sage },
  { id: 'salute', name: EMOTE_LABELS.salute, blurb: 'Smart as a tin soldier.', category: 'gesture', rarity: 'common', unlock: 'shop', price: 90, swatch: PALETTE.toyBlue },
  { id: 'dance', name: EMOTE_LABELS.dance, blurb: 'A clockwork shuffle, side to side.', category: 'gesture', rarity: 'uncommon', unlock: 'shop', price: 120, swatch: PALETTE.coral },
  { id: 'juggle', name: EMOTE_LABELS.juggle, blurb: 'Three beads in the air. Mostly.', category: 'gesture', rarity: 'rare', unlock: 'shop', price: 220, swatch: PALETTE.coral },
  { id: 'faint', name: EMOTE_LABELS.faint, blurb: 'Dramatic topple, quick recovery.', category: 'gesture', rarity: 'epic', unlock: 'shop', price: 260, swatch: PALETTE.inkPurple },
];

const BY_ID = new Map(CATALOGUE.map((i) => [i.id, i]));

export function itemById(id: string): CatalogueItem | undefined {
  return BY_ID.get(id);
}

export function itemsIn(category: Category, slot?: AccessorySlot): CatalogueItem[] {
  return CATALOGUE.filter((i) => i.category === category && (slot === undefined || i.slot === slot));
}

/** The ids every new toy owns. */
export const STARTER_IDS: readonly string[] = CATALOGUE.filter((i) => i.unlock === 'starter').map((i) => i.id);

// ---------------------------------------------------------------- id guards (also used by the server)
export const isPaintId = (v: unknown): v is PaintId => typeof v === 'string' && (PAINT_IDS as readonly string[]).includes(v);
export const isHatId = (v: unknown): v is HatId => typeof v === 'string' && (HAT_IDS as readonly string[]).includes(v);
export const isKeySkinId = (v: unknown): v is KeySkinId => typeof v === 'string' && (KEY_SKIN_IDS as readonly string[]).includes(v);
const SLOT_IDS: Record<AccessorySlot, readonly string[]> = { back: BACK_IDS, face: FACE_IDS, neck: NECK_IDS };
/** True for 'none' or an accessory id that belongs in `slot`. */
export function isAccessoryFor(slot: AccessorySlot, v: unknown): boolean {
  return v === 'none' || (typeof v === 'string' && SLOT_IDS[slot].includes(v));
}
/** Clean a possibly-hostile accessories object: anything unknown becomes 'none'. */
export function cleanAccessories(raw: Partial<Record<AccessorySlot, unknown>> | null | undefined): Accessories {
  return {
    back: (isAccessoryFor('back', raw?.back) ? raw!.back : 'none') as BackId,
    face: (isAccessoryFor('face', raw?.face) ? raw!.face : 'none') as FaceId,
    neck: (isAccessoryFor('neck', raw?.neck) ? raw!.neck : 'none') as NeckId,
  };
}

// ---------------------------------------------------------------- paints
export function paintIndexOf(id: string): number {
  return itemById(id)?.paintIndex ?? 0;
}
export function paintIdAt(index: number): PaintId {
  const n = PAINT_IDS.length;
  return PAINT_IDS[((Math.floor(index) % n) + n) % n];
}
export function paintJobFor(id: string): PaintJob {
  return PAINT_JOBS[paintIndexOf(id)];
}

// ---------------------------------------------------------------- legacy lists (Workshop, bots, card art)
export interface Cosmetic<Id extends string> {
  id: Id;
  name: string;
  blurb: string;
  /** Secret id that unlocks it, or undefined. */
  unlockedBy?: string;
  swatch: string;
}
const asCosmetic = <Id extends string>(i: CatalogueItem): Cosmetic<Id> => ({ id: i.id as Id, name: i.name, blurb: i.blurb, unlockedBy: i.secret, swatch: i.swatch });
/** Every hat, starting with the bare turret ('none'). */
export const HATS: Cosmetic<HatId>[] = [{ id: 'none', name: 'Bare turret', blurb: 'Factory standard.', swatch: PALETTE.toyBlue }, ...itemsIn('hat').map((i) => asCosmetic<HatId>(i))];
export const KEY_SKINS: Cosmetic<KeySkinId>[] = itemsIn('key').map((i) => asCosmetic<KeySkinId>(i));
/** The free hats and keys the bots pick from (seeded, so a field of bots looks the same each time). */
export const BOT_HATS: readonly HatId[] = ['none', 'thimble', 'bottlecap', 'paperboat', 'acorn'];
export const BOT_KEY_SKINS: readonly KeySkinId[] = ['classic', 'heart', 'star', 'golden'];

/** The four Playroom secrets (interactables.ts finds them; profiles record which have paid out). */
export const SECRET_IDS = ['musicbox', 'marble', 'jack', 'key'] as const;
/** Achievement ids (the rules live in economy.ts; listed here so the pure profile clean-up can check them). */
export const ACHIEVEMENT_IDS = ['champion', 'trial-winner', 'regular'] as const;

export const SECRET_LABELS: Record<string, string> = {
  musicbox: 'Find the forgotten music box',
  marble: 'Push the giant marble',
  jack: 'Open the suspicious box',
  key: 'Grab the golden key from the tower',
};

/** Items a Playroom secret unlocks. */
export function itemsForSecret(secretId: string): CatalogueItem[] {
  return CATALOGUE.filter((i) => i.unlock === 'secret' && i.secret === secretId);
}

/** Cosmetic unlocked by a given secret (for the reward ticket). */
export function rewardForSecret(secretId: string): string | null {
  return itemsForSecret(secretId)[0]?.name ?? null;
}

/** Gesture ids that are catalogue items (all of them): a guard against the two lists drifting. */
export const GESTURE_ITEM_IDS: readonly EmoteId[] = EMOTE_IDS.filter((id) => BY_ID.get(id)?.category === 'gesture');
export { FREE_EMOTES };
