/**
 * Toy Squad's camera zoom and pan (local view state, never part of the rules), on the shared `PanZoom`
 * (`../shared/panZoom.ts`, written for Tower Tumble). Zoom 1 is the fitted view the Scene works out for the
 * screen (build or battle); up to 2.5 × closer. At the fitted zoom the camera never pans; zoomed in, the
 * look-at point may move as far as the zoom hides (1 − 1/zoom of 15 cm each way), so every square of your
 * board and your reserve row can be brought into view and the board can never be lost.
 *
 * Desktop: the mouse wheel (toward the cursor) and the + / − keys; drag empty table to pan. Touch: pinch
 * (toward the fingers) and the on-screen + / − buttons; one finger on empty table pans. A press that starts
 * on one of your toys while building still drags that toy: panning never starts from a toy drag, and a
 * second finger cancels a toy drag (nothing moves) to pinch instead.
 *
 * The view resets to the fitted zoom whenever the framing changes: build ↔ battle, each new round, and
 * switching to another player's board (or back to yours).
 */
import { PanZoom } from '../shared/panZoom';

export const SQUAD_ZOOM = { min: 1, max: 2.5, step: 1.25 } as const;
export const squadView = new PanZoom({ minZoom: SQUAD_ZOOM.min, maxZoom: SQUAD_ZOOM.max, panX: 15, panZ: 15, panRoom: (zoom) => 1 - 1 / zoom });

/**
 * Set by the Scene while it is mounted (it owns the camera): zoom by a factor about the middle of the view,
 * for the HUD's + / − buttons and the keys. Null otherwise.
 */
export const squadCamera: { zoomBy: ((factor: number) => void) | null } = { zoomBy: null };
export const zoomSquad = (factor: number) => squadCamera.zoomBy?.(factor);
