/**
 * Toy Squad battle effects. Presentation only: reads the battle's attack/damage events and
 * fighter state each tick and never writes to them.
 *
 * One fixed pool of particles feeds one InstancedMesh per effect shape, so the cost is bounded:
 * at most POOL particles and one draw call per shape that is on screen. Nothing is allocated per
 * frame. All timing uses simulation time, so effects pause and fast-forward with the match.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { exposeDebug } from '../../game/debug';
import { boardToWorld, CELL_SIZE } from './board';
import { ROSTER } from './catalogue';
import { EFFECT_SPECS, FX_SHAPES, RAINBOW, STATUS_COLOURS, spellLayout, type FxShape, type Impact } from './effects';
import { TOY_COLOURS, type ToyPart } from './models';
import type { AttackEffect, Battle, Fighter, SquadState } from './rules';
import { effectsFor } from './spellcraft';
import { bakeParts, UNLIT_VERTEX_MATERIAL } from './toys';

/** Per-fighter animation cues for the toy models (simulation seconds). Written here, read by `Scene.tsx`. */
export interface UnitCue { attackAt: number; castAt: number; hurtAt: number; diedAt: number; ranged: boolean }
export const unitCues = new Map<number, UnitCue>();
export const cueKey = (side: number, id: number) => (id + 100000) * 2 + side;
const cue = (u: Fighter) => {
  const key = cueKey(u.side, u.id); let c = unitCues.get(key);
  if (!c) { c = { attackAt: -9, castAt: -9, hurtAt: -9, diedAt: -9, ranged: false }; unitCues.set(key, c); }
  return c;
};

const H = Math.PI / 2, W = '#FFFFFF';
const part = (g: ToyPart['g'], p: ToyPart['p'], s: ToyPart['s'], r: ToyPart['r'] = [0, 0, 0]): ToyPart => ({ g, c: W, p, s, r, o: 'XYZ' });
/** Unit-sized effect shapes. Pointed shapes aim along +z; flat ones lie in the XZ plane; icons face +z. */
export const SHAPE_PARTS: Record<Exclude<FxShape, 'ring'>, ToyPart[]> = {
  orb: [part('ball', [0, 0, 0], [1, 1, 1])],
  shard: [part('gem', [0, 0, 0], [0.5, 0.5, 1.15])],
  bolt: [part('cyl', [0, 0, -0.15], [0.34, 0.7, 0.34], [H, 0, 0]), part('cone', [0, 0, 0.36], [0.34, 0.34, 0.34], [H, 0, 0])],
  star: [part('star', [0, 0, 0], [1, 1, 0.26])],
  disc: [part('cyl', [0, 0, 0], [1, 0.26, 1]), part('cyl', [0, 0, 0], [0.5, 0.32, 0.5])],
  cube: [part('rbox', [0, 0, 0], [0.56, 0.95, 0.34])],
  chip: [part('box', [0, 0, 0], [0.8, 0.1, 0.8])],
  drop: [part('ball', [0, -0.12, 0], [0.7, 0.7, 0.7]), part('cone', [0, 0.32, 0], [0.56, 0.6, 0.56])],
  note: [part('ball', [-0.16, -0.3, 0], [0.5, 0.38, 0.3]), part('box', [0.05, 0.1, 0], [0.09, 0.8, 0.09]), part('box', [0.2, 0.44, 0], [0.32, 0.16, 0.09])],
  plus: [part('box', [0, 0, 0], [0.95, 0.32, 0.26]), part('box', [0, 0, 0], [0.32, 0.95, 0.26])],
  gear: [part('gear', [0, 0, 0], [1, 1, 0.26])],
  slash: [part('arc', [0, 0, -0.25], [1.7, 1.5, 0.5], [H, 0, 0])],
  feather: [part('ball', [0, 0, 0.05], [0.34, 0.08, 1.0]), part('box', [0, 0, 0], [0.05, 0.05, 1.25])],
  beam: [part('hex', [0, 0, 0], [1, 1, 1], [H, 0, 0])],
  dart: [part('prism', [0, 0, 0], [0.75, 1.1, 0.07], [H, 0, 0]), part('box', [0, -0.1, -0.1], [0.06, 0.22, 0.75])],
  flame: [part('ball', [0, -0.2, 0], [0.66, 0.56, 0.66]), part('cone', [0, 0.26, 0], [0.56, 0.75, 0.56])],
  coil: [-0.36, -0.12, 0.12, 0.36].map(z => part('torus', [0, 0, z], [0.72, 0.72, 0.9])),
};
const CAPACITY: Record<FxShape, number> = { orb: 96, shard: 48, bolt: 32, star: 48, disc: 48, cube: 32, chip: 64, drop: 32, note: 32, plus: 48, gear: 32, slash: 24, feather: 32, beam: 48, dart: 32, flame: 32, coil: 24, ring: 24 };
export const FX_POOL = 384;
const SHAPE_INDEX = Object.fromEntries(FX_SHAPES.map((s, i) => [s, i])) as Record<FxShape, number>;
const RING = SHAPE_INDEX.ring, BEAM = SHAPE_INDEX.beam, SLASH = SHAPE_INDEX.slash, DISC = SHAPE_INDEX.disc, GEAR = SHAPE_INDEX.gear;
// Orientation modes.
const FACE = 0, ALONG = 1, FLAT = 2, TUMBLE = 3, ROLL = 4;
const MODES: Record<FxShape, number> = { orb: FACE, shard: ALONG, bolt: ALONG, star: FACE, disc: FLAT, cube: TUMBLE, chip: TUMBLE, drop: FACE, note: FACE, plus: FACE, gear: FACE, slash: FLAT, feather: ALONG, beam: ALONG, dart: ALONG, flame: FACE, coil: ALONG, ring: FLAT };
const SPINS: Partial<Record<FxShape, number>> = { star: 7, gear: 6, disc: 9, shard: 4, coil: 5, cube: 9, chip: 11 };
// Paths.
const LINE = 0, BOUNCE = 1, SPIRAL = 2, ZIGZAG = 3, BOOMERANG = 4, DROP = 5, RISE = 6, BURST = 7, STAY = 8, ORBIT = 9, JAB = 10, ELL = 11, SWEEP = 12, TETHER = 13, SPAN = 14, GROW = 15;
const SCALE = 2.2;

