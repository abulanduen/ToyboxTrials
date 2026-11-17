/** Inferno Escape: deterministic tile rules. No rendering, timers or device input. */
import { rankByKey } from '../scoring';
import type { MatchEvent, RulesCore } from '../types';

export const SIZE = 11;
export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
export type Direction = 0 | 1 | 2 | 3;
export type Tile = 'floor' | 'rock' | 'wall' | 'edge';
export interface InfernoInput { direction?: Direction; action?: 'break' | 'build' }
export interface InfernoPlayer {
  id: string; x: number; z: number; facing: Direction; alive: boolean;
  wallUsed: boolean; nextMove: number; nextBreak: number; outAt: number;
}
export interface InfernoConfig { prepMs: number; huntMs: number; moveMs: number; breakMs: number; furnaceMs: number; rockMs: number; wallMs: number }
export const DEFAULT_CONFIG: InfernoConfig = { prepMs: 15000, huntMs: 90000, moveMs: 220, breakMs: 500, furnaceMs: 300, rockMs: 900, wallMs: 1800 };
export interface InfernoState {
  config: InfernoConfig; t: number; phase: 'prepare' | 'hunt' | 'over';
  tiles: Tile[]; players: InfernoPlayer[]; furnace: { x: number; z: number };
  nextFurnace: number; events: MatchEvent[];
  wallOwners: Record<number, string>;
  attack: { x: number; z: number; until: number } | null;
}
export const index = (x: number, z: number) => z * SIZE + x;
export const tileAt = (s: InfernoState, x: number, z: number): Tile =>
  x < 0 || z < 0 || x >= SIZE || z >= SIZE ? 'edge' : s.tiles[index(x, z)];
export const ahead = (p: InfernoPlayer) => ({ x: p.x + DIRECTIONS[p.facing][0], z: p.z + DIRECTIONS[p.facing][1] });
const occupied = (s: InfernoState, x: number, z: number) => s.players.some(p => p.alive && p.x === x && p.z === z);

/** Weighted routes include destruction time, so barriers delay rather than stop pursuit. */
export function distances(s: InfernoState, x = s.furnace.x, z = s.furnace.z): number[] {
  const d = Array<number>(SIZE * SIZE).fill(Infinity);
  const visited = new Set<number>(); d[index(x, z)] = 0;
  for (let count = 0; count < d.length; count++) {
    let current = -1;
    for (let i = 0; i < d.length; i++) if (!visited.has(i) && Number.isFinite(d[i]) && (current < 0 || d[i] < d[current])) current = i;
    if (current < 0) break;
    visited.add(current);
    for (const [dx, dz] of DIRECTIONS) {
      const nx = current % SIZE + dx, nz = Math.floor(current / SIZE) + dz;
      const tile = tileAt(s, nx, nz);
      if (tile === 'edge') continue;
      const cost = s.config.furnaceMs + (tile === 'rock' ? s.config.rockMs : tile === 'wall' ? s.config.wallMs : 0);
      d[index(nx, nz)] = Math.min(d[index(nx, nz)], d[current] + cost);
    }
  }
  return d;
}

function build(s: InfernoState, p: InfernoPlayer): boolean {
  const a = ahead(p);
  if (p.wallUsed || s.phase !== 'prepare' || tileAt(s, a.x, a.z) !== 'floor' || occupied(s, a.x, a.z)
    || (a.x === s.furnace.x && a.z === s.furnace.z)) return false;
  s.tiles[index(a.x, a.z)] = 'wall'; s.wallOwners[index(a.x, a.z)] = p.id; p.wallUsed = true;
  s.events.push({ type: 'built', id: p.id }); return true;
}

function catchPlayers(s: InfernoState) {
  for (const p of s.players) if (p.alive && p.x === s.furnace.x && p.z === s.furnace.z) {
    p.alive = false; p.outAt = s.t; s.events.push({ type: 'eliminated', id: p.id });
  }
  if (s.players.filter(p => p.alive).length <= 1) s.phase = 'over';
}

