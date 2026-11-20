/**
 * Copycat Conductor — the mechanical music theatre on the tabletop.
 * A cigar-box stage on a hardback book, felt curtains, cardboard proscenium, bead footlights,
 * the wind-up bandleader on a podium, four instruments, and the contestants in the front row.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '../../scene/RoundedBox';
import * as THREE from 'three';
import { PALETTE, PAINT_JOBS } from '../../game/palette';
import { sfx } from '../../game/audio';
import { tapVirtual } from '../../game/input';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, type ToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim, type MiniAnim } from '../../character/MiniContender';
import { matchBus } from '../session';
import { paintMat, woodMat, feltMat, Bunting } from '../../scene/props';
import { cardboardTexture } from '../../scene/textures';
import type { MinigameSceneProps, Contestant } from '../types';
import type { CopycatState, Slot } from './rules';
import { YouMarker } from '../shared/YouMarker';

export const INSTRUMENTS: { slot: Slot; key: string; name: string; color: string; voice: () => void }[] = [
  { slot: 0, key: 'A', name: 'Drum', color: PALETTE.coral, voice: () => sfx.drum() },
  { slot: 1, key: 'S', name: 'Bell', color: PALETTE.honey, voice: () => sfx.bell() },
  { slot: 2, key: 'J', name: 'Xylophone', color: PALETTE.toyBlue, voice: () => sfx.xylophone() },
  { slot: 3, key: 'K', name: 'Music box', color: PALETTE.sage, voice: () => sfx.musicBox() },
];
const SLOT_ACTION = ['slot1', 'slot2', 'slot3', 'slot4'] as const;

const STAGE = { w: 46, d: 20, h: 3.2, z: -3 };
const INST_X = [-13.5, -4.5, 4.5, 13.5];
const INST_Z = 1.5;
const ROW_Z = 15;

/** Shared hit bookkeeping for the instruments (written by events, read in useFrame). */
interface Hit {
  at: number;
  wrong: boolean;
  big: boolean;
}

