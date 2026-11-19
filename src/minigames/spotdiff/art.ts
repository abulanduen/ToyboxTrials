/**
 * Odd Page Out: a whole picture as data. `drawPicture(theme, variants)` is the backdrop followed by
 * every slot drawn with its variant, in slot order. The two pages of a round use the same function
 * with variant lists that differ in exactly 15 places, so they are identical everywhere else.
 */
import { background } from './backgrounds';
import { drawProp } from './props';
import type { Shape } from './shapes';
import { themeById, type SlotDef, type ThemeId } from './themes';

/** One slot's shapes for a variant. */
export function drawSlot(slot: SlotDef, variant: number): Shape[] {
  return drawProp(slot.prop, slot.x, slot.y, { ...slot.base, ...slot.vary[variant] });
}

/** Everything drawn for slots, one entry per slot (for tests and the renderer). */
export function drawSlots(theme: ThemeId, variants: readonly number[]): Shape[][] {
  return themeById(theme).slots.map((s, i) => drawSlot(s, variants[i] ?? 0));
}

export function drawPicture(theme: ThemeId, variants: readonly number[]): Shape[] {
  return [...background(theme), ...drawSlots(theme, variants).flat()];
}
