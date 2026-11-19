/**
 * Hats and wind-up key bows for the contender — chunky, low-poly, household-object toys, all
 * built in code. Hats mount on top of the eye turret; key bows mount on the key shaft (local XY
 * plane, z = -0.34). Accessories (back, face, neck) are in Accessories.tsx.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import type { HatId, KeySkinId } from '../game/cosmetics';

const mat = (color: string, rough = 0.45, metal = 0, emissive?: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.25 : 0 });

/** Hats that cover the antenna hide it. */
export const HAT_HIDES_ANTENNA: Record<HatId, boolean> = {
  none: false,
  thimble: true,
  bottlecap: false,
  paperboat: true,
  acorn: true,
  reeltop: true,
  partycone: true,
  propeller: true,
  laurel: false,
};

/** Spins its children about Y (propeller blades). */
function Spinner({ rate, children }: { rate: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    ref.current.rotation.y += Math.min(dt, 1 / 20) * rate;
  });
  return <group ref={ref}>{children}</group>;
}

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
      case 'partycone': {
        const card = mat(PALETTE.coral, 0.7);
        const stripe = mat(PALETTE.cream, 0.7);
        return (
          <group position={[0, 0.34, 0]} rotation={[0, 0, 0.16]}>
            <mesh position={[0, 0.42, 0]} material={card} castShadow>
              <coneGeometry args={[0.34, 0.86, 16]} />
            </mesh>
            {[0.18, 0.44].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={stripe}>
                <torusGeometry args={[0.34 * (1 - y / 0.86) + 0.012, 0.035, 6, 18]} />
              </mesh>
            ))}
            <mesh position={[0, 0.9, 0]} material={mat(PALETTE.honey, 0.95)} castShadow>
              <icosahedronGeometry args={[0.12, 1]} />
            </mesh>
          </group>
        );
      }
      case 'reeltop': {
        const wood = mat(PALETTE.woodLight, 0.6);
        const thread = mat(PALETTE.toyBlue, 0.85);
        const groove = mat('#5A8EAE', 0.9);
        return (
          <group position={[0, 0.38, 0]} rotation={[0.06, 0, -0.06]}>
            <mesh position={[0, 0.03, 0]} material={wood} castShadow>
              <cylinderGeometry args={[0.46, 0.46, 0.07, 20]} />
            </mesh>
            <mesh position={[0, 0.3, 0]} material={thread} castShadow>
              <cylinderGeometry args={[0.31, 0.31, 0.48, 18]} />
            </mesh>
            {[0.14, 0.24, 0.34, 0.44].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={groove}>
                <torusGeometry args={[0.312, 0.012, 4, 18]} />
              </mesh>
            ))}
            <mesh position={[0, 0.57, 0]} material={wood} castShadow>
              <cylinderGeometry args={[0.42, 0.42, 0.07, 20]} />
            </mesh>
            <mesh position={[0, 0.611, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat(PALETTE.woodDark, 0.7)}>
              <circleGeometry args={[0.09, 12]} />
            </mesh>
          </group>
        );
      }
      case 'propeller': {
        const blue = mat(PALETTE.toyBlue, 0.5);
        const honey = mat(PALETTE.honey, 0.5);
        return (
          <group position={[0, 0.3, 0]}>
            <mesh material={blue} castShadow>
              <sphereGeometry args={[0.44, 18, 8, 0, Math.PI, 0, Math.PI / 2]} />
            </mesh>
            <mesh rotation={[0, Math.PI, 0]} material={honey} castShadow>
              <sphereGeometry args={[0.44, 18, 8, 0, Math.PI, 0, Math.PI / 2]} />
            </mesh>
            {/* peak */}
            <mesh position={[0, 0.03, 0.36]} rotation={[0.2, 0, 0]} scale={[1, 1, 0.9]} material={blue} castShadow>
              <cylinderGeometry args={[0.3, 0.3, 0.05, 16, 1, false, -Math.PI / 2, Math.PI]} />
            </mesh>
            <mesh position={[0, 0.5, 0]} material={mat(PALETTE.ink, 0.6)}>
              <cylinderGeometry args={[0.035, 0.035, 0.18, 6]} />
            </mesh>
            <group position={[0, 0.6, 0]}>
              <Spinner rate={9}>
                {[0, Math.PI].map((a) => (
                  <mesh key={a} position={[Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3]} rotation={[0.35, -a, 0]} material={mat(PALETTE.coral, 0.45)} castShadow>
                    <boxGeometry args={[0.52, 0.03, 0.14]} />
                  </mesh>
                ))}
                <mesh material={honey}>
                  <sphereGeometry args={[0.07, 10, 8]} />
                </mesh>
              </Spinner>
            </group>
          </group>
        );
      }
      case 'laurel': {
        const leaf = mat(PALETTE.sage, 0.7);
        const dark = mat(PALETTE.feltDark, 0.75);
        const n = 16;
        return (
          <group position={[0, 0.32, 0]} rotation={[-0.08, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mat(PALETTE.brass, 0.35, 0.8)}>
              <torusGeometry args={[0.43, 0.03, 6, 24]} />
            </mesh>
            {Array.from({ length: n }, (_, i) => {
              if (i === 12) return null; // the gap at the back
              const a = (i / n) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.45, 0.06 + (i % 2) * 0.05, Math.sin(a) * 0.45]} rotation={[0, -a, i % 2 ? 0.6 : -0.6]} scale={[1, 0.5, 0.35]} material={i % 2 ? leaf : dark} castShadow>
                  <sphereGeometry args={[0.13, 8, 6]} />
                </mesh>
              );
            })}
            <mesh position={[0, 0.06, 0.47]} material={mat('#F2C14E', 0.25, 0.9, '#B98A1E')}>
              <sphereGeometry args={[0.06, 8, 6]} />
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
      case 'clover': {
        const green = mat(PALETTE.sage, 0.4, 0.25);
        return (
          <group position={[0, 0.02, -0.36]}>
            {[0, 1, 2, 3].map((i) => {
              const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0]} rotation={[Math.PI / 2, 0, 0]} material={green} castShadow>
                  <cylinderGeometry args={[0.17, 0.17, 0.11, 14]} />
                </mesh>
              );
            })}
            <mesh material={mat(PALETTE.feltDark, 0.5)}>
              <sphereGeometry args={[0.09, 10, 8]} />
            </mesh>
          </group>
        );
      }
      case 'moon': {
        // Crescent: the left part of a circle, cut by a second, offset circle.
        const s = new THREE.Shape();
        s.absarc(0, 0, 0.42, 1.028, Math.PI * 2 - 1.028, false);
        s.absarc(0.2, 0, 0.36, Math.PI * 2 - 1.523, 1.523, true);
        return (
          <group position={[0.05, 0, -0.36]}>
            <mesh geometry={shapeGeometry(s)} material={mat(PALETTE.cream, 0.3, 0.2, '#E8D9A8')} castShadow />
            <mesh position={[0.2, 0.18, 0]} material={mat(PALETTE.honey, 0.3, 0.6, PALETTE.honey)}>
              <octahedronGeometry args={[0.07]} />
            </mesh>
          </group>
        );
      }
      case 'gear': {
        const s = new THREE.Shape();
        const steps = 32; // 8 teeth, 4 points each
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const r = i % 4 < 2 ? 0.44 : 0.33;
          if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        s.closePath();
        const hole = new THREE.Path();
        hole.absarc(0, 0, 0.13, 0, Math.PI * 2, true);
        s.holes.push(hole);
        return <mesh position={[0, 0, -0.36]} geometry={shapeGeometry(s, 0.1)} material={mat('#9AA3A8', 0.3, 0.9)} castShadow />;
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
