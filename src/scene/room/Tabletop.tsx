/**
 * The two tables and the real-world things lying on them around the play mats: on the spawn table
 * the desk lamp, book stack, mug, pencils, pencil pot, sticky notes, a little cactus and the lamp's
 * cable; the gates table is a desk under the window with a drawer pedestal and a ruler.
 *
 * Unlike the rest of the room these are lit in real time (they sit in the sun patch next to the
 * toys and must take and cast the same shadows). Most stand on the table margin outside the play
 * bounds; the book cliffs and the mug reach into the bigger playmat, so they have colliders
 * (layout.ts BOOKS / MUG) and stop the camera.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '../RoundedBox';
import { PALETTE, ROOM } from '../../game/palette';
import { rulerTexture, woodTexture } from '../textures';
import { BOOKS, DESK, MUG, TABLE, TABLE_B } from '../layout';
import { camBlock } from '../../game/player';

const mat = (color: string, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** Desk lamp geometry: base on the back-left of the table, shade leaning over the village. */
const LAMP_BASE = new THREE.Vector3(DESK.lampBase.x, 0, DESK.lampBase.z);
const LAMP_ELBOW = new THREE.Vector3(-54, 40, -60);
export const LAMP_HEAD = new THREE.Vector3(-25, 27, -52);
export const LAMP_AIM = new THREE.Vector3(-4, 0, -14);

type Mats = Record<string, THREE.Material>;

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

type Tb = { minX: number; maxX: number; minZ: number; maxZ: number; thickness: number; legHeight: number };

