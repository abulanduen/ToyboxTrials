/**
 * The enormous real-world room around the toy village.
 *
 * Performance philosophy: nothing here is interactive, so it's built from a handful of
 * low-segment primitives with muted, matte materials. Fog + tilt-shift blur do the heavy
 * lifting for "softly out of focus". Near-room objects that frame the village (desk lamp,
 * book cliff, mug tower, pencil) get slightly more detail than distant furniture.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../game/palette';
import { skyTexture, woodTexture, feltTexture } from './textures';
import { FLOOR_Y, TABLE } from './layout';
import { camBlock } from '../game/player';

const roomMat = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });

/** Desk lamp geometry: base on the back-left of the table, shade leaning over the village. */
const LAMP_BASE = new THREE.Vector3(-62, 0, -54);
const LAMP_ELBOW = new THREE.Vector3(-54, 40, -60);
export const LAMP_HEAD = new THREE.Vector3(-25, 27, -52);
export const LAMP_AIM = new THREE.Vector3(-4, 0, -14);

/** Cylinder spanning two points (for lamp arms). */
function Beam({ a, b, r, material }: { a: THREE.Vector3; b: THREE.Vector3; r: number; material: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const d = b.clone().sub(a);
    const len = d.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return { pos: a.clone().add(b).multiplyScalar(0.5), quat, len };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow material={material}>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  );
}

