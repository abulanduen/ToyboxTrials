import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { playToyCue, sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { BENCH_SIZE, MAX_UNITS, ROSTER, purchaseUpgradeTargets, type Battle, type Fighter, type SquadPlayer, type SquadState, type SquadUnit } from './rules';
import { boardToWorld, CELL_SIZE, placementPosition, reservePosition, worldToDeployment } from './board';
import { setLocalPlayer, submitSquadInput, useSquadUI, viewedSquad } from './local';
import { fighterStatus } from './info';
import { StatusIconBatch } from '../shared/statusIcons';
import { drawQueuedPortrait } from './portraits';
import { audibleBattle, combatVoices, eventCue, type CombatVoice } from './sounds';
import { RARITY_COLOURS } from './catalogue';
import { TOY_SPECS, type Motion } from './models';
import { TIER_GEOMETRY, TOY_GLOW_MATERIAL, TOY_MATERIAL, UNLIT_VERTEX_MATERIAL, standGeometry, toyGeometry } from './toys';
import { SquadFx, cueKey, unitCues } from './Fx';

interface Drag { unit: number; pointer: number; x: number; z: number; cell: number | null; shop: DOMRect | null; sell: boolean; sx: number; sy: number; moved: boolean; release: () => void }
type PointerHandler = (e: ThreeEvent<PointerEvent>, id?: number) => void;
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
/** The board on show: your own, or another player's picked from the player rail (read-only). */
const viewId = (s: SquadState, localId: string) => viewedSquad(s.players, localId, useSquadUI.getState().watching);
/** Squad edits are open: your own board on show (not a seat you only follow as a spectator), build phase, not readied, not paused, and no passive choice waiting. */
const editable = (s: SquadState | null, id: string) => {
  const m = useMatch.getState();
  if (s?.kind !== 'toy-squad' || s.phase !== 'build' || m.paused || m.phase !== 'playing' || viewId(s, id) !== id || !m.contestants.find(c => c.id === id)?.isLocal) return false;
  const p = s.players.find(p => p.id === id); return !!p && !p.ready && !p.passiveOffers.length;
};
/** Debuff badges over the fighters: one shared batch, begun before the pieces' frame callbacks and drawn after them. */
const badges = { batch: null as StatusIconBatch | null };
// Shared by every piece: one pick volume (never drawn), bars and the upgrade ring.
const PICK_GEOMETRY = new THREE.BoxGeometry(2.7, 2.5, 2.7);
const PICK_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const BAR_GEOMETRY = new THREE.BoxGeometry(1.6, 0.2, 0.2), MANA_GEOMETRY = new THREE.BoxGeometry(1.6, 0.12, 0.2);
const UPGRADE_GEOMETRY = new THREE.RingGeometry(1.42, 1.68, 24);
const UPGRADE_MATERIAL = new THREE.MeshBasicMaterial({ color: PALETTE.honey, side: THREE.DoubleSide });
const SELECT_GEOMETRY = new THREE.RingGeometry(1.5, 1.76, 28);
const SELECT_MATERIAL = new THREE.MeshBasicMaterial({ color: PALETTE.white, side: THREE.DoubleSide, toneMapped: false });
const MANA_MATERIAL = new THREE.MeshBasicMaterial({ color: PALETTE.toyBlue });
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** The viewed board's units and battle, split once per frame so 28 pieces do not each re-filter them. */
interface View { state: SquadState | null; t: number; phase: string; id: string; player: SquadPlayer | undefined; battle: Battle | undefined; sides: [Fighter[], Fighter[]]; board: SquadUnit[]; reserve: SquadUnit[] }
const view: View = { state: null, t: -1, phase: '', id: '', player: undefined, battle: undefined, sides: [[], []], board: [], reserve: [] };
let viewStamp = -1;
function readView(s: SquadState, localId: string, stamp: number): View {
  const id = viewId(s, localId);
  if (stamp === viewStamp && view.state === s && view.t === s.t && view.phase === s.phase && view.id === id) return view;
  viewStamp = stamp; view.state = s; view.t = s.t; view.phase = s.phase; view.id = id;
  view.player = s.players.find(p => p.id === id); view.battle = s.battles.find(b => b.owner === id);
  // Keyboard shortcuts always act on your own squad.
  setLocalPlayer(s.players.find(p => p.id === localId) ?? null);
  view.sides[0].length = 0; view.sides[1].length = 0; view.board.length = 0; view.reserve.length = 0;
  for (const u of view.battle?.fighters ?? []) view.sides[u.side].push(u);
  for (const u of view.player?.units ?? []) (u.cell < 0 ? view.reserve : view.board).push(u);
  return view;
}

/** Whole-toy idle motion. `t` is simulation seconds, so it pauses with the match. */
function idle(model: THREE.Group, motion: Motion, t: number, lively: number) {
  const k = 0.45 + lively * 0.55; let y = 0, rx = 0, rz = 0, yaw = 0, squash = 1;
  switch (motion) {
    case 'march': y = Math.abs(Math.sin(t * 6)) * 0.1 * k; rz = Math.sin(t * 6) * 0.06 * k; break;
    case 'hop': y = Math.abs(Math.sin(t * 4.2)) * 0.34 * k; squash = 1 - Math.cos(t * 8.4) * 0.07 * k; break;
    case 'float': y = 0.3 + Math.sin(t * 2.3) * 0.14; rz = Math.sin(t * 1.7) * 0.05; break;
    case 'wobble': rz = Math.sin(t * 3.4) * 0.1 * k; break;
    case 'jitter': y = Math.abs(Math.sin(t * 34)) * 0.05 * k; rx = Math.sin(t * 17) * 0.02; break;
    case 'rock': rx = Math.sin(t * 3.1) * 0.17 * k; break;
    case 'slither': yaw = Math.sin(t * 3) * 0.22 * k; rz = Math.sin(t * 3 + 1.2) * 0.05; break;
    case 'tick': rz = Math.tanh(Math.sin(t * Math.PI) * 5) * 0.06; break;
    case 'prowl': y = Math.abs(Math.sin(t * 5)) * 0.05 * k; rx = Math.sin(t * 2.5) * 0.05 * k; break;
    case 'stomp': y = Math.max(0, Math.sin(t * 4)) ** 2 * 0.16 * k; rz = Math.sin(t * 2) * 0.04 * k; break;
    case 'twirl': yaw = Math.sin(t * 1.9) * 0.45 * k; y = Math.abs(Math.sin(t * 3.8)) * 0.06; break;
  }
  const wide = 1 / Math.sqrt(squash);
  model.position.y = y; model.rotation.set(rx, yaw, rz); model.scale.set(wide, squash, wide);
}

function Piece({ slot, side, getState, localId, drag, down, move, up, cancel }: {
  slot: number; side: 0 | 1; getState: () => SquadState | null; localId: string;
  drag: RefObject<Drag | null>; down: PointerHandler; move: PointerHandler; up: PointerHandler; cancel: () => void;
}) {
  const root = useRef<THREE.Group>(null!); const model = useRef<THREE.Group>(null!); const toy = useRef<THREE.Mesh>(null!);
  const hp = useRef<THREE.Mesh>(null!); const mana = useRef<THREE.Mesh>(null!); const stars = useRef<THREE.Mesh>(null!); const upgrade = useRef<THREE.Mesh>(null!);
  const stand = useRef<THREE.Mesh>(null!);
  const hpMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: PALETTE.sage }), []);
  useEffect(() => () => hpMaterial.dispose(), [hpMaterial]);
  const currentId = useRef<number | null>(null); const yaw = useRef(0);
  const shown = useRef({ kind: '', rarity: '', tier: 0, key: NaN, x: 0, z: 0 });
  const reduced = useRef(reducedMotion());
  useFrame(({ clock }, dt) => {
    const s = getState(); root.current.visible = false; currentId.current = null;
    if (s?.kind !== 'toy-squad') return;
    const v = readView(s, localId, clock.elapsedTime), p = v.player;
    const fighter = v.battle ? v.sides[side][slot] : undefined;
    const reserve = side === 0 && slot >= MAX_UNITS ? v.reserve[slot - MAX_UNITS] : undefined;
    const buildUnit = reserve ?? (s.phase === 'build' && side === 0 && slot < MAX_UNITS ? v.board[slot] : undefined);
    const unit = s.phase === 'build' ? buildUnit : buildUnit ?? fighter;
    const look = shown.current;
    if (!unit) { look.key = NaN; return; }
    const now = s.t / 1000, still = reduced.current;
    const cues = buildUnit ? undefined : unitCues.get(cueKey(side, fighter!.id));
    // A defeated toy topples for a moment, then leaves the board. Dead toys are never pickable.
    const dying = !buildUnit && fighter!.hp <= 0 ? (now - (cues?.diedAt ?? -9)) / 0.4 : -1;
    if (dying >= 1 || (dying >= 0 && still)) { look.key = NaN; return; }
    currentId.current = buildUnit?.id ?? null; root.current.visible = true;
    const def = ROSTER[unit.kind];
    if (look.kind !== unit.kind) { look.kind = unit.kind; toy.current.geometry = toyGeometry(unit.kind); }
    if (look.rarity !== def.rarity) { look.rarity = def.rarity; hpMaterial.color.set(RARITY_COLOURS[def.rarity]); stand.current.geometry = standGeometry(side, def.rarity); }
    if (look.tier !== unit.tier) { look.tier = unit.tier; stars.current.geometry = TIER_GEOMETRY[Math.min(3, Math.max(1, unit.tier)) - 1]; }
    const pos = buildUnit ? placementPosition(buildUnit.cell) : fighter!;
    const dragging = buildUnit && drag.current?.unit === buildUnit.id ? drag.current : null;
    // Fighters glide between squares; build pieces and reduced motion snap exactly as before.
    const tx = boardToWorld(pos.x), tz = boardToWorld(pos.z), key = buildUnit ? -1 : cueKey(side, fighter!.id);
    const glide = !buildUnit && !still && look.key === key ? 1 - Math.exp(-dt * 11) : 1;
    look.x += (tx - look.x) * glide; look.z += (tz - look.z) * glide; look.key = key;
    const stride = Math.min(1, (Math.abs(tx - look.x) + Math.abs(tz - look.z)) / 1.5);
    root.current.position.set(dragging?.x ?? look.x, dragging ? 1.1 : 0.3, dragging?.z ?? look.z);
    root.current.scale.setScalar(1 + (unit.tier - 1) * 0.12);
    const targetYaw = buildUnit ? Math.PI : fighter!.facing ?? (side === 0 ? Math.PI : 0);
    const delta = Math.atan2(Math.sin(targetYaw - yaw.current), Math.cos(targetYaw - yaw.current));
    yaw.current += delta * (1 - Math.exp(-dt * 14));
    const m = model.current;
    if (still) { m.position.set(0, 0, 0); m.rotation.set(0, yaw.current, 0); m.scale.setScalar(1); }
    else {
      idle(m, TOY_SPECS[unit.kind]?.motion ?? 'march', now + slot * 1.37 + side * 0.6, dragging ? 1 : stride);
      let lunge = 0, spin = 0;
      if (cues) {
        const attack = (now - cues.attackAt) / 0.3, cast = (now - cues.castAt) / 0.5, hurt = (now - cues.hurtAt) / 0.24;
        if (attack >= 0 && attack < 1) lunge = Math.sin(attack * Math.PI) * (cues.ranged ? -0.35 : 0.8);
        if (cast >= 0 && cast < 1) { const k = Math.sin(cast * Math.PI); m.position.y += k * 0.8; spin = easeInOut(cast) * Math.PI * 2; m.scale.multiplyScalar(1 + k * 0.14); }
        if (hurt >= 0 && hurt < 1) { const k = Math.sin(hurt * Math.PI); m.scale.y *= 1 - k * 0.14; m.scale.x *= 1 + k * 0.08; m.scale.z *= 1 + k * 0.08; }
        if (dying >= 0) { m.rotation.x += dying * 1.4; m.scale.multiplyScalar(1 - dying * 0.85); m.position.y += Math.sin(dying * Math.PI) * 0.6; }
      }
      m.position.x = Math.sin(yaw.current) * lunge; m.position.z = Math.cos(yaw.current) * lunge; m.rotation.y += yaw.current + spin;
    }
    const alive = !!buildUnit || fighter!.hp > 0;
    if (!buildUnit && alive && v.battle && badges.batch) {
      const r = root.current, k = r.scale.x;
      badges.batch.add(fighterStatus(fighter!, v.battle.tick), r.position.x, r.position.y + 5.1 * k, r.position.z);
    }
    hp.current.visible = alive; stars.current.visible = alive;
    hp.current.scale.x = buildUnit ? 1 : Math.max(0.01, fighter!.hp / fighter!.maxHp);
    mana.current.visible = !buildUnit && alive;
    mana.current.scale.x = buildUnit ? 0.01 : Math.max(0.01, fighter!.magic.mana / fighter!.magic.maxMana);
    const ui = useSquadUI.getState();
    let receivesUpgrade = false;
    if (buildUnit && buildUnit.cell >= 0 && p) {
      // Only an offer of this toy's own kind can upgrade it; a hovered shop card narrows the check to that card.
      const offered = ui.shopSlot !== null ? p.shop[ui.shopSlot] === unit.kind : p.shop.includes(unit.kind);
      receivesUpgrade = offered && purchaseUpgradeTargets(p, unit.kind).some(u => u.id === unit.id);
    }
    const justUpgraded = !!buildUnit && buildUnit.upgradedAt !== undefined && s.t - buildUnit.upgradedAt < 1400;
    upgrade.current.visible = receivesUpgrade || justUpgraded;
    toy.current.material = receivesUpgrade || justUpgraded ? TOY_GLOW_MATERIAL : TOY_MATERIAL;
  });
  return <group ref={root} onPointerDown={e => { if (currentId.current !== null) down(e, currentId.current); }}
    onPointerOver={e => { if (currentId.current !== null && !drag.current) { e.stopPropagation(); useSquadUI.setState({ hovered: currentId.current, shopSlot: null }); } }}
    onPointerOut={() => { if (useSquadUI.getState().hovered === currentId.current) useSquadUI.setState({ hovered: null }); }}
    onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <mesh ref={upgrade} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}} geometry={UPGRADE_GEOMETRY} material={UPGRADE_MATERIAL} dispose={null} />
    <mesh position={[0, 1.1, 0]} geometry={PICK_GEOMETRY} material={PICK_MATERIAL} dispose={null} />
    <mesh ref={stand} geometry={standGeometry(side, 'Common')} material={TOY_MATERIAL} raycast={() => {}} receiveShadow dispose={null} />
    <group ref={model}><mesh ref={toy} geometry={toyGeometry('soldier')} material={TOY_MATERIAL} raycast={() => {}} castShadow dispose={null} /></group>
    <mesh ref={hp} position={[0, 3.9, 0]} geometry={BAR_GEOMETRY} material={hpMaterial} raycast={() => {}} dispose={null} />
    <mesh ref={mana} position={[0, 3.62, 0]} geometry={MANA_GEOMETRY} material={MANA_MATERIAL} raycast={() => {}} dispose={null} />
    <mesh ref={stars} position={[0, 4.35, 0]} geometry={TIER_GEOMETRY[0]} material={UNLIT_VERTEX_MATERIAL} raycast={() => {}} dispose={null} />
  </group>;
}

