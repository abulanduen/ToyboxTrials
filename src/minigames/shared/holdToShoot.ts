/**
 * A hold-to-shoot touch button (the Hub's Interact while you hold the ball, Hoop Hustle's Throw,
 * Hoop Clash's Shoot), shared so all three cancel the same way.
 *
 * Holding the button holds `action` in the shared action layer (src/game/input.ts): the shot meter
 * winds back and forth (src/minigames/shared/shotMeter.ts) and letting go shoots. Sliding the finger
 * off the button cancels: the `cancel` action is pressed (and held until the finger lifts), so the
 * game drops the charge, and lifting the finger afterwards shoots nothing. The button fires on
 * pointer-down and keeps the pointer captured, so it works while the other thumb holds the stick.
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { pressVirtual, releaseVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';

/** How far (px) outside the button the finger must slide before the shot is cancelled. */
export const SLIDE_OFF_PX = 22;

export function useHoldToShoot(action: Action) {
  const held = useRef<number | null>(null);
  const off = useRef(false);
  const [down, setDown] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const letGo = () => {
    held.current = null;
    off.current = false;
    setDown(false);
    setCancelled(false);
    releaseVirtual(action);
    releaseVirtual('cancel');
  };
  // The button can vanish under a thumb (the prompt goes, the match pauses): let go of both actions.
  useEffect(
    () => () => {
      releaseVirtual(action);
      releaseVirtual('cancel');
    },
    [action],
  );
  const props = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || held.current !== null) return;
      e.preventDefault();
      unlockAudio();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // (a pointer that is not active, e.g. a synthetic event: the button still holds until pointer-up)
      }
      held.current = e.pointerId;
      off.current = false;
      setDown(true);
      setCancelled(false);
      pressVirtual(action);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (held.current !== e.pointerId || off.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      const m = SLIDE_OFF_PX;
      if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) {
        off.current = true;
        setCancelled(true);
        pressVirtual('cancel');
      }
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (held.current === e.pointerId) letGo();
    },
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => {
      if (held.current === e.pointerId) letGo();
    },
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => {
      if (held.current === e.pointerId) letGo();
    },
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
  return { props, down, cancelled };
}
