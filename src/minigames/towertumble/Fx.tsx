/**
 * Toy Tower Tumble effects: shots, splashes, chain sparks, status puffs, pops and merge bursts.
 * Presentation only; reads the watched board's shot and pop ring buffers and never writes to them.
 *
 * Reuses Toy Squad's effect vocabulary: its unit shapes (`SHAPE_PARTS`), each toy's attack look
 * (`EFFECT_SPECS`: shape, colours and impact, keyed by the toy model a tower reuses) and the shared
 * status colours. One fixed particle pool feeds one InstancedMesh per shape, so the cost is
 * bounded (POOL particles, one draw call per shape on screen) and nothing is allocated per frame.
 * Timing is simulation time, so effects pause and fast-forward with the match.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { exposeDebug } from '../../game/debug';
import { SHAPE_PARTS } from '../toysquad/Fx';
import { EFFECT_SPECS, FX_SHAPES, STATUS_COLOURS, type FxShape } from '../toysquad/effects';
import { TOY_COLOURS } from '../toysquad/models';
import { bakeParts, UNLIT_VERTEX_MATERIAL } from '../toysquad/toys';
import { TOWERS, TIER_COLOURS, type EnemyKind } from './catalogue';
import { FX_BURN, FX_EXECUTE, FX_FURY, FX_MARK, FX_SHRED, FX_SLOW, FX_STUN, POP_RING, SHOT_RING, type TdPlayer } from './rules';
import { CELL, bw } from './space';

export const FX_POOL = 320;
const CAP: Partial<Record<FxShape, number>> = { orb: 64, chip: 64, star: 48, ring: 32, beam: 48 };
const SHAPE_INDEX = Object.fromEntries(FX_SHAPES.map((s, i) => [s, i])) as Record<FxShape, number>;
const RING = SHAPE_INDEX.ring, BEAM = SHAPE_INDEX.beam;
const LINE = 0, BURST = 1, RISE = 2, GROW = 3, SPAN = 4, ORBIT = 5, STAY = 6;
const H = Math.PI / 2;
const ENEMY_COLOURS: Record<EnemyKind, readonly [string, string]> = {
  walker: [TOY_COLOURS.silver, TOY_COLOURS.pink], beetle: [TOY_COLOURS.steel, TOY_COLOURS.honey], racer: [TOY_COLOURS.coral, TOY_COLOURS.glass],
  marble: [TOY_COLOURS.glass, TOY_COLOURS.coral], glider: [TOY_COLOURS.white, TOY_COLOURS.blue], boss: [TOY_COLOURS.honey, TOY_COLOURS.coral],
};

interface Particle { on: boolean; shape: number; path: number; t0: number; life: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; arc: number; size: number; grow: number; spin: number; seed: number; colour: THREE.Color }
const colours = new Map<string, THREE.Color>();
const tint = (hex: string) => { let c = colours.get(hex); if (!c) { c = new THREE.Color(hex); colours.set(hex, c); } return c; };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

let geometries: THREE.BufferGeometry[] | null = null;
let ringMaterial: THREE.MeshBasicMaterial | null = null;
function assets() {
  geometries ??= FX_SHAPES.map((s) => (s === 'ring' ? new THREE.RingGeometry(0.8, 1, 28).rotateX(-H) : bakeParts(SHAPE_PARTS[s], 'lit')));
  ringMaterial ??= new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return { geometries, ringMaterial };
}

export class TumbleFx {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = new Array<number>(FX_SHAPES.length).fill(0);
  private readonly pool: Particle[] = Array.from({ length: FX_POOL }, () => ({ on: false, shape: 0, path: 0, t0: 0, life: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, arc: 0, size: 1, grow: 1, spin: 0, seed: 0, colour: tint('#FFFFFF') }));
  private cursor = 0; private serial = 0;
  private readonly obj = new THREE.Object3D(); private readonly here = new THREE.Vector3();
  private board = ''; private shotSeen = 0; private popSeen = 0;
  peak = 0;
  constructor(private readonly reduced: boolean) {
    const { geometries, ringMaterial } = assets();
    this.meshes = FX_SHAPES.map((shape, i) => {
      const mesh = new THREE.InstancedMesh(geometries[i], shape === 'ring' ? ringMaterial : UNLIT_VERTEX_MATERIAL, CAP[shape] ?? 24);
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.name = `tumble-fx-${shape}`;
      mesh.setColorAt(0, tint('#FFFFFF'));
      this.group.add(mesh); return mesh;
    });
  }
  dispose() { this.meshes.forEach((m) => m.dispose()); }
  get active() { let n = 0; for (const p of this.pool) if (p.on) n++; return n; }
  get draws() { let n = 0; for (const m of this.meshes) if (m.visible) n++; return n; }
  clear() { for (const p of this.pool) p.on = false; }

  private emit(shape: FxShape, path: number, t0: number, life: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, size: number, colour: string, arc = 0, grow = 1, spin = 0) {
    const p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % FX_POOL; this.serial++;
    p.on = true; p.shape = SHAPE_INDEX[shape]; p.path = path; p.t0 = t0; p.life = life; p.ax = ax; p.ay = ay; p.az = az; p.bx = bx; p.by = by; p.bz = bz;
    p.size = size; p.colour = tint(colour); p.arc = arc; p.grow = grow; p.spin = spin; p.seed = this.serial * 2.399;
  }
  private burst(shape: FxShape, n: number, x: number, y: number, z: number, radius: number, t0: number, size: number, a: string, b: string, life = 0.38) {
    if (this.reduced) { this.emit(shape, STAY, t0, life, x, y + 0.6, z, x, y, z, size * 1.4, a); return; }
    for (let i = 0; i < n; i++) {
      const angle = this.serial * 1.7 + (i * Math.PI * 2) / n;
      this.emit(shape, BURST, t0, life, x, y, z, x + Math.cos(angle) * radius, y - 0.3, z + Math.sin(angle) * radius, size, i % 2 ? b : a, 0.9);
    }
  }

  /** A merge, build or gift flourish on a square, in the new tower's tier colour. */
  flourish(cell: number, tier: number, now: number, big: boolean) {
    const x = bw(cell % 8), z = bw(Math.floor(cell / 8)), c = TIER_COLOURS[tier - 1];
    this.emit('ring', GROW, now, 0.5, x, 0.2, z, x, 0.2, z, 0.4, c, 0, CELL * (big ? 0.95 : 0.6));
    this.burst('star', big ? 8 : 4, x, 2.2, z, big ? 2.4 : 1.4, now, 0.3, c, TOY_COLOURS.honey, 0.55);
    if (big && !this.reduced) for (let i = 0; i < 6; i++) this.emit('chip', RISE, now + i * 0.04, 0.7, x, 0.6, z, x, 0.6, z, 0.24, i % 2 ? c : TOY_COLOURS.cream, 4.5, 1, 9);
  }

  private shot(p: TdPlayer, i: number, now: number) {
    const s = p.shots[i], def = TOWERS[s.def];
    if (!def) return;
    const look = EFFECT_SPECS[def.model]?.attack, c1 = look?.colours[0] ?? TOY_COLOURS.honey, c2 = look?.colours[1] ?? TOY_COLOURS.cream;
    const shape: FxShape = look?.shape === 'slash' || look?.shape === 'beam' || !look ? 'orb' : look.shape;
    const ax = bw(s.x), az = bw(s.z), bx = bw(s.tx), bz = bw(s.tz), ay = 2.6, by = 0.9;
    const fury = (s.effects & FX_FURY) !== 0, size = (0.18 + def.tier * 0.035) * (fury ? 1.5 : 1);
    let land = now + 0.16;
    if (this.reduced) {
      this.emit(shape, STAY, now, 0.3, bx, 1.4, bz, bx, 1.4, bz, size * 1.3, c1);
    } else if (def.family === 'clockwork') {
      // A spark: a bright line to the target, then a hop along the chain.
      this.emit('beam', SPAN, now, 0.2, ax, ay, az, bx, by, bz, 0.16, c1);
      this.emit('beam', SPAN, now, 0.2, ax, ay, az, bx, by, bz, 0.07, TOY_COLOURS.white);
      let fx = bx, fz = bz;
      for (let h = 0; h < s.hopCount; h++) {
        const hx = bw(s.hops[h * 2]), hz = bw(s.hops[h * 2 + 1]), t0 = now + 0.05 * (h + 1);
        this.emit('beam', SPAN, t0, 0.18, fx, by, fz, hx, by, hz, 0.12, h % 2 ? c2 : c1);
        this.emit('shard', BURST, t0, 0.22, hx, by, hz, hx, by + 0.6, hz, 0.22, TOY_COLOURS.honey, 0.4);
        fx = hx; fz = hz;
      }
      land = now;
    } else if (def.family === 'tin') {
      this.emit(shape, LINE, now, 0.14, ax, ay, az, bx, by, bz, size, c1, 0.2, 1, 8);
      land = now + 0.14;
    } else {
      const lob = def.family === 'paper' ? 2.6 : 1.3, life = def.family === 'paper' ? 0.3 : 0.22;
      this.emit(def.family === 'rubber' ? 'drop' : shape, LINE, now, life, ax, ay, az, bx, by, bz, size * 1.1, c1, lob, 1, 6);
      land = now + life;
    }
    if (!this.reduced) this.burst(def.family === 'paper' ? 'chip' : 'orb', 3, bx, by + 0.3, bz, 0.9, land, 0.16, c1, c2, 0.3);
    if (s.splash > 0) this.emit('ring', GROW, land, 0.4, bx, 0.18, bz, bx, 0.18, bz, 0.3, c1, 0, s.splash * CELL);
    if (s.effects & FX_BURN) for (let k = 0; k < (this.reduced ? 1 : 2); k++) this.emit('flame', this.reduced ? STAY : RISE, land + k * 0.08, 0.45, bx, 0.8, bz, bx, 0.8, bz, 0.26, k ? TOY_COLOURS.honey : TOY_COLOURS.coral, 1.8);
    if (s.effects & FX_SLOW) this.emit('drop', this.reduced ? STAY : RISE, land, 0.45, bx, 1.4, bz, bx, 1.4, bz, 0.24, STATUS_COLOURS.shield, -1.0);
    if (s.effects & FX_STUN) for (let k = 0; k < 3; k++) this.emit('star', this.reduced ? STAY : ORBIT, land, 0.6, bx, 2.0, bz, bx, 2.0, bz, 0.22, STATUS_COLOURS.stun, 0.7 + k * 0.01);
    if (s.effects & FX_MARK) this.emit('ring', GROW, land, 0.4, bx, 0.22, bz, bx, 0.22, bz, 1.4, STATUS_COLOURS.mark, 0, 0.9);
    if (s.effects & FX_SHRED) this.burst('shard', 4, bx, by + 0.4, bz, 1.0, land, 0.2, TOY_COLOURS.silver, TOY_COLOURS.steel, 0.3);
    if (s.effects & FX_EXECUTE) this.emit('slash', STAY, land, 0.35, bx, 1.2, bz, bx, 1.2, bz, 0.9, STATUS_COLOURS.mark);
  }

  private pop(p: TdPlayer, i: number, now: number) {
    const e = p.pops[i], x = bw(e.x), z = bw(e.z), [c1, c2] = ENEMY_COLOURS[e.kind];
    if (e.leaked) { this.emit('ring', GROW, now, 0.6, x, 0.25, z, x, 0.25, z, 0.5, TOY_COLOURS.coral, 0, CELL * 0.9); return; }
    this.burst('chip', e.boss ? 14 : 6, x, 0.9, z, e.boss ? 4 : 1.6, now, e.boss ? 0.34 : 0.22, c1, c2, 0.45);
    if (e.boss) { this.burst('star', 10, x, 2.5, z, 4.5, now, 0.42, TOY_COLOURS.honey, TOY_COLOURS.cream, 0.8); this.emit('ring', GROW, now, 0.7, x, 0.2, z, x, 0.2, z, 0.6, TOY_COLOURS.honey, 0, CELL * 2); }
  }

  frame(board: TdPlayer | undefined, now: number) {
    if (!board) { this.board = ''; this.clear(); }
    else if (board.id !== this.board) {
      // A new board to watch: start from its current shots, not its history.
      this.board = board.id; this.clear(); this.shotSeen = board.shotSerial; this.popSeen = board.popSerial;
    } else {
      // Only the most recent ring entries still exist; anything older was overwritten.
      if (board.shotSerial - this.shotSeen > SHOT_RING) this.shotSeen = board.shotSerial - SHOT_RING;
      while (this.shotSeen < board.shotSerial) { this.shot(board, this.shotSeen % SHOT_RING, now); this.shotSeen++; }
      if (board.popSerial - this.popSeen > POP_RING) this.popSeen = board.popSerial - POP_RING;
      while (this.popSeen < board.popSerial) { this.pop(board, this.popSeen % POP_RING, now); this.popSeen++; }
    }
    this.counts.fill(0);
    let live = 0;
    for (const p of this.pool) {
      if (!p.on) continue;
      const t = (now - p.t0) / p.life;
      if (t >= 1 || t < -20) { p.on = false; continue; }
      live++;
      if (t < 0 || this.counts[p.shape] >= this.meshes[p.shape].instanceMatrix.count) continue;
      this.place(p, t); this.obj.updateMatrix();
      const mesh = this.meshes[p.shape], k = this.counts[p.shape]++;
      mesh.setMatrixAt(k, this.obj.matrix); mesh.setColorAt(k, p.colour);
    }
    this.peak = Math.max(this.peak, live);
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i], shown = this.counts[i];
      mesh.count = shown; mesh.visible = shown > 0;
      if (shown) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    }
  }

  private place(p: Particle, t: number) {
    const o = this.obj, env = Math.min(1, t * 6) * (t > 0.75 ? (1 - t) / 0.25 : 1);
    o.rotation.set(0, 0, 0);
    if (p.path === GROW) { const r = p.size + (p.grow - p.size) * easeOut(Math.min(1, t * 1.5)); o.position.set(p.ax, p.ay, p.az); o.scale.set(r, 1, r); return; }
    if (p.path === SPAN) {
      this.here.set(p.bx, p.by, p.bz);
      const length = Math.hypot(p.bx - p.ax, p.by - p.ay, p.bz - p.az);
      o.position.set((p.ax + p.bx) / 2, (p.ay + p.by) / 2, (p.az + p.bz) / 2); o.lookAt(this.here);
      const k = p.size * env; o.scale.set(k, k, Math.max(0.01, length)); return;
    }
    switch (p.path) {
      case LINE: o.position.set(p.ax + (p.bx - p.ax) * t, p.ay + (p.by - p.ay) * t + Math.sin(Math.PI * t) * p.arc, p.az + (p.bz - p.az) * t); break;
      case BURST: { const u = easeOut(t); o.position.set(p.ax + (p.bx - p.ax) * u, p.ay + (p.by - p.ay) * u + Math.sin(Math.PI * t) * p.arc, p.az + (p.bz - p.az) * u); break; }
      case RISE: o.position.set(p.ax + Math.cos(p.seed + t * 5) * 0.4 * t, p.ay + t * p.arc, p.az + Math.sin(p.seed + t * 5) * 0.4 * t); break;
      case ORBIT: { const a = p.seed + t * 7; o.position.set(p.ax + Math.cos(a) * p.arc, p.ay, p.az + Math.sin(a) * p.arc); break; }
      default: o.position.set(p.ax, p.ay, p.az);
    }
    o.scale.setScalar(p.size * 2.2 * (p.path === STAY ? 1 : env));
    o.rotation.set(-0.8, p.seed, p.spin ? t * p.spin : 0);
    if (p.shape === RING || p.shape === BEAM) o.rotation.set(0, p.seed, 0);
  }
}

export function TumbleFxLayer({ getBoard, getNow }: { getBoard: () => TdPlayer | undefined; getNow: () => number }) {
  const engine = useMemo(() => new TumbleFx(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => () => { engine.clear(); engine.dispose(); }, [engine]);
  useEffect(() => { exposeDebug({ tumbleFx: { active: () => engine.active, draws: () => engine.draws, peak: () => engine.peak } }); }, [engine]);
  useFrame(() => engine.frame(getBoard(), getNow()));
  useEffect(() => { tumbleFxRef.current = engine; return () => { if (tumbleFxRef.current === engine) tumbleFxRef.current = null; }; }, [engine]);
  return <primitive object={engine.group} />;
}
/** The live engine, so the scene can add merge and build flourishes from rules events. */
export const tumbleFxRef: { current: TumbleFx | null } = { current: null };
