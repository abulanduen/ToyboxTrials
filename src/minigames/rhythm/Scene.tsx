/**
 * Music Box Rhythm — the stage inside a giant mechanical music box.
 *
 * A pinned cylinder turns towards the camera. Each note is a coloured pin in one of four lanes;
 * it rides over the top of the cylinder and reaches the bright strike line just as its note
 * sounds. In front of the line sits the steel comb: four tines with coloured tips, one per lane,
 * which twang when the player plays. The band (the contestants) stands on the shelf behind.
 *
 * Everything that moves is driven from useFrame off the smooth song clock; no React state.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { tapVirtual } from '../../game/input';
import { useGame } from '../../game/store';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, type ToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim, type MiniAnim } from '../../character/MiniContender';
import { feltMat, woodMat } from '../../scene/props';
import { matchBus, useMatch } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { GOOD, MISS, PERFECT, type RhythmState } from './rules';
import { getSong } from './tracks';
import { syncSongClock } from './timing';
import { songClock, songNow } from './live';
import { driveMusic, stopMusic } from './music';
import { LANES } from './lanes';

/** How long a pin is on its way to the strike line. */
export const APPROACH_MS = 1500;

const R = 10; // cylinder radius (cm)
const LEN = 28; // pinned length
const CY = R + 3; // axle height
const LANE_W = LEN / 4;
const LANE_X = [-1.5, -0.5, 0.5, 1.5].map((k) => k * LANE_W);
/** Angles are measured from the top of the cylinder towards the camera. */
const HIT = THREE.MathUtils.degToRad(46);
const ARC = THREE.MathUtils.degToRad(98);
const OMEGA = ARC / APPROACH_MS; // rad per ms
const MAX_PINS = 56;
const MAX_BEATS = 10;
const TINE_ANGLE = HIT + 0.2;
const TINE_R = R + 1.35;
const TINE_TIP = new THREE.Vector3(0, CY + TINE_R * Math.cos(TINE_ANGLE), TINE_R * Math.sin(TINE_ANGLE));
const TINE_BASE = new THREE.Vector3(0, TINE_TIP.y - 0.9, TINE_TIP.z + 5.5);
const TINE_LEN = TINE_TIP.distanceTo(TINE_BASE);
const SHELF_Y = CY + 3.2;
const SHELF_Z = -14.5;
/** In portrait the machine is squeezed sideways so the camera can come closer. */
const PORTRAIT_SQUEEZE = 0.6;

const steel = new THREE.MeshStandardMaterial({ color: '#AEB4C0', roughness: 0.36, metalness: 0.7 });
const brass = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.8 });
const GREY = new THREE.Color('#6F6878');
const LANE_COLORS = LANES.map((l) => new THREE.Color(l.color));

interface Fx {
  /** Seconds since the tine was last played. */
  twang: number[];
  /** Seconds since the last hit flash, and its kind. */
  flash: number[];
  kind: ('perfect' | 'good' | 'miss')[];
}

