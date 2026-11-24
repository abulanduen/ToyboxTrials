/**
 * Online own-toy prediction for Inferno Escape (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * Without it a held direction only turned and moved your toy a network round trip later. Your
 * client replays its own not-yet-stepped inputs on the newest server state with the rules' own
 * timing (and the server's held-input repeat, ../shared/predictGrid.ts): a direction turns the toy
 * at once and moves it one tile every `moveMs` onto open floor, and breaking clears the rock (or your
 * own wall) in front of it every `breakMs`. Building, the furnace and the other toys stay as the
 * server sends them. Tiles are a grid, so a correction is just the server's tile; no fading is needed
 * (a move guessed near the moment you let go is kept until the server makes it: GridSettle).
 */
import { ahead, index, tileAt, type InfernoInput, type InfernoState } from './rules';
import { GridSettle, HOP_SLACK_MS, replayHeld } from '../shared/predictGrid';
import type { PredictFrame } from '../types';

const settle = new GridSettle();

export function predictInferno(s: InfernoState, localId: string, frames: readonly PredictFrame<InfernoInput>[], skipMs = 0, held: readonly InfernoInput[] = []): InfernoState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  if (s.phase === 'over' || !me || !me.alive) {
    settle.reset();
    return null;
  }

  const p = { ...me };
  let tiles: InfernoState['tiles'] | null = null; // copied on the first predicted break
  const view = () => (tiles ? { ...s, tiles } : s);
  const occupied = (x: number, z: number) => s.players.some((q) => q.id !== localId && q.alive && q.x === x && q.z === z);

  // As the rules' step does for one player's inputs.
  replayHeld(s.t, frames, skipMs, held, (t, inputs) => {
    for (const input of inputs) {
      if (input.direction !== undefined && Number.isInteger(input.direction) && input.direction >= 0 && input.direction < 4) {
        p.facing = input.direction;
        if (t >= p.nextMove + HOP_SLACK_MS) {
          p.nextMove = t + s.config.moveMs;
          const a = ahead(p);
          if (tileAt(view(), a.x, a.z) === 'floor' && !occupied(a.x, a.z)) {
            p.x = a.x;
            p.z = a.z;
          }
        }
      }
      if (input.action === 'break' && t >= p.nextBreak) {
        const a = ahead(p);
        const tile = tileAt(view(), a.x, a.z);
        if (tile === 'rock' || (tile === 'wall' && s.wallOwners[index(a.x, a.z)] === localId)) {
          tiles ??= s.tiles.slice();
          tiles[index(a.x, a.z)] = 'floor';
          p.nextBreak = t + s.config.breakMs;
        }
      }
    }
  });
  const cell = settle.settle(localId, me, p);
  p.x = cell.x;
  p.z = cell.z;
  if (!tiles && p.x === me.x && p.z === me.z && p.facing === me.facing) return null;
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players, ...(tiles ? { tiles } : {}) };
}
