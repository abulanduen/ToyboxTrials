/**
 * Whether Pipwick's welcome tour (or a chat with Pipwick) currently owns the Hub: gameplay input
 * is blocked (store.ts `inputBlocked`) and the tour drives the camera. A plain object with no
 * imports, so the store can read it without an import cycle. Written only by src/game/welcome.ts.
 */
export const tourFlag = {
  active: false,
  /** The tour's camera is in charge (the player camera cuts back behind the toy afterwards). */
  camera: false,
  /**
   * The tour used this frame's key presses (Next / Skip). The tour can end within the same frame,
   * so the player controller also ignores the frame's input: an Esc that skips must not pause too.
   */
  ate: false,
};
