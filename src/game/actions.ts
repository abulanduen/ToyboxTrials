/**
 * The shared input actions, as a type only. Pure (no DOM), so the minigame contract
 * (src/minigames/types.ts) and through it the rules cores can be typechecked and bundled for the
 * online game server. src/game/input.ts re-exports it and does the device work.
 */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'interact'
  | 'run'
  | 'pause'
  /** Four generic minigame slots (Copycat instruments, rhythm lanes, answer buttons…). */
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4';
