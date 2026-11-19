/**
 * Odd Page Out: the four picture-book scenes. Each has exactly SLOTS_PER_THEME (60) variable
 * slots: one prop each, with 2–4 variants (colour, pattern, shape, count, a feature on or off,
 * rotation, a nudge, size, or missing). A round draws a theme, gives every slot a random variant
 * for the reference page, then changes 15 of them on the other page (rules.ts).
 *
 * Pure data (picture units, 400 × 300; y down). The static backdrop of each scene is drawn by
 * backgrounds.ts; nothing in it ever changes, so the two pages differ only in the 15 slots.
 */
import { PALETTE } from '../../game/palette';
import type { Params, PropKind } from './props';

export const SLOTS_PER_THEME = 60;
/**
 * Every slot's hit circle is at least this big (picture units). A picture is about 374 px wide
 * on a 390 px phone in portrait, so 32 units ≈ 29 px: a 58 px finger target.
 */
export const MIN_HIT_R = 32;

export interface SlotDef {
  /** Unique within the theme. */
  id: string;
  prop: PropKind;
  /** Centre of the slot and of its hit circle (picture units). */
  x: number;
  y: number;
  /** Hit radius (≥ MIN_HIT_R). */
  r: number;
  /** Parameters shared by every variant. */
  base: Params;
  /** 2–4 variants; each overrides `base`. */
  vary: Params[];
}

export type ThemeId = 'toyshop' | 'picnic' | 'bathtime' | 'bedtime';

export interface ThemeDef {
  id: ThemeId;
  title: string;
  slots: SlotDef[];
}

const c = PALETTE;

/** Build a slot; the hit radius covers the prop at its biggest and every nudge. */
function slot(prop: PropKind, x: number, y: number, base: Params, ...vary: Params[]): Omit<SlotDef, 'id'> {
  let ext = 0;
  for (const v of vary) {
    const p = { ...base, ...v };
    const s = (p.s ?? 14) * (p.sc ?? 1);
    ext = Math.max(ext, s * 1.15 + Math.hypot(p.dx ?? 0, p.dy ?? 0));
  }
  return { prop, x, y, r: Math.max(MIN_HIT_R, Math.round(ext + 6)), base, vary };
}

function theme(id: ThemeId, title: string, list: Omit<SlotDef, 'id'>[]): ThemeDef {
  return { id, title, slots: list.map((s, i) => ({ ...s, id: `${id}-${i}-${s.prop}` })) };
}

const hide: Params = { hide: true };
const show: Params = {};

// ------------------------------------------------------------------ the toy shop
/** Shelf tops in the toy shop (backgrounds.ts draws the planks). */
export const SHOP_SHELVES = [72, 138, 204, 270];
const SX = [24, 68, 112, 156, 200, 244, 288, 332, 376];
export const HANG_X = [46, 90, 134, 178, 222, 266, 310, 354];
const stand = (row: number, s: number) => SHOP_SHELVES[row] - s;
const hang = (row: number) => SHOP_SHELVES[row] + 22;

