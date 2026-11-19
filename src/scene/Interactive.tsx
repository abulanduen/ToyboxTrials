/**
 * Moving and secret props: toy train, rolling marble, music box, jack-in-the-box,
 * the key tower and the pencil log.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { RoundedBox } from './RoundedBox';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { events } from '../game/events';
import { setDynamic, resolve, type Collider } from '../game/collision';
import { livePositions, keyAvailable } from '../game/interactables';
import { camBlock, player } from '../game/player';
import { sfx } from '../game/audio';
import { Dominoes, paintMat, woodMat, feltMat } from './props';
import { JACK, MUSICBOX, PENCIL, TOWER, TRACK } from './layout';
import { Pencil, usePencilMaterials } from './Room';

// ---------------- Toy train on an oval wooden track ----------------
const trackPoint = (a: number) => new THREE.Vector3(TRACK.x + Math.cos(a) * TRACK.rx, 0, TRACK.z + Math.sin(a) * TRACK.rz);

export function TrainTrack() {
  const sleepers = useMemo(() => {
    const n = 44;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const p = trackPoint(a);
      const t = new THREE.Vector3(-Math.sin(a) * TRACK.rx, 0, Math.cos(a) * TRACK.rz);
      return { p, yaw: Math.atan2(t.x, t.z) };
    });
  }, []);
  const rails = useMemo(
    () =>
      [-1, 1].map((side) => {
        const pts = Array.from({ length: 65 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2;
          return new THREE.Vector3(TRACK.x + Math.cos(a) * (TRACK.rx + side * 1.0), 0.45, TRACK.z + Math.sin(a) * (TRACK.rz + side * 1.0));
        });
        return new THREE.CatmullRomCurve3(pts, true);
      }),
    [],
  );
  return (
    <group>
      {/* wooden track bed */}
      {[0].map((k) => (
        <mesh key={k} position={[TRACK.x, 0.15, TRACK.z]} scale={[1, 1, TRACK.rz / TRACK.rx]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={woodMat('#D7B184')}>
          <ringGeometry args={[TRACK.rx - 1.6, TRACK.rx + 1.6, 64]} />
        </mesh>
      ))}
      <Instances limit={sleepers.length} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
        <boxGeometry args={[3.2, 0.3, 0.55]} />
        {sleepers.map((s, i) => (
          <Instance key={i} position={[s.p.x, 0.3, s.p.z]} rotation={[0, s.yaw + Math.PI / 2, 0]} />
        ))}
      </Instances>
      {rails.map((c, i) => (
        <mesh key={i} castShadow material={paintMat('#9C8E7E', 0.35, 0.7)}>
          <tubeGeometry args={[c, 128, 0.14, 5, true]} />
        </mesh>
      ))}
    </group>
  );
}

export function Train() {
  const cars = useRef<THREE.Group[]>([]);
  const angle = useRef(0);
  const smoke = useRef<THREE.Group>(null!);
  const CARS = [
    { color: PALETTE.toyBlue, engine: true },
    { color: PALETTE.honey, engine: false },
    { color: PALETTE.coral, engine: false },
  ];
  const SPACING = 0.52; // radians along the ellipse

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    angle.current += dt * 0.32;
    const cols: Collider[] = [];
    CARS.forEach((_, i) => {
      const a = angle.current - i * SPACING;
      const p = trackPoint(a);
      const g = cars.current[i];
      if (!g) return;
      const tx = -Math.sin(a) * TRACK.rx;
      const tz = Math.cos(a) * TRACK.rz;
      g.position.set(p.x, 0.55 + Math.abs(Math.sin(s.clock.elapsedTime * 9 + i)) * 0.05, p.z);
      g.rotation.y = Math.atan2(tx, tz);
      cols.push({ kind: 'circle', id: `train:${i}`, x: p.x, z: p.z, r: 1.7, top: 4 });
    });
    setDynamic('train', cols);
    const t = s.clock.elapsedTime;
    smoke.current?.children.forEach((c, i) => {
      const k = ((t * 0.8 + i / 3) % 1 + 1) % 1;
      c.position.set(0, 3.6 + k * 2.5, -0.6 - k * 1.5);
      c.scale.setScalar(0.35 + k * 0.6);
    });
  });

  return (
    <group>
      {CARS.map((c, i) => (
        <group key={i} ref={(g) => void (g && (cars.current[i] = g))}>
          {c.engine ? (
            <>
              <RoundedBox args={[2.4, 1.6, 2.6]} radius={0.25} smoothness={2} position={[0, 1.2, -0.8]} castShadow material={paintMat(c.color, 0.5)} />
              <mesh position={[0, 1.1, 0.9]} rotation={[Math.PI / 2, 0, 0]} castShadow material={paintMat(c.color, 0.5)}>
                <cylinderGeometry args={[0.9, 0.9, 2.2, 14]} />
              </mesh>
              <mesh position={[0, 2.4, 1.3]} castShadow material={paintMat(PALETTE.ink, 0.5)}>
                <cylinderGeometry args={[0.35, 0.25, 1.2, 10]} />
              </mesh>
              <mesh position={[0, 2.25, -0.8]} castShadow material={paintMat(PALETTE.coral, 0.5)}>
                <boxGeometry args={[2.7, 0.3, 2.9]} />
              </mesh>
              <mesh position={[0, 1.1, 2.02]} material={paintMat(PALETTE.honey, 0.3)}>
                <circleGeometry args={[0.45, 14]} />
              </mesh>
              <group ref={smoke} position={[0, 0, 1.3]}>
                {[0, 1, 2].map((k) => (
                  <mesh key={k} material={paintMat('#FFFFFF', 1)}>
                    <sphereGeometry args={[0.6, 8, 6]} />
                  </mesh>
                ))}
              </group>
            </>
          ) : (
            <>
              <mesh position={[0, 0.6, 0]} castShadow material={woodMat(PALETTE.woodLight)}>
                <boxGeometry args={[2.2, 0.4, 3]} />
              </mesh>
              <RoundedBox args={[1.8, 1.6, 2.2]} radius={0.2} smoothness={2} position={[0, 1.6, 0]} castShadow material={woodMat(c.color)} />
            </>
          )}
          {[-1, 1].flatMap((sx) =>
            [-0.9, 0.9].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[sx * 1.15, 0.35, sz]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.ink, 0.6)}>
                <cylinderGeometry args={[0.45, 0.45, 0.3, 12]} />
              </mesh>
            )),
          )}
        </group>
      ))}
    </group>
  );
}

