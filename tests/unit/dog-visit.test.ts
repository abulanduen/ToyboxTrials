/* The dog's visits to the spawn table (src/game/dogVisit.ts, the perch in src/scene/room/roomLayout.ts). */
import { beforeEach, describe, expect, it } from 'vitest';
import { DOG_VISIT, dogVisit, endVisit, perchStay, petDog } from '../../src/game/dogVisit';
import { DOG_PERCH, DOG_SPOTS, dogArrivalTime, dogPose } from '../../src/scene/room/roomLayout';
import { HUB_WALK, isWalkable } from '../../src/game/hubBounds';
import { TABLE } from '../../src/scene/layout';
import { INTERACTABLES } from '../../src/game/interactables';

describe('the dog stands up at the spawn table', () => {
  it('once every loop of its stroll, facing the table, with its pet spot on walkable ground at the front edge', () => {
    const t0 = dogArrivalTime('perch')!;
    expect(t0).toBeGreaterThan(0);
    const p = dogPose(t0 + 1);
    expect(p.action).toBe('perch');
    expect([p.x, p.z]).toEqual([DOG_PERCH.x, DOG_PERCH.z]);
    expect(p.heading).toBeCloseTo(Math.PI, 6); // towards the table (−z)
    expect(p.holdLeft).toBeCloseTo(DOG_SPOTS.perch.hold - 1, 6);
    expect(dogPose(t0 + 1 + p.loop).action).toBe('perch');
    // just in front of the table, on the floor
    expect(DOG_PERCH.z).toBeGreaterThan(TABLE.maxZ);
    expect(DOG_PERCH.z - TABLE.maxZ).toBeLessThan(10);
    // toys can reach the pet spot, right by the table's front edge
    expect(isWalkable(DOG_PERCH.pet.x, DOG_PERCH.pet.z, 0.85)).toBe(true);
    expect(HUB_WALK.maxZ - DOG_PERCH.pet.z).toBeLessThan(4);
    const dog = INTERACTABLES.find((i) => i.id === 'dog')!;
    expect(dog).toMatchObject({ verb: 'Pet', label: 'the dog' });
  });
  it('reads as up at the table from just after it arrives (a pet keeps it there, never back at the boundary)', () => {
    const t0 = dogArrivalTime('perch')!;
    expect(dogPose(t0 + 0.05).action).toBe('perch');
    expect(dogPose(t0 - 0.05).action).toBe('walk');
  });
  it('then strolls on after its 10 s visit', () => {
    const t0 = dogArrivalTime('perch')!;
    expect(dogPose(t0 + DOG_SPOTS.perch.hold + 0.5).action).toBe('walk');
  });
});

describe('petting the dog', () => {
  beforeEach(() => {
    endVisit();
    dogVisit.hearts.length = 0;
    dogVisit.lickAt = -1e9;
  });
  it('only while it is up at the table', () => {
    expect(petDog(1)).toBeNull();
    dogVisit.perched = true;
    expect(petDog(1)).toBe('pet');
    expect(dogVisit.hearts).toEqual([1]);
  });
  it('every pet shows a heart; the tenth earns a lick and the count starts again', () => {
    dogVisit.perched = true;
    const got = Array.from({ length: DOG_VISIT.petsToLick }, (_, i) => petDog(i * 0.3));
    expect(got.slice(0, 9).every((r) => r === 'pet')).toBe(true);
    expect(got[9]).toBe('lick');
    expect(dogVisit.lickAt).toBeCloseTo(2.7, 6);
    expect(dogVisit.pets).toBe(0);
    expect(petDog(3)).toBe('pet');
    expect(dogVisit.hearts.length).toBeLessThanOrEqual(8);
  });
  it('stays 10 s after the last pet, and leaves on time when nobody comes', () => {
    dogVisit.perched = true;
    expect(perchStay(5, 3)).toBe(3); // nobody petted: the stroll's own hold
    petDog(5);
    expect(perchStay(5, 3)).toBe(DOG_VISIT.stay);
    expect(perchStay(12, 0)).toBeCloseTo(3, 6);
    expect(perchStay(16, 0)).toBe(0); // long after the last pet: off it goes
    endVisit();
    expect(dogVisit.pets).toBe(0);
    expect(dogVisit.perched).toBe(false);
  });
});