const playVoice = (voice: CombatVoice) => playToyCue(voice === 'spell' ? 'stitch' : voice === 'heavy' ? 'button' : 'hit', voice === 'hit' ? 0.45 : 0.6);

/** `?debug` only: every roster toy on the board at once, for contact-sheet screenshots. */
function ToyGallery({ yaw }: { yaw: number }) {
  return <group>{Object.keys(ROSTER).map((kind, i) => <group key={kind} position={[boardToWorld(i % 8), 0.3, boardToWorld(Math.floor(i / 8))]}>
    <mesh geometry={standGeometry(0, ROSTER[kind].rarity)} material={TOY_MATERIAL} dispose={null} />
    <mesh geometry={toyGeometry(kind)} material={TOY_MATERIAL} rotation={[0, yaw, 0]} castShadow dispose={null} />
  </group>)}</group>;
}

function BadgesBegin() {
  const batch = useMemo(() => new StatusIconBatch(48, 1.5), []);
  useEffect(() => { badges.batch = batch; exposeDebug({ squadStatus: { shown: () => batch.shown, byKind: () => batch.shownByKind() } }); return () => { if (badges.batch === batch) badges.batch = null; batch.dispose(); }; }, [batch]);
  useFrame(() => batch.begin());
  return <primitive object={batch.group} />;
}
function BadgesEnd() {
  useFrame(({ camera }) => badges.batch?.end(camera));
  return null;
}

