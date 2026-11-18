/**
 * Toy Squad model specs: one code-built toy per roster id. Presentation only.
 *
 * A toy is a list of primitive parts from a small shared library (see `toys.ts`, which bakes each
 * spec into one vertex-coloured geometry). This file is pure data: no three.js, no DOM.
 *
 * Space: +z is the toy's front, +y up, 1 unit = 1 cm. A toy stands on a team-coloured stand at
 * y = 0.12 and should stay inside x/z ±1.4 and y ≤ 3.4 so it fits one board square under its bars.
 * `s` is the full size of a part (diameter/height), not a radius. Parts are centred on `p`, except
 * `dome`, whose flat base sits on `p`. Axis conventions for the unit primitives:
 *   cyl / hex / frust / cone / pyr: along +y (cone and pyr apex up; frust is narrower at the top)
 *   torus / hoop / arc / gear / crimp / star: in the XY plane (facing +z); arc is the upper half
 *   prism: triangle in the XY plane (apex +y), extruded along z
 */
import { PALETTE, ROOM } from '../../game/palette';

export type Prim = 'box' | 'rbox' | 'ball' | 'dome' | 'cyl' | 'hex' | 'frust' | 'cone' | 'pyr' | 'gem'
  | 'torus' | 'hoop' | 'arc' | 'gear' | 'crimp' | 'star' | 'prism';
export type V3 = readonly [number, number, number];
export type EulerOrder = 'XYZ' | 'YXZ' | 'ZYX';
export interface ToyPart { g: Prim; c: string; p: V3; s: V3; r: V3; o: EulerOrder }
/** Idle/walk style. Whole-toy motion only, so every toy stays a single draw call. */
export type Motion = 'march' | 'hop' | 'float' | 'wobble' | 'jitter' | 'rock' | 'slither' | 'tick' | 'prowl' | 'stomp' | 'twirl';
export interface ToySpec { parts: ToyPart[]; motion: Motion }

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
/** Blend two palette colours (sRGB). Every toy colour is a palette token or a blend of two. */
export const mix = (a: string, b: string, t: number) => '#' + [0, 1, 2]
  .map(i => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, '0')).join('').toUpperCase();

const P = PALETTE;
export const TOY_COLOURS = {
  cream: P.cream, honey: P.honey, coral: P.coral, blue: P.toyBlue, sage: P.sage, purple: P.inkPurple,
  woodL: P.woodLight, woodM: P.woodMid, woodD: P.woodDark, card: P.cardboard, cardD: P.cardboardDark,
  felt: P.felt, feltD: P.feltDark, brass: P.brass, ink: P.ink, white: P.white,
  tin: P.roomFabric, steel: ROOM.lampMetal, silver: ROOM.radiator, copper: ROOM.terracotta, teal: ROOM.pendant,
  yellow: ROOM.pillow, leaf: ROOM.leaf, leafD: ROOM.leafDark,
  pink: mix(P.coral, P.white, 0.5), orange: mix(P.honey, P.coral, 0.5), navy: mix(P.toyBlue, P.ink, 0.6),
  sky: mix(P.roomSky, P.white, 0.25), glass: mix(P.toyBlue, P.white, 0.55), lilac: mix(P.inkPurple, P.white, 0.5),
  violet: mix(P.inkPurple, P.coral, 0.35), plum: mix(P.inkPurple, P.ink, 0.45), wine: mix(P.coral, P.ink, 0.5),
  lime: mix(P.sage, P.honey, 0.4), cork: mix(P.woodLight, P.cream, 0.35), grey: mix(ROOM.lampMetal, ROOM.radiator, 0.5),
  obsidian: mix(P.ink, P.inkPurple, 0.3), sand: mix(P.cardboard, P.honey, 0.25),
} as const;
const C = TOY_COLOURS;

const H = Math.PI / 2, PI = Math.PI;
const Z: V3 = [0, 0, 0];
const mk = (g: Prim) => (c: string, p: V3, s: V3 | number, r: V3 = Z, o: EulerOrder = 'XYZ'): ToyPart =>
  ({ g, c, p, s: typeof s === 'number' ? [s, s, s] : s, r, o });
const box = mk('box'), rbox = mk('rbox'), ball = mk('ball'), dome = mk('dome'), cyl = mk('cyl'), hex = mk('hex'), frust = mk('frust'),
  cone = mk('cone'), pyr = mk('pyr'), gem = mk('gem'), torus = mk('torus'), hoop = mk('hoop'), arc = mk('arc'), gear = mk('gear'),
  star = mk('star'), prism = mk('prism');
/** Reflect a part across the toy's centre plane (x → −x). */
const mirror = (p: ToyPart): ToyPart => ({ ...p, p: [-p.p[0], p.p[1], p.p[2]], r: [p.r[0], -p.r[1], -p.r[2]] });
const pair = (...parts: ToyPart[]) => parts.flatMap(p => [p, mirror(p)]);
/** A stick (or any y-axis primitive) running from `a` to `b`. */
const rod = (c: string, a: V3, b: V3, thick: number, g: Prim = 'cyl'): ToyPart => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1;
  return { g, c, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [thick, len, thick],
    r: [Math.acos(Math.max(-1, Math.min(1, d[1] / len))), Math.atan2(d[0], d[2]), 0], o: 'YXZ' };
};
/** Upright triangular fin with its chord along z, leaning outwards (+x) by `lean` radians. s = [chord, height, thickness]. */
const fin = (c: string, p: V3, s: V3, lean = 0): ToyPart => ({ g: 'prism', c, p, s, r: [0, H, -lean], o: 'ZYX' });
const flat = (g: Prim) => (c: string, p: V3, s: V3 | number): ToyPart => mk(g)(c, p, s, [H, 0, 0]);
const flatTorus = flat('torus'), flatHoop = flat('hoop'), flatGear = flat('gear'), flatStar = flat('star');
const eyes = (y: number, z: number, gap = 0.24, size = 0.17, c: string = C.ink) => pair(ball(c, [gap, y, z], size));
const bigEyes = (y: number, z: number, gap = 0.26, size = 0.3) => pair(ball(C.white, [gap, y, z], size), ball(C.ink, [gap, y, z + size * 0.32], size * 0.5));
const feet = (c: string, gap = 0.36, len = 0.8, w = 0.46) => pair(rbox(c, [gap, 0.3, 0.1], [w, 0.36, len]));
/** Brass wind-up key in the back. Every Clockwork toy carries one. */
const key = (y: number, z: number, k = 1): ToyPart[] => [cyl(C.brass, [0, y, z - 0.2 * k], [0.14 * k, 0.5 * k, 0.14 * k], [H, 0, 0]),
  ...pair(flatTorus(C.brass, [0.25 * k, y, z - 0.6 * k], 0.55 * k))];
/** Four stubby legs for quadrupeds. */
const legs = (c: string, x: number, zFront: number, zBack: number, h = 0.6, w = 0.26) =>
  pair(cyl(c, [x, 0.12 + h / 2, zFront], [w, h, w]), cyl(c, [x, 0.12 + h / 2, zBack], [w, h, w]));
/** Simple two-legged toy: feet, body, round head, eyes. Head centre is at y = 0.45 + h + headR * 0.8. */
function biped(o: { body: string; head?: string; foot?: string; w?: number; h?: number; headR?: number; shape?: Prim; arms?: string | null }): ToyPart[] {
  const w = o.w ?? 0.95, h = o.h ?? 1.15, headR = o.headR ?? 0.52, hy = 0.45 + h + headR * 0.8;
  return [...feet(o.foot ?? C.ink), mk(o.shape ?? 'cyl')(o.body, [0, 0.45 + h / 2, 0], [w, h, w * 0.92]),
    ball(o.head ?? C.cream, [0, hy, 0], headR * 2), ...eyes(hy + 0.02, headR * 0.92),
    ...(o.arms === null ? [] : pair(ball(o.arms ?? o.body, [w / 2 + 0.1, 0.45 + h * 0.6, 0.08], [0.32, 0.62, 0.34])))];
}
const ring = <T,>(n: number, f: (angle: number, i: number) => T, start = 0) => Array.from({ length: n }, (_, i) => f(start + i * 2 * PI / n, i));
const toy = (motion: Motion, ...parts: (ToyPart | ToyPart[])[]): ToySpec => ({ motion, parts: parts.flat() });

