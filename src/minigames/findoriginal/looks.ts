/**
 * Baldwyn's look, as data (no three.js here, so the rules core and a future game server can use it).
 *
 * Baldwyn is an original wind-up tin gentleman, but he is put together from a different box of toy
 * parts every match: body shape and paint, belt, buttons, head, eyes, nose, moustache, hat, key and
 * accessories. A look is one option per slot. The look-alikes in each round are that match's
 * Baldwyn with one or more slots swapped for another part.
 *
 * Identity is only ever derived from the look itself (GAME_DESIGN.md amendment A5): a toy is
 * Baldwyn because its look equals the match's Baldwyn, never because of a flag in the state.
 *
 * Every look is kept *canonical*: slots that can't be seen (the colour of a hat that isn't there)
 * are reset to 0, so two looks that render the same always compare equal, and a difference in a
 * slot is always a difference you can see. `valid` keeps neighbouring parts from sharing a paint
 * (a coral belt on a coral body would vanish).
 */

/** How easy a difference is to spot: 0 = obvious, 1 = medium, 2 = subtle. */
export type Tier = 0 | 1 | 2;

/** Paint names. figure.ts maps them to palette colours. */
export type Paint = 'sage' | 'blue' | 'coral' | 'honey' | 'purple' | 'cream' | 'ink';

/** Every slot and its options, in order. A look stores the option's index. */
export const SLOTS = {
  body: ['barrel', 'bell', 'box', 'ball'],
  bodyPaint: ['sage', 'blue', 'coral', 'honey', 'purple'],
  /** The belt. */
  trim: ['honey', 'coral', 'cream', 'blue', 'sage', 'purple'],
  buttons: ['one', 'two', 'three'],
  buttonPaint: ['cream', 'honey', 'ink', 'coral'],
  head: ['round', 'square', 'tall'],
  eyes: ['dots', 'wink', 'sleepy'],
  nose: ['coral', 'blue', 'honey', 'purple'],
  tache: ['none', 'bar', 'handlebar', 'walrus'],
  hat: ['none', 'bowler', 'top', 'fez', 'beret'],
  hatPaint: ['purple', 'coral', 'blue', 'honey', 'sage'],
  /** Hat band (bowler, top hat) or tassel (fez). */
  band: ['coral', 'cream', 'honey', 'blue'],
  tilt: ['left', 'right', 'straight'],
  key: ['loop', 'bow', 'paddle'],
  keySide: ['right', 'left'],
  neck: ['none', 'bowtie', 'scarf'],
  neckPaint: ['coral', 'blue', 'honey', 'sage', 'purple'],
  eyewear: ['none', 'monocle', 'specs'],
  /** Held in a mitt on the side away from the key. */
  held: ['none', 'cane', 'umbrella', 'flower'],
} as const;

export type SlotId = keyof typeof SLOTS;
export type OptionOf<S extends SlotId> = (typeof SLOTS)[S][number];
export const SLOT_IDS = Object.keys(SLOTS) as SlotId[];
export type Look = Record<SlotId, number>;

/** Index of a named option (for readable code; throws on a typo at module load). */
export function opt<S extends SlotId>(slot: S, name: OptionOf<S>): number {
  const i = (SLOTS[slot] as readonly string[]).indexOf(name);
  if (i < 0) throw new Error(`no option ${name} in ${slot}`);
  return i;
}

/** The option name a look has in a slot. */
export const part = <S extends SlotId>(look: Look, slot: S) => SLOTS[slot][look[slot]] as OptionOf<S>;

const HAT_NONE = opt('hat', 'none');
const HAT_BERET = opt('hat', 'beret');
const HAT_FEZ = opt('hat', 'fez');
const NECK_NONE = opt('neck', 'none');

/** Slots that only show while another slot has a part (the "parent"). */
export const PARENT: Partial<Record<SlotId, SlotId>> = { hatPaint: 'hat', band: 'hat', tilt: 'hat', neckPaint: 'neck' };

/** True if this slot can't be seen on this look (so its value is meaningless). */
export function hidden(look: Look, slot: SlotId): boolean {
  switch (slot) {
    case 'hatPaint':
    case 'tilt':
      return look.hat === HAT_NONE;
    case 'band':
      return look.hat === HAT_NONE || look.hat === HAT_BERET;
    case 'neckPaint':
      return look.neck === NECK_NONE;
    default:
      return false;
  }
}

/** Reset slots that can't be seen to 0, in place. */
export function canonical(look: Look): Look {
  for (const s of SLOT_IDS) if (hidden(look, s)) look[s] = 0;
  return look;
}

/** Paints that sit side by side and would blend together: the same paint, or ink next to purple. */
function clash(a: string, b: string) {
  return a === b || (a === 'ink' && b === 'purple') || (a === 'purple' && b === 'ink');
}

