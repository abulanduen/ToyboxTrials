/**
 * The table and the real-world things lying on it around the play mat: desk lamp, book stack,
 * mug, pencils, pencil pot, ruler, sticky notes, a little cactus and the lamp's cable.
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
import { woodTexture } from '../textures';
import { BOOKS, MUG, TABLE } from '../layout';
import { camBlock } from '../../game/player';

const mat = (color: string, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** Desk lamp geometry: base on the back-left of the table, shade leaning over the village. */
const LAMP_BASE = new THREE.Vector3(-62, 0, -54);
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

/** Wooden 30 cm ruler face: centimetre ticks, so the toys' scale is spelled out. */
function rulerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#E9CF9A';
  g.fillRect(0, 0, 1024, 96);
  g.fillStyle = 'rgba(120,80,40,0.10)';
  for (let i = 0; i < 40; i++) g.fillRect(0, (i * 37) % 96, 1024, 1);
  g.fillStyle = PALETTE.ink;
  g.font = '700 26px Nunito, "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  const cm = 1024 / 31;
  for (let i = 0; i <= 300; i++) {
    const x = cm * 0.5 + (i / 10) * cm;
    const major = i % 10 === 0;
    g.fillRect(x - (major ? 1.5 : 0.75), 0, major ? 3 : 1.5, major ? 34 : i % 5 === 0 ? 24 : 14);
    if (major && i > 0 && i < 300) g.fillText(String(i / 10), x, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Tabletop({ detail }: { detail: boolean }) {
  const m = useMemo<Mats>(
    () => ({
      table: new THREE.MeshStandardMaterial({ map: woodTexture('#C08A55', [2, 1.4], 7), roughness: 0.62 }),
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
      ruler: new THREE.MeshStandardMaterial({ map: rulerTexture(), roughness: 0.6 }),
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

  const tableW = TABLE.maxX - TABLE.minX;
  const tableD = TABLE.maxZ - TABLE.minZ;
  const tableCX = (TABLE.maxX + TABLE.minX) / 2;
  const tableCZ = (TABLE.maxZ + TABLE.minZ) / 2;

  return (
    <group>
      {/* ---------------- table ---------------- */}
      <group>
        <RoundedBox args={[tableW, TABLE.thickness, tableD]} radius={0.8} smoothness={2} position={[tableCX, -TABLE.thickness / 2, tableCZ]} receiveShadow castShadow material={m.table} />
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
      <group position={[46, 0.75, 38]} rotation={[0, -0.6, Math.PI / 2]}>
        <Pencil m={m} length={17} />
      </group>

      {/* ---------------- pencil pot (left margin) ---------------- */}
      <group position={[-63, 0, 17]}>
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

      {/* ---------------- 30 cm ruler along the back edge ---------------- */}
      <group position={[14, 0.16, -51]} rotation={[0, 0.07, 0]}>
        {/* one box, the printed face is its +y side: no decal plane to z-fight */}
        <mesh castShadow receiveShadow material={[m.rulerSide, m.rulerSide, m.ruler, m.rulerSide, m.rulerSide, m.rulerSide]}>
          <boxGeometry args={[31, 0.32, 3.4]} />
        </mesh>
      </group>

      {detail && (
        <>
          {/* sticky notes */}
          <group position={[64, 0.6, 33]} rotation={[0, 0.35, 0]}>
            <mesh castShadow receiveShadow material={[m.notesSide, m.notesSide, m.notes, m.notesSide, m.notesSide, m.notesSide]}>
              <boxGeometry args={[7.6, 1.2, 7.6]} />
            </mesh>
          </group>
          {/* a little cactus */}
          <group position={[68, 0, -10]}>
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
