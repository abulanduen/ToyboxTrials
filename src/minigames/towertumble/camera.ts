/**
 * The board camera's pan and zoom (local view state, never part of the rules). Zoom 1 is the board
 * fitted into the HUD's board slot; up to 3.2 × closer. The look-at point may wander up to about
 * one board half-width (14 cm) from the centre, less at the fitted zoom, so the board can't be lost.
 * The Scene applies it; the HUD's Reset view button calls `reset()`.
 */
import { PanZoom } from '../shared/panZoom';
import { CELL } from './space';

export const tumbleView = new PanZoom({ minZoom: 1, maxZoom: 3.2, panX: CELL * 4, panZ: CELL * 4 });
