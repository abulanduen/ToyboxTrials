/**
 * Drop-in replacement for drei's <RoundedBox> (same props and geometry) that repairs the few
 * zero-length normals drei's creased-normal pass leaves on some sizes. Those made the tabletop and
 * the Workshop flash now and then in the hub (see ./normals.ts). Always import RoundedBox from here.
 */
import { forwardRef, useLayoutEffect, useMemo, useRef, type ComponentProps, type ReactNode } from 'react';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { repairNormals } from './normals';

const EPS = 0.00001;

function roundedShape(width: number, height: number, radius0: number) {
  const shape = new THREE.Shape();
  const radius = radius0 - EPS;
  shape.absarc(EPS, EPS, EPS, -Math.PI / 2, -Math.PI, true);
  shape.absarc(EPS, height - radius * 2, EPS, Math.PI, Math.PI / 2, true);
  shape.absarc(width - radius * 2, height - radius * 2, EPS, Math.PI / 2, 0, true);
  shape.absarc(width - radius * 2, EPS, EPS, 0, -Math.PI / 2, true);
  return shape;
}

/** drei-compatible rounded box geometry, built once per size, with safe normals. */
export function roundedBoxGeometry(width = 1, height = 1, depth = 1, radius = 0.05, smoothness = 4, bevelSegments = 4, steps = 1, creaseAngle = 0.4) {
  const g = new THREE.ExtrudeGeometry(roundedShape(width, height, radius), {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: bevelSegments * 2,
    steps,
    bevelSize: radius - EPS,
    bevelThickness: radius,
    curveSegments: smoothness,
  });
  g.center();
  const out = toCreasedNormals(g, creaseAngle) as THREE.BufferGeometry;
  if (out !== g) g.dispose();
  repairNormals(out);
  return out;
}

type MeshProps = Omit<ComponentProps<'mesh'>, 'args'>;
export interface RoundedBoxProps extends MeshProps {
  args?: [number?, number?, number?];
  radius?: number;
  smoothness?: number;
  bevelSegments?: number;
  steps?: number;
  creaseAngle?: number;
  children?: ReactNode;
}

export const RoundedBox = forwardRef<THREE.Mesh, RoundedBoxProps>(function RoundedBox(
  { args: [width = 1, height = 1, depth = 1] = [], radius = 0.05, smoothness = 4, bevelSegments = 4, steps = 1, creaseAngle = 0.4, children, ...rest },
  ref,
) {
  const geometry = useMemo(
    () => roundedBoxGeometry(width, height, depth, radius, smoothness, bevelSegments, steps, creaseAngle),
    [width, height, depth, radius, smoothness, bevelSegments, steps, creaseAngle],
  );
  const prev = useRef<THREE.BufferGeometry | null>(null);
  useLayoutEffect(() => {
    const old = prev.current;
    prev.current = geometry;
    if (old && old !== geometry) old.dispose();
  }, [geometry]);
  useLayoutEffect(() => () => prev.current?.dispose(), []);
  return (
    <mesh ref={ref} geometry={geometry} {...rest}>
      {children}
    </mesh>
  );
});