interface Particle {
  on: boolean; shape: number; mode: number; path: number; sub: number; t0: number; life: number;
  ax: number; ay: number; az: number; bx: number; by: number; bz: number;
  arc: number; amp: number; size: number; grow: number; len: number; spin: number; seed: number; yaw: number; colour: THREE.Color;
}
interface Options { arc?: number; amp?: number; grow?: number; len?: number; spin?: number; seed?: number; yaw?: number; mode?: number; sub?: number }
const colours = new Map<string, THREE.Color>();
const tint = (hex: string) => { let c = colours.get(hex); if (!c) { c = new THREE.Color(hex); colours.set(hex, c); } return c; };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

let shapeGeometry: THREE.BufferGeometry[] | null = null;
let ringMaterial: THREE.MeshBasicMaterial | null = null;
function shapeAssets() {
  shapeGeometry ??= FX_SHAPES.map(s => s === 'ring' ? new THREE.RingGeometry(0.8, 1, 28).rotateX(-H) : bakeParts(SHAPE_PARTS[s], 'lit'));
  ringMaterial ??= new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return { geometry: shapeGeometry, ringMaterial };
}
/**
 * The shared, cached geometry of one effect shape (unit-sized, baked 'lit' vertex colours: draw it
 * with UNLIT_VERTEX_MATERIAL). For other games' instanced projectiles and particles (Toybox Siege).
 * Never dispose it: Toy Squad's effects draw the same geometry.
 */
export const fxShapeGeometry = (shape: FxShape) => shapeAssets().geometry[SHAPE_INDEX[shape]];

/** The pooled effect engine. Plain object, driven from one `useFrame`. */
class FxEngine {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = new Array<number>(FX_SHAPES.length).fill(0);
  private readonly pool: Particle[] = Array.from({ length: FX_POOL }, () => ({ on: false, shape: 0, mode: 0, path: 0, sub: 0, t0: 0, life: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0,
    arc: 0, amp: 0, size: 1, grow: 1, len: 1, spin: 0, seed: 0, yaw: 0, colour: tint(W) }));
  private cursor = 0; private serial = 0;
  private readonly obj = new THREE.Object3D(); private readonly here = new THREE.Vector3(); private readonly next = new THREE.Vector3();
  private readonly previous = new Map<number, { hp: number; shield: number; marked: number; silenced: number; up: number; down: number }>();
  private seen = ''; private battle = '';
  constructor(private readonly reduced: boolean) {
    const { geometry, ringMaterial } = shapeAssets();
    this.meshes = FX_SHAPES.map((shape, i) => {
      const mesh = new THREE.InstancedMesh(geometry[i], shape === 'ring' ? ringMaterial : UNLIT_VERTEX_MATERIAL, CAPACITY[shape]);
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.name = `squad-fx-${shape}`;
      mesh.setColorAt(0, tint(W)); // allocate the per-instance colour buffer up front
      this.group.add(mesh); return mesh;
    });
  }
  dispose() { this.meshes.forEach(m => m.dispose()); }
  /** Live particle count, for the debug hook and tests. */
  get active() { return this.pool.reduce((n, p) => n + (p.on ? 1 : 0), 0); }
  get draws() { return this.meshes.reduce((n, m) => n + (m.visible ? 1 : 0), 0); }
  clear() { for (const p of this.pool) p.on = false; this.previous.clear(); unitCues.clear(); this.seen = ''; }

  private emit(shape: FxShape, path: number, t0: number, life: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, size: number, colour: string, o?: Options) {
    const p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % FX_POOL; this.serial++;
    p.on = true; p.shape = SHAPE_INDEX[shape]; p.path = path; p.t0 = t0; p.life = life; p.ax = ax; p.ay = ay; p.az = az; p.bx = bx; p.by = by; p.bz = bz;
    p.size = size; p.colour = tint(colour); p.arc = o?.arc ?? 0; p.amp = o?.amp ?? 0; p.grow = o?.grow ?? 1; p.len = o?.len ?? 0.7;
    p.spin = o?.spin ?? SPINS[shape] ?? 0; p.seed = o?.seed ?? this.serial * 2.399; p.yaw = o?.yaw ?? 0; p.mode = o?.mode ?? MODES[shape]; p.sub = o?.sub ?? LINE;
  }

