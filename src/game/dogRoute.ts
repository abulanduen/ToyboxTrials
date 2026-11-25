/**
 * The family dog's stroll round the room, and the clock that drives it, as pure data and functions
 * (no three.js, no DOM) so the online server can run the same dog as every player in its room.
 *
 * The route: an ordered list of spots on the floor (1 unit = 1 cm). The dog walks between them at
 * DOG_SPEED and does each spot's action for its `hold` seconds; once a loop it stands up at the spawn
 * table's front edge (the perch), where toys can pet it. src/scene/room/roomLayout.ts re-exports the
 * route next to the furniture (its unit tests check the route keeps clear of it), and
 * src/scene/room/RoomDog.tsx draws the dog.
 *
 * The clock (DogClock): where the dog is in its loop is `dogTime(now, clock)`, seconds on whatever
 * clock owns the dog: the page's own clock offline, the server's clock online (every player in a
 * room then sees the same dog). Petting holds it at the perch until DOG_VISIT.stay seconds after
 * the last pet: `dogPet` records that in the clock, and `dogTime` keeps the dog there and then
 * carries on from where it stopped. No per-frame state, so the server only has to step it when
 * someone pets the dog, and every client agrees on it from the same few numbers.
 */

export type DogAction = 'walk' | 'sniff' | 'sit' | 'lie' | 'sleep' | 'perch';
export interface DogSpot {
  id: string;
  x: number;
  z: number;
  action: DogAction;
  /** Seconds spent doing it. */
  hold: number;
}

/** The spawn table's front edge (TABLE.maxZ in src/scene/layout.ts; a unit test keeps them equal). */
const SPAWN_TABLE_FRONT = 46;

/** Named places on the dog's route (floor xz, cm). */
export const DOG_SPOTS: Record<string, DogSpot> = {
  // its bed (roomLayout ROOM_LAYOUT.dogBed; a unit test keeps them equal)
  bed: { id: 'bed', x: -168, z: 166, action: 'sleep', hold: 14 },
  westLane: { id: 'westLane', x: -153, z: 85, action: 'walk', hold: 0 },
  bookshelf: { id: 'bookshelf', x: -153, z: -112, action: 'sniff', hold: 4 },
  rugSun: { id: 'rugSun', x: -30, z: 112, action: 'lie', hold: 9 },
  toyChest: { id: 'toyChest', x: 30, z: 180, action: 'sniff', hold: 3 },
  eastLane: { id: 'eastLane', x: 132, z: 105, action: 'walk', hold: 0 },
  byTheBed: { id: 'byTheBed', x: 150, z: -55, action: 'sit', hold: 6 },
  rugMid: { id: 'rugMid', x: 40, z: 150, action: 'walk', hold: 0 },
  // up on its hind legs at the spawn table's front edge, looking over at the toys (toys can pet it)
  perch: { id: 'perch', x: -30, z: SPAWN_TABLE_FRONT + 4, action: 'perch', hold: 10 },
};

/**
 * The perch: the dog stands up at the spawn table's front edge with its front paws on the table and
 * its head over it. `pet` is where a toy stands to pet it (on walkable ground, just inside the
 * table's front edge). A perch lasts `hold` seconds, or until DOG_VISIT.stay s after the last pet.
 */
export const DOG_PERCH = { x: DOG_SPOTS.perch.x, z: DOG_SPOTS.perch.z, heading: Math.PI, pet: { x: DOG_SPOTS.perch.x, z: 33 } };

/**
 * DOG_PATH: the dog's loop, as an ordered list of spot ids (a polyline over the floor that may
 * revisit spots). From its bed, up the west side to sniff at the bookshelf, back and across the
 * rug to lie in the sun patch in front of the spawn table, past the toy chest, up the east side to
 * sit by the bed, and home across the rug. Every leg keeps DOG_CLEARANCE from all furniture, except
 * the last steps up to the perch, where it stands against the spawn table on purpose.
 */
export const DOG_PATH: string[] = ['bed', 'westLane', 'bookshelf', 'westLane', 'rugSun', 'perch', 'toyChest', 'eastLane', 'byTheBed', 'eastLane', 'rugMid', 'bed'];
/** Half of the corridor the dog needs (a ~50 cm tall pit bull needs 60–80 cm of floor to pass). */
export const DOG_CLEARANCE = 30;
/** Walking speed of the stand-in (cm/s): a slow amble. */
export const DOG_SPEED = 38;

/** The route as points, in order. */
export const dogRoute = () => DOG_PATH.map((id) => DOG_SPOTS[id]);

/** Seconds into the loop at which the dog arrives at spot `id` (its first visit), or null. */
export function dogArrivalTime(id: string): number | null {
  const route = dogRoute();
  let t = 0;
  for (let i = 0; i < route.length - 1; i++) {
    if (route[i].id === id) return t;
    t += route[i].hold + Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z) / DOG_SPEED;
  }
  return null;
}

/**
 * Where the dog is `t` seconds into its loop: position, heading and what it is doing.
 * Pure (deterministic in t), so the scene, the server and the tests agree.
 */