export const TOY_SPECS: Record<string, ToySpec> = {
  // ───────────── Common ─────────────
  soldier: toy('march', biped({ body: C.blue }),
    cyl(C.coral, [0, 2.78, 0], [0.72, 0.75, 0.72]), cyl(C.ink, [0, 2.42, 0.12], [0.9, 0.08, 0.95]), ball(C.honey, [0, 3.25, 0], 0.3),
    pair(box(C.white, [0, 1.15, 0.45], [0.13, 1.15, 0.06], [0, 0, 0.62]), ball(C.honey, [0.56, 1.52, 0], [0.34, 0.16, 0.5])),
    rod(C.woodD, [0.66, 0.9, 0.25], [0.66, 2.6, -0.35], 0.13), rod(C.silver, [0.66, 2.6, -0.35], [0.66, 3.1, -0.52], 0.07)),
  robot: toy('stomp', feet(C.steel, 0.42, 0.9, 0.56), rbox(C.blue, [0, 1.12, 0], [1.5, 1.3, 1.2]), rbox(C.tin, [0, 2.2, 0], [1.1, 0.8, 0.95]),
    box(C.ink, [0, 2.24, 0.45], [0.8, 0.3, 0.1]), eyes(2.24, 0.5, 0.2, 0.16, C.honey), cyl(C.steel, [0, 2.8, 0], [0.07, 0.5, 0.07]), ball(C.coral, [0, 3.1, 0], 0.24),
    cyl(C.cream, [0, 1.2, 0.6], [0.55, 0.06, 0.55], [H, 0, 0]), rod(C.coral, [0, 1.2, 0.65], [0.14, 1.36, 0.65], 0.05),
    pair(rbox(C.tin, [0.93, 1.15, 0.05], [0.3, 0.95, 0.42]), ball(C.steel, [0.93, 0.6, 0.12], 0.36)), key(1.2, -0.6, 1.5)),
  hare: toy('hop', flatTorus(C.tin, [0, 0.3, 0], 0.95), flatTorus(C.tin, [0, 0.56, 0], 0.85), flatTorus(C.tin, [0, 0.82, 0], 0.75),
    ball(C.lilac, [0, 1.42, -0.05], [1.1, 1.0, 1.2]), ball(C.lilac, [0, 2.1, 0.35], 0.85), eyes(2.18, 0.72, 0.2), ball(C.pink, [0, 2.02, 0.78], 0.14),
    pair(ball(C.lilac, [0.2, 2.95, 0.22], [0.24, 1.1, 0.18], [-0.15, 0, -0.14]), ball(C.pink, [0.2, 2.95, 0.29], [0.13, 0.8, 0.08], [-0.15, 0, -0.14]),
      ball(C.lilac, [0.4, 1.05, 0.45], [0.36, 0.3, 0.7])), ball(C.white, [0, 1.45, -0.68], 0.42)),
  'button-brawler': toy('march', feet(C.ink), rbox(C.purple, [0, 1.0, 0], [1.15, 1.05, 0.95]), bigEyes(1.15, 0.45, 0.25, 0.3),
    cyl(C.coral, [0, 1.74, 0], [1.75, 0.3, 1.75]), flatTorus(C.coral, [0, 1.86, 0], 1.7),
    pair(cyl(C.ink, [0.22, 1.9, 0.22], [0.22, 0.06, 0.22]), cyl(C.ink, [0.22, 1.9, -0.22], [0.22, 0.06, 0.22]), ball(C.honey, [0.95, 1.0, 0.4], 0.62)),
    box(C.cream, [0, 1.92, 0], [0.62, 0.05, 0.08], [0, PI / 4, 0]), box(C.cream, [0, 1.92, 0], [0.62, 0.05, 0.08], [0, -PI / 4, 0])),
  'peg-pikeman': toy('march', pair(box(C.woodL, [0.22, 0.8, 0], [0.34, 1.35, 0.52])), rbox(C.woodL, [0, 1.8, 0], [0.82, 0.9, 0.56]),
    flatTorus(C.tin, [0, 1.38, 0], [1.05, 0.85, 1.0]), ball(C.woodL, [0, 2.52, 0], 0.72), eyes(2.55, 0.33, 0.17, 0.14), dome(C.tin, [0, 2.62, 0], [0.84, 0.46, 0.84]),
    cone(C.coral, [0, 3.2, 0], [0.2, 0.36, 0.2]), rod(C.woodD, [0.62, 0.5, -0.45], [0.62, 2.9, 0.95], 0.11), rod(C.silver, [0.62, 2.9, 0.95], [0.62, 3.35, 1.2], 0.22, 'cone')),
  'marble-slinger': toy('march', biped({ body: C.sage, w: 0.82, h: 0.9, headR: 0.48 }), dome(C.feltD, [0, 1.8, -0.06], [1.02, 0.5, 1.02]),
    rod(C.woodD, [0.62, 1.0, 0.45], [0.62, 1.55, 0.45], 0.12), rod(C.woodD, [0.62, 1.55, 0.45], [0.38, 2.05, 0.5], 0.1), rod(C.woodD, [0.62, 1.55, 0.45], [0.86, 2.05, 0.5], 0.1),
    rod(C.coral, [0.38, 2.05, 0.5], [0.86, 2.05, 0.5], 0.06), frust(C.card, [0, 0.95, -0.62], [0.95, 0.7, 0.75]),
    ball(C.glass, [-0.22, 1.42, -0.62], 0.46), ball(C.coral, [0.22, 1.4, -0.56], 0.4), ball(C.honey, [0.02, 1.68, -0.74], 0.38), ball(C.white, [-0.3, 1.56, -0.72], 0.12),
    ball(C.glass, [-0.62, 1.0, 0.42], 0.34)),
  'felt-fox': toy('prowl', ball(C.orange, [0, 0.98, -0.1], [0.92, 0.82, 1.5]), legs(C.woodD, 0.3, 0.42, -0.55, 0.62), ball(C.cream, [0, 0.85, 0.42], [0.6, 0.6, 0.5]),
    ball(C.orange, [0, 1.56, 0.72], [0.9, 0.78, 0.8]), cone(C.cream, [0, 1.44, 1.2], [0.42, 0.52, 0.4], [H, 0, 0]), ball(C.ink, [0, 1.46, 1.45], 0.15), eyes(1.68, 1.02, 0.22, 0.14),
    pair(prism(C.orange, [0.3, 2.1, 0.68], [0.36, 0.55, 0.14]), prism(C.ink, [0.3, 2.25, 0.7], [0.18, 0.25, 0.15])),
    ball(C.orange, [0, 1.3, -1.02], [0.56, 0.56, 0.95], [-0.7, 0, 0]), ball(C.cream, [0, 1.68, -1.32], 0.42)),
  'thimble-guard': toy('stomp', feet(C.steel, 0.4, 0.7, 0.5), frust(C.silver, [0, 1.52, 0], [1.65, 1.95, 1.65]), dome(C.silver, [0, 2.48, 0], [1.08, 0.42, 1.08]),
    flatTorus(C.silver, [0, 0.66, 0], [1.8, 1.8, 1.2]), box(C.ink, [0, 1.3, 0.66], [0.85, 0.34, 0.3]), eyes(1.3, 0.8, 0.2, 0.16, C.honey),
    ring(6, a => ball(C.grey, [Math.cos(a) * 0.36, 2.72, Math.sin(a) * 0.36], 0.16)), ball(C.grey, [0, 2.86, 0], 0.16),
    ring(7, a => ball(C.grey, [Math.cos(a) * 0.62, 2.05, Math.sin(a) * 0.62], 0.16), 0.2),
    cyl(C.blue, [-0.98, 1.1, 0.42], [0.95, 0.12, 0.95], [H, 0, 0]), ball(C.honey, [-0.98, 1.1, 0.52], 0.26), rod(C.silver, [0.98, 0.5, 0.3], [0.98, 2.3, 0.5], 0.07)),
  'spool-spinner': toy('twirl', cyl(C.woodL, [0, 0.42, 0], [1.65, 0.22, 1.65]), cyl(C.coral, [0, 1.05, 0], [1.2, 1.05, 1.2]), cyl(C.woodL, [0, 1.68, 0], [1.65, 0.22, 1.65]),
    flatHoop(C.wine, [0, 0.8, 0], 1.3), flatHoop(C.wine, [0, 1.05, 0], 1.3), flatHoop(C.wine, [0, 1.3, 0], 1.3),
    ball(C.cream, [0, 2.2, 0], 0.78), eyes(2.24, 0.36, 0.18, 0.15), rod(C.silver, [-0.5, 2.75, -0.3], [0.5, 1.9, 0.3], 0.07),
    pair(rod(C.coral, [0.6, 1.05, 0], [1.3, 1.05, 0.25], 0.09), ball(C.coral, [1.32, 1.05, 0.28], 0.2)), key(1.1, -0.6, 1.1)),
  'paper-medic': toy('march', cone(C.white, [0, 1.12, 0], [1.4, 1.6, 1.4]), ball(C.cream, [0, 2.08, 0], 0.82), eyes(2.12, 0.38),
    box(C.white, [0, 2.56, 0], [0.86, 0.3, 0.66]), box(C.coral, [0, 2.73, 0], [0.56, 0.06, 0.18]), box(C.coral, [0, 2.73, 0], [0.18, 0.06, 0.56]),
    pair(fin(C.white, [0.42, 1.55, -0.1], [0.7, 0.7, 0.05], 1.1)), rbox(C.coral, [0.78, 0.85, 0.3], [0.52, 0.46, 0.36]),
    box(C.white, [0.78, 0.85, 0.49], [0.3, 0.1, 0.04]), box(C.white, [0.78, 0.85, 0.49], [0.1, 0.3, 0.04]),
    box(C.coral, [0, 1.2, -0.44], [0.4, 0.12, 0.05], [0.4, 0, 0]), box(C.coral, [0, 1.2, -0.44], [0.12, 0.4, 0.05], [0.4, 0, 0])),
  'crayon-cannon': toy('jitter', pair(cyl(C.woodD, [0.82, 0.57, -0.15], [0.9, 0.24, 0.9], [0, 0, H]), ball(C.honey, [0.96, 0.57, -0.15], 0.26)),
    rbox(C.woodM, [0, 0.62, -0.2], [1.2, 0.42, 1.5]), eyes(0.68, 0.56, 0.22, 0.15),
    rod(C.coral, [0, 0.95, -0.55], [0, 1.85, 0.95], 0.8), rod(C.cream, [0, 1.12, -0.25], [0, 1.6, 0.52], 0.86),
    rod(C.coral, [0, 1.85, 0.95], [0, 2.12, 1.4], 0.8, 'cone'), rod(C.honey, [-0.6, 0.98, -0.85], [-0.6, 0.98, 0.25], 0.26), rod(C.honey, [-0.6, 0.98, 0.25], [-0.6, 0.98, 0.5], 0.26, 'cone'),
    rod(C.blue, [0.6, 0.98, -0.85], [0.6, 0.98, 0.25], 0.26), rod(C.blue, [0.6, 0.98, 0.25], [0.6, 0.98, 0.5], 0.26, 'cone'), rod(C.sage, [0, 0.95, -1.15], [0, 0.95, -0.7], 0.26)),
  'rubber-frog': toy('hop', ball(C.lime, [0, 0.78, 0], [1.9, 1.15, 1.7]), ball(C.cream, [0, 0.6, 0.38], [1.4, 0.8, 1.2]),
    pair(ball(C.lime, [0.5, 1.4, 0.45], 0.62), ball(C.white, [0.5, 1.48, 0.6], 0.44), ball(C.ink, [0.5, 1.52, 0.77], 0.22),
      ball(C.leaf, [0.95, 0.5, -0.5], [0.62, 0.62, 1.0]), ball(C.leaf, [0.72, 0.3, 0.82], [0.42, 0.26, 0.5])),
    ball(C.honey, [0.3, 1.28, -0.3], 0.3), ball(C.honey, [-0.38, 1.22, -0.48], 0.26), ball(C.honey, [0, 1.1, -0.78], 0.22), box(C.coral, [0, 0.82, 0.86], [0.6, 0.07, 0.1])),
  'domino-drummer': toy('march', feet(C.coral, 0.34, 0.7), rbox(C.ink, [0, 1.48, -0.12], [1.3, 2.0, 0.46]), box(C.cream, [0, 1.48, -0.12], [1.12, 0.07, 0.5]),
    ...[[-0.32, 2.2], [0, 1.95], [0.32, 1.7], [-0.3, 1.2], [0.3, 0.8]].map(([x, y]) => cyl(C.white, [x, y, -0.12], [0.24, 0.52, 0.24], [H, 0, 0])),
    cyl(C.coral, [0, 0.72, 0.68], [1.0, 0.62, 1.0]), cyl(C.cream, [0, 1.05, 0.68], [0.92, 0.06, 0.92]), flatHoop(C.honey, [0, 1.02, 0.68], 1.08), flatHoop(C.honey, [0, 0.46, 0.68], 1.08),
    pair(rod(C.woodL, [0.55, 1.7, 0.2], [0.3, 1.25, 0.8], 0.08), ball(C.woodL, [0.3, 1.25, 0.8], 0.18))),
  'clockwork-mouse': toy('prowl', ball(C.tin, [0, 0.68, -0.05], [1.05, 0.95, 1.6]), cone(C.tin, [0, 0.62, 0.92], [0.62, 0.62, 0.6], [H, 0, 0]), ball(C.pink, [0, 0.62, 1.24], 0.18),
    eyes(0.86, 0.74, 0.2, 0.14), pair(cyl(C.tin, [0.44, 1.22, 0.3], [0.66, 0.08, 0.66], [H - 0.25, 0, 0]), cyl(C.pink, [0.44, 1.22, 0.35], [0.42, 0.06, 0.42], [H - 0.25, 0, 0]),
      cyl(C.steel, [0.52, 0.3, -0.25], [0.42, 0.14, 0.42], [0, 0, H])),
    rod(C.pink, [0, 0.5, -0.8], [0.25, 0.3, -1.3], 0.08), rod(C.pink, [0.25, 0.3, -1.3], [-0.1, 0.25, -1.65], 0.07),
    cyl(C.brass, [0, 1.35, -0.3], [0.12, 0.55, 0.12]), pair(torus(C.brass, [0.22, 1.75, -0.3], 0.46))),
  'cork-knight': toy('march', feet(C.woodD), cyl(C.cork, [0, 1.12, 0], [1.15, 1.4, 1.15]), ball(C.cork, [0, 2.02, 0], [1.4, 0.85, 1.4]), eyes(1.45, 0.55, 0.22),
    cyl(C.honey, [0, 2.44, 0], [0.75, 0.1, 0.75]), flatHoop(C.steel, [0, 1.74, 0], 1.3), pair(rod(C.steel, [0.3, 2.44, 0], [0.62, 1.74, 0], 0.05), rod(C.steel, [0, 2.44, 0.3], [0, 1.74, 0.62], 0.05)),
    rod(C.steel, [0, 2.44, -0.3], [0, 1.74, -0.62], 0.05), ball(C.woodM, [0.3, 1.0, 0.5], 0.14), ball(C.woodM, [-0.35, 0.8, 0.45], 0.12), ball(C.woodM, [0.1, 0.7, -0.55], 0.14),
    rod(C.woodL, [0.86, 0.8, 0.3], [0.86, 2.3, 0.75], 0.08), cyl(C.coral, [0.86, 1.05, 0.38], [0.3, 0.08, 0.3], [0.3, 0, 0]),
    cyl(C.card, [-0.84, 1.1, 0.4], [0.9, 0.1, 0.9], [H, 0, 0]), box(C.coral, [-0.84, 1.1, 0.46], [0.6, 0.14, 0.04]), box(C.coral, [-0.84, 1.1, 0.46], [0.14, 0.6, 0.04])),
  'ribbon-rookie': toy('twirl', biped({ body: C.pink, shape: 'frust', w: 1.0, h: 1.0, headR: 0.5 }),
    pair(cone(C.coral, [0.46, 2.52, -0.1], [0.62, 0.72, 0.36], [0, 0, H]), box(C.coral, [0.16, 1.95, -0.52], [0.18, 0.9, 0.06], [0.3, 0, 0.2])), ball(C.coral, [0, 2.52, -0.1], 0.32),
    rod(C.woodL, [0.66, 1.1, 0.3], [0.8, 2.0, 0.5], 0.07), hoop(C.honey, [0.95, 2.3, 0.55], 0.75, [0, 0.5, 0]), hoop(C.honey, [0.7, 2.75, 0.45], 0.55, [0, -0.4, 0]),
    flatTorus(C.coral, [0, 1.0, 0], [1.05, 0.98, 0.7])),

  // ───────────── Uncommon ─────────────
  'cap-captain': toy('march', biped({ body: C.navy, w: 1.05, h: 1.2 }), flat('crimp')(C.silver, [0, 2.62, 0], [1.7, 1.7, 0.32]), cyl(C.coral, [0, 2.76, 0], [1.2, 0.14, 1.2]),
    flatStar(C.honey, [0, 2.86, 0], [0.7, 0.7, 0.06]), pair(ball(C.honey, [0.64, 1.6, 0], [0.42, 0.2, 0.52]), ball(C.honey, [0.18, 1.2 , 0.5], 0.13), ball(C.honey, [0.18, 0.85, 0.5], 0.13)),
    box(C.coral, [0, 1.15, -0.48], [0.2, 1.1, 0.06], [0, 0, -0.6]), rod(C.silver, [0.82, 1.0, 0.3], [0.82, 1.5, 1.5], 0.09), ball(C.honey, [0.82, 1.0, 0.3], 0.26)),
  'yo-yo-yak': toy('stomp', frust(C.woodD, [0, 0.72, -0.15], [1.85, 0.9, 2.05]), ball(C.woodM, [0, 1.12, -0.15], [1.6, 1.4, 1.9]), ball(C.woodM, [0, 1.75, -0.35], [1.0, 0.7, 1.0]),
    ball(C.woodD, [0, 1.28, 0.9], [0.92, 0.88, 0.72]), ball(C.cream, [0, 1.08, 1.2], [0.56, 0.42, 0.36]), eyes(1.42, 1.2, 0.24, 0.14), ball(C.honey, [0, 1.75, 0.95], [0.5, 0.36, 0.4]),
    pair(rod(C.cream, [0.4, 1.6, 0.9], [0.95, 1.75, 0.95], 0.26), rod(C.cream, [0.95, 1.75, 0.95], [1.12, 2.3, 0.95], 0.24, 'cone'), cyl(C.blue, [0.13, 0.5, 1.5], [0.62, 0.14, 0.62], [0, 0, H]),
      ball(C.honey, [0.22, 0.5, 1.5], 0.2)), rod(C.white, [0, 0.9, 1.38], [0, 0.5, 1.5], 0.05), ball(C.woodD, [0, 1.0, -1.15], [0.3, 0.7, 0.3])),
  'kite-archer': toy('march', biped({ body: C.sage, w: 0.8, h: 1.15, headR: 0.48 }), cone(C.feltD, [0, 2.72, 0], [0.86, 0.62, 0.86]), rod(C.coral, [0.2, 2.6, -0.1], [0.5, 3.15, -0.4], 0.12, 'cone'),
    box(C.coral, [0, 2.0, -0.78], [1.45, 1.45, 0.06], [0, 0, PI / 4]), box(C.honey, [0, 2.0, -0.82], [0.72, 0.72, 0.06], [0, 0, PI / 4]),
    box(C.woodD, [0, 2.0, -0.74], [0.06, 2.05, 0.04]), box(C.woodD, [0, 2.0, -0.74], [2.05, 0.06, 0.04]),
    rod(C.white, [0, 0.98, -0.78], [0.15, 0.3, -1.1], 0.04), ball(C.blue, [0.05, 0.75, -0.88], 0.2), ball(C.honey, [0.12, 0.45, -1.02], 0.18),
    arc(C.woodD, [-0.72, 1.4, 0.42], [1.3, 0.8, 0.6], [0, H, H]), rod(C.white, [-0.72, 0.76, 0.42], [-0.72, 2.04, 0.42], 0.03),
    rod(C.woodL, [-0.72, 1.4, 0.3], [-0.72, 1.4, 1.1], 0.05), rod(C.silver, [-0.72, 1.4, 1.1], [-0.72, 1.4, 1.32], 0.14, 'cone')),
  'bead-bomber': toy('wobble', ball(C.coral, [0, 0.78, 0], 1.35), ball(C.honey, [0, 1.65, 0], 1.08), ball(C.blue, [0, 2.36, 0], 0.84), eyes(2.42, 0.36, 0.18),
    flatTorus(C.white, [0, 1.25, 0], [0.6, 0.6, 0.5]), flatTorus(C.white, [0, 2.02, 0], [0.5, 0.5, 0.4]), rod(C.ink, [0, 2.75, 0], [0.12, 3.05, -0.1], 0.08), star(C.honey, [0.14, 3.15, -0.1], [0.4, 0.4, 0.1]),
    pair(ball(C.sage, [0.72, 1.62, 0.2], 0.32), ball(C.pink, [0.98, 1.36, 0.36], 0.3), ball(C.lilac, [1.14, 1.06, 0.52], 0.34)),
    ball(C.white, [-0.25, 1.05, 0.5], 0.16), ball(C.white, [-0.2, 1.9, 0.42], 0.14)),
  'stitch-serpent': toy('slither', flatTorus(C.felt, [0, 0.4, 0], 2.1), flatTorus(C.feltD, [0, 0.82, 0], 1.6), flatTorus(C.felt, [0, 1.2, 0], 1.1),
    rod(C.felt, [0, 1.2, 0.1], [0, 2.1, 0.4], 0.44), ball(C.felt, [0, 2.3, 0.52], [0.72, 0.56, 0.95]), eyes(2.44, 0.82, 0.22, 0.17, C.honey),
    box(C.coral, [0, 2.2, 1.1], [0.08, 0.04, 0.36]), pair(box(C.coral, [0.08, 2.2, 1.32], [0.06, 0.04, 0.2], [0, 0.5, 0])),
    ring(7, a => box(C.cream, [Math.cos(a) * 0.8, 0.66, Math.sin(a) * 0.8], [0.34, 0.05, 0.08], [0, -a, 0]), 0.3),
    ring(5, a => box(C.cream, [Math.cos(a) * 0.61, 1.03, Math.sin(a) * 0.61], [0.3, 0.05, 0.08], [0, -a, 0]), 0.9),
    cyl(C.honey, [0.92, 0.5, -0.62], [0.42, 0.12, 0.42], [0.5, 0, 0.5]), rbox(C.coral, [-0.72, 0.68, 0.38], [0.36, 0.08, 0.36], [0, 0.5, 0])),
  'pencil-lancer': toy('march', biped({ body: C.blue, shape: 'rbox', w: 0.95, h: 1.1 }), dome(C.steel, [0, 2.12, 0], [1.14, 0.58, 1.14]), box(C.pink, [0, 2.72, -0.05], [0.14, 0.3, 0.8]),
    rod(C.honey, [0.72, 1.78, -1.05], [0.72, 1.78, 1.15], 0.36, 'hex'), rod(C.woodL, [0.72, 1.78, 1.15], [0.72, 1.78, 1.6], 0.36, 'cone'), rod(C.ink, [0.72, 1.78, 1.5], [0.72, 1.78, 1.68], 0.13, 'cone'),
    rod(C.brass, [0.72, 1.78, -1.28], [0.72, 1.78, -1.05], 0.39), rod(C.pink, [0.72, 1.78, -1.5], [0.72, 1.78, -1.28], 0.36),
    box(C.cream, [-0.72, 1.1, 0.42], [0.72, 0.9, 0.08]), box(C.blue, [-0.72, 1.3, 0.47], [0.6, 0.05, 0.03]), box(C.blue, [-0.72, 1.1, 0.47], [0.6, 0.05, 0.03]), box(C.blue, [-0.72, 0.9, 0.47], [0.6, 0.05, 0.03]),
    box(C.coral, [-0.96, 1.1, 0.47], [0.04, 0.84, 0.03])),
  'spring-ram': toy('hop', pair(flatTorus(C.tin, [0.45, 0.28, 0.4], 0.48), flatTorus(C.tin, [0.45, 0.5, 0.4], 0.44), flatTorus(C.tin, [0.45, 0.28, -0.6], 0.48), flatTorus(C.tin, [0.45, 0.5, -0.6], 0.44)),
    ball(C.cream, [0, 1.25, -0.2], [1.5, 1.2, 1.7]), ball(C.white, [0.35, 1.75, -0.1], 0.6), ball(C.white, [-0.35, 1.72, -0.45], 0.62), ball(C.white, [0.1, 1.72, -0.8], 0.55), ball(C.white, [-0.2, 1.8, 0.2], 0.5),
    ball(C.woodD, [0, 1.38, 0.85], [0.72, 0.78, 0.72]), eyes(1.5, 1.16, 0.2, 0.15, C.honey),
    pair(torus(C.honey, [0.5, 1.52, 0.78], [0.8, 0.8, 0.85], [0, H, 0]), ball(C.honey, [0.5, 1.5, 0.82], 0.24)),
    cyl(C.brass, [0, 2.1, -0.45], [0.12, 0.5, 0.12]), pair(torus(C.brass, [0.22, 2.45, -0.45], 0.46))),
  'patchwork-nurse': toy('wobble', frust(C.card, [0, 0.92, 0], [1.75, 1.35, 1.75]), ring(6, (a, i) => rbox([C.coral, C.blue, C.honey, C.sage, C.pink, C.lilac][i],
      [Math.sin(a) * (i % 2 ? 0.7 : 0.78), i % 2 ? 1.05 : 0.6, Math.cos(a) * (i % 2 ? 0.7 : 0.78)], [0.5, 0.46, 0.14], [0, a, 0]), 0.3),
    cyl(C.white, [0, 1.76, 0], [0.82, 0.5, 0.82]), ball(C.cream, [0, 2.3, 0], 0.8), eyes(2.34, 0.37), pair(ball(C.woodD, [0.48, 2.32, -0.12], 0.36)),
    dome(C.blue, [0, 2.5, 0], [0.86, 0.42, 0.86]), box(C.white, [0, 2.94, 0], [0.46, 0.06, 0.15]), box(C.white, [0, 2.94, 0], [0.15, 0.06, 0.46]),
    rod(C.silver, [0.86, 0.9, 0.3], [0.86, 2.2, 0.45], 0.06), hoop(C.coral, [0.86, 2.3, 0.46], 0.26), ball(C.coral, [0, 1.75, -0.42], [0.34, 0.3, 0.14])),
  'cog-crab': toy('prowl', flatGear(C.brass, [0, 0.78, 0], [2.1, 2.1, 0.5]), dome(C.copper, [0, 0.95, 0], [1.3, 0.6, 1.3]), ball(C.steel, [0, 1.52, 0], 0.3),
    pair(rod(C.brass, [0.3, 1.0, 0.7], [0.32, 1.6, 0.82], 0.1), ball(C.white, [0.32, 1.66, 0.84], 0.3), ball(C.ink, [0.32, 1.68, 0.96], 0.14),
      ball(C.tin, [1.0, 0.8, 0.75], 0.46), ball(C.coral, [1.18, 0.86, 1.15], [0.72, 0.52, 0.8]), rod(C.coral, [1.02, 0.86, 1.3], [0.92, 0.86, 1.72], 0.26, 'cone'), rod(C.coral, [1.36, 0.86, 1.3], [1.42, 0.86, 1.72], 0.26, 'cone'),
      rod(C.steel, [0.8, 0.8, 0.2], [1.32, 0.14, 0.3], 0.13), rod(C.steel, [0.8, 0.8, -0.3], [1.3, 0.14, -0.5], 0.13), rod(C.steel, [0.6, 0.8, -0.7], [0.95, 0.14, -1.2], 0.13))),
  'paper-panther': toy('prowl', prism(C.purple, [0, 1.05, -0.1], [1.25, 1.1, 1.8]), box(C.cream, [0, 1.6, -0.1], [0.07, 0.06, 1.8]),
    pair(box(C.plum, [0.42, 0.42, 0.5], [0.3, 0.62, 0.34]), box(C.plum, [0.42, 0.42, -0.7], [0.3, 0.62, 0.34]), prism(C.purple, [0.32, 2.0, 0.72], [0.42, 0.6, 0.1]),
      prism(C.cream, [0.32, 1.96, 0.78], [0.2, 0.3, 0.06]), box(C.honey, [0.2, 1.52, 1.12], [0.2, 0.08, 0.06], [0, 0, 0.3]), box(C.cream, [0.33, 1.05, -0.1], [0.05, 1.1, 0.06], [0.5, 0, -0.52])),
    pyr(C.purple, [0, 1.4, 1.0], [1.05, 1.0, 1.0], [H, 0, 0]), box(C.cream, [0, 1.4, 1.02], [0.06, 0.06, 1.0]), ball(C.pink, [0, 1.4, 1.5], 0.14),
    rod(C.purple, [0, 1.3, -0.95], [0, 2.1, -1.5], 0.2, 'box'), prism(C.cream, [0, 2.25, -1.6], [0.14, 0.45, 0.34], [-0.6, 0, 0])),
  'windmill-imp': toy('hop', feet(C.ink, 0.32, 0.7), ball(C.coral, [0, 1.0, 0], [1.1, 1.2, 1.0]), ball(C.coral, [0, 1.92, 0.1], 0.88), bigEyes(2.0, 0.44, 0.22, 0.26),
    box(C.ink, [0, 1.74, 0.5], [0.36, 0.06, 0.06]), pair(rod(C.ink, [0.28, 2.25, 0.1], [0.42, 2.7, 0.1], 0.2, 'cone'), prism(C.coral, [0.56, 1.98, 0.05], [0.3, 0.36, 0.1], [0, 0, -1.2])),
    rod(C.woodD, [0, 0.6, -0.62], [0, 2.1, -0.78], 0.1), ball(C.honey, [0, 2.1, -0.9], 0.28),
    ring(4, (a, i) => prism([C.cream, C.blue, C.honey, C.sage][i], [Math.cos(a) * 0.52, 2.1 + Math.sin(a) * 0.52, -0.88], [0.5, 0.95, 0.06], [0, 0, a - H]), 0.35),
    rod(C.coral, [0, 0.7, -0.4], [0.5, 0.4, -0.75], 0.08)),
  'copper-bat': toy('float', cyl(C.steel, [0, 0.7, 0], [0.06, 1.2, 0.06]), ball(C.copper, [0, 1.75, 0], [0.92, 1.05, 0.82]), eyes(1.95, 0.36, 0.18, 0.16, C.honey),
    pair(rod(C.copper, [0.28, 2.15, 0], [0.4, 2.75, 0], 0.32, 'cone'), rod(C.white, [0.12, 1.55, 0.36], [0.12, 1.32, 0.38], 0.1, 'cone'),
      prism(C.plum, [0.98, 1.92, -0.1], [1.1, 1.05, 0.06], [0, 0, -H]), prism(C.plum, [0.92, 1.4, -0.1], [0.6, 0.8, 0.06], [0, 0, -H - 0.55]),
      rod(C.copper, [0.4, 2.35, -0.1], [1.5, 1.92, -0.1], 0.07)), ball(C.pink, [0, 1.72, 0.42], 0.12)),
  'domino-duellist': toy('march', feet(C.ink, 0.32, 0.7), rbox(C.white, [0, 1.42, 0], [1.2, 1.9, 0.46]), box(C.ink, [0, 1.42, 0], [1.04, 0.07, 0.5]),
    ...[[-0.3, 2.08], [0, 1.85], [0.3, 1.62], [-0.3, 1.2], [0, 0.97], [0.3, 0.74]].map(([x, y]) => cyl(C.ink, [x, y, 0], [0.22, 0.52, 0.22], [H, 0, 0])),
    cyl(C.plum, [0, 2.46, 0], [1.7, 0.1, 1.5], [0.1, 0, 0.12]), cyl(C.plum, [0, 2.64, 0], [0.8, 0.34, 0.75]), ball(C.coral, [-0.45, 2.85, -0.3], [0.26, 0.3, 1.05], [0.4, 0, 0]),
    rod(C.silver, [0.84, 1.3, 0.3], [0.84, 1.55, 1.85], 0.05), dome(C.honey, [0.84, 1.3, 0.3], [0.4, 0.3, 0.4], [H, 0, 0]),
    box(C.coral, [0, 2.3, 0.02], [1.24, 0.14, 0.5])),
  'magnet-mole': toy('prowl', ball(C.woodD, [0, 0.86, 0], [1.3, 1.1, 1.6]), cone(C.card, [0, 0.8, 0.9], [0.62, 0.62, 0.62], [H, 0, 0]), ball(C.pink, [0, 0.8, 1.24], 0.22),
    eyes(1.06, 0.66, 0.2, 0.1), pair(ball(C.pink, [0.66, 0.36, 0.72], [0.52, 0.26, 0.56]), rod(C.white, [0.56, 0.34, 0.9], [0.52, 0.3, 1.2], 0.12, 'cone'), rod(C.white, [0.76, 0.34, 0.9], [0.82, 0.3, 1.2], 0.12, 'cone'),
      ball(C.pink, [0.5, 0.3, -0.6], [0.36, 0.24, 0.5]), cyl(C.silver, [0.5, 1.3, -0.25], [0.34, 0.32, 0.34])),
    arc(C.coral, [0, 1.42, -0.25], [1.32, 1.32, 1.32]), rod(C.pink, [0, 0.7, -0.75], [0, 0.6, -1.1], 0.1)),

  // ───────────── Rare ─────────────
  'clockwork-bear': toy('stomp', ball(C.woodM, [0, 1.05, 0], [1.7, 1.6, 1.5]), ball(C.cream, [0, 1.0, 0.42], [1.1, 1.1, 0.9]), gear(C.brass, [0, 1.05, 0.84], [0.62, 0.62, 0.1]),
    ball(C.woodM, [0, 2.2, 0.1], [1.22, 1.06, 1.1]), ball(C.cream, [0, 2.05, 0.6], [0.56, 0.46, 0.4]), ball(C.ink, [0, 2.12, 0.8], 0.16), eyes(2.34, 0.54, 0.24, 0.15),
    pair(ball(C.woodM, [0.5, 2.75, 0.05], 0.46), ball(C.cream, [0.5, 2.76, 0.16], 0.26), ball(C.woodM, [0.9, 1.22, 0.3], [0.5, 0.9, 0.5]),
      ball(C.woodM, [0.55, 0.42, 0.7], [0.6, 0.52, 0.8]), ball(C.cream, [0.55, 0.42, 1.06], [0.36, 0.3, 0.12])), key(1.3, -0.7, 1.25)),
  'music-box-mage': toy('wobble', rbox(C.woodD, [0, 0.72, 0], [1.6, 0.9, 1.25]), box(C.honey, [0, 1.16, 0], [1.66, 0.07, 1.3]), cyl(C.brass, [0, 1.48, 0.25], [0.55, 1.3, 0.55], [0, 0, H]),
    ...[-0.4, -0.15, 0.1, 0.35].map((x, i) => ball(C.honey, [x, 1.7 - (i % 2) * 0.08, 0.42 + (i % 2) * 0.1], 0.13)), rod(C.steel, [0.8, 1.48, 0.25], [1.1, 1.48, 0.25], 0.09), rod(C.steel, [1.1, 1.48, 0.25], [1.1, 1.85, 0.25], 0.08),
    ball(C.coral, [1.1, 1.92, 0.25], 0.22), cone(C.violet, [0, 1.75, -0.38], [1.0, 1.1, 0.8]), ball(C.cream, [0, 2.3, -0.3], 0.66), eyes(2.32, 0.0, 0.16, 0.13),
    cyl(C.violet, [0, 2.56, -0.3], [1.2, 0.08, 1.2]), cone(C.violet, [0, 3.0, -0.3], [0.78, 0.9, 0.78]), star(C.honey, [0, 2.9, 0.08], [0.32, 0.32, 0.06], [-0.4, 0, 0]),
    ball(C.ink, [-0.85, 2.2, 0.3], [0.28, 0.22, 0.2]), rod(C.ink, [-0.75, 2.2, 0.3], [-0.75, 2.8, 0.3], 0.05), box(C.ink, [-0.63, 2.76, 0.3], [0.26, 0.1, 0.05])),
  'jackhammer-jack': toy('jitter', biped({ body: C.coral, shape: 'rbox', w: 1.1, h: 1.1, arms: null }), dome(C.honey, [0, 2.12, 0], [1.22, 0.62, 1.22]), cyl(C.honey, [0, 2.16, 0.12], [1.34, 0.08, 1.46]),
    box(C.honey, [0, 2.62, 0], [0.16, 0.24, 1.0]), pair(box(C.blue, [0.3, 1.25, 0.5], [0.16, 0.9, 0.06]), rod(C.cream, [0.6, 1.6, 0.1], [0.55, 1.9, 0.75], 0.26), ball(C.coral, [0.62, 1.92, 0.78], 0.22)),
    cyl(C.steel, [0, 1.3, 0.78], [0.42, 1.0, 0.42]), cyl(C.steel, [0, 1.92, 0.78], [0.1, 1.2, 0.1], [0, 0, H]), cyl(C.honey, [0, 0.95, 0.78], [0.48, 0.14, 0.48]),
    rod(C.silver, [0, 0.8, 0.78], [0, 0.14, 0.78], 0.26, 'cone')),
  'ribbon-ronin': toy('march', feet(C.ink, 0.3, 0.7), frust(C.plum, [0, 1.05, 0], [1.25, 1.3, 1.2]), ball(C.cream, [0, 1.98, 0], 0.76), eyes(1.96, 0.36, 0.18, 0.13),
    cone(C.card, [0, 2.46, 0], [2.1, 0.58, 2.1]), flatHoop(C.woodD, [0, 2.36, 0], 1.5), ball(C.woodD, [0, 2.76, 0], 0.16), flatTorus(C.coral, [0, 1.66, 0], [0.92, 0.9, 0.9]),
    rod(C.coral, [0.15, 1.62, -0.4], [0.5, 1.3, -1.35], 0.2, 'box'), rod(C.honey, [-0.15, 1.62, -0.4], [-0.35, 1.0, -1.25], 0.16, 'box'),
    rod(C.silver, [0.82, 1.0, -0.4], [0.82, 1.45, 1.35], 0.09, 'box'), rod(C.ink, [0.82, 0.9, -0.8], [0.82, 1.0, -0.4], 0.12), cyl(C.honey, [0.82, 1.0, -0.4], [0.3, 0.06, 0.3], [H + 0.25, 0, 0]),
    box(C.coral, [0, 1.0, 0.56], [0.9, 0.2, 0.08])),
  'paint-pot-pyro': toy('wobble', feet(C.ink, 0.4, 0.7), frust(C.silver, [0, 1.05, 0], [1.6, 1.3, 1.6], [PI, 0, 0]), flatTorus(C.silver, [0, 1.68, 0], [1.72, 1.72, 1.0]),
    cyl(C.coral, [0, 1.66, 0], [1.46, 0.1, 1.46]), cone(C.coral, [0, 2.3, 0], [0.75, 1.3, 0.75]), cone(C.orange, [0.36, 2.1, 0.2], [0.48, 0.9, 0.48], [0, 0, -0.3]),
    cone(C.honey, [-0.36, 2.02, -0.1], [0.42, 0.75, 0.42], [0, 0, 0.3]), cone(C.honey, [0, 2.15, 0.2], [0.3, 0.7, 0.3]), cone(C.orange, [-0.1, 2.05, -0.4], [0.4, 0.7, 0.4]),
    ball(C.coral, [0.55, 1.35, 0.6], [0.26, 0.6, 0.2]), ball(C.orange, [-0.7, 1.3, 0.3], [0.2, 0.7, 0.24]), ball(C.coral, [-0.2, 1.4, -0.75], [0.26, 0.5, 0.2]),
    box(C.cream, [0, 1.0, 0.62], [0.8, 0.46, 0.06]), eyes(1.02, 0.66, 0.2, 0.16),
    rod(C.woodL, [0.98, 0.7, 0.2], [1.02, 2.0, 0.6], 0.1), rod(C.coral, [1.02, 2.0, 0.6], [1.04, 2.5, 0.75], 0.3, 'cone')),
  'porcelain-panda': toy('wobble', ball(C.white, [0, 1.0, 0], [1.6, 1.5, 1.4]), ball(C.white, [0, 2.1, 0.1], [1.26, 1.06, 1.1]), ball(C.ink, [0, 2.0, 0.64], 0.16),
    pair(ball(C.ink, [0.5, 2.66, 0.05], 0.46), ball(C.ink, [0.27, 2.18, 0.54], [0.32, 0.42, 0.22], [0, 0, 0.4]), ball(C.white, [0.26, 2.2, 0.64], 0.12),
      ball(C.ink, [0.86, 1.22, 0.3], [0.5, 0.86, 0.5]), ball(C.ink, [0.5, 0.42, 0.66], [0.6, 0.52, 0.76])),
    ring(5, a => ball(C.blue, [Math.cos(a) * 0.26, 1.25 + Math.sin(a) * 0.26, -0.66], [0.24, 0.24, 0.12])), ball(C.honey, [0, 1.25, -0.7], 0.16),
    ball(C.blue, [0.55, 1.7, -0.45], [0.2, 0.2, 0.12]), ball(C.blue, [-0.55, 0.8, -0.5], [0.2, 0.2, 0.12]),
    frust(C.blue, [0, 1.15, 0.86], [0.56, 0.4, 0.56], [PI, 0, 0]), cyl(C.cream, [0, 1.36, 0.86], [0.46, 0.04, 0.46]),
    rod(C.honey, [0.1, 2.62, 0.2], [0.3, 2.45, 0.45], 0.05), rod(C.honey, [0.3, 2.45, 0.45], [0.2, 2.3, 0.56], 0.05)),
  'tin-toxin': toy('wobble', feet(C.steel, 0.4, 0.7), cyl(C.silver, [0, 1.08, 0], [1.4, 1.5, 1.4]), cyl(C.lime, [0, 1.08, 0], [1.44, 0.62, 1.44]),
    flatHoop(C.steel, [0, 0.52, 0], 1.5), flatHoop(C.steel, [0, 1.62, 0], 1.5), prism(C.ink, [0, 1.08, 0.72], [0.48, 0.42, 0.06]), ball(C.honey, [0, 1.02, 0.76], 0.12),
    cyl(C.silver, [-0.35, 2.2, -0.45], [1.3, 0.08, 1.3], [0.7, 0, 0.3]), ball(C.lime, [0, 1.84, 0.05], [1.25, 0.56, 1.25]),
    ball(C.lime, [0.32, 2.14, 0.2], 0.42), ball(C.sage, [-0.22, 2.22, 0.3], 0.32), ball(C.lime, [0.12, 2.5, 0.02], 0.24), ball(C.sage, [0.5, 2.6, -0.2], 0.16),
    ball(C.lime, [0.58, 1.5, 0.52], [0.26, 0.62, 0.2]), ball(C.lime, [-0.66, 1.42, 0.2], [0.2, 0.7, 0.26]), bigEyes(1.98, 0.5, 0.24, 0.26),
    pair(rod(C.steel, [0.7, 1.1, 0.2], [1.05, 1.1, 0.55], 0.2), flatTorus(C.steel, [1.08, 1.1, 0.58], 0.3))),
  'quill-quarreller': toy('march', hex(C.navy, [0, 0.92, 0], [1.35, 1.2, 1.35]), frust(C.navy, [0, 1.7, 0], [1.2, 0.4, 1.2]), cyl(C.navy, [0, 1.98, 0], [0.62, 0.24, 0.62]),
    cyl(C.cork, [0, 2.36, 0], [0.74, 0.62, 0.74]), eyes(2.4, 0.36, 0.17, 0.14), box(C.cream, [0, 0.92, 0.6], [0.7, 0.6, 0.06]), box(C.ink, [0, 1.0, 0.64], [0.44, 0.06, 0.03]), box(C.ink, [0, 0.84, 0.64], [0.3, 0.06, 0.03]),
    rod(C.cream, [0.3, 2.6, 0.0], [0.9, 3.3, -0.7], 0.06), ball(C.white, [0.66, 3.02, -0.42], [0.1, 1.05, 0.5], [-0.6, 0.7, -0.5]),
    box(C.woodD, [0, 1.45, 0.82], [1.5, 0.1, 0.12]), box(C.woodD, [0, 1.45, 0.55], [0.16, 0.16, 0.9]), rod(C.white, [0.75, 1.45, 0.82], [0, 1.45, 0.3], 0.03), rod(C.white, [-0.75, 1.45, 0.82], [0, 1.45, 0.3], 0.03),
    rod(C.ink, [0, 1.56, 0.5], [0, 1.56, 1.3], 0.1, 'cone'), pair(ball(C.white, [0.72, 1.6, 0.82], [0.1, 0.4, 0.2]))),
  'velvet-vampire': toy('float', feet(C.ink, 0.28, 0.7), frust(C.wine, [0, 1.08, 0.05], [1.1, 1.3, 1.0]), frust(C.plum, [0, 1.12, -0.3], [1.7, 1.55, 1.45]),
    frust(C.plum, [0, 2.02, -0.2], [1.55, 0.75, 1.2], [PI, 0, 0]), frust(C.coral, [0, 2.06, -0.12], [1.3, 0.66, 0.95], [PI, 0, 0]),
    ball(C.sky, [0, 2.28, 0.12], 0.76), dome(C.ink, [0, 2.36, 0.04], [0.82, 0.42, 0.82]), prism(C.ink, [0, 2.4, 0.4], [0.3, 0.3, 0.14], [PI, 0, 0]), eyes(2.26, 0.47, 0.18, 0.13, C.coral),
    pair(rod(C.white, [0.1, 2.08, 0.44], [0.1, 1.92, 0.46], 0.08, 'cone'), box(C.coral, [0.5, 1.1, 0.34], [0.12, 1.3, 0.3], [0, 0, 0.12])),
    pair(cone(C.coral, [0.16, 1.66, 0.5], [0.24, 0.3, 0.12], [0, 0, H])), ball(C.honey, [0, 1.66, 0.52], 0.14)),
  'ratchet-rhino': toy('stomp', rbox(C.tin, [0, 1.02, -0.15], [1.5, 1.2, 1.9]), rbox(C.tin, [0, 1.0, 0.98], [1.02, 0.86, 0.8]), rod(C.brass, [0, 1.3, 1.2], [0, 2.1, 1.6], 0.38, 'cone'),
    rod(C.brass, [0, 1.4, 0.95], [0, 1.8, 1.05], 0.24, 'cone'), eyes(1.2, 1.36, 0.36, 0.14), pair(prism(C.tin, [0.4, 1.55, 0.7], [0.24, 0.3, 0.1]), cyl(C.steel, [0.5, 0.34, 0.6], [0.44, 0.5, 0.44]), cyl(C.steel, [0.5, 0.34, -0.7], [0.44, 0.5, 0.44]),
      gear(C.brass, [0.8, 1.2, -0.3], [1.05, 1.05, 0.14], [0, H, 0]), ball(C.honey, [0.9, 1.2, -0.3], 0.22), ball(C.honey, [0.55, 1.66, 0.5], 0.14), ball(C.honey, [0.55, 1.66, -0.9], 0.14)),
    rbox(C.steel, [0, 1.66, -0.2], [1.2, 0.16, 1.4]), rod(C.steel, [0, 1.3, -1.1], [0, 1.9, -1.45], 0.1), hex(C.steel, [0, 1.98, -1.5], [0.34, 0.14, 0.34], [H - 0.5, 0, 0])),
  'glass-griffin': toy('float', gem(C.blue, [0, 1.15, -0.2], [1.15, 1.15, 1.75]), gem(C.glass, [0, 1.25, 0.35], [0.9, 1.1, 0.9]), gem(C.blue, [0, 2.02, 0.62], [0.72, 0.85, 0.85]),
    pyr(C.honey, [0, 1.92, 1.08], [0.3, 0.46, 0.3], [H + 0.3, 0, 0]), eyes(2.12, 0.92, 0.2, 0.12),
    pair(fin(C.sky, [0.55, 2.05, -0.35], [1.0, 1.7, 0.1], 0.75), fin(C.lilac, [0.72, 1.7, -0.7], [0.7, 1.2, 0.1], 1.05), rod(C.honey, [0.3, 0.75, 0.4], [0.3, 0.14, 0.5], 0.22, 'cone'),
      rod(C.glass, [0.36, 0.8, -0.6], [0.36, 0.14, -0.6], 0.24), pyr(C.glass, [0.2, 2.52, 0.5], [0.16, 0.36, 0.16])),
    gem(C.lilac, [0, 1.25, -1.25], [0.3, 0.3, 0.75])),
  'chess-chevalier': toy('march', cyl(C.woodD, [0, 0.28, 0], [1.65, 0.3, 1.65]), frust(C.woodL, [0, 0.74, 0], [1.35, 0.62, 1.35]), flatTorus(C.woodL, [0, 1.1, 0], 1.1),
    rbox(C.woodL, [0, 1.65, -0.05], [0.72, 1.15, 0.9], [0.2, 0, 0]), rbox(C.woodL, [0, 2.32, 0.34], [0.6, 0.6, 1.2], [0.5, 0, 0]), eyes(2.5, 0.42, 0.31, 0.14),
    pair(prism(C.woodL, [0.2, 2.86, -0.02], [0.2, 0.36, 0.1])), box(C.woodD, [0, 2.1, -0.5], [0.18, 1.45, 0.26], [0.2, 0, 0]), box(C.woodD, [0, 2.86, -0.2], [0.16, 0.3, 0.4]),
    rod(C.cream, [0.8, 0.5, -0.5], [0.8, 2.9, 1.1], 0.1), rod(C.silver, [0.8, 2.9, 1.1], [0.8, 3.2, 1.3], 0.2, 'cone'), prism(C.coral, [0.82, 2.55, 0.62], [0.06, 0.5, 0.4], [H + 0.59, 0, 0]),
    box(C.ink, [-0.76, 1.3, 0.42], [0.72, 0.82, 0.08]), box(C.cream, [-0.94, 1.5, 0.45], [0.36, 0.41, 0.06]), box(C.cream, [-0.58, 1.1, 0.45], [0.36, 0.41, 0.06])),
  'lantern-lynx': toy('prowl', ball(C.sand, [0, 0.92, -0.1], [0.98, 0.88, 1.5]), legs(C.sand, 0.3, 0.42, -0.55, 0.62, 0.28), ball(C.sand, [0, 1.56, 0.7], [0.88, 0.78, 0.78]),
    ball(C.cream, [0, 1.42, 1.02], [0.4, 0.3, 0.26]), ball(C.ink, [0, 1.5, 1.12], 0.12), eyes(1.68, 1.0, 0.2, 0.14, C.honey),
    pair(rod(C.cream, [0.4, 1.45, 0.75], [0.72, 1.15, 0.7], 0.3, 'cone'), prism(C.sand, [0.28, 2.08, 0.62], [0.32, 0.52, 0.12]), rod(C.ink, [0.28, 2.3, 0.62], [0.3, 2.62, 0.62], 0.1, 'cone')),
    ball(C.woodD, [0.25, 1.32, -0.2], 0.2), ball(C.woodD, [-0.28, 1.28, -0.5], 0.18), ball(C.woodD, [0.1, 1.24, -0.75], 0.16), ball(C.woodD, [-0.15, 1.34, 0.1], 0.16),
    rod(C.sand, [0, 1.0, -0.8], [0, 2.9, -1.05], 0.16), rod(C.ink, [0, 2.9, -1.05], [0, 2.9, -0.55], 0.08),
    cyl(C.ink, [0, 2.72, -0.55], [0.5, 0.1, 0.5]), box(C.honey, [0, 2.42, -0.55], [0.38, 0.5, 0.38]), cyl(C.ink, [0, 2.12, -0.55], [0.5, 0.1, 0.5])),

  // ───────────── Epic ─────────────
  'brass-behemoth': toy('stomp', pair(rbox(C.steel, [0.5, 0.48, 0], [0.72, 0.72, 0.95]), ball(C.brass, [1.12, 2.1, 0], 0.82), rbox(C.brass, [1.2, 1.25, 0.2], [0.56, 1.2, 0.7]), rbox(C.steel, [1.2, 0.6, 0.36], [0.66, 0.6, 0.8]),
      cyl(C.steel, [0.58, 2.75, -0.5], [0.36, 0.9, 0.36]), flatTorus(C.copper, [0.58, 3.18, -0.5], 0.48), ball(C.honey, [0.8, 2.36, 0.72], 0.14), ball(C.honey, [0.4, 2.36, 0.72], 0.14)),
    rbox(C.brass, [0, 1.58, 0], [2.0, 1.6, 1.5]), cyl(C.copper, [0, 1.5, 0.76], [0.95, 0.08, 0.95], [H, 0, 0]), ball(C.honey, [0, 1.5, 0.8], [0.6, 0.6, 0.14]),
    box(C.ink, [0, 1.5, 0.84], [0.66, 0.07, 0.05]), box(C.ink, [0, 1.68, 0.84], [0.5, 0.07, 0.05]), box(C.ink, [0, 1.32, 0.84], [0.5, 0.07, 0.05]),
    dome(C.steel, [0, 2.38, 0.1], [0.84, 0.52, 0.84]), box(C.honey, [0, 2.52, 0.46], [0.5, 0.12, 0.1])),
  'carousel-chimera': toy('twirl', cyl(C.coral, [0, 0.26, 0], [2.3, 0.26, 2.3]), flatHoop(C.honey, [0, 0.4, 0], 2.3), cyl(C.honey, [0, 1.5, 0], [0.14, 2.4, 0.14]),
    ball(C.violet, [0, 0.95, 0], [1.3, 1.05, 1.3]), ball(C.honey, [0, 1.25, 0.82], 0.78), torus(C.orange, [0, 1.25, 0.68], [1.1, 1.1, 0.9]), eyes(1.36, 1.14, 0.18, 0.13), ball(C.ink, [0, 1.2, 1.2], 0.14),
    ball(C.cream, [-0.78, 1.32, -0.3], [0.62, 0.72, 0.62]), rod(C.woodD, [-0.92, 1.6, -0.3], [-1.2, 2.05, -0.5], 0.2, 'cone'), rod(C.woodD, [-0.66, 1.6, -0.3], [-0.6, 2.1, -0.6], 0.2, 'cone'), ball(C.ink, [-1.02, 1.38, -0.12], 0.12),
    rod(C.sage, [0.6, 0.8, -0.4], [0.82, 1.75, -0.45], 0.32), ball(C.sage, [0.86, 1.92, -0.36], [0.44, 0.38, 0.6]), ball(C.coral, [0.9, 1.88, -0.02], 0.12),
    cone(C.cream, [0, 2.86, 0], [2.4, 0.85, 2.4]), cyl(C.coral, [0, 2.44, 0], [2.4, 0.14, 2.4]), ring(8, a => ball(C.coral, [Math.cos(a) * 1.02, 2.56, Math.sin(a) * 1.02], [0.5, 0.3, 0.5])),
    ball(C.honey, [0, 3.32, 0], 0.3)),
  'prism-princess': toy('float', cone(C.lilac, [0, 1.15, 0], [1.6, 1.9, 1.6]), flatTorus(C.coral, [0, 0.42, 0], [1.6, 1.6, 0.9]), flatTorus(C.honey, [0, 0.74, 0], [1.3, 1.3, 0.8]),
    flatTorus(C.sage, [0, 1.06, 0], [1.04, 1.04, 0.7]), flatTorus(C.blue, [0, 1.38, 0], [0.8, 0.8, 0.6]), ball(C.cream, [0, 2.26, 0], 0.76), eyes(2.28, 0.35),
    dome(C.honey, [0, 2.32, -0.06], [0.86, 0.5, 0.86]), ball(C.honey, [0, 2.0, -0.5], [0.42, 0.9, 0.4]), gem(C.glass, [0, 2.98, 0], [0.32, 0.56, 0.32]),
    pair(gem(C.sky, [0.3, 2.84, 0], [0.24, 0.42, 0.24]), ball(C.cream, [0.5, 1.7, 0.2], 0.26)), gem(C.glass, [0.98, 2.2, 0.35], [0.46, 0.8, 0.46]), gem(C.pink, [-0.95, 1.7, 0.3], [0.3, 0.52, 0.3]),
    gem(C.lime, [-0.7, 2.6, -0.5], [0.24, 0.42, 0.24])),
  'rivet-raccoon': toy('march', feet(C.ink, 0.36, 0.75), ball(C.grey, [0, 1.05, 0], [1.2, 1.3, 1.1]), ball(C.cream, [0, 1.0, 0.36], [0.76, 0.9, 0.5]), ball(C.grey, [0, 2.0, 0.1], [1.1, 0.9, 0.96]),
    box(C.ink, [0, 2.05, 0.5], [0.95, 0.3, 0.2]), pair(ball(C.white, [0.22, 2.06, 0.6], 0.2), prism(C.grey, [0.4, 2.52, 0.05], [0.36, 0.42, 0.12]), torus(C.brass, [0.24, 2.42, 0.42], [0.42, 0.42, 0.4], [-0.5, 0, 0])),
    cone(C.cream, [0, 1.86, 0.66], [0.36, 0.36, 0.36], [H, 0, 0]), ball(C.ink, [0, 1.88, 0.86], 0.14),
    ball(C.grey, [0, 0.7, -0.8], 0.62), ball(C.ink, [0, 1.02, -1.1], 0.56), ball(C.grey, [0, 1.38, -1.26], 0.5), ball(C.ink, [0, 1.72, -1.3], 0.4),
    rod(C.steel, [0.74, 1.9, -0.7], [0.74, 1.9, 0.95], 0.5), torus(C.copper, [0.74, 1.9, 0.95], 0.62), rod(C.honey, [0.74, 1.9, 0.9], [0.74, 1.9, 1.3], 0.3, 'cone'), box(C.steel, [0.74, 1.6, 0.3], [0.14, 0.3, 0.14])),
  'suture-sphinx': toy('tick', rbox(C.sand, [0, 0.78, -0.25], [1.2, 0.9, 2.0]), pair(ball(C.sand, [0.6, 0.72, -0.85], [0.62, 0.92, 0.95]), rbox(C.sand, [0.4, 0.38, 1.0], [0.42, 0.38, 0.95]),
      box(C.blue, [0.56, 1.5, 0.78], [0.3, 0.75, 0.26])), rbox(C.sand, [0, 1.42, 0.5], [0.9, 1.0, 0.7]), ball(C.cream, [0, 2.12, 0.62], 0.8), eyes(2.16, 0.98, 0.18, 0.13),
    rbox(C.blue, [0, 2.12, 0.38], [1.5, 1.2, 0.62]), ...[1.82, 2.12, 2.42].map(y => box(C.honey, [0, y, 0.38], [1.53, 0.1, 0.65])), rod(C.honey, [0, 2.5, 0.72], [0, 2.85, 0.9], 0.2, 'cone'),
    ...[-0.95, -0.6, -0.25, 0.1].map(z => box(C.ink, [0, 1.25, z], [0.42, 0.05, 0.08])), box(C.ink, [0, 1.25, -0.42], [0.05, 0.05, 1.3]), rbox(C.coral, [0.61, 0.85, -0.2], [0.06, 0.4, 0.4]),
    rod(C.sand, [0, 0.8, -1.2], [0.5, 1.5, -1.3], 0.12), ball(C.woodD, [0.55, 1.6, -1.3], 0.26)),
  'obsidian-origami': toy('float', cyl(C.steel, [0, 0.62, 0], [0.06, 1.0, 0.06]), gem(C.obsidian, [0, 1.5, 0], [1.0, 0.82, 1.65]), rod(C.obsidian, [0, 1.6, 0.6], [0, 2.6, 1.05], 0.2, 'box'),
    rod(C.obsidian, [0, 2.6, 1.05], [0, 2.3, 1.5], 0.24, 'pyr'), rod(C.honey, [0, 2.4, 1.36], [0, 2.3, 1.52], 0.12, 'pyr'), ball(C.honey, [0, 2.62, 1.0], 0.14),
    pair(fin(C.plum, [0.5, 2.15, -0.1], [1.35, 1.6, 0.08], 0.75), fin(C.obsidian, [0.3, 1.75, -0.15], [1.0, 0.9, 0.09], 1.2), box(C.honey, [0.98, 2.32, -0.1], [0.04, 1.62, 0.1], [0, 0, -0.75])),
    prism(C.obsidian, [0, 1.95, -1.05], [0.5, 1.1, 0.08], [-0.9, 0, 0]), box(C.honey, [0, 1.92, 0], [0.05, 0.05, 1.5])),
  'venom-violinist': toy('slither', biped({ body: C.feltD, w: 0.86, h: 1.3, headR: 0.46 }), pair(prism(C.feltD, [0.2, 0.75, -0.48], [0.36, 0.85, 0.1], [PI, 0, 0])),
    cyl(C.ink, [0, 2.95, 0], [0.7, 0.7, 0.7]), cyl(C.ink, [0, 2.6, 0], [1.1, 0.08, 1.1]), cyl(C.lime, [0, 2.7, 0], [0.74, 0.14, 0.74]),
    ball(C.woodM, [-0.6, 1.78, 0.36], [0.52, 0.24, 0.72]), ball(C.woodM, [-0.6, 1.78, 0.78], [0.4, 0.22, 0.46]), rod(C.woodD, [-0.6, 1.8, 0.9], [-0.6, 1.84, 1.5], 0.09), ball(C.woodD, [-0.6, 1.86, 1.54], 0.16),
    rod(C.cream, [0.75, 1.75, 0.3], [-0.85, 2.05, 0.7], 0.05), flatTorus(C.lime, [0, 0.95, 0], [1.1, 1.05, 0.9]), flatTorus(C.lime, [0.04, 1.3, 0], [1.06, 1.02, 0.9]),
    ball(C.lime, [0.48, 1.62, 0.3], [0.32, 0.26, 0.44]), box(C.coral, [0.5, 1.6, 0.58], [0.05, 0.03, 0.2])),
  'pendulum-paladin': toy('tick', feet(C.steel, 0.38, 0.8, 0.5), rbox(C.tin, [0, 1.1, 0], [1.3, 1.3, 1.0]), cyl(C.tin, [0, 2.12, 0], [0.98, 0.9, 0.98]), dome(C.tin, [0, 2.56, 0], [0.98, 0.22, 0.98]),
    box(C.ink, [0, 2.2, 0.46], [0.62, 0.1, 0.1]), box(C.ink, [0, 2.02, 0.47], [0.1, 0.4, 0.08]), rod(C.coral, [0, 2.7, 0], [0, 3.2, -0.3], 0.3, 'cone'),
    box(C.cream, [0, 1.05, 0.52], [0.62, 1.0, 0.05]), box(C.coral, [0, 1.15, 0.56], [0.14, 0.6, 0.03]), box(C.coral, [0, 1.25, 0.56], [0.42, 0.14, 0.03]),
    cyl(C.cream, [-0.98, 1.3, 0.45], [1.1, 0.1, 1.1], [H, 0, 0]), torus(C.brass, [-0.98, 1.3, 0.45], [1.25, 1.25, 0.8]), rod(C.ink, [-0.98, 1.3, 0.52], [-0.98, 1.72, 0.52], 0.07), rod(C.ink, [-0.98, 1.3, 0.52], [-0.72, 1.2, 0.52], 0.07),
    rod(C.brass, [0.92, 0.9, 0.1], [1.12, 2.9, 0.1], 0.09), cyl(C.honey, [1.14, 3.0, 0.1], [0.72, 0.16, 0.72], [H, 0, 0]), key(1.2, -0.5, 1.2)),
  'silver-spider': toy('prowl', ball(C.silver, [0, 1.12, -0.5], [1.3, 1.1, 1.5]), gem(C.coral, [0, 1.66, -0.5], [0.44, 0.12, 0.8]), ball(C.steel, [0, 0.98, 0.5], [0.92, 0.72, 0.92]),
    pair(ball(C.coral, [0.15, 1.14, 0.9], 0.17), ball(C.coral, [0.34, 1.2, 0.74], 0.13), rod(C.silver, [0.14, 0.8, 0.9], [0.14, 0.45, 1.0], 0.14, 'cone'),
      ...[-1.0, -0.35, 0.35, 1.0].flatMap(a => {
        const c = Math.cos(a), s = Math.sin(a);
        return [rod(C.silver, [0.35 * c, 1.0, 0.35 * s + 0.4], [1.0 * c, 1.65, 1.0 * s + 0.4], 0.12), rod(C.silver, [1.0 * c, 1.65, 1.0 * s + 0.4], [1.32 * c, 0.14, 1.3 * s + 0.4], 0.1), ball(C.steel, [1.0 * c, 1.65, 1.0 * s + 0.4], 0.18)];
      }))),
  'turbine-tiger': toy('prowl', ball(C.orange, [0, 1.0, -0.1], [1.2, 1.1, 1.9]), legs(C.orange, 0.36, 0.5, -0.65, 0.6, 0.32), ball(C.orange, [0, 1.5, 0.9], [1.0, 0.9, 0.86]),
    ball(C.cream, [0, 1.36, 1.24], [0.5, 0.38, 0.3]), ball(C.ink, [0, 1.46, 1.36], 0.13), eyes(1.66, 1.22, 0.22, 0.14), pair(ball(C.orange, [0.36, 2.0, 0.8], 0.32),
      rod(C.steel, [0.86, 1.4, -0.9], [0.86, 1.4, 0.25], 0.62), rod(C.honey, [0.86, 1.4, 0.25], [0.86, 1.4, 0.55], 0.36, 'cone'), torus(C.copper, [0.86, 1.4, 0.25], 0.72), rod(C.coral, [0.86, 1.4, -0.9], [0.86, 1.4, -1.4], 0.42, 'cone'),
      box(C.ink, [0.2, 1.92, 0.95], [0.1, 0.05, 0.3], [0, 0.3, 0])),
    torus(C.ink, [0, 1.0, -0.6], [1.22, 1.12, 0.6]), torus(C.ink, [0, 1.0, -0.2], [1.3, 1.2, 0.6]), torus(C.ink, [0, 1.0, 0.2], [1.24, 1.14, 0.6]),
    rod(C.orange, [0, 1.1, -0.95], [0, 2.0, -1.35], 0.2), ball(C.ink, [0, 2.06, -1.38], 0.26)),
  'needle-navigator': toy('march', biped({ body: C.navy, w: 0.98, h: 1.2 }), cyl(C.navy, [0, 2.5, 0], [1.4, 0.12, 1.2]), prism(C.navy, [0, 2.78, 0.02], [1.5, 0.62, 0.5]), box(C.honey, [0, 2.56, 0.28], [1.2, 0.08, 0.06]),
    ball(C.honey, [0, 2.76, 0.28], 0.16), flatTorus(C.coral, [0, 1.62, 0], [0.9, 0.86, 0.9]), rod(C.silver, [0.84, 0.3, -0.5], [0.84, 3.1, 0.55], 0.1), rod(C.silver, [0.84, 3.1, 0.55], [0.84, 3.4, 0.66], 0.1, 'cone'),
    hoop(C.silver, [0.84, 0.5, -0.42], [0.3, 0.42, 0.5], [0.36, H, 0]), rod(C.coral, [0.84, 0.5, -0.42], [0.3, 1.0, -0.5], 0.05),
    cyl(C.brass, [0, 1.25, -0.52], [0.95, 0.14, 0.95], [H, 0, 0]), cyl(C.cream, [0, 1.25, -0.6], [0.72, 0.05, 0.72], [H, 0, 0]),
    prism(C.coral, [0, 1.42, -0.64], [0.14, 0.32, 0.04]), prism(C.ink, [0, 1.08, -0.64], [0.14, 0.32, 0.04], [0, 0, PI]), pair(ball(C.honey, [0.16, 1.2, 0.48], 0.12))),
  'royal-rocking-horse': toy('rock', pair(arc(C.woodD, [0.5, 0.62, 0], [2.5, 1.0, 1.3], [PI, H, 0]), rod(C.woodL, [0.4, 1.1, 0.5], [0.5, 0.42, 0.85], 0.2), rod(C.woodL, [0.4, 1.1, -0.6], [0.5, 0.42, -0.85], 0.2),
      prism(C.woodL, [0.16, 2.78, 0.82], [0.16, 0.3, 0.1])), cyl(C.woodD, [0, 0.42, 0.85], [0.1, 1.0, 0.1], [0, 0, H]), cyl(C.woodD, [0, 0.42, -0.85], [0.1, 1.0, 0.1], [0, 0, H]),
    ball(C.woodL, [0, 1.38, -0.1], [0.95, 0.9, 1.7]), rod(C.woodL, [0, 1.45, 0.55], [0, 2.3, 0.92], 0.56), rbox(C.woodL, [0, 2.4, 1.14], [0.5, 0.56, 0.92], [0.5, 0, 0]), eyes(2.52, 1.12, 0.26, 0.13),
    box(C.coral, [0, 2.2, 0.5], [0.16, 1.05, 0.3], [-0.42, 0, 0]), ball(C.coral, [0, 1.45, -1.08], [0.3, 0.95, 0.3], [0.5, 0, 0]),
    rbox(C.coral, [0, 1.78, -0.15], [1.08, 0.2, 0.9]), box(C.honey, [0, 1.8, 0.3], [1.1, 0.2, 0.08]), box(C.honey, [0, 1.8, -0.6], [1.1, 0.2, 0.08]),
    cyl(C.honey, [0, 2.86, 0.98], [0.42, 0.2, 0.42]), ring(4, a => cone(C.honey, [Math.cos(a) * 0.16, 3.04, 0.98 + Math.sin(a) * 0.16], [0.14, 0.24, 0.14]), 0.78), ball(C.coral, [0, 2.98, 0.98], 0.14),
    torus(C.honey, [0, 2.28, 1.3], [0.56, 0.56, 0.3], [0.5, 0, 0])),

  // ───────────── Legendary ─────────────
  'grandfather-gear': toy('tick', rbox(C.woodD, [0, 0.32, 0], [1.6, 0.4, 1.2]), rbox(C.woodD, [0, 1.3, 0], [1.3, 1.9, 1.0]), rbox(C.woodM, [0, 2.62, 0], [1.5, 0.9, 1.1]),
    prism(C.woodD, [0, 3.22, 0], [1.5, 0.36, 1.1]), cyl(C.cream, [0, 2.62, 0.56], [0.82, 0.06, 0.82], [H, 0, 0]), torus(C.brass, [0, 2.62, 0.56], [0.94, 0.94, 0.4]), eyes(2.72, 0.6, 0.17, 0.13),
    rod(C.ink, [0, 2.56, 0.61], [0.22, 2.42, 0.61], 0.06), rod(C.ink, [0, 2.56, 0.61], [-0.2, 2.44, 0.61], 0.06),
    box(C.ink, [0, 1.3, 0.5], [0.56, 1.3, 0.05]), rod(C.honey, [0, 1.9, 0.55], [0.14, 1.0, 0.55], 0.06), cyl(C.brass, [0.15, 0.95, 0.56], [0.42, 0.08, 0.42], [H, 0, 0]),
    gear(C.brass, [0, 2.5, -0.62], [2.15, 2.15, 0.16]), cyl(C.copper, [0, 2.5, -0.72], [1.1, 0.06, 1.1], [H, 0, 0]),
    pair(gear(C.copper, [0.72, 1.5, 0], [0.95, 0.95, 0.14], [0, H, 0]), ball(C.honey, [0.8, 1.5, 0], 0.2)), key(1.3, -0.5, 1.5)),
  'aurora-automaton': toy('float', cone(C.silver, [0, 0.72, 0], [0.72, 0.85, 0.72], [PI, 0, 0]), ball(C.white, [0, 1.5, 0], [1.1, 1.4, 1.0]), box(C.ink, [0, 1.78, 0.42], [0.62, 0.2, 0.16]),
    eyes(1.78, 0.5, 0.16, 0.12, C.sky), flatTorus(C.silver, [0, 2.2, 0], [0.98, 0.98, 0.7]), dome(C.glass, [0, 2.2, 0], [0.9, 0.62, 0.9]), ball(C.honey, [0, 2.36, 0], 0.4),
    arc(C.lime, [0, 1.6, -0.55], [1.4, 1.4, 0.7]), arc(C.sky, [0, 1.6, -0.6], [1.85, 1.85, 0.6]), arc(C.lilac, [0, 1.6, -0.65], [2.3, 2.3, 0.5]), arc(C.pink, [0, 1.6, -0.7], [2.72, 2.72, 0.45]),
    pair(ball(C.silver, [0.74, 1.5, 0.1], [0.3, 0.72, 0.3]), flatTorus(C.honey, [0.74, 1.08, 0.1], 0.42)), flatTorus(C.sky, [0, 1.0, 0], [0.9, 0.9, 0.5])),
  'phoenix-pinwheel': toy('float', pair(rod(C.honey, [0.22, 0.95, 0], [0.26, 0.14, 0.15], 0.1), fin(C.orange, [0.48, 1.7, -0.1], [0.9, 1.4, 0.07], 1.0), fin(C.honey, [0.5, 1.5, -0.4], [0.75, 1.25, 0.07], 1.3),
      fin(C.coral, [0.42, 1.9, 0.2], [0.65, 1.05, 0.07], 0.65)), ball(C.coral, [0, 1.42, 0], [1.0, 1.1, 1.3]), ball(C.orange, [0, 2.16, 0.5], 0.72), eyes(2.24, 0.8, 0.18, 0.13),
    rod(C.honey, [0, 2.1, 0.8], [0, 2.0, 1.2], 0.28, 'cone'), rod(C.honey, [0, 2.4, 0.4], [0, 3.0, 0.15], 0.24, 'cone'), rod(C.orange, [0, 2.4, 0.3], [0, 2.85, -0.15], 0.22, 'cone'), rod(C.coral, [0, 2.3, 0.2], [0, 2.6, -0.35], 0.2, 'cone'),
    rod(C.woodL, [0, 1.2, -0.5], [0, 2.0, -1.05], 0.09), ball(C.honey, [0, 2.0, -1.12], 0.26),
    ring(4, (a, i) => prism([C.coral, C.honey, C.orange, C.cream][i], [Math.cos(a) * 0.5, 2.0 + Math.sin(a) * 0.5, -1.1], [0.5, 0.92, 0.06], [0, 0, a - H]), 0.2)),
  'velvet-dragon': toy('slither', ball(C.violet, [0, 0.6, -1.12], [0.5, 0.5, 0.75]), ball(C.violet, [0.15, 0.78, -0.68], 0.82), ball(C.violet, [0, 1.0, -0.1], [1.3, 1.2, 1.4]),
    ball(C.violet, [0, 1.52, 0.38], [1.0, 1.1, 0.9]), ball(C.violet, [0, 2.12, 0.6], [0.7, 0.9, 0.7]), rbox(C.violet, [0, 2.6, 0.86], [0.76, 0.6, 1.02]), eyes(2.8, 1.12, 0.3, 0.16, C.honey),
    ball(C.cream, [0, 1.2, 0.52], [0.8, 1.0, 0.62]), pair(ball(C.ink, [0.14, 2.62, 1.38], 0.1), rod(C.honey, [0.24, 2.85, 0.6], [0.4, 3.35, 0.35], 0.2, 'cone'),
      fin(C.coral, [0.55, 1.95, -0.3], [1.1, 1.35, 0.08], 0.8), fin(C.lilac, [0.72, 1.6, -0.65], [0.7, 0.95, 0.08], 1.15), ball(C.violet, [0.62, 0.46, 0.4], [0.5, 0.62, 0.72])),
    ...[[2.72, 0.3], [2.3, 0.1], [1.9, -0.3], [1.5, -0.75], [1.1, -1.05]].map(([y, z]) => rod(C.honey, [0, y, z], [0, y + 0.4, z - 0.22], 0.24, 'cone')),
    prism(C.honey, [0, 0.72, -1.52], [0.4, 0.5, 0.1], [-H, 0, 0]), rbox(C.coral, [-0.6, 1.05, -0.2], [0.1, 0.42, 0.42]), box(C.cream, [-0.64, 1.05, -0.2], [0.06, 0.5, 0.06])),
  'celestial-seamstress': toy('float', cone(C.navy, [0, 1.3, 0], [1.5, 2.2, 1.5]), ring(6, (a, i) => { const y = 0.5 + (i % 3) * 0.45, r = 0.75 * (1 - (y - 0.2) / 2.2) + 0.03;
      return star(C.honey, [Math.sin(a) * r, y, Math.cos(a) * r], [0.32, 0.32, 0.05], [0, a, 0]); }, 0.4),
    ball(C.cream, [0, 2.6, 0], 0.7), eyes(2.62, 0.32, 0.16, 0.12), dome(C.silver, [0, 2.66, -0.05], [0.8, 0.46, 0.8]), ball(C.silver, [0, 2.15, -0.4], [0.62, 1.1, 0.36]),
    arc(C.honey, [0, 2.6, -0.42], [1.5, 1.5, 0.8], [0, 0, -0.7]), flatStar(C.honey, [0, 3.14, 0], [0.36, 0.36, 0.08]),
    rod(C.silver, [0.86, 0.3, 0.2], [0.86, 3.0, 0.2], 0.09), rod(C.silver, [0.86, 3.0, 0.2], [0.86, 3.3, 0.2], 0.09, 'cone'), hoop(C.silver, [0.86, 0.5, 0.2], [0.3, 0.42, 0.5]),
    hoop(C.sky, [0.5, 1.0, 0.45], 0.9, [0, H * 0.6, 0.3]), pair(ball(C.cream, [0.46, 1.9, 0.2], 0.24)), cyl(C.woodL, [-0.72, 1.2, 0.3], [0.42, 0.5, 0.42]), cyl(C.coral, [-0.72, 1.2, 0.3], [0.5, 0.3, 0.5])),
  'crownless-king': toy('tick', frust(C.cream, [0, 1.2, -0.25], [1.95, 1.55, 1.55]), frust(C.plum, [0, 1.1, 0.05], [1.5, 1.6, 1.4]), flatTorus(C.cream, [0, 1.95, 0], [1.25, 1.2, 1.5]),
    ...[[0.5, 1.5, -0.86], [-0.4, 1.2, -0.95], [0.1, 0.8, -1.02], [-0.7, 0.7, -0.78], [0.75, 0.9, -0.72], [0, 1.72, -0.72]].map(([x, y, z]) => ball(C.ink, [x, y, z], [0.14, 0.24, 0.12])),
    ball(C.woodL, [0, 2.46, 0], 0.82), eyes(2.46, 0.38, 0.19, 0.13), cone(C.silver, [0, 2.1, 0.32], [0.52, 0.62, 0.36], [PI, 0, 0]), flatHoop(C.woodD, [0, 2.72, 0], 0.66),
    pair(box(C.silver, [0.2, 2.6, 0.38], [0.22, 0.06, 0.08], [0, 0, -0.3])), box(C.honey, [0, 1.1, 0.74], [0.16, 1.5, 0.06]),
    rod(C.silver, [0.98, 0.3, 0.5], [0.98, 1.9, 0.5], 0.16, 'box'), rod(C.silver, [0.98, 0.3, 0.5], [0.98, 0.1, 0.5], 0.16, 'pyr'), box(C.honey, [0.98, 1.9, 0.5], [0.72, 0.13, 0.15]), rod(C.ink, [0.98, 1.9, 0.5], [0.98, 2.4, 0.5], 0.1), ball(C.honey, [0.98, 2.45, 0.5], 0.2),
    cyl(C.honey, [0.98, 2.3, 0.5], [0.62, 0.22, 0.62], [0.3, 0, 0.3]), ring(5, a => cone(C.honey, [0.98 + Math.cos(a) * 0.26 - 0.1, 2.5 + Math.sin(a) * 0.08, 0.56 + Math.sin(a) * 0.26], [0.16, 0.3, 0.16], [0.3, 0, 0.3])),
    ball(C.coral, [1.02, 2.3, 0.82], 0.14)),
  'infinity-jack': toy('hop', rbox(C.coral, [0, 0.78, 0], [1.7, 1.3, 1.7]), box(C.blue, [0, 0.78, 0.86], [0.72, 0.72, 0.04], [0, 0, PI / 4]), box(C.honey, [0, 0.78, -0.86], [0.72, 0.72, 0.04], [0, 0, PI / 4]),
    pair(box(C.blue, [0.86, 0.78, 0], [0.04, 0.72, 0.72], [PI / 4, 0, 0]), box(C.honey, [0.8, 1.42, 0], [0.12, 0.1, 1.72]), torus(C.brass, [0.3, 2.2, -0.86], [0.62, 0.62, 0.5], [-0.25, 0, 0]),
      rod(C.violet, [0.18, 2.75, 0.05], [0.62, 3.3, 0.05], 0.44, 'cone'), ball(C.honey, [0.64, 3.32, 0.05], 0.18)),
    box(C.honey, [0, 1.42, 0.8], [1.72, 0.1, 0.12]), box(C.honey, [0, 1.42, -0.8], [1.72, 0.1, 0.12]), rbox(C.coral, [0, 2.12, -1.02], [1.7, 1.45, 0.14], [-0.25, 0, 0]),
    flatTorus(C.tin, [0, 1.5, 0], 0.75), flatTorus(C.tin, [0, 1.74, 0], 0.66), flatTorus(C.tin, [0, 1.98, 0], 0.58),
    flatGear(C.honey, [0, 2.16, 0.05], [1.05, 1.05, 0.12]), ball(C.cream, [0, 2.52, 0.05], 0.8), eyes(2.58, 0.42, 0.18, 0.14), box(C.coral, [0, 2.36, 0.42], [0.36, 0.07, 0.08]),
    rod(C.steel, [0.85, 0.8, 0.3], [1.2, 0.8, 0.3], 0.1), rod(C.steel, [1.2, 0.8, 0.3], [1.2, 1.15, 0.3], 0.09), ball(C.honey, [1.2, 1.22, 0.3], 0.22)),
};
