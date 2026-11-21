/**
 * The bedroom around the two tables, as data: where the furniture stands on the floor, the family
 * dog's walking route, and the slots generated GLB models will fill later (dog, cat, plant; see
 * public/assets/asset-manifest.json). Furniture.tsx builds the code-built room from these numbers;
 * the unit tests check the dog's route keeps a clear corridor through it.
 *
 * Room layer (lifelike, baked lighting). 1 unit = 1 cm; the floor is at FLOOR_Y (the table tops are
 * at y = 0). The window is in the back wall (−z), the door in the left wall (−x), the usual
 * camera side is +z.
 */
import { TABLE, TABLE_B } from '../layout';
import { SHELL } from './bake';

/** A footprint on the floor, in world cm. */
export interface FloorRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const rect = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): FloorRect => ({ id, minX, maxX, minZ, maxZ });

/** Furniture positions (cm). Furniture.tsx reads these. */
export const ROOM_LAYOUT = {
  /** Bed: headboard against the window wall in the right-hand corner. */
  bed: { x: 244, z: SHELL.minZ + 104.5, w: 110, len: 200 },
  /** Bedside table with a lamp, between the desk and the bed. */
  nightstand: { x: 165, z: SHELL.minZ + 21, w: 38, d: 36, h: 58 },
  /** Chest of drawers against the right wall. */
  drawers: { x: SHELL.maxX - 23, z: 90, w: 100, d: 46, h: 92 },
  /** Toy chest against the wall behind the usual camera. */
  toyChest: { x: 30, z: SHELL.maxZ - 24, w: 100, d: 44, h: 50 },
  beanbag: { x: 120, z: 210, r: 33 },
  /** Cube storage with the teddy on top (front-left). */
  cubes: { x: -150, z: SHELL.maxZ - 19.5 },
  /** Play-table chair, tucked in on the spawn table's west side. */
  chair: { x: -102, z: -6, ry: Math.PI / 2 },
  /** Rug in front of the spawn table (the dog's sunny spot is on it). */
  rug: { x: 0, z: 138, w: 300, d: 140 },
  /** Dog bed: a round cushion near the cube storage. */
  dogBed: { x: -168, z: 166, r: 36 },
  waterBowl: { x: -118, z: 214 },
  slippers: { x: 176, z: 34 },
  /** Front-right corner: moving boxes, and the houseplant beside the chest of drawers. */
  boxes: { x: 262, z: 226 },
  plant: { x: 276, z: 176 },
  floorLamp: { x: 168, z: SHELL.maxZ - 34 },
};

const L = ROOM_LAYOUT;
/** Everything standing on the floor that the dog must walk round (room furniture and table legs). */
export const FLOOR_OBSTACLES: FloorRect[] = [
  rect('spawn-table', TABLE.minX, TABLE.maxX, TABLE.minZ, TABLE.maxZ),
  rect('gates-table', TABLE_B.minX, TABLE_B.maxX, TABLE_B.minZ, TABLE_B.maxZ),
  rect('bookshelf', -168, -80, SHELL.minZ, SHELL.minZ + 33),
  rect('wardrobe', SHELL.minX, SHELL.minX + 58, -180, -76),
  rect('chair', L.chair.x - 20, L.chair.x + 20, L.chair.z - 21, L.chair.z + 21),
  rect('bed', L.bed.x - L.bed.w / 2, L.bed.x + L.bed.w / 2, L.bed.z - L.bed.len / 2, L.bed.z + L.bed.len / 2),
  rect('nightstand', L.nightstand.x - L.nightstand.w / 2, L.nightstand.x + L.nightstand.w / 2, L.nightstand.z - L.nightstand.d / 2, L.nightstand.z + L.nightstand.d / 2),
  rect('drawers', L.drawers.x - L.drawers.d / 2, L.drawers.x + L.drawers.d / 2, L.drawers.z - L.drawers.w / 2, L.drawers.z + L.drawers.w / 2),
  rect('toy-chest', L.toyChest.x - L.toyChest.w / 2, L.toyChest.x + L.toyChest.w / 2, L.toyChest.z - L.toyChest.d / 2, L.toyChest.z + L.toyChest.d / 2),
  rect('beanbag', L.beanbag.x - L.beanbag.r, L.beanbag.x + L.beanbag.r, L.beanbag.z - L.beanbag.r, L.beanbag.z + L.beanbag.r),
  rect('cubes', -200, -100, SHELL.maxZ - 38, SHELL.maxZ),
  rect('boxes', 230, SHELL.maxX, 200, SHELL.maxZ),
  rect('plant', L.plant.x - 18, L.plant.x + 18, L.plant.z - 18, L.plant.z + 18),
  rect('floor-lamp', L.floorLamp.x - 15, L.floorLamp.x + 15, L.floorLamp.z - 15, L.floorLamp.z + 15),
];

/** What the dog does when it reaches a spot. */
export type DogAction = 'walk' | 'sniff' | 'sit' | 'lie' | 'sleep' | 'perch';
export interface DogSpot {
  id: string;
  x: number;
  z: number;
  action: DogAction;
  /** Seconds spent doing it. */
  hold: number;
}

/** Named places on the dog's route (floor xz, cm). */
export const DOG_SPOTS: Record<string, DogSpot> = {
  bed: { id: 'bed', x: L.dogBed.x, z: L.dogBed.z, action: 'sleep', hold: 14 },
  westLane: { id: 'westLane', x: -153, z: 85, action: 'walk', hold: 0 },
  bookshelf: { id: 'bookshelf', x: -153, z: -112, action: 'sniff', hold: 4 },
  rugSun: { id: 'rugSun', x: -30, z: 112, action: 'lie', hold: 9 },
  toyChest: { id: 'toyChest', x: 30, z: 180, action: 'sniff', hold: 3 },
  eastLane: { id: 'eastLane', x: 132, z: 105, action: 'walk', hold: 0 },
  byTheBed: { id: 'byTheBed', x: 150, z: -55, action: 'sit', hold: 6 },
  rugMid: { id: 'rugMid', x: 40, z: 150, action: 'walk', hold: 0 },
  // up on its hind legs at the spawn table's front edge, looking over at the toys (toys can pet it)
  perch: { id: 'perch', x: -30, z: TABLE.maxZ + 4, action: 'perch', hold: 10 },
};

/**
 * The perch: the dog stands up at the spawn table's front edge with its front paws on the table and
 * its head over it. `pet` is where a toy stands to pet it (on walkable ground, just inside the
 * table's front edge). A perch lasts `hold` seconds, or until 10 s after the last pet.
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

/** Shortest distance from a point to a floor rectangle (0 inside). */
export function distToRect(x: number, z: number, r: FloorRect) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

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
 * Where the stand-in dog is `t` seconds into its loop: position, heading and what it is doing.
 * Pure (deterministic in t), so the scene and the tests agree.
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

/**
 * Slots for the generated room-layer models (GLB, lazy-loaded, recorded in the asset manifest).
 * Until they exist the code-built placeholders stand here.
 */
export const GLB_SLOTS = {
  /** room-dog-pitbull: walks DOG_PATH; the code-built stand-in is RoomDog.tsx. */
  dog: { asset: 'room-dog-pitbull', path: DOG_PATH },
  /** room-cat-sleeping: curled on the beanbag. */
  cat: { asset: 'room-cat-sleeping', x: L.beanbag.x - 4, z: L.beanbag.z + 2 },
  /** room-plant-fiddle-leaf: replaces the code-built plant in the front-right corner. */
  plant: { asset: 'room-plant-fiddle-leaf', x: L.plant.x, z: L.plant.z },
};