/** A table: rounded top, apron and legs; `pedestal` puts a chest of drawers under its east end instead of the east legs. */
function TableBody({ tb, top, edge, pedestal }: { tb: Tb; top: THREE.Material; edge: THREE.Material; pedestal?: { w: number; knob: THREE.Material } }) {
  const w = tb.maxX - tb.minX;
  const d = tb.maxZ - tb.minZ;
  const cx = (tb.maxX + tb.minX) / 2;
  const cz = (tb.maxZ + tb.minZ) / 2;
  const legs = [
    [tb.minX + 6, tb.minZ + 6],
    [tb.minX + 6, tb.maxZ - 6],
    ...(pedestal
      ? []
      : [
          [tb.maxX - 6, tb.minZ + 6],
          [tb.maxX - 6, tb.maxZ - 6],
        ]),
  ];
  const ph = tb.legHeight; // pedestal height: floor to the underside of the top
  return (
    <group>
      <RoundedBox args={[w, tb.thickness, d]} radius={0.8} smoothness={2} position={[cx, -tb.thickness / 2, cz]} receiveShadow castShadow material={top} />
      {/* apron */}
      <mesh position={[cx, -tb.thickness - 4, cz]} material={edge}>
        <boxGeometry args={[w - 10, 8, d - 10]} />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, -tb.thickness - tb.legHeight / 2, z]} material={edge}>
          <boxGeometry args={[6, tb.legHeight, 6]} />
        </mesh>
      ))}
      {pedestal && (
        <group position={[tb.maxX - 2 - pedestal.w / 2, -tb.thickness - ph / 2, cz]}>
          <mesh material={edge}>
            <boxGeometry args={[pedestal.w, ph, d - 4]} />
          </mesh>
          {/* three drawers on the side facing the room, each with a knob */}
          {[0, 1, 2].map((i) => (
            <group key={i} position={[0, ph / 2 - 4 - (i + 0.5) * ((ph - 8) / 3), (d - 4) / 2]}>
              {/* receiveShadow like the table top it shares a material with: a material drawn by meshes that
                  differ in receiveShadow makes three.js rebuild its program-cache key at every switch, each frame */}
              <mesh position={[0, 0, 0.6]} material={top} receiveShadow>
                <boxGeometry args={[pedestal.w - 3, (ph - 8) / 3 - 1.6, 1.2]} />
              </mesh>
              <mesh position={[0, 0, 1.9]} material={pedestal.knob}>
                <sphereGeometry args={[1.4, 12, 8]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

export function Tabletop({ detail }: { detail: boolean }) {
  const m = useMemo<Mats>(
    () => ({
      table: new THREE.MeshStandardMaterial({ map: woodTexture('#C08A55', [2, 1.4], 7), roughness: 0.62 }),
      desk: new THREE.MeshStandardMaterial({ map: woodTexture('#D2A574', [2.6, 1.1], 23), roughness: 0.62 }),
      deskEdge: mat('#A87A4C', 0.7),
      knob: mat(PALETTE.brass, 0.4, 0.6),
      tableEdge: mat('#9A6A3E', 0.7),
      lamp: mat('#D99A3C', 0.35, 0.6),
      lampInner: new THREE.MeshStandardMaterial({ color: '#FFF4D6', emissive: '#FFD58A', emissiveIntensity: 1.6 }),
      bulb: new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFE7B0', emissiveIntensity: 4 }),
      mug: mat('#F1E9DA', 0.25),
      mugStripe: mat(PALETTE.coral, 0.3),
      coffee: mat('#5B3A28', 0.2),
      pages: mat('#F3EBDD', 1),
      pencilBody: mat('#F2BE3A', 0.5),
      pencilWood: mat('#E7C08E', 0.8),
      graphite: mat('#3A3638', 0.5),
      ferrule: mat('#B9B5AA', 0.3, 0.8),
      eraser: mat('#E59A97'),
      pot: mat(PALETTE.toyBlue, 0.3),
      potInside: mat(PALETTE.inkPurple, 0.9),
      pencilRed: mat(PALETTE.coral, 0.5),
      pencilGreen: mat(PALETTE.sage, 0.5),
      ruler: new THREE.MeshStandardMaterial({ map: rulerTexture(30), roughness: 0.6 }),
      rulerSide: mat('#D9B77C', 0.7),
      notes: mat(PALETTE.honey, 0.9),
      notesSide: mat('#E3A23C', 0.9),
      terracotta: mat(ROOM.terracotta, 0.85),
      cactus: mat(ROOM.leafDark, 0.8),
      soil: mat(ROOM.darkWood, 1),
      cable: mat(PALETTE.ink, 0.6),
    }),
    [],
  );

  const books = useMemo(
    () =>
      [
        { w: 30, d: 22, h: 4.2, rot: 0.08, c: PALETTE.inkPurple },
        { w: 28, d: 20, h: 3.6, rot: -0.12, c: '#7E9C78' },
        { w: 26, d: 19, h: 4.6, rot: 0.2, c: '#C46A5D' },
        { w: 24, d: 17, h: 3.2, rot: -0.05, c: '#5E86A3' },
      ].map((b) => ({ ...b, mat: mat(b.c, 0.85) })),
    [],
  );

  const cable = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(LAMP_BASE.x - 9, 0.5, LAMP_BASE.z + 3),
      new THREE.Vector3(LAMP_BASE.x - 13, 0.45, LAMP_BASE.z + 9),
      new THREE.Vector3(LAMP_BASE.x - 11, 0.45, LAMP_BASE.z + 20),
      new THREE.Vector3(TABLE.minX - 0.2, 0.3, LAMP_BASE.z + 27),
      new THREE.Vector3(TABLE.minX - 2.2, -6, LAMP_BASE.z + 28),
      new THREE.Vector3(TABLE.minX - 3, -40, LAMP_BASE.z + 26),
    ]);
    return new THREE.TubeGeometry(curve, 40, 0.38, 6);
  }, []);

  return (
    <group>
      {/* ---------------- the spawn table and the desk under the window ---------------- */}
      <TableBody tb={TABLE} top={m.table} edge={m.tableEdge} />
      <TableBody tb={TABLE_B} top={m.desk} edge={m.deskEdge} pedestal={{ w: 36, knob: m.knob }} />

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
        <mesh geometry={cable} material={m.cable} castShadow />
        <mesh position={[LAMP_BASE.x - 9, 0.9, LAMP_BASE.z + 3]} material={m.cable}>
          <sphereGeometry args={[0.9, 8, 6]} />
        </mesh>
      </group>

      {/* ---------------- book cliffs (back right of the table) ---------------- */}
      <group position={[BOOKS.x, 0, BOOKS.z]}>
        {books.map((b, i) => {
          const y = books.slice(0, i).reduce((s, o) => s + o.h, 0);
          return (
            <group key={i} position={[0, y + b.h / 2, 0]} rotation={[0, b.rot, 0]}>
              <RoundedBox args={[b.w, b.h, b.d]} radius={0.5} smoothness={2} castShadow receiveShadow material={b.mat} ref={camBlock} />
              {/* page block */}
              <mesh position={[0.8, 0, 0]} material={m.pages}>
                <boxGeometry args={[b.w - 0.6, b.h - 0.9, b.d + 0.05]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ---------------- mug building ---------------- */}
      <group position={[MUG.x, 0, MUG.z]}>
        <mesh position={[0, 5.5, 0]} castShadow receiveShadow material={m.mug} ref={camBlock}>
          <cylinderGeometry args={[4.6, 4.3, 11, 32, 1, true]} />
        </mesh>
        <mesh position={[0, 10.9, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.coffee}>
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
      <group position={[DESK.sparePencil.x, 0.75, DESK.sparePencil.z]} rotation={[0, DESK.sparePencil.rot, Math.PI / 2]}>
        <Pencil m={m} length={17} />
      </group>

      {/* ---------------- pencil pot (left margin) ---------------- */}
      <group position={[DESK.pencilPot.x, 0, DESK.pencilPot.z]}>
        <mesh position={[0, 5.2, 0]} castShadow receiveShadow material={m.pot}>
          <cylinderGeometry args={[4.4, 4, 10.4, 24]} />
        </mesh>
        <mesh position={[0, 10.5, 0]} material={m.potInside}>
          <cylinderGeometry args={[3.9, 3.9, 0.6, 24]} />
        </mesh>
        {[
          { p: [1.4, 11.5, 0.6], r: [0.16, 0, -0.14], body: m.pencilBody },
          { p: [-1.5, 11, -0.8], r: [-0.12, 1, 0.18], body: m.pencilRed },
          { p: [0.2, 12, -1.6], r: [-0.2, 2, -0.05], body: m.pencilGreen },
        ].map((s, i) => (
          <group key={i} position={s.p as [number, number, number]} rotation={s.r as [number, number, number]}>
            <group rotation={[Math.PI, 0, 0]}>
              <Pencil m={{ ...m, pencilBody: s.body }} length={15} />
            </group>
          </group>
        ))}
      </group>

      {/* ---------------- 30 cm ruler on the desk's front edge (two longer ones are the bridge's rails) ---------------- */}
      <group position={[-40, 0.16, TABLE_B.maxZ - 2.2]} rotation={[0, 0.03, 0]}>
        {/* one box, the printed face is its +y side: no decal plane to z-fight */}
        <mesh castShadow receiveShadow material={[m.rulerSide, m.rulerSide, m.ruler, m.rulerSide, m.rulerSide, m.rulerSide]}>
          <boxGeometry args={[31, 0.32, 3.4]} />
        </mesh>
      </group>

      {detail && (
        <>
          {/* sticky notes */}
          <group position={[DESK.notes.x, 0.6, DESK.notes.z]} rotation={[0, DESK.notes.rot, 0]}>
            <mesh castShadow receiveShadow material={[m.notesSide, m.notesSide, m.notes, m.notesSide, m.notesSide, m.notesSide]}>
              <boxGeometry args={[7.6, 1.2, 7.6]} />
            </mesh>
          </group>
          {/* a little cactus */}
          <group position={[DESK.cactus.x, 0, DESK.cactus.z]}>
            <mesh position={[0, 2.6, 0]} castShadow receiveShadow material={m.terracotta}>
              <cylinderGeometry args={[3.6, 2.8, 5.2, 16]} />
            </mesh>
            <mesh position={[0, 5.3, 0]} material={m.soil}>
              <cylinderGeometry args={[3.2, 3.2, 0.7, 16]} />
            </mesh>
            <mesh position={[0, 8.2, 0]} scale={[1, 1.7, 1]} castShadow material={m.cactus}>
              <sphereGeometry args={[2.3, 12, 9]} />
            </mesh>
            <mesh position={[2.4, 7.4, 0.4]} scale={[1, 1.5, 1]} castShadow material={m.cactus}>
              <sphereGeometry args={[1.1, 8, 6]} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

function LampHead({ m }: { m: Mats }) {
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

export function Pencil({ m, length }: { m: Mats; length: number }) {
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
      pencilBody: mat('#F2BE3A', 0.5),
      pencilWood: mat('#E7C08E', 0.8),
      graphite: mat('#3A3638', 0.5),
      ferrule: mat('#B9B5AA', 0.3, 0.8),
      eraser: mat('#E59A97', 0.9),
    }),
    [],
  );
}
