/**
 * Toybox Siege colours and short labels for the HUD and the scene. Every colour is a palette
 * token or a Toy Squad toy colour (itself built from palette tokens).
 */
import { PALETTE as P } from '../../game/palette';
import { TOY_COLOURS as C } from '../toysquad/models';
import type { ClassId, PassiveId, WeaponId } from './config';

export const CLASS_COLOUR: Record<ClassId, string> = { warrior: P.toyBlue, ranger: P.sage, mage: P.inkPurple };
export const WEAPON_COLOUR: Record<WeaponId, string> = { sweep: C.silver, popgun: P.coral, chime: C.lilac, yoyo: P.toyBlue, planes: P.white, marbles: C.glass };
export const PASSIVE_COLOUR: Record<PassiveId, string> = { plating: C.tin, crayon: P.coral, mainspring: P.brass, magnifier: C.sky, gears: P.honey, magnet: C.wine };
/** Experience gems by value: small pale blue, middling toy blue, big honey (all stand out on the green mat). */
export const gemColour = (v: number) => (v >= 10 ? P.honey : v >= 2 ? P.toyBlue : C.sky);
export const HURT_TINT = P.coral;
export const SHOT_COLOUR = C.wine;
export const ARENA = { mat: P.felt, matDark: P.feltDark, rail: P.woodMid, railDark: P.woodDark, stitch: P.cream, patches: [P.felt, P.feltDark, P.sage, P.felt, C.leaf] } as const;
/** The final arena's ring: a cream felt mat, a coral band, cotton-reel posts and elastic-band ropes. */
export const RING = { mat: P.cream, band: P.coral, centre: P.honey, stitch: P.inkPurple, ropeLow: P.toyBlue, ropeHigh: P.coral, thread: [P.coral, P.toyBlue, P.honey, P.sage] } as const;
export const FX = { sweep: P.white, chime: C.lilac, chimeCore: P.honey, marble: C.glass, revive: P.honey, telegraph: P.coral, pickup: P.cream, level: P.honey, ghost: P.white } as const;
