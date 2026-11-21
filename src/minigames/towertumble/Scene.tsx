/**
 * Toy Tower Tumble on the tabletop: the viewed board (your own, or anyone's picked from the player
 * rail, read-only), its towers, the enemies on the path and the effects. Everything per-frame reads
 * the live rules state and plain objects; React only renders the fixed set of meshes once.
 *
 * Draw-call budget: board tiles, stands, pips, auras, hp bars and each enemy kind are instanced;
 * a tower is one mesh (its Toy Squad toy, one baked geometry); effects are pooled (Fx.tsx); status
 * badges are one instanced quad per status kind on screen (shared/statusIcons.ts).
 *
 * Input is plain DOM pointer events on the canvas: a press on one of your towers can drag it (move,
 * swap, merge); any other press pans the camera once it moves; a press that barely moves is a tap
 * (select); two fingers pinch-zoom and the wheel zooms, toward the fingers or the cursor. A drop
 * on (or, with a tower selected, a tap on) a same-tier tower never merges by itself: it opens the
 * HUD's Merge / Swap popup at that tower, and the board marks the landing square (a glowing honey
 * square, ring and arrow from the source). While the popup is open a press anywhere on the board
 * closes it (and only closes it, unless it becomes a pan). On a board you are only looking at, a tap
 * inspects a tower (read-only), and with a mouse, hovering one shows its floating tip.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { playToyCue, sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { drawQueuedPortrait } from '../toysquad/portraits';
import { TOY_COLOURS } from '../toysquad/models';
import { TOY_GLOW_MATERIAL, TOY_MATERIAL, UNLIT_VERTEX_MATERIAL, bakeParts, toyGeometry } from '../toysquad/toys';
import { BUILDABLE, GLIDE, PATH_CELLS, WALK, isBuildable, pointAt } from './board';
import { BOSSES, DAMAGE_CHECK, MAX_TIER, TIER_COLOURS, TOWERS, type EnemyKind } from './catalogue';
import { ENEMY_PARTS, ENEMY_SCALE, FLY_HEIGHT } from './models';
import { canMergeTowers, inCheck, towerAt, viewedBoard, type TdPlayer, type TdState } from './rules';
import { enemyStatus } from './status';
import { tumbleScreen, tumbleView } from './camera';
import { StatusIconBatch } from '../shared/statusIcons';
import { TAP_SLOP, type Ground } from '../shared/panZoom';
import { canMergeCells, cancelMerge, dropTower, inspectCell, liveChoice, tapCell, useTumbleUI } from './local';
import { BRIDGE, CELL, bw, groundY, worldCell } from './space';
import { TumbleFxLayer, tumbleFxRef } from './Fx';
import { eventCue, SHOT_VOICE, SHOT_VOICES_PER_TICK } from './sounds';

const MAX_TOWERS = BUILDABLE.length;
const ENEMY_KINDS: Exclude<EnemyKind, 'boss'>[] = ['walker', 'beetle', 'racer', 'marble', 'glider'];
const ENEMY_CAP = 64, BAR_CAP = 160;
const H = Math.PI / 2;

// ───────────── shared geometry and materials (built once) ─────────────
const white = (g: Parameters<typeof bakeParts>[0][number]['g'], p: [number, number, number], s: [number, number, number]) => ({ g, c: '#FFFFFF', p, s, r: [0, 0, 0] as [number, number, number], o: 'XYZ' as const });
const STAND = bakeParts([white('cyl', [0, 0.06, 0], [2.7, 0.12, 2.7]), white('cyl', [0, 0.16, 0], [2.3, 0.1, 2.3])]);
const PIP = bakeParts([{ g: 'gem', c: PALETTE.honey, p: [0, 0, 0], s: [0.32, 0.42, 0.32], r: [0, 0, 0], o: 'XYZ' }], 'lit');
const TILE = new THREE.BoxGeometry(CELL - 0.16, 0.24, CELL - 0.16);
const PATH_TILE = new THREE.BoxGeometry(CELL + 0.02, 0.14, CELL + 0.02);
const RING = new THREE.RingGeometry(0.86, 1, 40).rotateX(-H);
const BAR = new THREE.BoxGeometry(1, 0.16, 0.22);
const tileMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.95 });
const standMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 });
const barMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
const auraMat = new THREE.MeshBasicMaterial({ color: PALETTE.honey, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const ringMat = (c: string, opacity = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const SELECT_MAT = ringMat(PALETTE.white), CURSOR_MAT = ringMat(PALETTE.toyBlue, 0.8), TWIN_MAT = ringMat(PALETTE.honey), DROP_MAT = ringMat(PALETTE.honey, 0.9);
/** The Merge / Swap popup's landing square (a glowing honey square) and the arrow to it from the source tower. */
const LAND = new THREE.PlaneGeometry(CELL - 0.3, CELL - 0.3).rotateX(-Math.PI / 2);
const LAND_MAT = ringMat(PALETTE.honey, 0.5), ARROW_MAT = ringMat(PALETTE.honey, 1), ARROW_EDGE_MAT = ringMat(PALETTE.inkPurple, 1);
// Drawn over the toys (no depth test), so a tall tower never hides the arrow.
ARROW_MAT.depthTest = ARROW_EDGE_MAT.depthTest = false;
/** The arrow's flat shaft (unit length from x = 0 along +x, unit width) and head (base at x = 0, tip at x = 1, unit half-width). */
const SHAFT = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
const HEAD = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, -1), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)])).rotateX(-Math.PI / 2);
/** Arrow sizes in cm: honey fill with an ink edge. */
const AR = { shaft: 0.5, head: 1.1, half: 0.75, edge: 0.16 };
/** Lay the arrow group's four meshes (edge shaft, edge head, shaft, head) for a length `len` along +x. */
function layArrow(g: THREE.Group, len: number) {
  const [es, eh, sh, hd] = g.children, body = Math.max(0.1, len - AR.head), e = AR.edge;
  es.position.set(-e, 0, 0); es.scale.set(body + e, 1, AR.shaft + e * 2);
  eh.position.set(body - e * 1.4, 0, 0); eh.scale.set(AR.head + e * 2.4, 1, AR.half + e * 1.8);
  sh.scale.set(body, 1, AR.shaft);
  hd.position.set(body, 0, 0); hd.scale.set(AR.head, 1, AR.half);
}
let enemyGeometry: Record<string, THREE.BufferGeometry> | null = null;
const enemyGeo = () => (enemyGeometry ??= Object.fromEntries(ENEMY_KINDS.map((k) => [k, bakeParts(ENEMY_PARTS[k])])));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────── the watched board, resolved once per frame ─────────────
interface View { s: TdState | null; me: TdPlayer | undefined; board: TdPlayer | undefined; now: number }
const view: View = { s: null, me: undefined, board: undefined, now: 0 };
function readView(getState: () => TdState | null, localId: string): View {
  const s = getState();
  if (s?.kind !== 'tower-tumble') { view.s = null; view.me = view.board = undefined; return view; }
  view.s = s; view.now = s.t / 1000;
  view.me = s.players.find((p) => p.id === localId);
  const id = viewedBoard(s, localId, useTumbleUI.getState().watching);
  view.board = s.players.find((p) => p.id === id);
  return view;
}
/** Board edits are open: playing, not paused, and you are still in. */
const editable = (v: View) => !!v.me && !v.me.out && v.board === v.me && v.s?.phase !== 'over' && useMatch.getState().phase === 'playing' && !useMatch.getState().paused;

