/**
 * Props for an action button that must work while another finger is down (a joystick thumb).
 *
 * Phones only send `click` for a lone tap: with a second finger already on the screen (holding the
 * joystick), iOS and Android treat the touch as part of a multi-touch gesture and never click. So the
 * button fires on pointer-down instead, which every finger gets on its own. Keyboard activation
 * (Enter / Space on a focused button) still arrives as a click with `detail === 0`, so it fires there.
 */
import type { PointerEvent, MouseEvent } from 'react';

export function tapButton(fire: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || e.currentTarget.disabled) return;
      // Keep the press from turning into a focus change, text selection or a delayed click.
      e.preventDefault();
      fire();
    },
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0) fire();
    },
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}
