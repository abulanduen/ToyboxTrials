/* The bedroom around the tables: furniture footprints and the family dog's route (room layer). */
import { describe, expect, it } from 'vitest';
import { DOG_CLEARANCE, DOG_PATH, DOG_PERCH, DOG_SPOTS, FLOOR_OBSTACLES, GLB_SLOTS, ROOM_LAYOUT, distToRect, dogPose, dogRoute } from '../../src/scene/room/roomLayout';
import { SHELL, WINDOW } from '../../src/scene/room/bake';
import { DOG_SIZE } from '../../src/scene/room/RoomDog';
import { FLOOR_Y, TABLE } from '../../src/scene/layout';

describe('bedroom layout', () => {
  it('all furniture stands inside the room and does not overlap', () => {
    for (const r of FLOOR_OBSTACLES) {
      expect(r.minX, r.id).toBeGreaterThanOrEqual(SHELL.minX);
      expect(r.maxX, r.id).toBeLessThanOrEqual(SHELL.maxX);
      expect(r.minZ, r.id).toBeGreaterThanOrEqual(SHELL.minZ);
      expect(r.maxZ, r.id).toBeLessThanOrEqual(SHELL.maxZ);
    }
    for (let i = 0; i < FLOOR_OBSTACLES.length; i++)
      for (let j = i + 1; j < FLOOR_OBSTACLES.length; j++) {
        const a = FLOOR_OBSTACLES[i];
        const b = FLOOR_OBSTACLES[j];
        const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
  });

  it('the bed has its headboard against a wall and the desk sits under the window', () => {
    const bed = FLOOR_OBSTACLES.find((r) => r.id === 'bed')!;
    // the frame starts 4.5 cm out; the 6 cm headboard behind it stops half a centimetre short of the wall
    expect(bed.minZ - 4 - SHELL.minZ).toBeCloseTo(0.5, 6);
    const desk = FLOOR_OBSTACLES.find((r) => r.id === 'gates-table')!;
    expect(desk.minX).toBeLessThan(WINDOW.x0);
    expect(desk.maxX).toBeGreaterThan(WINDOW.x1);
    expect(ROOM_LAYOUT.rug.w).toBeGreaterThan(200);
  });
});

describe("the dog's route", () => {
  it('every leg keeps a clear corridor (60 cm) through the furniture, and the spots are on open floor', () => {
    expect(DOG_CLEARANCE * 2).toBeGreaterThanOrEqual(60);
    const route = dogRoute();
    expect(route[0]).toBe(route[route.length - 1]); // a loop
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d <= len; d += 2) {
        const x = a.x + ((b.x - a.x) * d) / len;
        const z = a.z + ((b.z - a.z) * d) / len;
        // the last steps up to the perch stand against the spawn table on purpose
        const nearPerch = (a.action === 'perch' || b.action === 'perch') && Math.hypot(x - DOG_PERCH.x, z - DOG_PERCH.z) < DOG_CLEARANCE + 6;
        for (const r of FLOOR_OBSTACLES) {
          if (nearPerch && r.id === 'spawn-table') continue;
          expect(distToRect(x, z, r), `${a.id} → ${b.id} near ${r.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThanOrEqual(DOG_CLEARANCE);
        }
        expect(x - SHELL.minX).toBeGreaterThan(DOG_CLEARANCE);
        expect(SHELL.maxX - x).toBeGreaterThan(DOG_CLEARANCE);
        expect(z - SHELL.minZ).toBeGreaterThan(DOG_CLEARANCE);
        expect(SHELL.maxZ - z).toBeGreaterThan(DOG_CLEARANCE);
      }
    }
  });

  it('has sleep, lie, sit and sniff stops, including the sunny rug, and is deterministic in time', () => {
    const actions = new Set(DOG_PATH.map((id) => DOG_SPOTS[id].action));
    for (const a of ['sleep', 'lie', 'sit', 'sniff'] as const) expect(actions.has(a), a).toBe(true);
    const rug = ROOM_LAYOUT.rug;
    const sun = DOG_SPOTS.rugSun;
    expect(Math.abs(sun.x - rug.x)).toBeLessThan(rug.w / 2);
    expect(Math.abs(sun.z - rug.z)).toBeLessThan(rug.d / 2);
    const p0 = dogPose(0);
    expect(p0.action).toBe('sleep');
    const a = dogPose(123.4);
    const b = dogPose(123.4 + p0.loop);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
    expect(b.action).toBe(a.action);
    // walking poses move along the route at the walking pace
    let moving = 0;
    for (let t = 0; t < p0.loop; t += 0.5) if (dogPose(t).moving) moving++;
    expect(moving).toBeGreaterThan(10);
  });

  it('the stand-in dog stays below the table tops, out of the toys\' view of the hub', () => {
    expect(FLOOR_Y + DOG_SIZE.head).toBeLessThan(-TABLE.thickness - 10);
  });

  it('leaves slots for the generated dog, cat and plant models', () => {
    expect(GLB_SLOTS.dog.path).toBe(DOG_PATH);
    expect(GLB_SLOTS.cat.asset).toBe('room-cat-sleeping');
    expect(GLB_SLOTS.plant.asset).toBe('room-plant-fiddle-leaf');
  });
});
