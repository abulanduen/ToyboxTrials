/**
 * Toybox Siege toy models. Pure data in Toy Squad's part format (`toysquad/models.ts`), baked by
 * Toy Squad's `bakeParts` into one vertex-coloured geometry each, so every toy is one draw call
 * and every swarm kind is one instanced draw call.
 *
 * The Tin Soldier and the elites/boss reuse Toy Squad's roster models; the Ranger, the Wizard and
 * the swarm are new, kept deliberately low-poly because up to `mobCap` of them share a board.
 * Space: +z is the toy's front, +y up, 1 unit = 1 cm.
 */
import { TOY_COLOURS as C, TOY_SPECS, type Prim, type ToyPart, type V3 } from '../toysquad/models';
import type { BigId, ClassId } from './config';

const H = Math.PI / 2;
const Z: V3 = [0, 0, 0];
const mk = (g: Prim) => (c: string, p: V3, s: V3 | number, r: V3 = Z): ToyPart => ({ g, c, p, s: typeof s === 'number' ? [s, s, s] : s, r, o: 'XYZ' });
const box = mk('box'), rbox = mk('rbox'), ball = mk('ball'), cyl = mk('cyl'), cone = mk('cone'), torus = mk('torus'), prism = mk('prism'), star = mk('star'), gear = mk('gear'), gem = mk('gem');
const mirror = (p: ToyPart): ToyPart => ({ ...p, p: [-p.p[0], p.p[1], p.p[2]], r: [p.r[0], -p.r[1], -p.r[2]] });
const pair = (...parts: ToyPart[]) => parts.flatMap((p) => [p, mirror(p)]);
const key = (y: number, z: number): ToyPart[] => [cyl(C.brass, [0, y, z - 0.2], [0.14, 0.5, 0.14], [H, 0, 0]), ...pair(torus(C.brass, [0.25, y, z - 0.6], [0.55, 0.55, 0.55], [0, H, 0]))];

/** Pop-Gun Ranger: green felt scout with a peaked cap, a feather and a cork pop-gun. */
const ranger: ToyPart[] = [
  ...pair(rbox(C.ink, [0.34, 0.3, 0.1], [0.44, 0.36, 0.78])),
  cyl(C.leaf, [0, 1.05, 0], [0.86, 1.2, 0.8]), box(C.woodD, [0, 0.95, 0], [0.9, 0.16, 0.84]), ball(C.honey, [0, 0.95, 0.42], 0.18),
  ball(C.cream, [0, 2.0, 0], 0.98), ...pair(ball(C.ink, [0.2, 2.04, 0.44], 0.15)),
  cyl(C.leafD, [0, 2.48, 0], [0.98, 0.32, 0.98]), box(C.leafD, [0, 2.36, 0.46], [0.8, 0.07, 0.4]),
  prism(C.coral, [-0.32, 2.85, -0.25], [0.16, 0.85, 0.06], [0.35, 0, 0.4]),
  // the pop-gun, held across the body
  cyl(C.woodM, [0.62, 1.25, 0.5], [0.2, 1.3, 0.2], [H, 0, 0]), cyl(C.silver, [0.62, 1.25, 1.12], [0.3, 0.12, 0.3], [H, 0, 0]),
  cyl(C.cork, [0.62, 1.25, 1.24], [0.22, 0.22, 0.22], [H, 0, 0]), ball(C.leaf, [0.58, 1.12, 0.12], [0.3, 0.55, 0.3]),
  ...key(1.2, -0.42),
];

