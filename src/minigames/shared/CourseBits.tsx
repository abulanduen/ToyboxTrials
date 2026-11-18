/** Scenery shared by the racing minigames: the chequered finish line with its flag posts. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { paintMat } from '../../scene/props';

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? PALETTE.ink : PALETTE.white;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A chequered strip across the course at `z`, with a flag post on each side. */
export function FinishGate({ z, halfWidth }: { z: number; halfWidth: number }) {
  const checker = useMemo(() => new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }), []);
  useEffect(
    () => () => {
      checker.map?.dispose();
      checker.dispose();
    },
    [checker],
  );
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={checker}>
        <planeGeometry args={[halfWidth * 2, 2.4]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (halfWidth + 1.2), 5, 0]} castShadow material={paintMat(PALETTE.honey, 0.5)}>
            <cylinderGeometry args={[0.6, 0.7, 10, 10]} />
          </mesh>
          <mesh position={[side * (halfWidth - 0.6), 8.6, 0]} castShadow material={checker}>
            <boxGeometry args={[3.6, 2.4, 0.3]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