/** Neighbouring parts never share a paint, so every part stays readable. */
export function valid(look: Look): boolean {
  const body = part(look, 'bodyPaint');
  if (clash(part(look, 'trim'), body)) return false;
  if (clash(part(look, 'buttonPaint'), body)) return false;
  if (!hidden(look, 'band') && clash(part(look, 'band'), part(look, 'hatPaint'))) return false;
  if (!hidden(look, 'neckPaint') && clash(part(look, 'neckPaint'), body)) return false;
  return true;
}

export const sameLook = (a: Look, b: Look) => SLOT_IDS.every((s) => a[s] === b[s]);

export const lookKey = (look: Look) => SLOT_IDS.map((s) => look[s]).join('.');

/** How visible swapping `slot` from option a to b is, on a toy that otherwise looks like `base`. */
export function tierOf(slot: SlotId, a: number, b: number, base: Look): Tier {
  const either = (...names: string[]) => names.includes(SLOTS[slot][a]) || names.includes(SLOTS[slot][b]);
  switch (slot) {
    case 'body':
    case 'bodyPaint':
    case 'hat':
    case 'hatPaint':
      return 0;
    case 'neck':
      return either('scarf') ? 0 : 1; // a scarf is big; a bow tie less so
    case 'held':
      return either('cane', 'umbrella') ? 0 : 1; // a long cane/umbrella is obvious; a flower less so
    case 'head':
      return either('square') ? 1 : 2; // round vs tall egg is subtle
    case 'tache':
      return either('none', 'walrus') ? 1 : 2; // bar vs handlebar is only the tips
    case 'band':
      return base.hat === HAT_FEZ ? 2 : 1; // a fez tassel is small
    case 'eyewear':
      return either('specs') ? 1 : 2; // a monocle is small
    case 'trim':
    case 'nose':
    case 'key':
    case 'keySide':
    case 'neckPaint':
      return 1;
    case 'buttons':
    case 'buttonPaint':
    case 'eyes':
    case 'tilt':
      return 2;
  }
}

export interface Difference {
  slot: SlotId;
  tier: Tier;
}

/**
 * The visible differences between two canonical looks, one per swapped part. A slot whose parent
 * also differs is not counted on its own (a different hat brings its own colour and band).
 */
export function differences(base: Look, other: Look): Difference[] {
  const out: Difference[] = [];
  for (const slot of SLOT_IDS) {
    if (base[slot] === other[slot]) continue;
    const parent = PARENT[slot];
    if (parent && base[parent] !== other[parent]) continue;
    out.push({ slot, tier: tierOf(slot, base[slot], other[slot], base) });
  }
  return out;
}

/** Readable list of differences, for debugging. */
export function describe(base: Look, other: Look): string {
  return differences(base, other)
    .map((d) => `${d.slot}: ${SLOTS[d.slot][other[d.slot]]}`)
    .join(', ');
}

const randIndex = (rng: () => number, n: number) => Math.floor(rng() * n);

/**
 * This match's Baldwyn: a random option in every slot. He always wears a hat (he is a gentleman,
 * and it gives the later rounds a hat to tip the wrong way).
 */
export function makeBaldwyn(rng: () => number): Look {
  for (let tries = 0; ; tries++) {
    const look = {} as Look;
    for (const s of SLOT_IDS) look[s] = randIndex(rng, SLOTS[s].length);
    if (look.hat === HAT_NONE) look.hat = 1 + randIndex(rng, SLOTS.hat.length - 1);
    canonical(look);
    if (valid(look) || tries > 200) return look;
  }
}

/**
 * Swap one slot for `value`. Parts that come into view with it (the colour of a newly added hat)
 * get random paints that suit the rest of the toy. Returns null if the result breaks `valid`.
 */
export function swap(look: Look, slot: SlotId, value: number, rng: () => number): Look | null {
  const next = { ...look, [slot]: value };
  for (const child of SLOT_IDS) {
    if (PARENT[child] !== slot || hidden(next, child) || !hidden(look, child)) continue;
    const n = SLOTS[child].length;
    const start = randIndex(rng, n);
    for (let k = 0; k < n; k++) {
      next[child] = (start + k) % n;
      if (valid(canonical({ ...next }))) break;
    }
  }
  canonical(next);
  return valid(next) ? next : null;
}

/** Every single-slot swap that can be seen on `look`, with how visible it is against `base`. */
export function swapsFor(look: Look, base: Look): { slot: SlotId; value: number; tier: Tier }[] {
  const out: { slot: SlotId; value: number; tier: Tier }[] = [];
  for (const slot of SLOT_IDS) {
    if (hidden(look, slot)) continue;
    for (let v = 0; v < SLOTS[slot].length; v++) {
      if (v !== look[slot]) out.push({ slot, value: v, tier: tierOf(slot, base[slot], v, base) });
    }
  }
  return out;
}