export function RhythmScene({ getState, contestants, localId }: MinigameSceneProps<RhythmState>) {
  const fx = useRef<Fx>({ twang: [9, 9, 9, 9], flash: [9, 9, 9, 9], kind: ['good', 'good', 'good', 'good'] });
  const localAnim = useRef<ToyAnim>(createToyAnim());
  const miniAnims = useRef(new Map<string, MiniAnim>());
  for (const c of contestants) if (!c.isLocal && !miniAnims.current.has(c.id)) miniAnims.current.set(c.id, createMiniAnim());

  useEffect(() => {
    const off = matchBus.on('event', (e) => {
      const f = fx.current;
      if (e.type === 'judge') {
        const lane = e.lane as number;
        if (e.id === localId) {
          f.flash[lane] = 0;
          f.kind[lane] = e.judgement as Fx['kind'][number];
          if (e.judgement === 'miss') {
            if (e.broke) sfx.bump();
          } else {
            f.twang[lane] = 0;
            localAnim.current.landT = 0;
            localAnim.current.landImpact = e.judgement === 'perfect' ? 0.7 : 0.4;
            if ((e.combo as number) > 0 && (e.combo as number) % 10 === 0) localAnim.current.interactT = 0;
          }
        } else if (e.judgement !== 'miss') {
          const a = miniAnims.current.get(e.id as string);
          if (a) a.hopT = 0;
        }
      } else if (e.type === 'stray' && e.id === localId) {
        f.twang[e.lane as number] = 0;
        sfx.tick();
      } else if (e.type === 'over') {
        sfx.finishLine();
        localAnim.current.interactT = 0;
        for (const a of miniAnims.current.values()) a.cheerT = 0;
        window.setTimeout(() => {
          for (const a of miniAnims.current.values()) a.cheerT = -1;
        }, 1200);
      }
    });
    return () => {
      off();
      stopMusic();
    };
  }, [localId]);

  // Song clock + music. (Runs before the host steps the match this frame.)
  useFrame((_, dt) => {
    const s = getState();
    const m = useMatch.getState();
    if (s) syncSongClock(songClock, performance.now(), s.t);
    const audible = !!s && m.phase === 'playing' && !m.paused && !s.over && songClock.scale === 1;
    driveMusic(s ? getSong(s.track) : null, s ? songNow() : 0, audible);
    const a = localAnim.current;
    a.landT += dt;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
    const f = fx.current;
    for (let i = 0; i < 4; i++) {
      f.twang[i] += dt;
      f.flash[i] += dt;
    }
  });

  const row = useMemo(() => layoutRow(contestants, localId), [contestants, localId]);
  const machine = useRef<THREE.Group>(null!);
  const band = useRef<THREE.Group>(null!);

  return (
    <group>
      <CameraRig machine={machine} band={band} />
      <spotLight position={[6, 60, 40]} target-position={[0, CY, 0]} angle={0.5} penumbra={0.8} intensity={1.3} decay={0} distance={0} color="#FFF0D6" />
      <BoxShell />
      <group ref={machine}>
        <Cylinder getState={getState} localId={localId} />
        <Comb fx={fx} />
      </group>
      {/* the band, on the shelf behind the cylinder */}
      <group ref={band} position={[0, SHELF_Y, SHELF_Z]}>
        {row.map(({ c, x }) =>
          c.isLocal ? (
            <group key={c.id} position={[x, 0, 0.6]} scale={1.25}>
              <WindupBot anim={localAnim} paint={c.paint} hat={c.hat} keySkin={c.keySkin} />
            </group>
          ) : (
            <group key={c.id} position={[x, 0, 0]}>
              <MiniContender paint={c.paint} anim={{ current: miniAnims.current.get(c.id)! }} />
            </group>
          ),
        )}
      </group>
    </group>
  );
}

function layoutRow(contestants: Contestant[], localId: string) {
  const local = contestants.find((c) => c.id === localId);
  const others = contestants.filter((c) => c.id !== localId);
  const out: { c: Contestant; x: number }[] = [];
  if (local) out.push({ c: local, x: 0 });
  others.forEach((c, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const step = Math.floor(i / 2) + 1;
    out.push({ c, x: side * (4.2 + (step - 1) * 3.3) });
  });
  return out;
}

/**
 * Fixed view from in front and above, framed so the whole pinned width fits in any aspect ratio
 * and the strike line stays clear of the touch pads at the bottom of the screen.
 */
function CameraRig({ machine, band }: { machine: React.RefObject<THREE.Group>; band: React.RefObject<THREE.Group> }) {
  const { camera, size } = useThree();
  useFrame((s) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const portrait = aspect < 1;
    const squeeze = portrait ? PORTRAIT_SQUEEZE : 1;
    machine.current.scale.x = squeeze;
    band.current.scale.setScalar(portrait ? 0.62 : 1);
    const fov = portrait ? 50 + (1 - aspect) * 36 : 46;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfW = (LEN / 2 + 3.5) * squeeze;
    const d = Math.max(portrait ? 32 : 43, halfW / (tanHalf * aspect));
    // Touch pads cover the bottom of the screen and the HUD the top: shift the picture up/down.
    const touch = useGame.getState().touchUI;
    const bottomPx = touch ? (portrait ? 150 : 96) : 74;
    const topPx = portrait ? 150 : 70;
    const shift = ((bottomPx - topPx) / size.height) * d * tanHalf; // world units at the target
    const elev = THREE.MathUtils.degToRad(portrait ? 54 : 50);
    const t = s.clock.elapsedTime;
    const ty = CY + 5 - shift * Math.cos(elev);
    const tz = 0.5 + shift * Math.sin(elev);
    cam.position.set(Math.sin(t * 0.09) * 0.5, ty + Math.sin(elev) * d, tz + Math.cos(elev) * d);
    cam.lookAt(0, ty, tz);
  });
  return null;
}