  // ───────────── choreography (runs once per combat tick) ─────────────
  private impact(kind: Impact, x: number, z: number, t0: number, c1: string, c2: string, k = 1) {
    const y = 1.3;
    const burst = (shape: FxShape, n: number, radius: number, arc: number, size: number, a: string, b: string, life = 0.34, mode?: number) => {
      for (let i = 0; i < n; i++) { const angle = this.serial * 1.7 + i * Math.PI * 2 / n;
        this.emit(shape, BURST, t0, life, x, y, z, x + Math.cos(angle) * radius * k, y - 0.4, z + Math.sin(angle) * radius * k, size * k, i % 2 ? b : a, { arc, mode }); }
    };
    const wave = (radius: number, colour: string, life = 0.3) => this.emit('ring', GROW, t0, life, x, 0.16, z, x, 0.16, z, 0.25, colour, { grow: radius * k });
    switch (kind) {
      case 'puff': burst('orb', 5, 1.0, 0.5, 0.2, c2, c1); break;
      case 'sparks': burst('shard', 6, 1.4, 0.7, 0.2, TOY_COLOURS.honey, c2, 0.28); break;
      case 'splat': burst('disc', 6, 1.2, 0.1, 0.28, c1, c2, 0.42); wave(1.2, c1, 0.4); break;
      case 'stars': burst('star', 4, 1.0, 1.3, 0.26, TOY_COLOURS.honey, TOY_COLOURS.cream, 0.4); break;
      case 'confetti': burst('chip', 7, 1.25, 1.5, 0.2, c1, c2, 0.45); break;
      case 'bubbles': for (let i = 0; i < 5; i++) this.emit('orb', RISE, t0 + i * 0.03, 0.45, x, 0.9, z, x, 0.9, z, (0.16 + (i % 3) * 0.05) * k, i % 2 ? c1 : STATUS_COLOURS.poison, { arc: 1.7, amp: 0.6 }); break;
      case 'clang': wave(1.1, TOY_COLOURS.white, 0.24); burst('shard', 4, 1.1, 0.5, 0.18, TOY_COLOURS.white, c1, 0.26); break;
      case 'notes': for (let i = 0; i < 3; i++) this.emit('note', RISE, t0 + i * 0.05, 0.5, x, 1.2, z, x, 1.2, z, 0.3 * k, i % 2 ? c2 : c1, { arc: 1.8, amp: 0.7 }); break;
      case 'gears': burst('gear', 4, 1.2, 1.0, 0.24, c1, c2, 0.4); break;
      case 'feathers': burst('feather', 4, 1.1, 0.9, 0.34, c2, TOY_COLOURS.white, 0.45, TUMBLE); break;
      case 'drops': burst('drop', 5, 1.0, 1.0, 0.2, c2, c1, 0.36); break;
      case 'ring': wave(1.7, c1, 0.34); burst('orb', 3, 1.0, 0.4, 0.16, c2, c1); break;
      case 'shards': burst('shard', 6, 1.2, 0.8, 0.22, c1, c2, 0.3); break;
      case 'burst': wave(1.6, c2, 0.34); burst('orb', 6, 1.5, 0.8, 0.22, c1, c2, 0.36); break;
    }
  }