// ---------------- Rolling marble (push with E) ----------------
export function Marble() {
  const R = 1.3;
  const mesh = useRef<THREE.Mesh>(null!);
  const st = useRef({ pos: { x: -9, z: -6 }, vx: 0, vz: 0 });
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);

  useEffect(
    () =>
      events.on('prop:marble-push', ({ dirX, dirZ }) => {
        st.current.vx += dirX * 22;
        st.current.vz += dirZ * 22;
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    const speed = Math.hypot(s.vx, s.vz);
    if (speed > 0.01) {
      const prevX = s.pos.x;
      const prevZ = s.pos.z;
      const tx = prevX + s.vx * dt;
      const tz = prevZ + s.vz * dt;
      s.pos.x = tx;
      s.pos.z = tz;
      setDynamic('marble', []);
      // Bounce off solid things the marble can't roll over.
      const hit = resolve(s.pos, R, 0);
      const cx = s.pos.x - tx;
      const cz = s.pos.z - tz;
      const cl = Math.hypot(cx, cz);
      if (hit || cl > 1e-4) {
        if (cl > 1e-4) {
          const nx = cx / cl;
          const nz = cz / cl;
          const dot = s.vx * nx + s.vz * nz;
          if (dot < 0) {
            s.vx -= 1.7 * dot * nx;
            s.vz -= 1.7 * dot * nz;
            if (Math.abs(dot) > 4) sfx.bump();
          }
        }
      }
      // Bump the player out of the way (marble wins).
      const pdx = player.pos.x - s.pos.x;
      const pdz = player.pos.z - s.pos.z;
      const pd = Math.hypot(pdx, pdz);
      if (pd < R + 0.85 && player.pos.y < 2 && pd > 1e-3) {
        const dot = s.vx * (pdx / pd) + s.vz * (pdz / pd);
        if (dot > 0) {
          s.vx -= 1.2 * dot * (pdx / pd);
          s.vz -= 1.2 * dot * (pdz / pd);
        }
      }
      const f = Math.exp(-0.9 * dt);
      s.vx *= f;
      s.vz *= f;
      const moved = Math.hypot(s.pos.x - prevX, s.pos.z - prevZ);
      axis.set(s.vz, 0, -s.vx).normalize();
      q.setFromAxisAngle(axis, moved / R);
      mesh.current.quaternion.premultiply(q);
    }
    mesh.current.position.set(s.pos.x, R, s.pos.z);
    livePositions.set('marble', s.pos);
    setDynamic('marble', [{ kind: 'circle', id: 'marble:0', x: s.pos.x, z: s.pos.z, r: R, top: R * 2 }]);
  });

  return (
    <mesh ref={mesh} castShadow>
      <sphereGeometry args={[R, 28, 20]} />
      <meshPhysicalMaterial color="#9FD0E6" roughness={0.2} clearcoat={0.6} clearcoatRoughness={0.3} transparent opacity={0.85} />
      {/* inner swirl */}
      <mesh rotation={[0.4, 0, 0.8]}>
        <torusGeometry args={[0.7, 0.16, 6, 20, Math.PI * 1.3]} />
        <meshStandardMaterial color={PALETTE.honey} emissive={PALETTE.honey} emissiveIntensity={0.25} />
      </mesh>
    </mesh>
  );
}