export const infernoRules: RulesCore<InfernoState, InfernoInput, InfernoConfig> = {
  init(contestants, _seed, config) {
    const spawns = [[4, 4], [6, 6], [6, 4], [4, 6], [5, 4], [5, 6], [4, 5], [6, 5]];
    if (contestants.length < 2 || contestants.length > 8) throw new Error('Inferno requires 2–8 contenders.');
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (Object.values(cfg).some(v => !Number.isFinite(v) || v <= 0)) throw new Error('Timings must be positive.');
    const tiles: Tile[] = Array.from({ length: SIZE * SIZE }, (_, i) => {
      const x = i % SIZE, z = Math.floor(i / SIZE);
      if (x === 0 || z === 0 || x === SIZE - 1 || z === SIZE - 1) return 'edge';
      return x >= 4 && x <= 6 && z >= 4 && z <= 6 ? 'floor' : 'rock';
    });
    return { config: cfg, t: 0, phase: 'prepare', tiles, wallOwners: {}, attack: null,
      players: contestants.map((c, i) => ({ id: c.id, x: spawns[i][0], z: spawns[i][1], facing: 2,
        alive: true, wallUsed: false, nextMove: 0, nextBreak: 0, outAt: 0 })),
      furnace: { x: 5, z: 5 }, nextFurnace: cfg.prepMs + cfg.furnaceMs, events: [] };
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    s.t += dtMs;
    if (s.phase === 'prepare' && s.t >= s.config.prepMs) {
      // Unspent walls remain unspent: never silently change a player's shelter at the deadline.
      s.phase = 'hunt'; s.events.push({ type: 'hunt' });
    }
    for (const p of s.players) {
      if (!p.alive) continue;
      for (const input of inputs[p.id] ?? []) {
        if (input.direction !== undefined && Number.isInteger(input.direction) && input.direction >= 0 && input.direction < 4) {
          p.facing = input.direction;
          const a = ahead(p);
          if (s.t >= p.nextMove) {
            p.nextMove = s.t + s.config.moveMs;
            if (tileAt(s, a.x, a.z) === 'floor' && !occupied(s, a.x, a.z)) { p.x = a.x; p.z = a.z; }
          }
        }
        const a = ahead(p);
        if (input.action === 'build') build(s, p);
        if (input.action === 'break' && s.t >= p.nextBreak && (tileAt(s, a.x, a.z) === 'rock' || (tileAt(s, a.x, a.z) === 'wall' && s.wallOwners[index(a.x, a.z)] === p.id))) {
          s.tiles[index(a.x, a.z)] = 'floor'; delete s.wallOwners[index(a.x, a.z)]; p.nextBreak = s.t + s.config.breakMs;
          s.events.push({ type: 'broken', id: p.id });
        }
      }
    }
    if (s.phase === 'hunt') {
      catchPlayers(s);
      if (s.players.filter(p => p.alive).length > 1 && s.t >= s.nextFurnace) {
        s.nextFurnace = s.t + s.config.furnaceMs;
        if (s.attack) {
          const a = s.attack;
          if (tileAt(s, a.x, a.z) === 'floor' || s.t >= a.until) {
            s.tiles[index(a.x, a.z)] = 'floor'; delete s.wallOwners[index(a.x, a.z)];
            s.furnace = { x: a.x, z: a.z }; s.attack = null;
            s.events.push({ type: 'broken', id: 'furnace' });
          }
        } else {
        const d = distances(s);
        const targets = s.players.filter(p => p.alive && Number.isFinite(d[index(p.x, p.z)]))
          .sort((a, b) => d[index(a.x, a.z)] - d[index(b.x, b.z)] || a.id.localeCompare(b.id));
        if (targets.length) {
          const back = distances(s, targets[0].x, targets[0].z);
          const next = DIRECTIONS.map(([dx, dz]) => ({ x: s.furnace.x + dx, z: s.furnace.z + dz }))
            .filter(c => tileAt(s, c.x, c.z) !== 'edge')
            .sort((a, b) => back[index(a.x, a.z)] - back[index(b.x, b.z)])[0];
          if (next && Number.isFinite(back[index(next.x, next.z)])) {
            const tile = tileAt(s, next.x, next.z);
            if (tile === 'floor') s.furnace = next;
            else s.attack = { ...next, until: s.t + (tile === 'wall' ? s.config.wallMs : s.config.rockMs) };
          }
        }
        }
        catchPlayers(s);
      }
      if (s.t >= s.config.prepMs + s.config.huntMs) s.phase = 'over';
    }
    return s;
  },
  isOver: s => s.phase === 'over',
  result(s) {
    const ordered = [...s.players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.outAt - a.outAt);
    return { durationMs: s.t, placements: rankByKey(ordered.map(p => ({ contestantId: p.id,
      score: Math.floor(Math.max(0, (p.alive ? s.t : p.outAt) - s.config.prepMs) / 1000),
      eliminated: !p.alive, key: p.alive ? 'survivor' : `out:${p.outAt}` }))) };
  },
  drainEvents(s) { const events = s.events; s.events = []; return events; },
};
