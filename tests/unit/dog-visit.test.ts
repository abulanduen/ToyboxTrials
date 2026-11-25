/* The dog's visits to the spawn table: its route and shared clock (src/game/dogRoute.ts) and this page's side (src/game/dogVisit.ts). */
import { beforeEach, describe, expect, it } from 'vitest';
import { DOG_VISIT, dogOffline, dogVisit, petDog, setDogLoopTime } from '../../src/game/dogVisit';
import { DOG_LOOP, dogPerched, dogPet, dogTime, newDogClock, settleDog } from '../../src/game/dogRoute';
import { DOG_PERCH, DOG_SPOTS, ROOM_LAYOUT, dogArrivalTime, dogPose } from '../../src/scene/room/roomLayout';
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

describe('the shared clock (src/game/dogRoute.ts)', () => {
  const PERCH_AT = dogArrivalTime('perch')!;
  const HOLD = DOG_SPOTS.perch.hold;
  /** A clock that has the dog `into` seconds into its perch at clock time 1000. */
  const atPerch = (into: number) => newDogClock(PERCH_AT + into - 1000);

  it('matches the room it walks in (spawn table front edge, the dog bed)', () => {
    expect(DOG_SPOTS.perch.z).toBe(TABLE.maxZ + 4);
    expect([DOG_SPOTS.bed.x, DOG_SPOTS.bed.z]).toEqual([ROOM_LAYOUT.dogBed.x, ROOM_LAYOUT.dogBed.z]);
    expect(DOG_LOOP).toBeCloseTo(dogPose(0).loop, 9);
  });
  it('can be petted only up at the table, from half a second after it stands up', () => {
    expect(dogPerched(1000, atPerch(0.2))).toBe(false);
    expect(dogPerched(1000, atPerch(DOG_VISIT.ready + 0.1))).toBe(true);
    expect(dogPet(1000, atPerch(-3))).toBeNull(); // still walking up
    expect(dogPet(1000, atPerch(HOLD + 2))).toBeNull(); // gone
  });
  it('leaves on time when nobody pets it', () => {
    const c = atPerch(1);
    expect(dogPose(dogTime(1000 + HOLD - 1.5, c)).action).toBe('perch');
    expect(dogPose(dogTime(1000 + HOLD, c)).action).toBe('walk');
  });
  it('stays 10 s after the last pet, then strolls on from where it stood (no jump)', () => {
    const c = atPerch(8); // 2 s of its own hold left
    expect(dogPet(1000, c)).toBe('pet');
    expect(dogPet(1005, c)).toBe('pet'); // keeps it until 1015
    expect(dogPose(dogTime(1012, c)).action).toBe('perch');
    expect(dogPose(dogTime(1014.9, c)).action).toBe('perch');
    const end = dogTime(1015, c);
    expect(dogTime(1014.99, c)).toBeCloseTo(end, 3);
    expect(dogTime(1016, c) - end).toBeCloseTo(1, 6); // time runs on from there
    expect(dogPose(dogTime(1016, c)).action).toBe('walk');
    // folding the finished hold into the offset changes nothing
    const before = dogTime(1030, c);
    settleDog(1030, c);
    expect(c.lastPet).toBe(0);
    expect(dogTime(1030, c)).toBeCloseTo(before, 9);
  });
  it('a pet early in its visit does not cut its own 10 s short', () => {
    const c = atPerch(1);
    dogPet(1000, c); // the dog's own hold ends at 1009; the pet keeps it to 1010
    expect(dogPose(dogTime(1009.5, c)).action).toBe('perch');
    expect(dogPose(dogTime(1010.5, c)).action).toBe('walk');
  });
  it('the tenth pet of a visit is a lick and the count starts again; a new visit starts from nothing', () => {
    const c = atPerch(1);
    const got = Array.from({ length: DOG_VISIT.petsToLick }, (_, i) => dogPet(1000 + i * 0.3, c));
    expect(got.slice(0, 9).every((r) => r === 'pet')).toBe(true);
    expect(got[9]).toBe('lick');
    expect(c.pets).toBe(0);
    expect(dogPet(1003, c)).toBe('pet');
    expect(c.pets).toBe(1);
    // let it go, then pet it on its next visit: the count is fresh
    const next = 1013 + 1 + (DOG_LOOP - HOLD); // past this hold, round the loop, 1 s into the next perch
    expect(dogPose(dogTime(next, c)).action).toBe('perch');
    expect(dogPet(next, c)).toBe('pet');
    expect(c.pets).toBe(1);
  });
});

describe('petting the dog on this page (offline)', () => {
  beforeEach(() => {
    dogOffline();
    dogVisit.hearts.length = 0;
    dogVisit.lickAt = -1e9;
    setDogLoopTime(dogArrivalTime('perch')! + 1);
  });
  it('only while it is up at the table', () => {
    dogVisit.perched = false;
    expect(petDog()).toBeNull();
    dogVisit.perched = true;
    expect(petDog()).toBe('pet');
    expect(dogVisit.hearts.length).toBe(1);
    expect(dogVisit.pets).toBe(1);
  });
  it('every pet shows a heart; the tenth earns a lick', () => {
    dogVisit.perched = true;
    const got = Array.from({ length: DOG_VISIT.petsToLick }, () => petDog());
    expect(got[9]).toBe('lick');
    expect(dogVisit.lickAt).toBeGreaterThan(0);
    expect(dogVisit.pets).toBe(0);
    expect(dogVisit.hearts.length).toBeLessThanOrEqual(8);
  });
});