export function CopycatScene({ getState, contestants, localId }: MinigameSceneProps<CopycatState>) {
  const hits = useRef<Hit[]>(INSTRUMENTS.map(() => ({ at: -99, wrong: false, big: false })));
  const clock = useThree((s) => s.clock);
  const conductorAnim = useRef<ToyAnim>(createToyAnim());
  const localAnim = useRef<ToyAnim>(createToyAnim());
  const miniAnims = useRef(new Map<string, MiniAnim>());
  for (const c of contestants) if (!c.isLocal && !miniAnims.current.has(c.id)) miniAnims.current.set(c.id, createMiniAnim());

  useEffect(() => {
    const off = matchBus.on('event', (e) => {
      const now = clock.elapsedTime;
      switch (e.type) {
        case 'demo-note': {
          const slot = e.slot as Slot;
          hits.current[slot] = { at: now, wrong: false, big: true };
          INSTRUMENTS[slot].voice();
          conductorAnim.current.interactT = 0; // baton flourish
          break;
        }
        case 'press': {
          const slot = e.slot as Slot;
          if (e.id === localId) {
            hits.current[slot] = { at: now, wrong: !e.ok, big: false };
            if (e.ok) INSTRUMENTS[slot].voice();
            else sfx.bump();
            localAnim.current.landT = 0;
            localAnim.current.landImpact = 0.6;
          } else {
            const a = miniAnims.current.get(e.id as string);
            if (a) a.hopT = 0;
          }
          break;
        }
        case 'eliminated': {
          if (e.id === localId) {
            localAnim.current.elimT = 0;
            sfx.eliminate();
          } else {
            const a = miniAnims.current.get(e.id as string);
            if (a) a.outT = 0;
            sfx.pop();
          }
          break;
        }
        case 'your-turn':
          sfx.interact();
          break;
        case 'round-end': {
          const survivors = e.survivors as string[];
          if (survivors.includes(localId)) localAnim.current.interactT = 0;
          for (const id of survivors) {
            const a = miniAnims.current.get(id);
            if (a) a.cheerT = 0;
          }
          window.setTimeout(() => {
            for (const id of survivors) {
              const a = miniAnims.current.get(id);
              if (a) a.cheerT = -1;
            }
          }, 900);
          break;
        }
        case 'over':
          conductorAnim.current.interactT = 0;
          break;
      }
    });
    return off;
  }, [clock, localId]);

  // Keep the local toy lying down once knocked out (don't run the hub's respawn fade).
  useFrame((_, dt) => {
    const a = localAnim.current;
    a.landT += dt;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
    if (a.elimT >= 0) a.elimT = Math.min(2.0, a.elimT + dt);
    const c = conductorAnim.current;
    c.landT += dt;
    if (c.interactT >= 0) c.interactT = c.interactT + dt > 0.75 ? -1 : c.interactT + dt;
  });

  const row = useMemo(() => layoutRow(contestants, localId), [contestants, localId]);

  return (
    <group>
      <CameraRig />
      <spotLight position={[0, 46, 34]} target-position={[0, 3, -2]} angle={0.5} penumbra={0.8} intensity={1.2} decay={0} distance={0} color="#FFF0D6" />
      <Theatre />
      <group position={[0, STAGE.h, -10.5]} scale={1.4}>
        <Podium />
        <group position={[0, 1.6, 0]}>
          <WindupBot anim={conductorAnim} paint={PAINT_JOBS[4]} hat="bottlecap" keySkin="golden" />
        </group>
        <Baton anim={conductorAnim} />
      </group>
      {INSTRUMENTS.map((ins, i) => (
        <group
          key={ins.slot}
          position={[INST_X[i], STAGE.h, INST_Z]}
          scale={1.25}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            tapVirtual(SLOT_ACTION[i]);
          }}
        >
          <Instrument slot={ins.slot} hits={hits} clockRef={clock} />
          <KeyCapSign letter={ins.key} color={ins.color} />
        </group>
      ))}
      {/* front row */}
      {row.map(({ c, x }) =>
        c.isLocal ? (
          <group key={c.id} position={[x, 0, ROW_Z]} rotation={[0, Math.PI, 0]} scale={1.15}>
            <WindupBot anim={localAnim} paint={c.paint} hat={c.hat} keySkin={c.keySkin} />
            <YouMarker />
          </group>
        ) : (
          <group key={c.id} position={[x, 0, ROW_Z + 1]} rotation={[0, Math.PI, 0]}>
            <MiniContender paint={c.paint} anim={{ current: miniAnims.current.get(c.id)! }} />
          </group>
        ),
      )}
      <StatusTokens getState={getState} row={row} />
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
    out.push({ c, x: side * (3.6 + (step - 1) * 3.4) });
  });
  return out;
}

/** Fixed, gently elevated audience view; wider and further back in portrait. */
function CameraRig() {
  const { camera, size } = useThree();
  useFrame((s) => {
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width < size.height;
    const t = s.clock.elapsedTime;
    const fov = portrait ? 50 + (1 - size.width / size.height) * 40 : 50;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const z = portrait ? 54 : 36;
    const y = portrait ? 22 : 15;
    cam.position.set(Math.sin(t * 0.07) * 1.2, y + Math.sin(t * 0.11) * 0.3, z);
    cam.lookAt(0, portrait ? 4 : 6, -3);
  });
  return null;
}

