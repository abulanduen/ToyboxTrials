/**
 * Hoop Clash court geometry (pure numbers, 1 unit = 1 cm, table top y = 0). The court runs along x:
 * hoop 0 at the west (−x) end facing east, hoop 1 at the east (+x) end facing west. Red attacks
 * the east hoop in the first half, Blue the west; they switch at halftime. The camera watches from
 * the south (+z) sideline, so "forward" on the stick is north (−z), as everywhere else.
 */
import type { Collider } from '../../game/collision';
import { BOARD, type CourtHoop, type CourtSpec } from '../shared/courtBall';

export const COURT = {
  /** Half the length (baseline to baseline) and half the width (sideline to sideline). */
  halfL: 36,
  halfW: 21,
  /** The rim's centre stands this far inside the baseline. */
  rimIn: 4,
  /** The 3-point arc's radius around each rim (cm, measured to the shooter's feet). */
  three: 18,
  centreR: 4.5,
  /** The painted key: half its width and its length from the baseline. */
  keyHalfW: 4.2,
  keyLen: 12,
  /** The line paint's width. */
  line: 0.32,
} as const;

/** Where toys may walk: the court plus a strip around it (inbounders stand out there). */
export const MOVE_BOUNDS = { minX: -(COURT.halfL + 6), maxX: COURT.halfL + 6, minZ: -(COURT.halfW + 5), maxZ: COURT.halfW + 5 };
/** The stands the ball bounces off. */
export const STANDS = { minX: -(COURT.halfL + 9), maxX: COURT.halfL + 9, minZ: -(COURT.halfW + 8), maxZ: COURT.halfW + 8 };

const RIM_X = COURT.halfL - COURT.rimIn;
export const HOOPS: readonly CourtHoop[] = [
  { x: -RIM_X, z: 0, dx: 1, dz: 0 },
  { x: RIM_X, z: 0, dx: -1, dz: 0 },
];
/** The stanchion stands behind the baseline; an arm reaches over to the backboard. */
export const POST = { back: COURT.rimIn + 2.4, r: 0.65, top: BOARD.y - BOARD.h / 2 };
export const postOf = (h: CourtHoop) => ({ x: h.x - h.dx * POST.back, z: h.z - h.dz * POST.back });

export const COURT_SPEC: CourtSpec = {
  hoops: HOOPS,
  posts: HOOPS.map((h) => ({ ...postOf(h), r: POST.r, top: POST.top })),
  walls: STANDS,
};

/** The stanchions are solid to toys too. */
export const SOLIDS: readonly Collider[] = HOOPS.map((h, i) => ({ kind: 'circle' as const, id: `post-${i}`, ...postOf(h), r: POST.r, top: POST.top }));

export const TEAMS = ['Red', 'Blue'] as const;
export type Team = 0 | 1;

/** Inside the painted lines (the line itself is in), with an optional margin. */
export const inCourt = (x: number, z: number, margin = 0) => Math.abs(x) <= COURT.halfL + margin && Math.abs(z) <= COURT.halfW + margin;

/** Horizontal distance from (x, z) to a hoop's rim. */
export const distToRim = (x: number, z: number, h: CourtHoop) => Math.hypot(x - h.x, z - h.z);

/** How far round from straight out in front of a hoop (radians, signed) a point stands. */
export const offAxis = (h: CourtHoop, p: { x: number; z: number }) => Math.atan2(h.dx * (p.z - h.z) - h.dz * (p.x - h.x), h.dx * (p.x - h.x) + h.dz * (p.z - h.z));

/** Is a shot from (x, z) at hoop `h` worth three (feet beyond the arc)? */
export const isThree = (x: number, z: number, h: CourtHoop) => distToRim(x, z, h) > COURT.three;