// ---------------- Forgotten music box (behind the pavilion) ----------------
export function MusicBox() {
  const lid = useRef<THREE.Group>(null!);
  const crank = useRef<THREE.Group>(null!);
  const dancer = useRef<THREE.Group>(null!);
  const playing = useRef(0);
  useEffect(() => events.on('prop:musicbox-play', () => (playing.current = 2.6)), []);
  useFrame((_, dt) => {
    playing.current = Math.max(0, playing.current - dt);
    const open = playing.current > 0 ? 1 : 0;
    lid.current.rotation.x = THREE.MathUtils.lerp(lid.current.rotation.x, -open * 1.6, 1 - Math.exp(-8 * dt));
    if (open) {
      crank.current.rotation.x += dt * 8;
      dancer.current.rotation.y += dt * 4;
    }
    dancer.current.position.y = THREE.MathUtils.lerp(dancer.current.position.y, open ? 2.6 : 1.6, 1 - Math.exp(-6 * dt));
  });
  return (
    <group position={[MUSICBOX.x, 0, MUSICBOX.z]}>
      <RoundedBox args={[5.2, 2.2, 3.8]} radius={0.25} smoothness={2} position={[0, 1.1, 0]} castShadow receiveShadow material={feltMat(PALETTE.sage)} />
      <mesh position={[0, 1.1, 1.92]} material={paintMat(PALETTE.honey, 0.4, 0.6)}>
        <boxGeometry args={[4.4, 0.25, 0.05]} />
      </mesh>
      <group ref={lid} position={[0, 2.2, -1.9]}>
        <RoundedBox args={[5.2, 0.4, 3.8]} radius={0.15} smoothness={2} position={[0, 0.2, 1.9]} castShadow material={feltMat(PALETTE.sage)} />
      </group>
      <group ref={dancer} position={[0, 1.6, 0]}>
        <mesh material={paintMat(PALETTE.coral, 0.5)}>
          <coneGeometry args={[0.5, 1.0, 10]} />
        </mesh>
        <mesh position={[0, 0.7, 0]} material={paintMat(PALETTE.cream, 0.5)}>
          <sphereGeometry args={[0.3, 10, 8]} />
        </mesh>
      </group>
      <group ref={crank} position={[2.75, 1.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
          <cylinderGeometry args={[0.1, 0.1, 0.6, 6]} />
        </mesh>
        <mesh position={[0.3, 0.45, 0]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
          <boxGeometry args={[0.15, 0.9, 0.15]} />
        </mesh>
        <mesh position={[0.45, 0.85, 0]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.inkPurple, 0.5)}>
          <cylinderGeometry args={[0.15, 0.15, 0.4, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------- Jack-in-the-box (eliminates you!) ----------------
export function JackInTheBox() {
  const jack = useRef<THREE.Group>(null!);
  const lid = useRef<THREE.Group>(null!);
  const st = useRef({ t: -1 });
  useEffect(
    () =>
      events.on('prop:jack-pop', () => {
        if (st.current.t >= 0) return;
        st.current.t = 0;
        sfx.jump();
        window.setTimeout(() => events.emit('player:eliminate', { reason: 'jack' }), 280);
      }),
    [],
  );
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    let ext = 0;
    if (s.t >= 0) {
      s.t += dt;
      const k = s.t;
      ext = k < 0.15 ? k / 0.15 : k < 3 ? 1 + Math.sin(k * 14) * Math.exp(-k * 2) * 0.25 : Math.max(0, 1 - (k - 3) * 2);
      if (k > 3.6) s.t = -1;
    }
    jack.current.position.y = 3.3 + ext * 3.4;
    jack.current.scale.y = 0.2 + ext * 0.8;
    jack.current.visible = ext > 0.02;
    jack.current.rotation.z = Math.sin((s.t > 0 ? s.t : 0) * 9) * 0.25 * ext;
    lid.current.rotation.z = THREE.MathUtils.lerp(lid.current.rotation.z, ext > 0.02 ? 2.0 : 0, 1 - Math.exp(-14 * dt));
  });
  return (
    <group position={[JACK.x, 0, JACK.z]} rotation={[0, 0.6, 0]}>
      <RoundedBox args={[3.4, 3.2, 3.4]} radius={0.2} smoothness={2} position={[0, 1.6, 0]} castShadow receiveShadow material={paintMat(PALETTE.inkPurple, 0.55)} />
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r, i) => (
        <mesh key={r} rotation={[0, r, 0]} position={[Math.sin(r) * 1.72, 1.6, Math.cos(r) * 1.72]} material={paintMat([PALETTE.honey, PALETTE.coral, PALETTE.toyBlue, PALETTE.sage][i], 0.5)}>
          <circleGeometry args={[0.9, 4]} />
        </mesh>
      ))}
      {/* side crank */}
      <mesh position={[1.9, 1.8, 0]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
        <cylinderGeometry args={[0.12, 0.12, 0.6, 6]} />
      </mesh>
      <group ref={lid} position={[-1.7, 3.2, 0]}>
        <RoundedBox args={[3.5, 0.3, 3.5]} radius={0.1} smoothness={2} position={[1.7, 0.15, 0]} castShadow material={paintMat(PALETTE.coral, 0.5)} />
      </group>
      <group ref={jack} position={[0, 3.3, 0]} visible={false}>
        {/* spring */}
        <mesh position={[0, -1.6, 0]} material={paintMat('#D9D2C3', 0.35, 0.3)}>
          <cylinderGeometry args={[0.4, 0.4, 3.2, 10, 6, true]} />
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow material={paintMat(PALETTE.cream, 0.4)}>
          <sphereGeometry args={[1.2, 16, 12]} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow material={paintMat(PALETTE.coral, 0.5)}>
          <coneGeometry args={[0.9, 1.6, 10]} />
        </mesh>
        <mesh position={[0, 2.5, 0]} material={paintMat(PALETTE.honey, 0.4)}>
          <sphereGeometry args={[0.3, 8, 6]} />
        </mesh>
        <mesh position={[0, 0.3, 1.1]} material={paintMat(PALETTE.coral, 0.4)}>
          <sphereGeometry args={[0.25, 8, 6]} />
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.7, 1.05]} material={paintMat(PALETTE.ink, 0.4)}>
            <sphereGeometry args={[0.14, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------- Key tower: domino step → book → eraser → block, golden key on top ----------------
export function KeyTower() {
  const key = useRef<THREE.Group>(null!);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const avail = keyAvailable();
    key.current.visible = avail;
    key.current.rotation.y = t * 1.4;
    key.current.position.y = TOWER.block.top + 1.4 + Math.sin(t * 2.2) * 0.25;
  });
  const T = TOWER;
  return (
    <group>
      {/* lying domino step: a real domino, face up (pips on the top face only) */}
      <Dominoes items={[{ x: T.domino.x, z: T.domino.z, rot: Math.PI / 2, tilt: Math.PI / 2 }]} />
      {/* hardback book */}
      <group position={[T.book.x, T.book.top / 2, T.book.z]}>
        <RoundedBox args={[T.book.hx * 2, T.book.top, T.book.hz * 2]} radius={0.3} smoothness={2} castShadow receiveShadow material={paintMat('#B35A4E', 0.8)} ref={camBlock} />
        <mesh position={[0.5, 0, 0]} material={paintMat('#F3EBDD', 1)}>
          <boxGeometry args={[T.book.hx * 2 - 0.4, T.book.top - 0.5, T.book.hz * 2 + 0.02]} />
        </mesh>
        <mesh position={[0, T.book.top / 2 + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.honey, 0.5)}>
          <ringGeometry args={[1.6, 2.0, 24]} />
        </mesh>
      </group>
      {/* eraser */}
      <RoundedBox
        args={[T.eraser.hx * 2, T.eraser.top - T.book.top, T.eraser.hz * 2]}
        radius={0.3}
        smoothness={2}
        position={[T.eraser.x, (T.eraser.top + T.book.top) / 2, T.eraser.z]}
        castShadow
        receiveShadow
        material={paintMat('#E59A97', 0.95)}
      />
      {/* top block: a full 3 cm block standing on the book, beside the eraser */}
      <RoundedBox
        args={[T.block.hx * 2, T.block.top - T.book.top, T.block.hz * 2]}
        radius={0.2}
        smoothness={2}
        position={[T.block.x, (T.block.top + T.book.top) / 2, T.block.z]}
        castShadow
        receiveShadow
        material={woodMat(PALETTE.toyBlue)}
      />
      {/* the golden key */}
      <group ref={key} position={[T.block.x, T.block.top + 1.4, T.block.z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.honey, 0.2, 0.9)}>
          <cylinderGeometry args={[0.12, 0.12, 1.3, 8]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[-0.9, s * 0.35, 0]} material={paintMat(PALETTE.honey, 0.2, 0.9)}>
            <torusGeometry args={[0.38, 0.12, 8, 16]} />
          </mesh>
        ))}
        <pointLight color={PALETTE.honey} intensity={6} distance={7} decay={1.5} />
      </group>
    </group>
  );
}

export function PencilLog() {
  const m = usePencilMaterials();
  return (
    <group position={[PENCIL.x, PENCIL.r, PENCIL.z]} rotation={[0, PENCIL.rot, Math.PI / 2]}>
      <Pencil m={m} length={PENCIL.length} />
    </group>
  );
}
