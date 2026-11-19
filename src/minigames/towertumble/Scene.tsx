/**
 * Toy Tower Tumble on the tabletop: the watched board (your own, or another player's once you are
 * knocked out), its towers, the enemies on the path and the effects. Everything per-frame reads the
 * live rules state and plain objects; React only renders the fixed set of meshes once.
 *
 * Draw-call budget: board tiles, stands, pips, auras, hp bars and each enemy kind are instanced;
 * a tower is one mesh (its Toy Squad toy, one baked geometry); effects are pooled (Fx.tsx).
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
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
import { BOSSES, MAX_TIER, TIER_COLOURS, TOWERS, type EnemyKind } from './catalogue';
import { ENEMY_PARTS, ENEMY_SCALE, FLY_HEIGHT } from './models';
import { towerAt, viewedBoard, type TdPlayer, type TdState } from './rules';
import { canMergeCells, submitTumbleInput, tapCell, useTumbleUI } from './local';
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
const PICK_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const tileMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.95 });
const standMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 });
const barMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
const auraMat = new THREE.MeshBasicMaterial({ color: PALETTE.honey, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const ringMat = (c: string, opacity = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const SELECT_MAT = ringMat(PALETTE.white), CURSOR_MAT = ringMat(PALETTE.toyBlue, 0.8), TWIN_MAT = ringMat(PALETTE.honey), DROP_MAT = ringMat(PALETTE.honey, 0.9);
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
  useEffect(() => () => { meshes.forEach((m) => m.dispose()); bars.dispose(); }, [meshes, bars]);
  useFrame(() => {
    const b = view.board, now = view.now, sNow = view.s?.t ?? 0;
    counts.fill(0);
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
      if (e.boss) {
        const model = BOSSES[view.s?.wave ?? 5]?.model ?? 'ratchet-rhino';
        if (shownBoss.current !== model) { shownBoss.current = model; boss.geometry = toyGeometry(model); }
        boss.visible = bossShown = true;
        boss.position.set(x, y, z); boss.rotation.set(0, yaw, wobble * 0.5); boss.scale.setScalar(ENEMY_SCALE.boss);
        bossRing.visible = true; bossRing.position.set(x, 0.3, z); bossRing.scale.setScalar(2.2);
      } else {
        const k = ENEMY_KINDS.indexOf(e.kind as Exclude<EnemyKind, 'boss'>), mesh = meshes[k];
        if (counts[k] >= ENEMY_CAP) continue;
        o.position.set(x, y, z); o.rotation.set(0, yaw, wobble); o.scale.setScalar(ENEMY_SCALE[e.kind]); o.updateMatrix();
        mesh.setMatrixAt(counts[k], o.matrix); mesh.setColorAt(counts[k], c); counts[k]++;
      }
      if (e.hp < e.maxHp && barN + 2 <= BAR_CAP) {
        const w = e.boss ? 4 : 1.5, top = y + (e.boss ? 7.2 : 1.8), f = Math.max(0.02, e.hp / e.maxHp);
        o.rotation.set(0, 0, 0);
        o.position.set(x, top, z); o.scale.set(w + 0.12, e.boss ? 1.6 : 1, 1.3); o.updateMatrix(); bars.setMatrixAt(barN, o.matrix); bars.setColorAt(barN++, c.set(PALETTE.ink));
        o.position.set(x - (w * (1 - f)) / 2, top + 0.02, z + 0.04); o.scale.set(w * f, e.boss ? 1.4 : 0.8, 1.2); o.updateMatrix(); bars.setMatrixAt(barN, o.matrix);
        bars.setColorAt(barN++, c.set(f > 0.5 ? PALETTE.sage : f > 0.25 ? PALETTE.honey : PALETTE.coral));
      }
    }
    for (let k = 0; k < meshes.length; k++) { const m = meshes[k]; m.count = counts[k]; m.visible = counts[k] > 0; if (counts[k]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
    if (!bossShown) { boss.visible = false; bossRing.visible = false; }
    bars.count = barN; bars.visible = barN > 0; if (barN) { bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true; }
  });
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}<primitive object={boss} /><primitive object={bossRing} /><primitive object={bars} /></group>;
}

// ───────────── selection, cursor, twins, drag target ─────────────
function putRing(m: THREE.Mesh, cell: number | null, r: number, mine: boolean) {
  m.visible = cell !== null && mine;
  if (cell !== null) { m.position.set(bw(cell % 8), 0.3, bw(Math.floor(cell / 8))); m.scale.setScalar(r); }
}
function Markers({ drag }: { drag: RefObject<Drag | null> }) {
  const select = useRef<THREE.Mesh>(null!), cursor = useRef<THREE.Mesh>(null!), target = useRef<THREE.Mesh>(null!);
  const twins = useMemo(() => { const m = new THREE.InstancedMesh(RING, TWIN_MAT, 16); m.count = 0; m.raycast = () => {}; m.frustumCulled = false; return m; }, []);
  const o = useMemo(() => new THREE.Object3D(), []), reduced = useRef(reducedMotion());
  useEffect(() => () => { twins.dispose(); }, [twins]);
  useFrame(() => {
    const v = view, ui = useTumbleUI.getState(), mine = !!v.me && v.board === v.me && !v.me.out;
    const pulse = reduced.current ? 1 : 1 + Math.sin(v.now * 6) * 0.06;
    putRing(select.current, ui.selected, CELL * 0.5 * pulse, mine);
    putRing(cursor.current, ui.cursor !== ui.selected ? ui.cursor : null, CELL * 0.44, mine);
    let n = 0;
    const from = drag.current?.moved ? drag.current.from : ui.selected;
    const picked = mine && from !== null && v.me ? towerAt(v.me, from) : undefined;
    if (picked && v.me) for (const t of v.me.towers) {
      if (t === picked || t.def !== picked.def || TOWERS[t.def].tier >= MAX_TIER || n >= 16) continue;
      o.position.set(bw(t.cell % 8), 0.32, bw(Math.floor(t.cell / 8))); o.scale.setScalar(CELL * 0.46 * (2 - pulse)); o.updateMatrix(); twins.setMatrixAt(n++, o.matrix);
    }
    twins.count = n; twins.visible = n > 0; if (n) twins.instanceMatrix.needsUpdate = true;
    const d = drag.current;
    target.current.visible = !!d?.moved && d.over !== null && mine;
    if (d?.moved && d.over !== null && v.me) {
      const ok = canMergeCells(v.me, d.from, d.over) || (isBuildable(d.over) && d.over !== d.from);
      (target.current.material as THREE.MeshBasicMaterial).color.set(canMergeCells(v.me, d.from, d.over) ? PALETTE.honey : ok ? PALETTE.white : PALETTE.coral);
      target.current.position.set(bw(d.over % 8), 0.34, bw(Math.floor(d.over / 8))); target.current.scale.setScalar(CELL * 0.52);
    }
  });
  return <group>
    <mesh ref={select} geometry={RING} material={SELECT_MAT} raycast={() => {}} visible={false} />
    <mesh ref={cursor} geometry={RING} material={CURSOR_MAT} raycast={() => {}} visible={false} />
    <mesh ref={target} geometry={RING} material={DROP_MAT} raycast={() => {}} visible={false} />
    <primitive object={twins} />
  </group>;
}

// ───────────── camera: fit the board into the HUD's board slot ─────────────
const CORNERS = [[-1.7, -0.75], [7.75, -0.75], [-1.7, 8.85], [7.75, 8.85]].flatMap(([x, z]) => [[bw(x), 0, bw(z)], [bw(x), 2.4, bw(z)]]) as [number, number, number][];
const TARGET = new THREE.Vector3(bw(2.9), 0, bw(4.0));
const ELEVATION = 1.12; // radians above the table
function fitCamera(camera: THREE.PerspectiveCamera, slot: DOMRect, canvas: DOMRect) {
  const p = new THREE.Vector3();
  camera.clearViewOffset();
  const place = (d: number) => {
    camera.position.set(TARGET.x, TARGET.y + Math.sin(ELEVATION) * d, TARGET.z + Math.cos(ELEVATION) * d); camera.lookAt(TARGET);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of CORNERS) { p.set(c[0], c[1], c[2]).project(camera); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { w: ((maxX - minX) / 2) * canvas.width, h: ((maxY - minY) / 2) * canvas.height, cx: ((minX + maxX) / 2 + 1) / 2 * canvas.width, cy: (1 - (minY + maxY) / 2) / 2 * canvas.height };
  };
  let d = 60;
  for (let i = 0; i < 3; i++) { const r = place(d); d *= Math.max(r.w / Math.max(80, slot.width), r.h / Math.max(80, slot.height)) * 1.02; }
  const r = place(d);
  const sx = slot.left - canvas.left + slot.width / 2, sy = slot.top - canvas.top + slot.height / 2;
  camera.setViewOffset(canvas.width, canvas.height, r.cx - sx, r.cy - sy, canvas.width, canvas.height);
}

// ───────────── input: tap to select, drag onto a twin to merge ─────────────
interface Drag { pointer: number; from: number; sx: number; sy: number; moved: boolean; x: number; z: number; over: number | null; release: () => void }
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
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
  const fit = useRef({ key: '', frame: 0 });
  const heard = useRef({ board: '', serial: 0, tick: -1, voices: 0 });
  const cancel = () => { const d = drag.current; drag.current = null; d?.release(); if (useTumbleUI.getState().dragging !== null) useTumbleUI.setState({ dragging: null, dragOver: null }); gl.domElement.style.cursor = ''; };

  const down = (e: ThreeEvent<PointerEvent>) => {
    const v = readView(getState, localId);
    if (!editable(v) || drag.current) return;
    e.stopPropagation(); unlockAudio();
    const cell = pickCell(e.ray, v.me);
    if (cell === null) { useTumbleUI.setState({ selected: null }); return; }
    const target = e.target as unknown as { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
    try { target.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    drag.current = { pointer: e.pointerId, from: cell, sx: e.nativeEvent.clientX, sy: e.nativeEvent.clientY, moved: false, x: 0, z: 0, over: cell,
      release: () => { try { target.releasePointerCapture(e.pointerId); } catch { /* already released */ } } };
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current; if (!d || e.pointerId !== d.pointer) return;
    const v = readView(getState, localId);
    if (!editable(v)) { cancel(); return; }
    if (!d.moved && Math.hypot(e.nativeEvent.clientX - d.sx, e.nativeEvent.clientY - d.sy) > 10 && v.me && towerAt(v.me, d.from)) {
      d.moved = true; useTumbleUI.setState({ dragging: d.from, selected: d.from }); gl.domElement.style.cursor = 'grabbing';
    }
    if (d.moved && e.ray.intersectPlane(floor, hitPoint)) { d.x = hitPoint.x; d.z = hitPoint.z; d.over = worldCell(d.x, d.z); if (useTumbleUI.getState().dragOver !== d.over) useTumbleUI.setState({ dragOver: d.over }); }
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current; if (!d || e.pointerId !== d.pointer) return;
    move(e);
    const v = readView(getState, localId);
    if (editable(v) && v.me) {
      if (!d.moved) tapCell(v.me, d.from);
      else if (d.over !== null && d.over !== d.from) {
        if (canMergeCells(v.me, d.from, d.over)) { submitTumbleInput({ type: 'merge', from: d.from, to: d.over }); useTumbleUI.setState({ selected: d.over, cursor: d.over }); }
        else if (isBuildable(d.over)) { submitTumbleInput({ type: 'move', from: d.from, to: d.over }); useTumbleUI.setState({ selected: d.over, cursor: d.over }); }
      }
    }
    cancel();
  };

  useEffect(() => {
    const previousTouch = gl.domElement.style.touchAction; gl.domElement.style.touchAction = 'none';
    const off = useMatch.subscribe((s) => { if (s.paused || s.phase !== 'playing') cancel(); });
    const blur = () => cancel(); window.addEventListener('blur', blur);
    return () => {
      off(); window.removeEventListener('blur', blur); cancel(); gl.domElement.style.touchAction = previousTouch;
      (camera as THREE.PerspectiveCamera).clearViewOffset();
    };
  }, [gl, camera]);

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

  useEffect(() => {
    exposeDebug({ tumble: {
      /** Screen position of a board point (column, row, height in cm). */
      point: (col: number, row: number, y = 0.4) => {
        const p = new THREE.Vector3(bw(col), y, bw(row)).project(camera), r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
      },
      watching: () => { const s = getState(); return s ? viewedBoard(s, localId, useTumbleUI.getState().watching) : null; },
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
        if (key !== fit.current.key) { fit.current.key = key; fitCamera(camera as THREE.PerspectiveCamera, slot, canvas); }
      }
    }
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
    {/* One pick surface for the whole board; towers are hit-tested against their bodies in pickCell. */}
    <mesh position={[0, 0.3, 0]} rotation={[-H, 0, 0]} material={PICK_MATERIAL} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <planeGeometry args={[90, 90]} />
    </mesh>
    <Towers drag={drag} />
    <Enemies />
    <Markers drag={drag} />
    <TumbleFxLayer getBoard={() => view.board} getNow={() => view.now} />
  </group>;
}