/** The inside of the music box: base plate, felt, back wall, side walls, the band's shelf. */
function BoxShell() {
  return (
    <group>
      <mesh position={[0, 0.75, -2]} receiveShadow castShadow material={woodMat(PALETTE.woodDark)}>
        <boxGeometry args={[52, 1.5, 46]} />
      </mesh>
      <mesh position={[0, 1.52, -2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat('#6E4C72')}>
        <planeGeometry args={[49, 43]} />
      </mesh>
      {/* back wall with a felt lining and a brass maker's plate */}
      <mesh position={[0, 17, -24]} receiveShadow castShadow material={woodMat(PALETTE.woodMid)}>
        <boxGeometry args={[52, 34, 2]} />
      </mesh>
      <mesh position={[0, 18, -22.95]} material={feltMat(PALETTE.inkPurple)}>
        <planeGeometry args={[47, 29]} />
      </mesh>
      <mesh position={[0, 30, -22.9]} material={brass}>
        <planeGeometry args={[16, 2.6]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 25, 9, -2]} receiveShadow castShadow material={woodMat(PALETTE.woodMid)}>
          <boxGeometry args={[2, 18, 46]} />
        </mesh>
      ))}
      {/* the band's shelf */}
      <mesh position={[0, SHELF_Y - 1, SHELF_Z - 1]} receiveShadow castShadow material={woodMat(PALETTE.woodLight)}>
        <boxGeometry args={[46, 2, 9]} />
      </mesh>
      <mesh position={[0, SHELF_Y + 0.02, SHELF_Z - 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat(PALETTE.coral)}>
        <planeGeometry args={[45, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 17, SHELF_Y / 2 - 1, SHELF_Z - 2]} castShadow material={woodMat(PALETTE.woodLight)}>
          <boxGeometry args={[2.4, SHELF_Y - 2, 5]} />
        </mesh>
      ))}
    </group>
  );
}

