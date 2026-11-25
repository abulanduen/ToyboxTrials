/*
 * The Hub's two levels (src/game/hubBounds.ts, src/game/collision.ts): the tables, and the arcade on
 * the room floor under the spawn table (docs/ARCADE_PLAN.md). A toy on one level never bumps into,
 * stands on or walks onto the other's ground.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CAMERA_CLEARANCE, addStatic, cameraCeiling, cameraFloorAt, clampToBounds, groundHeightAt, resetStatic, resolve, type Collider } from '../../src/game/collision';
import { ARCADE_CEILING, ARCADE_WALK, LEVEL_WALK, LEVEL_Y, WALK_AREAS, isWalkable, levelOfY } from '../../src/game/hubBounds';
import { FLOOR_Y, FOUNTAIN, TABLE, hubColliders } from '../../src/scene/layout';
import { planSpeakers, VOICE_CONNECT_CM } from '../../src/net/voicePlan';

const R = 0.85;

describe('the levels match the room', () => {
  it('the floor level is the room floor; the arcade ceiling is the spawn table apron underside', () => {
    expect(LEVEL_Y.table).toBe(0);
    expect(LEVEL_Y.floor).toBeCloseTo(FLOOR_Y, 9);
    // Tabletop.tsx: an 8 cm apron under the 3.5 cm top
    expect(ARCADE_CEILING).toBeCloseTo(-TABLE.thickness - 8, 9);
    expect(levelOfY(0)).toBe('table');
    expect(levelOfY(12)).toBe('table');
    expect(levelOfY(FLOOR_Y)).toBe('floor');
    expect(levelOfY(FLOOR_Y + 10)).toBe('floor');
  });
  it('the arcade floor is under the spawn table, inside its four legs (6 cm square, 6 cm in from the corners)', () => {
    const legInner = { minX: TABLE.minX + 9, maxX: TABLE.maxX - 9, minZ: TABLE.minZ + 9, maxZ: TABLE.maxZ - 9 };
    expect(ARCADE_WALK.minX).toBeGreaterThanOrEqual(legInner.minX);
    expect(ARCADE_WALK.maxX).toBeLessThanOrEqual(legInner.maxX);
    expect(ARCADE_WALK.minZ).toBeGreaterThanOrEqual(legInner.minZ);
    expect(ARCADE_WALK.maxZ).toBeLessThanOrEqual(legInner.maxZ);
    expect(LEVEL_WALK.table).toBe(WALK_AREAS);
    expect(LEVEL_WALK.floor).toEqual([ARCADE_WALK]);
  });
});

describe('collision keeps to the toy’s own level', () => {
  const floorBlock: Collider = { kind: 'box', id: 'cabinet', x: 30, z: 0, hx: 3, hz: 2, rot: 0, top: FLOOR_Y + 6, lv: 'floor' };
  const floorStep: Collider = { kind: 'circle', id: 'stool', x: -20, z: 10, r: 2, top: FLOOR_Y + 0.4, lv: 'floor' };
  resetStatic();
  addStatic(...hubColliders(), floorBlock, floorStep);
  afterAll(() => resetStatic());

  it('the tables are as before (the default level)', () => {
    expect(groundHeightAt(FOUNTAIN.x + FOUNTAIN.r - 1, FOUNTAIN.z, R, 99)).toBeCloseTo(FOUNTAIN.top, 6);
    expect(groundHeightAt(0, 30, R, 0)).toBe(0);
    const p = { x: FOUNTAIN.x + FOUNTAIN.column.r, z: FOUNTAIN.z };
    expect(resolve(p, R, FOUNTAIN.top)).toBe('fountain-column');
    // the floor's props are nothing up here
    expect(groundHeightAt(floorStep.x, floorStep.z, R, 0)).toBe(0);
    const q = { x: floorBlock.x, z: floorBlock.z };
    expect(resolve(q, R, 0)).toBeNull();
  });
  it('down in the arcade the props overhead are nothing: no walls, no ground', () => {
    // right under the fountain: its basin and column don't touch a floor toy
    expect(groundHeightAt(FOUNTAIN.x, FOUNTAIN.z, R, FLOOR_Y + 99, 'floor')).toBe(FLOOR_Y);
    const p = { x: FOUNTAIN.x + 0.5, z: FOUNTAIN.z };
    expect(resolve(p, R, FLOOR_Y, 'floor')).toBeNull();
    expect(p).toEqual({ x: FOUNTAIN.x + 0.5, z: FOUNTAIN.z });
  });
  it("the floor's own props block and carry a floor toy", () => {
    const p = { x: floorBlock.x - 3.2, z: floorBlock.z };
    expect(resolve(p, R, FLOOR_Y, 'floor')).toBe('cabinet');
    expect(p.x).toBeLessThanOrEqual(floorBlock.x - 3 - R + 1e-6);
    expect(groundHeightAt(floorStep.x, floorStep.z, R, FLOOR_Y, 'floor')).toBeCloseTo(floorStep.top, 6);
  });
  it("a floor toy stays on the arcade's floor; a table toy on the tables", () => {
    const p = { x: 200, z: 0 };
    clampToBounds(p, R, 'floor');
    expect(isWalkable(p.x, p.z, R, LEVEL_WALK.floor)).toBe(true);
    expect(p.x).toBeCloseTo(ARCADE_WALK.maxX - R, 6);
    const q = { x: 0, z: 30 };
    clampToBounds(q, R);
    expect(q).toEqual({ x: 0, z: 30 });
  });
  it('the camera stays above the floor and under the table in the arcade', () => {
    expect(cameraFloorAt(0, 0, 'floor')).toBeCloseTo(FLOOR_Y + CAMERA_CLEARANCE, 6);
    expect(cameraFloorAt(0, 30)).toBeCloseTo(CAMERA_CLEARANCE, 6);
    expect(cameraCeiling('floor')).toBeLessThan(ARCADE_CEILING);
    expect(cameraCeiling('table')).toBe(Infinity);
  });
});

describe('voice chat measures height too', () => {
  it('a speaker right below you in the arcade is out of earshot; one beside you is not', () => {
    const me = { x: 0, y: 0, z: 0 };
    const opts = { hearing: true, muted: new Set<string>() };
    const below = { id: 'below', x: 0, y: FLOOR_Y, z: 0, micOn: true, inHub: true };
    const beside = { id: 'beside', x: VOICE_CONNECT_CM - 5, y: 0, z: 0, micOn: true, inHub: true };
    expect(planSpeakers(me, [below, beside], new Set(), opts)).toEqual(['beside']);
  });
});