export function dogPose(t: number) {
  const route = dogRoute();
  const legs: { a: DogSpot; b: DogSpot; len: number }[] = [];
  for (let i = 0; i < route.length - 1; i++) legs.push({ a: route[i], b: route[i + 1], len: Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z) });
  const total = legs.reduce((s, l) => s + l.a.hold + l.len / DOG_SPEED, 0);
  let k = ((t % total) + total) % total;
  for (const l of legs) {
    const heading = Math.atan2(l.b.x - l.a.x, l.b.z - l.a.z);
    if (k < l.a.hold) {
      // a perch faces the table (whatever way the next leg goes)
      const h = l.a.action === 'perch' ? DOG_PERCH.heading : heading;
      return { x: l.a.x, z: l.a.z, heading: h, action: l.a.action, moving: false, loop: total, holdLeft: l.a.hold - k };
    }
    k -= l.a.hold;
    const walk = l.len / DOG_SPEED;
    if (k < walk) {
      const f = k / walk;
      return { x: l.a.x + (l.b.x - l.a.x) * f, z: l.a.z + (l.b.z - l.a.z) * f, heading, action: 'walk' as DogAction, moving: true, loop: total, holdLeft: 0 };
    }
    k -= walk;
  }
  const last = route[route.length - 1];
  return { x: last.x, z: last.z, heading: 0, action: last.action, moving: false, loop: total, holdLeft: 0 };
}

/** The length of one loop (s). */
export const DOG_LOOP = dogPose(0).loop;
const PERCH_AT = dogArrivalTime('perch')!;

// ---------------------------------------------------------------- the clock and petting

export const DOG_VISIT = {
  /** Pets that earn a lick. */
  petsToLick: 10,
  /** The dog stays this long after the last pet (s). (Tests on slow renderers may raise it.) */
  stay: 10,
  /** It can be petted this long after it stands up (s). */
  ready: 0.5,
  /** How close a toy must be to the pet spot (cm): the Pet prompt's reach, with a little slack for lag. */
  reach: 9,
};

/**
 * Everything that says where the dog is and how its visit is going, in seconds on the owning clock.
 * Natural loop time is `now + offset`; until DOG_VISIT.stay s after the last pet the dog can't pass
 * `perchEnd` (the end of this visit's perch, in natural loop time), and then carries on from there.
 */
export interface DogClock {
  offset: number;
  /** When (clock s) it was last petted this visit, or 0 (the clocks start well above 0). */
  lastPet: number;
  /** The end of the held perch, in natural loop time (`now + offset` units). */
  perchEnd: number;
  /** Pets this visit (towards a lick), and which visit (loop number) they count for. */
  pets: number;
  visit: number;
}

export const newDogClock = (offset = 0): DogClock => ({ offset, lastPet: 0, perchEnd: 0, pets: 0, visit: -1 });

/** Until when (clock s) the last pet keeps the dog at the perch, or 0. */
const holdUntil = (c: DogClock) => (c.lastPet > 0 ? c.lastPet + DOG_VISIT.stay : 0);

/** How far behind the natural loop a finished hold has left the dog (s), at `now`. */
function heldBack(now: number, c: DogClock): number {
  const until = holdUntil(c);
  if (until <= 0 || now < until) return 0;
  // the real time at which the natural loop reached the perch's end, and how long past it the dog stayed
  return Math.max(0, until - (c.perchEnd - c.offset));
}

/** Seconds into the dog's loop (unwrapped: dogPose wraps it) at clock time `now`. */
export function dogTime(now: number, c: DogClock): number {
  const natural = now + c.offset;
  const until = holdUntil(c);
  if (until > 0 && now < until) return Math.min(natural, c.perchEnd);
  return natural - heldBack(now, c);
}

/** Fold a finished hold into the offset (the dog's time doesn't change). Keeps the numbers small. */
export function settleDog(now: number, c: DogClock) {
  const until = holdUntil(c);
  if (until > 0 && now >= until) {
    c.offset -= heldBack(now, c);
    c.lastPet = 0;
    c.perchEnd = 0;
  }
}

/** Is the dog up at the perch and ready to be petted at `now`? */
export function dogPerched(now: number, c: DogClock): boolean {
  const t = dogTime(now, c);
  const k = ((t % DOG_LOOP) + DOG_LOOP) % DOG_LOOP;
  return dogPose(t).action === 'perch' && k - PERCH_AT >= DOG_VISIT.ready;
}

/**
 * A toy pets the dog at clock time `now`. Returns what happened ('lick' every petsToLick pets in a
 * visit), or null if it isn't perched and ready. Updates the clock so the dog stays.
 */
export function dogPet(now: number, c: DogClock): 'pet' | 'lick' | null {
  if (!dogPerched(now, c)) return null;
  settleDog(now, c);
  const t = dogTime(now, c);
  const visit = Math.floor(t / DOG_LOOP);
  if (visit !== c.visit) {
    c.visit = visit;
    c.pets = 0;
  }
  // the end of this perch, a hair early so the hold never reads as the walk away
  c.perchEnd = visit * DOG_LOOP + PERCH_AT + DOG_SPOTS.perch.hold - 0.05;
  c.lastPet = now;
  // (dogTime is unchanged by this: the dog was short of perchEnd, and the hold only stops it there)
  c.pets++;
  if (c.pets >= DOG_VISIT.petsToLick) {
    c.pets = 0;
    return 'lick';
  }
  return 'pet';
}