function DamageNumbers({ getState, localId }: { getState: () => SquadState | null; localId: string }) {
  const group = useMemo(() => new THREE.Group(), []);
  const sprites = useMemo(() => Array.from({ length: 40 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); s.visible = false; group.add(s); return s; }), [group]);
  const textures = useRef(new Map<number, THREE.CanvasTexture>());
  const values = useRef<{ x: number; z: number; amount: number; born: number }[]>([]), seen = useRef('');
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => () => { sprites.forEach(s => s.material.dispose()); textures.current.forEach(t => t.dispose()); }, [sprites]);
  useFrame(() => {
    const s = getState(), b = s?.kind === 'toy-squad' && s.phase !== 'build' ? s.battles.find(b => b.owner === viewId(s, localId)) : undefined;
    const now = s?.kind === 'toy-squad' ? s.t / 1000 : 0, key = b && s ? `${s.round}:${b.owner}:${b.tick}` : '';
    if (key !== seen.current) { seen.current = key; for (const hit of b?.damages ?? []) values.current.push({ ...hit, born: now }); }
    values.current = b ? values.current.filter(v => now - v.born < 0.9).slice(-40) : [];
    sprites.forEach((sprite, i) => {
      const v = values.current[i]; sprite.visible = !!v; if (!v) return;
      const amount = Math.min(999, Math.round(v.amount));
      if (!textures.current.has(amount)) {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d')!; ctx.font = 'bold 44px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 7; ctx.strokeStyle = PALETTE.ink; ctx.strokeText(String(amount), 64, 32); ctx.fillStyle = PALETTE.cream; ctx.fillText(String(amount), 64, 32);
        textures.current.set(amount, new THREE.CanvasTexture(canvas));
      }
      const texture = textures.current.get(amount)!;
      if (sprite.material.map !== texture) { sprite.material.map = texture; sprite.material.needsUpdate = true; }
      const age = (now - v.born) / 0.9; sprite.material.opacity = 1 - age;
      sprite.position.set(boardToWorld(v.x), 3.5 + (reduced.current ? 0 : age * 2.5), boardToWorld(v.z)); sprite.scale.set(2.4, 1.2, 1);
    });
  });
  return <primitive object={group} />;
}

