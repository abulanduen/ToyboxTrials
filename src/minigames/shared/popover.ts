/**
 * Where a floating popover goes: beside the thing it describes (the anchor), never over it if
 * there is room, and always inside the bounds (the screen less the safe-area insets). Pure; the
 * HUD measures the anchor, the popover and the bounds, and sets `left`/`top` from the answer.
 * Used by Toy Tower Tumble's tower sheet and hover tip, so a popup never pushes the layout.
 */
export interface Box { left: number; top: number; right: number; bottom: number }
export type PopoverSide = 'above' | 'below' | 'right' | 'left';
export interface Placement { left: number; top: number; side: PopoverSide; covers: boolean }

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/**
 * Place a `w` × `h` popover next to `anchor` inside `bounds`, `gap` px away. Sides are tried in
 * `order` (default: above and below first on tall bounds, right and left first on wide ones); the
 * first side with room wins. With no side free, the side with the most room is used and the
 * popover is clamped into the bounds (it may then cover the anchor: `covers`).
 */
export function placePopover(anchor: Box, w: number, h: number, bounds: Box, gap = 8, order?: readonly PopoverSide[]): Placement {
  const sides = order ?? (bounds.bottom - bounds.top > bounds.right - bounds.left ? ['above', 'below', 'right', 'left'] : ['right', 'left', 'above', 'below']) as PopoverSide[];
  const cx = (anchor.left + anchor.right) / 2, cy = (anchor.top + anchor.bottom) / 2;
  const room: Record<PopoverSide, number> = {
    above: anchor.top - gap - bounds.top - h,
    below: bounds.bottom - (anchor.bottom + gap) - h,
    right: bounds.right - (anchor.right + gap) - w,
    left: anchor.left - gap - bounds.left - w,
  };
  const at = (side: PopoverSide) => {
    const vertical = side === 'above' || side === 'below';
    const left = vertical ? clamp(cx - w / 2, bounds.left, bounds.right - w) : clamp(side === 'right' ? anchor.right + gap : anchor.left - gap - w, bounds.left, bounds.right - w);
    const top = vertical ? clamp(side === 'below' ? anchor.bottom + gap : anchor.top - gap - h, bounds.top, bounds.bottom - h) : clamp(cy - h / 2, bounds.top, bounds.bottom - h);
    const covers = left < anchor.right && left + w > anchor.left && top < anchor.bottom && top + h > anchor.top;
    return { left: Math.round(left), top: Math.round(top), side, covers };
  };
  for (const side of sides) if (room[side] >= 0) return at(side);
  // Nothing fits cleanly: the roomiest side, clamped into the bounds.
  return at(sides.slice().sort((a, b) => room[b] - room[a])[0]);
}