function ViewSync({ getState, localId }: { getState: () => TdState | null; localId: string }) {
  useFrame(() => { readView(getState, localId); });
  return null;
}

// ───────────── static tabletop: tray, felt squares, the path, toy box, chest, book bridge ─────────────
function BoardBase() {
  const tiles = useMemo(() => {
    const m = new THREE.InstancedMesh(TILE, tileMat, BUILDABLE.length), o = new THREE.Object3D(), c = new THREE.Color();
    BUILDABLE.forEach((cell, i) => {
      o.position.set(bw(cell % 8), 0.12, bw(Math.floor(cell / 8))); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set((cell % 8 + Math.floor(cell / 8)) % 2 ? PALETTE.felt : PALETTE.feltDark));
    });
    m.receiveShadow = true; m.raycast = () => {}; return m;
  }, []);
  const path = useMemo(() => {
    const m = new THREE.InstancedMesh(PATH_TILE, tileMat, PATH_CELLS.length), o = new THREE.Object3D(), c = new THREE.Color();
    PATH_CELLS.forEach((cell, i) => {
      o.position.set(bw(cell % 8), 0.07, bw(Math.floor(cell / 8))); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(i % 2 ? PALETTE.woodLight : TOY_COLOURS.cork));
    });
    m.receiveShadow = true; m.raycast = () => {}; return m;
  }, []);
  const size = CELL * 8;
  return <group>
    {/* wooden tray */}
    <mesh position={[0, -0.35, 0]} receiveShadow raycast={() => {}}><boxGeometry args={[size + 2.4, 0.7, size + 2.4]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    {[-1, 1].map((k) => <mesh key={`x${k}`} position={[k * (size / 2 + 0.6), 0.25, 0]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[1.2, 0.9, size + 2.4]} /><meshStandardMaterial color={PALETTE.woodDark} /></mesh>)}
    {[-1, 1].map((k) => <mesh key={`z${k}`} position={[0, 0.25, k * (size / 2 + 0.6)]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[size, 0.9, 1.2]} /><meshStandardMaterial color={PALETTE.woodDark} /></mesh>)}
    <primitive object={tiles} />
    <primitive object={path} />
    {/* stitched centre line along the path */}
    {WALK.pts.slice(1).map((b, i) => { const a = WALK.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) * CELL;
      return <mesh key={`seam${i}`} position={[(bw(a[0]) + bw(b[0])) / 2, 0.15, (bw(a[1]) + bw(b[1])) / 2]} rotation={[0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0]} raycast={() => {}}>
        <boxGeometry args={[0.12, 0.02, len]} /><meshBasicMaterial color={PALETTE.cream} /></mesh>; })}
    {/* the open book the path crosses */}
    <group position={[bw((BRIDGE.from + BRIDGE.to) / 2), 0, bw(BRIDGE.row)]}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[(BRIDGE.to - BRIDGE.from) * CELL, 0.4, CELL + 0.5]} /><meshStandardMaterial color={PALETTE.cream} /></mesh>
      <mesh position={[0, 0.06, 0]} raycast={() => {}}><boxGeometry args={[(BRIDGE.to - BRIDGE.from) * CELL + 0.5, 0.12, CELL + 1.0]} /><meshStandardMaterial color={PALETTE.coral} /></mesh>
      <mesh position={[0, 0.41, 0]} raycast={() => {}}><boxGeometry args={[0.08, 0.02, CELL + 0.4]} /><meshBasicMaterial color={PALETTE.inkPurple} /></mesh>
    </group>
    {/* the toy box the enemies climb out of */}
    <group position={[bw(-1.45), 0, bw(1)]}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[2.6, 2.2, 3.4]} /><meshStandardMaterial color={PALETTE.toyBlue} /></mesh>
      <mesh position={[-1.5, 2.6, 0]} rotation={[0, 0, 0.9]} castShadow raycast={() => {}}><boxGeometry args={[2.6, 0.2, 3.4]} /><meshStandardMaterial color={PALETTE.honey} /></mesh>
      <mesh position={[1.31, 1.0, 0]} raycast={() => {}}><boxGeometry args={[0.04, 1.6, 2.2]} /><meshBasicMaterial color={PALETTE.ink} /></mesh>
    </group>
    {/* your toy chest at the exit: leaks fall in */}
    <group position={[bw(6), 0, bw(8.5)]}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[3.4, 1.8, 2.2]} /><meshStandardMaterial color={PALETTE.coral} /></mesh>
      <mesh position={[0, 1.85, -1.1]} rotation={[-0.5, 0, 0]} castShadow raycast={() => {}}><boxGeometry args={[3.4, 0.25, 2.2]} /><meshStandardMaterial color={PALETTE.cream} /></mesh>
      <mesh position={[0, 1.2, 1.12]} raycast={() => {}}><boxGeometry args={[0.6, 0.6, 0.06]} /><meshStandardMaterial color={PALETTE.brass} /></mesh>
    </group>
    {/* building blocks on the tray corners */}
    {([[-1, -1, PALETTE.honey], [1, -1, PALETTE.toyBlue], [-1, 1, PALETTE.sage]] as const).map(([sx, sz, c], i) =>
      <mesh key={`block${i}`} position={[sx * (size / 2 + 2.6), 1.1, sz * (size / 2 + 2.6)]} rotation={[0, i * 0.4, 0]} castShadow receiveShadow raycast={() => {}}><boxGeometry args={[2.2, 2.2, 2.2]} /><meshStandardMaterial color={c} /></mesh>)}
  </group>;
}

