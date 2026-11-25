/**
 * The Hub's signposts (positions: layout.ts SIGNPOSTS): wooden fingerposts with an arrow board per
 * destination, drawn by Ambience.tsx (posts and boards) and SignFaces (the painted faces, one merged
 * layer on the shared sign atlas).
 *
 *  - by spawn: the arcade (ride the toy car down; every trial has its machine there), then the
 *    spawn table's buildings;
 *  - at the spawn-table end of the bridge: on to the ball games, back to the plaza;
 *  - on the gates table by the bridge landing: the pitch, the hoop, the jukebox, and back.
 *
 * Pure three.js (no DOM): the unit tests build it.
 */
import { PALETTE } from '../game/palette';
import { BALL, HOOP, PITCH_CENTRE } from '../game/hubPlay';
import { CAR } from '../game/hubRides';
import { Kit } from './kit';
import type { SignAtlas } from './signAtlas';
import { BRIDGE, FOUNTAIN, JUKEBOX, MACHINES, PAVILION, SCOREBOARD, SHOP, SIGNPOSTS, WORKSHOP, frontOf, type SignpostId } from './layout';

const P = PALETTE;

/** Signpost arrow boards: size, vertical spacing and the height of the lowest. */
export const POST_BOARD = { len: 7, h: 1.3, step: 1.5, y0: 2.6 };

export interface PostBoard {
  label: string;
  sub: string;
  accent: string;
  /** Yaw of the board (its arrow points along local +x). */
  rotY: number;
  y: number;
}
export interface Signpost {
  id: SignpostId;
  x: number;
  z: number;
  boards: PostBoard[];
}

/** Height of a signpost's pole for a number of boards (the collider tops in layout.ts match). */
export const signpostTop = (boards: number) => POST_BOARD.y0 + (boards - 1) * POST_BOARD.step + 1.2;

/** Every signpost and its boards, lowest first (the lowest are in view at toy height). */
export function signposts(): Signpost[] {
  const ballGames = { label: 'Ball games', sub: 'Football · basketball · over the bridge', accent: P.toyBlue, x: BRIDGE.x, z: PITCH_CENTRE.z };
  const lists: Record<SignpostId, { label: string; sub: string; accent: string; x: number; z: number }[]> = {
    spawn: [
      { label: 'Arcade', sub: `All ${MACHINES.length} trials · ride the toy car down`, accent: P.honey, x: CAR.x, z: CAR.boardZ },
      { label: 'Scoreboard', sub: 'Records · secrets', accent: P.coral, ...frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 3) },
      { label: 'Pavilion', sub: 'Tournaments', accent: P.inkPurple, ...frontOf(PAVILION.x, PAVILION.z, PAVILION.rot, PAVILION.d / 2) },
      { label: 'Workshop', sub: 'Paint · hats · keys', accent: P.toyBlue, ...frontOf(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, 5) },
      { label: 'Odds & Ends', sub: 'Shop', accent: P.sage, ...frontOf(SHOP.x, SHOP.z, SHOP.rot, 8) },
    ],
    'bridge-hub': [ballGames, { label: 'Plaza', sub: 'Arcade · Pavilion · shop', accent: P.coral, x: FOUNTAIN.x, z: FOUNTAIN.z }],
    gates: [
      { label: 'Football', sub: 'Kick the giant marble', accent: P.coral, x: PITCH_CENTRE.x, z: PITCH_CENTRE.z },
      { label: 'Basketball', sub: 'Shoot a basket', accent: P.toyBlue, x: (BALL.spot.x + HOOP.x) / 2, z: (BALL.spot.z + HOOP.z) / 2 },
      { label: 'Jukebox', sub: 'Pick the music', accent: P.sage, x: JUKEBOX.x, z: JUKEBOX.z },
      { label: 'Back to the plaza', sub: 'Over the bridge', accent: P.honey, x: BRIDGE.x, z: BRIDGE.deckB },
    ],
  };
  return (Object.keys(lists) as SignpostId[]).map((id) => {
    const post = SIGNPOSTS[id];
    return {
      id,
      x: post.x,
      z: post.z,
      boards: lists[id].map((t, i) => ({ label: t.label, sub: t.sub, accent: t.accent, rotY: Math.atan2(-(t.z - post.z), t.x - post.x), y: POST_BOARD.y0 + i * POST_BOARD.step })),
    };
  });
}

/** The spawn signpost's boards. */
export const fingerpostBoards = () => signposts().find((p) => p.id === 'spawn')!.boards;

/** Painted faces of every signpost board, into the decal layer. */
export function buildSignFaces(k: Kit, atlas: SignAtlas) {
  k.with('decal', () => {
    const L = POST_BOARD.len;
    for (const post of signposts()) {
      for (const b of post.boards) {
        k.push(post.x, b.y, post.z, b.rotY);
        const cx = L / 2 + 0.2 - 0.35;
        // the front reads left → right with the point on the right; so does the back
        k.quad(L - 0.9, POST_BOARD.h - 0.15, cx, 0, 0.22, atlas.board({ title: b.label, sub: b.sub, accent: b.accent, arrow: 'right' }));
        k.quad(L - 0.9, POST_BOARD.h - 0.15, cx, 0, -0.22, atlas.board({ title: b.label, sub: b.sub, accent: b.accent, arrow: 'left' }), '#ffffff', { ry: Math.PI });
        k.pop();
      }
    }
  });
}
