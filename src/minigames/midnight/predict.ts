/**
 * Online own-toy prediction for Midnight Hunger (see `predictLocal` in ../types.ts and ../remote.ts).
 *
 * Without it a held direction only moved your toy (and turned it) a network round trip later. Your
 * client replays its own not-yet-stepped inputs on the newest server state with the rules' own
 * timing (and the server's held-input repeat, ../shared/predictGrid.ts): a held direction turns the
 * toy at once and hops it one cell every `moveMs`, into an empty cell on the board. A step into
 * another toy (a push, which that toy may resist) waits for the server, as do batteries, energy and
 * everybody else. Toys hop from cell to cell, so a correction is just the server's cell; no fading
 * is needed (a hop guessed near the moment you let go is kept until the server makes it: GridSettle).
 */
import { DIRECTIONS, SIZE, type Direction, type HungerInput, type HungerState } from './rules';
import { GridSettle, HOP_SLACK_MS, replayHeld } from '../shared/predictGrid';
import type { PredictFrame } from '../types';

const STEP_MS = 1000 / 60;
const settle = new GridSettle();

export function predictHunger(s: HungerState, localId: string, frames: readonly PredictFrame<HungerInput>[], skipMs = 0, held: readonly HungerInput[] = []): HungerState | null {
  const i = s.players.findIndex((p) => p.id === localId);
  const me = i >= 0 ? s.players[i] : undefined;
  if (s.phase === 'over' || !me || !me.alive) {
    settle.reset();
    return null;
  }

  const p = { ...me };
  const moveMs = s.config.moveMs;
  const blocked = (x: number, z: number) =>
    x < 0 || x >= SIZE || z < 0 || z >= SIZE ||
    (s.phase === 'night' && s.batteries.some((b) => b.caughtBy === null && b.x === x && b.z === z)) ||
    s.players.some((q) => q.id !== localId && q.alive && q.x === x && q.z === z);

  // As the rules' step does for one player's inputs, which it reads at the step's start (`t` is its end).
  replayHeld(s.t, frames, skipMs, held, (end, inputs) => {
    const t = end - STEP_MS;
    for (const input of inputs) {
      if (input.direction === null) p.intent = null;
      else if (input.direction !== undefined && Number.isInteger(input.direction) && input.direction >= 0 && input.direction < 4) {
        p.intent = input.direction as Direction;
        p.facing = input.direction as Direction;
        p.intentUntil = t + moveMs * 3;
      }
    }
    if (p.intent === null || t < p.nextMove + HOP_SLACK_MS || p.intentUntil <= t) return;
    if (!inputs.some((input) => input.direction === p.intent)) return;
    p.nextMove = t + moveMs;
    const [dx, dz] = DIRECTIONS[p.intent];
    if (blocked(p.x + dx, p.z + dz)) return;
    p.x += dx;
    p.z += dz;
  });
  const cell = settle.settle(localId, me, p);
  p.x = cell.x;
  p.z = cell.z;
  if (p.x === me.x && p.z === me.z && p.facing === me.facing) return null;
  const players = s.players.slice();
  players[i] = p;
  return { ...s, players };
}