  private basic(e: AttackEffect, src: Fighter | undefined, target: Fighter | undefined, b: Battle, now: number) {
    const spec = EFFECT_SPECS[e.kind], a = spec.attack, def = ROSTER[e.kind];
    const ax = boardToWorld(e.x), az = boardToWorld(e.z), bx = boardToWorld(e.tx), bz = boardToWorld(e.tz);
    const cells = Math.max(Math.abs(e.tx - e.x), Math.abs(e.tz - e.z)), length = Math.hypot(bx - ax, bz - az) || 1;
    const fx = (bx - ax) / length, fz = (bz - az) / length, yaw = Math.atan2(fx, fz);
    const furious = def.ability === 'fury' && !!src && src.attacks % 3 === 0;
    const finishing = def.ability === 'execute' && !!target && target.hp < target.maxHp / 3;
    const size = a.size * (furious || finishing ? 1.5 : 1) * (1 + ((src?.tier ?? 1) - 1) * 0.15);
    const [c1, c2] = a.colours;
    if (this.reduced) {
      // Stationary feedback only: one shape on the target, then a still marker for the ability.
      this.emit(a.shape, STAY, now, 0.4, bx, 1.6, bz, bx, 1.6, bz, size, c1, { yaw, mode: a.shape === 'beam' ? FLAT : undefined, len: 1 });
      if (def.ability === 'splash' || def.ability === 'cleave') this.emit('ring', GROW, now, 0.4, bx, 0.16, bz, bx, 0.16, bz, 1.5 * CELL_SIZE, c2, { grow: 1.5 * CELL_SIZE });
      if (def.ability === 'pierce') this.emit('beam', SPAN, now, 0.4, ax, 1.4, az, bx + fx * CELL_SIZE, 1.4, bz + fz * CELL_SIZE, 0.3, c1);
      return;
    }
    const melee = a.path === 'jab' || a.path === 'sweep' || a.path === 'smash';
    const travel = melee ? 0.2 : a.path === 'roll' || a.path === 'ell' ? 0.26 : Math.min(0.36, 0.14 + 0.045 * cells);
    const count = a.count + (furious ? 2 : 0), sy = 1.5, ty = 1.3;
    for (let i = 0; i < count; i++) {
      const t0 = now + i * 0.055, side = (i - (count - 1) / 2) * 0.42, ox = fz * side, oz = -fx * side;
      const colour = a.rainbow ? RAINBOW[(e.serial + i) % RAINBOW.length] : i % 2 ? c2 : c1;
      const sx = ax + fx * 0.9 + ox, sz = az + fz * 0.9 + oz, ex = bx + ox * 0.5, ez = bz + oz * 0.5;
      let path = LINE, life = travel; const o: Options = { yaw };
      switch (a.path) {
        case 'line': o.arc = 0.15; break;
        case 'arc': o.arc = 1.5 + cells * 0.3; break;
        case 'bounce': path = BOUNCE; o.arc = 1.3; break;
        case 'spiral': path = SPIRAL; o.amp = 0.5; break;
        case 'zigzag': path = ZIGZAG; o.amp = 0.55; break;
        case 'boomerang': path = BOOMERANG; o.amp = 0.7; life = travel * 2; break;
        case 'jab': path = JAB; life = travel * 1.4; o.len = 1.1; break;
        case 'sweep': path = SWEEP; life = 0.24; o.amp = i % 2 ? -1.15 : 1.15; o.arc = a.shape === 'slash' ? 0 : 1.2; break;
        case 'smash': path = DROP; o.arc = 3.2; break;
        case 'roll': o.mode = ROLL; break;
        case 'ell': path = ELL; break;
      }
      const low = a.path === 'roll' ? 0.62 : sy;
      if (a.path === 'sweep') this.emit(a.shape, path, t0, life, bx - fx * 0.5, ty, bz - fz * 0.5, bx - fx * 0.5, ty, bz - fz * 0.5, size, colour, o);
      else this.emit(a.shape, path, t0, life, sx, low, sz, ex, a.path === 'roll' ? low : ty, ez, size, colour, o);
      if (a.trail === 'string' && i === 0) this.emit('beam', TETHER, t0, life, sx, sy, sz, ex, ty, ez, 0.09, TOY_COLOURS.white, { ...o, sub: path });
    }
    const hit = now + travel;
    this.impact(a.impact, bx, bz, hit, c1, c2, furious || finishing ? 1.35 : 1);
    switch (def.ability) {
      case 'cleave': this.emit('slash', SWEEP, hit - 0.06, 0.26, bx - fx * 0.3, 1.0, bz - fz * 0.3, bx, 1.0, bz, 1.5, c2, { yaw, amp: 1.5 }); break;
      case 'splash': this.emit('ring', GROW, hit, 0.36, bx, 0.16, bz, bx, 0.16, bz, 0.4, c1, { grow: 1.5 * CELL_SIZE });
        for (let i = 0; i < 6; i++) { const angle = e.serial + i * Math.PI / 3; this.emit(a.shape === 'bolt' ? 'chip' : a.shape, BURST, hit, 0.34, bx, 1.0, bz, bx + Math.cos(angle) * 1.3 * CELL_SIZE, 0.4, bz + Math.sin(angle) * 1.3 * CELL_SIZE, size * 0.6, a.rainbow ? RAINBOW[i] : i % 2 ? c1 : c2, { arc: 1.0 }); }
        break;
      case 'chain': {
        // Same pick as combat: the nearest other enemy (to the attacker) standing next to the target.
        const reach = (u: Fighter) => Math.max(Math.abs(u.x - e.x), Math.abs(u.z - e.z));
        const hop = target && b.fighters.filter(u => u.side === target.side && u !== target && Math.max(Math.abs(u.x - target.x), Math.abs(u.z - target.z)) <= 1)
          .sort((u, w) => reach(u) - reach(w) || u.id - w.id)[0];
        if (hop) { const hx = boardToWorld(hop.x), hz = boardToWorld(hop.z);
          this.emit(a.shape, a.path === 'bounce' ? BOUNCE : LINE, hit, 0.2, bx, ty, bz, hx, ty, hz, size * 0.8, c2, { arc: 0.9, yaw });
          this.impact(a.impact, hx, hz, hit + 0.2, c2, c1, 0.75); }
        break;
      }
      case 'pierce': this.emit('beam', SPAN, now + 0.04, 0.3, ax + fx, 1.4, az + fz, bx + fx * CELL_SIZE * 1.1, 1.4, bz + fz * CELL_SIZE * 1.1, 0.16, c2); break;
      case 'drain': for (let i = 0; i < 3; i++) this.emit('drop', LINE, hit + i * 0.05, 0.3, bx, ty, bz, ax, sy, az, 0.2, STATUS_COLOURS.drain, { arc: 0.9 }); break;
      case 'poison': this.impact('bubbles', bx, bz, hit + 0.05, STATUS_COLOURS.poison, c1, 0.8); break;
      case 'execute': if (finishing) for (const tilt of [-0.8, 0.8]) this.emit('slash', SWEEP, hit, 0.3, bx, 1.6, bz, bx, 1.6, bz, 1.25, STATUS_COLOURS.mark, { yaw: yaw + tilt, amp: 0.2 }); break;
      case 'heal': if (src && src.attacks % 3 === 0) for (const ally of b.fighters) if (ally.side === src.side && ally.hp > 0 && this.rose(ally))
        this.emit('plus', LINE, now, 0.3, ax, sy, az, boardToWorld(ally.x), 2.0, boardToWorld(ally.z), 0.3, c2 === TOY_COLOURS.white ? c1 : c2, { arc: 1.6 });
        break;
      default: break;
    }
  }

  private rose(u: Fighter) { const before = this.previous.get(cueKey(u.side, u.id)); return !!before && u.hp > before.hp; }

