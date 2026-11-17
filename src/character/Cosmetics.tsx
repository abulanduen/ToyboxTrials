/**
 * Hats and wind-up key bows for the contender — chunky, low-poly, household-object toys.
 * Hats mount on top of the eye turret; key bows mount on the key shaft (local XY plane, z = -0.34).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import type { HatId, KeySkinId } from '../game/cosmetics';

const mat = (color: string, rough = 0.45, metal = 0, emissive?: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.25 : 0 });

/** Hats that cover the antenna hide it. */
export const HAT_HIDES_ANTENNA: Record<HatId, boolean> = { none: false, thimble: true, bottlecap: false, paperboat: true, acorn: true };

export function Hat({ id }: { id: HatId }) {
  const parts = useMemo(() => {
    switch (id) {
      case 'thimble': {
        const steel = mat('#C9C7C2', 0.3, 0.85);
        return (
          <group position={[0, 0.52, 0]} rotation={[0, 0, -0.08]}>
            <mesh material={steel} castShadow>
              <cylinderGeometry args={[0.34, 0.42, 0.5, 18]} />
            </mesh>
            <mesh position={[0, 0.25, 0]} material={steel} castShadow>
              <sphereGeometry args={[0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position={[0, -0.23, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
              <torusGeometry args={[0.43, 0.05, 6, 20]} />
            </mesh>
            {/* dimples */}
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.37, 0.05 + (i % 2) * 0.12, Math.sin(a) * 0.37]} material={mat('#9A9893', 0.6, 0.6)}>
                  <sphereGeometry args={[0.035, 6, 4]} />
                </mesh>
              );
            })}
          </group>
        );
      }
      case 'bottlecap': {
        const g = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 21, 1, true);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const a = Math.atan2(pos.getZ(i), pos.getX(i));
          const k = 1 + 0.07 * Math.sign(Math.sin(a * 10.5));
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * k);
        }
        g.computeVertexNormals();
        const gold = mat(PALETTE.honey, 0.25, 0.85);
        return (
          <group position={[0, 0.5, 0]} rotation={[0.12, 0, 0.18]}>
            <mesh geometry={g} material={gold} castShadow />
            <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gold}>
              <circleGeometry args={[0.42, 21]} />
            </mesh>
            {/* crown points */}
            {Array.from({ length: 5 }, (_, i) => {
              const a = (i / 5) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.32, 0.22, Math.sin(a) * 0.32]} material={gold} castShadow>
                  <coneGeometry args={[0.08, 0.26, 6]} />
                </mesh>
              );
            })}
            <mesh position={[0, 0.16, 0.36]} material={mat(PALETTE.coral, 0.2, 0, PALETTE.coral)}>
              <octahedronGeometry args={[0.09]} />
            </mesh>
          </group>
        );
      }
      case 'paperboat': {
        // A folded paper boat silhouette, extruded thin, worn side-on.
        const s = new THREE.Shape();
        s.moveTo(-0.7, 0);
        s.lineTo(0.7, 0);
        s.lineTo(0.5, 0.18);
        s.lineTo(0.12, 0.18);
        s.lineTo(0, 0.62);
        s.lineTo(-0.12, 0.18);
        s.lineTo(-0.5, 0.18);
        s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
        g.translate(0, 0, -0.25);
        const paper = mat('#F6EEDC', 0.9);
        return (
          <group position={[0, 0.32, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh geometry={g} material={paper} castShadow />
            {/* faint printed receipt lines */}
            {[0.06, 0.11].map((y) => (
              <mesh key={y} position={[0, y, 0.27]} material={mat('#B9AE9A', 1)}>
                <boxGeometry args={[1.0, 0.012, 0.005]} />
              </mesh>
            ))}
          </group>
        );
      }
      case 'acorn': {
        const brown = mat('#8A5A34', 0.85);
        return (
          <group position={[0, 0.42, 0]}>
            <mesh material={brown} castShadow>
              <sphereGeometry args={[0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mat('#6E4425', 0.9)}>
              <torusGeometry args={[0.45, 0.06, 6, 22]} />
            </mesh>
            {/* scale texture bumps */}
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2;
              const r = i % 2 ? 0.3 : 0.38;
              return (
                <mesh key={i} position={[Math.cos(a) * r, 0.16 + (i % 2) * 0.12, Math.sin(a) * r]} material={mat('#6E4425', 0.9)}>
                  <sphereGeometry args={[0.06, 6, 4]} />
                </mesh>
              );
            })}
            <mesh position={[0.05, 0.55, 0]} rotation={[0, 0, -0.3]} material={brown} castShadow>
              <cylinderGeometry args={[0.04, 0.06, 0.26, 6]} />
            </mesh>
          </group>
        );
      }
      default:
        return null;
    }
  }, [id]);
  return parts;
}

function shapeGeometry(shape: THREE.Shape, depth = 0.12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** The decorative bow at the end of the wind-up key (the part you'd grip). */
export function KeyBow({ skin }: { skin: KeySkinId }) {
  const content = useMemo(() => {
    const brass = mat(PALETTE.brass, 0.32, 0.85);
    switch (skin) {
      case 'heart': {
        const s = new THREE.Shape();
        s.moveTo(0, -0.32);
        s.bezierCurveTo(0.12, -0.2, 0.42, -0.02, 0.4, 0.16);
        s.bezierCurveTo(0.38, 0.36, 0.1, 0.38, 0, 0.18);
        s.bezierCurveTo(-0.1, 0.38, -0.38, 0.36, -0.4, 0.16);
        s.bezierCurveTo(-0.42, -0.02, -0.12, -0.2, 0, -0.32);
        return (
          <mesh position={[0, 0.05, -0.36]} geometry={shapeGeometry(s)} material={mat(PALETTE.coral, 0.35, 0.3)} castShadow />
        );
      }
      case 'star': {
        const s = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          const r = i % 2 ? 0.2 : 0.46;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) s.moveTo(x, y);
          else s.lineTo(x, y);
        }
        s.closePath();
        return <mesh position={[0, 0, -0.36]} geometry={shapeGeometry(s)} material={mat(PALETTE.toyBlue, 0.3, 0.4)} castShadow />;
      }
      case 'golden':
      case 'classic':
      default: {
        const m = skin === 'golden' ? mat('#F2C14E', 0.18, 1, '#B98A1E') : brass;
        return (
          <group>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.27, 0, -0.34]} material={m} castShadow>
                <torusGeometry args={[0.22, 0.075, 8, 16]} />
              </mesh>
            ))}
            <mesh position={[0, 0, -0.34]} material={m}>
              <sphereGeometry args={[0.11, 10, 8]} />
            </mesh>
          </group>
        );
      }
    }
  }, [skin]);
  return content;
}