/** The turning cylinder with its lane bands, beat lines and note pins. */
function Cylinder({ getState, localId }: Pick<MinigameSceneProps<RhythmState>, 'getState' | 'localId'>) {
  const drum = useRef<THREE.Group>(null!);
  const pins = useRef<THREE.InstancedMesh>(null!);
  const beats = useRef<THREE.InstancedMesh>(null!);
  const firstNote = useRef(0);
  const lastNow = useRef(0);
  const idle = useRef(0);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), x: new THREE.Vector3(1, 0, 0), c: new THREE.Color() }), []);
  const pinGeo = useMemo(() => new THREE.BoxGeometry(LANE_W * 0.74, 1.1, 1.8).translate(0, 0.55, 0), []);
  const beatGeo = useMemo(() => new THREE.BoxGeometry(LEN, 0.05, 0.11).translate(0, 0.025, 0), []);
  const pinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }), []);
  const beatMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.4 }), []);
  const laneMats = useMemo(() => LANE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color('#3B3346').lerp(c, 0.2), roughness: 0.5, metalness: 0.35 })), []);
  const teeth = useMemo(() => Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2), []);
  const barColor = useMemo(() => new THREE.Color('#B4A8C6'), []);
  const beatColor = useMemo(() => new THREE.Color('#6A6080'), []);

  const place = (mesh: THREE.InstancedMesh, i: number, x: number, angle: number, scale: number, color: THREE.Color) => {
    tmp.q.setFromAxisAngle(tmp.x, angle);
    tmp.p.set(x, R * Math.cos(angle), R * Math.sin(angle));
    tmp.s.set(1, scale, scale);
    tmp.m.compose(tmp.p, tmp.q, tmp.s);
    mesh.setMatrixAt(i, tmp.m);
    mesh.setColorAt(i, color);
  };

  useFrame((_, dt) => {
    const s = getState();
    let k = 0;
    let b = 0;
    if (!s) {
      // Attract mode behind the intro card: the cylinder just turns.
      idle.current += dt * 400;
      drum.current.rotation.x = idle.current * OMEGA;
    } else {
      const now = songNow();
      drum.current.rotation.x = now * OMEGA;
      if (now < lastNow.current - 50) firstNote.current = 0;
      lastNow.current = now;
      const me = s.players.find((p) => p.id === localId);
      const chart = s.chart;
      while (firstNote.current < chart.length && chart[firstNote.current].t < now - 600) firstNote.current++;
      for (let i = firstNote.current; i < chart.length && k < MAX_PINS; i++) {
        const n = chart[i];
        const ahead = n.t - now;
        if (ahead > APPROACH_MS) break;
        const mark = me ? me.judged[i] : 0;
        if (mark === PERFECT || mark === GOOD) continue; // played: the pin is gone
        const angle = HIT - ahead * OMEGA;
        if (angle > HIT + 0.55) continue;
        const missed = mark === MISS || ahead < -s.config.goodMs;
        // Pins rise out of the cylinder as they come over the horizon.
        const grow = Math.min(1, (APPROACH_MS - ahead) / 140);
        place(pins.current, k++, LANE_X[n.lane], angle, missed ? grow * 0.7 : grow, missed ? GREY : LANE_COLORS[n.lane]);
      }
      // Beat lines (bar lines brighter), so the pulse can be read off the cylinder.
      const song = getSong(s.track);
      const first = Math.max(0, Math.ceil((now - 300) / song.beatMs));
      for (let i = first; i < song.beats && b < MAX_BEATS; i++) {
        const ahead = i * song.beatMs - now;
        if (ahead > APPROACH_MS) break;
        const angle = HIT - ahead * OMEGA;
        if (angle > HIT + 0.3) continue;
        const bar = i % song.beatsPerBar === 0;
        place(beats.current, b++, 0, angle, bar ? 1.8 : 1, bar ? barColor : beatColor);
      }
    }
    pins.current.count = k;
    beats.current.count = b;
    pins.current.instanceMatrix.needsUpdate = true;
    beats.current.instanceMatrix.needsUpdate = true;
    if (pins.current.instanceColor) pins.current.instanceColor.needsUpdate = true;
    if (beats.current.instanceColor) beats.current.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[0, CY, 0]}>
      {/* the drum itself: lane bands, brass rings, end gear (all turning) */}
      <group ref={drum}>
        {LANE_X.map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow material={laneMats[i]}>
            <cylinderGeometry args={[R, R, LANE_W - 0.3, 40, 1]} />
          </mesh>
        ))}
        {[-2, -1, 0, 1, 2].map((k) => (
          <mesh key={k} position={[k * LANE_W, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={brass}>
            <cylinderGeometry args={[R + (Math.abs(k) === 2 ? 0.7 : 0.12), R + (Math.abs(k) === 2 ? 0.7 : 0.12), Math.abs(k) === 2 ? 0.9 : 0.34, 40, 1]} />
          </mesh>
        ))}
        <group position={[LEN / 2 + 2.6, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={brass}>
            <cylinderGeometry args={[6.4, 6.4, 1.1, 28]} />
          </mesh>
          {teeth.map((a) => (
            <mesh key={a} position={[0, Math.cos(a) * 6.9, Math.sin(a) * 6.9]} rotation={[a, 0, 0]} material={brass}>
              <boxGeometry args={[1.1, 1.5, 1.5]} />
            </mesh>
          ))}
        </group>
      </group>
      {/* axle + bearing blocks */}
      <mesh rotation={[0, 0, Math.PI / 2]} material={steel}>
        <cylinderGeometry args={[0.9, 0.9, LEN + 12, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LEN / 2 + 5.2), -CY / 2 + 1, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodLight)}>
          <boxGeometry args={[2.2, CY + 1, 6]} />
        </mesh>
      ))}
      {/* the strike line: fixed, bright, right across the cylinder */}
      <group rotation={[HIT, 0, 0]}>
        <mesh position={[0, R + 0.1, 0]}>
          <boxGeometry args={[LEN + 0.6, 0.14, 0.6]} />
          <meshBasicMaterial color="#FFF7DC" toneMapped={false} />
        </mesh>
        {/* end markers, so the line can't be mistaken for a beat line */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (LEN / 2 + 0.75), R + 0.75, 0]} rotation={[0, 0, s * Math.PI * 0.5]}>
            <coneGeometry args={[0.9, 1.5, 3]} />
            <meshBasicMaterial color="#FFF7DC" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={beats} args={[beatGeo, beatMat, MAX_BEATS]} frustumCulled={false} />
      <instancedMesh ref={pins} args={[pinGeo, pinMat, MAX_PINS]} frustumCulled={false} castShadow />
    </group>
  );
}