  private cast(e: AttackEffect, src: Fighter | undefined, target: Fighter | undefined, b: Battle, now: number) {
    const spec = EFFECT_SPECS[e.kind].spell, layout = spellLayout(e.kind), [c1, c2] = spec.colours;
    const ax = boardToWorld(e.x), az = boardToWorld(e.z);
    const bx = boardToWorld(target?.x ?? e.tx), bz = boardToWorld(target?.z ?? e.tz);
    const length = Math.hypot(bx - ax, bz - az) || 1, fx = (bx - ax) / length, fz = (bz - az) / length, yaw = Math.atan2(fx, fz);
    const scale = 1 + ((src?.tier ?? 1) - 1) * 0.15, size = 0.42 * scale;
    const pick = (i: number) => spec.rainbow ? RAINBOW[i % RAINBOW.length] : i % 2 ? c2 : c1;
    const enemies = src ? b.fighters.filter(u => u.hp > 0 && u.side !== src.side) : [];
    const allies = !src || !layout.allies ? [] : [...new Set(ROSTER[e.kind].spell.effects.filter(f => ['self', 'lowestAlly', 'nearAllies', 'allAllies', 'traitAllies'].includes(f.target))
      .flatMap(f => f.target === 'lowestAlly' && b.fighters.some(u => u.side === src.side && this.rose(u)) ? b.fighters.filter(u => u.side === src.side && u.hp > 0 && this.rose(u))
        : effectsFor(src, target ?? src, [f], b.fighters, b.tick, 'fx').map(r => r.target)))].slice(0, 10);
    let edgeX = bx, edgeZ = bz;
    if (layout.line) { // extend through the target to the edge of the board
      const limit = boardToWorld(7) + CELL_SIZE / 2; let k = length;
      while (Math.abs(ax + fx * (k + 1)) <= limit && Math.abs(az + fz * (k + 1)) <= limit && k < 60) k += 1;
      edgeX = ax + fx * k; edgeZ = az + fz * k;
    }
    if (this.reduced) {
      this.emit(spec.shape, STAY, now, 0.45, ax, 3.4, az, ax, 3.4, az, size * 1.2, c1, { yaw, mode: spec.shape === 'beam' ? FLAT : undefined, len: 1 });
      if (layout.line) this.emit('beam', SPAN, now, 0.45, ax, 1.4, az, edgeX, 1.4, edgeZ, 0.45, c1);
      if (layout.blast) this.emit('ring', GROW, now, 0.45, bx, 0.16, bz, bx, 0.16, bz, (layout.blast + 0.5) * CELL_SIZE, c1, { grow: (layout.blast + 0.5) * CELL_SIZE });
      if (layout.aura) this.emit('ring', GROW, now, 0.45, ax, 0.16, az, ax, 0.16, az, (layout.aura + 0.5) * CELL_SIZE, c2, { grow: (layout.aura + 0.5) * CELL_SIZE });
      if (layout.everyEnemy) for (const u of enemies.slice(0, 12)) this.emit(spec.shape, STAY, now, 0.45, boardToWorld(u.x), 3.2, boardToWorld(u.z), 0, 0, 0, size * 0.8, c2, { mode: spec.shape === 'beam' ? FLAT : undefined, len: 1 });
      if (layout.single) this.emit('ring', GROW, now, 0.45, bx, 0.16, bz, bx, 0.16, bz, 1.2, c1, { grow: 1.2 });
      for (const u of allies) this.emit('plus', STAY, now, 0.45, boardToWorld(u.x), 3.2, boardToWorld(u.z), 0, 0, 0, 0.26, c2);
      return;
    }
    // 1. Cast flourish around the caster, in the toy's own shape and colours.
    const n = 8;
    for (let i = 0; i < n; i++) {
      const angle = i * Math.PI * 2 / n, cx = Math.cos(angle), cz = Math.sin(angle), t0 = now + i * 0.015;
      switch (spec.flourish) {
        case 'ring': this.emit(spec.shape, ORBIT, now, 0.5, ax, 1.2, az, ax, 2.4, az, size * 0.8, pick(i), { amp: 1.5, seed: angle }); break;
        case 'fountain': this.emit(spec.shape, BURST, t0, 0.5, ax, 2.2, az, ax + cx * 1.6, 0.6, az + cz * 1.6, size * 0.8, pick(i), { arc: 2.4 }); break;
        case 'spiral': this.emit(spec.shape, RISE, now + i * 0.04, 0.5, ax, 0.6, az, ax, 0.6, az, size * 0.8, pick(i), { arc: 3.2, amp: 1.3, seed: angle, spin: 9 }); break;
        case 'burst': this.emit(spec.shape, BURST, now, 0.36, ax, 1.6, az, ax + cx * 2.1, 1.2, az + cz * 2.1, size * 0.8, pick(i), { arc: 0.5, yaw: angle }); break;
        case 'pillar': this.emit(spec.shape, RISE, now + i * 0.03, 0.45, ax + cx * 0.5, 0.4, az + cz * 0.5, ax, 0.4, az, size * 0.8, pick(i), { arc: 4.2, amp: 0 }); break;
        case 'rain': this.emit(spec.shape, DROP, now + i * 0.03, 0.4, ax, 0.6, az, ax + cx * 1.3, 0.6, az + cz * 1.3, size * 0.8, pick(i), { arc: 4 }); break;
      }
    }
    this.emit('ring', GROW, now, 0.3, ax, 0.16, az, ax, 0.16, az, 0.5, c1, { grow: 1.7 });
    const land = now + 0.24;
    // 2. Delivery, laid out exactly as the kit targets it.
    if (layout.line) {
      this.emit('beam', SPAN, now + 0.05, 0.42, ax + fx, 1.4, az + fz, edgeX, 1.4, edgeZ, 0.42, c1);
      this.emit('beam', SPAN, now + 0.05, 0.42, ax + fx, 1.4, az + fz, edgeX, 1.4, edgeZ, 0.2, TOY_COLOURS.white);
      if (spec.shape !== 'beam') for (let i = 0; i < 6; i++) this.emit(spec.shape, LINE, now + 0.05 + i * 0.045, 0.3, ax + fx, 1.6, az + fz, edgeX, 1.6, edgeZ, size * 1.1, pick(i), { arc: 0.2, yaw });
    }
    if (layout.blast) {
      const radius = (layout.blast + 0.5) * CELL_SIZE, shards = Math.min(14, 6 + layout.blast * 3);
      this.emit(spec.shape === 'beam' || spec.shape === 'slash' ? 'orb' : spec.shape, LINE, now + 0.04, 0.2, ax, 2.2, az, bx, 1.2, bz, size * 1.5, c1, { arc: 2, yaw });
      this.emit('ring', GROW, land, 0.5, bx, 0.16, bz, bx, 0.16, bz, 0.5, c1, { grow: radius });
      this.emit('ring', GROW, land + 0.08, 0.42, bx, 0.18, bz, bx, 0.18, bz, 0.3, c2, { grow: radius * 0.7 });
      for (let i = 0; i < shards; i++) {
        const angle = e.serial + i * Math.PI * 2 / shards, rx = bx + Math.cos(angle) * radius * 0.92, rz = bz + Math.sin(angle) * radius * 0.92;
        if (spec.shape === 'beam') this.emit('beam', SPAN, land, 0.4, bx, 0.5, bz, rx, 0.5, rz, 0.14, pick(i)); // web / spokes
        else if (spec.shape === 'slash') this.emit('slash', SWEEP, land + i * 0.01, 0.4, bx + Math.cos(angle) * radius * 0.6, 1.0, bz + Math.sin(angle) * radius * 0.6, 0, 0, 0, 1.0, pick(i), { yaw: Math.atan2(Math.cos(angle), Math.sin(angle)), amp: 0.8 });
        else this.emit(spec.shape, BURST, land, 0.42, bx, 1.2, bz, rx, 0.5, rz, size, pick(i), { arc: 1.4, yaw: Math.atan2(Math.cos(angle), Math.sin(angle)) });
      }
    }
    if (layout.everyEnemy) enemies.slice(0, 12).forEach((u, i) => {
      const ux = boardToWorld(u.x), uz = boardToWorld(u.z), t0 = now + 0.08 + i * 0.03;
      if (spec.shape === 'beam') this.emit('beam', SPAN, t0, 0.4, ux, 6.5, uz, ux, 0.3, uz, 0.34, pick(i)); // light pillars
      else this.emit(spec.shape, DROP, t0, 0.3, ux, 1.4, uz, ux, 1.4, uz, size * 1.1, pick(i), { arc: 5.5, mode: MODES[spec.shape] === ALONG ? FACE : undefined });
      this.emit('ring', GROW, t0 + 0.28, 0.3, ux, 0.16, uz, ux, 0.16, uz, 0.3, pick(i), { grow: 1.4 });
    });
    if (layout.single) {
      this.emit(spec.shape === 'slash' ? 'shard' : spec.shape, LINE, now + 0.04, 0.2, ax + fx, 1.8, az + fz, bx, 1.4, bz, size * 1.8, c1, { arc: 0.5, yaw });
      for (let i = 0; i < 7; i++) { const angle = e.serial + i * Math.PI * 2 / 7;
        this.emit(spec.shape === 'beam' ? 'shard' : spec.shape, BURST, land, 0.4, bx, 1.4, bz, bx + Math.cos(angle) * 2, 0.6, bz + Math.sin(angle) * 2, size * 0.9, pick(i), { arc: 1.3, yaw: Math.atan2(Math.cos(angle), Math.sin(angle)) }); }
      this.emit('ring', GROW, land, 0.36, bx, 0.16, bz, bx, 0.16, bz, 0.4, c1, { grow: 2.1 });
    }
    if (layout.marked) for (const u of enemies) if (u.magic.markedUntil >= b.tick && u !== target)
      this.emit('shard', DROP, land, 0.3, boardToWorld(u.x), 1.4, boardToWorld(u.z), boardToWorld(u.x), 1.4, boardToWorld(u.z), size * 1.2, c2, { arc: 5, mode: FACE });
    if (layout.aura) this.emit('ring', GROW, now + 0.05, 0.55, ax, 0.2, az, ax, 0.2, az, 0.6, c2, { grow: (layout.aura + 0.5) * CELL_SIZE });
    allies.forEach((u, i) => {
      const ux = boardToWorld(u.x), uz = boardToWorld(u.z);
      if (u !== src) this.emit(spec.shape === 'beam' || spec.shape === 'slash' ? 'orb' : spec.shape, LINE, now + 0.05 + i * 0.02, 0.26, ax, 2.4, az, ux, 2.2, uz, size * 0.7, pick(i), { arc: 1.8 });
      for (let j = 0; j < 3; j++) this.emit(spec.shape === 'beam' || spec.shape === 'slash' ? 'star' : spec.shape, RISE, land + 0.05 + j * 0.06, 0.45, ux, 1.0, uz, ux, 1.0, uz, size * 0.6, pick(i + j), { arc: 2.2, amp: 0.8, mode: FACE });
    });
  }

