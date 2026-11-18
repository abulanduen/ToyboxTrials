import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_DIR, RING_PAD, VIEW_WINDOW, fitDistance, fovFor, framing, safeBox } from '../../src/minigames/spellbox/camera';
import { arenaRadius } from '../../src/minigames/spellbox/rules';

/** Project a ground circle from the camera placed `d` along CAMERA_DIR from the focus. */
function ringOnScreen(half: number, aspect: number, d: number) {
  const cam = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.5, 2000);
  cam.position.copy(CAMERA_DIR).multiplyScalar(d);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * half, 0, Math.sin(a) * half).project(cam);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

describe('Spellbox camera framing', () => {
  for (const aspect of [16 / 10, 844 / 390, 390 / 844, 1]) {
    it(`the two-player ring fills the safe area tightly (aspect ${aspect.toFixed(2)})`, () => {
      const half = arenaRadius(2) + RING_PAD;
      const d = fitDistance(half, aspect);
      const box = safeBox(aspect);
      const r = ringOnScreen(half, aspect, d);
      expect(r.minX).toBeGreaterThanOrEqual(box.left - 1e-3);
      expect(r.maxX).toBeLessThanOrEqual(box.right + 1e-3);
      expect(r.minY).toBeGreaterThanOrEqual(box.bottom - 1e-3);
      expect(r.maxY).toBeLessThanOrEqual(box.top + 1e-3);
      // Tight: it touches at least one side of the safe box (within 2%).
      const touch = Math.min(r.minX - box.left, box.right - r.maxX, r.minY - box.bottom, box.top - r.maxY);
      expect(touch).toBeLessThan(0.04);
    });
  }

  it('is closer than the old framing, and far closer once the field grows', () => {
    // Old: height max(56, 31/aspect) * radius/15 with depth 0.52 × height, framing the whole ring.
    const aspect = 16 / 10;
    const old = (players: number) => Math.hypot(56, 56 * 0.52) * (arenaRadius(players) / 15);
    const now = (players: number) => fitDistance(framing(arenaRadius(players), { x: 0, z: 0 }).half, aspect);
    expect(now(2)).toBeLessThan(old(2) * 0.85);
    expect(now(4)).toBeLessThan(old(4) * 0.55); // practice default: you + 3 bots
    expect(now(8)).toBeLessThan(old(8) * 0.4);
  });

  it('big rings follow the local toy and keep the nearest edge in view; spectators see the whole ring', () => {
    const r = arenaRadius(8);
    expect(framing(r, null)).toEqual({ x: 0, z: 0, half: r + RING_PAD });
    const centre = framing(r, { x: 0, z: 0 });
    expect(centre.half).toBe(VIEW_WINDOW);
    const edge = framing(r, { x: r, z: 0 });
    // The window reaches the rim on the toy's side.
    expect(edge.x + edge.half).toBeGreaterThanOrEqual(r);
    expect(edge.x).toBeLessThan(r);
    // Small rings are always framed whole, even while playing.
    expect(framing(arenaRadius(2), { x: 10, z: 0 })).toEqual({ x: 0, z: 0, half: arenaRadius(2) + RING_PAD });
  });
});
