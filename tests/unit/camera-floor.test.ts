import { afterAll, describe, expect, it } from 'vitest';
import { CAMERA_CLEARANCE, addStatic, cameraFloorAt, resetStatic } from '../../src/game/collision';
import { BRIDGE, hubColliders } from '../../src/scene/layout';

describe('hub camera floor (the camera dipped inside low props and flashed black)', () => {
  resetStatic();
  addStatic(...hubColliders());
  afterAll(() => resetStatic());

  it('stays just above the open table top', () => {
    expect(cameraFloorAt(0, 30)).toBeCloseTo(CAMERA_CLEARANCE);
  });

  it('rises over the domino bridge deck', () => {
    const z = (BRIDGE.deckA + BRIDGE.deckB) / 2;
    expect(cameraFloorAt(BRIDGE.x, z)).toBeGreaterThanOrEqual(BRIDGE.top + CAMERA_CLEARANCE - 1e-6);
  });

  it('does not lift the camera onto tall buildings (those stop it as camera blockers instead)', () => {
    for (const c of hubColliders()) if (c.top > 6) expect(cameraFloorAt(c.x, c.z)).toBeLessThan(6 + CAMERA_CLEARANCE + 1e-6);
  });
});
