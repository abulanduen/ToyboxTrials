/**
 * Hub navigation signage + atmosphere.
 * - Wooden signposts (by spawn and at both ends of the bridge) whose arrow boards point the way.
 * - Dust motes drifting in the desk-lamp light (skipped on the Low tier).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { useGame } from '../game/store';
import { woodMat } from './props';
import { camBlock } from '../game/player';
import { POST_BOARD, buildSignFaces, signpostTop, signposts } from './signposts';
import { Kit } from './kit';
import { SignAtlas, signAtlasTexture } from './signAtlas';
import { LAMP_AIM, LAMP_HEAD } from './Room';

/** Arrow-shaped board outline (points along +x), centred on its own origin. */
function useArrowBoardGeometry(len: number, h: number) {
  return useMemo(() => {
    const s = new THREE.Shape();
    const tip = h * 0.55;
    s.moveTo(-len / 2, -h / 2);
    s.lineTo(len / 2 - tip, -h / 2);
    s.lineTo(len / 2, 0);
    s.lineTo(len / 2 - tip, h / 2);
    s.lineTo(-len / 2, h / 2);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
    g.translate(0, 0, -0.15);
    return g;
  }, [len, h]);
}

/** The signposts' painted board faces: one merged mesh on the shared sign atlas (built once). */
let faces: { geo: THREE.BufferGeometry | undefined; atlas: THREE.Texture } | null = null;
function SignFaces() {
  if (!faces) {
    const k = new Kit();
    const atlas = new SignAtlas();
    buildSignFaces(k, atlas);
    faces = { geo: k.build().decal, atlas: signAtlasTexture(atlas) };
  }
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, map: faces!.atlas, roughness: 0.85 }), []);
  return faces.geo ? <mesh geometry={faces.geo} material={mat} castShadow receiveShadow /> : null;
}

/**
 * The signposts (one by spawn, one at each end of the domino bridge): an arrow board per
 * destination, the lowest in view at toy height. All boards of all posts are one instanced mesh;
 * their painted faces are one merged layer (SignFaces) drawn from the shared sign atlas.
 */
export function Fingerpost() {
  const boardGeo = useArrowBoardGeometry(POST_BOARD.len, POST_BOARD.h);
  const posts = useMemo(() => signposts(), []);
  const plain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C8925A', roughness: 0.8 }), []);
  const mesh = useMemo(() => {
    const n = posts.reduce((k, p) => k + p.boards.length, 0);
    const m = new THREE.InstancedMesh(boardGeo, plain, n);
    const o = new THREE.Object3D();
    let i = 0;
    for (const post of posts) {
      for (const b of post.boards) {
        o.position.set(post.x + Math.cos(b.rotY) * (POST_BOARD.len / 2 + 0.2), b.y, post.z - Math.sin(b.rotY) * (POST_BOARD.len / 2 + 0.2));
        o.rotation.set(0, b.rotY, 0);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    }
    m.castShadow = true;
    m.computeBoundingSphere();
    return m;
  }, [boardGeo, plain, posts]);
  return (
    <group>
      <SignFaces />
      {/* Posts and boards stop the camera: without that, turning beside a signpost (the bridge ends)
          swung the camera inside the post, filling the view with dark wood. */}
      <primitive object={mesh} ref={camBlock} />
      {posts.map((post) => {
        const top = signpostTop(post.boards.length);
        return (
          <group key={post.id} position={[post.x, 0, post.z]}>
            <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
              <cylinderGeometry args={[1.0, 1.15, 0.6, 12]} />
            </mesh>
            <mesh position={[0, top / 2, 0]} castShadow material={woodMat(PALETTE.woodDark)} ref={camBlock}>
              <cylinderGeometry args={[0.32, 0.36, top, 8]} />
            </mesh>
            <mesh position={[0, top + 0.1, 0]} castShadow material={woodMat(PALETTE.coral)} ref={camBlock}>
              <sphereGeometry args={[0.55, 12, 10]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Dust motes floating through the lamp's light cone. One draw call; off on Low. */
export function DustMotes() {
  const quality = useGame((s) => s.quality);
  const N = 260;
  const pts = useRef<THREE.Points>(null!);
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N * 4);
    const a = LAMP_HEAD;
    const b = LAMP_AIM;
    for (let i = 0; i < N; i++) {
      const t = Math.random();
      const spread = 2 + t * 14; // the cone widens toward the table
      seeds[i * 4] = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * spread;
      seeds[i * 4 + 1] = a.y + (b.y - a.y) * t + 1 + (Math.random() - 0.5) * 4;
      seeds[i * 4 + 2] = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * spread;
      seeds[i * 4 + 3] = Math.random() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, seeds };
  }, []);
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,240,205,1)');
    grd.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.PointsMaterial({ map: tex, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#FFE3B0' });
  }, []);
  useFrame((s) => {
    if (!pts.current) return;
    const t = s.clock.elapsedTime;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const ph = seeds[i * 4 + 3];
      arr[i * 3] = seeds[i * 4] + Math.sin(t * 0.13 + ph) * 1.6;
      arr[i * 3 + 1] = Math.max(0.5, seeds[i * 4 + 1] + Math.sin(t * 0.09 + ph * 1.7) * 2.2);
      arr[i * 3 + 2] = seeds[i * 4 + 2] + Math.cos(t * 0.11 + ph) * 1.6;
    }
    geo.attributes.position.needsUpdate = true;
  });
  if (quality === 'low') return null;
  return <points ref={pts} geometry={geo} material={mat} />;
}