  /** Status feedback from what actually changed on each fighter this tick. */
  private statuses(b: Battle, now: number) {
    for (const u of b.fighters) {
      const key = cueKey(u.side, u.id), before = this.previous.get(key), x = boardToWorld(u.x), z = boardToWorld(u.z);
      let up = 0, down = 0; for (const f of u.magic.buffs) if (f.amount > 0) up++; else down++;
      if (before) {
        const still = this.reduced, icon = (shape: FxShape, colour: string, size = 0.3) => this.emit(shape, STAY, now, 0.45, x, 3.3, z, x, 3.3, z, size, colour);
        if (u.hp <= 0 && before.hp > 0) {
          cue(u).diedAt = now; const c = EFFECT_SPECS[u.kind].attack.colours;
          if (still) icon('star', TOY_COLOURS.cream); else { this.impact('confetti', x, z, now + 0.1, c[0], c[1], 1.2); this.impact('stars', x, z, now + 0.1, c[0], c[1], 0.9); }
        }
        if (u.hp > 0) {
          if (u.hp > before.hp) { if (still) icon('plus', STATUS_COLOURS.heal); else for (let i = 0; i < 3; i++) this.emit('plus', RISE, now + 0.15 + i * 0.07, 0.5, x, 1.6, z, x, 1.6, z, 0.24, STATUS_COLOURS.heal, { arc: 2, amp: 0.7 }); }
          if (u.shield > before.shield) { this.emit('ring', GROW, now + 0.12, 0.45, x, 0.2, z, x, 0.2, z, still ? 1.5 : 0.7, STATUS_COLOURS.shield, { grow: 1.5 });
            if (!still) for (let i = 0; i < 4; i++) this.emit('disc', ORBIT, now + 0.12, 0.5, x, 0.8, z, x, 2.2, z, 0.2, STATUS_COLOURS.shield, { amp: 1.25, seed: i * H }); }
          if (u.stunnedUntil > b.tick) { if (still) icon('star', STATUS_COLOURS.stun); else for (let i = 0; i < 3; i++) this.emit('star', ORBIT, now, 0.5, x, 3.3, z, x, 3.3, z, 0.24, STATUS_COLOURS.stun, { amp: 0.75, seed: i * 2.1, mode: FLAT }); }
          if (u.poison > 0 && !still) for (let i = 0; i < 2; i++) this.emit('orb', RISE, now + i * 0.18, 0.45, x, 1.2, z, x, 1.2, z, 0.17, STATUS_COLOURS.poison, { arc: 1.6, amp: 0.6 });
          if (u.magic.markedUntil > before.marked) { this.emit('ring', GROW, now + 0.1, 0.45, x, 0.22, z, x, 0.22, z, still ? 1.2 : 2.2, STATUS_COLOURS.mark, { grow: 1.2 });
            this.emit('plus', still ? STAY : DROP, now + 0.1, 0.45, x, 3.3, z, x, 3.3, z, 0.28, STATUS_COLOURS.mark, { arc: 1.5, spin: 0, yaw: 0 }); }
          if (u.magic.silencedUntil > before.silenced) for (const d of [-1, 1]) this.emit('beam', SPAN, now + 0.1, 0.5, x - 0.55, 3.3 + 0.45 * d, z, x + 0.55, 3.3 - 0.45 * d, z, 0.16, STATUS_COLOURS.silence);
          if (!still && up > before.up) for (let i = 0; i < 3; i++) this.emit('star', RISE, now + 0.2 + i * 0.06, 0.45, x, 0.8, z, x, 0.8, z, 0.16, STATUS_COLOURS.buff, { arc: 2.4, amp: 0.9 });
          if (!still && down > before.down) for (let i = 0; i < 3; i++) this.emit('drop', RISE, now + 0.2 + i * 0.06, 0.45, x, 3.2, z, x, 3.2, z, 0.18, STATUS_COLOURS.debuff, { arc: -2, amp: 0.8 });
        }
        before.hp = u.hp; before.shield = u.shield; before.marked = u.magic.markedUntil; before.silenced = u.magic.silencedUntil; before.up = up; before.down = down;
      } else this.previous.set(key, { hp: u.hp, shield: u.shield, marked: u.magic.markedUntil, silenced: u.magic.silencedUntil, up, down });
    }
  }

