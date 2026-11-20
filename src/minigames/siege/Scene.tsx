/**
 * Toybox Siege renderer. Presentation only: reads the rules state every frame, never writes it.
 *
 * Only one board is drawn: your own, or (once out, if you choose to) the board you are watching. In the
 * final arena that board is the shared arena, with every toy still fighting on it.
 * Everything that comes in numbers is an InstancedMesh sized to the gameplay cap, so the cost is
 * bounded: one draw call per swarm kind, projectile kind, gem kind and effect shape. The engine is
 * a plain object built once (`SiegeView`) and driven from one `useFrame`; nothing is allocated per
 * frame and nothing touches React state. Effect shapes and toy geometry come from Toy Squad
 * (`fxShapeGeometry`, `bakeParts`, `toyGeometry`), so both games share one look.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { playToyCue, sfx } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { useGame } from '../../game/store';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { fxShapeGeometry } from '../toysquad/Fx';
import { TOY_MATERIAL, UNLIT_VERTEX_MATERIAL, bakeParts, toyGeometry } from '../toysquad/toys';
import { ARENA_HALF, BIGS, FINALE, boardCounts, viewedBoard, viewedPlayer, weaponStats, yoyoAt, type Board, type SiegePlayer, type SiegeState } from './rules';
import { BIG_MODEL, CHEST_PARTS, CLASS_PARTS, MOB_PARTS, SNACK_PARTS } from './models';
import { ARENA, CLASS_COLOUR, FX, HURT_TINT, RING, SHOT_COLOUR, WEAPON_COLOUR, gemColour } from './look';
import { CueLimiter, WEAPON_GAIN, eventCue, type SiegeCue } from './sounds';
import type { ClassId } from './config';

const H = Math.PI / 2;
const WHITE = new THREE.Color(PALETTE.white);
const colours = new Map<string, THREE.Color>();
const tint = (hex: string) => { let c = colours.get(hex); if (!c) { c = new THREE.Color(hex); colours.set(hex, c); } return c; };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

const classGeometry: Partial<Record<ClassId, THREE.BufferGeometry>> = {};
const geometryFor = (cls: ClassId) => (classGeometry[cls] ??= cls === 'warrior' ? toyGeometry('soldier') : bakeParts(CLASS_PARTS[cls]));
let mobGeometry: THREE.BufferGeometry[] | null = null;
let chestGeometry: THREE.BufferGeometry | null = null;
let snackGeometry: THREE.BufferGeometry | null = null;
let quiltTexture: THREE.CanvasTexture | null = null;

/** A code-drawn patchwork quilt for the play mat (original pattern, palette colours). */
function quilt(): THREE.CanvasTexture | null {
  if (quiltTexture || typeof document === 'undefined') return quiltTexture;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const n = 4, w = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = ARENA.patches[(i * 3 + j * 5 + (i * j) % 3) % ARENA.patches.length];
    g.fillRect(i * w, j * w, w, w);
    g.fillStyle = 'rgba(255,249,238,0.06)';
    if ((i + j) % 3 === 0) for (let k = 0; k < 4; k++) g.fillRect(i * w + 8 + k * 14, j * w + 8, 6, w - 16);
  }
  g.strokeStyle = 'rgba(244,232,206,0.55)'; g.lineWidth = 2; g.setLineDash([6, 5]);
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w + 3, 0); g.lineTo(i * w + 3, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * w + 3); g.lineTo(256, i * w + 3); g.stroke(); }
  quiltTexture = new THREE.CanvasTexture(c);
  quiltTexture.wrapS = quiltTexture.wrapT = THREE.RepeatWrapping;
  quiltTexture.repeat.set(5.5, 5.5);
  quiltTexture.colorSpace = THREE.SRGBColorSpace;
  quiltTexture.anisotropy = 4;
  return quiltTexture;
}

const RING_GEOMETRY = new THREE.RingGeometry(0.86, 1, 36).rotateX(-H);
const DISC_GEOMETRY = new THREE.CircleGeometry(1, 24).rotateX(-H);
/** A 150° swing arc centred on +z (after the flat rotation, theta −90° points at +z). */
const ARC_GEOMETRY = new THREE.RingGeometry(0.55, 1, 20, 1, -H - (150 * Math.PI) / 360, (150 * Math.PI) / 180).rotateX(-H);
const fade = (opacity: number, colour: string = PALETTE.white) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const FX_FLAT = fade(0.55);
const FX_SOFT = fade(0.3);
const SHADOW = fade(0.28, PALETTE.ink);
const TELEGRAPH = fade(0.42, FX.telegraph);
const GHOST_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
const HURT_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: HURT_TINT, emissiveIntensity: 0.7 });
/**
 * The same look as TOY_MATERIAL, for the single (non-instanced) toys: the hero, elites, rivals. One
 * material shared by instanced and plain meshes makes three.js rebuild its program-cache key (a long
 * string) every time the draw order switches between them, several times a frame.
 */
const SOLO_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
const BAR_BACK = new THREE.MeshBasicMaterial({ color: PALETTE.ink, toneMapped: false });
const BAR_FILL = new THREE.MeshBasicMaterial({ color: PALETTE.coral, toneMapped: false });
const BAR_GEOMETRY = new THREE.BoxGeometry(1, 0.22, 0.22);
/** A flat strip from the origin along +z, 1 long and 1 wide (Prism Ray beams, scaled per beam). */
const BEAM_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-H).translate(0, 0, 0.5);
const glow = (opacity: number) => new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
const BEAM_GLOW = glow(0.55);
const BEAM_CORE = glow(0.95);
/** Flame pools: a soft burning disc and a brighter rim. */
const FIRE_SOFT = fade(0.68);
const FIRE_RIM = fade(0.75);

interface Particle { on: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; shape: number; colour: THREE.Color; spin: number }

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) {
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  m.count = 0; m.frustumCulled = false; m.raycast = () => {}; m.name = name;
  m.setColorAt(0, WHITE); // allocate the colour buffer up front
  return m;
}

