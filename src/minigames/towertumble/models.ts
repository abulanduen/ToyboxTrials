/**
 * Toy Tower Tumble enemy models, in Toy Squad's part format (see `toysquad/models.ts`) so they bake
 * through the same `bakeParts` into one vertex-coloured geometry each. Pure data, original designs.
 *
 * Space: +z is the enemy's front (the way it walks), +y up, 1 unit = 1 cm. Roughly 1.2–2 cm long:
 * a third of a board square, so a crowd still reads on a phone.
 */
import { TOY_COLOURS as C, type ToyPart, type V3, type Prim } from '../toysquad/models';
import type { EnemyKind } from './catalogue';

const H = Math.PI / 2;
const part = (g: Prim) => (c: string, p: V3, s: V3 | number, r: V3 = [0, 0, 0]): ToyPart => ({ g, c, p, s: typeof s === 'number' ? [s, s, s] : s, r, o: 'XYZ' });
const ball = part('ball'), cyl = part('cyl'), cone = part('cone'), rbox = part('rbox'), box = part('box'), dome = part('dome'), prism = part('prism'), torus = part('torus'), hoop = part('hoop');
const mirror = (p: ToyPart): ToyPart => ({ ...p, p: [-p.p[0], p.p[1], p.p[2]], r: [p.r[0], -p.r[1], -p.r[2]] });
const pair = (...parts: ToyPart[]) => parts.flatMap((p) => [p, mirror(p)]);

export const ENEMY_PARTS: Record<Exclude<EnemyKind, 'boss'>, ToyPart[]> = {
  // A grey clockwork mouse on hidden wheels, brass key in its back.
  walker: [
    ball(C.silver, [0, 0.55, 0], [0.95, 0.8, 1.35]),
    cone(C.silver, [0, 0.55, 0.78], [0.62, 0.7, 0.62], [H, 0, 0]),
    ball(C.pink, [0, 0.55, 1.12], 0.18),
    ...pair(ball(C.pink, [0.3, 0.98, 0.42], [0.38, 0.38, 0.1]), ball(C.ink, [0.18, 0.72, 0.86], 0.11), cyl(C.ink, [0.36, 0.14, 0.25], [0.26, 0.12, 0.26], [0, 0, H])),
    cyl(C.coral, [0, 0.45, -0.85], [0.08, 0.6, 0.08], [H * 0.7, 0, 0]),
    cyl(C.brass, [0, 1.0, -0.25], [0.08, 0.32, 0.08]),
    torus(C.brass, [0, 1.25, -0.25], [0.32, 0.32, 0.6], [0, H, 0]),
  ],
  // A domed tin beetle with a honey stripe: armoured.
  beetle: [
    dome(C.steel, [0, 0.18, -0.05], [1.35, 0.55, 1.55]),
    box(C.honey, [0, 0.72, -0.05], [0.14, 0.12, 1.3]),
    ball(C.ink, [0, 0.42, 0.78], [0.62, 0.48, 0.5]),
    ...pair(ball(C.white, [0.15, 0.55, 0.98], 0.13), cyl(C.ink, [0.65, 0.22, 0.35], [0.08, 0.5, 0.08], [0, 0, 1.1]), cyl(C.ink, [0.68, 0.22, -0.3], [0.08, 0.5, 0.08], [0, 0, 1.1]),
      cyl(C.ink, [0.15, 0.78, 1.0], [0.05, 0.5, 0.05], [0.6, 0, -0.4])),
  ],
  // A coral pull-back racer with a glass cabin and fat tyres: fast.
  racer: [
    rbox(C.coral, [0, 0.5, 0], [1.0, 0.45, 1.65]),
    rbox(C.glass, [0, 0.82, -0.12], [0.78, 0.36, 0.8]),
    box(C.white, [0, 0.74, 0.62], [0.5, 0.04, 0.3]),
    box(C.ink, [0, 0.95, -0.78], [1.0, 0.08, 0.22]),
    ...pair(cyl(C.ink, [0.55, 0.3, 0.52], [0.52, 0.26, 0.52], [0, 0, H]), cyl(C.ink, [0.55, 0.3, -0.52], [0.52, 0.26, 0.52], [0, 0, H])),
  ],
  // A glass marble with a coral swirl: comes in swarms.
  marble: [
    ball(C.glass, [0, 0.42, 0], 0.84),
    hoop(C.coral, [0, 0.42, 0], [0.9, 0.9, 1.2], [0.5, 0.3, 0]),
    ball(C.white, [0.17, 0.62, 0.2], 0.16),
  ],
  // A folded paper plane: flies.
  glider: [
    prism(C.white, [0, 0.9, 0.05], [1.7, 1.9, 0.05], [H, 0, 0]),
    prism(C.cream, [0, 0.72, 0.05], [0.22, 1.7, 0.38], [H, 0, 0]),
    box(C.coral, [0, 0.93, -0.3], [0.9, 0.03, 0.1]),
    ...pair(box(C.blue, [0.42, 0.93, -0.55], [0.24, 0.03, 0.18])),
  ],
};
/** Visual scale of each enemy kind (and the height at which flyers glide). */
export const ENEMY_SCALE: Record<EnemyKind, number> = { walker: 1.4, beetle: 1.4, racer: 1.3, marble: 1.2, glider: 1.45, boss: 2.2 };
export const FLY_HEIGHT = 1.6;
