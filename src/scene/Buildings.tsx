/**
 * Hub architecture — toy civilisation built from forgotten household objects.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from './RoundedBox';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { useGame } from '../game/store';
import { camBlock } from '../game/player';
import { cardboardTexture, cardFaceTexture, stripeTexture } from './textures';
import { Dominoes, paintMat, feltMat, woodMat, type DominoSpec } from './props';
import { DOMINO } from './domino';
import { FOUNTAIN, PAVILION, SCOREBOARD, SHOP, WORKSHOP } from './layout';
import { SECRET_IDS } from '../game/interactables';

const cardboardMat = (tint: string = PALETTE.cardboard) =>
  new THREE.MeshStandardMaterial({ color: '#ffffff', map: cardboardTexture(tint, [1, 1]), roughness: 0.95 });

// ---------------- Fountain: an upturned bottle cap with a marble on a thread spool ----------------
/** The pool's surface, and how far the spool, marble and jets sit below their modelled heights so the
 *  spool's bottom flange stands on the water (it floated almost 1 cm above it before). */
const FOUNTAIN_WATER_Y = FOUNTAIN.top - 0.25;
const SPOOL_DROP = 2.2 - 0.175 - FOUNTAIN_WATER_Y;

export function Fountain() {
  const capGeo = useMemo(() => {
    // crimped bottle-cap ring: alternate vertex radii
    const g = new THREE.CylinderGeometry(FOUNTAIN.r, FOUNTAIN.r, FOUNTAIN.top, 42, 1, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.045 * Math.sign(Math.sin(a * 21));
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const drops = useRef<THREE.InstancedMesh>(null!);
  const N = 28;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const water = useRef<THREE.Mesh>(null!);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const jet = i % 4;
      const ang = (jet / 4) * Math.PI * 2 + 0.4;
      const k = ((t * 0.9 + i / N) % 1 + 1) % 1;
      const r = 0.8 + k * 3.2;
      dummy.position.set(FOUNTAIN.x + Math.cos(ang) * r, 4.3 - SPOOL_DROP + Math.sin(k * Math.PI) * 1.6 - k * 3.2, FOUNTAIN.z + Math.sin(ang) * r);
      dummy.scale.setScalar(0.22 * (1 - k * 0.4));
      dummy.updateMatrix();
      drops.current.setMatrixAt(i, dummy.matrix);
    }
    drops.current.instanceMatrix.needsUpdate = true;
    (water.current.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.05;
  });

  return (
    <group>
      <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
        <mesh geometry={capGeo} position={[0, FOUNTAIN.top / 2, 0]} castShadow receiveShadow material={paintMat(PALETTE.honey, 0.3, 0.75)} ref={camBlock} />
        <mesh position={[0, FOUNTAIN.top / 2, 0]} material={paintMat('#9B7A3A', 0.4, 0.6)}>
          <cylinderGeometry args={[FOUNTAIN.r - 0.25, FOUNTAIN.r - 0.25, FOUNTAIN.top - 0.1, 32, 1, true]} />
        </mesh>
        {/* Water and glass stay fairly rough on purpose: near-mirror surfaces threw pixel-sized sun
            highlights above the bloom threshold that flashed on and off as the camera turned. */}
        <mesh ref={water} position={[0, FOUNTAIN_WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[FOUNTAIN.r - 0.3, 32]} />
          {/* Low specular: seen towards the window, a normal-strength sun reflection turned the whole
              pool from blue to near-white within a few degrees of camera turn (with bloom on top),
              which read as the fountain flickering while panning. Painted toy water, not a mirror. */}
          <meshPhysicalMaterial color={PALETTE.toyBlue} emissive={PALETTE.toyBlue} emissiveIntensity={0.25} roughness={0.5} metalness={0} specularIntensity={0.25} />
        </mesh>
        {/* thread spool pillar, standing in the pool (the group lowers it onto the water) */}
        <group position={[0, -SPOOL_DROP, 0]}>
        <mesh position={[0, 2.2, 0]} castShadow material={woodMat(PALETTE.woodLight)}>
          <cylinderGeometry args={[0.9, 0.9, 0.35, 16]} />
        </mesh>
        <mesh position={[0, 2.9, 0]} castShadow material={paintMat(PALETTE.coral, 0.9)}>
          <cylinderGeometry args={[0.65, 0.65, 1.1, 16]} />
        </mesh>
        <mesh position={[0, 3.6, 0]} castShadow material={woodMat(PALETTE.woodLight)}>
          <cylinderGeometry args={[0.9, 0.9, 0.35, 16]} />
        </mesh>
        {/* glass marble */}
        {/* Not a camera blocker: a ball this small only grazes the camera ray, which then flicked
            between hit and miss as the view turned and jolted the camera in and out. */}
        <mesh position={[0, 4.75, 0]} castShadow>
          <sphereGeometry args={[1.05, 24, 18]} />
          {/* depthWrite off: as see-through glass it must not hide the droplets behind it. With it on,
              the droplets popped in and out as the camera turned and the transparent sort order flipped. */}
          <meshPhysicalMaterial color="#BFE2F2" roughness={0.2} transmission={0} transparent opacity={0.72} depthWrite={false} clearcoat={0.6} clearcoatRoughness={0.3} />
        </mesh>
        <mesh position={[0.15, 4.75, 0]} rotation={[0.3, 0, 0.6]}>
          <torusGeometry args={[0.55, 0.12, 6, 18, Math.PI * 1.2]} />
          <meshStandardMaterial color={PALETTE.coral} emissive={PALETTE.coral} emissiveIntensity={0.3} />
        </mesh>
        </group>
      </group>
      <instancedMesh ref={drops} args={[undefined, undefined, N]}>
        <sphereGeometry args={[1, 8, 6]} />
        {/* Opaque on purpose: as a transparent mesh the droplets and the glass marble swapped draw
            order as the camera turned (their sort points cross), so drops behind the marble popped in
            front of it and back. Opaque drops are drawn first and the marble blends over them. */}
        <meshStandardMaterial color="#D8F0FF" emissive={PALETTE.toyBlue} emissiveIntensity={0.4} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

// ---------------- Tournament Pavilion: a striped cardboard gift box with a bottle-cap finial ----------------
const ROOF_H = 6.4;
export function Pavilion() {
  const stripes = useMemo(() => {
    const t = stripeTexture(PALETTE.coral, PALETTE.cream, 10).clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }, []);
  const roofStripes = useMemo(() => {
    const t = stripeTexture(PALETTE.coral, PALETTE.cream, 16).clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
  }, []);
  const archGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-2.6, 0);
    s.lineTo(2.6, 0);
    s.lineTo(2.6, 3.4);
    s.absarc(0, 3.4, 2.6, 0, Math.PI, false);
    s.lineTo(-2.6, 0);
    return new THREE.ShapeGeometry(s, 16);
  }, []);
  const { w, d, h } = PAVILION;
  return (
    <group position={[PAVILION.x, 0, PAVILION.z]} rotation={[0, PAVILION.rot, 0]}>
      {/* walls */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={stripes} ref={camBlock}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* cardboard lip */}
      <mesh position={[0, h + 0.3, 0]} castShadow material={cardboardMat()}>
        <boxGeometry args={[w + 0.6, 0.6, d + 0.6]} />
      </mesh>
      {/* pyramid tent roof. A four-sided cone has its corners on the axes, so it is turned 45° first
          and only then squashed to the box's proportions (outer group): scaling the turned cone
          itself gave a skewed rhombus that overhung one side and left the lip bare on the other.
          The eaves overhang the cardboard lip by about half a centimetre all round. */}
      <group position={[0, h + 0.6 + ROOF_H / 2, 0]} scale={[1, 1, d / w]}>
        <mesh rotation={[0, Math.PI / 4, 0]} castShadow material={roofStripes}>
          <coneGeometry args={[(w / 2 + 0.8) * Math.SQRT2, ROOF_H, 4, 1, true]} />
        </mesh>
      </group>
      {/* bottle cap finial + flag */}
      <mesh position={[0, h + 0.6 + ROOF_H + 0.1, 0]} castShadow material={paintMat(PALETTE.honey, 0.3, 0.8)}>
        <cylinderGeometry args={[1.2, 1.2, 0.6, 21]} />
      </mesh>
      <mesh position={[0, h + 9, 0]} material={woodMat(PALETTE.woodDark)}>
        <cylinderGeometry args={[0.1, 0.1, 4, 6]} />
      </mesh>
      <Flag position={[0, h + 10.4, 0]} color={PALETTE.inkPurple} />
      {/* doorway */}
      <mesh position={[0, 0.02, d / 2 + 0.03]} geometry={archGeo} scale={[1.12, 1.06, 1]} material={paintMat(PALETTE.honey, 0.5)} />
      <mesh position={[0, 0.02, d / 2 + 0.07]} geometry={archGeo} material={paintMat(PALETTE.inkPurple, 1)} />
      {/* trophy glimpsed inside */}
      <group position={[0, 0, d / 2 - 0.8]}>
        <mesh position={[0, 0.8, 0]} material={paintMat(PALETTE.coral, 0.6)}>
          <cylinderGeometry args={[1.3, 1.5, 1.6, 12]} />
        </mesh>
        <mesh position={[0, 2.4, 0]} material={paintMat(PALETTE.honey, 0.25, 0.9)}>
          <cylinderGeometry args={[0.15, 0.35, 1.6, 10]} />
        </mesh>
        <mesh position={[0, 3.7, 0]} material={paintMat(PALETTE.honey, 0.25, 0.9)}>
          <cylinderGeometry args={[1.0, 0.35, 1.6, 14]} />
        </mesh>
      </group>
      {/* felt carpet + steps */}
      <mesh position={[0, 0.13, d / 2 + 2.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat(PALETTE.coral)}>
        <planeGeometry args={[4, 5.2]} />
      </mesh>
      {/* hanging felt banners */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 2), h - 0.4, d / 2 + 0.05]}>
          <mesh position={[0, -1.7, 0]} material={feltMat(PALETTE.toyBlue)}>
            <planeGeometry args={[2, 3.4]} />
          </mesh>
          <mesh position={[0, -1.7, 0.02]} material={paintMat(PALETTE.honey, 0.5)}>
            <circleGeometry args={[0.55, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Flag({ position, color, size = 1 }: { position: [number, number, number]; color: string; size?: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.2 * size, 1.3 * size, 6, 1);
    g.translate(1.1 * size, 0, 0);
    return g;
  }, [size]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.18 * x);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh ref={ref} position={position} geometry={geo} castShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.9} />
    </mesh>
  );
}