/** Clockwork Wizard: starry pointed hat, cotton beard, a long robe, a gear-topped staff and a wind-up key. */
const wizard: ToyPart[] = [
  cone(C.purple, [0, 0.95, 0], [1.4, 1.9, 1.4]), cyl(C.honey, [0, 0.12, 0], [1.42, 0.14, 1.42]),
  ball(C.cream, [0, 2.0, 0], 0.88), ...pair(ball(C.ink, [0.18, 2.06, 0.4], 0.13)),
  cone(C.white, [0, 1.7, 0.32], [0.62, 0.8, 0.36], [-0.25 + Math.PI, 0, 0]),
  cyl(C.navy, [0, 2.36, 0], [1.3, 0.12, 1.3]), cone(C.navy, [0, 3.0, -0.05], [0.9, 1.35, 0.9], [-0.12, 0, 0]),
  star(C.honey, [0, 2.75, 0.4], [0.32, 0.32, 0.06]), star(C.honey, [0.22, 3.2, 0.25], [0.2, 0.2, 0.05]),
  cyl(C.woodD, [0.8, 1.6, 0.25], [0.12, 2.9, 0.12]), gear(C.brass, [0.8, 3.15, 0.25], [0.62, 0.62, 0.14]), gem(C.sky, [0.8, 3.15, 0.36], 0.26),
  ball(C.purple, [0.62, 1.55, 0.2], [0.3, 0.5, 0.3]),
  ...key(1.25, -0.5),
];

export const CLASS_PARTS: Record<ClassId, ToyPart[]> = { warrior: TOY_SPECS.soldier.parts, ranger, mage: wizard };

/** The swarm, in mob-kind order (bunny, mouse, marble, plane). Low-poly on purpose. */
export const MOB_PARTS: ToyPart[][] = [
  // dust bunny: a grey fluff ball with two flopped ears and button eyes
  [ball(C.grey, [0, 0.8, 0], [1.6, 1.4, 1.6]), ...pair(ball(C.grey, [0.42, 1.5, -0.1], [0.36, 0.9, 0.3], [0.5, 0, -0.35]), box(C.ink, [0.28, 0.98, 0.72], [0.18, 0.18, 0.08]))],
  // wind-up mouse: tin body, pink nose, round ears, a key
  [ball(C.tin, [0, 0.55, -0.05], [1.0, 0.85, 1.5]), cone(C.tin, [0, 0.52, 0.85], [0.55, 0.55, 0.5], [H, 0, 0]), ball(C.pink, [0, 0.52, 1.14], 0.16),
    ...pair(cyl(C.pink, [0.3, 1.05, 0.35], [0.42, 0.06, 0.42], [H, 0, 0])), cyl(C.brass, [0, 0.95, -0.45], [0.1, 0.4, 0.1])],
  // rolling marble: glass with a coloured swirl band
  [ball(C.glass, [0, 0.95, 0], 1.9), torus(C.coral, [0, 0.95, 0], [1.55, 1.55, 1.2], [0.4, 0, 0.3])],
  // paper plane: folded white card with a coral stripe
  [prism(C.white, [0, 0.9, 0], [1.6, 2.0, 0.06], [-H, 0, 0]), box(C.white, [0, 0.72, -0.1], [0.12, 0.35, 1.7]), box(C.coral, [0, 0.93, -0.3], [1.0, 0.05, 0.12])],
];

/** Elites and the boss reuse Toy Squad roster models, scaled up. */
export const BIG_MODEL: Record<BigId, { kind: string; scale: number }> = {
  bear: { kind: 'clockwork-bear', scale: 1.7 },
  drummer: { kind: 'domino-drummer', scale: 1.6 },
  rhino: { kind: 'ratchet-rhino', scale: 1.8 },
  baron: { kind: 'brass-behemoth', scale: 2.6 },
};

/** Treasure chest dropped by elites. */
export const CHEST_PARTS: ToyPart[] = [
  rbox(C.woodM, [0, 0.55, 0], [1.9, 1.1, 1.3]), box(C.brass, [0, 0.55, 0], [1.96, 0.18, 1.36]),
  cyl(C.woodL, [0, 1.12, 0], [1.3, 1.9, 1.3], [0, 0, H]), box(C.brass, [0, 1.0, 0.68], [0.32, 0.4, 0.08]), ...pair(box(C.brass, [0.7, 0.85, 0], [0.12, 1.1, 1.36])),
];
/** Biscuit (heals). */
export const SNACK_PARTS: ToyPart[] = [cyl(C.sand, [0, 0.25, 0], [1.1, 0.3, 1.1]), ...[0, 1, 2, 3].map((i) => ball(C.woodD, [Math.cos(i * 1.6) * 0.3, 0.42, Math.sin(i * 1.6) * 0.3], 0.14))];
