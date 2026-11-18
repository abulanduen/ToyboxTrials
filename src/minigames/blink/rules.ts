/** Fixed-quantum, deterministic combat; reusable by a future authoritative server. */
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { rankByKey } from '../scoring';
import { seededRng, shuffle } from '../rng';

export interface BlinkConfig { halfSize: number; radius: number; speed: number; blinkRange: number; attackRange: number; halfAngle: number; windupMs: number; recoveryMs: number; durationMs: number; endingMs: number }
export const DEFAULT_CONFIG: BlinkConfig = { halfSize: 16, radius: 1.05, speed: 8, blinkRange: 8, attackRange: 5.5, halfAngle: Math.PI / 3, windupMs: 950, recoveryMs: 350, durationMs: 90000, endingMs: 1200 };
export const QUANTUM = 10;
export type BlinkInput = { type: 'move' | 'aim'; x: number; z: number } | { type: 'blink' | 'attack' };
export interface Swing { x: number; z: number; angle: number; start: number; until: number }
export interface Duelist {
  id: string; x: number; z: number; angle: number; aimX: number; aimZ: number; moveX: number; moveZ: number;
  alive: boolean; outAt: number; kills: number; blinks: number; nextAttack: number; attack: Swing | null;
  lastBlink: { x: number; z: number; tx: number; tz: number; at: number } | null;
  lastStrike: { x: number; z: number; angle: number; at: number } | null;
}
export interface BlinkState {
  kind: 'blink-duel'; seed: number; config: BlinkConfig; phase: 'duel' | 'ending' | 'over'; t: number; remainder: number;
  finishAt: number; players: Duelist[]; pending: Record<string, BlinkInput[]>; events: MatchEvent[];
}
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function inSwing(swing: Pick<Swing, 'x' | 'z' | 'angle'>, target: { x: number; z: number }, config: BlinkConfig): boolean {
  const dx = target.x - swing.x, dz = target.z - swing.z, distance = Math.hypot(dx, dz);
  if (distance > config.attackRange + config.radius) return false;
  const angle=Math.abs(angleDelta(Math.atan2(dx,dz),swing.angle));
  if(angle<=config.halfAngle)return distance-config.attackRange<=config.radius;
  // Exact circle/sector intersection, including the rounded outer corners of the toy's body.
  const extra=angle-config.halfAngle,along=distance*Math.cos(extra),across=distance*Math.sin(extra);
  const closest=Math.max(0,Math.min(config.attackRange,along));
  return Math.hypot(along-closest,across)<=config.radius;
}
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
const unit = (x: number, z: number) => { const length = Math.hypot(x, z); return length > 1 ? { x: x / length, z: z / length } : { x, z }; };
export function freePosition(s: BlinkState, p: Duelist, x: number, z: number) {
  const limit = s.config.halfSize - s.config.radius;
  return Math.abs(x) <= limit + 1e-8 && Math.abs(z) <= limit + 1e-8 && s.players.every(other => other === p || !other.alive || Math.hypot(other.x - x, other.z - z) >= s.config.radius * 2 - 1e-8);
}
/** Blink may cross bodies, but its endpoint cannot overlap a living toy or leave the arena. */
function blink(s: BlinkState, p: Duelist) {
  p.angle = Math.atan2(p.aimX, p.aimZ);
  const limit = s.config.halfSize - s.config.radius;
  const tx = clamp(p.x + Math.sin(p.angle) * s.config.blinkRange, limit), tz = clamp(p.z + Math.cos(p.angle) * s.config.blinkRange, limit);
  for (let i = 64; i >= 1; i--) {
    const x = p.x + (tx - p.x) * i / 64, z = p.z + (tz - p.z) * i / 64;
    if (Math.hypot(x-p.x,z-p.z)<0.01) continue;
    if (!freePosition(s, p, x, z)) continue;
    p.lastBlink = { x: p.x, z: p.z, tx: x, tz: z, at: s.t }; p.x = x; p.z = z; p.blinks++;
    s.events.push({ type: 'blink', id: p.id });
    break;
  }
  if (p.attack) { p.attack = null; p.nextAttack = s.t + s.config.recoveryMs; }
}
function finish(s: BlinkState) {
  s.phase = 'ending'; s.finishAt = s.t;
  for (const p of s.players) { p.attack = null; p.moveX = 0; p.moveZ = 0; }
  s.events.push({ type: 'duel-finished' });
}
function tick(s: BlinkState) {
  s.t += QUANTUM;
  if (s.phase === 'ending') { if (s.t >= s.finishAt + s.config.endingMs) s.phase = 'over'; return; }
  // Rotate priority, so endpoint/movement contests never permanently favour one player.
  const offset = Math.floor(s.t / QUANTUM) % s.players.length;
  const order = [...s.players.slice(offset), ...s.players.slice(0, offset)];
  for (const p of order) {
    const commands = s.pending[p.id] ?? []; s.pending[p.id] = [];
    if (!p.alive) continue;
    for (const input of commands) {
      if (input.type === 'move' || input.type === 'aim') {
        if (!Number.isFinite(input.x) || !Number.isFinite(input.z)) continue;
        const v = unit(input.x, input.z);
        if (input.type === 'move') { p.moveX = v.x; p.moveZ = v.z; }
        if (Math.hypot(v.x, v.z) > 0.01) { p.aimX = v.x; p.aimZ = v.z; }
        if (!p.attack && Math.hypot(v.x, v.z) > 0.01) p.angle = Math.atan2(v.x, v.z);
      } else if (input.type === 'blink') blink(s, p);
      else if (input.type === 'attack' && !p.attack && s.t >= p.nextAttack) {
        p.attack = { x: p.x, z: p.z, angle: p.angle, start: s.t, until: s.t + s.config.windupMs };
        s.events.push({ type: 'duel-windup', id: p.id });
      }
    }
  }
  for (const p of order) if (p.alive && !p.attack) {
    const dx = p.moveX * s.config.speed * QUANTUM / 1000, dz = p.moveZ * s.config.speed * QUANTUM / 1000;
    const limit = s.config.halfSize - s.config.radius;
    const x = clamp(p.x + dx, limit), z = clamp(p.z + dz, limit);
    if (freePosition(s, p, x, z)) { p.x = x; p.z = z; }
    else if (freePosition(s, p, x, p.z)) p.x = x;
    else if (freePosition(s, p, p.x, z)) p.z = z;
  }
  const live = s.players.filter(p => p.alive), hits = new Map<Duelist, Duelist[]>();
  for (const p of live) if (p.attack && p.attack.until <= s.t) {
    const swing = p.attack;
    for (const target of live) if (target !== p && inSwing(swing, target, s.config)) hits.set(target, [...(hits.get(target) ?? []), p]);
    p.lastStrike = { x: swing.x, z: swing.z, angle: swing.angle, at: s.t }; p.attack = null; p.nextAttack = s.t + s.config.recoveryMs;
    s.events.push({ type: 'duel-strike', id: p.id });
  }
  for (const [target, sources] of hits) {
    target.alive = false; target.outAt = s.t; target.attack = null; target.moveX = target.moveZ = 0;
    sources.forEach(p => p.kills++); s.events.push({ type: 'eliminated', id: target.id });
  }
  if (s.players.filter(p => p.alive).length <= 1 || s.t >= s.config.durationMs) finish(s);
}
export const blinkRules: RulesCore<BlinkState, BlinkInput, BlinkConfig> = {
  init(contestants: Contestant[], seed, config) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (contestants.length < 2 || contestants.length > 8 || new Set(contestants.map(c => c.id)).size !== contestants.length ||
      Object.values(cfg).some(n => !Number.isFinite(n) || n <= 0) || cfg.halfAngle > Math.PI || cfg.radius >= cfg.halfSize / 4 ||
      [cfg.windupMs,cfg.recoveryMs,cfg.durationMs,cfg.endingMs].some(n => n % QUANTUM !== 0) || cfg.speed * QUANTUM / 1000 > cfg.radius) throw new Error('Invalid Blink Duel configuration.');
    const rng = seededRng(seed), slots = shuffle(rng, contestants.map((_, i) => i)), rotation = rng() * Math.PI * 2;
    const players: Duelist[] = contestants.map((c, i) => {
      const angle = rotation + slots[i] * Math.PI * 2 / contestants.length, radius = cfg.halfSize * 0.67;
      return { id: c.id, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, angle: angle + Math.PI, aimX: -Math.sin(angle), aimZ: -Math.cos(angle), moveX: 0, moveZ: 0,
        alive: true, outAt: -1, kills: 0, blinks: 0, nextAttack: 0, attack: null, lastBlink: null, lastStrike: null };
    });
    return { kind: 'blink-duel', seed, config: cfg, phase: 'duel', t: 0, remainder: 0, finishAt: -1, players, pending: {}, events: [] };
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    if (s.phase === 'duel') for (const p of s.players) {
      const queue = s.pending[p.id] ??= [];
      queue.push(...(inputs[p.id] ?? []).slice(0, Math.max(0, 64 - queue.length)));
    }
    s.remainder += dtMs;
    while (s.remainder + 1e-8 >= QUANTUM) { s.remainder -= QUANTUM; tick(s); if(blinkRules.isOver(s))break; }
    return s;
  },
  isOver: s => s.phase === 'over',
  result(s) {
    const end = s.finishAt < 0 ? s.t : s.finishAt;
    const ordered = [...s.players].sort((a,b) => Number(b.alive)-Number(a.alive) || b.outAt-a.outAt);
    return { durationMs: end, placements: rankByKey(ordered.map(p => ({ contestantId:p.id, eliminated:!p.alive,
      score:Math.floor((p.alive ? end : p.outAt)/1000), key:p.alive?'survivor':`out:${p.outAt}` }))), stats:{ blinks:s.players.reduce((n,p)=>n+p.blinks,0), eliminations:s.players.filter(p=>!p.alive).length } };
  },
  drainEvents(s) { const events=s.events; s.events=[]; return events; },
};