// ---------------- Workshop: an open wooden pencil case with a thread-spool chimney ----------------
export function Workshop() {
  const puffs = useRef<THREE.Group>(null!);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    puffs.current.children.forEach((c, i) => {
      const k = ((t * 0.25 + i / 4) % 1 + 1) % 1;
      c.position.set(Math.sin(k * 4 + i) * 0.6, k * 5, 0);
      c.scale.setScalar(0.6 + k * 1.1);
    });
  });
  const { w, d, h } = WORKSHOP;
  return (
    <group position={[WORKSHOP.x, 0, WORKSHOP.z]} rotation={[0, WORKSHOP.rot, 0]}>
      <RoundedBox args={[w, h, d]} radius={0.5} smoothness={2} position={[0, h / 2, 0]} castShadow receiveShadow material={woodMat('#C98E57')} ref={camBlock} />
      {/* open lid propped at the back */}
      {/* hinged on the box's top back edge: the lid's inner face sits on the hinge line (centred on
          it, half the lid used to sink into the box) */}
      <group position={[0, h, -d / 2]} rotation={[-0.35, 0, 0]}>
        <RoundedBox args={[w, 0.8, d]} radius={0.35} smoothness={2} position={[0, d / 2, -0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow material={woodMat('#B87D48')} />
        {/* brass hinges */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (w / 2 - 2.2), 0.1, -0.2]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.35, 0.7)}>
            <cylinderGeometry args={[0.28, 0.28, 1.6, 10]} />
          </mesh>
        ))}
      </group>
      {/* brass clasp */}
      <mesh position={[0, h - 1, d / 2 + 0.05]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
        <boxGeometry args={[1.6, 1.2, 0.2]} />
      </mesh>
      {/* gear sign, flat on the front wall (turned upright: it used to stick out like a shelf) */}
      <group position={[-w / 2 + 3, h * 0.55, d / 2 + 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh material={paintMat(PALETTE.coral, 0.5)}>
          <cylinderGeometry args={[1.5, 1.5, 0.3, 12]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[Math.cos((i / 8) * Math.PI * 2) * 1.6, 0, Math.sin((i / 8) * Math.PI * 2) * 1.6]} rotation={[0, -(i / 8) * Math.PI * 2, 0]} material={paintMat(PALETTE.coral, 0.5)}>
            <boxGeometry args={[0.6, 0.3, 0.5]} />
          </mesh>
        ))}
      </group>
      {/* paint pots on the front step */}
      {[PALETTE.toyBlue, PALETTE.coral, PALETTE.sage, PALETTE.honey].map((c, i) => (
        <group key={c} position={[1 + i * 1.6, 0, d / 2 + 1.2]}>
          <mesh position={[0, 0.6, 0]} castShadow material={paintMat('#D9D2C3', 0.4, 0.6)}>
            <cylinderGeometry args={[0.6, 0.6, 1.2, 12]} />
          </mesh>
          <mesh position={[0, 1.22, 0]} material={paintMat(c, 0.3)}>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 12]} />
          </mesh>
        </group>
      ))}
      {/* thread spool chimney with cotton smoke */}
      <group position={[w / 2 - 2.5, h, -0.5]}>
        <mesh position={[0, 0.25, 0]} castShadow material={woodMat(PALETTE.woodLight)}>
          <cylinderGeometry args={[1.4, 1.4, 0.5, 14]} />
        </mesh>
        <mesh position={[0, 1.9, 0]} castShadow material={paintMat(PALETTE.cream, 0.95)}>
          <cylinderGeometry args={[1.0, 1.0, 2.8, 14]} />
        </mesh>
        <mesh position={[0, 3.55, 0]} castShadow material={woodMat(PALETTE.woodLight)}>
          <cylinderGeometry args={[1.4, 1.4, 0.5, 14]} />
        </mesh>
        <group ref={puffs} position={[0, 4, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} material={paintMat('#FFFFFF', 1)}>
              <sphereGeometry args={[0.7, 10, 8]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// ---------------- Odds & Ends shop: a matchbox on its side with the drawer pulled out ----------------
/** Awning: length of the striped sheet and its slope below horizontal (radians). */
const AWNING = { len: 4.4, slope: 0.42, strutY: 4.4, edgeY: 0, edgeZ: 0 };
AWNING.edgeY = SHOP.h - 0.4 - AWNING.len * Math.sin(AWNING.slope); // front edge height
AWNING.edgeZ = AWNING.len * Math.cos(AWNING.slope); // front edge, out from the wall
export function Shop() {
  const awning = useMemo(() => {
    const t = stripeTexture(PALETTE.coral, PALETTE.cream, 8).clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
  }, []);
  const { w, d, h } = SHOP;
  return (
    <group position={[SHOP.x, 0, SHOP.z]} rotation={[0, SHOP.rot, 0]}>
      {/* sleeve */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={paintMat(PALETTE.toyBlue, 0.85)} ref={camBlock}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* striker strip */}
      <mesh position={[w / 2 + 0.02, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={paintMat('#6B4A3A', 1)}>
        <planeGeometry args={[d * 0.85, h * 0.85]} />
      </mesh>
      {/* label */}
      <mesh position={[0, h * 0.62, d / 2 + 0.02]} material={paintMat(PALETTE.cream, 0.8)}>
        <planeGeometry args={[w * 0.7, h * 0.32]} />
      </mesh>
      <mesh position={[0, h * 0.62, d / 2 + 0.04]} material={paintMat(PALETTE.coral, 0.7)}>
        <circleGeometry args={[h * 0.12, 5]} />
      </mesh>
      {/* drawer counter */}
      <group position={[0, 0, d / 2 + 2.2]}>
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow material={cardboardMat('#D9B98F')}>
          <boxGeometry args={[w - 1, 1.8, 4.4]} />
        </mesh>
        {/* wares: mini blocks and buttons */}
        {[PALETTE.coral, PALETTE.honey, PALETTE.sage, PALETTE.toyBlue, PALETTE.inkPurple].map((c, i) => (
          <mesh key={c} position={[-3.6 + i * 1.8, 2.3, (i % 2) * 0.8 - 0.4]} rotation={[0, i, 0]} castShadow material={paintMat(c, 0.4)}>
            {i % 2 ? <cylinderGeometry args={[0.6, 0.6, 0.25, 14]} /> : <boxGeometry args={[0.9, 0.9, 0.9]} />}
          </mesh>
        ))}
      </group>
      {/* awning: fixed along the top of the front wall, sloping down and out over the counter
          (it used to float a centimetre off the wall and tip the wrong way, high edge outermost).
          A camera blocker too: as a thin double-sided sheet the camera could pass through it while
          turning near the shop, flashing the stripes across the whole view. */}
      <mesh
        position={[0, h - 0.4 - (AWNING.len / 2) * Math.sin(AWNING.slope), d / 2 + 0.06 + (AWNING.len / 2) * Math.cos(AWNING.slope)]}
        rotation={[AWNING.slope - Math.PI / 2, 0, 0]}
        castShadow
        material={awning}
        ref={camBlock}
      >
        <planeGeometry args={[w + 0.6, AWNING.len]} />
      </mesh>
      {/* the rail it hangs from, and two struts holding up its front edge */}
      <mesh position={[0, h - 0.4, d / 2 + 0.15]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.35, 0.7)}>
        <cylinderGeometry args={[0.18, 0.18, w + 0.8, 8]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 - 0.3), (AWNING.strutY + AWNING.edgeY) / 2, d / 2 + AWNING.edgeZ / 2]} rotation={[Math.atan2(AWNING.edgeZ, AWNING.edgeY - AWNING.strutY), 0, 0]} material={woodMat(PALETTE.woodDark)}>
          <cylinderGeometry args={[0.1, 0.1, Math.hypot(AWNING.edgeZ, AWNING.edgeY - AWNING.strutY), 6]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------- Scoreboard: a cream card in a frame of whole dominoes ----------------
/**
 * The frame is built from real dominoes at their true 1 : 2 proportions, scaled uniformly
 * (SCOREBOARD.s): two stacked upright dominoes per post, two lying on their long edge as the sill
 * under the card, and three on their long edge as the lintel. Pips face the viewer; the thin edges
 * are plain. Wooden feet and rear braces hold it up.
 */
export function Scoreboard() {
  const secrets = useGame((s) => s.secretsFound.length);
  const face = useMemo(() => cardFaceTexture('SCOREBOARD', `Secrets ${secrets} / ${SECRET_IDS.length}`, PALETTE.coral, 4 / 3), [secrets]);
  const sb = SCOREBOARD;
  const s = sb.s;
  const { w, h, t } = DOMINO;
  const dominos = useMemo(() => {
    const out: DominoSpec[] = [];
    const postX = (3 * h) / 2 - w / 2; // posts sit at the ends of the three-domino lintel
    for (const sx of [-1, 1]) for (const k of [0, 1]) out.push({ x: sx * postX * s, z: 0, rot: 0, y: (h / 2 + k * h) * s, s });
    for (const sx of [-1, 1]) out.push({ x: ((sx * h) / 2) * s, z: 0, rot: 0, roll: Math.PI / 2, y: (w / 2) * s, s }); // sill
    for (const i of [-1, 0, 1]) out.push({ x: i * h * s, z: 0, rot: 0, roll: Math.PI / 2, y: (2 * h + w / 2) * s, s }); // lintel
    return out;
  }, [h, s, w]);
  const cardW = (3 * h - 2 * w) * s;
  const cardH = (2 * h - w) * s;
  return (
    <group position={[sb.x, 0, sb.z]} rotation={[0, sb.rot, 0]}>
      <Dominoes items={dominos} />
      {/* the card, set just behind the dominoes' front faces */}
      <group position={[0, (w + (2 * h - w) / 2) * s, -t * 0.15 * s]}>
        <mesh castShadow material={paintMat(PALETTE.coral, 0.6)} ref={camBlock}>
          <boxGeometry args={[cardW + 0.6, cardH + 0.4, 0.4]} />
        </mesh>
        <mesh position={[0, 0, 0.21]}>
          <planeGeometry args={[cardW - 0.3, cardH - 0.2]} />
          <meshStandardMaterial map={face} roughness={0.8} />
        </mesh>
      </group>
      {/* wooden feet and two rear braces */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * ((3 * h) / 2 - w / 2) * s, 0, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
            <boxGeometry args={[w * s + 0.6, 0.7, 2.6]} />
          </mesh>
          <mesh position={[0, 4.2, -1.15]} rotation={[0.28, 0, 0]} castShadow material={woodMat(PALETTE.woodDark)}>
            <boxGeometry args={[0.5, 8.4, 0.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