// ───────────── towers ─────────────
interface Slot { mesh: THREE.Mesh; def: string; yaw: number; kick: number }
function Towers({ drag }: { drag: RefObject<Drag | null> }) {
  const group = useMemo(() => new THREE.Group(), []);
  const slots = useMemo<Slot[]>(() => Array.from({ length: MAX_TOWERS }, () => {
    const mesh = new THREE.Mesh(toyGeometry('soldier'), TOY_MATERIAL);
    mesh.castShadow = true; mesh.visible = false; mesh.raycast = () => {};
    group.add(mesh); return { mesh, def: '', yaw: Math.PI, kick: -9 };
  }), [group]);
  const stands = useMemo(() => { const m = new THREE.InstancedMesh(STAND, standMat, MAX_TOWERS); m.count = 0; m.receiveShadow = true; m.raycast = () => {}; m.setColorAt(0, new THREE.Color()); return m; }, []);
  const pips = useMemo(() => { const m = new THREE.InstancedMesh(PIP, UNLIT_VERTEX_MATERIAL, MAX_TOWERS * MAX_TIER); m.count = 0; m.raycast = () => {}; return m; }, []);
  const auras = useMemo(() => { const m = new THREE.InstancedMesh(RING, auraMat, MAX_TOWERS); m.count = 0; m.raycast = () => {}; m.frustumCulled = false; return m; }, []);
  const o = useMemo(() => new THREE.Object3D(), []), c = useMemo(() => new THREE.Color(), []);
  const reduced = useRef(reducedMotion());
  useEffect(() => () => { stands.dispose(); pips.dispose(); auras.dispose(); }, [stands, pips, auras]);
  useFrame((_, dt) => {
    const v = view, b = v.board, now = v.now;
    let n = 0, pipN = 0, auraN = 0;
    if (b) {
      for (const t of b.towers) {
        if (n >= MAX_TOWERS) break;
        const slot = slots[n], d = TOWERS[t.def];
        if (slot.def !== t.def) { slot.def = t.def; slot.mesh.geometry = toyGeometry(d.model); }
        const dragging = drag.current?.moved && drag.current.from === t.cell && b === v.me ? drag.current : null;
        const x = dragging ? dragging.x : bw(t.cell % 8), z = dragging ? dragging.z : bw(Math.floor(t.cell / 8));
        // Face the latest target, with a small recoil when it fires.
        for (let k = 0; k < b.shots.length; k++) {
          const s = b.shots[k];
          if (s.tower === t.id && s.serial > 0 && now - s.t / 1000 < 0.25) { slot.yaw = Math.atan2(bw(s.tx) - x, bw(s.tz) - z); slot.kick = s.t / 1000; }
        }
        const age = now - t.bornAt / 1000, fresh = age >= 0 && age < 1.2;
        const pop = reduced.current || !fresh ? 1 : 1 + Math.sin(Math.min(1, age / 0.5) * Math.PI) * 0.35;
        const recoil = reduced.current ? 0 : Math.max(0, 1 - (now - slot.kick) / 0.18);
        const scale = (1.0 + d.tier * 0.05) * pop;
        slot.mesh.visible = true;
        slot.mesh.material = fresh ? TOY_GLOW_MATERIAL : TOY_MATERIAL;
        slot.mesh.position.set(x - Math.sin(slot.yaw) * recoil * 0.3, (dragging ? 1.4 : 0.36) + (reduced.current ? 0 : Math.abs(Math.sin(now * 2.2 + t.cell)) * 0.05), z - Math.cos(slot.yaw) * recoil * 0.3);
        slot.mesh.rotation.set(0, slot.yaw, 0);
        slot.mesh.scale.setScalar(scale);
        o.position.set(x, dragging ? 1.1 : 0.24, z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix();
        stands.setMatrixAt(n, o.matrix); stands.setColorAt(n, c.set(TIER_COLOURS[d.tier - 1]));
        for (let k = 0; k < d.tier; k++) {
          const a = (k - (d.tier - 1) / 2) * 0.36;
          o.position.set(x + Math.sin(a) * 1.25, (dragging ? 1.1 : 0.24) + 0.3, z + Math.cos(a) * 1.25); o.rotation.set(0, a, 0); o.updateMatrix();
          pips.setMatrixAt(pipN++, o.matrix);
        }
        if (d.aura && !dragging) {
          const r = d.aura * CELL;
          o.position.set(x, 0.27, z); o.rotation.set(0, 0, 0); o.scale.set(r, 1, r); o.updateMatrix(); auras.setMatrixAt(auraN++, o.matrix); o.scale.setScalar(1);
        }
        n++;
      }
    }
    for (let k = n; k < slots.length; k++) { if (!slots[k].mesh.visible) break; slots[k].mesh.visible = false; }
    stands.count = n; pips.count = pipN; auras.count = auraN;
    stands.instanceMatrix.needsUpdate = true; if (stands.instanceColor) stands.instanceColor.needsUpdate = true;
    pips.instanceMatrix.needsUpdate = true; auras.instanceMatrix.needsUpdate = true;
    auraMat.opacity = reduced.current ? 0.3 : 0.22 + Math.sin(now * 3) * 0.08;
    void dt;
  });
  return <group><primitive object={group} /><primitive object={stands} /><primitive object={pips} /><primitive object={auras} /></group>;
}

// ───────────── enemies ─────────────
const scratch = { x: 0, z: 0 };
function Enemies() {
  const meshes = useMemo(() => ENEMY_KINDS.map((k) => {
    const m = new THREE.InstancedMesh(enemyGeo()[k], TOY_MATERIAL, ENEMY_CAP);
    m.count = 0; m.castShadow = true; m.raycast = () => {}; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); m.name = `tumble-enemy-${k}`; return m;
  }), []);
  const boss = useMemo(() => { const m = new THREE.Mesh(toyGeometry('ratchet-rhino'), TOY_MATERIAL); m.castShadow = true; m.visible = false; m.raycast = () => {}; return m; }, []);
  const bossRing = useMemo(() => { const m = new THREE.Mesh(RING, ringMat(PALETTE.coral, 0.85)); m.visible = false; m.raycast = () => {}; return m; }, []);
  const bars = useMemo(() => { const m = new THREE.InstancedMesh(BAR, barMat, BAR_CAP); m.count = 0; m.raycast = () => {}; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); return m; }, []);
  const o = useMemo(() => new THREE.Object3D(), []), c = useMemo(() => new THREE.Color(), []);
  const counts = useMemo(() => new Array<number>(ENEMY_KINDS.length).fill(0), []);
  const shownBoss = useRef('');
  const reduced = useRef(reducedMotion());
  const badges = useMemo(() => new StatusIconBatch(96, 1.7), []);
  const sign = useMemo(() => new CheckSign(), []);
  const { camera } = useThree();
  useEffect(() => () => { meshes.forEach((m) => m.dispose()); bars.dispose(); badges.dispose(); sign.dispose(); }, [meshes, bars, badges, sign]);
  useEffect(() => { exposeDebug({ tumbleStatus: { shown: () => badges.shown, byKind: () => badges.shownByKind() }, tumbleCheck: { shown: () => sign.sprite.visible, text: () => sign.text } }); }, [badges, sign]);
  useFrame(() => {
    const b = view.board, now = view.now, sNow = view.s?.t ?? 0, wave = view.s?.wave ?? 1, check = !!view.s && inCheck(view.s);
    counts.fill(0);
    badges.begin();
    let barN = 0, bossShown = false;
    if (b) for (const e of b.enemies) {
      if (e.hp <= 0) continue;
      const route = e.flying ? GLIDE : WALK;
      pointAt(route, e.dist + 0.12, scratch);
      const yaw = Math.atan2(scratch.x - e.x, scratch.z - e.z), x = bw(e.x), z = bw(e.z);
      const stunned = e.stunUntil > sNow, wobble = reduced.current ? 0 : stunned ? Math.sin(now * 40) * 0.25 : Math.sin(now * 12 + e.id) * 0.06;
      const y = 0.3 + groundY(e.x, e.z) + (e.flying ? FLY_HEIGHT + (reduced.current ? 0 : Math.sin(now * 3 + e.id) * 0.2) : reduced.current ? 0 : Math.abs(Math.sin(now * 9 + e.id)) * 0.08);
      // Slowed enemies tint blue, burning ones orange, marked ones coral.
      c.set(e.burnUntil > sNow ? TOY_COLOURS.orange : e.slowUntil > sNow ? TOY_COLOURS.glass : e.markUntil > sNow ? TOY_COLOURS.pink : '#FFFFFF');
      badges.add(enemyStatus(e, sNow, wave), x, y + (e.boss ? (e.check ? 11 : 8.6) : 3.1), z);
      if (e.boss) {
        const model = e.check ? DAMAGE_CHECK.model : BOSSES[wave]?.model ?? 'ratchet-rhino';
        if (shownBoss.current !== model) { shownBoss.current = model; boss.geometry = toyGeometry(model); }
        boss.visible = bossShown = true;
        boss.position.set(x, y, z); boss.rotation.set(0, yaw, wobble * 0.5); boss.scale.setScalar(ENEMY_SCALE.boss * (e.check ? 1.15 : 1));
        bossRing.visible = true; bossRing.position.set(x, 0.3, z); bossRing.scale.setScalar(2.2);
        // The damage check has no health bar: a sign above it counts the damage it has taken.
        if (e.check) sign.show(b.checkDamage, x, y + 8.6, z);
      } else {
        const k = ENEMY_KINDS.indexOf(e.kind as Exclude<EnemyKind, 'boss'>), mesh = meshes[k];
        if (counts[k] >= ENEMY_CAP) continue;
        o.position.set(x, y, z); o.rotation.set(0, yaw, wobble); o.scale.setScalar(ENEMY_SCALE[e.kind]); o.updateMatrix();
        mesh.setMatrixAt(counts[k], o.matrix); mesh.setColorAt(counts[k], c); counts[k]++;
      }
      if (!e.check && e.hp < e.maxHp && barN + 2 <= BAR_CAP) {
        const w = e.boss ? 4 : 1.5, top = y + (e.boss ? 7.2 : 1.8), f = Math.max(0.02, e.hp / e.maxHp);
        o.rotation.set(0, 0, 0);
        o.position.set(x, top, z); o.scale.set(w + 0.12, e.boss ? 1.6 : 1, 1.3); o.updateMatrix(); bars.setMatrixAt(barN, o.matrix); bars.setColorAt(barN++, c.set(PALETTE.ink));
        o.position.set(x - (w * (1 - f)) / 2, top + 0.02, z + 0.04); o.scale.set(w * f, e.boss ? 1.4 : 0.8, 1.2); o.updateMatrix(); bars.setMatrixAt(barN, o.matrix);
        bars.setColorAt(barN++, c.set(f > 0.5 ? PALETTE.sage : f > 0.25 ? PALETTE.honey : PALETTE.coral));
      }
    }
    for (let k = 0; k < meshes.length; k++) { const m = meshes[k]; m.count = counts[k]; m.visible = counts[k] > 0; if (counts[k]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
    if (!bossShown) { boss.visible = false; bossRing.visible = false; }
    if (!bossShown || !check) sign.hide();
    bars.count = barN; bars.visible = barN > 0; if (barN) { bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true; }
    badges.end(camera);
  });
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}<primitive object={boss} /><primitive object={bossRing} /><primitive object={bars} />
    <primitive object={badges.group} /><primitive object={sign.sprite} /></group>;
}

