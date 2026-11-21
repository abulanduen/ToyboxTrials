/**
 * Pan and zoom for a top-down board camera: one-finger (or mouse) drag pans, two-finger pinch or
 * the mouse wheel zooms toward the fingers or the cursor, and everything is clamped so the board
 * can never be lost. Plain object, no React state: the game's frame loop reads `zoom`, `panX` and
 * `panZ` and places its camera; gestures call back into the game through `ground` (the tabletop
 * point under a screen position, with the camera as it is now) and `apply` (re-place the camera).
 *
 * The game owns its pointer handling and decides which presses pan (for Tower Tumble: anything
 * that does not start on one of your towers) and what a tap is (a press that moves less than
 * `TAP_SLOP` pixels). Written for Toy Tower Tumble; Toy Squad uses it too (with its own `panRoom`).
 */
export const TAP_SLOP = 10;

export interface PanZoomLimits {
  minZoom: number; maxZoom: number;
  /** How far the look-at point may move from the board centre, in world units. */ panX: number; panZ: number;
  /**
   * The share (0–1) of `panX`/`panZ` allowed at a zoom. Default: 0.45 at `minZoom`, growing with the zoom, so the board
   * stays mostly in view at the fitted zoom (Tower Tumble). A camera that must not move at all when fitted returns 0 there.
   */
  panRoom?: (zoom: number) => number;
}
export interface Ground { x: number; z: number }

export class PanZoom {
  zoom = 1; panX = 0; panZ = 0;
  /** Bumped on every change, so a frame loop can re-place its camera only when needed. */
  version = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { cx: number; cy: number; dist: number } | null = null;
  private grab: Ground | null = null;
  constructor(public limits: PanZoomLimits) {}

  get changed() { return Math.abs(this.zoom - 1) > 1e-3 || Math.abs(this.panX) > 0.05 || Math.abs(this.panZ) > 0.05; }
  get pinching() { return this.pinch !== null; }
  get pointerCount() { return this.pointers.size; }

  reset() { this.zoom = 1; this.panX = 0; this.panZ = 0; this.version++; }
  private clamp() {
    const l = this.limits;
    this.zoom = Math.min(l.maxZoom, Math.max(l.minZoom, this.zoom));
    // The further in you zoom, the further you may look around; at the fitted zoom the board stays mostly in view.
    const k = Math.min(1, Math.max(0, l.panRoom ? l.panRoom(this.zoom) : 0.45 + (this.zoom - l.minZoom) * 0.4));
    this.panX = Math.min(l.panX * k, Math.max(-l.panX * k, this.panX));
    this.panZ = Math.min(l.panZ * k, Math.max(-l.panZ * k, this.panZ));
    this.version++;
  }
  /** Move the camera so that the tabletop point `from` ends up where `to` is now. */
  private shift(from: Ground | null, to: Ground | null) {
    if (!from || !to) return;
    this.panX += from.x - to.x; this.panZ += from.z - to.z;
  }
  /** Zoom by `factor`, keeping the tabletop point under (cx, cy) under it. */
  zoomAt(factor: number, cx: number, cy: number, ground: (x: number, y: number) => Ground | null, apply: () => void) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = ground(cx, cy);
    this.zoom *= factor; this.clamp(); apply();
    this.shift(before, ground(cx, cy)); this.clamp(); apply();
  }
  /** A wheel turn (deltaY in pixels; lines are scaled up). */
  wheel(deltaY: number, deltaMode: number, cx: number, cy: number, ground: (x: number, y: number) => Ground | null, apply: () => void) {
    const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
    this.zoomAt(Math.exp(-px * 0.0015), cx, cy, ground, apply);
  }

  // ───────────── pointers ─────────────
  /** A pointer went down. Returns true when a second finger turned this into a pinch. */
  down(id: number, x: number, y: number): boolean {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      this.grab = null;
      return true;
    }
    return false;
  }
  /** Start a one-finger pan from (x, y). */
  startPan(x: number, y: number, ground: (x: number, y: number) => Ground | null) { this.grab = ground(x, y); }
  get panning() { return this.grab !== null; }
  /** A pointer moved: pinch-zooms with two fingers, pans with one once `startPan` was called. */
  move(id: number, x: number, y: number, ground: (x: number, y: number) => Ground | null, apply: () => void) {
    const p = this.pointers.get(id);
    if (!p) return;
    p.x = x; p.y = y;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const before = ground(this.pinch.cx, this.pinch.cy);
      this.zoomAt(dist / this.pinch.dist, this.pinch.cx, this.pinch.cy, ground, apply);
      // Then follow the fingers' midpoint.
      const from = ground(this.pinch.cx, this.pinch.cy) ?? before;
      this.shift(from, ground(cx, cy)); this.clamp(); apply();
      this.pinch = { cx, cy, dist };
      return;
    }
    if (this.grab) { this.shift(this.grab, ground(x, y)); this.clamp(); apply(); }
  }
  up(id: number) {
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.grab = null;
  }
  cancelAll() { this.pointers.clear(); this.pinch = null; this.grab = null; }
}
