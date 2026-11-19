/**
 * Accessories for the contender: one item each in the back, face and neck slots. Chunky,
 * code-built, household-object toys like the hats (Cosmetics.tsx). Back and neck items mount in
 * WindupBot's torso group, face items in its head group; the coordinates below are in those
 * groups' spaces (1 unit = 1 cm). MiniContender (opponents and crowds) ignores accessories.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import type { Accessories, BackId, FaceId, NeckId } from '../game/cosmetics';
import { RoundedBox } from '../scene/RoundedBox';

const mat = (color: string, rough = 0.45, metal = 0, emissive?: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.25 : 0 });

/** How far the wind-up key moves back so it pokes out through a back accessory. */
export const KEY_BACK_OFFSET: Record<BackId, number> = { none: 0, backpack: 0.3, cape: 0.26, balloon: 0, wings: 0.04 };

type V3 = [number, number, number];

/** A thin cylinder from a to b (strings). */
function Strand({ a, b, r, material }: { a: V3; b: V3; r: number; material: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={material}>
      <cylinderGeometry args={[r, r, len, 5]} />
    </mesh>
  );
}

const STRING_A: V3 = [0, 0, 0];
const STRING_B: V3 = [0.55, 2.55, -0.55];

/** A balloon on a string that sways gently (its own tiny frame loop). */
function Balloon() {
  const sway = useRef<THREE.Group>(null!);
  const m = useMemo(() => ({ rubber: mat(PALETTE.coral, 0.22, 0.05), string: mat(PALETTE.white, 0.9), shine: new THREE.MeshBasicMaterial({ color: '#FFE3DA' }) }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    sway.current.rotation.z = Math.sin(t * 1.3) * 0.07;
    sway.current.rotation.x = Math.sin(t * 0.9 + 1) * 0.05;
  });
  return (
    <group position={[0.42, 1.8, -0.6]}>
      <group ref={sway}>
        <Strand a={STRING_A} b={STRING_B} r={0.015} material={m.string} />
        <group position={[0.62, 3.25, -0.62]}>
          <mesh scale={[1, 1.18, 1]} material={m.rubber} castShadow>
            <sphereGeometry args={[0.6, 18, 14]} />
          </mesh>
          <mesh position={[0, -0.74, 0]} material={m.rubber}>
            <coneGeometry args={[0.1, 0.16, 8]} />
          </mesh>
          <mesh position={[-0.2, 0.28, 0.5]} scale={[0.6, 1, 0.4]} material={m.shine}>
            <sphereGeometry args={[0.12, 8, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Back slot (torso space: body back face at z = -0.54, body spans y 0.9–1.95). */
export function BackItem({ id }: { id: BackId }) {
  const content = useMemo(() => {
    switch (id) {
      case 'backpack': {
        const leather = mat(PALETTE.woodMid, 0.75);
        const flap = mat(PALETTE.woodDark, 0.7);
        const holes = mat(PALETTE.ink, 0.8);
        return (
          <group>
            <RoundedBox args={[1.0, 0.86, 0.36]} radius={0.12} smoothness={2} position={[0, 1.36, -0.73]} material={leather} castShadow />
            <RoundedBox args={[1.04, 0.32, 0.4]} radius={0.1} smoothness={2} position={[0, 1.7, -0.74]} material={flap} castShadow />
            {[-0.26, 0.26].map((x, i) => (
              <group key={x} position={[x, 1.16, -0.915]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={mat(i ? PALETTE.honey : PALETTE.coral, 0.4)}>
                  <cylinderGeometry args={[0.13, 0.13, 0.05, 14]} />
                </mesh>
                {[
                  [-0.04, -0.04],
                  [0.04, -0.04],
                  [-0.04, 0.04],
                  [0.04, 0.04],
                ].map(([hx, hz]) => (
                  <mesh key={`${hx}${hz}`} position={[hx, -0.027, hz]} material={holes}>
                    <cylinderGeometry args={[0.018, 0.018, 0.01, 6]} />
                  </mesh>
                ))}
              </group>
            ))}
            {/* straps over the shoulders */}
            {[-0.42, 0.42].map((x) => (
              <group key={x}>
                <mesh position={[x, 1.96, -0.1]} material={flap}>
                  <boxGeometry args={[0.16, 0.06, 1.05]} />
                </mesh>
                <mesh position={[x, 1.76, 0.56]} material={flap}>
                  <boxGeometry args={[0.16, 0.42, 0.05]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      }
      case 'cape': {
        const felt = new THREE.MeshStandardMaterial({ color: '#B8434A', roughness: 0.95, side: THREE.DoubleSide });
        const clasp = mat(PALETTE.honey, 0.35, 0.6);
        return (
          <group>
            <mesh position={[0, 1.28, 0.2]} material={felt} castShadow>
              <cylinderGeometry args={[1.0, 1.3, 1.34, 16, 1, true, Math.PI - 0.78, 1.56]} />
            </mesh>
            <RoundedBox args={[1.5, 0.16, 0.34]} radius={0.06} smoothness={2} position={[0, 1.95, -0.52]} material={felt} castShadow />
            {[-0.62, 0.62].map((x) => (
              <mesh key={x} position={[x, 1.92, -0.32]} material={clasp}>
                <sphereGeometry args={[0.09, 10, 8]} />
              </mesh>
            ))}
          </group>
        );
      }
      case 'balloon':
        return <Balloon />;
      case 'wings': {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.3, 0.55, 0.9, 0.95, 1.35, 0.75);
        shape.bezierCurveTo(1.25, 0.35, 1.0, 0.05, 0.75, -0.1);
        shape.bezierCurveTo(0.95, -0.35, 0.8, -0.65, 0.45, -0.55);
        shape.bezierCurveTo(0.25, -0.45, 0.08, -0.2, 0, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 10 });
        const paper = new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.9, side: THREE.DoubleSide });
        const fold = mat('#D9CDB8', 1);
        return (
          <group position={[0, 1.55, -0.62]}>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.2, 0, 0]} rotation={[0.12, side * 0.5, 0]} scale={[side, 1, 1]}>
                <mesh geometry={g} material={paper} castShadow />
                <mesh position={[0.62, 0.32, 0.045]} rotation={[0, 0, 0.55]} material={fold}>
                  <boxGeometry args={[0.9, 0.018, 0.005]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      }
      default:
        return null;
    }
  }, [id]);
  return content;
}

/** Face slot (head space: eye centre at (0, 1.02, 0.28), turret radius 0.42, grille top at y 0.51). */
export function FaceItem({ id }: { id: FaceId }) {
  const content = useMemo(() => {
    switch (id) {
      case 'monocle': {
        const brass = mat(PALETTE.brass, 0.25, 0.9);
        const glass = new THREE.MeshStandardMaterial({ color: '#CFE8F5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
        const chain: V3[] = [
          [0.24, 0.8, 0.39],
          [0.36, 0.68, 0.38],
          [0.46, 0.56, 0.34],
          [0.55, 0.47, 0.28],
          [0.62, 0.42, 0.16],
        ];
        return (
          <group>
            <mesh position={[0.03, 1.0, 0.37]} material={brass} castShadow>
              <torusGeometry args={[0.31, 0.045, 8, 24]} />
            </mesh>
            <mesh position={[0.03, 1.0, 0.36]} material={glass}>
              <circleGeometry args={[0.3, 24]} />
            </mesh>
            {chain.map((p, i) => (
              <mesh key={i} position={p} material={brass}>
                <sphereGeometry args={[0.03, 6, 5]} />
              </mesh>
            ))}
          </group>
        );
      }
      case 'goggles': {
        const brass = mat(PALETTE.brass, 0.3, 0.85);
        const strap = mat(PALETTE.woodDark, 0.85);
        const rivet = mat(PALETTE.ink, 0.6);
        const lens = new THREE.MeshStandardMaterial({ color: PALETTE.toyBlue, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false });
        return (
          <group position={[0, 1.02, 0]}>
            <mesh position={[0, 0, 0.36]} rotation={[Math.PI / 2, 0, 0]} material={brass} castShadow>
              <cylinderGeometry args={[0.41, 0.43, 0.2, 20, 1, true]} />
            </mesh>
            <mesh position={[0, 0, 0.46]} material={brass}>
              <torusGeometry args={[0.39, 0.05, 8, 24]} />
            </mesh>
            <mesh position={[0, 0, 0.45]} material={lens}>
              <circleGeometry args={[0.38, 24]} />
            </mesh>
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.39, Math.sin(a) * 0.39, 0.5]} material={rivet}>
                  <sphereGeometry args={[0.025, 6, 4]} />
                </mesh>
              );
            })}
            {/* elastic strap round the turret */}
            <mesh material={strap}>
              <torusGeometry args={[0.445, 0.05, 6, 24]} />
            </mesh>
          </group>
        );
      }
      case 'moustache': {
        const bristle = mat(PALETTE.woodDark, 0.95);
        return (
          <group position={[0, 0.58, 0.53]}>
            {[-1, 1].map((side) => (
              <group key={side} scale={[side, 1, 1]}>
                <mesh position={[0.17, 0, 0]} rotation={[0, 0, 1.75]} scale={[1, 1, 0.7]} material={bristle} castShadow>
                  <capsuleGeometry args={[0.08, 0.22, 4, 8]} />
                </mesh>
                <mesh position={[0.36, 0.06, 0]} rotation={[0, 0, -0.3]} material={bristle}>
                  <torusGeometry args={[0.07, 0.035, 6, 10, Math.PI * 1.2]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      }
      case 'beadnose':
        return (
          <group position={[0, 0.6, 0.56]}>
            <mesh material={mat(PALETTE.coral, 0.15, 0.1)} castShadow>
              <sphereGeometry args={[0.14, 16, 12]} />
            </mesh>
            <mesh position={[-0.045, 0.05, 0.11]} material={new THREE.MeshBasicMaterial({ color: '#FFFFFF' })}>
              <sphereGeometry args={[0.03, 6, 5]} />
            </mesh>
          </group>
        );
      default:
        return null;
    }
  }, [id]);
  return content;
}

/** Neck slot (torso space: the top of the body is at y ≈ 1.95, the chest plate faces +z at 0.55). */
export function NeckItem({ id }: { id: NeckId }) {
  const content = useMemo(() => {
    switch (id) {
      case 'scarf': {
        const wool = mat(PALETTE.honey, 0.95);
        const stripe = mat(PALETTE.coral, 0.95);
        return (
          <group>
            <mesh position={[0, 1.97, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.12, 0.88, 1]} material={wool} castShadow>
              <torusGeometry args={[0.6, 0.15, 8, 20]} />
            </mesh>
            <group position={[-0.32, 1.7, 0.6]} rotation={[0.12, 0, 0.18]}>
              <RoundedBox args={[0.28, 0.62, 0.09]} radius={0.04} smoothness={2} material={wool} castShadow />
              {[-0.12, 0.08].map((y) => (
                <mesh key={y} position={[0, y, 0.048]} material={stripe}>
                  <boxGeometry args={[0.29, 0.07, 0.01]} />
                </mesh>
              ))}
              {[-0.09, 0, 0.09].map((x) => (
                <mesh key={x} position={[x, -0.36, 0]} material={wool}>
                  <boxGeometry args={[0.04, 0.12, 0.04]} />
                </mesh>
              ))}
            </group>
          </group>
        );
      }
      case 'bowtie': {
        const ribbon = mat(PALETTE.toyBlue, 0.55);
        return (
          <group position={[0, 1.9, 0.6]}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.17, 0, 0]} rotation={[0, 0, side * (Math.PI / 2)]} scale={[1, 1, 0.45]} material={ribbon} castShadow>
                <coneGeometry args={[0.17, 0.32, 4]} />
              </mesh>
            ))}
            <mesh position={[0, 0, 0.02]} material={mat('#4E86A8', 0.55)}>
              <sphereGeometry args={[0.08, 10, 8]} />
            </mesh>
          </group>
        );
      }
      case 'bellcollar': {
        const band = mat(PALETTE.coral, 0.6);
        const brass = mat('#E2B24A', 0.22, 0.95);
        return (
          <group>
            <mesh position={[0, 1.96, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.12, 0.88, 1]} material={band} castShadow>
              <torusGeometry args={[0.64, 0.065, 6, 24]} />
            </mesh>
            <group position={[0, 1.78, 0.64]}>
              <mesh material={brass} castShadow>
                <sphereGeometry args={[0.15, 14, 10]} />
              </mesh>
              <mesh position={[0, -0.05, 0.13]} material={mat(PALETTE.ink, 0.8)}>
                <boxGeometry args={[0.2, 0.03, 0.04]} />
              </mesh>
              <mesh position={[0, 0.15, 0]} material={brass}>
                <torusGeometry args={[0.05, 0.018, 6, 10]} />
              </mesh>
            </group>
          </group>
        );
      }
      case 'medal': {
        const g = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 21);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const a = Math.atan2(pos.getZ(i), pos.getX(i));
          const k = 1 + 0.08 * Math.sign(Math.sin(a * 10.5));
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * k);
        }
        g.computeVertexNormals();
        return (
          <group position={[0.3, 0, 0]}>
            <mesh position={[-0.06, 1.8, 0.585]} rotation={[0, 0, -0.3]} material={mat(PALETTE.toyBlue, 0.6)}>
              <boxGeometry args={[0.1, 0.3, 0.02]} />
            </mesh>
            <mesh position={[0.06, 1.8, 0.59]} rotation={[0, 0, 0.3]} material={mat(PALETTE.coral, 0.6)}>
              <boxGeometry args={[0.1, 0.3, 0.02]} />
            </mesh>
            <group position={[0, 1.58, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh geometry={g} material={mat('#F2C14E', 0.2, 0.95, '#B98A1E')} castShadow />
              <mesh position={[0, -0.035, 0]} rotation={[0, Math.PI / 4, 0]} material={mat(PALETTE.coral, 0.3, 0.1)}>
                <octahedronGeometry args={[0.07]} />
              </mesh>
            </group>
          </group>
        );
      }
      default:
        return null;
    }
  }, [id]);
  return content;
}

export type { Accessories };