const toyshop = theme('toyshop', 'The Toy Shop', [
  // top shelf
  slot('teddy', SX[0], stand(0, 15), { s: 15, c: c.woodLight, c2: c.coral }, { on: true }, { on: false }),
  slot('ball', SX[1], stand(0, 14), { s: 14, c: c.toyBlue, c2: c.white }, { pat: 'plain' }, { pat: 'stripes' }, { pat: 'dots' }),
  slot('rocket', SX[2], stand(0, 14) - 1, { s: 14, c: c.white }, { c2: c.coral }, { c2: c.toyBlue }, { c2: c.sage }),
  slot('robot', SX[3], stand(0, 14) + 1, { s: 14, c: c.toyBlue, c2: c.honey }, { on: true }, { on: false }),
  slot('clock', SX[4], stand(0, 15), { s: 15, c: c.coral }, { n: 2 }, { n: 5 }, { n: 8 }),
  slot('duck', SX[5], stand(0, 11) - 2, { s: 15 }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('drum', SX[6], stand(0, 11), { s: 14, c: c.coral, c2: c.honey }, { on: true }, { on: false }),
  slot('jar', SX[7], stand(0, 14), { s: 14, c2: c.coral }, { c: c.coral }, { c: c.sage }, { c: c.toyBlue }),
  slot('boat', SX[8], stand(0, 11) - 2, { s: 14, c: c.toyBlue }, { c2: c.white }, { c2: c.honey }, { c2: c.coral }),
  // hanging under the top shelf
  slot('ball', HANG_X[0], hang(0), { s: 9, pat: 'stripes', c2: c.white }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('sock', HANG_X[1], hang(0), { s: 10, c: c.honey, c2: c.coral }, { pat: 'stripes' }, { pat: 'plain' }),
  slot('star', HANG_X[2], hang(0), { s: 11 }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('flag', HANG_X[3], hang(0), { s: 10, c: c.sage }, { shape: 'tri' }, { shape: 'swallow' }, { shape: 'square' }),
  slot('heart', HANG_X[4], hang(0), { s: 10, c: c.coral }, show, hide),
  slot('bird', HANG_X[5], hang(0), { s: 10, c: c.toyBlue, c2: c.white }, { flip: false }, { flip: true }),
  slot('lolly', HANG_X[6], hang(0) - 3, { s: 9 }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('butterfly', HANG_X[7], hang(0), { s: 11, c2: c.white }, { c: c.toyBlue }, { c: c.coral }, { c: c.honey }),
  // second shelf
  slot('block', SX[0], stand(1, 13), { s: 13, c: c.honey, c2: c.coral }, { shape: 'star' }, { shape: 'heart' }, { shape: 'dot' }, { shape: 'tri' }),
  slot('car', SX[1], stand(1, 9) - 2, { s: 15, c2: c.roomSky }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('top', SX[2], stand(1, 14), { s: 14, c: c.coral }, { c2: c.honey }, { c2: c.toyBlue }, { c2: c.white }),
  slot('gift', SX[3], stand(1, 12), { s: 14, c: c.toyBlue, c2: c.honey }, { on: true }, { on: false }),
  slot('books', SX[4], stand(1, 15), { s: 15, c: c.toyBlue, c2: c.coral }, { n: 3 }, { n: 2 }),
  slot('hat', SX[5], stand(1, 10), { s: 14, c: c.inkPurple, c2: c.coral }, { shape: 'top' }, { shape: 'party' }, { shape: 'cap' }),
  slot('teddy', SX[6], stand(1, 15), { s: 15, c2: c.toyBlue, on: true }, { c: c.woodLight }, { c: c.cream }, { c: c.coral }),
  slot('robot', SX[7], stand(1, 14) + 1, { s: 14, c2: c.white, on: true }, { c: c.toyBlue }, { c: c.sage }, { c: c.honey }),
  slot('block', SX[8], stand(1, 13), { s: 13, c2: c.white, shape: 'star' }, { c: c.toyBlue }, { c: c.coral }, { c: c.sage }),
  // hanging under the second shelf
  slot('umbrella', HANG_X[0], hang(1), { s: 11, c: c.coral, c2: c.white }, { pat: 'stripes' }, { pat: 'plain' }),
  slot('ball', HANG_X[1], hang(1), { s: 9, c: c.honey, c2: c.coral }, { pat: 'plain' }, { pat: 'star' }),
  slot('heart', HANG_X[2], hang(1), { s: 10 }, { c: c.coral }, { c: c.inkPurple }, { c: c.honey }),
  slot('twinkle', HANG_X[3], hang(1), { s: 11 }, { c: c.honey }, { c: c.toyBlue }),
  slot('sock', HANG_X[4], hang(1), { s: 10, c2: c.white, pat: 'stripes' }, { c: c.toyBlue }, { c: c.coral }, { c: c.sage }),
  slot('star', HANG_X[5], hang(1), { s: 11, c: c.honey }, { rot: 0 }, { rot: 36 }),
  slot('flag', HANG_X[6], hang(1), { s: 10, shape: 'swallow' }, { c: c.coral }, { c: c.honey }, { c: c.toyBlue }),
  slot('bird', HANG_X[7], hang(1), { s: 10, c2: c.white }, { c: c.coral }, { c: c.toyBlue }, { c: c.honey }),
  // third shelf
  slot('drum', SX[0], stand(2, 11), { s: 14, c2: c.white, on: true }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('duck', SX[1], stand(2, 11) - 2, { s: 15, c: c.honey }, { on: false }, { on: true }),
  slot('ball', SX[2], stand(2, 14), { s: 14, c2: c.white, pat: 'stripes' }, { c: c.coral }, { c: c.honey }, { c: c.sage }),
  slot('rocket', SX[3], stand(2, 14) - 1, { s: 14, c2: c.toyBlue }, { c: c.white }, { c: c.coral }, { c: c.honey }),
  slot('cake', SX[4], stand(2, 10), { s: 14, c: c.honey, c2: c.white }, { n: 1 }, { n: 2 }, { n: 3 }),
  slot('die', SX[5], stand(2, 13), { s: 13, c: c.white }, { n: 2 }, { n: 4 }, { n: 6 }),
  slot('car', SX[6], stand(2, 9) - 2, { s: 15, c: c.sage, c2: c.roomSky }, { flip: false }, { flip: true }),
  slot('jar', SX[7], stand(2, 14), { s: 14, c: c.honey }, { c2: c.coral }, { c2: c.toyBlue }, { c2: c.sage }),
  slot('top', SX[8], stand(2, 14), { s: 14, c2: c.white }, { c: c.toyBlue }, { c: c.coral }, { c: c.sage }),
  // hanging under the third shelf
  slot('butterfly', HANG_X[0], hang(2), { s: 11, c2: c.honey }, { c: c.sage }, { c: c.coral }),
  slot('lolly', HANG_X[1], hang(2) - 3, { s: 9 }, { c: c.honey }, { c: c.coral }, { c: c.inkPurple }),
  slot('sock', HANG_X[2], hang(2), { s: 10, c: c.honey, c2: c.toyBlue }, { pat: 'plain' }, { pat: 'stripes' }),
  slot('ball', HANG_X[3], hang(2), { s: 9, c: c.toyBlue, c2: c.white, pat: 'dots' }, show, hide),
  slot('flag', HANG_X[4], hang(2), { s: 10, c: c.coral }, { shape: 'tri' }, { shape: 'square' }),
  slot('star', HANG_X[5], hang(2), { s: 11 }, { c: c.toyBlue }, { c: c.honey }, { c: c.coral }),
  slot('heart', HANG_X[6], hang(2), { s: 9, c: c.coral }, { sc: 1 }, { sc: 1.4 }),
  slot('umbrella', HANG_X[7], hang(2), { s: 11, c2: c.white, pat: 'stripes' }, { c: c.coral }, { c: c.toyBlue }, { c: c.honey }),
  // bottom shelf
  slot('gift', SX[0], stand(3, 12), { s: 14, c2: c.white, on: true }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('boat', SX[1], stand(3, 11) - 2, { s: 14, c: c.coral, c2: c.white }, { on: true }, { on: false }),
  slot('teddy', SX[2], stand(3, 15), { s: 15, c: c.honey, c2: c.coral, on: true }, show, hide),
  slot('books', SX[3], stand(3, 15), { s: 15, c: c.sage, c2: c.honey, n: 2 }, { shape: 'lean' }, { shape: 'none' }),
  slot('robot', SX[4], stand(3, 14) + 1, { s: 14, c: c.coral, on: true }, { c2: c.honey }, { c2: c.toyBlue }),
  slot('block', SX[5], stand(3, 13), { s: 13, c: c.sage, c2: c.white }, { shape: 'dot' }, { shape: 'heart' }, { shape: 'tri' }),
  slot('cup', SX[6], stand(3, 11), { s: 14, c: c.coral, c2: c.white }, { pat: 'dots' }, { pat: 'stripes' }, { pat: 'plain' }),
  slot('bucket', SX[7], stand(3, 12), { s: 14, c2: c.white, on: true }, { c: c.toyBlue }, { c: c.coral }, { c: c.honey }),
  slot('ball', SX[8], stand(3, 14), { s: 14, c: c.honey, c2: c.coral, pat: 'star' }, { sc: 1, dy: 0 }, { sc: 0.7, dy: 4 }),
]);

// ------------------------------------------------------------------ the garden picnic
const picnic = theme('picnic', 'The Garden Picnic', [
  // sky
  slot('sun', 360, 36, { s: 15, c: c.honey }, { n: 8 }, { n: 0 }),
  slot('cloud', 128, 28, { s: 15, c: c.white }, { shape: 'puff' }, { shape: 'long' }),
  slot('cloud', 222, 22, { s: 14, c: c.white }, show, hide),
  slot('cloud', 296, 56, { s: 13, c: c.white }, { dx: -12 }, { dx: 12 }),
  slot('bird', 172, 64, { s: 10, c2: c.white }, { c: c.coral }, { c: c.toyBlue }, { c: c.honey }),
  slot('bird', 246, 84, { s: 10, c: c.inkPurple, c2: c.white }, { flip: false }, { flip: true }),
  slot('kite', 110, 70, { s: 12, c2: c.white }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('balloon', 330, 96, { s: 9 }, { c: c.coral }, { c: c.toyBlue }, { c: c.honey }),
  slot('butterfly', 205, 102, { s: 10, c2: c.white }, { c: c.coral }, { c: c.toyBlue }, { c: c.inkPurple }),
  slot('bird', 66, 18, { s: 9, c: c.toyBlue, c2: c.white }, show, hide),
  slot('balloon', 388, 82, { s: 8 }, { c: c.honey }, { c: c.inkPurple }),
  slot('cloud', 302, 14, { s: 9, c: c.white }, show, hide),
  slot('bird', 170, 14, { s: 8, c2: c.white }, { c: c.honey }, { c: c.coral }),
  // the apple tree
  slot('apple', 22, 54, { s: 7 }, { c: c.coral }, { c: c.honey }),
  slot('apple', 58, 44, { s: 7, c: c.coral }, show, hide),
  slot('apple', 50, 88, { s: 7 }, { c: c.coral }, { c: c.honey }, { c: c.inkPurple }),
  // little trees on the hill
  slot('tree', 152, 96, { s: 11 }, { c: c.sage }, { c: c.honey }),
  slot('tree', 280, 102, { s: 11, c: c.sage }, show, hide),
  // the meadow, back row
  slot('mushroom', 20, 146, { s: 10, c: c.coral }, { n: 3 }, { n: 0 }),
  slot('flower', 70, 132, { s: 9, c2: c.honey }, { c: c.coral }, { c: c.white }, { c: c.inkPurple }),
  slot('ladybird', 114, 136, { s: 9, n: 4 }, { c: c.coral }, { c: c.honey }),
  slot('flower', 160, 130, { s: 9, c: c.honey, c2: c.coral }, show, hide),
  slot('bucket', 206, 134, { s: 11, c2: c.white, on: true }, { c: c.toyBlue }, { c: c.coral }, { c: c.sage }),
  slot('mushroom', 250, 130, { s: 10, n: 3 }, { c: c.coral }, { c: c.honey }),
  slot('flower', 296, 134, { s: 9, c: c.toyBlue, c2: c.white }, { n: 5 }, { n: 8 }),
  slot('ball', 340, 136, { s: 10, c: c.coral, c2: c.white }, { pat: 'stripes' }, { pat: 'dots' }),
  slot('umbrella', 384, 128, { s: 14, c: c.coral, c2: c.white }, { pat: 'stripes' }, { pat: 'plain' }),
  // the meadow, front row
  slot('flower', 46, 178, { s: 9, c2: c.honey }, { c: c.inkPurple }, { c: c.coral }),
  slot('butterfly', 92, 172, { s: 9, c2: c.white }, { c: c.honey }, { c: c.toyBlue }),
  slot('ladybird', 138, 180, { s: 8, c: c.coral, n: 4 }, show, hide),
  slot('flower', 182, 172, { s: 9, c: c.white, c2: c.honey }, { on: true, sc: 1 }, { on: true, sc: 1.4 }),
  slot('bird', 228, 176, { s: 9, c: c.coral, c2: c.honey }, { flip: false }, { flip: true }),
  slot('flower', 272, 172, { s: 9, c: c.coral }, { c2: c.honey }, { c2: c.toyBlue }),
  slot('mushroom', 318, 178, { s: 9, c: c.honey, n: 2 }, show, hide),
  slot('butterfly', 362, 172, { s: 9, c: c.sage }, { c2: c.coral }, { c2: c.white }),
  // on the blanket
  slot('cup', 82, 213, { s: 9, c: c.toyBlue, c2: c.white }, { pat: 'dots' }, { pat: 'plain' }),
  slot('sandwich', 126, 214, { s: 10, c: c.cream }, { c2: c.sage }, { c2: c.coral }),
  slot('apple', 170, 214, { s: 8, on: true }, { c: c.coral }, { c: c.honey }),
  slot('cake', 214, 212, { s: 11, c: c.cream, c2: c.coral, n: 2 }, { on: true }, { on: false }),
  slot('bottle', 258, 212, { s: 10, c2: c.white }, { c: c.coral }, { c: c.sage }, { c: c.toyBlue }),
  slot('cup', 302, 214, { s: 9, c2: c.white, pat: 'stripes' }, { c: c.honey }, { c: c.coral }, { c: c.sage }),
  slot('apple', 342, 216, { s: 8, on: true }, { c: c.coral }, { c: c.honey }),
  slot('teddy', 70, 246, { s: 12, c: c.woodLight, c2: c.toyBlue }, { on: true }, { on: false }),
  slot('jar', 114, 247, { s: 10, c2: c.coral }, { c: c.coral }, { c: c.sage }),
  slot('sandwich', 158, 248, { s: 10, c: c.cream, c2: c.sage }, show, hide),
  slot('cake', 202, 246, { s: 11, c: c.cream, n: 1, on: true }, { c2: c.white }, { c2: c.honey }, { c2: c.toyBlue }),
  slot('cup', 246, 248, { s: 9, c: c.coral, c2: c.white }, { on: true }, { on: false }),
  slot('apple', 290, 248, { s: 8, c: c.sage, on: true }, show, hide),
  slot('lolly', 336, 244, { s: 9 }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('bottle', 64, 279, { s: 10, c: c.toyBlue, c2: c.white }, { shape: 'tall' }, { shape: 'round' }),
  slot('sandwich', 108, 281, { s: 10, c: c.honey, c2: c.coral }, { rot: 0 }, { rot: 180 }),
  slot('ball', 152, 280, { s: 9, c2: c.white, pat: 'stripes' }, { c: c.sage }, { c: c.toyBlue }, { c: c.coral }),
  slot('cup', 196, 280, { s: 9, c: c.white, c2: c.coral }, { pat: 'stripes' }, { pat: 'dots' }),
  slot('gift', 240, 280, { s: 11, c2: c.white, on: true }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('sandwich', 284, 281, { s: 10, c2: c.sage }, { c: c.honey }, { c: c.cream }),
  slot('jar', 328, 279, { s: 10, c: c.honey }, { c2: c.coral }, { c2: c.toyBlue }),
  // the grass at the sides
  slot('flower', 18, 214, { s: 9, c2: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('mushroom', 20, 266, { s: 10, n: 3 }, { c: c.coral }, { c: c.toyBlue }),
  slot('flower', 384, 216, { s: 9, c: c.inkPurple, c2: c.honey }, show, hide),
  slot('bucket', 382, 268, { s: 11, c: c.honey, c2: c.coral }, { on: true }, { on: false }),
]);

// ------------------------------------------------------------------ pirate bath-time
/** The bathtub: its rim (y), its ends (x) and its bottom (backgrounds.ts draws it). */
export const TUB = { x0: 52, x1: 348, rim: 150, bottom: 240 };
const BUNT = [22, 66, 111, 155, 200, 245, 289, 334, 378];
const bathtime = theme('bathtime', 'Pirate Bath-Time', [
  // bunting of pirate flags across the top
  slot('flag', BUNT[0], 18, { s: 9, c: c.ink }, { shape: 'tri' }, { shape: 'swallow' }),
  slot('flag', BUNT[1], 19, { s: 9 }, { c: c.coral }, { c: c.ink }),
  slot('flag', BUNT[2], 19, { s: 9, c: c.honey }, show, hide),
  slot('flag', BUNT[3], 18, { s: 9, c: c.ink }, { shape: 'tri' }, { shape: 'square' }),
  slot('flag', BUNT[4], 17, { s: 9 }, { c: c.coral }, { c: c.toyBlue }),
  slot('flag', BUNT[5], 18, { s: 9, c: c.ink }, show, hide),
  slot('flag', BUNT[6], 18, { s: 9 }, { c: c.ink }, { c: c.toyBlue }),
  slot('flag', BUNT[7], 18, { s: 9, c: c.honey }, { shape: 'tri' }, { shape: 'swallow' }),
  slot('flag', BUNT[8], 17, { s: 9, c: c.coral }, { shape: 'tri' }, { shape: 'square' }),
  // towels on the rail (left) and bottles on the shelf (right)
  slot('towel', 34, 78, { s: 15, c2: c.white }, { c: c.coral, pat: 'stripes' }, { c: c.coral, pat: 'plain' }),
  slot('towel', 76, 78, { s: 15, c2: c.white, pat: 'stripes' }, { c: c.toyBlue }, { c: c.honey }, { c: c.sage }),
  slot('towel', 118, 76, { s: 14, c: c.honey, c2: c.coral, pat: 'dots' }, show, hide),
  slot('bottle', 270, 66, { s: 11, c2: c.coral }, { c: c.toyBlue }, { c: c.sage }, { c: c.honey }),
  slot('bottle', 304, 66, { s: 11, c: c.coral, c2: c.honey }, { shape: 'tall' }, { shape: 'round' }),
  slot('bottle', 338, 66, { s: 11, c: c.sage, c2: c.white }, show, hide),
  slot('cup', 372, 70, { s: 10, c: c.honey, c2: c.white }, { pat: 'dots' }, { pat: 'stripes' }),
  // the porthole, and the wall around it
  slot('fish', 200, 64, { s: 12, c2: c.white }, { c: c.coral }, { c: c.honey }, { c: c.sage }),
  slot('starfish', 152, 100, { s: 9 }, { c: c.coral }, { c: c.honey }),
  slot('heart', 146, 56, { s: 8, c: c.coral }, show, hide),
  slot('pennant', 244, 106, { s: 12, c: c.ink, c2: c.white }, { shape: 'skull' }, { shape: 'star' }, { shape: 'stripe' }),
  slot('bubbles', 40, 122, { s: 12 }, { n: 3 }, { n: 5 }),
  slot('chest', 324, 106, { s: 11, c: c.woodMid, on: true }, { c2: c.honey }, { c2: c.coral }),
  slot('clock', 370, 110, { s: 13, c: c.toyBlue }, { n: 3 }, { n: 7 }),
  // things floating in the bath (on the water line)
  slot('boat', 80, 132, { s: 14, c: c.woodMid, on: true }, { c2: c.white }, { c2: c.coral }, { c2: c.ink }),
  slot('duck', 124, 136, { s: 13, c: c.honey }, { flip: false }, { flip: true }),
  slot('bubbles', 166, 130, { s: 13 }, { n: 2 }, { n: 4 }),
  slot('boat', 210, 132, { s: 14, c: c.coral, c2: c.white }, { on: true }, { on: false }),
  slot('duck', 254, 136, { s: 13, on: true }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('fish', 298, 128, { s: 11, c: c.sage, c2: c.honey }, { pat: 'stripes', rot: -30 }, { pat: 'plain', rot: -30 }),
  slot('boat', 336, 132, { s: 12, c: c.ink, c2: c.white }, show, hide),
  slot('bubbles', 100, 96, { s: 11 }, { n: 3 }, { n: 1 }),
  slot('bubbles', 288, 96, { s: 11, n: 4 }, show, hide),
  slot('bubbles', 390, 146, { s: 8 }, { n: 2 }, { n: 4 }),
  // pictures on the front of the tub
  slot('star', 74, 174, { s: 10 }, { c: c.honey }, { c: c.coral }, { c: c.toyBlue }),
  slot('fish', 116, 174, { s: 11, c: c.toyBlue, c2: c.white }, { pat: 'plain' }, { pat: 'stripes' }),
  slot('shell', 158, 174, { s: 10 }, { c: c.coral }, { c: c.honey }),
  slot('starfish', 200, 174, { s: 11, c: c.coral }, show, hide),
  slot('heart', 242, 174, { s: 10 }, { c: c.coral }, { c: c.toyBlue }),
  slot('fish', 284, 174, { s: 11, c: c.honey, c2: c.coral }, { flip: false }, { flip: true }),
  slot('shell', 326, 174, { s: 10, c: c.cream }, { rot: 0 }, { rot: 180 }),
  slot('star', 95, 212, { s: 10, c: c.toyBlue }, { rot: 0 }, { rot: 36 }),
  slot('twinkle', 137, 212, { s: 11 }, { c: c.honey }, { c: c.sage }),
  slot('shell', 179, 212, { s: 10, c: c.toyBlue }, show, hide),
  slot('starfish', 221, 212, { s: 11 }, { c: c.honey }, { c: c.sage }, { c: c.coral }),
  slot('heart', 263, 212, { s: 10, c: c.coral }, { sc: 1 }, { sc: 1.35 }),
  slot('star', 305, 212, { s: 10 }, { c: c.sage }, { c: c.coral }),
  // either side of the tub
  slot('plant', 22, 176, { s: 14, c: c.coral }, { n: 3 }, { n: 5 }),
  slot('bottle', 22, 224, { s: 11, c2: c.white }, { c: c.toyBlue }, { c: c.coral }),
  slot('bucket', 378, 182, { s: 12, c2: c.white, on: true }, { c: c.coral }, { c: c.toyBlue }, { c: c.honey }),
  slot('chest', 378, 228, { s: 14, c: c.woodMid, c2: c.honey }, { on: false }, { on: true }),
  // on the floor
  slot('slipper', 22, 274, { s: 14, c2: c.white }, { c: c.coral, on: true }, { c: c.coral, on: false }),
  slot('slipper', 62, 282, { s: 14, c2: c.white, on: true }, { c: c.coral }, { c: c.toyBlue }),
  slot('crab', 102, 272, { s: 11, c: c.coral }, { on: false }, { on: true }),
  slot('duck', 142, 278, { s: 11 }, { c: c.honey }, { c: c.coral }),
  slot('starfish', 182, 274, { s: 10, c: c.honey }, { rot: 0 }, { rot: 36 }),
  slot('boat', 222, 274, { s: 11, c: c.toyBlue, c2: c.white, on: true }, { flip: false }, { flip: true }),
  slot('shell', 262, 280, { s: 10, c: c.honey }, show, hide),
  slot('ball', 302, 278, { s: 11, c: c.coral, c2: c.white }, { pat: 'stripes' }, { pat: 'dots' }, { pat: 'plain' }),
  slot('crab', 342, 274, { s: 11, on: false }, { c: c.coral }, { c: c.honey }),
  slot('fish', 382, 280, { s: 10, c: c.toyBlue, c2: c.white, rot: -20 }, { c: c.toyBlue }, { c: c.coral }),
]);

// ------------------------------------------------------------------ the bedtime shelf
/** The bookcase shelves and the bed (backgrounds.ts). */
export const CASE_SHELVES = [74, 136, 198];
const bedtime = theme('bedtime', 'Bedtime', [
  // the night window
  slot('moon', 200, 50, { s: 15, c: c.cream }, { shape: 'crescent' }, { shape: 'full' }),
  slot('twinkle', 160, 36, { s: 8, c: c.honey }, show, hide),
  slot('twinkle', 238, 30, { s: 8 }, { c: c.honey }, { c: c.white }),
  slot('star', 164, 88, { s: 7, c: c.honey }, { rot: 0 }, { rot: 36 }),
  slot('twinkle', 240, 86, { s: 8, c: c.honey }, { sc: 1 }, { sc: 1.5 }),
  // bunting above the window
  slot('flag', 150, 6, { s: 7, c: c.coral }, { shape: 'tri' }, { shape: 'square' }),
  slot('flag', 200, 8, { s: 7 }, { c: c.honey }, { c: c.toyBlue }),
  slot('flag', 250, 6, { s: 7, c: c.sage }, show, hide),
  // the bookcase (left)
  slot('books', 30, CASE_SHELVES[0] - 15, { s: 15, c: c.coral, c2: c.toyBlue }, { n: 3 }, { n: 2 }),
  slot('robot', 74, CASE_SHELVES[0] - 13, { s: 13, c: c.sage, c2: c.white }, { on: true }, { on: false }),
  slot('ball', 30, CASE_SHELVES[1] - 12, { s: 12, c: c.honey, c2: c.coral }, { pat: 'star' }, { pat: 'plain' }),
  slot('books', 74, CASE_SHELVES[1] - 15, { s: 15, n: 3 }, { c: c.honey, c2: c.sage }, { c: c.inkPurple, c2: c.sage }),
  slot('rocket', 30, CASE_SHELVES[2] - 14, { s: 14, c: c.white, c2: c.coral }, { n: 1 }, { n: 2 }),
  slot('jar', 74, CASE_SHELVES[2] - 14, { s: 13, c2: c.toyBlue }, { c: c.coral }, { c: c.honey }),
  slot('frame', 52, 18, { s: 13, c: c.honey }, { shape: 'sun' }, { shape: 'tree' }, { shape: 'heart' }),
  // the curtains and the wall
  slot('heart', 118, 60, { s: 9, c: c.coral }, show, hide),
  slot('frame', 324, 40, { s: 14, c: c.coral, shape: 'boat' }, { rot: 0 }, { rot: 12 }),
  slot('frame', 376, 44, { s: 12, c: c.toyBlue }, { shape: 'tree' }, { shape: 'sun' }),
  slot('clock', 282, 92, { s: 13, c: c.sage }, { n: 4 }, { n: 9 }),
  slot('butterfly', 118, 104, { s: 9, c2: c.white }, { c: c.toyBlue }, { c: c.honey }),
  // the mobile over the bed
  slot('star', 318, 98, { s: 9 }, { c: c.honey }, { c: c.coral }),
  slot('moon', 352, 104, { s: 9, c: c.honey, shape: 'crescent' }, { flip: false }, { flip: true }),
  slot('twinkle', 386, 96, { s: 8, c: c.toyBlue }, show, hide),
  // under the window: the chest of drawers and what stands on it
  slot('lamp', 156, 120, { s: 13, c2: c.honey }, { c: c.coral }, { c: c.toyBlue }, { c: c.sage }),
  slot('teddy', 200, 122, { s: 13, c: c.woodLight, c2: c.coral }, { on: true }, { on: false }),
  slot('cup', 242, 126, { s: 10, c: c.toyBlue, c2: c.white }, { on: true }, { on: false }),
  slot('ball', 156, 166, { s: 7, c: c.honey, c2: c.honey }, { c: c.honey }, { c: c.coral }),
  slot('ball', 200, 166, { s: 7, c: c.honey, c2: c.honey }, show, hide),
  slot('ball', 244, 166, { s: 7, c: c.honey, c2: c.honey }, { sc: 1 }, { sc: 1.5 }),
  slot('heart', 178, 200, { s: 9, c: c.coral }, { c: c.coral }, { c: c.toyBlue }),
  slot('star', 222, 200, { s: 9 }, { c: c.honey }, { c: c.sage }),
  // the bed (right)
  slot('teddy', 300, 158, { s: 14, c: c.cream, c2: c.toyBlue, on: true }, show, hide),
  slot('duck', 352, 160, { s: 12 }, { c: c.honey }, { c: c.coral }),
  slot('heart', 300, 206, { s: 10 }, { c: c.coral }, { c: c.honey }),
  slot('star', 344, 206, { s: 10, c: c.honey }, { rot: 0 }, { rot: 36 }),
  slot('twinkle', 384, 206, { s: 10 }, { c: c.white }, { c: c.honey }),
  slot('moon', 384, 160, { s: 8, c: c.honey, shape: 'crescent' }, { on: false }, { on: true }),
  // the bedside: books and slippers
  slot('books', 120, 172, { s: 12, c: c.sage, c2: c.honey, n: 2 }, { shape: 'none' }, { shape: 'lean' }),
  slot('plant', 120, 220, { s: 12, c: c.coral }, { n: 3 }, { n: 5 }),
  // the bookcase's bottom: toy box
  slot('block', 30, 222, { s: 12, c2: c.white, shape: 'star' }, { c: c.coral }, { c: c.toyBlue }),
  slot('block', 74, 222, { s: 12, c: c.honey, c2: c.coral }, { shape: 'heart' }, { shape: 'dot' }),
  // on the floor
  slot('slipper', 22, 270, { s: 15, c: c.toyBlue, c2: c.white }, { on: true }, { on: false }),
  slot('slipper', 66, 278, { s: 15, c2: c.white, on: true }, { c: c.toyBlue }, { c: c.coral }),
  slot('car', 112, 272, { s: 14, c: c.coral, c2: c.roomSky }, { flip: false }, { flip: true }),
  slot('block', 154, 268, { s: 12, c: c.sage, c2: c.honey }, { shape: 'tri' }, { shape: 'star' }),
  slot('block', 186, 284, { s: 11, c: c.toyBlue, c2: c.white, shape: 'dot' }, show, hide),
  slot('drum', 228, 274, { s: 13, c: c.coral, c2: c.white }, { on: true }, { on: false }),
  slot('sock', 268, 276, { s: 12, c: c.honey, c2: c.coral }, { pat: 'stripes' }, { pat: 'plain' }),
  slot('top', 308, 270, { s: 12, c: c.toyBlue }, { c2: c.honey }, { c2: c.white }),
  slot('ball', 346, 276, { s: 12, c2: c.white, pat: 'stripes' }, { c: c.coral }, { c: c.sage }, { c: c.honey }),
  slot('die', 384, 270, { s: 11, c: c.white }, { n: 3 }, { n: 6 }),
  // the rug pattern
  slot('star', 200, 246, { s: 10, c: c.honey }, show, hide),
  slot('hat', 258, 240, { s: 11, c: c.toyBlue, c2: c.honey }, { shape: 'party' }, { shape: 'cap' }),
  slot('rocket', 340, 236, { s: 12, c: c.white, c2: c.toyBlue }, { rot: 0 }, { rot: 30 }),
  slot('lolly', 116, 140, { s: 8 }, { c: c.coral }, { c: c.sage }),
  slot('star', 200, 92, { s: 7, c: c.white }, show, hide),
  slot('butterfly', 286, 40, { s: 8, c2: c.white }, { c: c.coral }, { c: c.honey }),
  slot('ball', 52, 243, { s: 7, c: c.toyBlue, c2: c.white, pat: 'stripes' }, show, hide),
  slot('heart', 338, 132, { s: 8 }, { c: c.coral }, { c: c.toyBlue }),
  slot('kite', 270, 140, { s: 9, c2: c.white }, { c: c.honey }, { c: c.toyBlue }),
]);

export const THEMES: ThemeDef[] = [toyshop, picnic, bathtime, bedtime];
export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id)!;
