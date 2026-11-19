/**
 * Odd Page Out: the static backdrop of each scene (walls, shelves, sky, tub, bed…). Identical on
 * both pages, always. Only slots (themes.ts) ever change. Pure data, picture units (400 × 300).
 */
import { PALETTE, ROOM } from '../../game/palette';
import { C, E, L, P, PIC_H, PIC_W, R, mix, poly, shade, tint, type Shape } from './shapes';
import { CASE_SHELVES, HANG_X, SHOP_SHELVES, TUB, type ThemeId } from './themes';

const K = PALETTE;

function toyshop(): Shape[] {
  const out: Shape[] = [R(0, 0, PIC_W, PIC_H, K.cream, 0, { s: null })];
  // wallpaper stripes
  for (let x = 12; x < PIC_W; x += 24) out.push(R(x, 0, 10, PIC_H, mix(K.cream, K.honey, 0.18), 0, { s: null }));
  // the shop's striped awning with a scalloped edge
  for (let i = 0; i < 20; i++) {
    const col = i % 2 ? K.white : K.coral;
    out.push(R(i * 20, 0, 20, 14, col, 0, { s: null }), C(i * 20 + 10, 14, 10, col, { s: null }));
  }
  out.push(L(0, 0.5, PIC_W, 0.5, PALETTE.ink, 3));
  for (let i = 0; i < 20; i++) out.push(P(`M${i * 20},14A10,10 0 0 0 ${i * 20 + 20},14`, 'none', { sw: 1.6 }));
  // shelves (the bottom one is the shop floor)
  SHOP_SHELVES.forEach((y, row) => {
    if (row === SHOP_SHELVES.length - 1) {
      out.push(R(0, y, PIC_W, PIC_H - y, K.woodMid, 0, { s: null }), L(0, y, PIC_W, y, PALETTE.ink, 2));
      for (let x = 30; x < PIC_W; x += 70) out.push(L(x, y + 2, x - 12, PIC_H, shade(K.woodMid, 0.2), 1.4));
      return;
    }
    out.push(R(-2, y, PIC_W + 4, 7, K.woodMid, 1.5), L(0, y + 7, PIC_W, y + 7, shade(K.woodMid, 0.45), 1.2));
    for (const x of [8, PIC_W - 8]) out.push(P(poly([[x - 4, y + 7], [x + 4, y + 7], [x, y + 16]]), K.woodDark, { sw: 1.4 }));
    // hooks for the hanging toys
    for (const x of HANG_X) out.push(L(x, y + 7, x, y + 13, PALETTE.ink, 1.4));
  });
  return out;
}

function picnic(): Shape[] {
  const out: Shape[] = [R(0, 0, PIC_W, PIC_H, K.roomSky, 0, { s: null })];
  // far hill, near meadow
  out.push(P(`M0,${110}Q120,${82} 240,${104}T${PIC_W},${96}L${PIC_W},${PIC_H}L0,${PIC_H}Z`, mix(K.sage, K.white, 0.25), { sw: 2 }));
  out.push(P(`M0,${150}Q200,${128} ${PIC_W},${150}L${PIC_W},${PIC_H}L0,${PIC_H}Z`, mix(K.felt, K.white, 0.15), { s: null }));
  // grass tufts
  for (const [x, y] of [[94, 152], [232, 150], [330, 156], [60, 196], [168, 194], [300, 198], [24, 240], [380, 244]]) out.push(P(`M${x - 5},${y}L${x - 2},${y - 7}L${x},${y}L${x + 3},${y - 8}L${x + 5},${y}`, 'none', { s: shade(K.felt, 0.25), sw: 1.4 }));
  // the apple tree
  out.push(R(32, 70, 12, 84, K.woodMid, 2), C(38, 64, 38, K.sage), C(14, 80, 18, K.sage, { s: null }), C(62, 78, 18, K.sage, { s: null }), C(38, 64, 37, K.sage, { s: null }));
  // the picnic blanket: gingham in perspective
  const bl: [number, number][] = [[58, 194], [342, 194], [370, 298], [30, 298]];
  out.push(P(poly(bl), tint(K.coral, 0.25), { sw: 2 }));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let i = 1; i < 7; i += 2) {
    const xa = lerp(bl[0][0], bl[1][0], i / 7);
    const xb = lerp(bl[3][0], bl[2][0], i / 7);
    const xa2 = lerp(bl[0][0], bl[1][0], (i + 1) / 7);
    const xb2 = lerp(bl[3][0], bl[2][0], (i + 1) / 7);
    out.push(P(poly([[xa, 194], [xa2, 194], [xb2, 298], [xb, 298]]), K.white, { s: null, o: 0.5 }));
  }
  for (const [t0, t1] of [[0.18, 0.36], [0.54, 0.72]]) {
    const y0 = lerp(194, 298, t0);
    const y1 = lerp(194, 298, t1);
    out.push(P(poly([[lerp(58, 30, t0), y0], [lerp(342, 370, t0), y0], [lerp(342, 370, t1), y1], [lerp(58, 30, t1), y1]]), K.white, { s: null, o: 0.45 }));
  }
  out.push(P(poly(bl), 'none', { sw: 2 }));
  return out;
}