  private tick(b: Battle, now: number) {
    const find = (id: number, x: number, z: number) => b.fighters.find(u => u.id === id && u.x === x && u.z === z) ?? b.fighters.find(u => u.id === id);
    for (const e of b.attacks) {
      const src = find(e.from, e.x, e.z);
      const target = b.fighters.find(u => u.id === e.to && (!src || u.side !== src.side)) ?? b.fighters.find(u => u.id === e.to);
      if (src) { const c = cue(src); c.ranged = ROSTER[src.kind].range > 1; if (e.spell) c.castAt = now; else c.attackAt = now; }
      if (e.spell) this.cast(e, src, target, b, now); else this.basic(e, src, target, b, now);
    }
    for (const hit of b.damages) { const u = b.fighters.find(f => f.id === hit.unit && f.x === hit.x && f.z === hit.z); if (u) cue(u).hurtAt = now + 0.18; }
    this.statuses(b, now);
  }

  // ───────────── per-frame playback ─────────────
  private where(p: Particle, path: number, t: number, out: THREE.Vector3) {
    const x = p.ax + (p.bx - p.ax) * t, y = p.ay + (p.by - p.ay) * t, z = p.az + (p.bz - p.az) * t;
    const length = Math.hypot(p.bx - p.ax, p.bz - p.az) || 1, px = (p.bz - p.az) / length, pz = -(p.bx - p.ax) / length;
    switch (path) {
      case LINE: return out.set(x, y + Math.sin(Math.PI * t) * p.arc, z);
      case BOUNCE: return out.set(x, p.by - 0.9 + Math.abs(Math.sin(Math.PI * t * 3)) * p.arc * (1 - t * 0.5) + (p.ay - p.by) * (1 - t), z);
      case SPIRAL: { const a = t * Math.PI * 4 + p.seed, k = Math.sin(Math.PI * t) * p.amp; return out.set(x + px * Math.cos(a) * k, y + Math.sin(a) * k, z + pz * Math.cos(a) * k); }
      case ZIGZAG: { const k = Math.sin(t * Math.PI * 5 + p.seed) * p.amp * Math.sin(Math.PI * t); return out.set(x + px * k, y, z + pz * k); }
      case BOOMERANG: { const u = Math.sin(Math.PI * t), k = Math.sin(Math.PI * 2 * t) * p.amp; return out.set(p.ax + (p.bx - p.ax) * u + px * k, p.ay + (p.by - p.ay) * u, p.az + (p.bz - p.az) * u + pz * k); }
      case DROP: return out.set(p.bx, p.by + (1 - t) * (1 - t) * p.arc, p.bz);
      case RISE: { const a = p.seed + t * 5; return out.set(p.ax + Math.cos(a) * p.amp * (0.4 + 0.6 * t), p.ay + t * p.arc, p.az + Math.sin(a) * p.amp * (0.4 + 0.6 * t)); }
      case BURST: { const u = easeOut(t); return out.set(p.ax + (p.bx - p.ax) * u, p.ay + (p.by - p.ay) * u + Math.sin(Math.PI * t) * p.arc, p.az + (p.bz - p.az) * u); }
      case ORBIT: { const a = p.seed + t * 5.5; return out.set(p.ax + Math.cos(a) * p.amp, p.ay + (p.by - p.ay) * t, p.az + Math.sin(a) * p.amp); }
      case JAB: { const u = t < 0.45 ? easeOut(t / 0.45) : 1 - (t - 0.45) / 0.55; return out.set(p.ax + (p.bx - p.ax) * u * 0.8, p.ay + (p.by - p.ay) * u, p.az + (p.bz - p.az) * u * 0.8); }
      case ELL: return t < 0.5 ? out.set(p.ax + (p.bx - p.ax) * t * 2, p.ay + Math.sin(Math.PI * t) * 0.8, p.az) : out.set(p.bx, p.ay + (p.by - p.ay) * (t * 2 - 1) + Math.sin(Math.PI * t) * 0.8, p.az + (p.bz - p.az) * (t * 2 - 1));
      case SWEEP: { const a = p.yaw + Math.PI + (t - 0.5) * 2 * p.amp; return out.set(p.ax + Math.sin(a) * p.arc, p.ay, p.az + Math.cos(a) * p.arc); }
      default: return out.set(p.ax, p.ay, p.az);
    }
  }