class SiegeView {
  readonly group = new THREE.Group();
  private readonly obj = new THREE.Object3D();
  private readonly mobs: THREE.InstancedMesh[];
  private readonly gems: THREE.InstancedMesh;
  private readonly snacks: THREE.InstancedMesh;
  private readonly corks: THREE.InstancedMesh;
  private readonly planes: THREE.InstancedMesh;
  private readonly shots: THREE.InstancedMesh;
  private readonly yoyos: THREE.InstancedMesh;
  private readonly marbles: THREE.InstancedMesh;
  /** Prism Ray beams (a wide glow and a hot core), flame pools (disc, rim, flame tongues), Boiler Heart rivets. */
  private readonly beamGlow: THREE.InstancedMesh;
  private readonly beamCore: THREE.InstancedMesh;
  private readonly fireDiscs: THREE.InstancedMesh;
  private readonly fireRims: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly rivets: THREE.InstancedMesh;
  private readonly flamesPerPool: number;
  private readonly mix = new THREE.Color();
  private readonly rings: THREE.InstancedMesh;
  private readonly arcs: THREE.InstancedMesh;
  private readonly discs: THREE.InstancedMesh;
  private readonly chests: THREE.InstancedMesh;
  private readonly chips: THREE.InstancedMesh;
  private readonly stars: THREE.InstancedMesh;
  private readonly hero = new THREE.Mesh(undefined, SOLO_MATERIAL);
  private readonly heroShadow = new THREE.Mesh(DISC_GEOMETRY, SHADOW);
  private readonly heroRing = new THREE.Mesh(RING_GEOMETRY, fade(0.7, PALETTE.honey));
  private readonly pickupRing = new THREE.Mesh(RING_GEOMETRY, fade(0.16, PALETTE.cream));
  private readonly bigs: { mesh: THREE.Mesh; back: THREE.Mesh; fill: THREE.Mesh; line: THREE.Mesh; shadow: THREE.Mesh; parts: THREE.Mesh[] }[] = [];
  private readonly ghosts: THREE.Mesh[] = [];
  /** Arena: the other toys still fighting, each with a class-coloured ring and a health bar. */
  private readonly rivals: { mesh: THREE.Mesh; ring: THREE.Mesh; shadow: THREE.Mesh; back: THREE.Mesh; fill: THREE.Mesh }[] = [];
  /** Under a summoned boss: its owner's colour. */
  private readonly allyRings: THREE.Mesh[] = [];
  private readonly heroBack = new THREE.Mesh(BAR_GEOMETRY, BAR_BACK);
  private readonly heroFill = new THREE.Mesh(BAR_GEOMETRY, BAR_FILL);
  private readonly particles: Particle[];
  private cursor = 0;
  // Per-slot memory to spot defeated enemies and fresh blasts (reset when the board on screen changes).
  private prevSerial: Int32Array; private prevX: Float32Array; private prevZ: Float32Array; private prevBlast: Int8Array; private prevProj: Int8Array; private prevBig: Int32Array; private prevBigX: Float32Array; private prevBigZ: Float32Array;
  private board: Board | null = null;
  readonly cam = { x: 0, z: 0, ready: false };
  readonly sounds: SiegeCue[] = [];
  /** The arena is on screen (the Scene swaps the quilt for the ring). */
  arena = false;
  private kills = 0;
  private readonly counts = [0, 0, 0, 0];