export function SquadScene({ getState, localId }: MinigameSceneProps<SquadState>) {
  const { camera, gl } = useThree(); const drag = useRef<Drag | null>(null); const highlight = useRef<THREE.Mesh>(null!);
  const [gallery, setGallery] = useState<{ yaw: number; x: number; z: number; distance: number } | null>(null);
  const point = useRef(new THREE.Vector3());
  const selection = useRef<THREE.Mesh>(null!);
  const heard = useRef<{ battle: Battle | null; tick: number }>({ battle: null, tick: 0 });
  const rail = useRef({ px: 0, frame: 0 });
  const cancel = () => {
    const previous = drag.current; drag.current = null; gl.domElement.style.cursor = ''; previous?.release();
    if (useSquadUI.getState().dragging !== null) useSquadUI.setState({ dragging: null, overShop: false });
  };
  const move: PointerHandler = e => {
    const d = drag.current; if (!d || e.pointerId !== d.pointer) return;
    e.stopPropagation(); if (!editable(getState(), localId)) { cancel(); return; }
    if (e.ray.intersectPlane(floorPlane, point.current)) { d.x = point.current.x; d.z = point.current.z; d.cell = worldToDeployment(d.x, d.z); }
    // The shop strip doubles as the sell target while a toy is being dragged.
    const x = e.nativeEvent.clientX, y = e.nativeEvent.clientY, shop = d.shop;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 8) { d.moved = true; useSquadUI.setState({ dragging: d.unit }); }
    d.sell = d.moved && !!shop && x >= shop.left && x <= shop.right && y >= shop.top && y <= shop.bottom;
    if (d.sell !== useSquadUI.getState().overShop) useSquadUI.setState({ overShop: d.sell });
  };
  const down: PointerHandler = (e, id) => {
    if (id === undefined || drag.current) return;
    if (!editable(getState(), localId)) {
      // A board you are only looking at: a tap picks a toy to read its kit (never moves or merges anything).
      const s = getState();
      if (s?.kind === 'toy-squad' && (viewId(s, localId) !== localId || !useMatch.getState().contestants.find(c => c.id === localId)?.isLocal) && view.player?.units.some(u => u.id === id)) {
        e.stopPropagation(); useSquadUI.setState({ selected: useSquadUI.getState().selected === id ? null : id, hovered: null, shopSlot: null });
      }
      return;
    }
    e.stopPropagation(); unlockAudio();
    useSquadUI.setState({ selected: id, hovered: null, shopSlot: null });
    const target = e.target as unknown as { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
    target.setPointerCapture(e.pointerId); e.ray.intersectPlane(floorPlane, point.current);
    drag.current = { unit: id, pointer: e.pointerId, x: point.current.x, z: point.current.z, cell: worldToDeployment(point.current.x, point.current.z),
      shop: document.querySelector('.squad-workbench')?.getBoundingClientRect() ?? null, sell: false, sx: e.nativeEvent.clientX, sy: e.nativeEvent.clientY, moved: false,
      release: () => { try { target.releasePointerCapture(e.pointerId); } catch { /* capture already released */ } } };
    gl.domElement.style.cursor = 'grabbing';
  };
  const up: PointerHandler = e => {
    if (!drag.current || e.pointerId !== drag.current.pointer) return;
    move(e); const d = drag.current;
    if (d && editable(getState(), localId)) {
      if (d.sell) { submitSquadInput({ type: 'sell', unit: d.unit }); useSquadUI.setState({ selected: null }); }
      else if (d.cell !== null) submitSquadInput({ type: 'move', unit: d.unit, cell: d.cell });
    }
    cancel();
  };
  useEffect(() => {
    const previousTouch = gl.domElement.style.touchAction; gl.domElement.style.touchAction = 'none';
    const off = useMatch.subscribe(s => { if (s.paused || s.phase !== 'playing') cancel(); });
    const blur = () => cancel(); window.addEventListener('blur', blur);
    return () => { off(); window.removeEventListener('blur', blur); cancel(); setLocalPlayer(null); gl.domElement.style.touchAction = previousTouch; (camera as THREE.PerspectiveCamera).clearViewOffset(); };
  }, [gl]);
  // Only your own purchases and upgrades make a sound; the other contenders' boards stay silent.
  useEffect(() => matchBus.on('event', e => {
    const cue = eventCue(e, localId);
    if (cue === 'buy') sfx.click(); if (cue === 'upgrade') sfx.reward();
    if (cue === 'battle') sfx.bell(); if (cue === 'recap') sfx.musicBox();
  }), [localId]);
  useEffect(() => {
    exposeDebug({ squad: { point: (x: number, z: number, height = 0.1) => {
      const projected = new THREE.Vector3(boardToWorld(x), height, boardToWorld(z)).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
    }, gallery: (yaw: number | null, x = 3.5, z = 3.8, distance = 36) => setGallery(yaw === null ? null : { yaw, x, z, distance }), names: () => Object.values(ROSTER).map(d => d.name) } });
  }, [camera, gl]);
  useFrame(({ size, gl: renderer }) => {
    drawQueuedPortrait(renderer);
    // Combat sounds come from your own battle only, a few voices per tick at most.
    const now = getState(), watched = now?.kind === 'toy-squad' && now.phase === 'battle' ? audibleBattle(now.battles, localId) : undefined;
    if (watched && (watched !== heard.current.battle || watched.tick !== heard.current.tick)) {
      heard.current.battle = watched; heard.current.tick = watched.tick;
      if (!useMatch.getState().paused) for (const voice of combatVoices(watched.attacks)) playVoice(voice);
    }
    const building = getState()?.phase === 'build';
    const aspect = (camera as THREE.PerspectiveCamera).aspect;
    // Battles have no shop dock, so narrow (portrait) screens can frame the board tighter than the build view.
    // Phone landscape: the shop dock takes the lower third, so aim further forward to keep the reserves above it.
    const short = size.height < 500;
    // Phones keep the player rail at the right edge: frame the board in the space left of it.
    if (rail.current.frame++ % 15 === 0) rail.current.px = document.querySelector('.squad-rail')?.getBoundingClientRect().width ?? 0;
    const railPx = rail.current.px, narrow = size.width <= 600 || short;
    const room = narrow && railPx ? Math.max(0.6, (size.width - railPx - 12) / size.width) : 1;
    const distance = Math.max(building ? short ? 68 : 53 : 42, (building ? 31 : 23) / aspect / room);
    camera.position.set(0, distance, distance * 0.58);
    camera.lookAt(0, 0, building ? short ? 15 : 11 : 2.5);
    const cam = camera as THREE.PerspectiveCamera, shift = room < 1 ? Math.round((railPx + 12) / 2) : 0;
    if (shift !== (cam.view?.enabled ? cam.view.offsetX : 0) || (shift && cam.view && (cam.view.fullWidth !== size.width || cam.view.fullHeight !== size.height))) {
      if (shift) cam.setViewOffset(size.width, size.height, shift, 0, size.width, size.height); else cam.clearViewOffset();
    }
    if (gallery) { const x = boardToWorld(gallery.x), z = boardToWorld(gallery.z); camera.position.set(x, gallery.distance, z + gallery.distance * 0.58); camera.lookAt(x, 0, z); }
    if (drag.current && !editable(getState(), localId)) cancel();
    const d = drag.current; highlight.current.visible = !!d && !d.sell;
    // A white ring marks the selected toy (the one Sell, Q and the arrow keys act on; on a board you only look at, the one whose kit shows).
    const s = getState(), picked = building && s?.kind === 'toy-squad' ? useSquadUI.getState().selected : null;
    const chosen = picked !== null && s?.kind === 'toy-squad' && d?.unit !== picked ? s.players.find(p => p.id === viewId(s, localId))?.units.find(u => u.id === picked) : undefined;
    selection.current.visible = !!chosen;
    if (chosen) { const pos = placementPosition(chosen.cell); selection.current.position.set(boardToWorld(pos.x), 0.26, boardToWorld(pos.z)); }
    if (d) {
      const pos = d.cell !== null ? placementPosition(d.cell) : null;
      highlight.current.position.set(pos ? boardToWorld(pos.x) : d.x, 0.15, pos ? boardToWorld(pos.z) : d.z);
      (highlight.current.material as THREE.MeshBasicMaterial).color.set(d.cell === null ? PALETTE.coral : PALETTE.honey);
    }
  });
  return <group>
    <mesh position={[0, -0.5, 0]} receiveShadow onPointerDown={() => { if (!drag.current && useSquadUI.getState().selected !== null) useSquadUI.setState({ selected: null }); }}><boxGeometry args={[30, 1, 30]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    {Array.from({ length: 64 }, (_, i) => <mesh key={i} position={[boardToWorld(i % 8), 0.06, boardToWorld(Math.floor(i / 8))]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[CELL_SIZE - 0.12, CELL_SIZE - 0.12]} /><meshStandardMaterial color={(i % 8 + Math.floor(i / 8)) % 2 ? PALETTE.cardboard : PALETTE.cream} />
    </mesh>)}
    <mesh position={[0, 0.1, 0]}><boxGeometry args={[28, 0.07, 0.14]} /><meshBasicMaterial color={PALETTE.coral} /></mesh>
    {Array.from({ length: BENCH_SIZE }, (_, i) => {
      const pos = reservePosition(-i - 1);
      return <mesh key={`bench-${i}`} position={[boardToWorld(pos.x), -0.04, boardToWorld(pos.z)]} receiveShadow><boxGeometry args={[3.25, 0.35, 3.25]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>;
    })}
    <mesh ref={selection} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}} geometry={SELECT_GEOMETRY} material={SELECT_MATERIAL} dispose={null} />
    <mesh ref={highlight} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}><planeGeometry args={[3.3, 3.3]} /><meshBasicMaterial transparent opacity={0.5} depthWrite={false} /></mesh>
    {/* Effects subscribe to the frame loop first, so pieces read this frame's animation cues. */}
    <SquadFx getState={getState} localId={localId} />
    <BadgesBegin />
    {gallery ? <ToyGallery yaw={gallery.yaw} /> : ([0, 1] as const).flatMap(side => Array.from({ length: MAX_UNITS + (side === 0 ? BENCH_SIZE : 0) }, (_, slot) => <Piece key={`${side}:${slot}`} slot={slot} side={side} getState={getState} localId={localId} drag={drag} down={down} move={move} up={up} cancel={cancel} />))}
    <BadgesEnd />
    <DamageNumbers getState={getState} localId={localId} />
  </group>;
}