function Theatre() {
  const card = useMemo(() => new THREE.MeshStandardMaterial({ map: cardboardTexture('#C9A57A', [1, 1]), roughness: 0.95 }), []);
  const footBulbs = useMemo(() => Array.from({ length: 11 }, (_, i) => -20 + i * 4), []);
  return (
    <group>
      {/* hardback book plinth + cigar-box stage */}
      <RoundedBox args={[STAGE.w + 6, 1.6, STAGE.d + 8]} radius={0.3} smoothness={2} position={[0, 0.8, STAGE.z + 1]} receiveShadow castShadow material={paintMat('#7C3F3A', 0.8)} />
      <mesh position={[0.6, 0.8, STAGE.z + 1]} material={paintMat('#F1E7D6', 1)}>
        <boxGeometry args={[STAGE.w + 5.4, 1.1, STAGE.d + 8.05]} />
      </mesh>
      <mesh position={[0, 1.6 + (STAGE.h - 1.6) / 2, STAGE.z]} receiveShadow castShadow material={woodMat('#B9824A')}>
        <boxGeometry args={[STAGE.w, STAGE.h - 1.6, STAGE.d]} />
      </mesh>
      {/* cigar-box label stripe on the front */}
      <mesh position={[0, 1.6 + (STAGE.h - 1.6) / 2, STAGE.z + STAGE.d / 2 + 0.02]} material={paintMat(PALETTE.coral, 0.6)}>
        <planeGeometry args={[STAGE.w * 0.6, 0.9]} />
      </mesh>
      {/* stage floor felt */}
      <mesh position={[0, STAGE.h + 0.01, STAGE.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat('#6E4C72')}>
        <planeGeometry args={[STAGE.w - 1, STAGE.d - 1]} />
      </mesh>
      {/* back curtains */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 12, STAGE.h + 10, STAGE.z - STAGE.d / 2 + 0.6]} castShadow material={feltMat(PALETTE.inkPurple)}>
          <boxGeometry args={[23.5, 20, 0.8]} />
        </mesh>
      ))}
      {/* side curtains (tied back) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (STAGE.w / 2 - 0.2), STAGE.h + 10, STAGE.z + STAGE.d / 2 - 2]} castShadow material={feltMat(PALETTE.coral)}>
          <cylinderGeometry args={[1.6, 2.8, 20, 10]} />
        </mesh>
      ))}
      {/* cardboard proscenium */}
      <group position={[0, 0, STAGE.z + STAGE.d / 2 - 0.6]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (STAGE.w / 2 + 0.5), STAGE.h + 11, 0]} castShadow material={card}>
            <boxGeometry args={[2.6, 22, 1]} />
          </mesh>
        ))}
        <mesh position={[0, STAGE.h + 22.5, 0]} castShadow material={card}>
          <boxGeometry args={[STAGE.w + 3.6, 4, 1]} />
        </mesh>
        <mesh position={[0, STAGE.h + 22.5, 0.52]} material={paintMat(PALETTE.honey, 0.4, 0.4)}>
          <planeGeometry args={[STAGE.w - 2, 2.4]} />
        </mesh>
        {/* valance */}
        <mesh position={[0, STAGE.h + 19.6, -0.2]} material={feltMat(PALETTE.coral)}>
          <boxGeometry args={[STAGE.w, 2.2, 0.6]} />
        </mesh>
      </group>
      {/* footlights */}
      {footBulbs.map((x) => (
        <mesh key={x} position={[x, STAGE.h + 0.5, STAGE.z + STAGE.d / 2 - 0.8]}>
          <sphereGeometry args={[0.45, 10, 8]} />
          <meshStandardMaterial color="#FFF4D6" emissive="#FFD58A" emissiveIntensity={1.4} />
        </mesh>
      ))}
      <Bunting from={[-STAGE.w / 2, STAGE.h + 20.5, STAGE.z + STAGE.d / 2 + 0.4]} to={[STAGE.w / 2, STAGE.h + 20.5, STAGE.z + STAGE.d / 2 + 0.4]} sag={2.2} count={16} />
    </group>
  );
}

function Podium() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodLight)}>
        <cylinderGeometry args={[2.1, 2.4, 1.6, 16]} />
      </mesh>
      <mesh position={[0, 1.62, 0]} material={feltMat(PALETTE.coral)}>
        <cylinderGeometry args={[2.0, 2.0, 0.05, 16]} />
      </mesh>
    </group>
  );
}

/** A toothpick baton that whips with each demonstrated note. */
function Baton({ anim }: { anim: React.RefObject<ToyAnim> }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((s) => {
    const a = anim.current!;
    const k = a.interactT >= 0 ? Math.sin((a.interactT / 0.75) * Math.PI) : 0;
    g.current.rotation.z = -0.6 - k * 1.1 + Math.sin(s.clock.elapsedTime * 2) * 0.05;
    g.current.rotation.x = -0.3 + k * 0.4;
  });
  return (
    <group ref={g} position={[-1.05, 4.2, 0.4]}>
      <mesh position={[0, 1.1, 0]} material={paintMat('#E8D6B5', 0.7)}>
        <cylinderGeometry args={[0.05, 0.08, 2.4, 6]} />
      </mesh>
      <mesh position={[0, 2.3, 0]} material={paintMat(PALETTE.white, 0.3)}>
        <sphereGeometry args={[0.1, 8, 6]} />
      </mesh>
    </group>
  );
}