  constructor(caps: { mobs: number; projs: number; shots: number; gems: number; blasts: number; chests: number; bigs: number; fires: number }, private readonly low: boolean) {
    mobGeometry ??= MOB_PARTS.map((parts) => bakeParts(parts));
    chestGeometry ??= bakeParts(CHEST_PARTS);
    snackGeometry ??= bakeParts(SNACK_PARTS);
    this.mobs = mobGeometry.map((g, i) => instanced(g, TOY_MATERIAL, caps.mobs, `siege-mob-${i}`));
    this.gems = instanced(fxShapeGeometry('shard'), UNLIT_VERTEX_MATERIAL, caps.gems, 'siege-gems');
    this.snacks = instanced(snackGeometry, TOY_MATERIAL, 24, 'siege-snacks');
    this.corks = instanced(fxShapeGeometry('bolt'), UNLIT_VERTEX_MATERIAL, caps.projs, 'siege-corks');
    this.planes = instanced(fxShapeGeometry('dart'), UNLIT_VERTEX_MATERIAL, caps.projs, 'siege-planes');
    this.shots = instanced(fxShapeGeometry('orb'), UNLIT_VERTEX_MATERIAL, caps.shots, 'siege-shots');
    this.yoyos = instanced(fxShapeGeometry('disc'), UNLIT_VERTEX_MATERIAL, 48, 'siege-yoyos');
    this.marbles = instanced(fxShapeGeometry('orb'), UNLIT_VERTEX_MATERIAL, caps.blasts, 'siege-marbles');
    this.beamGlow = instanced(BEAM_GEOMETRY, BEAM_GLOW, caps.blasts, 'siege-beam-glow');
    this.beamCore = instanced(BEAM_GEOMETRY, BEAM_CORE, caps.blasts, 'siege-beam-core');
    this.fireDiscs = instanced(DISC_GEOMETRY, FIRE_SOFT, caps.fires, 'siege-fire-discs');
    this.fireRims = instanced(RING_GEOMETRY, FIRE_RIM, caps.fires, 'siege-fire-rims');
    this.flamesPerPool = low ? 2 : 3;
    this.flames = instanced(fxShapeGeometry('flame'), UNLIT_VERTEX_MATERIAL, caps.fires * this.flamesPerPool, 'siege-flames');
    this.rivets = instanced(fxShapeGeometry('orb'), UNLIT_VERTEX_MATERIAL, caps.projs, 'siege-rivets');
    this.rings = instanced(RING_GEOMETRY, FX_FLAT, caps.blasts + caps.bigs, 'siege-rings');
    this.arcs = instanced(ARC_GEOMETRY, FX_FLAT, caps.blasts, 'siege-arcs');
    this.discs = instanced(DISC_GEOMETRY, FX_SOFT, caps.blasts, 'siege-discs');
    this.chests = instanced(chestGeometry, TOY_MATERIAL, caps.chests, 'siege-chests');
    const pool = low ? 48 : 140;
    this.particles = Array.from({ length: pool }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, shape: 0, colour: WHITE, spin: 0 }));
    this.chips = instanced(fxShapeGeometry('chip'), UNLIT_VERTEX_MATERIAL, pool, 'siege-chips');
    this.stars = instanced(fxShapeGeometry('star'), UNLIT_VERTEX_MATERIAL, pool, 'siege-stars');
    for (const m of [...this.mobs, this.gems, this.snacks, this.corks, this.planes, this.shots, this.yoyos, this.marbles, this.rings, this.arcs, this.discs, this.chests, this.chips, this.stars,
      this.beamGlow, this.beamCore, this.fireDiscs, this.fireRims, this.flames, this.rivets]) this.group.add(m);
    this.prevSerial = new Int32Array(caps.mobs); this.prevX = new Float32Array(caps.mobs); this.prevZ = new Float32Array(caps.mobs);
    this.prevBlast = new Int8Array(caps.blasts); this.prevProj = new Int8Array(caps.projs); this.prevBig = new Int32Array(caps.bigs); this.prevBigX = new Float32Array(caps.bigs); this.prevBigZ = new Float32Array(caps.bigs);
    this.heroShadow.scale.setScalar(1.3); this.heroShadow.position.y = 0.09;
    this.heroRing.scale.setScalar(1.55); this.heroRing.position.y = 0.1;
    this.pickupRing.position.y = 0.08;
    for (const m of [this.hero, this.heroShadow, this.heroRing, this.pickupRing]) { m.raycast = () => {}; this.group.add(m); }
    for (let i = 0; i < caps.bigs; i++) {
      const mesh = new THREE.Mesh(undefined, SOLO_MATERIAL), back = new THREE.Mesh(BAR_GEOMETRY, BAR_BACK), fill = new THREE.Mesh(BAR_GEOMETRY, BAR_FILL);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-H).translate(0, 0, 0.5), TELEGRAPH), shadow = new THREE.Mesh(DISC_GEOMETRY, SHADOW);
      const parts = [mesh, back, fill, line, shadow];
      for (const m of parts) { m.visible = false; m.raycast = () => {}; this.group.add(m); }
      this.bigs.push({ mesh, back, fill, line, shadow, parts });
    }
    for (let i = 0; i < 8; i++) { const g = new THREE.Mesh(undefined, GHOST_MATERIAL); g.visible = false; g.raycast = () => {}; this.group.add(g); this.ghosts.push(g); }
    for (let i = 0; i < 8; i++) {
      const r = { mesh: new THREE.Mesh(undefined, SOLO_MATERIAL), ring: new THREE.Mesh(RING_GEOMETRY, fade(0.7, PALETTE.honey)), shadow: new THREE.Mesh(DISC_GEOMETRY, SHADOW), back: new THREE.Mesh(BAR_GEOMETRY, BAR_BACK), fill: new THREE.Mesh(BAR_GEOMETRY, BAR_FILL) };
      for (const m of Object.values(r)) { m.visible = false; m.raycast = () => {}; this.group.add(m); }
      this.rivals.push(r);
    }
    for (let i = 0; i < caps.bigs; i++) { const m = new THREE.Mesh(RING_GEOMETRY, fade(0.8, PALETTE.honey)); m.visible = false; m.raycast = () => {}; this.group.add(m); this.allyRings.push(m); }
    for (const m of [this.heroBack, this.heroFill]) { m.visible = false; m.raycast = () => {}; this.group.add(m); }
  }

  dispose() {
    for (const o of this.group.children) if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    for (const b of this.bigs) b.line.geometry.dispose();
    for (const m of [...this.rivals.map((r) => r.ring), ...this.allyRings]) (m.material as THREE.Material).dispose();
  }

  /** A toy's health bar over its head (arena only). */
  private bar(back: THREE.Mesh, fill: THREE.Mesh, x: number, z: number, k: number, on: boolean) {
    back.visible = fill.visible = on;
    if (!on) return;
    const top = 4.6, wide = 3;
    k = Math.min(1, Math.max(0, k));
    back.position.set(x, top, z); back.scale.set(wide, 1, 1);
    fill.position.set(x - (wide * (1 - k)) / 2, top + 0.02, z + 0.02); fill.scale.set(Math.max(0.001, wide * k), 1.15, 1.15);
  }

  private burst(x: number, y: number, z: number, n: number, colour: string, shape: number, speed = 9, size = 0.32) {
    const c = tint(colour);
    for (let k = 0; k < n; k++) {
      const p = this.particles[this.cursor]; this.cursor = (this.cursor + 1) % this.particles.length;
      const a = (k / n) * Math.PI * 2 + this.cursor * 0.7, up = 0.6 + ((this.cursor * 37) % 10) / 10;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * 0.5; p.vz = Math.sin(a) * speed * 0.5; p.vy = speed * up;
      p.age = 0; p.life = 0.55; p.size = size; p.shape = shape; p.colour = c; p.spin = 6 + (k % 3) * 3;
    }
  }

  private put(mesh: THREE.InstancedMesh, i: number, colour?: THREE.Color) {
    this.obj.updateMatrix();
    mesh.setMatrixAt(i, this.obj.matrix);
    if (colour) mesh.setColorAt(i, colour);
  }
  /** Show the first `n` instances and upload only those (not the whole pool sized to the gameplay cap). */
  private finish(mesh: THREE.InstancedMesh, n: number) {
    mesh.count = n; mesh.visible = n > 0;
    if (!n) return;
    const m = mesh.instanceMatrix;
    m.clearUpdateRanges(); m.addUpdateRange(0, n * 16); m.needsUpdate = true;
    const c = mesh.instanceColor;
    if (c) { c.clearUpdateRanges(); c.addUpdateRange(0, n * 3); c.needsUpdate = true; }
  }

  frame(s: SiegeState | null, localId: string, dt: number) {
    this.sounds.length = 0;
    const viewed = s && s.kind === 'toybox-siege' ? viewedPlayer(s, localId) : undefined;
    const b = s && viewed ? viewedBoard(s, viewed) : null;
    if (!s || !viewed || !b) { this.group.visible = false; return; }
    this.group.visible = true;
    const switched = b !== this.board;
    if (switched) {
      this.board = b;
      this.prevSerial.fill(0); this.prevBlast.fill(0); this.prevBig.fill(0); this.prevProj.fill(1);
      for (const p of this.particles) p.on = false;
      this.cam.ready = false;
    }
    const bt = b.bt, sec = bt / 1000, obj = this.obj, inArena = b === s.arena;
    this.arena = inArena;
    // ---------------- the toy on screen
    const hero = viewed.cls ? geometryFor(viewed.cls) : null;
    this.hero.visible = !!hero;
    if (hero) {
      this.hero.geometry = hero;
      const moving = Math.hypot(viewed.ax, viewed.ay) > 0.1 && (viewed.status === 'alive' || viewed.status === 'arena' || viewed.status === 'prep') && !viewed.choice;
      const blink = viewed.status === 'alive' && bt < viewed.invuln && Math.floor(bt / 80) % 2 === 0;
      const fallen = viewed.status === 'downed' || viewed.status === 'ghost';
      this.hero.position.set(viewed.x, moving ? Math.abs(Math.sin(sec * 11)) * 0.25 : 0, viewed.z);
      this.hero.rotation.set(fallen ? -H * 0.9 : 0, Math.atan2(viewed.fx, viewed.fz), moving ? Math.sin(sec * 11) * 0.08 : 0);
      // A toy out of the run lies where it fell on its own board (its ghost hovers above); in the arena it is gone.
      this.hero.visible = !blink && !(inArena && viewed.status === 'ghost');
      this.hero.material = inArena && bt - viewed.hurtAt < 110 && Math.floor(bt / 70) % 2 === 0 ? HURT_MATERIAL : SOLO_MATERIAL;
    }
    this.bar(this.heroBack, this.heroFill, viewed.x, viewed.z, Math.max(0, viewed.hp / viewed.stat.maxHp), inArena && viewed.status === 'arena');
    this.heroShadow.position.set(viewed.x, 0.09, viewed.z);
    this.heroRing.position.set(viewed.x, 0.1, viewed.z);
    (this.heroRing.material as THREE.MeshBasicMaterial).color.set(viewed.cls ? CLASS_COLOUR[viewed.cls] : PALETTE.honey);
    this.heroRing.visible = viewed.status === 'alive' || viewed.status === 'downed' || viewed.status === 'prep' || viewed.status === 'arena';
    this.pickupRing.visible = viewed.status === 'alive';
    this.pickupRing.position.set(viewed.x, 0.08, viewed.z); this.pickupRing.scale.setScalar(viewed.stat.pickup);

    // ---------------- the swarm
    const counts = this.counts; counts.fill(0);
    for (let i = 0; i < b.mobs.length; i++) {
      const m = b.mobs[i];
      const before = this.prevSerial[i];
      if (before && (!m.on || m.serial !== before)) { this.kills++; if (this.kills % (this.low ? 2 : 1) === 0) this.burst(this.prevX[i], 0.8, this.prevZ[i], this.low ? 2 : 4, PALETTE.cream, 0, 7, 0.26); this.sounds.push('kill'); }
      this.prevSerial[i] = m.on ? m.serial : 0;
      if (!m.on) continue;
      this.prevX[i] = m.x; this.prevZ[i] = m.z;
      const mesh = this.mobs[m.kind], n = counts[m.kind]++;
      const yaw = Math.atan2(m.vx, m.vz), hop = m.kind === 0 ? Math.abs(Math.sin(sec * 7 + m.serial)) * 0.3 : m.kind === 3 ? 1.2 + Math.sin(sec * 3 + m.serial) * 0.4 : 0;
      obj.position.set(m.x, hop, m.z);
      obj.rotation.set(m.kind === 2 ? sec * 6 : 0, yaw, m.kind === 3 ? Math.sin(sec * 3 + m.serial) * 0.4 : 0, 'YXZ');
      obj.scale.setScalar(1);
      this.put(mesh, n, bt - m.hurt < 110 ? tint(HURT_TINT) : WHITE);
    }
    for (let k = 0; k < this.mobs.length; k++) this.finish(this.mobs[k], counts[k]);

    // ---------------- elites and the boss
    for (let i = 0; i < b.bigs.length; i++) {
      const g = b.bigs[i], slot = this.bigs[i];
      if (!slot) continue;
      const was = this.prevBig[i];
      if (was && (!g.on || g.serial !== was)) { this.burst(this.prevBigX[i], 2, this.prevBigZ[i], this.low ? 8 : 18, PALETTE.honey, 1, 14, 0.5); this.sounds.push('kill'); }
      this.prevBig[i] = g.on ? g.serial : 0;
      for (let k = 0; k < slot.parts.length; k++) slot.parts[k].visible = g.on;
      const ring = this.allyRings[i];
      if (ring) ring.visible = g.on && inArena;
      if (!g.on) continue;
      this.prevBigX[i] = g.x; this.prevBigZ[i] = g.z;
      const look = BIG_MODEL[g.type], d = BIGS[g.type];
      slot.mesh.geometry = toyGeometry(look.kind);
      slot.mesh.material = bt - g.hurt < 110 && Math.floor(bt / 70) % 2 === 0 ? HURT_MATERIAL : SOLO_MATERIAL; // flicker, so a big toy under fire still reads
      const shake = g.mode === 1 ? Math.sin(bt / 25) * 0.15 : 0;
      slot.mesh.position.set(g.x + shake, g.mode === 2 ? 0.4 : Math.abs(Math.sin(sec * 4)) * 0.2, g.z);
      slot.mesh.rotation.set(0, g.mode ? Math.atan2(g.aimX, g.aimZ) : Math.atan2(viewed.x - g.x, viewed.z - g.z), 0);
      const scale = look.scale * (inArena ? FINALE.ally.scale : 1);
      slot.mesh.scale.setScalar(scale);
      if (ring && inArena) {
        let owner: SiegePlayer | undefined;
        for (let j = 0; j < s.players.length; j++) if (s.players[j].id === g.from) owner = s.players[j];
        (ring.material as THREE.MeshBasicMaterial).color.set(owner?.cls ? CLASS_COLOUR[owner.cls] : PALETTE.honey);
        ring.position.set(g.x, 0.11, g.z); ring.scale.setScalar(g.r * 1.25);
      }
      slot.shadow.position.set(g.x, 0.09, g.z); slot.shadow.scale.setScalar(g.r * 1.1);
      const top = 3.6 * scale + 0.8, wide = g.r * 1.8;
      slot.back.position.set(g.x, top, g.z); slot.back.scale.set(wide, 1, 1);
      const k = Math.max(0, g.hp / g.maxHp);
      slot.fill.position.set(g.x - (wide * (1 - k)) / 2, top + 0.02, g.z + 0.02); slot.fill.scale.set(Math.max(0.001, wide * k), 1.15, 1.15);
      slot.line.visible = g.mode === 1;
      if (g.mode === 1) {
        const length = inArena ? (FINALE.ally.dashSpeed * FINALE.ally.dashMs) / 1000 + g.r : (d.dashSpeed * d.dashMs) / 1000 + g.r;
        slot.line.position.set(g.x, 0.12, g.z); slot.line.rotation.set(0, Math.atan2(g.aimX, g.aimZ), 0); slot.line.scale.set(g.r * 2, 1, length);
      }
    }

    // ---------------- gems, biscuits, chests
    let ng = 0, ns = 0;
    for (let i = 0; i < b.gems.length; i++) {
      const g = b.gems[i];
      if (!g.on) continue;
      if (g.kind === 1) { if (ns < 24) { obj.position.set(g.x, 0.1, g.z); obj.rotation.set(0, sec, 0); obj.scale.setScalar(1); this.put(this.snacks, ns++, WHITE); } continue; }
      obj.position.set(g.x, 0.6 + Math.sin(sec * 3 + g.x) * 0.15, g.z); obj.rotation.set(0, sec * 2 + g.z, 0);
      obj.scale.setScalar(g.v >= 10 ? 1.1 : g.v >= 2 ? 0.8 : 0.6);
      this.put(this.gems, ng++, tint(gemColour(g.v)));
    }
    this.finish(this.gems, ng); this.finish(this.snacks, ns);
    let nc = 0;
    for (let i = 0; i < b.chests.length; i++) { const c = b.chests[i]; if (!c.on) continue; obj.position.set(c.x, Math.abs(Math.sin(sec * 3)) * 0.3, c.z); obj.rotation.set(0, sec * 0.8, 0); obj.scale.setScalar(1.15); this.put(this.chests, nc++, WHITE); }
    this.finish(this.chests, nc);

    // ---------------- projectiles
    let nk = 0, np = 0, nb = 0, ny = 0, nv = 0;
    for (let i = 0; i < b.projs.length; i++) {
      const q = b.projs[i];
      if (!q.on) { this.prevProj[i] = 0; continue; }
      if (!this.prevProj[i]) { this.prevProj[i] = 1; this.sounds.push(q.kind === 0 ? 'pop' : q.kind === 2 ? 'rivets' : 'plane'); }
      obj.position.set(q.x, 1.4, q.z); obj.rotation.set(0, Math.atan2(q.vx, q.vz), 0);
      if (q.kind === 2) { obj.position.y = 1.1; obj.scale.setScalar(q.r * 1.5); this.put(this.rivets, nv++, tint(FX.rivet)); }
      else if (q.kind === 0) { obj.scale.setScalar(0.75); this.put(this.corks, nk++, tint(WEAPON_COLOUR.popgun)); }
      else { obj.rotation.set(0, Math.atan2(q.vx, q.vz), Math.sin(sec * 8) * 0.3); obj.scale.setScalar(1.3); this.put(this.planes, np++, tint(WEAPON_COLOUR.planes)); }
    }
    for (let i = 0; i < b.shots.length; i++) { const sh = b.shots[i]; if (!sh.on) continue; obj.position.set(sh.x, 1.2, sh.z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(sh.r * 1.6); this.put(this.shots, nb++, tint(SHOT_COLOUR)); }
    for (const q of s.players) {
      if (inArena ? q.status !== 'arena' : q !== viewed || q.status !== 'alive') continue;
      for (const w of q.weapons) {
        if (w.id !== 'yoyo') continue;
        const st = weaponStats(w);
        for (let k = 0; k < st.count && ny < 48; k++) { yoyoAt(q, w, k, this.obj.position); obj.position.y = 1.3; obj.rotation.set(0, sec * 9, 0); obj.scale.setScalar(w.evolved ? 1.2 : 0.95); this.put(this.yoyos, ny++, tint(k % 2 ? PALETTE.honey : WEAPON_COLOUR.yoyo)); }
      }
    }
    this.finish(this.corks, nk); this.finish(this.planes, np); this.finish(this.shots, nb); this.finish(this.yoyos, ny); this.finish(this.rivets, nv);

    // ---------------- area hits
    let nr = 0, na = 0, nd = 0, nm = 0, nl = 0;
    for (let i = 0; i < b.blasts.length; i++) {
      const k = b.blasts[i];
      if (!k.on) { this.prevBlast[i] = 0; continue; }
      const fresh = this.prevBlast[i] === 0;
      if (fresh) this.sounds.push(k.kind === 0 ? 'sweep' : k.kind === 1 ? 'chime' : k.kind === 2 ? 'marble' : k.kind === 4 ? 'laser' : 'revive');
      const landed = k.done && this.prevBlast[i] < 2;
      this.prevBlast[i] = k.done ? 2 : 1;
      const t = Math.min(1, k.age / k.life);
      if (k.kind === 4) { // Prism Ray: a glowing beam that narrows as it fades
        const wide = k.w * 2 * (1 - 0.7 * t), y = 1.25;
        obj.position.set(k.x, y, k.z); obj.rotation.set(0, k.ang, 0);
        obj.scale.set(wide * 2.4, 1, k.r); this.put(this.beamGlow, nl, tint(FX.laser));
        obj.scale.set(wide * 0.7, 1, k.r); obj.position.y = y + 0.02; this.put(this.beamCore, nl++, WHITE);
        if (landed && !this.low) this.burst(k.x + Math.sin(k.ang) * k.r * 0.5, 1.2, k.z + Math.cos(k.ang) * k.r * 0.5, 3, FX.laser, 1, 6, 0.24);
        continue;
      }
      if (k.kind === 0) { // bayonet sweep
        if (k.arc >= 360) { obj.position.set(k.x, 0.35, k.z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(k.r * (0.6 + 0.4 * easeOut(t))); this.put(this.rings, nr++, tint(FX.sweep)); }
        else { obj.position.set(k.x, 0.35, k.z); obj.rotation.set(0, k.ang + (t - 0.5) * 0.5, 0); obj.scale.setScalar(k.r * (0.7 + 0.3 * easeOut(t))); this.put(this.arcs, na++, tint(FX.sweep)); }
        continue;
      }
      if (!k.done) { // fuse: a target ring, and the falling marble or chime meteor itself
        const hot = k.burn > 0;
        obj.position.set(k.x, 0.12, k.z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(k.r * 0.9); this.put(this.rings, nr++, tint(k.kind === 2 ? FX.marble : hot ? FX.flame : FX.chime));
        if (k.kind === 2 || k.kind === 1) {
          const f = 1 - k.age / Math.max(1, k.delay), m = k.kind === 1;
          // Meteors come in at a slant, from up and behind (the camera's side), so a phone sees them fall.
          obj.position.set(k.x + (m ? f * 4 : 0), 0.8 + 14 * f * f, k.z + (m ? f * 6 : 0)); obj.scale.setScalar(m ? 1.6 : 1.3);
          this.put(this.marbles, nm++, tint(k.kind === 2 ? FX.marble : hot ? FX.flameCore : FX.chimeCore));
        }
        continue;
      }
      if (landed && !this.low) this.burst(k.x, 0.6, k.z, k.kind === 3 ? 10 : 4, k.kind === 1 ? FX.chimeCore : k.kind === 3 ? FX.revive : FX.marble, k.kind === 1 || k.kind === 3 ? 1 : 0, 8, 0.3);
      const u = (k.age - k.delay) / Math.max(1, k.life - k.delay);
      obj.position.set(k.x, 0.14, k.z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(k.r * (0.35 + 0.65 * easeOut(Math.min(1, u))));
      this.put(this.discs, nd++, tint(k.kind === 1 ? (k.burn > 0 ? FX.flame : FX.chime) : k.kind === 3 ? FX.revive : FX.marble));
      this.put(this.rings, nr++, tint(k.kind === 1 ? FX.chimeCore : FX.revive));
    }
    this.finish(this.rings, nr); this.finish(this.arcs, na); this.finish(this.discs, nd); this.finish(this.marbles, nm);
    this.finish(this.beamGlow, nl); this.finish(this.beamCore, nl);

    // ---------------- flame pools: a flickering disc, a bright rim and a few flame tongues each
    let nf = 0, nt = 0;
    const per = this.flamesPerPool;
    for (let i = 0; i < b.fires.length; i++) {
      const f = b.fires[i];
      if (!f.on) continue;
      const grow = Math.min(1, f.age / 180), fadeOut = Math.min(1, (f.life - f.age) / 450), k = grow * fadeOut;
      const flick = 0.5 + 0.5 * Math.sin(sec * 13 + i * 1.7);
      this.mix.copy(tint(FX.flame)).lerp(tint(FX.flameCore), flick * 0.35);
      obj.position.set(f.x, 0.13 + i * 0.001, f.z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(f.r * k);
      this.put(this.fireDiscs, nf, this.mix);
      obj.position.y = 0.15; obj.scale.setScalar(f.r * k * (0.97 + 0.05 * flick)); this.put(this.fireRims, nf++, tint(FX.flameCore));
      for (let j = 0; j < per; j++) {
        // Flame tongues about a centimetre and a half across and up to three tall, licking up and down.
        const a = j * ((Math.PI * 2) / per) + f.age * 0.0012 + i, d = f.r * 0.5 * (j === 0 ? 0.25 : 1);
        const h = (0.75 + 0.35 * Math.sin(sec * 9 + i * 2.3 + j * 1.9)) * k;
        obj.position.set(f.x + Math.cos(a) * d, 0.9 * h, f.z + Math.sin(a) * d); obj.rotation.set(0, a, 0); obj.scale.set(1.9 * k, 3.1 * h, 1.9 * k);
        this.put(this.flames, nt++, tint(j % 2 ? FX.flameCore : FX.flame));
      }
    }
    this.finish(this.fireDiscs, nf); this.finish(this.fireRims, nf); this.finish(this.flames, nt);

    // ---------------- ghosts watching this board (you can see the other ghosts)
    let gi = 0;
    for (const q of s.players) {
      // Ghosts watching this board; and a ghost on its own board (it has not chosen to watch others) hovers over its toy.
      if (inArena || q.status !== 'ghost' || !q.cls || gi >= this.ghosts.length || (q.watching !== viewed.id && !(q === viewed && !q.watching))) continue;
      const g = this.ghosts[gi++];
      g.visible = true; g.geometry = geometryFor(q.cls);
      g.position.set(viewed.x + q.gx + (gi - 4) * 0.01, 3.2 + Math.sin(sec * 2 + gi) * 0.5, viewed.z + q.gz);
      g.rotation.set(0, Math.sin(sec + gi) * 0.6, Math.sin(sec * 1.5 + gi) * 0.12);
    }
    for (; gi < this.ghosts.length; gi++) this.ghosts[gi].visible = false;

    // ---------------- arena: every other toy still fighting
    let ri = 0;
    if (inArena) for (const q of s.players) {
      if (q === viewed || q.status !== 'arena' || !q.cls || ri >= this.rivals.length) continue;
      const r = this.rivals[ri++];
      const moving = Math.hypot(q.ax, q.ay) > 0.1;
      r.mesh.visible = r.ring.visible = r.shadow.visible = true;
      r.mesh.geometry = geometryFor(q.cls);
      r.mesh.material = bt - q.hurtAt < 110 && Math.floor(bt / 70) % 2 === 0 ? HURT_MATERIAL : SOLO_MATERIAL;
      r.mesh.position.set(q.x, moving ? Math.abs(Math.sin(sec * 11 + ri)) * 0.25 : 0, q.z);
      r.mesh.rotation.set(0, Math.atan2(q.fx, q.fz), moving ? Math.sin(sec * 11 + ri) * 0.08 : 0);
      (r.ring.material as THREE.MeshBasicMaterial).color.set(CLASS_COLOUR[q.cls]);
      r.ring.position.set(q.x, 0.1, q.z); r.ring.scale.setScalar(1.4);
      r.shadow.position.set(q.x, 0.09, q.z); r.shadow.scale.setScalar(1.3);
      this.bar(r.back, r.fill, q.x, q.z, Math.max(0, q.hp / q.stat.maxHp), true);
    }
    for (; ri < this.rivals.length; ri++) { const r = this.rivals[ri]; r.mesh.visible = r.ring.visible = r.shadow.visible = r.back.visible = r.fill.visible = false; }

    // ---------------- particles (simulation-time when paused? they settle in real time; cosmetic only)
    let nchip = 0, nstar = 0;
    const step = Math.min(dt, 0.1);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.on) continue;
      p.age += step;
      if (p.age >= p.life) { p.on = false; continue; }
      p.vy -= 30 * step; p.x += p.vx * step; p.y = Math.max(0.1, p.y + p.vy * step); p.z += p.vz * step;
      const k = 1 - p.age / p.life;
      obj.position.set(p.x, p.y, p.z); obj.rotation.set(p.age * p.spin, p.age * p.spin * 0.7, 0); obj.scale.setScalar(p.size * (0.4 + 0.6 * k) * 2.2);
      if (p.shape === 0) this.put(this.chips, nchip++, p.colour); else this.put(this.stars, nstar++, p.colour);
    }
    this.finish(this.chips, nchip); this.finish(this.stars, nstar);
    // camera target
    if (!this.cam.ready) { this.cam.x = viewed.x; this.cam.z = viewed.z; this.cam.ready = true; }
    const follow = 1 - Math.exp(-dt * 6);
    this.cam.x += (viewed.x - this.cam.x) * follow; this.cam.z += (viewed.z - this.cam.z) * follow;
  }

  /** Called on level-up / evolve / revive events for the board on screen. */
  celebrate(p: SiegePlayer, colour: string) { this.burst(p.x, 2, p.z, this.low ? 6 : 14, colour, 1, 12, 0.36); }
}

function Arena() {
  const tex = useMemo(() => quilt(), []);
  const size = ARENA_HALF * 2;
  return <group>
    <mesh position={[0, -0.2, 0]} receiveShadow><boxGeometry args={[size + 6, 0.4, size + 6]} /><meshStandardMaterial color={ARENA.railDark} roughness={0.9} /></mesh>
    <mesh rotation={[-H, 0, 0]} position={[0, 0.03, 0]} receiveShadow><planeGeometry args={[size, size]} /><meshStandardMaterial map={tex} color={tex ? PALETTE.white : ARENA.mat} roughness={0.95} /></mesh>
    {([[0, -1], [0, 1], [-1, 0], [1, 0]] as const).map(([x, z], i) => (
      <mesh key={i} position={[x * (ARENA_HALF + 1.5), 0.9, z * (ARENA_HALF + 1.5)]} castShadow receiveShadow>
        <boxGeometry args={[x ? 3 : size + 6, 1.8, z ? 3 : size + 6]} /><meshStandardMaterial color={ARENA.rail} roughness={0.7} />
      </mesh>
    ))}
    {/* corner posts: chunky building blocks */}
    {([[-1, -1, PALETTE.coral], [1, -1, PALETTE.toyBlue], [-1, 1, PALETTE.honey], [1, 1, PALETTE.sage]] as const).map(([x, z, c], i) => (
      <mesh key={`b${i}`} position={[x * (ARENA_HALF + 1.5), 2.2, z * (ARENA_HALF + 1.5)]} castShadow><boxGeometry args={[4.4, 4.4, 4.4]} /><meshStandardMaterial color={c} roughness={0.5} /></mesh>
    ))}
  </group>;
}

let ringTexture: THREE.CanvasTexture | null = null;
/** The final arena's floor: a code-drawn felt ring mat (original pattern, palette colours). */
function ringMat(): THREE.CanvasTexture | null {
  if (ringTexture || typeof document === 'undefined') return ringTexture;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = RING.mat; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = RING.band; g.lineWidth = 14; g.strokeRect(12, 12, 232, 232);
  g.strokeStyle = RING.stitch; g.lineWidth = 2; g.setLineDash([7, 6]); g.strokeRect(24, 24, 208, 208); g.strokeRect(4, 4, 248, 248);
  g.setLineDash([]); g.fillStyle = RING.centre; g.beginPath(); g.arc(128, 128, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = RING.stitch; g.setLineDash([5, 5]); g.beginPath(); g.arc(128, 128, 40, 0, Math.PI * 2); g.stroke();
  ringTexture = new THREE.CanvasTexture(c);
  ringTexture.colorSpace = THREE.SRGBColorSpace;
  ringTexture.anisotropy = 4;
  return ringTexture;
}

/** The final arena: a felt ring mat with cotton-reel corner posts and elastic-band ropes. */
function Ring() {
  const tex = useMemo(() => ringMat(), []);
  const half = FINALE.half, size = half * 2, post = half + 0.8;
  const ropes: [number, string][] = [[1.1, RING.ropeLow], [2.2, RING.ropeHigh]];
  return <group>
    <mesh position={[0, -0.2, 0]} receiveShadow><boxGeometry args={[size + 5, 0.4, size + 5]} /><meshStandardMaterial color={ARENA.railDark} roughness={0.9} /></mesh>
    <mesh rotation={[-H, 0, 0]} position={[0, 0.03, 0]} receiveShadow><planeGeometry args={[size, size]} /><meshStandardMaterial map={tex} color={tex ? PALETTE.white : RING.mat} roughness={0.95} /></mesh>
    {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([x, z], i) => (
      <group key={i} position={[x * post, 0, z * post]}>
        <mesh position={[0, 1.6, 0]} castShadow><cylinderGeometry args={[1.1, 1.1, 3.2, 16]} /><meshStandardMaterial color={RING.thread[i]} roughness={0.8} /></mesh>
        {[0.15, 3.05].map((y) => <mesh key={y} position={[0, y, 0]} castShadow><cylinderGeometry args={[1.5, 1.5, 0.3, 16]} /><meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} /></mesh>)}
      </group>
    ))}
    {ropes.flatMap(([y, colour]) => ([[0, -1], [0, 1], [-1, 0], [1, 0]] as const).map(([x, z], i) => (
      <mesh key={`${y}-${i}`} position={[x * post, y, z * post]}><boxGeometry args={[x ? 0.25 : size + 1.6, 0.25, z ? 0.25 : size + 1.6]} /><meshStandardMaterial color={colour} roughness={0.5} /></mesh>
    )))}
  </group>;
}

const PLAY: Record<SiegeCue, () => void> = {
  kill: () => playToyCue('puff', 0.45), sweep: () => playToyCue('fan', WEAPON_GAIN.sweep), pop: () => playToyCue('button', WEAPON_GAIN.pop), chime: () => playToyCue('chime', WEAPON_GAIN.chime),
  marble: () => playToyCue('marble', WEAPON_GAIN.marble), plane: () => playToyCue('ribbon', WEAPON_GAIN.plane), hurt: () => playToyCue('hit', 0.8), level: () => sfx.promptIn(), card: () => sfx.click(),
  elite: () => playToyCue('warning'), boss: () => { playToyCue('warning'); sfx.windUp(12); }, chest: () => sfx.purchase(), evolve: () => sfx.musicBoxTune(),
  downed: () => playToyCue('out'), revive: () => sfx.windUp(9), ghost: () => sfx.eliminate(), victory: () => sfx.reward(), sent: () => playToyCue('storm'),
  incoming: () => playToyCue('warning'), blocked: () => sfx.reject(), start: () => sfx.bell(),
  laser: () => playToyCue('charge', WEAPON_GAIN.laser), rivets: () => playToyCue('stitch', WEAPON_GAIN.rivets),
  arena: () => { sfx.windUp(12); playToyCue('stitch'); }, ally: () => { playToyCue('storm'); sfx.windUp(8); }, ko: () => playToyCue('out', 0.6),
};

export function SiegeScene({ getState, localId }: MinigameSceneProps<SiegeState>) {
  const low = useGame((s) => s.quality === 'low');
  const { camera, gl } = useThree();
  // Nothing in a Siege match casts a moving shadow (toys, mobs and effects use blob shadows; the room and
  // the play mats are still), so the sun's shadow map is drawn when the set changes, not every frame:
  // on Balanced and High that is a whole depth pass of the room (about 50 draw calls into a 2048- or
  // 4096-texel map) saved per frame. Restored when the trial's scene unmounts.
  const shadowRefresh = useRef(3);
  useEffect(() => {
    const map = gl.shadowMap, before = map.autoUpdate;
    map.autoUpdate = false; map.needsUpdate = true;
    return () => { map.autoUpdate = before; map.needsUpdate = true; };
  }, [gl]);
  const view = useMemo(() => {
    const c = getState()?.config;
    // Sized for the busier of a board and the arena (twice the projectile pools, one summoned boss per toy).
    const players = getState()?.players.length ?? 8;
    return new SiegeView({ mobs: c?.mobCap ?? 150, projs: 2 * (c?.projectileCap ?? 96), shots: 2 * (c?.shotCap ?? 64), gems: c?.gemCap ?? 160, blasts: 2 * (c?.blastCap ?? 40), chests: c?.chestCap ?? 4, bigs: Math.max(c?.bigCap ?? 4, players), fires: 2 * (c?.fireCap ?? 24) }, low);
  }, [getState, low]);
  const limiter = useMemo(() => new CueLimiter(), []);
  useEffect(() => () => view.dispose(), [view]);
  useEffect(() => matchBus.on('event', (e) => {
    const s = getState();
    if (!s || s.kind !== 'toybox-siege') return;
    const viewed = viewedPlayer(s, localId);
    const cue = eventCue(e, localId, viewed?.id ?? localId);
    if (cue && limiter.allow(cue, s.t) && !useMatch.getState().paused) PLAY[cue]();
    if (viewed && e.id === viewed.id && (e.type === 'siege-level' || e.type === 'siege-evolve' || e.type === 'siege-revive')) view.celebrate(viewed, e.type === 'siege-revive' ? PALETTE.honey : PALETTE.white);
  }), [getState, localId, limiter, view]);
  useEffect(() => {
    exposeDebug({ siege: {
      counts: () => { const s = getState(); const v = s && viewedPlayer(s, localId); return s && v ? boardCounts(viewedBoard(s, v)) : null; },
      viewed: () => { const s = getState(); return s ? viewedPlayer(s, localId)?.id ?? null : null; },
    } });
  }, [getState, localId]);
  const quiltRef = useRef<THREE.Group>(null), ringRef = useRef<THREE.Group>(null);
  const shownArena = useRef<boolean | null>(null);
  useFrame((_, dt) => {
    const s = getState();
    view.frame(s, localId, dt);
    if (quiltRef.current) quiltRef.current.visible = !view.arena;
    if (ringRef.current) ringRef.current.visible = view.arena;
    // Redraw the shadow map for the first few frames (the set mounts with this scene) and when the set swaps.
    if (shownArena.current !== view.arena) { shownArena.current = view.arena; shadowRefresh.current = Math.max(shadowRefresh.current, 2); }
    if (shadowRefresh.current > 0) { shadowRefresh.current--; gl.shadowMap.needsUpdate = true; }
    if (s && !useMatch.getState().paused) for (const cue of view.sounds) if (limiter.allow(cue, s.t)) PLAY[cue]();
    const persp = camera as THREE.PerspectiveCamera;
    // About 50 cm across in landscape and 20 cm across (40 cm tall) in portrait, centred on the toy,
    // so a 3.5 cm toy still reads on a phone; enemies arrive (25–29 cm out) beyond the edge of the view.
    const distance = Math.max(34, 21 / persp.aspect) * (view.arena ? 1.12 : 1);
    camera.position.set(view.cam.x, distance, view.cam.z + distance * 0.42);
    camera.lookAt(view.cam.x, 0, view.cam.z - 1.5);
  });
  return <group>
    <group ref={quiltRef}><Arena /></group>
    <group ref={ringRef} visible={false}><Ring /></group>
    <primitive object={view.group} />
  </group>;
}