function bathtime(): Shape[] {
  const wall = tint(K.roomSky, 0.35);
  const out: Shape[] = [R(0, 0, PIC_W, PIC_H, wall, 0, { s: null })];
  for (let x = 25; x < PIC_W; x += 25) out.push(L(x, 0, x, 250, tint(K.toyBlue, 0.35), 1));
  for (let y = 25; y < 250; y += 25) out.push(L(0, y, PIC_W, y, tint(K.toyBlue, 0.35), 1));
  // bunting string
  out.push(P(`M0,8Q100,14 200,10T${PIC_W},8`, 'none', { sw: 1.4 }));
  // floor
  out.push(R(0, 250, PIC_W, 50, K.cream, 0, { s: null }), L(0, 250, PIC_W, 250, PALETTE.ink, 2));
  for (let x = 0; x < PIC_W; x += 40) out.push(L(x, 250, x - 16, PIC_H, shade(K.cream, 0.15), 1.2));
  out.push(E(200, 286, 120, 13, tint(K.toyBlue, 0.25), { sw: 1.6 }));
  // towel rail and shelf
  out.push(L(12, 58, 140, 58, K.brass, 3.5), C(12, 58, 3.5, K.brass, { sw: 1.4 }), C(140, 58, 3.5, K.brass, { sw: 1.4 }));
  out.push(R(252, 80, 142, 6, K.white, 2), P(poly([[262, 86], [272, 86], [262, 96]]), K.white, { sw: 1.4 }), P(poly([[384, 86], [374, 86], [384, 96]]), K.white, { sw: 1.4 }));
  // the porthole mirror
  out.push(C(200, 64, 32, K.brass), C(200, 64, 26, tint(K.toyBlue, 0.15), { sw: 1.6 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push(C(200 + Math.cos(a) * 29, 64 + Math.sin(a) * 29, 1.6, shade(K.brass, 0.3), { s: null }));
  }
  // water, then the tub in front of it
  out.push(E(200, TUB.rim - 2, 150, 9, tint(K.toyBlue, 0.2), { sw: 1.6 }));
  out.push(P(`M${TUB.x0 - 6},${TUB.rim}L${TUB.x1 + 6},${TUB.rim}L${TUB.x1},${TUB.bottom - 26}Q${TUB.x1 - 6},${TUB.bottom} ${TUB.x1 - 40},${TUB.bottom}L${TUB.x0 + 40},${TUB.bottom}Q${TUB.x0 + 6},${TUB.bottom} ${TUB.x0},${TUB.bottom - 26}Z`, K.white, { sw: 2.2 }));
  out.push(R(TUB.x0 - 10, TUB.rim - 4, TUB.x1 - TUB.x0 + 20, 9, K.white, 4, { sw: 2 }));
  for (const x of [TUB.x0 + 34, TUB.x1 - 34]) out.push(P(`M${x - 8},${TUB.bottom - 1}L${x + 8},${TUB.bottom - 1}L${x + 4},${TUB.bottom + 12}Q${x},${TUB.bottom + 16} ${x - 4},${TUB.bottom + 12}Z`, K.brass, { sw: 1.6 }));
  return out;
}

function bedtime(): Shape[] {
  const wall = mix(K.inkPurple, K.white, 0.68);
  const out: Shape[] = [R(0, 0, PIC_W, PIC_H, wall, 0, { s: null })];
  for (let y = 12; y < 250; y += 26) for (let x = (y / 26) % 2 ? 6 : 19; x < PIC_W; x += 26) out.push(C(x, y, 1.6, mix(wall, K.white, 0.5), { s: null }));
  // floor and rug
  out.push(R(0, 250, PIC_W, 50, K.woodMid, 0, { s: null }), L(0, 250, PIC_W, 250, PALETTE.ink, 2));
  for (const y of [266, 283]) out.push(L(0, y, PIC_W, y, shade(K.woodMid, 0.25), 1.2));
  out.push(E(250, 246, 112, 18, tint(K.sage, 0.3), { sw: 1.8 }), E(250, 246, 98, 12, 'none', { s: tint(K.sage, 0.7), sw: 2 }));
  // the night window, its curtains and a bunting string
  out.push(R(142, 14, 116, 96, K.white, 3), R(148, 20, 104, 84, shade(K.inkPurple, 0.35), 2, { sw: 1.6 }), R(138, 108, 124, 6, K.white, 2));
  out.push(P(`M${130},12Q${136},60 ${130},116L${150},116Q${146},60 ${152},12Z`, tint(K.coral, 0.2), { sw: 1.8 }));
  out.push(P(`M${270},12Q${264},60 ${270},116L${250},116Q${254},60 ${248},12Z`, tint(K.coral, 0.2), { sw: 1.8 }));
  out.push(L(124, 12, 276, 12, K.woodDark, 3), P('M126,0Q200,8 274,0', 'none', { sw: 1.2 }));
  // bookcase
  out.push(R(6, 30, 92, 206, K.woodLight, 2), R(12, 36, 80, 194, tint(K.woodLight, 0.2), 1, { sw: 1.4 }));
  for (const y of CASE_SHELVES) out.push(R(10, y, 84, 5, K.woodMid, 1, { sw: 1.4 }));
  out.push(R(10, 236 - 6, 84, 6, K.woodMid, 1, { sw: 1.4 }), R(10, 236, 10, 14, K.woodDark, 0, { sw: 1.4 }), R(84, 236, 10, 14, K.woodDark, 0, { sw: 1.4 }));
  // chest of drawers under the window
  out.push(R(134, 136, 132, 100, K.woodLight, 3), R(142, 146, 116, 38, tint(K.woodLight, 0.25), 2, { sw: 1.4 }), R(142, 190, 116, 38, tint(K.woodLight, 0.25), 2, { sw: 1.4 }));
  out.push(R(140, 236, 10, 14, K.woodDark, 0, { sw: 1.4 }), R(250, 236, 10, 14, K.woodDark, 0, { sw: 1.4 }));
  // bed: headboard, mattress, quilt, legs
  out.push(R(282, 128, 12, 112, K.woodDark, 3), R(290, 172, 114, 22, K.white, 4), R(290, 186, 114, 46, ROOM.blanket, 4));
  for (let x = 306; x < PIC_W; x += 26) out.push(L(x, 188, x, 230, tint(ROOM.blanket, 0.3), 1.6));
  out.push(R(292, 232, 10, 18, K.woodDark, 0, { sw: 1.4 }), R(384, 232, 10, 18, K.woodDark, 0, { sw: 1.4 }));
  // mobile over the bed
  out.push(L(352, 0, 352, 78, PALETTE.ink, 1.2), P('M318,84Q352,72 386,82', 'none', { s: K.woodDark, sw: 2.5 }));
  for (const [x, y] of [[318, 84], [352, 78], [386, 82]]) out.push(L(x, y, x, y + (x === 352 ? 16 : 7), PALETTE.ink, 1));
  return out;
}

export const BACKGROUNDS: Record<ThemeId, () => Shape[]> = { toyshop, picnic, bathtime, bedtime };

/** Memoised: backgrounds never change. */
const cache = new Map<ThemeId, Shape[]>();
export function background(id: ThemeId): Shape[] {
  let b = cache.get(id);
  if (!b) cache.set(id, (b = BACKGROUNDS[id]()));
  return b;
}