function KeyCapSign({ letter, color }: { letter: string; color: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#FFF9EE';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = color;
    g.lineWidth = 14;
    g.strokeRect(7, 7, 114, 114);
    g.fillStyle = '#2B2433';
    g.font = '700 84px Fredoka, "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [letter, color]);
  return (
    <group position={[0, 0.4, 4.6]} rotation={[-0.5, 0, 0]}>
      <RoundedBox args={[2.2, 2.2, 0.6]} radius={0.2} smoothness={2} material={paintMat('#2B2433', 0.6)} castShadow />
      <mesh position={[0, 0, 0.31]}>
        <planeGeometry args={[1.9, 1.9]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------------------ instruments

function useHitK(hits: React.RefObject<Hit[]>, slot: number, clockRef: THREE.Clock) {
  return () => {
    const h = hits.current![slot];
    const dt = clockRef.elapsedTime - h.at;
    return { dt, h };
  };
}

function GlowRing({ color, read }: { color: string; read: () => { dt: number; h: Hit } }) {
  const m = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const { dt, h } = read();
    const k = Math.max(0, 1 - dt / (h.big ? 0.55 : 0.35));
    m.current.opacity = 0.12 + k * 0.75;
    m.current.color.set(h.wrong && k > 0 ? '#E04848' : color);
  });
  return (
    <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[3.6, 32]} />
      <meshBasicMaterial ref={m} color={color} transparent opacity={0.15} depthWrite={false} />
    </mesh>
  );
}

function Instrument({ slot, hits, clockRef }: { slot: Slot; hits: React.RefObject<Hit[]>; clockRef: THREE.Clock }) {
  const read = useHitK(hits, slot, clockRef);
  const ins = INSTRUMENTS[slot];
  return (
    <group>
      <GlowRing color={ins.color} read={read} />
      {slot === 0 && <Drum read={read} />}
      {slot === 1 && <Bell read={read} />}
      {slot === 2 && <Xylophone read={read} />}
      {slot === 3 && <MusicBox read={read} />}
    </group>
  );
}

type Read = () => { dt: number; h: Hit };
const pulse = (dt: number, dur: number) => (dt >= 0 && dt < dur ? Math.sin((dt / dur) * Math.PI) : 0);
const ring = (dt: number, decay: number, freq: number) => (dt >= 0 ? Math.exp(-dt * decay) * Math.sin(dt * freq) : 0);

function Drum({ read }: { read: Read }) {
  const body = useRef<THREE.Group>(null!);
  const sticks = useRef<THREE.Group[]>([]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.coral, roughness: 0.5, emissive: PALETTE.coral, emissiveIntensity: 0 }), []);
  useFrame(() => {
    const { dt } = read();
    const k = pulse(dt, 0.3);
    body.current.scale.set(1 + k * 0.08, 1 - k * 0.1, 1 + k * 0.08);
    glow.emissiveIntensity = k * 0.8;
    sticks.current.forEach((s, i) => {
      if (s) s.rotation.z = (i ? -1 : 1) * (0.5 - k * 0.45);
    });
  });
  return (
    <group>
      <group ref={body}>
        <mesh position={[0, 1.4, 0]} castShadow material={glow}>
          <cylinderGeometry args={[2.1, 2.1, 2.6, 22]} />
        </mesh>
        <mesh position={[0, 2.72, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.cream, 0.7)}>
          <circleGeometry args={[2.05, 22]} />
        </mesh>
        {[0.15, 2.65].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={paintMat(PALETTE.honey, 0.35, 0.5)}>
            <torusGeometry args={[2.12, 0.14, 6, 24]} />
          </mesh>
        ))}
        {/* zig-zag lacing */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 2.13, 1.4, Math.sin(a) * 2.13]} rotation={[0, -a, i % 2 ? 0.6 : -0.6]} material={paintMat(PALETTE.cream, 0.8)}>
              <boxGeometry args={[0.08, 2.3, 0.08]} />
            </mesh>
          );
        })}
      </group>
      {[-1, 1].map((s, i) => (
        <group key={s} ref={(g) => void (g && (sticks.current[i] = g))} position={[s * 1.2, 3.1, 0.6]}>
          <mesh position={[s * 0.9, 0.9, 0]} rotation={[0, 0, s * 0.6]} material={woodMat(PALETTE.woodLight)}>
            <cylinderGeometry args={[0.09, 0.09, 2.4, 6]} />
          </mesh>
          <mesh position={[s * 0.2, 0.05, 0]} material={paintMat(PALETTE.cream, 0.5)}>
            <sphereGeometry args={[0.2, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bell({ read }: { read: Read }) {
  const swing = useRef<THREE.Group>(null!);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.honey, roughness: 0.22, metalness: 0.85, emissive: PALETTE.honey, emissiveIntensity: 0 }), []);
  useFrame(() => {
    const { dt } = read();
    swing.current.rotation.z = ring(dt, 3.2, 16) * 0.45;
    gold.emissiveIntensity = pulse(dt, 0.45) * 0.7;
  });
  return (
    <group>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 2.6, 0]} castShadow material={woodMat(PALETTE.woodMid)}>
          <boxGeometry args={[0.4, 5.2, 0.4]} />
        </mesh>
      ))}
      <mesh position={[0, 5.2, 0]} castShadow material={woodMat(PALETTE.woodMid)}>
        <boxGeometry args={[4.4, 0.4, 0.5]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={woodMat(PALETTE.woodLight)}>
        <boxGeometry args={[4.6, 0.4, 2]} />
      </mesh>
      <group ref={swing} position={[0, 5.0, 0]}>
        <mesh position={[0, -0.4, 0]} material={paintMat(PALETTE.ink, 0.5)}>
          <cylinderGeometry args={[0.05, 0.05, 0.8, 5]} />
        </mesh>
        <mesh position={[0, -1.9, 0]} castShadow material={gold}>
          <cylinderGeometry args={[0.55, 1.5, 2.2, 22, 1, true]} />
        </mesh>
        <mesh position={[0, -0.8, 0]} material={gold}>
          <sphereGeometry args={[0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -3.0, 0]} material={paintMat(PALETTE.coral, 0.4)}>
          <sphereGeometry args={[0.3, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

function Xylophone({ read }: { read: Read }) {
  const bars = useRef<THREE.Mesh[]>([]);
  const mallet = useRef<THREE.Group>(null!);
  const colors = [PALETTE.coral, PALETTE.honey, PALETTE.sage, PALETTE.toyBlue, PALETTE.inkPurple, PALETTE.cream];
  useFrame(() => {
    const { dt } = read();
    bars.current.forEach((b, i) => {
      if (b) b.position.y = 1.55 + Math.max(0, pulse(dt - i * 0.035, 0.22)) * 0.35;
    });
    mallet.current.rotation.x = -0.7 + pulse(dt, 0.25) * 0.9;
  });
  return (
    <group rotation={[0, 0, 0]}>
      {/* frame rails */}
      {[-1.2, 1.2].map((z) => (
        <mesh key={z} position={[0, 1.0, z]} rotation={[0, 0, 0.05]} castShadow material={paintMat(PALETTE.toyBlue, 0.45)}>
          <boxGeometry args={[6.4, 0.6, 0.4]} />
        </mesh>
      ))}
      {[-2.9, 2.9].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]} material={paintMat(PALETTE.toyBlue, 0.45)}>
          <boxGeometry args={[0.4, 0.9, 2.8]} />
        </mesh>
      ))}
      {colors.map((c, i) => (
        <mesh key={c} ref={(m) => void (m && (bars.current[i] = m))} position={[-2.3 + i * 0.92, 1.55, 0]} castShadow material={paintMat(c, 0.35)}>
          <boxGeometry args={[0.7, 0.28, 3.1 - i * 0.22]} />
        </mesh>
      ))}
      <group ref={mallet} position={[1.8, 2.2, 2.2]}>
        <mesh position={[0, 0, -0.9]} rotation={[Math.PI / 2, 0, 0]} material={woodMat(PALETTE.woodLight)}>
          <cylinderGeometry args={[0.07, 0.07, 1.9, 6]} />
        </mesh>
        <mesh position={[0, 0, -1.9]} material={paintMat(PALETTE.coral, 0.4)}>
          <sphereGeometry args={[0.28, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

function MusicBox({ read }: { read: Read }) {
  const lid = useRef<THREE.Group>(null!);
  const crank = useRef<THREE.Group>(null!);
  const dancer = useRef<THREE.Group>(null!);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.sage, roughness: 0.9, emissive: PALETTE.sage, emissiveIntensity: 0 }), []);
  useFrame((_, dt) => {
    const r = read();
    const k = pulse(r.dt, 0.5);
    lid.current.rotation.x = -0.9 - k * 0.6;
    if (r.dt < 0.5) crank.current.rotation.x += dt * 14;
    dancer.current.position.y = 2.4 + k * 0.9;
    dancer.current.rotation.y += dt * (1 + k * 10);
    body.emissiveIntensity = k * 0.5;
  });
  return (
    <group>
      <RoundedBox args={[4.4, 2.2, 3.2]} radius={0.2} smoothness={2} position={[0, 1.1, 0]} castShadow material={body} />
      {/* brass comb */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-1.2 + i * 0.4, 2.25, 0.6]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
          <boxGeometry args={[0.18, 0.08, 1.2]} />
        </mesh>
      ))}
      <mesh position={[0, 2.35, -0.4]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
        <cylinderGeometry args={[0.35, 0.35, 2.6, 12]} />
      </mesh>
      <group ref={lid} position={[0, 2.2, -1.6]}>
        <RoundedBox args={[4.4, 0.35, 3.2]} radius={0.12} smoothness={2} position={[0, 0.18, 1.6]} castShadow material={feltMat(PALETTE.sage)} />
      </group>
      <group ref={dancer} position={[0.9, 2.4, 0.1]}>
        <mesh material={paintMat(PALETTE.coral, 0.5)}>
          <coneGeometry args={[0.35, 0.7, 10]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} material={paintMat(PALETTE.cream, 0.5)}>
          <sphereGeometry args={[0.2, 8, 6]} />
        </mesh>
      </group>
      <group ref={crank} position={[2.35, 1.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 6]} />
        </mesh>
        <mesh position={[0.25, 0.4, 0]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
          <boxGeometry args={[0.12, 0.8, 0.12]} />
        </mesh>
        <mesh position={[0.4, 0.78, 0]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.inkPurple, 0.5)}>
          <cylinderGeometry args={[0.13, 0.13, 0.35, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/** Little lamps above each contestant: sage when they've finished the round, coral when out. */
function StatusTokens({ getState, row }: { getState: () => CopycatState | null; row: { c: Contestant; x: number }[] }) {
  const refs = useRef<THREE.Mesh[]>([]);
  useFrame((s) => {
    const st = getState();
    row.forEach(({ c }, i) => {
      const m = refs.current[i];
      if (!m) return;
      const p = st?.players.find((x) => x.id === c.id);
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!p || (p.alive && !p.finished)) {
        m.visible = false;
        return;
      }
      m.visible = true;
      mat.color.set(p.alive ? PALETTE.sage : PALETTE.coral);
      mat.emissive.set(p.alive ? PALETTE.sage : PALETTE.coral);
      m.position.y = (c.isLocal ? 6.4 : 5.2) + Math.sin(s.clock.elapsedTime * 3 + i) * 0.15;
    });
  });
  return (
    <>
      {row.map(({ c, x }, i) => (
        <mesh key={c.id} ref={(m) => void (m && (refs.current[i] = m))} position={[x, 5.2, c.isLocal ? ROW_Z : ROW_Z + 1]} visible={false}>
          <sphereGeometry args={[0.45, 12, 10]} />
          <meshStandardMaterial emissiveIntensity={0.7} roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}
