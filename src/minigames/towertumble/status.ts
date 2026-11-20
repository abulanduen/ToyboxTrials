/** Which status badges an enemy wears (pure: the 3D layer and the unit tests both use it). */
import { STATUS_BIT, type StatusKind } from '../shared/statusKinds';
import { ENEMIES } from './catalogue';
import type { Enemy } from './rules';

/** Every debuff Tower Tumble's towers can put on an enemy, in legend order. */
export const TUMBLE_STATUSES: readonly StatusKind[] = ['slow', 'burn', 'stun', 'mark', 'shred'];
/** An enemy's armour when it walked on (enemies only exist during their own wave). */
export const baseArmour = (e: Pick<Enemy, 'kind' | 'check'>, wave: number) => (e.check ? 0 : Math.round(ENEMIES[e.kind].armour * wave * 10) / 10);
/** The enemy's live statuses at simulation time `t` (ms), as a `STATUS_BIT` mask. */
export function enemyStatus(e: Enemy, t: number, wave: number): number {
  if (e.hp <= 0) return 0;
  let m = 0;
  if (e.slowUntil > t && e.slow > 0) m |= STATUS_BIT.slow;
  if (e.burnUntil > t && e.burn > 0) m |= STATUS_BIT.burn;
  if (e.stunUntil > t) m |= STATUS_BIT.stun;
  if (e.markUntil > t) m |= STATUS_BIT.mark;
  if (e.armour < baseArmour(e, wave) - 1e-9) m |= STATUS_BIT.shred;
  return m;
}