export function Room() {
  const m = useMemo(
    () => ({
      wall: roomMat(PALETTE.roomWall),
      wallDark: roomMat(PALETTE.roomWallShadow),
      skirting: roomMat('#E9E1D3', 0.7),
      floor: new THREE.MeshStandardMaterial({ map: woodTexture('#8A6A4E', [6, 6], 19), roughness: 0.8 }),
      rug: new THREE.MeshStandardMaterial({ map: feltTexture('#6C7FA0', [4, 4], 5), roughness: 1 }),
      table: new THREE.MeshStandardMaterial({ map: woodTexture('#C08A55', [2, 1.4], 7), roughness: 0.62 }),
      tableEdge: roomMat('#9A6A3E', 0.7),
      lamp: new THREE.MeshStandardMaterial({ color: '#D99A3C', roughness: 0.35, metalness: 0.6 }),
      lampInner: new THREE.MeshStandardMaterial({ color: '#FFF4D6', emissive: '#FFD58A', emissiveIntensity: 1.6 }),
      bulb: new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFE7B0', emissiveIntensity: 4 }),
      mug: new THREE.MeshStandardMaterial({ color: '#F1E9DA', roughness: 0.25 }),
      mugStripe: new THREE.MeshStandardMaterial({ color: PALETTE.coral, roughness: 0.3 }),
      pencilBody: new THREE.MeshStandardMaterial({ color: '#F2BE3A', roughness: 0.5 }),
      pencilWood: new THREE.MeshStandardMaterial({ color: '#E7C08E', roughness: 0.8 }),
      graphite: roomMat('#3A3638', 0.5),
      ferrule: new THREE.MeshStandardMaterial({ color: '#B9B5AA', roughness: 0.3, metalness: 0.8 }),
      eraser: roomMat('#E59A97'),
      sky: new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }),
      frame: roomMat('#F2EEE6', 0.6),
      curtain: roomMat('#C77B6E', 1),
      bed: roomMat('#E8DED0', 1),
      blanket: new THREE.MeshStandardMaterial({ map: feltTexture('#7D93B0', [3, 3], 9), roughness: 1 }),
      pillow: roomMat('#F2D9A0', 1),
      shelf: roomMat('#A87D57', 0.85),
      plant: roomMat('#6E9A6A', 1),
      pot: roomMat('#C9744F', 0.8),
    }),
    [],
  );

  const books = useMemo(
    () => [
      { w: 30, d: 22, h: 4.2, rot: 0.08, c: PALETTE.inkPurple },
      { w: 28, d: 20, h: 3.6, rot: -0.12, c: '#7E9C78' },
      { w: 26, d: 19, h: 4.6, rot: 0.2, c: '#C46A5D' },
      { w: 24, d: 17, h: 3.2, rot: -0.05, c: '#5E86A3' },
    ],
    [],
  );

  const tableW = TABLE.maxX - TABLE.minX;
  const tableD = TABLE.maxZ - TABLE.minZ;
  const tableCX = (TABLE.maxX + TABLE.minX) / 2;
  const tableCZ = (TABLE.maxZ + TABLE.minZ) / 2;

  return (
    <group>
      {/* ---------------- table ---------------- */}
      <group>
        <RoundedBox
          args={[tableW, TABLE.thickness, tableD]}
          radius={0.8}
          smoothness={2}
          position={[tableCX, -TABLE.thickness / 2, tableCZ]}
          receiveShadow
          castShadow
          material={m.table}
        />
        {/* apron */}
        <mesh position={[tableCX, -TABLE.thickness - 4, tableCZ]} material={m.tableEdge}>
          <boxGeometry args={[tableW - 10, 8, tableD - 10]} />
        </mesh>
        {[
          [TABLE.minX + 6, TABLE.minZ + 6],
          [TABLE.maxX - 6, TABLE.minZ + 6],
          [TABLE.minX + 6, TABLE.maxZ - 6],
          [TABLE.maxX - 6, TABLE.maxZ - 6],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, -TABLE.thickness - TABLE.legHeight / 2, z]} material={m.tableEdge}>
            <boxGeometry args={[6, TABLE.legHeight, 6]} />
          </mesh>
        ))}
      </group>

      {/* ---------------- desk lamp (towering lighthouse) ---------------- */}
      <group>
        <mesh position={[LAMP_BASE.x, 1.2, LAMP_BASE.z]} castShadow receiveShadow material={m.lamp}>
          <cylinderGeometry args={[10, 11, 2.4, 28]} />
        </mesh>
        <mesh position={[LAMP_BASE.x, 3.4, LAMP_BASE.z]} material={m.lamp}>
          <sphereGeometry args={[2.4, 14, 10]} />
        </mesh>
        <Beam a={LAMP_BASE.clone().setY(3.4)} b={LAMP_ELBOW} r={0.9} material={m.lamp} />
        <Beam a={LAMP_BASE.clone().add(new THREE.Vector3(2.4, 3.4, 0))} b={LAMP_ELBOW.clone().add(new THREE.Vector3(2.4, -4, 0))} r={0.22} material={m.ferrule} />
        <mesh position={LAMP_ELBOW} material={m.lamp}>
          <sphereGeometry args={[2, 14, 10]} />
        </mesh>
        <Beam a={LAMP_ELBOW} b={LAMP_HEAD} r={0.8} material={m.lamp} />
        <LampHead m={m} />
      </group>

      {/* ---------------- book cliffs (back right of the table) ---------------- */}
      <group position={[56, 0, -36]}>
        {books.map((b, i) => {
          const y = books.slice(0, i).reduce((s, o) => s + o.h, 0);
          return (
            <group key={i} position={[0, y + b.h / 2, 0]} rotation={[0, b.rot, 0]}>
              <RoundedBox args={[b.w, b.h, b.d]} radius={0.5} smoothness={2} castShadow receiveShadow material={roomMat(b.c, 0.85)} />
              {/* page block */}
              <mesh position={[0.8, 0, 0]} material={roomMat('#F3EBDD', 1)}>
                <boxGeometry args={[b.w - 0.6, b.h - 0.9, b.d + 0.05]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ---------------- mug building ---------------- */}
      <group position={[57, 0, 14]}>
        <mesh position={[0, 5.5, 0]} castShadow receiveShadow material={m.mug} ref={camBlock}>
          <cylinderGeometry args={[4.6, 4.3, 11, 32, 1, true]} />
        </mesh>
        <mesh position={[0, 10.9, 0]} rotation={[Math.PI / 2, 0, 0]} material={roomMat('#5B3A28', 0.2)}>
          <circleGeometry args={[4.4, 32]} />
        </mesh>
        {[3, 6.5].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={m.mugStripe}>
            <cylinderGeometry args={[4.62, 4.55, 1.2, 32, 1, true]} />
          </mesh>
        ))}
        <mesh position={[-4.8, 5.8, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={m.mug}>
          <torusGeometry args={[2.6, 0.7, 10, 20, Math.PI]} />
        </mesh>
      </group>

      {/* ---------------- spare pencil by the table edge ---------------- */}
      <group position={[46, 0.75, 38]} rotation={[0, -0.6, Math.PI / 2]}>
        <Pencil m={m} length={17} />
      </group>

      {/* ---------------- floor & rug ---------------- */}
      <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={m.floor}>
        <planeGeometry args={[700, 700]} />
      </mesh>
      <mesh position={[30, FLOOR_Y + 0.4, 90]} rotation={[-Math.PI / 2, 0, 0]} material={m.rug}>
        <circleGeometry args={[110, 40]} />
      </mesh>

      {/* ---------------- back wall with window ---------------- */}
      <group position={[0, 0, -185]}>
        <mesh position={[0, 60, 0]} material={m.wall}>
          <planeGeometry args={[700, 400]} />
        </mesh>
        <mesh position={[0, FLOOR_Y + 5, 1]} material={m.skirting}>
          <boxGeometry args={[700, 10, 2]} />
        </mesh>
        <group position={[30, 70, 1]}>
          <mesh material={m.sky}>
            <planeGeometry args={[130, 120]} />
          </mesh>
          {/* frame + mullions */}
          {[
            [0, 61, 140, 6],
            [0, -61, 140, 6],
            [-68, 0, 6, 128],
            [68, 0, 6, 128],
            [0, 0, 4, 120],
            [0, 0, 130, 4],
          ].map(([x, y, w, h], i) => (
            <mesh key={i} position={[x, y, 1.5]} material={m.frame}>
              <boxGeometry args={[w, h, 4]} />
            </mesh>
          ))}
          <mesh position={[0, -66, 6]} material={m.frame}>
            <boxGeometry args={[150, 3, 14]} />
          </mesh>
          {/* curtains */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 90, 0, 6]} material={m.curtain}>
              <boxGeometry args={[34, 150, 6]} />
            </mesh>
          ))}
          {/* plant on the sill */}
          <group position={[-45, -60, 8]}>
            <mesh position={[0, 6, 0]} material={m.pot}>
              <cylinderGeometry args={[8, 6, 12, 12]} />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} position={[Math.sin(i * 1.3) * 5, 18 + (i % 2) * 6, Math.cos(i * 1.3) * 3]} material={m.plant}>
                <sphereGeometry args={[7 - i * 0.6, 8, 6]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>

      {/* ---------------- left wall + bookshelf ---------------- */}
      <group position={[-250, 0, 0]}>
        <mesh position={[0, 60, 0]} rotation={[0, Math.PI / 2, 0]} material={m.wallDark}>
          <planeGeometry args={[700, 400]} />
        </mesh>
        <group position={[18, FLOOR_Y, -60]}>
          <mesh position={[0, 90, 0]} material={m.shelf}>
            <boxGeometry args={[34, 180, 90]} />
          </mesh>
          {[30, 75, 120, 160].map((y, row) =>
            Array.from({ length: 9 }, (_, i) => (
              <mesh
                key={`${row}-${i}`}
                position={[18, y + 10, -38 + i * 9]}
                rotation={[i % 4 === 3 ? 0.2 : 0, 0, 0]}
                material={roomMat([PALETTE.coral, PALETTE.toyBlue, PALETTE.sage, PALETTE.honey, PALETTE.inkPurple, '#D8CBB5'][(i + row) % 6], 0.9)}
              >
                <boxGeometry args={[22, 22 + ((i * 7 + row * 3) % 8), 7]} />
              </mesh>
            )),
          )}
        </group>
      </group>

      {/* ---------------- bed (far right) ---------------- */}
      <group position={[200, FLOOR_Y, 10]} rotation={[0, -0.15, 0]}>
        <mesh position={[0, 22, 0]} material={m.bed}>
          <boxGeometry args={[110, 44, 200]} />
        </mesh>
        <RoundedBox args={[112, 20, 150]} radius={8} smoothness={2} position={[0, 50, 20]} material={m.blanket} />
        <RoundedBox args={[70, 14, 34]} radius={7} smoothness={2} position={[0, 52, -72]} material={m.pillow} />
        <mesh position={[0, 70, -100]} material={m.frame}>
          <boxGeometry args={[116, 90, 6]} />
        </mesh>
      </group>

      {/* ---------------- ceiling ---------------- */}
      <mesh position={[0, 185, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.skirting}>
        <planeGeometry args={[700, 700]} />
      </mesh>

      {/* ---------------- right wall & wall behind camera ---------------- */}
      <mesh position={[300, 60, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.wallDark}>
        <planeGeometry args={[700, 400]} />
      </mesh>
      <group position={[0, 0, 260]}>
        <mesh position={[0, 60, 0]} rotation={[0, Math.PI, 0]} material={m.wall}>
          <planeGeometry args={[700, 400]} />
        </mesh>
        {[
          [-80, 70, 50, 64, PALETTE.toyBlue],
          [-15, 85, 40, 40, PALETTE.honey],
          [60, 60, 70, 50, PALETTE.sage],
        ].map(([x, y, w, h, c]) => (
          <group key={String(x)} position={[x as number, y as number, -2]} rotation={[0, Math.PI, 0]}>
            <mesh material={m.frame}>
              <boxGeometry args={[(w as number) + 6, (h as number) + 6, 2]} />
            </mesh>
            <mesh position={[0, 0, 1.2]} material={roomMat(c as string, 1)}>
              <planeGeometry args={[w as number, h as number]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function LampHead({ m }: { m: Record<string, THREE.Material> }) {
  // Shade opening (-Y in local space) points at the village square.
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), LAMP_AIM.clone().sub(LAMP_HEAD).normalize()), []);
  return (
    <group position={LAMP_HEAD} quaternion={quat}>
      <mesh castShadow material={m.lamp}>
        <cylinderGeometry args={[4, 11, 13, 28, 1, true]} />
      </mesh>
      <mesh position={[0, -0.2, 0]} material={m.lampInner}>
        <cylinderGeometry args={[3.8, 10.6, 12.6, 28, 1, true]} />
      </mesh>
      <mesh position={[0, 6.5, 0]} material={m.lamp}>
        <sphereGeometry args={[4.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, -2.5, 0]} material={m.bulb}>
        <sphereGeometry args={[3.2, 16, 12]} />
      </mesh>
    </group>
  );
}

export function Pencil({ m, length }: { m: Record<string, THREE.Material>; length: number }) {
  // Lying along local Y (rotate the group to orient).
  const body = length * 0.78;
  return (
    <group>
      <mesh castShadow receiveShadow material={m.pencilBody}>
        <cylinderGeometry args={[0.75, 0.75, body, 6]} />
      </mesh>
      <mesh position={[0, -body / 2 - length * 0.06, 0]} rotation={[Math.PI, 0, 0]} castShadow material={m.pencilWood}>
        <coneGeometry args={[0.75, length * 0.12, 6]} />
      </mesh>
      <mesh position={[0, -body / 2 - length * 0.115, 0]} rotation={[Math.PI, 0, 0]} material={m.graphite}>
        <coneGeometry args={[0.2, length * 0.035, 6]} />
      </mesh>
      <mesh position={[0, body / 2 + 0.6, 0]} material={m.ferrule}>
        <cylinderGeometry args={[0.78, 0.78, 1.2, 12]} />
      </mesh>
      <mesh position={[0, body / 2 + 1.7, 0]} castShadow material={m.eraser}>
        <cylinderGeometry args={[0.74, 0.74, 1.4, 12]} />
      </mesh>
    </group>
  );
}

export function usePencilMaterials() {
  return useMemo(
    () => ({
      pencilBody: new THREE.MeshStandardMaterial({ color: '#F2BE3A', roughness: 0.5 }),
      pencilWood: new THREE.MeshStandardMaterial({ color: '#E7C08E', roughness: 0.8 }),
      graphite: new THREE.MeshStandardMaterial({ color: '#3A3638', roughness: 0.5 }),
      ferrule: new THREE.MeshStandardMaterial({ color: '#B9B5AA', roughness: 0.3, metalness: 0.8 }),
      eraser: new THREE.MeshStandardMaterial({ color: '#E59A97', roughness: 0.9 }),
    }),
    [],
  );
}
