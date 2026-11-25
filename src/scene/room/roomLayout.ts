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
import { DOG_PATH } from '../../game/dogRoute';

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

// The dog's route and clock are pure data shared with the online server (src/game/dogRoute.ts);
// they are re-exported here, next to the furniture they walk round.
export { DOG_CLEARANCE, DOG_PATH, DOG_PERCH, DOG_SPEED, DOG_SPOTS, dogRoute, type DogAction, type DogSpot } from '../../game/dogRoute';

/** Shortest distance from a point to a floor rectangle (0 inside). */
export function distToRect(x: number, z: number, r: FloorRect) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

export { dogArrivalTime, dogPose } from '../../game/dogRoute';

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
