/**
 * Hub navigation signage + atmosphere.
 * - A wooden fingerpost near spawn whose arrow boards point at each destination.
 * - Name boards on top of each minigame gate.
 * - Dust motes drifting in the desk-lamp light (skipped on the Low tier).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { useGame } from '../game/store';
import { woodMat } from './props';
import { FINGERPOST as POST, GATE, GATES, PAVILION, SCOREBOARD, SHOP, WORKSHOP, frontOf } from './layout';
import { LAMP_AIM, LAMP_HEAD } from './Room';

const texCache = new Map<string, THREE.CanvasTexture>();

/** Painted text on a wooden board; `arrow` draws the point on that side (for fingerpost boards). */
function boardTexture(title: string, sub: string, accent: string, arrow: 'left' | 'right' | null) {
  const key = `${title}|${sub}|${accent}|${arrow}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#D9A86C';
  g.fillRect(0, 0, 512, 128);
  // grain
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(110,70,35,${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 128;
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 2);
    g.stroke();
  }
  g.fillStyle = accent;
  if (arrow === 'right') g.fillRect(470, 0, 42, 128);
  else if (arrow === 'left') g.fillRect(0, 0, 42, 128);
  else g.fillRect(0, 108, 512, 20);
  g.fillStyle = PALETTE.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cx = arrow === 'right' ? 235 : arrow === 'left' ? 277 : 256;
  g.font = `700 ${sub ? 50 : 58}px Fredoka, "Trebuchet MS", sans-serif`;
  g.fillText(title, cx, sub ? 48 : 62, 400);
  if (sub) {
    g.font = '700 30px Nunito, "Trebuchet MS", sans-serif';
    g.fillStyle = '#6B4A2E';
    g.fillText(sub, cx, 94, 400);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Arrow-shaped board outline (points along +x), centred on its own origin. */
function useArrowBoardGeometry(len: number, h: number) {
  return useMemo(() => {
    const s = new THREE.Shape();
    const tip = h * 0.55;
    s.moveTo(-len / 2, -h / 2);
    s.lineTo(len / 2 - tip, -h / 2);
    s.lineTo(len / 2, 0);
    s.lineTo(len / 2 - tip, h / 2);
    s.lineTo(-len / 2, h / 2);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
    g.translate(0, 0, -0.15);
    return g;
  }, [len, h]);
}

export function Fingerpost() {
  const LEN = 7;
  const H = 1.5;
  const boardGeo = useArrowBoardGeometry(LEN, H);
  const targets = useMemo(() => {
    const g0 = GATES[0];
    return [
      { label: 'Copycat Conductor', sub: 'Trial · open', accent: PALETTE.honey, ...frontOf(g0.x, g0.z, g0.rot, 2) },
      { label: 'Workshop', sub: 'Paint · hats · keys', accent: PALETTE.toyBlue, ...frontOf(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, 5) },
      { label: 'Odds & Ends', sub: 'Shop', accent: PALETTE.sage, ...frontOf(SHOP.x, SHOP.z, SHOP.rot, 8) },
      { label: 'Scoreboard', sub: 'Secrets', accent: PALETTE.coral, ...frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 3) },
      { label: 'Pavilion', sub: 'Lobby · soon', accent: PALETTE.inkPurple, x: PAVILION.x, z: PAVILION.z + PAVILION.d / 2 },
    ].map((t, i) => {
      const dx = t.x - POST.x;
      const dz = t.z - POST.z;
      return { ...t, rotY: Math.atan2(-dz, dx), y: 9.2 - i * 1.75 };
    });
  }, []);
  const plain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C8925A', roughness: 0.8 }), []);
  return (
    <group position={[POST.x, 0, POST.z]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
        <cylinderGeometry args={[1.0, 1.15, 0.6, 12]} />
      </mesh>
      <mesh position={[0, 5.4, 0]} castShadow material={woodMat(PALETTE.woodDark)}>
        <cylinderGeometry args={[0.32, 0.36, 10.8, 8]} />
      </mesh>
      <mesh position={[0, 10.9, 0]} castShadow material={woodMat(PALETTE.coral)}>
        <sphereGeometry args={[0.55, 12, 10]} />
      </mesh>
      {targets.map((t) => (
        <group key={t.label} position={[0, t.y, 0]} rotation={[0, t.rotY, 0]}>
          <group position={[LEN / 2 + 0.2, 0, 0]}>
            <mesh geometry={boardGeo} castShadow material={plain} />
            {/* front face reads left→right with the point on the right… */}
            <mesh position={[-0.35, 0, 0.22]}>
              <planeGeometry args={[LEN - 0.9, H - 0.15]} />
              <meshStandardMaterial map={boardTexture(t.label, t.sub, t.accent, 'right')} roughness={0.85} />
            </mesh>
            {/* …and so does the back, where the point is on the viewer's left. */}
            <mesh position={[-0.35, 0, -0.22]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[LEN - 0.9, H - 0.15]} />
              <meshStandardMaterial map={boardTexture(t.label, t.sub, t.accent, 'left')} roughness={0.85} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export function GateBoards() {
  return (
    <>
      {GATES.map((g) => {
        const title = g.id === 'gate-copycat' ? 'Copycat Conductor' : g.id === 'gate-inferno' ? 'Inferno Escape' : 'Wind-Up Dash';
        const sub = g.active ? 'Step inside' : 'Coming soon';
        return (
          <group key={g.id} position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]}>
            <group position={[0, GATE.height + 1.25, 0.9]} rotation={[-0.12, 0, 0]}>
              <mesh castShadow material={woodMat(PALETTE.woodLight)}>
                <boxGeometry args={[8.6, 2.1, 0.3]} />
              </mesh>
              <mesh position={[0, 0, 0.16]}>
                <planeGeometry args={[8.3, 1.85]} />
                <meshStandardMaterial map={boardTexture(title, sub, g.color, null)} roughness={0.85} />
              </mesh>
              {/* two little dowel legs into the arch */}
              {[-3.2, 3.2].map((x) => (
                <mesh key={x} position={[x, -1.25, -0.2]} material={woodMat(PALETTE.woodDark)}>
                  <cylinderGeometry args={[0.15, 0.15, 0.9, 6]} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Dust motes floating through the lamp's light cone. One draw call; off on Low. */
export function DustMotes() {
  const quality = useGame((s) => s.quality);
  const N = 260;
  const pts = useRef<THREE.Points>(null!);
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N * 4);
    const a = LAMP_HEAD;
    const b = LAMP_AIM;
    for (let i = 0; i < N; i++) {
      const t = Math.random();
      const spread = 2 + t * 14; // the cone widens toward the table
      seeds[i * 4] = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * spread;
      seeds[i * 4 + 1] = a.y + (b.y - a.y) * t + 1 + (Math.random() - 0.5) * 4;
      seeds[i * 4 + 2] = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * spread;
      seeds[i * 4 + 3] = Math.random() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, seeds };
  }, []);
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,240,205,1)');
    grd.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.PointsMaterial({ map: tex, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#FFE3B0' });
  }, []);
  useFrame((s) => {
    if (!pts.current) return;
    const t = s.clock.elapsedTime;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const ph = seeds[i * 4 + 3];
      arr[i * 3] = seeds[i * 4] + Math.sin(t * 0.13 + ph) * 1.6;
      arr[i * 3 + 1] = Math.max(0.5, seeds[i * 4 + 1] + Math.sin(t * 0.09 + ph * 1.7) * 2.2);
      arr[i * 3 + 2] = seeds[i * 4 + 2] + Math.cos(t * 0.11 + ph) * 1.6;
    }
    geo.attributes.position.needsUpdate = true;
  });
  if (quality === 'low') return null;
  return <points ref={pts} geometry={geo} material={mat} />;
}