/** The steel comb: one tine per lane with a coloured tip, a flash on the strike line for hits. */
function Comb({ fx }: { fx: React.RefObject<Fx> }) {
  const tines = useRef<(THREE.Group | null)[]>([]);
  const flashes = useRef<(THREE.Mesh | null)[]>([]);
  const flashMats = useMemo(() => LANES.map(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), []);
  const tipMats = useMemo(() => LANES.map((l) => new THREE.MeshStandardMaterial({ color: l.color, roughness: 0.4, emissive: l.color, emissiveIntensity: 0.25 })), []);
  const tilt = Math.atan2(TINE_BASE.y - TINE_TIP.y, TINE_BASE.z - TINE_TIP.z);
  const hitPos = useMemo(() => new THREE.Vector3(0, CY + (R + 1.25) * Math.cos(HIT), (R + 1.25) * Math.sin(HIT)), []);

  useFrame(() => {
    const f = fx.current;
    if (!f) return;
    for (let i = 0; i < 4; i++) {
      const g = tines.current[i];
      const tw = f.twang[i];
      if (g) g.rotation.x = -tilt + (tw < 0.5 ? 0.16 * Math.exp(-tw * 11) * Math.cos(tw * 46) : 0);
      const mesh = flashes.current[i];
      const mat = flashMats[i];
      const t = f.flash[i];
      const kind = f.kind[i];
      const life = kind === 'miss' ? 0.22 : 0.3;
      if (mesh) {
        if (t < life) {
          const u = t / life;
          mat.opacity = (kind === 'miss' ? 0.55 : 0.95) * (1 - u);
          mat.color.set(kind === 'perfect' ? '#FFF2B0' : kind === 'good' ? LANES[i].color : '#5A2A33');
          const grow = kind === 'perfect' ? 1 + u * 0.9 : kind === 'good' ? 0.8 + u * 0.4 : 0.9;
          mesh.scale.set(1, grow, grow);
          mesh.visible = true;
        } else mesh.visible = false;
      }
    }
  });

  return (
    <group>
      {/* comb base bar on two posts */}
      <mesh position={[0, TINE_BASE.y - 0.5, TINE_BASE.z + 1.6]} castShadow material={steel}>
        <boxGeometry args={[LEN + 3, 1.3, 4]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LEN / 2 + 0.4), (TINE_BASE.y - 1.1) / 2 + 0.75, TINE_BASE.z + 2]} castShadow material={woodMat(PALETTE.woodLight)}>
          <boxGeometry args={[2, TINE_BASE.y - 2.6, 3]} />
        </mesh>
      ))}
      {LANES.map((lane, i) => (
        <group
          key={lane.key}
          ref={(g) => {
            tines.current[i] = g;
          }}
          position={[LANE_X[i], TINE_BASE.y, TINE_BASE.z]}
          rotation={[-tilt, 0, 0]}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            tapVirtual(lane.action, ev.nativeEvent.timeStamp);
          }}
        >
          <mesh position={[0, 0, -TINE_LEN / 2]} castShadow material={steel}>
            <boxGeometry args={[LANE_W * 0.8, 0.4, TINE_LEN]} />
          </mesh>
          <mesh position={[0, 0.12, -TINE_LEN + 1.3]} material={tipMats[i]}>
            <boxGeometry args={[LANE_W * 0.82, 0.62, 2.6]} />
          </mesh>
        </group>
      ))}
      {LANES.map((lane, i) => (
        <mesh
          key={lane.key}
          ref={(m) => {
            flashes.current[i] = m;
          }}
          position={[LANE_X[i], hitPos.y, hitPos.z]}
          rotation={[HIT - Math.PI / 2, 0, 0]}
          material={flashMats[i]}
          visible={false}
        >
          <planeGeometry args={[LANE_W * 0.96, 3.2]} />
        </mesh>
      ))}
    </group>
  );
}