/** The damage check's sign: the damage taken so far, redrawn at most ten times a second. */
class CheckSign {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;
  text = '';
  private drawnAt = -1;
  constructor() {
    this.canvas.width = 512; this.canvas.height = 160;
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, toneMapped: false }));
    this.sprite.renderOrder = 22; this.sprite.visible = false; this.sprite.raycast = () => {};
    this.sprite.scale.set(8, 2.5, 1);
  }
  show(damage: number, x: number, y: number, z: number) {
    this.sprite.visible = true; this.sprite.position.set(x, y, z);
    const now = performance.now(), text = Math.round(damage).toLocaleString('en-GB');
    if (text === this.text || now - this.drawnAt < 100) return;
    this.text = text; this.drawnAt = now;
    const g = this.canvas.getContext('2d')!, w = this.canvas.width, h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 40);
    g.fillStyle = PALETTE.cream; g.fill(); g.lineWidth = 10; g.strokeStyle = PALETTE.ink; g.stroke();
    g.fillStyle = PALETTE.inkPurple; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 34px Nunito, sans-serif`; g.fillText('DAMAGE', w / 2, 44);
    g.fillStyle = PALETTE.ink; g.font = `600 70px Fredoka, sans-serif`; g.fillText(text, w / 2, 104);
    this.texture.needsUpdate = true;
  }
  hide() { this.sprite.visible = false; }
  dispose() { this.texture.dispose(); this.sprite.material.dispose(); }
}

// ───────────── selection, cursor, twins, drag target ─────────────
function putRing(m: THREE.Mesh, cell: number | null, r: number, mine: boolean) {
  m.visible = cell !== null && mine;
  if (cell !== null) { m.position.set(bw(cell % 8), 0.3, bw(Math.floor(cell / 8))); m.scale.setScalar(r); }
}
function Markers({ drag }: { drag: RefObject<Drag | null> }) {
  const select = useRef<THREE.Mesh>(null!), cursor = useRef<THREE.Mesh>(null!), target = useRef<THREE.Mesh>(null!);
  const land = useRef<THREE.Mesh>(null!), arrow = useRef<THREE.Group>(null!);
  const twins = useMemo(() => { const m = new THREE.InstancedMesh(RING, TWIN_MAT, BUILDABLE.length); m.count = 0; m.raycast = () => {}; m.frustumCulled = false; return m; }, []);
  const o = useMemo(() => new THREE.Object3D(), []), reduced = useRef(reducedMotion());
  useEffect(() => () => { twins.dispose(); }, [twins]);
  useFrame(() => {
    const v = view, ui = useTumbleUI.getState(), mine = !!v.me && v.board === v.me && !v.me.out;
    const pulse = reduced.current ? 1 : 1 + Math.sin(v.now * 6) * 0.06;
    // The selected square on your own board, or the tower being inspected on a board you are looking at.
    putRing(select.current, ui.selected, CELL * 0.5 * pulse, mine || (!!v.board && ui.selected !== null && !!towerAt(v.board, ui.selected)));
    putRing(cursor.current, ui.cursor !== ui.selected ? ui.cursor : null, CELL * 0.44, mine);
    let n = 0;
    // The Merge / Swap popup is open: mark where the merged tower would land, and the way from the source to it.
    const choice = mine ? liveChoice(v.me) : null;
    land.current.visible = arrow.current.visible = !!choice;
    if (choice) {
      const fx = bw(choice.from % 8), fz = bw(Math.floor(choice.from / 8)), tx = bw(choice.to % 8), tz = bw(Math.floor(choice.to / 8));
      land.current.position.set(tx, 0.31, tz); LAND_MAT.opacity = 0.42 + (pulse - 1) * 2;
      const len = Math.hypot(tx - fx, tz - fz), trim = Math.min(CELL * 0.45, len * 0.3);
      arrow.current.position.set(fx + ((tx - fx) / len) * trim, 0.5, fz + ((tz - fz) / len) * trim);
      arrow.current.rotation.set(0, -Math.atan2(tz - fz, tx - fx), 0);
      layArrow(arrow.current, Math.max(1.2, len - trim * 2));
    }
    const from = choice ? null : drag.current?.moved ? drag.current.from : ui.selected;
    const picked = mine && from !== null && v.me ? towerAt(v.me, from) : undefined;
    if (picked && v.me) for (const t of v.me.towers) {
      if (!canMergeTowers(picked, t)) continue;
      o.position.set(bw(t.cell % 8), 0.32, bw(Math.floor(t.cell / 8))); o.scale.setScalar(CELL * 0.46 * (2 - pulse)); o.updateMatrix(); twins.setMatrixAt(n++, o.matrix);
    }
    twins.count = n; twins.visible = n > 0; if (n) twins.instanceMatrix.needsUpdate = true;
    const d = drag.current;
    target.current.visible = (!!d?.moved && d.over !== null && mine) || !!choice;
    if (choice) {
      (target.current.material as THREE.MeshBasicMaterial).color.set(PALETTE.honey);
      target.current.position.set(bw(choice.to % 8), 0.34, bw(Math.floor(choice.to / 8))); target.current.scale.setScalar(CELL * 0.58 * pulse);
    } else if (d?.moved && d.over !== null && v.me) {
      const ok = canMergeCells(v.me, d.from, d.over) || (isBuildable(d.over) && d.over !== d.from);
      (target.current.material as THREE.MeshBasicMaterial).color.set(canMergeCells(v.me, d.from, d.over) ? PALETTE.honey : ok ? PALETTE.white : PALETTE.coral);
      target.current.position.set(bw(d.over % 8), 0.34, bw(Math.floor(d.over / 8))); target.current.scale.setScalar(CELL * 0.52);
    }
  });
  return <group>
    <mesh ref={select} geometry={RING} material={SELECT_MAT} raycast={() => {}} visible={false} />
    <mesh ref={cursor} geometry={RING} material={CURSOR_MAT} raycast={() => {}} visible={false} />
    <mesh ref={target} geometry={RING} material={DROP_MAT} raycast={() => {}} visible={false} />
    <mesh ref={land} geometry={LAND} material={LAND_MAT} raycast={() => {}} visible={false} />
    <group ref={arrow} visible={false}>
      <mesh geometry={SHAFT} material={ARROW_EDGE_MAT} raycast={() => {}} renderOrder={21} />
      <mesh geometry={HEAD} material={ARROW_EDGE_MAT} raycast={() => {}} renderOrder={21} />
      <mesh geometry={SHAFT} material={ARROW_MAT} raycast={() => {}} renderOrder={22} />
      <mesh geometry={HEAD} material={ARROW_MAT} raycast={() => {}} renderOrder={22} />
    </group>
    <primitive object={twins} />
  </group>;
}

// ───────────── camera: fit the board into the HUD's board slot ─────────────
const corners = (left: number) => [[left, -0.75], [7.75, -0.75], [left, 8.85], [7.75, 8.85]].flatMap(([x, z]) => [[bw(x), 0, bw(z)], [bw(x), 2.4, bw(z)]]) as [number, number, number][];
/** The whole tray with the toy box; on a tall, narrow slot (phone portrait) just the tray, so the squares get every pixel of width (the toy box may tuck under the quest strip). */
const CORNERS = corners(-1.7), TIGHT_CORNERS = corners(-0.75);
const TARGET = new THREE.Vector3(bw(2.9), 0, bw(4.0));
const ELEVATION = 1.12; // radians above the table
/** Place the camera for the current pan and zoom (`fitD` is the fitted distance at zoom 1). */
function placeCamera(camera: THREE.PerspectiveCamera, fitD: number) {
  const d = fitD / tumbleView.zoom, tx = TARGET.x + tumbleView.panX, tz = TARGET.z + tumbleView.panZ;
  camera.position.set(tx, TARGET.y + Math.sin(ELEVATION) * d, tz + Math.cos(ELEVATION) * d);
  camera.lookAt(tx, TARGET.y, tz);
  camera.updateMatrixWorld();
}
/** Fit the board into the slot (zoom 1, no pan) and return the fitted distance; the view offset centres it in the slot. */
function fitCamera(camera: THREE.PerspectiveCamera, slot: DOMRect, canvas: DOMRect): number {
  const p = new THREE.Vector3();
  camera.clearViewOffset();
  const place = (d: number) => {
    camera.position.set(TARGET.x, TARGET.y + Math.sin(ELEVATION) * d, TARGET.z + Math.cos(ELEVATION) * d); camera.lookAt(TARGET);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of slot.height > slot.width * 1.3 ? TIGHT_CORNERS : CORNERS) { p.set(c[0], c[1], c[2]).project(camera); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { w: ((maxX - minX) / 2) * canvas.width, h: ((maxY - minY) / 2) * canvas.height, cx: ((minX + maxX) / 2 + 1) / 2 * canvas.width, cy: (1 - (minY + maxY) / 2) / 2 * canvas.height };
  };
  let d = 60;
  for (let i = 0; i < 3; i++) { const r = place(d); d *= Math.max(r.w / Math.max(80, slot.width), r.h / Math.max(80, slot.height)) * 1.02; }
  const r = place(d);
  const sx = slot.left - canvas.left + slot.width / 2, sy = slot.top - canvas.top + slot.height / 2;
  camera.setViewOffset(canvas.width, canvas.height, r.cx - sx, r.cy - sy, canvas.width, canvas.height);
  return d;
}

// ───────────── input: tap to select, drag a tower onto a twin to merge, drag elsewhere to pan ─────────────
interface Drag { pointer: number; from: number; sx: number; sy: number; moved: boolean; x: number; z: number; over: number | null }
/**
 * A press that is not on one of your towers: a tap if it barely moves, otherwise a pan. `dismiss`:
 * it closed the Merge / Swap popup, so as a tap it does nothing else.
 */
interface Press { pointer: number; sx: number; sy: number; cell: number | null; panned: boolean; dismiss: boolean }
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
const table = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundHit = new THREE.Vector3();
const box = new THREE.Box3(), hitPoint = new THREE.Vector3();
/** The square under a pointer ray: a tower's body first (tall toys overlap the square behind), else the felt. */
function pickCell(ray: THREE.Ray, b: TdPlayer | undefined): number | null {
  let best: number | null = null, bestD = Infinity;
  if (b) for (const t of b.towers) {
    const x = bw(t.cell % 8), z = bw(Math.floor(t.cell / 8));
    box.min.set(x - 1.2, 0, z - 1.2); box.max.set(x + 1.2, 2.6, z + 1.2);
    if (ray.intersectBox(box, hitPoint)) { const d = hitPoint.distanceToSquared(ray.origin); if (d < bestD) { bestD = d; best = t.cell; } }
  }
  if (best !== null) return best;
  return ray.intersectPlane(floor, hitPoint) ? worldCell(hitPoint.x, hitPoint.z) : null;
}

export function TumbleScene({ getState, localId }: MinigameSceneProps<TdState>) {
  const { camera, gl, size } = useThree();
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const fit = useRef({ key: '', frame: 0, d: 0, version: -1 });
  const heard = useRef({ board: '', serial: 0, tick: -1, voices: 0 });
  const cancel = () => { drag.current = null; if (useTumbleUI.getState().dragging !== null) useTumbleUI.setState({ dragging: null, dragOver: null }); gl.domElement.style.cursor = ''; };

  useEffect(() => {
    const el = gl.domElement, cam = camera as THREE.PerspectiveCamera;
    const rayAt = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, cam); return raycaster.ray;
    };
    const ground = (x: number, y: number): Ground | null => (rayAt(x, y).intersectPlane(table, groundHit) ? { x: groundHit.x, z: groundHit.z } : null);
    const apply = () => { if (fit.current.d) { placeCamera(cam, fit.current.d); fit.current.version = tumbleView.version; } };
    const dragMove = (d: Drag, x: number, y: number) => {
      const v = readView(getState, localId);
      if (!editable(v)) { cancel(); return; }
      if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > TAP_SLOP && v.me && towerAt(v.me, d.from)) {
        d.moved = true; useTumbleUI.setState({ dragging: d.from, selected: d.from }); el.style.cursor = 'grabbing';
      }
      if (d.moved && rayAt(x, y).intersectPlane(floor, hitPoint)) { d.x = hitPoint.x; d.z = hitPoint.z; d.over = worldCell(d.x, d.z); if (useTumbleUI.getState().dragOver !== d.over) useTumbleUI.setState({ dragOver: d.over }); }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return;
      unlockAudio();
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      if (tumbleView.down(e.pointerId, e.clientX, e.clientY)) { cancel(); press.current = null; return; } // a second finger: pinch
      if (tumbleView.pointerCount > 1) return;
      const v = readView(getState, localId);
      const cell = pickCell(rayAt(e.clientX, e.clientY), v.board);
      // A press while the Merge / Swap popup is open closes it (the popup's own buttons are DOM, not the canvas).
      const open = useTumbleUI.getState().confirm !== null, dismiss = open && liveChoice(v.me) !== null;
      if (dismiss) cancelMerge(); else if (open) useTumbleUI.setState({ confirm: null }); // a stale choice just goes
      if (!dismiss && editable(v) && cell !== null && v.me && towerAt(v.me, cell)) {
        drag.current = { pointer: e.pointerId, from: cell, sx: e.clientX, sy: e.clientY, moved: false, x: 0, z: 0, over: cell };
        press.current = null;
      } else press.current = { pointer: e.pointerId, sx: e.clientX, sy: e.clientY, cell, panned: false, dismiss };
    };
    const onMove = (e: PointerEvent) => {
      if (tumbleView.pinching) { tumbleView.move(e.pointerId, e.clientX, e.clientY, ground, apply); return; }
      const d = drag.current;
      if (d && e.pointerId === d.pointer) { dragMove(d, e.clientX, e.clientY); return; }
      const p = press.current;
      // A mouse resting over a tower of the viewed board: its floating tip (never on touch).
      if (!p && e.pointerType === 'mouse' && e.buttons === 0) {
        const v = readView(getState, localId), cell = pickCell(rayAt(e.clientX, e.clientY), v.board);
        const hover = cell !== null && v.board && towerAt(v.board, cell) ? cell : null;
        if (useTumbleUI.getState().hover !== hover) useTumbleUI.setState({ hover });
        return;
      }
      if (!p || e.pointerId !== p.pointer) return;
      if (!p.panned && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) { p.panned = true; tumbleView.startPan(p.sx, p.sy, ground); el.style.cursor = 'grabbing'; }
      if (p.panned) tumbleView.move(e.pointerId, e.clientX, e.clientY, ground, apply);
    };
    const onUp = (e: PointerEvent) => {
      const wasPinch = tumbleView.pinching || tumbleView.pointerCount > 1;
      tumbleView.up(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      const d = drag.current, p = press.current;
      if (d && e.pointerId === d.pointer) {
        dragMove(d, e.clientX, e.clientY);
        const v = readView(getState, localId);
        // A drop on a same-tier tower asks Merge or Swap (popup at that tower); elsewhere it moves or swaps at once.
        if (editable(v) && v.me) { if (!d.moved) tapCell(v.me, d.from); else dropTower(v.me, d.from, d.over); }
        cancel();
      } else if (p && e.pointerId === p.pointer) {
        press.current = null; el.style.cursor = '';
        // A tap (not a pan, not the end of a pinch) selects on your own board, and inspects a tower on one you are only looking at.
        const v = readView(getState, localId);
        if (p.dismiss || p.panned || wasPinch) { /* closed the popup, panned or pinched: not a tap */ }
        else if (editable(v) && v.me) { if (p.cell === null) useTumbleUI.setState({ selected: null, confirm: null }); else tapCell(v.me, p.cell); }
        else if (v.board && (v.board !== v.me || v.me.out)) inspectCell(v.board, p.cell);
      }
    };
    const onCancel = (e: PointerEvent) => { tumbleView.up(e.pointerId); if (drag.current?.pointer === e.pointerId) cancel(); if (press.current?.pointer === e.pointerId) { press.current = null; el.style.cursor = ''; } };
    const onLeave = () => { if (useTumbleUI.getState().hover !== null) useTumbleUI.setState({ hover: null }); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); tumbleView.wheel(e.deltaY, e.deltaMode, e.clientX, e.clientY, ground, apply); };
    const previousTouch = el.style.touchAction; el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel); el.addEventListener('lostpointercapture', onCancel); el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerleave', onLeave);
    const off = useMatch.subscribe((s) => { if (s.paused || s.phase !== 'playing') { cancel(); press.current = null; tumbleView.cancelAll(); } });
    const blur = () => { cancel(); press.current = null; tumbleView.cancelAll(); }; window.addEventListener('blur', blur);
    tumbleView.reset(); tumbleView.cancelAll();
    exposeDebug({ tumbleView: {
      get: () => ({ zoom: tumbleView.zoom, panX: tumbleView.panX, panZ: tumbleView.panZ, pointers: tumbleView.pointerCount, pinching: tumbleView.pinching }),
      reset: () => tumbleView.reset(),
      /** Zoom by `k` about a screen point (what the wheel and pinch do). */
      zoomAt: (k: number, x: number, y: number) => tumbleView.zoomAt(k, x, y, ground, apply),
    } });
    return () => {
      off(); window.removeEventListener('blur', blur); cancel(); press.current = null; tumbleView.cancelAll();
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel); el.removeEventListener('lostpointercapture', onCancel); el.removeEventListener('wheel', onWheel); el.removeEventListener('pointerleave', onLeave);
      el.style.touchAction = previousTouch; el.style.cursor = '';
      cam.clearViewOffset();
    };
  }, [gl, camera, getState, localId]);

  // Sounds and flourishes for rules events: your own actions, the watched board's leaks and bosses.
  useEffect(() => matchBus.on('event', (e) => {
    const s = getState();
    if (s?.kind !== 'tower-tumble') return;
    const watched = viewedBoard(s, localId, useTumbleUI.getState().watching);
    const cue = eventCue(e, localId, watched);
    const id = (e as { id?: string }).id, cell = (e as { cell?: number }).cell, def = (e as { def?: string }).def;
    if (id === watched && cell !== undefined && def && TOWERS[def] && (e.type === 'td-merge' || e.type === 'td-build' || e.type === 'td-gift'))
      tumbleFxRef.current?.flourish(cell, TOWERS[def].tier, s.t / 1000, e.type !== 'td-build');
    switch (cue) {
      case 'build': sfx.purchase(); break;
      case 'merge': sfx.pop(); break;
      case 'lucky': case 'quest': case 'gift': sfx.reward(); break;
      case 'sell': sfx.click(); break;
      case 'builder': sfx.windUp(6); break;
      case 'wave': sfx.windUp(5); break;
      case 'boss': sfx.drum(); sfx.bell(); break;
      case 'boss-down': sfx.reward(); break;
      case 'leak': playToyCue('warning', 0.6); break;
      case 'out': sfx.eliminate(); break;
      case 'cleared': sfx.musicBox(); break;
    }
  }), [getState, localId]);

  // The HUD anchors its floating popovers to a square's screen box (the felt plus the tower's height).
  useEffect(() => {
    const p = new THREE.Vector3();
    tumbleScreen.cellRect = (cell) => {
      const r = gl.domElement.getBoundingClientRect(), x = bw(cell % 8), z = bw(Math.floor(cell / 8)), h = CELL / 2;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const [dx, y, dz] of [[-h, 0, -h], [h, 0, -h], [-h, 0, h], [h, 0, h], [0, 3.2, 0]]) {
        p.set(x + dx, y, z + dz).project(camera);
        const sx = r.left + ((p.x + 1) / 2) * r.width, sy = r.top + ((1 - p.y) / 2) * r.height;
        left = Math.min(left, sx); right = Math.max(right, sx); top = Math.min(top, sy); bottom = Math.max(bottom, sy);
      }
      return Number.isFinite(left) ? { left, top, right, bottom } : null;
    };
    return () => { tumbleScreen.cellRect = null; };
  }, [camera, gl]);

  useEffect(() => {
    exposeDebug({ tumble: {
      /** Screen position of a board point (column, row, height in cm). */
      point: (col: number, row: number, y = 0.4) => {
        const p = new THREE.Vector3(bw(col), y, bw(row)).project(camera), r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
      },
      watching: () => { const s = getState(); return s ? viewedBoard(s, localId, useTumbleUI.getState().watching) : null; },
      /** What a press at a screen point would pick on the viewed board: a square, and whether it is one of the towers. */
      pick: (x: number, y: number) => {
        const r = gl.domElement.getBoundingClientRect(), v = readView(getState, localId);
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const cell = pickCell(raycaster.ray, v.board);
        return { cell, tower: cell !== null && !!v.board && !!towerAt(v.board, cell) };
      },
      /** True once the camera has been fitted to the HUD's board slot. */
      fitted: () => fit.current.key !== '',
    } });
  }, [camera, gl, getState, localId]);

  useFrame(({ gl: renderer }) => {
    drawQueuedPortrait(renderer);
    const v = readView(getState, localId);
    if (drag.current && !editable(v)) cancel();
    // Fit the camera as soon as the HUD's board slot exists, then re-fit when it or the canvas changes (checked every few frames).
    if (!fit.current.key || fit.current.frame++ % 6 === 0) {
      const slotEl = document.querySelector('.td-board-slot'), canvas = gl.domElement.getBoundingClientRect();
      if (slotEl) {
        const slot = slotEl.getBoundingClientRect(), key = `${slot.left},${slot.top},${slot.width},${slot.height}|${canvas.width},${canvas.height}|${size.width},${size.height}`;
        if (key !== fit.current.key) { fit.current.key = key; fit.current.d = fitCamera(camera as THREE.PerspectiveCamera, slot, canvas); fit.current.version = -1; }
      }
    }
    // Pan and zoom (gestures, or Reset view from the HUD).
    if (fit.current.d && fit.current.version !== tumbleView.version) { placeCamera(camera as THREE.PerspectiveCamera, fit.current.d); fit.current.version = tumbleView.version; }
    // Shot sounds for the watched board: a couple of voices per 100 ms at most.
    const b = v.board;
    if (b && !useMatch.getState().paused) {
      const h = heard.current;
      if (h.board !== b.id) { h.board = b.id; h.serial = b.shotSerial; }
      const tick = Math.floor((v.s?.t ?? 0) / 100);
      if (tick !== h.tick) { h.tick = tick; h.voices = 0; }
      while (h.serial < b.shotSerial) {
        const s = b.shots[h.serial % b.shots.length]; h.serial++;
        if (h.voices < SHOT_VOICES_PER_TICK && TOWERS[s.def]) { h.voices++; playToyCue(SHOT_VOICE[TOWERS[s.def].family], 0.35); }
      }
    }
  });

  return <group>
    {/* First child: its frame callback runs before the others', so they all read this frame's view. */}
    <ViewSync getState={getState} localId={localId} />
    <BoardBase />
    <Towers drag={drag} />
    <Enemies />
    <Markers drag={drag} />
    <TumbleFxLayer getBoard={() => view.board} getNow={() => view.now} />
  </group>;
}