  private place(p: Particle, t: number) {
    const obj = this.obj, envelope = Math.min(1, t * 7) * (t > 0.72 ? (1 - t) / 0.28 : 1);
    obj.rotation.set(0, 0, 0);
    if (p.shape === RING && p.path === GROW) {
      const radius = p.size + (p.grow - p.size) * easeOut(Math.min(1, t * 1.6));
      obj.position.set(p.ax, p.ay, p.az); obj.scale.set(radius, 1, radius); return;
    }
    if (p.path === TETHER || p.path === SPAN) {
      if (p.path === TETHER) this.where(p, p.sub, t, this.here); else this.here.set(p.bx, p.by, p.bz);
      const length = Math.hypot(this.here.x - p.ax, this.here.y - p.ay, this.here.z - p.az);
      obj.position.set((p.ax + this.here.x) / 2, (p.ay + this.here.y) / 2, (p.az + this.here.z) / 2); obj.lookAt(this.here);
      const thick = p.size * (p.path === SPAN ? envelope : 1); obj.scale.set(thick, thick, Math.max(0.01, length)); return;
    }
    this.where(p, p.path, t, this.here); obj.position.copy(this.here);
    const size = p.size * SCALE * envelope * (1 + (p.grow - 1) * t);
    if (p.shape === BEAM) obj.scale.set(p.size * 0.6 * envelope, p.size * 0.6 * envelope, p.mode === FLAT ? 1.6 : p.len * SCALE);
    else if (p.shape === RING) obj.scale.setScalar(p.size * SCALE * (0.6 + t) * envelope);
    else obj.scale.setScalar(size);
    switch (p.mode) {
      case ALONG: case ROLL: {
        if (p.path === STAY || p.path === DROP || p.path === RISE) { obj.rotation.set(p.path === DROP ? H : -H, 0, 0); break; }
        if (p.path === JAB || p.path === SWEEP) obj.rotation.set(0, p.path === SWEEP ? p.yaw + (t - 0.5) * 2 * p.amp : p.yaw, 0);
        else { this.where(p, p.path, t + 0.03, this.next); obj.lookAt(this.next); }
        if (p.mode === ROLL) { if (p.shape === DISC) { obj.rotateZ(H); obj.rotateY(t * 14); } else if (p.shape === GEAR) { obj.rotateY(H); obj.rotateZ(t * 14); } }
        else if (p.shape === RING) obj.rotateX(H);
        else if (p.spin) obj.rotateZ(t * p.spin);
        break;
      }
      case FLAT: obj.rotation.set(0, p.path === SWEEP && p.shape === SLASH ? p.yaw + (t - 0.5) * 2 * p.amp : p.yaw + t * p.spin, 0); break;
      case TUMBLE: obj.rotation.set(p.seed + t * p.spin, t * p.spin * 0.7, p.seed * 1.3); break;
      default: obj.rotation.set(-0.85, 0, p.spin ? p.seed + t * p.spin : 0); break;
    }
  }

  frame(s: SquadState | null, localId: string) {
    const live = s?.kind === 'toy-squad' && s.phase !== 'build' ? s.battles.find(b => b.owner === localId) : undefined;
    const now = s ? s.t / 1000 : 0, battle = live && s ? `${s.seed}:${s.round}` : '';
    if (battle !== this.battle) { this.battle = battle; this.clear(); }
    if (live && s) { const key = `${battle}:${live.tick}`; if (key !== this.seen) { this.seen = key; this.tick(live, now); } }
    this.counts.fill(0);
    for (const p of this.pool) {
      if (!p.on) continue;
      const t = (now - p.t0) / p.life;
      if (t >= 1 || t < -20) { p.on = false; continue; }
      if (t < 0 || this.counts[p.shape] >= this.meshes[p.shape].instanceMatrix.count) continue;
      this.place(p, t); this.obj.updateMatrix();
      const mesh = this.meshes[p.shape], i = this.counts[p.shape]++;
      mesh.setMatrixAt(i, this.obj.matrix); mesh.setColorAt(i, p.colour);
    }
    this.meshes.forEach((mesh, i) => {
      const shown = this.counts[i]; mesh.count = shown; mesh.visible = shown > 0;
      if (shown) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    });
  }
}

export function SquadFx({ getState, localId }: { getState: () => SquadState | null; localId: string }) {
  const engine = useMemo(() => new FxEngine(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => () => { engine.clear(); engine.dispose(); }, [engine]);
  useEffect(() => { exposeDebug({ squadFx: { active: () => engine.active, draws: () => engine.draws } }); }, [engine]);
  useFrame(() => engine.frame(getState(), localId));
  return <primitive object={engine.group} />;
}
